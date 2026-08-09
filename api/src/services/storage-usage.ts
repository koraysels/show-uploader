import fs from 'fs';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3 } from './s3';
import { env } from '../env';

export type DiskUsage = { path: string; totalBytes: number; freeBytes: number; usedBytes: number } | null;
export type PrefixUsage = { prefix: string; bytes: number; objects: number };
export type TempUsage = { path: string; bytes: number; jobs: number; oldestAgeMs: number | null };

/**
 * Free space on a mounted filesystem, or null when the path isn't mounted.
 *
 * Null is a real answer, not an error: the storage disk is bind-mounted into the
 * api purely for this readout, so a deployment without that mount should show
 * "unavailable" rather than fail the page.
 */
export function diskUsage(path: string): DiskUsage {
  try {
    const s = fs.statfsSync(path);
    const totalBytes = s.blocks * s.bsize;
    // bavail, not bfree: bfree counts blocks reserved for root, which this
    // process can never actually use.
    const freeBytes = s.bavail * s.bsize;
    return { path, totalBytes, freeBytes, usedBytes: totalBytes - freeBytes };
  } catch {
    return null;
  }
}

/** Group an object key into a top-level bucket prefix for reporting. */
export function prefixOf(key: string): string {
  const slash = key.indexOf('/');
  return slash === -1 ? '(root)' : key.slice(0, slash);
}

/**
 * Bytes and object counts per top-level prefix.
 *
 * Listing is metadata-only, so this is cheap relative to the data it describes,
 * but it is O(objects) and paginates 1000 at a time — hence the cap, which stops
 * a runaway bucket turning a page load into a minutes-long scan.
 */
export async function bucketUsage(maxObjects = 50_000): Promise<{ prefixes: PrefixUsage[]; truncated: boolean }> {
  const totals = new Map<string, PrefixUsage>();
  let token: string | undefined;
  let seen = 0;
  let truncated = false;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: env.S3_BUCKET, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const prefix = prefixOf(obj.Key);
      const entry = totals.get(prefix) ?? { prefix, bytes: 0, objects: 0 };
      entry.bytes += obj.Size ?? 0;
      entry.objects += 1;
      totals.set(prefix, entry);
      seen++;
    }
    token = res.NextContinuationToken;
    if (seen >= maxObjects && token) {
      truncated = true;
      break;
    }
  } while (token);

  return {
    prefixes: [...totals.values()].sort((a, b) => b.bytes - a.bytes),
    truncated,
  };
}

/**
 * What the worker's scratch space is holding.
 *
 * Each entry is one job's directory. A large `oldestAgeMs` means the startup
 * sweeper has not run since something was orphaned — which is the signal worth
 * surfacing, since that is exactly how the disk used to fill silently.
 */
export function tempUsage(root: string, now = Date.now()): TempUsage {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { path: root, bytes: 0, jobs: 0, oldestAgeMs: null };
  }

  let bytes = 0;
  let jobs = 0;
  let oldest: number | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = `${root}/${entry.name}`;
    jobs++;
    bytes += dirSize(full);
    try {
      const age = now - fs.statSync(full).mtimeMs;
      if (oldest === null || age > oldest) oldest = age;
    } catch {
      /* removed while walking */
    }
  }
  return { path: root, bytes, jobs, oldestAgeMs: oldest };
}

function dirSize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    try {
      total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    } catch {
      /* removed while walking */
    }
  }
  return total;
}

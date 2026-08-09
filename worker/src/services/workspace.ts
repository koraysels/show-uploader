import fs from 'fs';
import path from 'path';

export const TEMP_ROOT = process.env.WORKER_TEMP_ROOT ?? '/tmp/show-uploader';

/**
 * A per-job scratch directory.
 *
 * Every job downloads a recording and writes derivatives beside it, all of them
 * multi-GB. Previously each file was named individually and removed by listing
 * those same names in a `finally` — which silently failed the moment the process
 * did not reach it. A worker killed mid-job (OOM, container restart, deploy)
 * orphaned everything it had written, with nothing in the system to ever remove
 * it, so the disk filled quietly until the box broke.
 *
 * One directory per job fixes both halves: cleanup is a single recursive remove
 * that cannot drift out of sync with the file list, and anything left behind is
 * attributable and sweepable (see sweepWorkspaces).
 */
export type Workspace = {
  /** Absolute path for a file inside this job's directory. */
  path: (name: string) => string;
  /** Remove the whole directory. Safe to call twice. */
  cleanup: () => void;
};

/** Keep ids to something that is unambiguously one path segment. */
function safeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return cleaned.length ? cleaned : 'job';
}

export function createWorkspace(id: string): Workspace {
  const dir = path.join(TEMP_ROOT, safeId(id));
  fs.mkdirSync(dir, { recursive: true });
  return {
    path: (name: string) => path.join(dir, name),
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        // Never let a cleanup failure mask the job's own outcome.
        console.warn(`Could not remove workspace ${dir}:`, err instanceof Error ? err.message : err);
      }
    },
  };
}

export type SweepResult = { removed: number; bytes: number };

/** Recursive size of a directory, ignoring anything that vanishes mid-walk. */
export function directorySize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += directorySize(full);
      else total += fs.statSync(full).size;
    } catch {
      /* removed while we walked */
    }
  }
  return total;
}

/**
 * Delete job directories older than maxAgeMs.
 *
 * This is the half that recovers disk a crash already lost. Runs at worker
 * startup, where the age cutoff matters: a concurrent job's directory is young,
 * so a restart never deletes work that is still in progress.
 */
export function sweepWorkspaces(maxAgeMs: number, now = Date.now()): SweepResult {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(TEMP_ROOT, { withFileTypes: true });
  } catch {
    return { removed: 0, bytes: 0 };
  }

  const result: SweepResult = { removed: 0, bytes: 0 };
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(TEMP_ROOT, entry.name);
    try {
      const age = now - fs.statSync(full).mtimeMs;
      if (age < maxAgeMs) continue;
      result.bytes += directorySize(full);
      fs.rmSync(full, { recursive: true, force: true });
      result.removed++;
    } catch (err) {
      console.warn(`Could not sweep ${full}:`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

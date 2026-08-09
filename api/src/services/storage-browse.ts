import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3 } from './s3';
import { env } from '../env';

export type BrowseEntry = {
  /** Full object key, or the folder prefix including its trailing slash. */
  key: string;
  /** Just the segment shown in the listing. */
  name: string;
  bytes: number | null;
  modified: string | null;
};

export type BrowseResult = {
  prefix: string;
  folders: BrowseEntry[];
  files: BrowseEntry[];
  truncated: boolean;
};

/**
 * Normalise a browse prefix.
 *
 * S3 has no directories — "folders" are an illusion produced by listing with a
 * delimiter — so the prefix is just a string. Leading slashes and `..` segments
 * are meaningless rather than dangerous here, but they still produce confusing
 * empty listings, so they are stripped.
 */
export function normalizePrefix(raw: string): string {
  const cleaned = raw
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
  return cleaned ? `${cleaned}/` : '';
}

/** Last path segment of a key or folder prefix. */
export function displayName(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/**
 * One level of the bucket.
 *
 * `Delimiter: '/'` is what makes S3 report sibling folders (CommonPrefixes)
 * rather than every key beneath them — without it, opening `shows/` would return
 * every object in the bucket.
 */
export async function browse(rawPrefix: string, limit = 500): Promise<BrowseResult> {
  const prefix = normalizePrefix(rawPrefix);

  const res = await s3.send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET,
      Prefix: prefix,
      Delimiter: '/',
      MaxKeys: limit,
    })
  );

  const folders: BrowseEntry[] = (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix)
    .filter((p): p is string => !!p)
    .map((p) => ({ key: p, name: displayName(p), bytes: null, modified: null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const files: BrowseEntry[] = (res.Contents ?? [])
    // A "folder" created explicitly shows up as a zero-byte object at the prefix
    // itself; listing it as a file would be noise.
    .filter((o) => o.Key && o.Key !== prefix)
    .map((o) => ({
      key: o.Key!,
      name: displayName(o.Key!),
      bytes: o.Size ?? 0,
      modified: o.LastModified ? o.LastModified.toISOString() : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { prefix, folders, files, truncated: !!res.IsTruncated };
}

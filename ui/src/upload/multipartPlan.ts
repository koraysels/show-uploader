// Pure, side-effect-free planning for resumable multipart uploads.
// Kept separate from the network engine so the critical maths is unit-testable.

export type PartPlan = {
  partNumber: number; // 1-indexed, as S3 requires
  start: number; // byte offset (inclusive)
  end: number; // byte offset (exclusive)
  size: number;
};

/** Split a file of `size` bytes into `partSize` chunks (last part is the remainder). */
export function planParts(size: number, partSize: number): PartPlan[] {
  if (size <= 0) throw new Error('size must be > 0');
  if (partSize <= 0) throw new Error('partSize must be > 0');
  const parts: PartPlan[] = [];
  let offset = 0;
  let n = 1;
  while (offset < size) {
    const end = Math.min(offset + partSize, size);
    parts.push({ partNumber: n, start: offset, end, size: end - offset });
    offset = end;
    n += 1;
  }
  return parts;
}

/**
 * Which parts still need uploading. A part counts as done only if the server
 * reports it AND its byte size matches the plan — a truncated/partial part is
 * re-uploaded rather than trusted.
 */
export function partsToUpload(
  plan: PartPlan[],
  uploaded: { partNumber: number; size: number }[]
): PartPlan[] {
  const doneSizes = new Map(uploaded.map((p) => [p.partNumber, p.size]));
  return plan.filter((p) => doneSizes.get(p.partNumber) !== p.size);
}

/** Fraction [0,1] complete given the done parts. */
export function progressFraction(
  totalSize: number,
  uploaded: { size: number }[]
): number {
  if (totalSize <= 0) return 0;
  const done = uploaded.reduce((s, p) => s + p.size, 0);
  return Math.min(1, done / totalSize);
}

/**
 * Exponential backoff with full jitter, capped. `rand` is injectable so the
 * bounds are testable; defaults to Math.random.
 */
export function backoffDelay(
  attempt: number,
  opts: { baseMs?: number; capMs?: number; rand?: () => number } = {}
): number {
  const base = opts.baseMs ?? 500;
  const cap = opts.capMs ?? 15_000;
  const rand = opts.rand ?? Math.random;
  const exp = Math.min(cap, base * 2 ** attempt);
  return Math.round(rand() * exp);
}

/** Stable fingerprint to match a re-selected file to a saved session after reload. */
export function fileFingerprint(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

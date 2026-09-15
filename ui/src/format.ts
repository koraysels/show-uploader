/** Byte counts at a glance. Binary units, since that is what disks report. */
export function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** A show's runtime, e.g. "1h 23m" or "47m". */
export function humanDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Coarse age for "how long has this been sitting there". */
export function humanAge(ms: number): string {
  const h = ms / 3_600_000;
  if (h >= 48) return `${Math.round(h / 24)} days`;
  if (h >= 1) return `${Math.round(h)}h`;
  return `${Math.max(1, Math.round(ms / 60_000))}m`;
}

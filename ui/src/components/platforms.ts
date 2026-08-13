export const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

export type PlatformLink = { label: string; url: string };

// How many of the two platforms have no existing link yet. Shared with
// NewUpload's submit gate: submitting with zero platforms selected is only a
// valid archive-only action when nothing is actually left to pick.
export function selectablePlatformCount(existingLinks: PlatformLink[]): number {
  const labels = new Set(existingLinks.map((l) => l.label));
  return PLATFORMS.filter((p) => !labels.has(p.label)).length;
}

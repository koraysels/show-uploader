export const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

export type PlatformLink = { label: string; url: string };

/**
 * Which platform a media link's label refers to, or null for anything else.
 *
 * Case-insensitive on purpose: these labels are typed by hand in the agenda
 * admin and the casing genuinely varies — production carries "Youtube" and
 * "Mixcloud" alongside "YouTube" and "MixCloud", 48 records' worth. An exact
 * match treated those as "not published yet", so the upload form pre-selected
 * a platform the show was already on and would have published a duplicate.
 */
export function platformOfLabel(label: string): string | null {
  const normalised = label.trim().toLowerCase();
  return PLATFORMS.find((p) => p.label.toLowerCase() === normalised)?.id ?? null;
}

/** Every platform this record already has a link for. */
export function publishedPlatforms(existingLinks: PlatformLink[]): Set<string> {
  return new Set(existingLinks.map((l) => platformOfLabel(l.label)).filter((p): p is string => !!p));
}

// How many of the two platforms have no existing link yet. Shared with
// NewUpload's submit gate: submitting with zero platforms selected is only a
// valid archive-only action when nothing is actually left to pick.
export function selectablePlatformCount(existingLinks: PlatformLink[]): number {
  const published = publishedPlatforms(existingLinks);
  return PLATFORMS.filter((p) => !published.has(p.id)).length;
}

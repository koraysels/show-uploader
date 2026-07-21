// Render tags as hashtags and append them to a description, so they're visible
// (YouTube shows the first 3 above the title). Spaces/punctuation are stripped
// since hashtags can't contain them. Kept in sync with worker/src/services/format.ts.
export function tagsToHashtags(tags: string[]): string {
  return tags
    .map((t) => '#' + t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((h) => h.length > 1)
    .slice(0, 10)
    .join(' ');
}

export function appendHashtags(description: string, tags: string[]): string {
  const tail = tagsToHashtags(tags);
  if (!tail) return description;
  return description ? `${description}\n\n${tail}` : tail;
}

// Strip the "<DD.MM.YYYY> @ coming soon" convention suffix so PocketBase keeps
// the plain show title — that suffix belongs only on the platform (YT/MixCloud)
// titles, not on the archive record.
export function baseTitle(title: string): string {
  // Strip the convention suffix as ONE unit: an optional "<date>" immediately
  // before "@ coming soon". Never strips a bare trailing date (a show literally
  // named "... 31.12.2025" keeps its name).
  return (title ?? '')
    .replace(/\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s*)?@\s*coming soon\s*$/i, '')
    .trim();
}

// The inverse: the platform title convention "<name> <DD.MM.YYYY> @ coming soon"
// built from a plain PocketBase title + the show date (YYYY-MM-DD). Strips any
// existing suffix first so re-syncing never doubles it.
export function platformTitle(name: string, date: string): string {
  const [y, m, d] = (date ?? '').split('-');
  const dmy = d && m && y ? `${d}.${m}.${y}` : date;
  return `${baseTitle(name)} ${dmy} @ coming soon`.trim();
}

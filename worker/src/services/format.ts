// Render tags as hashtags and append them to a description, so they're visible
// (YouTube shows the first 3 above the title; PocketBase notes render them as
// text). Spaces/punctuation are stripped since hashtags can't contain them.
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
  return (title ?? '')
    .replace(/\s*@\s*coming soon\s*$/i, '')
    .replace(/\s*\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s*$/, '')
    .trim();
}

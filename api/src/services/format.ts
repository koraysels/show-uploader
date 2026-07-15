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

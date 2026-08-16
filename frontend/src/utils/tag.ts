/**
 * Parses raw text containing tags separated by commas or newlines.
 */
export function parseTags(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[\r\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Normalizes a tag string by trimming leading/trailing whitespace.
 */
export function normalizeTag(tag: string): string {
  return tag.trim();
}

/**
 * Adds a tag to the list if not already present (case-insensitive check).
 */
export function addTagIfUnique(tags: string[], newTag: string): string[] {
  const normalized = normalizeTag(newTag);
  if (!normalized) return tags;
  const lower = normalized.toLowerCase();
  if (tags.some((t) => t.toLowerCase() === lower)) {
    return tags;
  }
  return [...tags, normalized];
}

/**
 * Adds multiple tags to the list, skipping duplicates.
 */
export function addMultipleTags(tags: string[], newTags: string[]): string[] {
  let result = [...tags];
  for (const t of newTags) {
    result = addTagIfUnique(result, t);
  }
  return result;
}

/**
 * Removes a tag at the given index.
 */
export function removeTagAtIndex(tags: string[], index: number): string[] {
  if (index < 0 || index >= tags.length) return tags;
  return tags.filter((_, i) => i !== index);
}

/**
 * Returns tag suggestions filtered by query and excluding existing tags.
 * Preserves MRU order while prioritizing prefix matches.
 */
export function getTagSuggestions(
  availableTags: string[],
  query: string,
  existingTags: string[] = []
): string[] {
  if (!availableTags || availableTags.length === 0) return [];

  const existingTagsLowerSet = new Set(existingTags.map((t) => t.toLowerCase()));
  const tokenQuery = (query || '').trim().toLowerCase();

  const candidates = availableTags.filter((tag) => {
    const tagLower = tag.toLowerCase();
    // Do not suggest any tag that is already specified in the card
    if (existingTagsLowerSet.has(tagLower)) {
      return false;
    }
    if (!tokenQuery) return true;
    return tagLower.includes(tokenQuery);
  });

  candidates.sort((a, b) => {
    if (!tokenQuery) return 0;

    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aStarts = aLower.startsWith(tokenQuery);
    const bStarts = bLower.startsWith(tokenQuery);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return 0;
  });

  return candidates;
}

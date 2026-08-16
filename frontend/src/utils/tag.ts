export interface TokenInfo {
  token: string;
  start: number;
  end: number;
}

export interface ComputeNextTagResult {
  nextValue: string;
  nextCursorPos: number;
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function getActiveTokenInfo(text: string, pos: number): TokenInfo {
  const safePos = Math.max(0, Math.min(pos, text.length));
  const lastComma = text.lastIndexOf(',', safePos - 1);
  const start = lastComma === -1 ? 0 : lastComma + 1;

  const nextComma = text.indexOf(',', safePos);
  const end = nextComma === -1 ? text.length : nextComma;

  const rawToken = text.substring(start, end);
  return {
    token: rawToken.trim(),
    start,
    end,
  };
}

export function getExistingTags(text: string, tokenInfo: TokenInfo): string[] {
  const before = text.substring(0, tokenInfo.start);
  const after = text.substring(tokenInfo.end);
  return parseTags(`${before},${after}`);
}

export function getTagSuggestions(
  availableTags: string[],
  activeToken: string,
  existingTags: string[]
): string[] {
  if (!availableTags || availableTags.length === 0) return [];

  const existingTagsLowerSet = new Set(existingTags.map((t) => t.toLowerCase()));
  const tokenQuery = activeToken.toLowerCase();

  const candidates = availableTags.filter((tag) => {
    const tagLower = tag.toLowerCase();
    // Do not suggest any tag that is already specified in the input
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

export function computeNextTagValue(
  currentValue: string,
  tokenInfo: { start: number; end: number },
  tagToInsert: string
): string {
  return computeNextTagValueWithCursor(currentValue, tokenInfo, tagToInsert).nextValue;
}

export function computeNextTagValueWithCursor(
  currentValue: string,
  tokenInfo: { start: number; end: number },
  tagToInsert: string
): ComputeNextTagResult {
  let before = currentValue.substring(0, tokenInfo.start).replace(/\s*$/, '');
  if (before && !before.endsWith(',')) {
    before += ',';
  }
  const prefix = before ? `${before} ` : '';

  const after = currentValue.substring(tokenInfo.end);
  const cleanAfter = after.replace(/^[,\s]+/, '');
  const suffix = cleanAfter ? `, ${cleanAfter}` : ', ';

  const nextValue = `${prefix}${tagToInsert}${suffix}`;
  const nextCursorPos = (prefix + tagToInsert + ', ').length;

  return {
    nextValue,
    nextCursorPos,
  };
}

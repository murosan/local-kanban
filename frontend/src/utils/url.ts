/**
 * Validates and normalizes a URL string.
 *
 * Rules:
 * 1. Blocks dangerous schemes (javascript:, data:, vbscript:).
 * 2. Accepts valid custom URI schemes (e.g., vscode://, slack://, http://, https://, mailto:).
 * 3. Prepends 'https://' to plain hostnames/paths that lack a scheme (e.g., example.com -> https://example.com).
 */
export const getSafeUrl = (url: unknown): string | null => {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Block dangerous schemes
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null;
  }

  // Check if it already has a scheme (e.g., http://, https://, vscode://, mailto:, etc.)
  // Valid scheme per RFC 3986: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) followed by ":"
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }

  // If no scheme, default to https://
  return `https://${trimmed}`;
};

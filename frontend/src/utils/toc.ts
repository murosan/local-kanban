export interface TocItem {
  id: string;
  text: string;
  level: number;
  lineNumber: number; // 1-based line number in markdown content
  rawText: string;
}

/**
 * Strips markdown inline syntax (bold, italic, links, code, strikethrough, images) from a string
 */
export const stripMarkdown = (text: string): string => {
  return text
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1') // Images: ![alt](url) -> alt
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links: [text](url) -> text
    .replace(/(`{1,3})(.*?)\1/g, '$2') // Inline code: `code` -> code
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold: **text** -> text
    .replace(/(\*|_)(.*?)\1/g, '$2') // Italic: *text* -> text
    .replace(/~~(.*?)~~/g, '$1') // Strikethrough: ~~text~~ -> text
    .replace(/<[^>]*>/g, '') // HTML tags: <tag> -> ''
    .trim();
};

/**
 * Converts heading text to a DOM-safe slug identifier
 */
export const slugify = (text: string): string => {
  const stripped = stripMarkdown(text).trim();
  const slug = stripped
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'heading';
};

/**
 * Parses markdown content and extracts all headings (H1-H6), excluding code blocks.
 */
export const extractHeadings = (markdown: string): TocItem[] => {
  if (!markdown || !markdown.trim()) {
    return [];
  }

  const lines = markdown.split('\n');
  const headings: TocItem[] = [];
  const slugCounts = new Map<string, number>();

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for fenced code block markers (``` or ~~~)
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      continue;
    }

    // Match Markdown ATX headings: # Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      // Strip trailing hashes if present (e.g. ## Heading 2 ##)
      const rawText = headingMatch[2].replace(/\s+#+\s*$/, '').trim();
      const text = stripMarkdown(rawText);

      if (!text) {
        continue;
      }

      const baseSlug = slugify(rawText);
      const count = slugCounts.get(baseSlug) || 0;
      slugCounts.set(baseSlug, count + 1);

      const id = count === 0 ? `heading-${baseSlug}` : `heading-${baseSlug}-${count}`;

      headings.push({
        id,
        text,
        level,
        lineNumber: i + 1,
        rawText,
      });
    }
  }

  return headings;
};

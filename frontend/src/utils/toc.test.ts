import { describe, expect, it } from 'vitest';
import { extractHeadings, slugify, stripMarkdown } from './toc';

describe('toc utilities', () => {
  describe('stripMarkdown', () => {
    it('removes bold, italic, and strikethrough markdown', () => {
      expect(stripMarkdown('**Bold Heading**')).toBe('Bold Heading');
      expect(stripMarkdown('*Italic Heading*')).toBe('Italic Heading');
      expect(stripMarkdown('~~Deleted Heading~~')).toBe('Deleted Heading');
      expect(stripMarkdown('**Bold** and *Italic* and `code`')).toBe('Bold and Italic and code');
    });

    it('removes links and images', () => {
      expect(stripMarkdown('[Link Title](https://example.com)')).toBe('Link Title');
      expect(stripMarkdown('![Image Alt](https://example.com/img.png)')).toBe('Image Alt');
    });
  });

  describe('slugify', () => {
    it('creates lowercase hyphen-separated slugs from text', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Section 1.2: Features & Details')).toBe('section-12-features-details');
    });

    it('supports Japanese unicode characters', () => {
      expect(slugify('第1章 概要と基本設計')).toBe('第1章-概要と基本設計');
      expect(slugify('API 仕様書 (v2)')).toBe('api-仕様書-v2');
    });

    it('returns fallback slug for empty/symbol-only strings', () => {
      expect(slugify('---')).toBe('heading');
      expect(slugify('   ')).toBe('heading');
    });
  });

  describe('extractHeadings', () => {
    it('returns empty array for empty or whitespace string', () => {
      expect(extractHeadings('')).toEqual([]);
      expect(extractHeadings('   \n  \n  ')).toEqual([]);
    });

    it('extracts all heading levels H1 to H6 with correct levels and line numbers', () => {
      const markdown = [
        '# Level 1 Heading',
        'Some body paragraph text here.',
        '## Level 2 Heading',
        '### Level 3 Heading',
        '#### Level 4 Heading',
        '##### Level 5 Heading',
        '###### Level 6 Heading',
      ].join('\n');

      const result = extractHeadings(markdown);

      expect(result).toHaveLength(6);
      expect(result[0]).toEqual({
        id: 'heading-level-1-heading',
        text: 'Level 1 Heading',
        level: 1,
        lineNumber: 1,
        rawText: 'Level 1 Heading',
      });
      expect(result[1]).toEqual({
        id: 'heading-level-2-heading',
        text: 'Level 2 Heading',
        level: 2,
        lineNumber: 3,
        rawText: 'Level 2 Heading',
      });
      expect(result[2].level).toBe(3);
      expect(result[3].level).toBe(4);
      expect(result[4].level).toBe(5);
      expect(result[5].level).toBe(6);
    });

    it('ignores headings inside fenced code blocks', () => {
      const markdown = [
        '# Real Heading 1',
        '```python',
        '# This is a python comment, not a heading',
        '## Another comment',
        '```',
        '## Real Heading 2',
        '~~~bash',
        '# Bash comment',
        '~~~',
        '### Real Heading 3',
      ].join('\n');

      const result = extractHeadings(markdown);

      expect(result).toHaveLength(3);
      expect(result.map((h) => h.text)).toEqual([
        'Real Heading 1',
        'Real Heading 2',
        'Real Heading 3',
      ]);
    });

    it('handles duplicate heading text by assigning disambiguated unique IDs', () => {
      const markdown = ['# Overview', 'Content 1', '## Overview', 'Content 2', '### Overview'].join(
        '\n'
      );

      const result = extractHeadings(markdown);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('heading-overview');
      expect(result[1].id).toBe('heading-overview-1');
      expect(result[2].id).toBe('heading-overview-2');
    });

    it('handles ATX closed headings with trailing hashes', () => {
      const markdown = '## ATX Closed Heading ##';
      const result = extractHeadings(markdown);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('ATX Closed Heading');
      expect(result[0].level).toBe(2);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseTags,
  getActiveTokenInfo,
  getExistingTags,
  getTagSuggestions,
  computeNextTagValue,
  computeNextTagValueWithCursor,
} from '../utils/tag';

describe('TagInput utilities', () => {
  describe('parseTags', () => {
    it('parses comma-separated tag string into trimmed non-empty array', () => {
      expect(parseTags('')).toEqual([]);
      expect(parseTags('   ')).toEqual([]);
      expect(parseTags('react, frontend, go')).toEqual(['react', 'frontend', 'go']);
      expect(parseTags('  react  , ,  frontend ,  ')).toEqual(['react', 'frontend']);
    });
  });

  describe('getActiveTokenInfo', () => {
    it('detects single token when no commas exist', () => {
      const info = getActiveTokenInfo('react', 3);
      expect(info.token).toBe('react');
      expect(info.start).toBe(0);
      expect(info.end).toBe(5);
    });

    it('detects active token in comma-separated list based on cursor position', () => {
      const text = 'frontend, backend, database';
      // Cursor inside 'frontend' (index 4)
      const info1 = getActiveTokenInfo(text, 4);
      expect(info1.token).toBe('frontend');
      expect(info1.start).toBe(0);
      expect(info1.end).toBe(8);

      // Cursor inside 'backend' (index 13)
      const info2 = getActiveTokenInfo(text, 13);
      expect(info2.token).toBe('backend');
      expect(info2.start).toBe(9);
      expect(info2.end).toBe(17);

      // Cursor at the very end after comma 'database, ' (index 28)
      const trailingText = 'frontend, backend, ';
      const info3 = getActiveTokenInfo(trailingText, trailingText.length);
      expect(info3.token).toBe('');
      expect(info3.start).toBe(18);
      expect(info3.end).toBe(19);
    });
  });

  describe('getExistingTags', () => {
    it('extracts existing tags excluding the active token region', () => {
      const text = 'react, frontend, database';
      // Active token is 'frontend' (index 7..15)
      const tokenInfo = { token: 'frontend', start: 7, end: 15 };
      const existing = getExistingTags(text, tokenInfo);
      expect(existing).toEqual(['react', 'database']);
    });

    it('extracts all preceding tags when active token is at the end', () => {
      const text = 'react, bug, ';
      const tokenInfo = { token: '', start: 12, end: 12 };
      const existing = getExistingTags(text, tokenInfo);
      expect(existing).toEqual(['react', 'bug']);
    });
  });

  describe('getTagSuggestions', () => {
    const availableTags = ['frontend', 'backend', 'react', 'refactor', 'redux', 'bug', 'feature'];

    it('returns empty array when availableTags is empty', () => {
      expect(getTagSuggestions([], 're', [])).toEqual([]);
    });

    it('filters suggestions by active token query case-insensitively', () => {
      const suggestions = getTagSuggestions(availableTags, 'RE', []);
      expect(suggestions).toContain('react');
      expect(suggestions).toContain('refactor');
      expect(suggestions).toContain('redux');
      expect(suggestions).toContain('feature'); // contains 're'
      expect(suggestions).not.toContain('bug');
    });

    it('prioritizes prefix matches over substring matches', () => {
      const suggestions = getTagSuggestions(availableTags, 're', []);
      // 'react', 'refactor', 'redux' start with 're', 'feature' contains 're'
      expect(suggestions[suggestions.length - 1]).toBe('feature');
      expect(suggestions.slice(0, 3)).toEqual(
        expect.arrayContaining(['react', 'refactor', 'redux'])
      );
    });

    it('strictly excludes tags that are already selected in the card', () => {
      const existingTags = ['react', 'bug'];
      const suggestions = getTagSuggestions(availableTags, 're', existingTags);
      // 'react' must NEVER appear in suggestions because it is already specified
      expect(suggestions).not.toContain('react');
      expect(suggestions).toContain('refactor');
      expect(suggestions).toContain('redux');
      expect(suggestions).toContain('feature');
    });

    it('strictly excludes existing tag even if active query exactly matches it', () => {
      const existingTags = ['react'];
      const suggestions = getTagSuggestions(availableTags, 'react', existingTags);
      expect(suggestions).toEqual([]);
    });

    it('returns all unselected available tags when active query is empty preserving MRU order', () => {
      const mruTags = ['recent-tag', 'older-tag', 'oldest-tag', 'bug'];
      const existingTags = ['bug'];
      const suggestions = getTagSuggestions(mruTags, '', existingTags);
      expect(suggestions).toEqual(['recent-tag', 'older-tag', 'oldest-tag']);
    });

    it('preserves MRU order within prefix matches', () => {
      const mruTags = ['refactor', 'redux', 'react', 'feature'];
      const suggestions = getTagSuggestions(mruTags, 're', []);
      expect(suggestions).toEqual(['refactor', 'redux', 'react', 'feature']);
    });
  });

  describe('computeNextTagValue & computeNextTagValueWithCursor', () => {
    it('inserts tag when value is initially empty', () => {
      const tokenInfo = { token: '', start: 0, end: 0 };
      const next = computeNextTagValue('', tokenInfo, 'frontend');
      expect(next).toBe('frontend, ');

      const res = computeNextTagValueWithCursor('', tokenInfo, 'frontend');
      expect(res.nextValue).toBe('frontend, ');
      expect(res.nextCursorPos).toBe('frontend, '.length);
    });

    it('replaces active token at the end of input', () => {
      const value = 'react, re';
      const tokenInfo = { token: 're', start: 6, end: 9 };
      const next = computeNextTagValue(value, tokenInfo, 'refactor');
      expect(next).toBe('react, refactor, ');

      const res = computeNextTagValueWithCursor(value, tokenInfo, 'refactor');
      expect(res.nextValue).toBe('react, refactor, ');
      expect(res.nextCursorPos).toBe('react, refactor, '.length);
    });

    it('replaces active token in the middle of input', () => {
      const value = 'alpha, bet, gamma';
      const tokenInfo = { token: 'bet', start: 6, end: 11 };
      const next = computeNextTagValue(value, tokenInfo, 'beta');
      expect(next).toBe('alpha, beta, gamma');

      const res = computeNextTagValueWithCursor(value, tokenInfo, 'beta');
      expect(res.nextValue).toBe('alpha, beta, gamma');
      expect(res.nextCursorPos).toBe('alpha, beta, '.length);
    });
  });
});


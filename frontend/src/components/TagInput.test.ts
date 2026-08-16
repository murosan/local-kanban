import { describe, expect, it } from 'vitest';
import {
  parseTags,
  normalizeTag,
  addTagIfUnique,
  addMultipleTags,
  removeTagAtIndex,
  getTagSuggestions,
} from '../utils/tag';

describe('TagInput utilities', () => {
  describe('parseTags', () => {
    it('parses comma and newline separated tag string into trimmed non-empty array', () => {
      expect(parseTags('')).toEqual([]);
      expect(parseTags('   ')).toEqual([]);
      expect(parseTags('react, frontend, go')).toEqual(['react', 'frontend', 'go']);
      expect(parseTags('  react  , ,  frontend ,  ')).toEqual(['react', 'frontend']);
      expect(parseTags('react\nfrontend\ngo')).toEqual(['react', 'frontend', 'go']);
    });
  });

  describe('normalizeTag', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeTag('  frontend  ')).toBe('frontend');
      expect(normalizeTag('tag')).toBe('tag');
    });
  });

  describe('addTagIfUnique', () => {
    it('adds new tag to list', () => {
      expect(addTagIfUnique(['react'], 'frontend')).toEqual(['react', 'frontend']);
    });

    it('does not add duplicate tags case-insensitively', () => {
      expect(addTagIfUnique(['react', 'frontend'], 'React')).toEqual(['react', 'frontend']);
      expect(addTagIfUnique(['react', 'frontend'], 'FRONTEND')).toEqual(['react', 'frontend']);
    });

    it('ignores empty or whitespace-only tags', () => {
      expect(addTagIfUnique(['react'], '   ')).toEqual(['react']);
    });
  });

  describe('addMultipleTags', () => {
    it('adds multiple unique tags preserving order and ignoring duplicates', () => {
      const initial = ['react'];
      const newTags = ['frontend', 'react', 'Backend', 'frontend'];
      expect(addMultipleTags(initial, newTags)).toEqual(['react', 'frontend', 'Backend']);
    });
  });

  describe('removeTagAtIndex', () => {
    it('removes tag at specified index', () => {
      expect(removeTagAtIndex(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
      expect(removeTagAtIndex(['a', 'b', 'c'], 0)).toEqual(['b', 'c']);
      expect(removeTagAtIndex(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    });

    it('returns unchanged list if index is out of bounds', () => {
      expect(removeTagAtIndex(['a', 'b'], -1)).toEqual(['a', 'b']);
      expect(removeTagAtIndex(['a', 'b'], 5)).toEqual(['a', 'b']);
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
});

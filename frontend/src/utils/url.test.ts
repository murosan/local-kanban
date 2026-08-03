import { describe, expect, it } from 'vitest';
import { getSafeUrl } from './url';

describe('getSafeUrl', () => {
  it('returns null for non-string or empty input', () => {
    expect(getSafeUrl(null)).toBeNull();
    expect(getSafeUrl(undefined)).toBeNull();
    expect(getSafeUrl(123)).toBeNull();
    expect(getSafeUrl('')).toBeNull();
    expect(getSafeUrl('   ')).toBeNull();
  });

  it('blocks dangerous schemes', () => {
    expect(getSafeUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(getSafeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(getSafeUrl('vbscript:msgbox("hello")')).toBeNull();
  });

  it('accepts standard web URLs', () => {
    expect(getSafeUrl('http://example.com')).toBe('http://example.com');
    expect(getSafeUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
  });

  it('accepts custom URI schemes like vscode:// or slack://', () => {
    expect(getSafeUrl('vscode://file/Users/test/project')).toBe('vscode://file/Users/test/project');
    expect(getSafeUrl('slack://channel?team=T123&id=C123')).toBe(
      'slack://channel?team=T123&id=C123'
    );
    expect(getSafeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
    expect(getSafeUrl('obsidian://open?vault=my%20vault')).toBe('obsidian://open?vault=my%20vault');
  });

  it('prepends https:// when scheme is missing', () => {
    expect(getSafeUrl('example.com')).toBe('https://example.com');
    expect(getSafeUrl('github.com/murosan/local-kanban')).toBe(
      'https://github.com/murosan/local-kanban'
    );
  });
});

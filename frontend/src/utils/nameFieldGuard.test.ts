import { describe, it, expect } from 'vitest';
import { looksLikeEmail, looksLikeUrl, looksLikeEmailOrUrl } from './nameFieldGuard';

describe('looksLikeEmail', () => {
  it('flags a plain email address', () => {
    expect(looksLikeEmail('bradbrownjr@gmail.com')).toBe(true);
  });

  it('flags an email with surrounding whitespace', () => {
    expect(looksLikeEmail('  jane.doe@example.org  ')).toBe(true);
  });

  it('does not flag an ordinary first name', () => {
    expect(looksLikeEmail('Brad')).toBe(false);
  });

  it('does not flag a name with punctuation but no @', () => {
    expect(looksLikeEmail("O'Brien")).toBe(false);
  });

  it('does not flag an empty string', () => {
    expect(looksLikeEmail('')).toBe(false);
  });
});

describe('looksLikeUrl', () => {
  it('flags a full https URL', () => {
    expect(looksLikeUrl('https://example.com/nb9d')).toBe(true);
  });

  it('flags a www.-prefixed domain with no scheme', () => {
    expect(looksLikeUrl('www.youtube.com/@nb9d')).toBe(true);
  });

  it('flags a bare domain with a common TLD', () => {
    expect(looksLikeUrl('nb9d.com')).toBe(true);
  });

  it('does not flag an ordinary first name', () => {
    expect(looksLikeUrl('Brad')).toBe(false);
  });

  it('does not flag an abbreviation with a period', () => {
    expect(looksLikeUrl('St. Louis')).toBe(false);
  });

  it('does not flag an empty string', () => {
    expect(looksLikeUrl('')).toBe(false);
  });
});

describe('looksLikeEmailOrUrl', () => {
  it('flags an email', () => {
    expect(looksLikeEmailOrUrl('jane.doe@example.org')).toBe(true);
  });

  it('flags a URL', () => {
    expect(looksLikeEmailOrUrl('youtube.com/@nb9d')).toBe(true);
  });

  it('does not flag an ordinary first name', () => {
    expect(looksLikeEmailOrUrl('Brad')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { looksLikeEmail } from './nameFieldGuard';

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

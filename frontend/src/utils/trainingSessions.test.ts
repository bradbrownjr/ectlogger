import { describe, expect, it } from 'vitest';
import { formatSessionRange, fromLocalInput, isWebUrl, parseUtc, toLocalInput } from './trainingSessions';

describe('parseUtc', () => {
  it('treats a time with no zone as UTC', () => {
    expect(parseUtc('2026-11-05T00:00:00').toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(parseUtc('2026-11-05T00:00:00Z').toISOString()).toBe('2026-11-05T00:00:00.000Z');
  });
});

describe('local input round trip', () => {
  it('reads back the same instant it showed', () => {
    const iso = '2026-11-06T00:30:00';
    expect(fromLocalInput(toLocalInput(iso))).toBe('2026-11-06T00:30:00.000Z');
  });
});

describe('isWebUrl', () => {
  it('accepts only http and https links', () => {
    expect(isWebUrl('https://zoom.us/j/1')).toBe(true);
    expect(isWebUrl('HTTP://example.com')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('zoom.us/j/1')).toBe(false);
    expect(isWebUrl('https://a b.com')).toBe(false);
  });
});

describe('formatSessionRange', () => {
  it('shows one date for a same-day session, in the given zone', () => {
    const text = formatSessionRange('2026-11-06T00:00:00', '2026-11-06T01:30:00', 'America/New_York');
    expect(text).toContain('Thu, Nov 5, 2026');
    expect(text).toContain('7:00 PM EST');
    expect(text).toContain('to 8:30 PM EST');
  });

  it('names the end date when the session runs past midnight', () => {
    const text = formatSessionRange('2026-11-06T02:00:00', '2026-11-06T06:00:00', 'America/New_York');
    expect(text).toMatch(/to Fri, Nov 6, 2026, 1:00 AM EST$/);
  });

  it('shows the start alone with no end', () => {
    expect(formatSessionRange('2026-11-06T00:00:00', null, 'America/New_York')).not.toContain(' to ');
  });
});

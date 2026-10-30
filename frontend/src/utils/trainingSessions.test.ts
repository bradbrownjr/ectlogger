import { describe, expect, it } from 'vitest';
import {
  TRAINING_BANNER_LEAD_DAYS,
  formatBannerWhen,
  formatSessionRange,
  fromLocalInput,
  isTrainingBannerPage,
  isWebUrl,
  parseUtc,
  pickBannerSession,
  toLocalInput,
} from './trainingSessions';

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

describe('training banner', () => {
  // The WSSM session: Thu Nov 12, 2026 at 7 PM Eastern (00:00 UTC on the 13th).
  const wssm = { id: 1, starts_at: '2026-11-13T00:00:00', banner_dismissed: false };
  const later = { id: 2, starts_at: '2026-11-14T00:00:00', banner_dismissed: false };

  it('announces a session from a week before it starts', () => {
    expect(TRAINING_BANNER_LEAD_DAYS).toBe(7);
    expect(pickBannerSession([wssm], new Date('2026-11-05T23:59:00Z'))).toBeNull();
    expect(pickBannerSession([wssm], new Date('2026-11-06T00:00:00Z'))).toBe(wssm);
    expect(pickBannerSession([wssm], new Date('2026-11-13T00:30:00Z'))).toBe(wssm);
  });

  it('skips a session this viewer closed, on the account or in a guest browser', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(pickBannerSession([{ ...wssm, banner_dismissed: true }, later], now)).toBe(later);
    expect(pickBannerSession([wssm, later], now, new Set([1]))).toBe(later);
    expect(pickBannerSession([wssm, later], now, new Set([1, 2]))).toBeNull();
  });

  it('shows only on the main pages', () => {
    for (const p of ['/', '/dashboard', '/scheduler', '/traffic', '/statistics', '/profile', '/admin/users', '/dashboard/']) {
      expect(isTrainingBannerPage(p)).toBe(true);
    }
    for (const p of ['/nets/12', '/nets/12/report', '/nets/12/pane/chat', '/nets/create', '/scheduler/create',
      '/scheduler/3/edit', '/statistics/nets/12', '/login', '/subscribe/3']) {
      expect(isTrainingBannerPage(p)).toBe(false);
    }
  });

  it('says when, briefly, on the viewer clock', () => {
    expect(formatBannerWhen(wssm.starts_at, 'America/New_York')).toBe('Thu, Nov 12 at 7:00 PM EST');
  });
});

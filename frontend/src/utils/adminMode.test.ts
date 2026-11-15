import { describe, it, expect } from 'vitest';
import { adminMinutesLeft } from './adminMode';

describe('adminMinutesLeft', () => {
  const now = new Date('2026-11-15T19:00:00Z');

  it('rounds partial minutes up', () => {
    expect(adminMinutesLeft(new Date('2026-11-15T19:14:01Z'), now)).toBe(15);
    expect(adminMinutesLeft(new Date('2026-11-15T19:00:30Z'), now)).toBe(1);
  });

  it('is 0 once closed or past', () => {
    expect(adminMinutesLeft(null, now)).toBe(0);
    expect(adminMinutesLeft(new Date('2026-11-15T18:59:00Z'), now)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { formTime, inputToIso, isoToInput, lineDateTime, splitPages } from './ics214';

describe('ICS-214 times', () => {
  it('prints the 24-hour clock with no colon', () => {
    expect(formTime('2026-10-24T12:17:00', true)).toBe('1217');
  });

  it('adds the date only when the period spans days or the line is on another day', () => {
    const oneDay = { from: '2026-10-24T11:00:00Z', to: '2026-10-24T16:40:00Z' };
    expect(lineDateTime('2026-10-24T12:17:00Z', oneDay, true)).toBe('1217');
    expect(lineDateTime('2026-10-23T22:46:00Z', oneDay, true)).toBe('10/23/2026 2246');
    const twoDays = { from: '2026-10-24T11:00:00Z', to: '2026-10-25T02:00:00Z' };
    expect(lineDateTime('2026-10-24T12:17:00Z', twoDays, true)).toBe('10/24/2026 1217');
    expect(lineDateTime(null, oneDay, true)).toBe('');
  });

  it('round-trips a datetime-local value in UTC', () => {
    const iso = inputToIso('2026-10-24T08:17', true);
    expect(iso).toBe('2026-10-24T08:17:00.000Z');
    expect(isoToInput(iso, true)).toBe('2026-10-24T08:17');
    expect(inputToIso('not a time', true)).toBeNull();
  });
});

describe('splitPages', () => {
  const heading = { resources: 30, lines: 30 };

  it('keeps everything on one page when it fits', () => {
    const items = [{ section: 'resources' as const, height: 20 }, { section: 'lines' as const, height: 20 }];
    expect(splitPages(items, () => 200, heading)).toEqual([[0, 1]]);
  });

  it('starts a new page when a row would not fit, and repeats the heading there', () => {
    const items = Array.from({ length: 6 }, () => ({ section: 'lines' as const, height: 40 }));
    // page 0: 30 + 3 x 40 = 150 <= 160; page 1 has more room
    expect(splitPages(items, (p) => (p === 0 ? 160 : 400), heading)).toEqual([[0, 1, 2], [3, 4, 5]]);
  });

  it("never moves a section's heading to a page without its first row", () => {
    const items = [{ section: 'resources' as const, height: 100 }, { section: 'lines' as const, height: 40 }];
    // 100 + 30 fits; the lines heading plus a row (70) doesn't fit in the 20 left
    expect(splitPages(items, () => 150, heading)).toEqual([[0], [1]]);
  });

  it('gives a row taller than a page a page of its own', () => {
    const items = [{ section: 'lines' as const, height: 900 }, { section: 'lines' as const, height: 10 }];
    expect(splitPages(items, () => 100, heading)).toEqual([[0], [1]]);
  });
});

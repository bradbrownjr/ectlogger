// Expectations are built from local-time constructors, so these hold in
// whatever zone the test runner is in (a runtime TZ change does not reach the
// vitest worker).
import { describe, expect, it } from 'vitest';
import { addMonths, GRID_DAYS, groupByLocalDay, localDayKey, monthGridDays, monthGridWindow } from './calendarGrid';

describe('monthGridDays', () => {
  it('starts on the Sunday on or before the 1st and covers six weeks', () => {
    // September 2026 starts on a Tuesday.
    const days = monthGridDays(2026, 8);
    expect(days).toHaveLength(GRID_DAYS);
    expect(localDayKey(days[0])).toBe('2026-08-30');
    expect(days[0].getDay()).toBe(0);
    expect(localDayKey(days[41])).toBe('2026-10-10');
  });

  it('starts on the 1st itself when the month begins on a Sunday', () => {
    // November 2026 starts on a Sunday.
    expect(localDayKey(monthGridDays(2026, 10)[0])).toBe('2026-11-01');
  });

  it('never repeats or skips a day across a DST change', () => {
    const keys = monthGridDays(2026, 10).map(localDayKey); // DST ends Nov 1 2026
    expect(new Set(keys).size).toBe(GRID_DAYS);
    expect(keys.slice(0, 3)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('monthGridWindow', () => {
  it('ends at local midnight after the last grid day', () => {
    const { start, end } = monthGridWindow(2026, 8);
    expect(start.getTime()).toBe(new Date(2026, 7, 30).getTime());
    expect(end.getTime()).toBe(new Date(2026, 9, 11).getTime());
  });
});

describe('groupByLocalDay', () => {
  it('groups by the viewer\'s local day, not the UTC date', () => {
    // Late evening locally is often the next day in UTC.
    const grouped = groupByLocalDay([
      { start: new Date(2026, 8, 20, 19, 30).toISOString(), id: 1 },
      { start: new Date(2026, 8, 20, 23, 45).toISOString(), id: 2 },
    ]);
    expect(grouped.get('2026-09-20')?.map((o) => o.id)).toEqual([1, 2]);
    expect(grouped.has('2026-09-21')).toBe(false);
  });
});

describe('addMonths', () => {
  it('wraps across year ends in both directions', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

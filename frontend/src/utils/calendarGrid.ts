// ========== SCHEDULE CALENDAR GRID ==========
// Pure date math for the Schedule page's month calendar
// (components/scheduler/ScheduleCalendar.tsx). Everything here works in the
// viewer's own timezone: the question the calendar answers is "what is on the
// evening I am free", so a net is placed on the day it falls on for the viewer,
// not the day it falls on where the net is run. See DEVELOPMENT.md "Schedule
// calendar" for why this deliberately differs from reports, which use the net's zone.

/** Days in a month grid: six weeks, so every month fits without the grid changing height. */
export const GRID_DAYS = 42;

/** The 42 local days shown for a month, starting on the Sunday on or before the 1st. */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const days: Date[] = [];
  for (let i = 0; i < GRID_DAYS; i++) {
    // Built from calendar fields, not by adding 24h, so a DST change never
    // shifts a day or repeats one.
    days.push(new Date(year, month, 1 - first.getDay() + i));
  }
  return days;
}

/** The instant range a month grid covers: local midnight of its first day to local midnight after its last. */
export function monthGridWindow(year: number, month: number): { start: Date; end: Date } {
  const days = monthGridDays(year, month);
  const last = days[days.length - 1];
  return { start: days[0], end: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) };
}

/** 'YYYY-MM-DD' for the local day an instant falls on. */
export function localDayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Group items by the local day their ISO `start` falls on, keeping input order within a day. */
export function groupByLocalDay<T extends { start: string }>(items: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const key = localDayKey(new Date(item.start));
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  return byDay;
}

/** Step a (year, month) pair by `delta` months. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

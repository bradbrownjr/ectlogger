// ========== ICS-214 ACTIVITY LOG ==========
// Types for GET /nets/{id}/ics214 (backend/app/routers/ics214.py), the
// form's 24-hour times, and splitting the form into pages. The lines are
// rendered by the server from what was logged (services/ics214.py); this
// file only formats and lays them out. Tests: ics214.test.ts.

export interface Ics214Header {
  incident_name: string;
  period_from: string | null;
  period_to: string | null;
  unit_name: string;
  leader: string;
  home_agency: string;
  prepared_name: string;
  prepared_position: string;
}

export interface Ics214Line {
  key: string;
  at: string | null; // null: no time was recorded
  text: string;
  default_text: string;
  kind: 'net' | 'role' | 'station' | 'channel' | 'traffic' | 'entry';
  hidden: boolean;
  entry_id: number | null;
}

export interface Ics214Resource {
  key: string;
  callsign: string;
  name: string;
  default_name: string;
  position: string;
  default_position: string;
  agency: string;
  hidden: boolean;
}

export interface Ics214Form {
  header: Ics214Header;
  defaults: Ics214Header;
  resources: Ics214Resource[];
  lines: Ics214Line[];
  exercise: boolean;
}

const asUtc = (value: string) => new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);

const parts = (date: Date, preferUtc: boolean) => preferUtc
  ? { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), h: date.getUTCHours(), min: date.getUTCMinutes() }
  : { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), h: date.getHours(), min: date.getMinutes() };

const pad = (n: number) => String(n).padStart(2, '0');

/** The form's date, month/day/year as FEMA's instructions give it. */
export const formDate = (value: string | null, preferUtc: boolean): string => {
  if (!value) return '';
  const p = parts(asUtc(value), preferUtc);
  return `${p.m}/${p.d}/${p.y}`;
};

/** The form's time, on the 24-hour clock with no colon ("0817"). */
export const formTime = (value: string | null, preferUtc: boolean): string => {
  if (!value) return '';
  const p = parts(asUtc(value), preferUtc);
  return `${pad(p.h)}${pad(p.min)}`;
};

/**
 * A block 7 Date/Time. FEMA: "Note the date as well if the operational
 * period covers more than one day", so a one-day period prints only the
 * time, unless the line itself falls on another day (a station that
 * checked in the evening before). A line with no recorded time is blank.
 */
export const lineDateTime = (
  at: string | null, period: { from: string | null; to: string | null }, preferUtc: boolean,
): string => {
  if (!at) return '';
  const day = formDate(at, preferUtc);
  const multiDay = !!period.from && !!period.to && formDate(period.from, preferUtc) !== formDate(period.to, preferUtc);
  const otherDay = !!period.from && day !== formDate(period.from, preferUtc);
  return multiDay || otherDay ? `${day} ${formTime(at, preferUtc)}` : formTime(at, preferUtc);
};

/** An ISO time as a datetime-local input's value, in local time or UTC. */
export const isoToInput = (value: string | null, preferUtc: boolean): string => {
  if (!value) return '';
  const p = parts(asUtc(value), preferUtc);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
};

/** A datetime-local input's value as ISO, read as local time or UTC. */
export const inputToIso = (value: string, preferUtc: boolean): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [y, m, d, h, min] = match.slice(1).map(Number);
  const date = preferUtc ? new Date(Date.UTC(y, m - 1, d, h, min)) : new Date(y, m - 1, d, h, min);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// ========== PAGES ==========

export interface PageItem {
  section: 'resources' | 'lines';
  height: number;
}

/**
 * Split block 6 and block 7 rows into pages. `capacity(page)` is the height
 * left for rows on that page (page 0 also carries blocks 3-5);
 * `sectionHeading` is what a section's heading costs where it starts on a
 * page, as a continuation heading does. A row taller than a whole page
 * still gets a page of its own. Returns the item indexes on each page;
 * there is always at least one page.
 */
export const splitPages = (
  items: PageItem[],
  capacity: (page: number) => number,
  sectionHeading: Record<PageItem['section'], number>,
): number[][] => {
  const pages: number[][] = [[]];
  let left = capacity(0);
  let current: PageItem['section'] | null = null;
  items.forEach((item, i) => {
    const heading = item.section !== current ? sectionHeading[item.section] : 0;
    if (heading + item.height > left && pages[pages.length - 1].length > 0) {
      pages.push([]);
      left = capacity(pages.length - 1);
      current = null;
    }
    const cost = (item.section !== current ? sectionHeading[item.section] : 0) + item.height;
    pages[pages.length - 1].push(i);
    left -= cost;
    current = item.section;
  });
  return pages;
};

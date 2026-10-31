// ========== ONE ROW PER STATION PER PLACE ==========
// Every check-in, recheck included, is its own row on the server, because
// each is a timestamped event the ICS-309 logs. Listed as-is, a SET's
// stations were scattered over a row per channel (net 137: 74 rows for 17
// callsigns). What a coordinator wants is which channels a station can be
// reached on at each place (Brad, 2026-10-30), so rows group by station and
// place (stationPlaceKey) and each group carries:
//   worked  - channels it checked in on there (a logged check-in is two-way)
//   listed  - channels it said it could be reached on, not yet worked
//   offline - channels net control marked offline, still shown, greyed
// The group's rows are its timeline. Mirror of the backend's
// services/station_rows.py::group_station_rows, held to the same cases.
import { stationPlaceKey } from './stationPlace';

export interface StationRowSource {
  id: number;
  callsign: string;
  checked_in_at: string;
  frequency_id?: number | null;
  available_frequencies?: number[] | null;
  coverage_site_id?: number | null;
  operating_position?: string | null;
  status?: string | null;
  location?: string | null;
}

/** A channel marked offline at a station's place (backend StationChannelMark). */
export interface ChannelMark {
  id: number;
  station_key: string;
  frequency_id: number;
  offline_at: string;
  offline_by_id?: number | null;
  restored_at?: string | null;
  restored_by_id?: number | null;
}

export interface StationRow<T extends StationRowSource> {
  key: string;
  /** The newest row: its status, fields and actions are the station's now. */
  row: T;
  /** Every row, oldest first: the station's timeline at this place. */
  rows: T[];
  worked: number[];
  listed: number[];
  /** frequency id -> when it was marked offline, for channels still offline. */
  offline: Record<number, string>;
  /** Every mark for this station and place, open or restored, oldest first. */
  marks: ChannelMark[];
}

const time = (value: string): number => new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).getTime();

export function groupStationRows<T extends StationRowSource>(rows: T[], marks: ChannelMark[] = []): StationRow<T>[] {
  const sorted = rows.slice().sort((a, b) => time(a.checked_in_at) - time(b.checked_in_at) || a.id - b.id);
  const groups = new Map<string, T[]>();
  sorted.forEach((row) => {
    const key = stationPlaceKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return Array.from(groups.entries()).map(([key, members]) => {
    const worked: number[] = [];
    members.forEach((row) => {
      if (row.frequency_id != null && !worked.includes(row.frequency_id)) worked.push(row.frequency_id);
    });
    const listed: number[] = [];
    members.forEach((row) => (row.available_frequencies || []).forEach((fid) => {
      if (!worked.includes(fid) && !listed.includes(fid)) listed.push(fid);
    }));
    const own = marks.filter((m) => m.station_key === key);
    const offline: Record<number, string> = {};
    own.forEach((m) => { if (!m.restored_at) offline[m.frequency_id] = m.offline_at; });
    return { key, row: members[members.length - 1], rows: members, worked, listed, offline, marks: own };
  });
}

/** Whether a group is on any of these channels (the toolbar frequency filter). */
export const stationRowOnAny = (group: StationRow<any>, frequencyIds: number[]): boolean =>
  frequencyIds.some((fid) => group.worked.includes(fid) || group.listed.includes(fid));

interface VisibleOptions<T> {
  searchQuery?: string;
  /** The toolbar's frequency filter; empty shows every station. */
  frequencyIds?: number[];
  /** Shown whatever the frequency filter says (net control). */
  alwaysShow?: (row: T) => boolean;
  /** Row order (checkInSort.ts), given each station's first check-in time. */
  compare: (a: T, b: T) => number;
}

/**
 * The check-in list's rows: grouped, narrowed by the search box and the
 * frequency filter, and ordered. A station sorts by its first check-in at
 * the place, so a recheck doesn't move it down the list. Shared by the net
 * page and the popped-out check-in window.
 */
export function visibleStationRows<T extends StationRowSource & { name?: string | null }>(
  checkIns: T[], marks: ChannelMark[], { searchQuery = '', frequencyIds = [], alwaysShow, compare }: VisibleOptions<T>,
): StationRow<T>[] {
  const query = searchQuery.trim().toLowerCase();
  return groupStationRows(checkIns, marks)
    .filter((group) => !query || group.rows.some((row) =>
      [row.callsign, row.name, row.location].some((text) => (text || '').toLowerCase().includes(query))))
    .filter((group) => frequencyIds.length === 0 || alwaysShow?.(group.row) || stationRowOnAny(group, frequencyIds))
    .sort((a, b) => compare(
      { ...a.row, checked_in_at: a.rows[0].checked_in_at },
      { ...b.row, checked_in_at: b.rows[0].checked_in_at },
    ));
}

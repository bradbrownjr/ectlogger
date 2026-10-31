import { describe, expect, it } from 'vitest';
import { ChannelMark, groupStationRows, stationRowOnAny } from './stationRows';

// The same cases as backend tests/test_station_rows.py.
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 24, 12, minutes)).toISOString();
const row = (id: number, callsign: string, site: number | null, freq: number | null, minutes: number, extra: object = {}) => ({
  id, callsign, coverage_site_id: site, frequency_id: freq, checked_in_at: at(minutes), status: 'checked_in', ...extra,
});

describe('groupStationRows', () => {
  it('makes rechecks at one place one station with every channel', () => {
    const groups = groupStationRows([
      row(1, 'KD1OM', 4, 3, 0),
      row(2, 'KD1OM', 4, 37, 2, { available_frequencies: [37, 1] }),
      row(3, 'KD1OM', 9, 3, 60),
      row(4, 'WO1J', 14, 3, 5),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['KD1OM|site:4', 'WO1J|site:14', 'KD1OM|site:9']);
    expect(groups[0].rows.map((r) => r.id)).toEqual([1, 2]);
    expect(groups[0].row.id).toBe(2);
    expect(groups[0].worked).toEqual([3, 37]);
    expect(groups[0].listed).toEqual([1]);
  });

  it('gives In person no channels', () => {
    const [group] = groupStationRows([row(1, 'KC1WGO', 12, null, 0, { status: 'in_person' })]);
    expect(group.worked).toEqual([]);
    expect(group.listed).toEqual([]);
  });

  it('keeps an offline channel on the row until it is restored', () => {
    const marks: ChannelMark[] = [
      { id: 1, station_key: 'KD1OM|site:4', frequency_id: 37, offline_at: at(30) },
      { id: 2, station_key: 'KD1OM|site:4', frequency_id: 3, offline_at: at(10), restored_at: at(20) },
    ];
    const [group] = groupStationRows([row(1, 'KD1OM', 4, 3, 0), row(2, 'KD1OM', 4, 37, 2)], marks);
    expect(group.worked).toEqual([3, 37]);
    expect(group.offline).toEqual({ 37: at(30) });
    expect(group.marks).toHaveLength(2);
  });

  it('filters by any channel the station has', () => {
    const [group] = groupStationRows([row(1, 'KD1OM', 4, 3, 0, { available_frequencies: [1] })]);
    expect(stationRowOnAny(group, [1])).toBe(true);
    expect(stationRowOnAny(group, [5])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { activeSiteNames, coverageFrequencies, formatSiteLine, parseSiteLine, stationSiteName } from './coverageSites';

describe('parseSiteLine', () => {
  it('splits a name from the town and state at the first comma', () => {
    expect(parseSiteLine('Bonny Eagle High School, Standish, ME')).toEqual({ name: 'Bonny Eagle High School', location: 'Standish, ME' });
  });
  it('takes a trailing grid square with or without a comma', () => {
    expect(parseSiteLine('Gray NWS FN43rv')).toEqual({ name: 'Gray NWS', location: 'FN43rv' });
    expect(parseSiteLine('Gray NWS, FN43rv')).toEqual({ name: 'Gray NWS', location: 'FN43rv' });
    expect(parseSiteLine('Windham EMA FN43')).toEqual({ name: 'Windham EMA', location: 'FN43' });
  });
  it('leaves the place empty when it cannot tell where the name ends', () => {
    expect(parseSiteLine('Windham EMA Windham ME')).toEqual({ name: 'Windham EMA Windham ME', location: null });
  });
  it('does not mistake a one-word name for a grid square', () => {
    expect(parseSiteLine('FN43')).toEqual({ name: 'FN43', location: null });
  });
  it('round-trips through formatSiteLine', () => {
    for (const line of ['Bonny Eagle HS, Standish, ME', 'Gray NWS FN43rv', 'Windham EMA']) {
      const { name, location } = parseSiteLine(line);
      expect(formatSiteLine(name, location)).toBe(line);
    }
  });
});

describe('coverageFrequencies', () => {
  it('drops the excluded frequencies', () => {
    const net = { frequencies: [{ id: 1 }, { id: 2 }, { id: 3 }], coverage_excluded_frequency_ids: [2] };
    expect(coverageFrequencies(net).map((f) => f.id)).toEqual([1, 3]);
  });
  it('keeps every frequency when nothing is excluded', () => {
    expect(coverageFrequencies({ frequencies: [{ id: 1 }] }).map((f) => f.id)).toEqual([1]);
  });
});

describe('stationSiteName', () => {
  it('names the site so two visits by one operator can be told apart', () => {
    const sites = new Map([[7, { id: 7, net_id: 1, name: 'Gray NWS', location: null, site_type: 'office' as const, is_primary: false, sort_order: 0, frequency_id: null, is_supported: true, in_use: true }]]);
    expect(stationSiteName({ coverage_site_id: 7 }, sites)).toBe('Gray NWS');
    expect(stationSiteName({}, sites)).toBeNull();
  });
});

describe('activeSiteNames', () => {
  const site = (id: number, name: string, site_type: 'office' | 'shelter' | 'infrastructure') =>
    ({ id, net_id: 1, name, location: null, site_type, is_primary: false, sort_order: 0, frequency_id: null, is_supported: true, in_use: true });
  const sites = [site(1, 'Windham HS', 'shelter'), site(2, 'Bunker', 'office'), site(3, 'Gray repeater', 'infrastructure'), site(4, 'Gorham MS', 'shelter')];

  it('counts each site with a live station once, and skips checked-out rows and repeaters', () => {
    const checkIns = [
      { coverage_site_id: 2, status: 'checked_in' },
      { coverage_site_id: 2, status: 'checked_in' }, // a recheck at the same site
      { coverage_site_id: 1, status: 'mobile' },
      { coverage_site_id: 4, status: 'checked_out' },
      { coverage_site_id: 3, status: 'checked_in' },
      { coverage_site_id: null, status: 'checked_in' },
    ];
    expect(activeSiteNames(checkIns, sites)).toEqual(['Bunker', 'Windham HS']);
  });
});

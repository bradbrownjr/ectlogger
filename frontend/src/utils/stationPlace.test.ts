import { describe, expect, it } from 'vitest';
import { CoverageSite } from './coverageSites';
import { TRAVELING, applyPlaceChoice, buildSiteBoard, placeChoice, placeChoices } from './stationPlace';

const site = (id: number, name: string, location: string | null, extra: Partial<CoverageSite> = {}): CoverageSite => ({
  id, net_id: 1, name, location, site_type: 'shelter', is_primary: false, sort_order: id, frequency_id: null,
  is_supported: true, in_use: true, ...extra,
});

const SITES = [
  site(1, 'Windham EMA', 'Windham, ME', { site_type: 'office' }),
  site(2, 'Bonny Eagle HS', 'Standish, ME'),
  site(3, 'Gray Fire', 'Gray, ME', { is_supported: false, in_use: false }),
  site(4, 'Mt Washington', null, { site_type: 'infrastructure' }),
];

const form = (patch = {}) => ({ location: '', status: 'checked_in', coverage_site_id: null, operating_position: '', ...patch });

describe('placeChoice', () => {
  it('reads Mobile as traveling, ahead of a site', () => {
    expect(placeChoice({ status: 'mobile', coverage_site_id: 2 })).toBe(TRAVELING);
    expect(placeChoice({ status: 'checked_in', coverage_site_id: 2 })).toBe('site:2');
    expect(placeChoice({ operating_position: 'Home' })).toBe('position:Home');
    expect(placeChoice({})).toBeNull();
  });
});

describe('placeChoices', () => {
  it('offers positions, traveling, then reporting sites grouped by type', () => {
    expect(placeChoices(SITES, null)).toEqual([
      'position:Home', 'position:Field Deployed', TRAVELING, 'site:1', 'site:2', 'site:3',
    ]);
  });
  it('keeps a typed position so it can still be shown', () => {
    expect(placeChoices(SITES, 'position:EOC radio room')).toContain('position:EOC radio room');
  });
});

describe('applyPlaceChoice', () => {
  it('puts the site in Location without touching the saved town', () => {
    const next = applyPlaceChoice(form({ location: 'Gorham, ME' }), 'site:2', SITES, 'Gorham, ME');
    expect(next).toMatchObject({ coverage_site_id: 2, operating_position: 'Bonny Eagle HS', location: 'Bonny Eagle HS, Standish, ME' });
  });
  it('puts the saved town back for Home', () => {
    const atSite = applyPlaceChoice(form(), 'site:2', SITES, 'Gorham, ME');
    expect(applyPlaceChoice(atSite, 'position:Home', SITES, 'Gorham, ME'))
      .toMatchObject({ coverage_site_id: null, operating_position: 'Home', location: 'Gorham, ME' });
  });
  it('keeps a typed location for Home', () => {
    expect(applyPlaceChoice(form({ location: 'Buxton' }), 'position:Home', SITES, 'Gorham, ME').location).toBe('Buxton');
  });
  it('Traveling sets Mobile and drops the site address', () => {
    const atSite = applyPlaceChoice(form(), 'site:2', SITES, undefined);
    expect(applyPlaceChoice(atSite, TRAVELING, SITES, undefined))
      .toMatchObject({ status: 'mobile', coverage_site_id: null, location: '' });
  });
  it('picking a place for a Mobile station means it arrived', () => {
    expect(applyPlaceChoice(form({ status: 'mobile' }), 'site:1', SITES, undefined).status).toBe('checked_in');
    expect(applyPlaceChoice(form({ status: 'listening' }), 'site:1', SITES, undefined).status).toBe('listening');
  });
});

describe('buildSiteBoard', () => {
  const rows = [
    { id: 1, callsign: 'K1ONE', coverage_site_id: 2, operating_position: 'Bonny Eagle HS', status: 'checked_out', checked_in_at: '1' },
    { id: 2, callsign: 'K1ONE', coverage_site_id: 1, operating_position: 'Windham EMA', status: 'checked_in', checked_in_at: '2' },
    { id: 3, callsign: 'K1TWO', operating_position: 'Home', status: 'checked_in', checked_in_at: '3' },
    { id: 4, callsign: 'K1SIX', status: 'checked_in', checked_in_at: '4' },
    { id: 5, callsign: 'K1CAR', coverage_site_id: 2, status: 'mobile', checked_in_at: '5' },
  ];

  it('live: newest live row per station, working sites shown even when empty', () => {
    const board = buildSiteBoard(rows, SITES, true);
    expect(board.map((g) => [g.label, g.stations.map((s) => s.callsign)])).toEqual([
      ['Windham EMA', ['K1ONE']],
      ['Bonny Eagle HS', []],
      ['Traveling', ['K1CAR']],
      ['Home', ['K1TWO']],
      ['Not at a site', ['K1SIX']],
    ]);
  });

  it('record: every row, so a station that moved shows at each place', () => {
    const board = buildSiteBoard(rows, SITES, false);
    expect(board.find((g) => g.label === 'Bonny Eagle HS')?.stations.map((s) => s.callsign)).toEqual(['K1ONE']);
    expect(board.find((g) => g.label === 'Windham EMA')?.stations.map((s) => s.callsign)).toEqual(['K1ONE']);
  });
});

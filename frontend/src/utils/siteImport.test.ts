import { describe, expect, it } from 'vitest';
import { guessColumns, guessHeaderRow, mergeImportedSites, readImportedSites } from './siteImport';
import { draftsToPayload, newSiteDraft, siteToDraft } from './siteDrafts';

// The two layouts Cumberland County EMA sent for the 2026 SET.
const SHELTER_HEADERS = ['Name', 'Municipality', 'Address', 'Emergency Capacity', 'Long term Capacity', 'Generator', 'OPS Plan status', 'Reviewed'];
const POD_HEADERS = ['SITE NAME', 'LOCATION', 'CITY', 'LAT.', 'LONG.', 'POC, Notes'];

describe('guessColumns', () => {
  it('reads a shelter list', () => {
    expect(guessColumns(SHELTER_HEADERS)).toEqual({
      name: 0, town: 1, address: 2, state: null, latitude: null, longitude: null, notes: null,
    });
  });

  it('reads a point-of-distribution list', () => {
    expect(guessColumns(POD_HEADERS)).toEqual({
      name: 0, address: 1, town: 2, state: null, latitude: 3, longitude: 4, notes: 5,
    });
  });
});

describe('guessHeaderRow', () => {
  it('skips a title line above the table', () => {
    expect(guessHeaderRow([['Cumberland County Shelters'], [], SHELTER_HEADERS])).toBe(2);
  });
});

describe('readImportedSites', () => {
  const rows = [
    POD_HEADERS,
    ['Gray Fire Station', '1 Main St', 'Gray', '43.88', '-70.33', 'Chief Doe, 555-0100'],
    ['', 'no name here', 'Gray', '', '', ''],
    ['', '', '', '', '', ''],
  ];

  it('builds the place from the town and a default state, and keeps the rest', () => {
    const { sites, skipped } = readImportedSites(rows, 0, guessColumns(POD_HEADERS), 'ME');
    expect(skipped).toBe(1);
    expect(sites).toEqual([{
      name: 'Gray Fire Station', location: 'Gray, ME', address: '1 Main St',
      latitude: '43.88', longitude: '-70.33', notes: 'Chief Doe, 555-0100', details: null,
    }]);
  });

  it('keeps unmapped columns as details', () => {
    const { sites } = readImportedSites(
      [SHELTER_HEADERS, ['Bonny Eagle HS', 'Standish', '1 Eagle Way', '150', '75', 'Yes', 'Draft', '']],
      0, guessColumns(SHELTER_HEADERS), 'ME',
    );
    expect(sites[0].details).toEqual({
      'Emergency Capacity': '150', 'Long term Capacity': '75', Generator: 'Yes', 'OPS Plan status': 'Draft',
    });
  });
});

describe('mergeImportedSites', () => {
  const imported = readImportedSites(
    [POD_HEADERS, ['Smith, J. School', '2 Elm St', 'Gray', '', '', ''], ['Town Hall', '', 'Gray', '', '', 'Updated']],
    0, guessColumns(POD_HEADERS), 'ME',
  ).sites;

  it('updates a matching site and adds the rest, unsupported', () => {
    const existing = siteToDraft({
      id: 3, net_id: 1, name: 'Town Hall', location: 'Gray, ME', site_type: 'office', is_primary: true,
      sort_order: 0, frequency_id: null, is_supported: true, in_use: true,
    });
    const { drafts, added, updated } = mergeImportedSites([existing, newSiteDraft()], imported, 'pod', false);
    expect([added, updated]).toEqual([1, 1]);
    const payload = draftsToPayload(drafts);
    expect(payload[0]).toMatchObject({ id: 3, name: 'Town Hall', site_type: 'pod', is_primary: true, is_supported: true, notes: 'Updated' });
    // A comma in the name survives, since the line isn't re-split.
    expect(payload[1]).toMatchObject({ name: 'Smith, J. School', location: 'Gray, ME', is_supported: false, address: '2 Elm St' });
  });

  it('keeps the last of two rows for the same site', () => {
    const twice = [imported[1], { ...imported[1], notes: 'Second' }];
    const { drafts, added } = mergeImportedSites([], twice, 'pod', false);
    expect(added).toBe(1);
    expect(drafts[0].notes).toBe('Second');
  });
});

describe('draftsToPayload', () => {
  it('sends coordinates only when both are numbers', () => {
    const [half, both] = draftsToPayload([
      newSiteDraft({ line: 'A, Gray, ME', latitude: '43.8', longitude: 'west' }),
      newSiteDraft({ line: 'B, Gray, ME', latitude: '43.8', longitude: '-70.3' }),
    ]);
    expect([half.latitude, half.longitude]).toEqual([null, null]);
    expect([both.latitude, both.longitude]).toEqual([43.8, -70.3]);
  });
});

// ========== SITE LIST IMPORT ==========
// Turning an EMA's spreadsheet (a shelter or point-of-distribution list) into
// coverage sites. The backend only reads the file into rows of text
// (POST /nets/{id}/coverage-sites/read-file); everything here is the mapping
// a person confirms in components/forms/ImportSitesDialog.tsx. Every EMA lays
// its list out differently, so columns are guessed from the headings and the
// person corrects them.

import { SiteType, formatSiteLine } from './coverageSites';
import { SiteDraft, draftNameAndLocation, newSiteDraft, siteMatchKey } from './siteDrafts';

export type ImportField = 'name' | 'address' | 'town' | 'state' | 'latitude' | 'longitude' | 'notes';

export const IMPORT_FIELDS: { field: ImportField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'address', label: 'Address' },
  { field: 'town', label: 'Town' },
  { field: 'state', label: 'State' },
  { field: 'latitude', label: 'Latitude' },
  { field: 'longitude', label: 'Longitude' },
  { field: 'notes', label: 'Notes' },
];

export type ColumnMap = Record<ImportField, number | null>;

// Headings seen on real lists: "Name", "SITE NAME", "Municipality", "CITY",
// "LOCATION" (a street address on a POD list), "LAT.", "LONG.", "POC, Notes".
const GUESSES: [ImportField, RegExp][] = [
  ['latitude', /^lat(itude)?\.?$/i],
  ['longitude', /^(long?|lng)(itude)?\.?$/i],
  ['state', /^(state|st)\.?$/i],
  ['town', /municipality|city|town/i],
  ['address', /address|street|location/i],
  ['notes', /notes?|poc|contact/i],
  ['name', /name|^site$|facility/i],
];

export function guessColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = { name: null, address: null, town: null, state: null, latitude: null, longitude: null, notes: null };
  headers.forEach((h, i) => {
    const text = h.trim();
    if (!text) return;
    const hit = GUESSES.find(([field, re]) => map[field] == null && re.test(text));
    if (hit) map[hit[0]] = i;
  });
  return map;
}

// The first row that reads like headings: two or more filled cells. A title
// line above the table ("Cumberland County Shelters 2026") has one.
export function guessHeaderRow(rows: string[][]): number {
  const i = rows.slice(0, 10).findIndex((r) => r.filter((c) => c.trim()).length >= 2);
  return i < 0 ? 0 : i;
}

export interface ImportedSite {
  name: string;
  location: string | null;
  address: string;
  latitude: string;
  longitude: string;
  notes: string;
  details: Record<string, string> | null;
}

// Limits match backend schemas.py::CoverageSiteItem.
const MAX_DETAILS = 40;
const cut = (text: string, n: number) => (text.length > n ? text.slice(0, n) : text);

export function readImportedSites(
  rows: string[][], headerRow: number, map: ColumnMap, defaultState: string,
): { sites: ImportedSite[]; skipped: number } {
  const headers = rows[headerRow] || [];
  const mapped = new Set(Object.values(map).filter((v): v is number => v != null));
  // Every other column with a heading is kept as a detail.
  const detailColumns: { index: number; label: string }[] = [];
  const used = new Set<string>();
  headers.forEach((h, index) => {
    const base = cut(h.trim(), 90);
    if (!base || mapped.has(index) || detailColumns.length >= MAX_DETAILS) return;
    let label = base;
    for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} (${n})`;
    used.add(label.toLowerCase());
    detailColumns.push({ index, label });
  });

  const cell = (row: string[], index: number | null) => (index == null ? '' : (row[index] || '').trim());
  const sites: ImportedSite[] = [];
  let skipped = 0;
  rows.slice(headerRow + 1).forEach((row) => {
    const name = cut(cell(row, map.name), 100);
    if (!name) {
      if (row.some((c) => c.trim())) skipped += 1;
      return;
    }
    const town = cell(row, map.town);
    const state = cell(row, map.state) || defaultState.trim();
    const location = cut([town, state].filter(Boolean).join(', '), 255) || null;
    const details: Record<string, string> = {};
    detailColumns.forEach(({ index, label }) => {
      const value = cut(cell(row, index), 1000);
      if (value) details[label] = value;
    });
    sites.push({
      name,
      location,
      address: cut(cell(row, map.address), 255),
      latitude: cell(row, map.latitude),
      longitude: cell(row, map.longitude),
      notes: cut(cell(row, map.notes), 4000),
      details: Object.keys(details).length ? details : null,
    });
  });
  return { sites, skipped };
}

// Adds the imported sites to the editor's list. A site with the same name and
// place as one already there is updated rather than added twice, keeping its
// star, whether it's supported, and every check-in at it; a list that names
// the same site twice keeps its last row.
export function mergeImportedSites(
  drafts: SiteDraft[], imported: ImportedSite[], siteType: SiteType, supported: boolean,
): { drafts: SiteDraft[]; added: number; updated: number } {
  const result = [...drafts];
  const byKey = new Map<string, number>();
  result.forEach((d, i) => {
    const { name, location } = draftNameAndLocation(d);
    if (d.line.trim()) byKey.set(siteMatchKey(name, location), i);
  });
  const touched = new Set<number>();
  const fresh = new Set<number>();
  imported.forEach((s) => {
    const fields = {
      site_type: siteType,
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      notes: s.notes,
      details: s.details,
    };
    const key = siteMatchKey(s.name, s.location);
    const at = byKey.get(key);
    if (at != null) {
      result[at] = { ...result[at], ...fields };
      if (!fresh.has(at)) touched.add(at);
      return;
    }
    byKey.set(key, result.length);
    fresh.add(result.length);
    result.push(newSiteDraft({
      ...fields,
      line: formatSiteLine(s.name, s.location),
      saved: { name: s.name, location: s.location },
      is_supported: supported,
    }));
  });
  return { drafts: result, added: fresh.size, updated: touched.size };
}

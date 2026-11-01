import { CoverageSite, SITE_TYPE_LABELS, SiteType, formatSiteLine, reportingSites } from './coverageSites';

// ========== WHERE A STATION IS ==========
// The Site box on the check-in form, and the board that groups stations by
// it. Mirrors backend services/station_place.py, which decides the same
// things server-side (moves, saved towns). A row's place is:
// - traveling: its status is Mobile (wins over a site it has left)
// - one of the net's sites: coverage_site_id, with the site's name as the
//   operating position, the pairing the can-hear dialog also records
// - a position with no site: "Home", "Field Deployed", or text typed in
//   the can-hear dialog
// - unknown
// Location stays separate: the station's usual town, or at a site the
// site's own place. Kept free of React for stationPlace.test.ts.

// Positions offered without a site. Shared with the can-hear dialog.
export const POSITION_OPTIONS = ['Home', 'Field Deployed'];
export const TRAVELING = 'traveling';

interface PlaceFields {
  coverage_site_id?: number | null;
  operating_position?: string | null;
  status?: string | null;
}

export const isHomePosition = (position?: string | null) => (position || '').toLowerCase().includes('home');

// The Site box's value for a form or row: 'traveling', 'site:<id>',
// 'position:<text>', or null.
export function placeChoice(row: PlaceFields): string | null {
  if ((row.status || '').toLowerCase() === 'mobile') return TRAVELING;
  if (row.coverage_site_id != null) return `site:${row.coverage_site_id}`;
  const position = (row.operating_position || '').trim();
  return position ? `position:${position}` : null;
}

/**
 * One station at one place, the same key as the backend's
 * services/station_place.py::station_place_key: its callsign and place, or,
 * when the place is unknown, the location typed for it. Rows with the same
 * key are the same station in the same spot, whatever channel each was on.
 */
export function stationPlaceKey(row: PlaceFields & { callsign?: string | null; location?: string | null }): string {
  const choice = placeChoice(row);
  let place = '';
  if (choice) place = choice.toLowerCase();
  else if ((row.location || '').trim()) place = `location:${(row.location || '').trim().toLowerCase()}`;
  return `${(row.callsign || '').trim().toUpperCase()}|${place}`;
}

export function placeChoiceLabel(choice: string, sites: CoverageSite[]): string {
  if (choice === TRAVELING) return 'Traveling';
  const [kind, ...rest] = choice.split(':');
  const value = rest.join(':');
  if (kind === 'site') return sites.find((s) => s.id === Number(value))?.name ?? 'Site';
  return value;
}

// The Site box's options: Home, Field Deployed, Traveling, then the net's
// sites by type (the drop-down groups them), plus whatever the form already
// holds (a position typed in the can-hear dialog) so it can still be shown.
export function placeChoices(sites: CoverageSite[], current: string | null): string[] {
  const typeOrder = Object.keys(SITE_TYPE_LABELS) as SiteType[];
  const byType = reportingSites(sites)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => typeOrder.indexOf(a.s.site_type) - typeOrder.indexOf(b.s.site_type) || a.i - b.i);
  const positions = POSITION_OPTIONS.map((p) => `position:${p}`);
  if (current?.startsWith('position:') && !positions.includes(current)) positions.push(current);
  return [...positions, TRAVELING, ...byType.map(({ s }) => `site:${s.id}`)];
}

// The form after picking a place. savedTown is what the callsign lookup
// filled in (the station's usual town). A site fills Location with its own
// place; leaving a site puts the usual town back for Home, and clears it
// otherwise, so a shelter's address never rides along to somewhere else.
// Picking a place for a Mobile station means it has arrived.
export function applyPlaceChoice<T extends PlaceFields & { location?: string }>(
  form: T,
  choice: string | null,
  sites: CoverageSite[],
  savedTown: string | undefined,
): T {
  const next: T = { ...form };
  const location = (form.location || '').trim();
  const heldSiteLine = sites.some((s) => formatSiteLine(s.name, s.location) === location);
  const arrived = (form.status || '').toLowerCase() === 'mobile' ? 'checked_in' : form.status;

  if (choice === TRAVELING) {
    return { ...next, status: 'mobile', coverage_site_id: null, operating_position: '',
      location: heldSiteLine ? '' : form.location };
  }
  if (choice?.startsWith('site:')) {
    const site = sites.find((s) => s.id === Number(choice.slice(5)));
    if (site) {
      return { ...next, status: arrived, coverage_site_id: site.id, operating_position: site.name,
        location: formatSiteLine(site.name, site.location) };
    }
  }
  const position = choice?.startsWith('position:') ? choice.slice(9) : '';
  const fillHome = isHomePosition(position) && (heldSiteLine || !location);
  return {
    ...next,
    status: arrived,
    coverage_site_id: null,
    operating_position: position,
    location: fillHome ? (savedTown || '') : heldSiteLine ? '' : form.location,
  };
}

// ========== THE BOARD ==========
// Stations grouped by place: the net's sites in the manager's order, then
// Traveling, Home and other positions, then Not at a site. Live mode is the
// tag-out board: one entry per callsign (its newest live row), and every
// site the net is working shows even with nobody there yet. Otherwise it's
// the record: every row, and only places somebody was.

export interface BoardStation {
  checkInId: number;
  callsign: string;
  name?: string | null;
  location?: string | null;
}

export interface BoardGroup {
  key: string;
  kind: 'site' | 'traveling' | 'position' | 'none';
  label: string;
  detail?: string | null;
  stations: BoardStation[];
}

interface BoardRow extends PlaceFields {
  id: number;
  callsign: string;
  name?: string | null;
  location?: string | null;
  checked_in_at?: string | null;
}

export function buildSiteBoard(rows: BoardRow[], sites: CoverageSite[], live: boolean): BoardGroup[] {
  const places = reportingSites(sites);
  let picked = rows;
  if (live) {
    const newest = new Map<string, BoardRow>();
    for (const row of rows) {
      if ((row.status || '').toLowerCase() === 'checked_out') continue;
      const key = row.callsign.toUpperCase();
      const held = newest.get(key);
      if (!held || (row.checked_in_at || '') >= (held.checked_in_at || '')) newest.set(key, row);
    }
    picked = Array.from(newest.values());
  }

  const groups = new Map<string, BoardGroup>();
  for (const site of places) {
    if (live && site.in_use) {
      groups.set(`site:${site.id}`, { key: `site:${site.id}`, kind: 'site', label: site.name, detail: site.location, stations: [] });
    }
  }
  const siteIds = new Set(places.map((s) => s.id));
  for (const row of picked) {
    let choice = placeChoice(row);
    // A site since removed from the net counts as no site.
    if (choice?.startsWith('site:') && !siteIds.has(Number(choice.slice(5)))) choice = null;
    const key = choice ?? 'none';
    if (!groups.has(key)) {
      const site = choice?.startsWith('site:') ? places.find((s) => `site:${s.id}` === choice) : undefined;
      groups.set(key, {
        key,
        kind: site ? 'site' : choice === TRAVELING ? 'traveling' : choice ? 'position' : 'none',
        label: site ? site.name : choice ? placeChoiceLabel(choice, sites) : 'Not at a site',
        detail: site?.location,
        stations: [],
      });
    }
    // Once per callsign per place: two frequencies from one site are one station there.
    const group = groups.get(key)!;
    if (!group.stations.some((st) => st.callsign.toUpperCase() === row.callsign.toUpperCase())) {
      group.stations.push({ checkInId: row.id, callsign: row.callsign, name: row.name, location: row.location });
    }
  }

  const siteOrder = new Map(places.map((s, i) => [`site:${s.id}`, i]));
  const rank = (g: BoardGroup) => {
    if (g.kind === 'site') return [0, siteOrder.get(g.key) ?? 0, ''] as const;
    if (g.kind === 'traveling') return [1, 0, ''] as const;
    if (g.kind === 'position') return [2, isHomePosition(g.label) ? 0 : 1, g.label.toLowerCase()] as const;
    return [3, 0, ''] as const;
  };
  return Array.from(groups.values()).sort((a, b) => {
    const [a0, a1, a2] = rank(a);
    const [b0, b1, b2] = rank(b);
    return a0 - b0 || a1 - b1 || a2.localeCompare(b2);
  });
}

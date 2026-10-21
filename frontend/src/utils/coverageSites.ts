// ========== COVERAGE SITES ==========
// Shared types and rules for coverage drills (an ARES SET): the sites a net
// is testing, contacts outside the net, and the by-site rollup the backend
// computes (backend/app/services/site_coverage.py). Kept free of React so the
// rules are unit-testable (coverageSites.test.ts).

export interface CoverageSite {
  id: number;
  net_id: number;
  name: string;
  location: string | null;
  site_type: SiteType;
  is_primary: boolean;
  sort_order: number;
  // Repeaters and nodes only: the net frequency it's on, if one of them.
  frequency_id: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // A site the net's teams staff. An EMA's full list is imported with most
  // sites unsupported, and those are shown only to net staff.
  is_supported: boolean;
  // Supported, primary, a repeater or node, or someone checked in there
  // (backend services/site_coverage.py::coverage_site_in_use).
  in_use: boolean;
  // Net staff only; null for everyone else.
  notes?: string | null;
  details?: Record<string, string> | null;
}

// A repeater, packet node or Winlink gateway is "infrastructure": sites try
// to get into it, nobody reports from it.
export type SiteType = 'office' | 'shelter' | 'pod' | 'staging' | 'hospital' | 'other' | 'infrastructure';

export interface CoverageAccess {
  id: number;
  net_id: number;
  reporter_check_in_id: number;
  target_site_id: number;
  reached: boolean;
  note: string | null;
}

export interface CoverageContact {
  id: number;
  net_id: number;
  reporter_check_in_id: number;
  frequency_id: number | null;
  callsign: string | null;
  station: string | null;
  county: string | null;
  state: string | null;
  two_way: boolean;
  reported_by_user_id: number | null;
  reported_at: string | null;
}

export interface SiteCoverageNode {
  key: string;
  kind: 'site' | 'station';
  name: string;
  site_id: number | null;
  site_type: SiteType | null;
  is_primary: boolean;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  callsigns: string[];
}

export interface SiteCoverageLink {
  from_key: string;
  to_key: string;
  frequency_id: number | null;
  two_way: boolean;
}

export type ReachStatus = 'two_way' | 'relay' | 'one_way' | 'none';

export interface SiteReachTarget {
  primary_key: string;
  status: ReachStatus;
  two_way_frequency_ids: (number | null)[];
  one_way_frequency_ids: (number | null)[];
  relay_keys: string[];
}

export interface SiteCoverageSummary {
  nodes: SiteCoverageNode[];
  links: SiteCoverageLink[];
  reach: { site_key: string; targets: SiteReachTarget[] }[];
  contacts: {
    id: number; from_key: string; reporter_callsign: string; frequency_id: number | null;
    callsign: string | null; station: string | null; county: string | null; state: string | null; two_way: boolean;
  }[];
  counties: { county: string; state: string | null; from_keys: string[]; frequency_ids: (number | null)[]; two_way: boolean }[];
  targets: { site_id: number; name: string; location: string | null; latitude?: number | null; longitude?: number | null; frequency_id: number | null }[];
  // One cell per (node, repeater/node) someone at the node tried.
  access: { node_key: string; target_site_id: number; reached: boolean; attempts: { callsign: string; reached: boolean; note: string | null }[] }[];
}

export const EMPTY_SITE_COVERAGE: SiteCoverageSummary = { nodes: [], links: [], reach: [], contacts: [], counties: [], targets: [], access: [] };

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  office: 'Official office',
  shelter: 'Shelter',
  pod: 'Point of distribution (POD)',
  staging: 'Staging area',
  hospital: 'Hospital',
  other: 'Other',
  infrastructure: 'Repeater or node',
};

// Places operators report from, as opposed to the repeaters and nodes they
// try to get into.
export const reportingSites = (sites: CoverageSite[]) => sites.filter((s) => s.site_type !== 'infrastructure');
export const infrastructureSites = (sites: CoverageSite[]) => sites.filter((s) => s.site_type === 'infrastructure');

export const REACH_STATUS_LABELS: Record<ReachStatus, string> = {
  two_way: 'Two-way',
  relay: 'Through a relay',
  one_way: 'One-way only',
  none: 'No path',
};

const GRID = /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2})?)?$/i;

export interface ParsedSiteLine {
  name: string;
  location: string | null;
}

// A site typed as one line: "Bonny Eagle HS, Standish, ME" (name, then the
// town and state after the first comma) or "Gray NWS FN43rv" (a grid square
// at the end, with or without a comma before it). No comma and no grid means
// there's no way to tell where the name ends, so location is null and the
// editor asks for a comma.
export function parseSiteLine(line: string): ParsedSiteLine {
  const trimmed = line.trim().replace(/\s+/g, ' ');
  const tokens = trimmed.split(' ');
  const last = tokens[tokens.length - 1] || '';
  if (tokens.length > 1 && GRID.test(last)) {
    return { name: tokens.slice(0, -1).join(' ').replace(/,\s*$/, '').trim(), location: last };
  }
  const comma = trimmed.indexOf(',');
  if (comma > 0) {
    const location = trimmed.slice(comma + 1).trim();
    return { name: trimmed.slice(0, comma).trim(), location: location || null };
  }
  return { name: trimmed, location: null };
}

// The inverse, and also what a check-in at the site gets as its location.
// Mirrors backend services/site_coverage.py::site_line.
export function formatSiteLine(name: string, location: string | null | undefined): string {
  const loc = (location || '').trim();
  if (!loc) return name;
  return GRID.test(loc) ? `${name} ${loc}` : `${name}, ${loc}`;
}

// Where the map puts a site: its coordinates when the list had them, since
// a POD list's "Fire Station, Gray" may not geocode; otherwise the site line.
// utils/locationParser.ts reads a bare "lat, lon" as GPS.
export function siteMapLocation(site: { name: string; location: string | null; latitude?: number | null; longitude?: number | null }): string | null {
  if (site.latitude != null && site.longitude != null) return `${site.latitude}, ${site.longitude}`;
  return site.location ? formatSiteLine(site.name, site.location) : null;
}

// The net's frequencies that collect coverage reports: all of them, less the
// repeaters and talkgroups the manager excluded (Net.coverage_excluded_frequency_ids).
export function coverageFrequencies<F extends { id: number }>(net: { frequencies?: F[]; coverage_excluded_frequency_ids?: number[] | null } | null | undefined): F[] {
  const excluded = new Set(net?.coverage_excluded_frequency_ids || []);
  return (net?.frequencies || []).filter((f) => !excluded.has(f.id));
}

// The site a check-in is at, shown under its callsign: the same callsign can
// appear twice in a coverage list once an operator rechecks from a second
// site, so the site tells the two visits apart.
export function stationSiteName(checkIn: { coverage_site_id?: number | null }, sitesById: Map<number, CoverageSite>): string | null {
  const site = checkIn.coverage_site_id != null ? sitesById.get(checkIn.coverage_site_id) : undefined;
  return site ? site.name : null;
}

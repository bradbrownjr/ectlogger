// ========== COVERAGE SITE DRAFTS ==========
// The net form's editable copy of its coverage sites
// (components/forms/CoverageSitesEditor.tsx), and what it sends to
// PUT /nets/{id}/coverage-sites. Kept free of React so the round trip and the
// spreadsheet merge (utils/siteImport.ts) are unit-testable.

import { CoverageSite, SiteType, formatSiteLine, parseSiteLine } from './coverageSites';

export interface SiteDraft {
  key: string;
  id?: number;
  line: string;
  // The name and place as loaded or imported. A spreadsheet name can hold a
  // comma ("Smith, J. School"), which re-splitting the line would cut, so
  // the line is only re-split once someone edits it.
  saved?: { name: string; location: string | null };
  site_type: SiteType;
  is_primary: boolean;
  frequency_id: number | null;
  is_supported: boolean;
  address: string;
  // Text while editing; sent only when both are numbers.
  latitude: string;
  longitude: string;
  notes: string;
  details: Record<string, string> | null;
}

let draftCounter = 0;
export const newSiteDraft = (patch: Partial<SiteDraft> = {}): SiteDraft => ({
  key: `new-${++draftCounter}`,
  line: '',
  site_type: 'shelter',
  is_primary: false,
  frequency_id: null,
  is_supported: true,
  address: '',
  latitude: '',
  longitude: '',
  notes: '',
  details: null,
  ...patch,
});

export const siteToDraft = (site: CoverageSite): SiteDraft => ({
  key: `site-${site.id}`,
  id: site.id,
  line: formatSiteLine(site.name, site.location),
  saved: { name: site.name, location: site.location },
  site_type: site.site_type,
  is_primary: site.is_primary,
  frequency_id: site.frequency_id,
  is_supported: site.is_supported,
  address: site.address || '',
  latitude: site.latitude != null ? String(site.latitude) : '',
  longitude: site.longitude != null ? String(site.longitude) : '',
  notes: site.notes || '',
  details: site.details && Object.keys(site.details).length ? site.details : null,
});

export function draftNameAndLocation(d: Pick<SiteDraft, 'line' | 'saved'>): { name: string; location: string | null } {
  if (d.saved && d.line === formatSiteLine(d.saved.name, d.saved.location)) return d.saved;
  return parseSiteLine(d.line);
}

const coordinate = (text: string, limit: number): number | null => {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

export function draftCoordinates(d: Pick<SiteDraft, 'latitude' | 'longitude'>): { latitude: number; longitude: number } | null {
  const latitude = coordinate(d.latitude, 90);
  const longitude = coordinate(d.longitude, 180);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

export interface CoverageSitePayload {
  id?: number;
  name: string;
  location: string | null;
  site_type: SiteType;
  is_primary: boolean;
  frequency_id: number | null;
  is_supported: boolean;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  details: Record<string, string> | null;
}

// What PUT /nets/{id}/coverage-sites takes. Blank rows are dropped.
export const draftsToPayload = (drafts: SiteDraft[]): CoverageSitePayload[] =>
  drafts
    .filter((d) => d.line.trim())
    .map((d) => {
      const { name, location } = draftNameAndLocation(d);
      const infrastructure = d.site_type === 'infrastructure';
      const coords = draftCoordinates(d);
      return {
        ...(d.id ? { id: d.id } : {}),
        name,
        location,
        site_type: d.site_type,
        is_primary: infrastructure ? false : d.is_primary,
        frequency_id: infrastructure ? d.frequency_id : null,
        is_supported: d.is_supported,
        address: d.address.trim() || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        notes: d.notes.trim() || null,
        details: d.details,
      };
    });

// Name and place, ignoring case: the backend refuses two sites with the
// same pair, and an import updates the site it matches.
export const siteMatchKey = (name: string, location: string | null) =>
  `${name.trim().toLowerCase()}|${(location || '').trim().toLowerCase()}`;

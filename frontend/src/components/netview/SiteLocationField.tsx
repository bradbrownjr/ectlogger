import React from 'react';
import { Autocomplete, Popper, PopperProps, TextField, TextFieldProps } from '@mui/material';
import { CoverageSite, SITE_TYPE_LABELS, SiteType, formatSiteLine, reportingSites } from '../../utils/coverageSites';

// ========== LOCATION FIELD WITH COVERAGE SITES ==========
// The check-in form's Location field. On a net with coverage sites (a drill
// such as an ARES SET) it also offers the sites: picking one fills in the
// site as the location ("Bonny Eagle HS, Standish, ME", which still places on
// the map) and puts the check-in at that site (coverage_site_id). Anything
// else typed is an ordinary location with no site. Without sites it is the
// plain text field it always was.
//
// The site comes from the text, so the two can't disagree: editing the
// location away from a site's line takes the station off that site.
//
// Sites are grouped by type, since an imported EMA list can run to hundreds.
// Net staff get every site; everyone else only the sites in use
// (backend routers/coverage_sites.py::list_coverage_sites).

interface SiteLocationFieldProps {
  sites: CoverageSite[];
  value: string;
  onChange: (location: string, coverageSiteId: number | null) => void;
  textFieldProps?: TextFieldProps;
}

export function siteIdForLocation(sites: CoverageSite[], location: string): number | null {
  const text = location.trim().toLowerCase();
  if (!text) return null;
  const site = reportingSites(sites).find((s) => formatSiteLine(s.name, s.location).toLowerCase() === text);
  return site ? site.id : null;
}

// The check-in table's inline Location box is narrow, and a list as wide as
// the box wraps "Example County EOC, Windham, ME" a letter per line. The
// list sizes to its sites instead, never narrower than the box.
const SiteListPopper: React.FC<PopperProps> = ({ style, ...props }) => (
  <Popper
    {...props}
    placement="bottom-start"
    style={{ ...style, width: 'max-content', minWidth: style?.width, maxWidth: 'calc(100vw - 32px)' }}
  />
);

const SiteLocationField: React.FC<SiteLocationFieldProps> = ({ sites, value, onChange, textFieldProps }) => {
  const places = reportingSites(sites);
  if (places.length === 0) {
    return (
      <TextField
        {...textFieldProps}
        value={value}
        onChange={(e) => onChange(e.target.value, null)}
      />
    );
  }
  const typeOrder = Object.keys(SITE_TYPE_LABELS) as SiteType[];
  const sorted = [...places].sort((a, b) => typeOrder.indexOf(a.site_type) - typeOrder.indexOf(b.site_type));
  const options = sorted.map((s) => formatSiteLine(s.name, s.location));
  const typeByLine = new Map(sorted.map((s) => [formatSiteLine(s.name, s.location), s.site_type]));
  const grouped = new Set(sorted.map((s) => s.site_type)).size > 1;
  return (
    <Autocomplete
      freeSolo
      options={options}
      groupBy={grouped ? (line) => SITE_TYPE_LABELS[typeByLine.get(line) ?? 'other'] : undefined}
      inputValue={value}
      onInputChange={(_, text) => onChange(text, siteIdForLocation(sites, text))}
      fullWidth={textFieldProps?.fullWidth}
      PopperComponent={SiteListPopper}
      renderInput={(params) => (
        <TextField
          {...textFieldProps}
          {...params}
          inputProps={{ ...params.inputProps, ...(textFieldProps?.inputProps || {}) }}
          helperText={textFieldProps?.helperText ?? (siteIdForLocation(sites, value) ? 'At this site' : undefined)}
        />
      )}
    />
  );
};

export default SiteLocationField;

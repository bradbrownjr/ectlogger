import React from 'react';
import { Autocomplete, Box, createFilterOptions, Popper, PopperProps, TextField, TextFieldProps, Typography } from '@mui/material';
import { CoverageSite, SITE_TYPE_LABELS, reportingSites } from '../../utils/coverageSites';
import { applyPlaceChoice, placeChoice, placeChoiceLabel, placeChoices } from '../../utils/stationPlace';

// ========== SITE FIELD ==========
// The check-in form's Site box, ahead of Location on a net with sites (a
// drill such as an ARES SET, an aid-station race). Picks where the station
// is: one of the net's sites, Home, Field Deployed, or Traveling (which is
// the Mobile status). It sets Location to match (a site's own place, or the
// station's usual town for Home), so net control never types a shelter into
// Location by hand and the saved town is left alone (utils/stationPlace.ts).
//
// A drop-down to pick from, not free text: a site typed slightly wrong would
// leave the station off it. Sites are grouped by type, since an imported
// EMA list can run to hundreds. Net staff get every site; everyone else
// only the sites in use (backend routers/coverage_sites.py).

interface SiteFieldProps<T> {
  sites: CoverageSite[];
  form: T;
  setForm: (updater: (prev: T) => T) => void;
  // The station's usual town, from the callsign lookup. Home fills it in.
  savedTown?: string;
  textFieldProps?: TextFieldProps;
  // A narrow inline row: no drop-down arrow, so the box shows the site's name.
  compact?: boolean;
}

// The check-in table's inline box is narrow; the list sizes to its sites
// instead, never narrower than the box.
const SiteListPopper: React.FC<PopperProps> = ({ style, ...props }) => (
  <Popper
    {...props}
    placement="bottom-start"
    style={{ ...style, width: 'max-content', minWidth: style?.width, maxWidth: 'calc(100vw - 32px)' }}
  />
);

// Whether a net's check-in form shows the Site box at all.
export const netHasSites = (sites: CoverageSite[]) => reportingSites(sites).length > 0;

function SiteField<T extends { coverage_site_id?: number | null; operating_position?: string | null; status?: string; location?: string }>(
  { sites, form, setForm, savedTown, textFieldProps, compact }: SiteFieldProps<T>,
) {
  const current = placeChoice(form);
  const options = placeChoices(sites, current);
  const siteById = new Map(reportingSites(sites).map((s) => [`site:${s.id}`, s]));
  // Home, Field Deployed and Traveling first under one heading, then the
  // sites by type. (Not "Not at a site": the board uses that for a station
  // with no place at all.)
  const group = (choice: string) => {
    const site = siteById.get(choice);
    return site ? SITE_TYPE_LABELS[site.site_type] : 'Other places';
  };
  return (
    <Autocomplete
      options={options}
      value={current}
      onChange={(_, choice) => setForm((prev) => applyPlaceChoice(prev, choice, sites, savedTown))}
      getOptionLabel={(choice) => placeChoiceLabel(choice, sites)}
      groupBy={group}
      // A site's town under its name, so two "Fire Station"s can be told apart.
      // Typing a town finds the sites in it.
      filterOptions={createFilterOptions({
        stringify: (choice: string) => `${placeChoiceLabel(choice, sites)} ${siteById.get(choice)?.location ?? ''}`,
      })}
      renderOption={({ key: _key, ...props }: React.HTMLAttributes<HTMLLIElement> & { key?: React.Key }, choice) => {
        const site = siteById.get(choice);
        return (
          <Box component="li" {...props} key={choice} sx={{ flexDirection: 'column', alignItems: 'flex-start !important' }}>
            <Typography variant="body2">{placeChoiceLabel(choice, sites)}</Typography>
            {site?.location && <Typography variant="caption" color="text.secondary">{site.location}</Typography>}
          </Box>
        );
      }}
      autoHighlight
      forcePopupIcon={!compact}
      fullWidth={textFieldProps?.fullWidth}
      PopperComponent={SiteListPopper}
      renderInput={(params) => (
        <TextField
          {...textFieldProps}
          {...params}
          inputProps={{ ...params.inputProps, ...(textFieldProps?.inputProps || {}) }}
        />
      )}
    />
  );
}

export default SiteField;

import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { CoverageSite, SITE_TYPE_LABELS, SiteType, formatSiteLine, parseSiteLine } from '../../utils/coverageSites';

// ========== COVERAGE SITES EDITOR ==========
// The net's list of sites for a coverage drill (an ARES SET): the shelters
// and offices teams report from, and the repeaters and nodes they try to get
// into. Shown under coverage logging on the net form (create-net/BasicInfoTab).
// Each site is typed as one line, "Name, Town, ST" or "Name GRID", and split
// as you type so a mistake shows before it's saved
// (utils/coverageSites.ts::parseSiteLine).
//
// Net-only for now; the list is shaped like the planned team "supported
// locations" (docs/concepts/TEAM-MANAGEMENT-NOTES.md section 5.6) so it can
// move to team settings later.

export interface SiteDraft {
  key: string;
  id?: number;
  line: string;
  site_type: SiteType;
  is_primary: boolean;
  frequency_id: number | null;
}

let draftCounter = 0;
export const newSiteDraft = (): SiteDraft => ({
  key: `new-${++draftCounter}`, line: '', site_type: 'shelter', is_primary: false, frequency_id: null,
});

export const siteToDraft = (site: CoverageSite): SiteDraft => ({
  key: `site-${site.id}`,
  id: site.id,
  line: formatSiteLine(site.name, site.location),
  site_type: site.site_type,
  is_primary: site.is_primary,
  frequency_id: site.frequency_id,
});

// What PUT /nets/{id}/coverage-sites takes. Blank rows are dropped.
export const draftsToPayload = (drafts: SiteDraft[]) =>
  drafts
    .filter((d) => d.line.trim())
    .map((d) => {
      const { name, location } = parseSiteLine(d.line);
      const infrastructure = d.site_type === 'infrastructure';
      return {
        ...(d.id ? { id: d.id } : {}),
        name,
        location,
        site_type: d.site_type,
        is_primary: infrastructure ? false : d.is_primary,
        frequency_id: infrastructure ? d.frequency_id : null,
      };
    });

interface CoverageSitesEditorProps {
  sites: SiteDraft[];
  setSites: React.Dispatch<React.SetStateAction<SiteDraft[]>>;
  // The net's frequencies, for tying a repeater or node to one.
  frequencies: { id?: number; frequency?: string; mode: string; network?: string; talkgroup?: string }[];
  disabled?: boolean;
}

const frequencyText = (f: CoverageSitesEditorProps['frequencies'][number]) =>
  [f.frequency || f.network, f.mode, f.talkgroup ? `TG ${f.talkgroup}` : ''].filter(Boolean).join(' ');

const CoverageSitesEditor: React.FC<CoverageSitesEditorProps> = ({ sites, setSites, frequencies, disabled }) => {
  const update = (key: string, patch: Partial<SiteDraft>) =>
    setSites((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <Box>
      <Typography variant="subtitle2">Sites</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        For a drill that tests where you can reach, not who: the offices and shelters teams operate from, and the
        repeaters and nodes they try. Type each as <strong>Name, Town, ST</strong> or <strong>Name</strong> plus a
        grid square. Star the offices every other site should reach.
      </Typography>

      {sites.map((site) => {
        const parsed = site.line.trim() ? parseSiteLine(site.line) : null;
        const infrastructure = site.site_type === 'infrastructure';
        return (
          <Box
            key={site.key}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr) auto auto', sm: 'minmax(0, 2.2fr) minmax(0, 1fr) auto auto' },
              gap: 1,
              alignItems: 'start',
              mb: 1.5,
            }}
          >
            <TextField
              size="small"
              label="Site"
              placeholder="Bonny Eagle High School, Standish, ME"
              value={site.line}
              disabled={disabled}
              onChange={(e) => update(site.key, { line: e.target.value })}
              inputProps={{ maxLength: 300 }}
              sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
              helperText={parsed
                ? parsed.location
                  ? `${parsed.name} · ${parsed.location}`
                  : `${parsed.name} · no place found: add a comma before the town, or a grid square`
                : ' '}
              FormHelperTextProps={{ sx: { color: parsed && !parsed.location ? 'warning.main' : undefined } }}
            />
            <FormControl size="small">
              <InputLabel id={`site-type-${site.key}`}>Type</InputLabel>
              <Select
                labelId={`site-type-${site.key}`}
                label="Type"
                value={site.site_type}
                disabled={disabled}
                onChange={(e) => update(site.key, { site_type: e.target.value as SiteType })}
              >
                {(Object.keys(SITE_TYPE_LABELS) as SiteType[]).map((t) => (
                  <MenuItem key={t} value={t}>{SITE_TYPE_LABELS[t]}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {infrastructure ? (
              <FormControl size="small" sx={{ minWidth: { xs: 110, sm: 140 } }}>
                <InputLabel id={`site-freq-${site.key}`}>Frequency</InputLabel>
                <Select
                  labelId={`site-freq-${site.key}`}
                  label="Frequency"
                  value={site.frequency_id ?? ''}
                  disabled={disabled}
                  onChange={(e) => update(site.key, { frequency_id: e.target.value === '' ? null : Number(e.target.value) })}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {frequencies.filter((f) => f.id != null).map((f) => (
                    <MenuItem key={f.id} value={f.id}>{frequencyText(f)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <FormControlLabel
                sx={{ mr: 0, ml: 0 }}
                control={
                  <Checkbox
                    icon={<StarBorderIcon />}
                    checkedIcon={<StarIcon sx={{ color: 'warning.main' }} />}
                    checked={site.is_primary}
                    disabled={disabled}
                    onChange={(e) => update(site.key, { is_primary: e.target.checked })}
                  />
                }
                label="Primary"
              />
            )}
            <IconButton
              aria-label="Remove this site"
              disabled={disabled}
              onClick={() => setSites((prev) => prev.filter((s) => s.key !== site.key))}
            >
              <DeleteOutlineIcon />
            </IconButton>
          </Box>
        );
      })}
      <Button startIcon={<AddIcon />} disabled={disabled} onClick={() => setSites((prev) => [...prev, newSiteDraft()])}>
        Add site
      </Button>
    </Box>
  );
};

export default CoverageSitesEditor;

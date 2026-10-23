import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { SITE_TYPE_LABELS, SiteType } from '../../utils/coverageSites';
import { SiteDraft, draftNameAndLocation, newSiteDraft } from '../../utils/siteDrafts';
import ImportSitesDialog from './ImportSitesDialog';

// ========== COVERAGE SITES EDITOR ==========
// The net's list of sites: the shelters, PODs, offices or aid stations
// stations deploy to, picked in the check-in form's Site box and grouped on
// the Sites board. On a coverage drill (an ARES SET) also the repeaters and
// nodes teams try to get into, and the primary sites every other site should
// reach; those two only mean something with coverage logging on, so they are
// offered only then (`coverage`). Its own section of the net form
// (create-net/BasicInfoTab).
// Each site is typed as one line, "Name, Town, ST" or "Name GRID", and split
// as you type so a mistake shows before it's saved
// (utils/coverageSites.ts::parseSiteLine).
//
// An EMA's full shelter or POD list comes in through ImportSitesDialog, so
// the list can run to hundreds: it's searchable, filterable by type, and
// shown a page at a time. Sites not marked Supported, and every site's
// address, notes and other columns, are shown only to net staff
// (backend routers/coverage_sites.py::list_coverage_sites).
//
// Net-only for now; the list is shaped like the planned team "supported
// locations" (docs/concepts/TEAM-MANAGEMENT-NOTES.md section 5.6) so it can
// move to team settings later.

interface CoverageSitesEditorProps {
  sites: SiteDraft[];
  setSites: React.Dispatch<React.SetStateAction<SiteDraft[]>>;
  // The net's frequencies, for tying a repeater or node to one.
  frequencies: { id?: number; frequency?: string; mode: string; network?: string; talkgroup?: string }[];
  // The saved net's id; importing needs one.
  netId?: number;
  disabled?: boolean;
  // Coverage logging is on: offer repeaters/nodes and the Primary star.
  coverage?: boolean;
}

const PAGE = 50;

const frequencyText = (f: CoverageSitesEditorProps['frequencies'][number]) =>
  [f.frequency || f.network, f.mode, f.talkgroup ? `TG ${f.talkgroup}` : ''].filter(Boolean).join(' ');

const draftText = (d: SiteDraft) =>
  [d.line, d.address, d.notes, ...Object.values(d.details || {})].join(' ').toLowerCase();

const CoverageSitesEditor: React.FC<CoverageSitesEditorProps> = ({ sites, setSites, frequencies, netId, disabled, coverage }) => {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<SiteType | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<string | null>(null);

  const update = (key: string, patch: Partial<SiteDraft>) =>
    setSites((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const named = sites.filter((s) => s.line.trim());
  const supportedCount = named.filter((s) => s.is_supported && s.site_type !== 'infrastructure').length;
  const typesPresent = Array.from(new Set(sites.map((s) => s.site_type)));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // A row just added is blank and always shown, so Add site works under a filter.
  const matching = sites.filter((s) =>
    !s.line.trim()
    || ((typeFilter === 'all' || s.site_type === typeFilter) && words.every((w) => draftText(s).includes(w)))
  );
  const filtering = words.length > 0 || typeFilter !== 'all';
  const visible = matching.slice(0, shown);

  return (
    <Box>
      <Typography variant="subtitle2">Sites</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        The places stations deploy to, such as shelters, offices or aid stations. Net control picks one in the
        Site box when checking a station in, and the Sites board shows who is at each.
        {coverage && ' For coverage logging, also add the repeaters and nodes teams try, and star the offices every other site should reach.'}
        {' '}Type each as <strong>Name, Town, ST</strong> or <strong>Name</strong> plus a grid square, and tick{' '}
        <strong>Supported</strong> for the sites your teams staff. Other sites, and every site's address, notes and
        other details, are shown only to net staff.
      </Typography>

      {/* ---- Search, type filter and import ---- */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        {sites.length > 5 && (
          <>
            <TextField
              size="small"
              placeholder="Search sites"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
              sx={{ flex: '1 1 200px' }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              inputProps={{ 'aria-label': 'Search sites' }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="site-type-filter">Type</InputLabel>
              <Select labelId="site-type-filter" label="Type" value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as SiteType | 'all'); setShown(PAGE); }}>
                <MenuItem value="all">All types</MenuItem>
                {typesPresent.map((t) => <MenuItem key={t} value={t}>{SITE_TYPE_LABELS[t]}</MenuItem>)}
              </Select>
            </FormControl>
          </>
        )}
        <Tooltip title={netId ? '' : 'Save the net first, then import a list'}>
          <span>
            <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={disabled || !netId} onClick={() => setImportOpen(true)}>
              Import
            </Button>
          </span>
        </Tooltip>
      </Box>
      {named.length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {named.length} {named.length === 1 ? 'site' : 'sites'}, {supportedCount} supported
          {filtering && `; ${matching.filter((s) => s.line.trim()).length} match`}
        </Typography>
      )}
      {imported && (
        <Alert severity="success" onClose={() => setImported(null)} sx={{ mb: 1.5 }}>{imported}</Alert>
      )}

      {visible.map((site) => {
        const parsed = site.line.trim() ? draftNameAndLocation(site) : null;
        const infrastructure = site.site_type === 'infrastructure';
        const open = expanded.has(site.key);
        const hasMore = Boolean(site.address || site.notes || site.latitude || site.details);
        return (
          <Box key={site.key} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label="Site"
                placeholder="Bonny Eagle High School, Standish, ME"
                value={site.line}
                disabled={disabled}
                onChange={(e) => update(site.key, { line: e.target.value })}
                inputProps={{ maxLength: 360 }}
                sx={{ flex: '1 1 300px', minWidth: 0 }}
                helperText={parsed
                  ? parsed.location
                    ? `${parsed.name} · ${parsed.location}`
                    : `${parsed.name} · no place found: add a comma before the town, or a grid square`
                  : ' '}
                FormHelperTextProps={{ sx: { color: parsed && !parsed.location ? 'warning.main' : undefined } }}
              />
              <FormControl size="small" sx={{ flex: '0 1 250px', minWidth: 130 }}>
                <InputLabel id={`site-type-${site.key}`}>Type</InputLabel>
                <Select
                  labelId={`site-type-${site.key}`}
                  label="Type"
                  value={site.site_type}
                  disabled={disabled}
                  onChange={(e) => update(site.key, { site_type: e.target.value as SiteType })}
                >
                  {/* Repeaters and nodes only with coverage logging (or one already set) */}
                  {(Object.keys(SITE_TYPE_LABELS) as SiteType[])
                    .filter((t) => coverage || t !== 'infrastructure' || infrastructure)
                    .map((t) => (
                      <MenuItem key={t} value={t}>{SITE_TYPE_LABELS[t]}</MenuItem>
                    ))}
                </Select>
              </FormControl>
              {/* Primary and Supported (or a repeater's frequency), then the row's buttons: one line, even on a phone */}
              <Box sx={{ display: 'flex', alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
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
                <>
                  {/* Primary: the sites every other one should reach, a coverage question */}
                  {(coverage || site.is_primary) && (
                  <FormControlLabel
                    sx={{ mr: 0, ml: 0 }}
                    componentsProps={{ typography: { variant: 'body2' } }}
                    control={
                      <Checkbox
                        sx={{ p: 0.75 }}
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
                  <FormControlLabel
                    sx={{ mr: 0, ml: 0 }}
                    componentsProps={{ typography: { variant: 'body2' } }}
                    control={
                      <Checkbox
                        sx={{ p: 0.75 }}
                        checked={site.is_supported}
                        disabled={disabled}
                        onChange={(e) => update(site.key, { is_supported: e.target.checked })}
                      />
                    }
                    label="Supported"
                  />
                </>
              )}
              <Box sx={{ display: 'flex', ml: 'auto', flexShrink: 0 }}>
                <IconButton
                  aria-label={open ? 'Hide address and notes' : 'Address and notes'}
                  aria-expanded={open}
                  color={hasMore ? 'primary' : 'default'}
                  onClick={() => toggleExpanded(site.key)}
                >
                  {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <IconButton
                  aria-label="Remove this site"
                  disabled={disabled}
                  onClick={() => setSites((prev) => prev.filter((s) => s.key !== site.key))}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
              </Box>
            </Box>

            {/* ---- Address, coordinates, notes and imported columns (net staff only) ---- */}
            <Collapse in={open} unmountOnExit>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '2fr 1fr 1fr' }, gap: 1, mt: 1, pl: { sm: 2 } }}>
                <TextField size="small" label="Address" value={site.address} disabled={disabled}
                  onChange={(e) => update(site.key, { address: e.target.value })}
                  inputProps={{ maxLength: 255 }} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                <TextField size="small" label="Latitude" value={site.latitude} disabled={disabled}
                  onChange={(e) => update(site.key, { latitude: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
                <TextField size="small" label="Longitude" value={site.longitude} disabled={disabled}
                  onChange={(e) => update(site.key, { longitude: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
                <TextField size="small" label="Notes" placeholder="Point of contact, access, keys" value={site.notes}
                  disabled={disabled} multiline minRows={2} onChange={(e) => update(site.key, { notes: e.target.value })}
                  inputProps={{ maxLength: 4000 }} sx={{ gridColumn: '1 / -1' }} />
              </Box>
              {/* Shows for a site imported with columns beyond the mapped ones */}
              {site.details && (
                <Box component="dl" sx={{ m: 0, mt: 1, pl: { sm: 2 }, display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.25 }}>
                  {Object.entries(site.details).map(([label, value]) => (
                    <React.Fragment key={label}>
                      <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
                      <Typography component="dd" variant="caption" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
                    </React.Fragment>
                  ))}
                </Box>
              )}
            </Collapse>
          </Box>
        );
      })}

      {matching.length > shown && (
        <Button onClick={() => setShown((n) => n + PAGE)} sx={{ mb: 1 }}>
          Show {Math.min(PAGE, matching.length - shown)} more of {matching.length - shown}
        </Button>
      )}
      {filtering && matching.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No sites match.</Typography>
      )}
      <Button
        startIcon={<AddIcon />}
        disabled={disabled}
        onClick={() => setSites((prev) => [...prev, newSiteDraft()])}
      >
        Add site
      </Button>

      {netId != null && (
        <ImportSitesDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          netId={netId}
          sites={sites}
          onImport={(drafts, added, updated) => {
            setSites(drafts);
            setImported(`Added ${added} and updated ${updated} ${added + updated === 1 ? 'site' : 'sites'}. Save the net to keep them.`);
          }}
        />
      )}
    </Box>
  );
};

export default CoverageSitesEditor;

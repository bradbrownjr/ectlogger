import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { coverageSiteApi } from '../../services/api';
import { SITE_TYPE_LABELS, SiteType } from '../../utils/coverageSites';
import { SiteDraft } from '../../utils/siteDrafts';
import {
  ColumnMap, IMPORT_FIELDS, ImportField, guessColumns, guessHeaderRow, mergeImportedSites, readImportedSites,
} from '../../utils/siteImport';

// ========== IMPORT SITES DIALOG ==========
// Loads an EMA's shelter or point-of-distribution list from Excel or CSV
// into the coverage sites editor. The server only reads the file into rows
// (POST /nets/{id}/coverage-sites/read-file, nothing saved); the columns are
// matched here, and the result goes into the editor's list, which the net's
// Save stores. See utils/siteImport.ts.

// Must match backend routers/coverage_sites.py::MAX_SITES.
export const MAX_SITES = 500;

const IMPORT_TYPES = (Object.keys(SITE_TYPE_LABELS) as SiteType[]).filter((t) => t !== 'infrastructure');

const typeFromFileName = (name: string): SiteType =>
  /\bpods?\b|distribution/i.test(name) ? 'pod' : /shelter/i.test(name) ? 'shelter' : /hospital/i.test(name) ? 'hospital' : 'other';

const columnLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);

interface ImportSitesDialogProps {
  open: boolean;
  onClose: () => void;
  netId: number;
  sites: SiteDraft[];
  onImport: (drafts: SiteDraft[], added: number, updated: number) => void;
}

const ImportSitesDialog: React.FC<ImportSitesDialogProps> = ({ open, onClose, netId, sites, onImport }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState<string>('');
  const [rows, setRows] = useState<string[][]>([]);
  const [truncated, setTruncated] = useState(false);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<ColumnMap | null>(null);
  const [defaultState, setDefaultState] = useState('');
  const [siteType, setSiteType] = useState<SiteType>('shelter');
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null); setSheets([]); setSheet(''); setRows([]); setTruncated(false); setHeaderRow(0);
    setColumns(null); setSupported(false); setError(null);
  };
  const close = () => { reset(); onClose(); };

  const load = async (chosen: File, sheetName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await coverageSiteApi.readSiteFile(netId, chosen, sheetName);
      setSheets(data.sheets);
      setSheet(data.sheet || '');
      setRows(data.rows);
      setTruncated(data.truncated);
      const header = guessHeaderRow(data.rows);
      setHeaderRow(header);
      setColumns(guessColumns(data.rows[header] || []));
    } catch (err: any) {
      setRows([]);
      setColumns(null);
      setError(err?.response?.data?.detail || "That file couldn't be read.");
    } finally {
      setLoading(false);
    }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    reset();
    setFile(chosen);
    setSiteType(typeFromFileName(chosen.name));
    load(chosen);
  };

  const headers = rows[headerRow] || [];
  const read = useMemo(
    () => (columns && columns.name != null ? readImportedSites(rows, headerRow, columns, defaultState) : null),
    [rows, headerRow, columns, defaultState]
  );
  const merged = useMemo(
    () => (read ? mergeImportedSites(sites, read.sites, siteType, supported) : null),
    [read, sites, siteType, supported]
  );
  const total = merged ? merged.drafts.filter((d) => d.line.trim()).length : 0;
  const tooMany = total > MAX_SITES;

  const setColumn = (field: ImportField, value: number | null) =>
    setColumns((prev) => (prev ? { ...prev, [field]: value } : prev));

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Import sites</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Load a shelter or distribution point list from Excel (.xlsx) or CSV. Match its columns to the site's name,
          address, town and coordinates. The rest of its columns, such as capacity or a point of contact, are kept
          with each site.
        </Typography>
        <input ref={fileInput} type="file" hidden accept=".xlsx,.csv,text/csv" onChange={pickFile} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileInput.current?.click()} disabled={loading}>
            Choose file
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {loading ? 'Reading…' : file ? file.name : 'No file chosen'}
          </Typography>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Shows once the file has been read */}
        {columns && rows.length > 0 && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              {sheets.length > 1 && (
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="import-sheet">Sheet</InputLabel>
                  <Select labelId="import-sheet" label="Sheet" value={sheet}
                    onChange={(e) => { setSheet(e.target.value); if (file) load(file, e.target.value); }}>
                    {sheets.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
              <FormControl size="small" sx={{ minWidth: 220, maxWidth: '100%' }}>
                <InputLabel id="import-header-row">Headings are on</InputLabel>
                <Select labelId="import-header-row" label="Headings are on" value={headerRow}
                  onChange={(e) => {
                    const row = Number(e.target.value);
                    setHeaderRow(row);
                    setColumns(guessColumns(rows[row] || []));
                  }}>
                  {rows.slice(0, 10).map((r, i) => (
                    <MenuItem key={i} value={i}>
                      Row {i + 1}: {r.filter((c) => c.trim()).slice(0, 3).join(', ').slice(0, 50)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>Columns</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5, mb: 1 }}>
              {IMPORT_FIELDS.map(({ field, label }) => (
                <FormControl key={field} size="small" required={field === 'name'}>
                  <InputLabel id={`import-col-${field}`}>{label}</InputLabel>
                  <Select labelId={`import-col-${field}`} label={label} value={columns[field] ?? ''}
                    onChange={(e) => setColumn(field, e.target.value === '' ? null : Number(e.target.value))}>
                    <MenuItem value=""><em>None</em></MenuItem>
                    {headers.map((h, i) => (
                      <MenuItem key={i} value={i}>{columnLetter(i)}{h.trim() ? `: ${h.trim()}` : ''}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
              {/* Shows when the list has no state column */}
              {columns.state == null && (
                <TextField size="small" label="State for every site" placeholder="ME" value={defaultState}
                  onChange={(e) => setDefaultState(e.target.value)} inputProps={{ maxLength: 20 }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              The town and state become the site's place, which puts it on the map. Latitude and longitude, when the
              list has them, place it exactly.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel id="import-type">Type for every site</InputLabel>
                <Select labelId="import-type" label="Type for every site" value={siteType}
                  onChange={(e) => setSiteType(e.target.value as SiteType)}>
                  {IMPORT_TYPES.map((t) => <MenuItem key={t} value={t}>{SITE_TYPE_LABELS[t]}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Checkbox checked={supported} onChange={(e) => setSupported(e.target.checked)} />}
                label="Our teams staff every site on this list"
              />
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              For an EMA's full list, leave this off and mark the sites you'll staff afterward. Sites you don't
              staff, and every site's address, contacts and other columns, are shown only to net staff.
            </Typography>

            {/* ---- Preview ---- */}
            {columns.name == null ? (
              <Alert severity="warning">Choose the column that holds each site's name.</Alert>
            ) : read && merged && (
              <>
                <Alert severity={tooMany ? 'error' : 'info'} sx={{ mb: 1 }}>
                  {read.sites.length} sites read: {merged.added} new, {merged.updated} already on the net's list will be
                  updated.
                  {read.skipped > 0 && ` ${read.skipped} rows with no name are skipped.`}
                  {truncated && ' Only the first 2,000 rows of the file were read.'}
                  {tooMany && ` That makes ${total} sites; a net holds at most ${MAX_SITES}.`}
                </Alert>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Place</TableCell>
                        <TableCell>Address</TableCell>
                        <TableCell>Coordinates</TableCell>
                        <TableCell>Other columns</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {read.sites.slice(0, 5).map((s, i) => (
                        <TableRow key={i}>
                          <TableCell>{s.name}</TableCell>
                          <TableCell>{s.location}</TableCell>
                          <TableCell>{s.address}</TableCell>
                          <TableCell>{s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : ''}</TableCell>
                          <TableCell>{s.details ? Object.keys(s.details).length : 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {read.sites.length > 5 && (
                  <Typography variant="caption" color="text.secondary">and {read.sites.length - 5} more</Typography>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!merged || read?.sites.length === 0 || tooMany}
          onClick={() => { if (merged) { onImport(merged.drafts, merged.added, merged.updated); close(); } }}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportSitesDialog;

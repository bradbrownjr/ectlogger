import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Link, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RestoreIcon from '@mui/icons-material/Restore';
import api, { ics214Api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../utils/apiErrors';
import { exportPagesToPdf } from '../utils/pdfExport';
import {
  Ics214Form, Ics214Header, Ics214Line, inputToIso, isoToInput, lineDateTime,
} from '../utils/ics214';
import ICS214PrintView from '../components/ics214/ICS214PrintView';

// ========== ICS-214 PAGE ==========
// /nets/:netId/ics214. A closed net's ICS-214 Activity Log, filled in from
// what was logged (backend/app/services/ics214.py), for net control to
// finish and download: fill in the header, add what happened off the air,
// hide or reword what doesn't belong, then Download PDF. Opened from the
// net's Reports menu, for whoever may close the net
// (NetActions.prepare_ics214). Saving stores only what was changed, so a
// line or the header still follows a later fix to the log.

type LineEdits = Record<string, { hidden: boolean; text: string | null }>;
type ResourceEdits = Record<string, { hidden: boolean; name: string | null; position: string | null; agency: string | null }>;

const HEADER_FIELDS: { key: keyof Ics214Header; label: string; helper?: string }[] = [
  { key: 'incident_name', label: '1. Incident name' },
  { key: 'unit_name', label: '3. Name', helper: 'The team or unit this log is for' },
  { key: 'leader', label: '4. ICS position', helper: 'Who was in charge, and their position' },
  { key: 'home_agency', label: '5. Home agency (and unit)', helper: 'Your team, such as a county ARES group' },
  { key: 'prepared_name', label: '8. Prepared by' },
  { key: 'prepared_position', label: '8. Position/title' },
];

const editsFrom = (form: Ics214Form) => ({
  lines: Object.fromEntries(form.lines.filter((l) => l.kind !== 'entry').map((l) => [
    l.key, { hidden: l.hidden, text: l.text !== l.default_text ? l.text : null },
  ])) as LineEdits,
  resources: Object.fromEntries(form.resources.map((r) => [r.key, {
    hidden: r.hidden,
    name: r.name !== r.default_name ? r.name : null,
    position: r.position !== r.default_position ? r.position : null,
    agency: r.agency || null,
  }])) as ResourceEdits,
});

const Ics214Page: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const id = Number(netId);
  const { user } = useAuth();
  const preferUtc = !!user?.prefer_utc;
  const [net, setNet] = useState<any>(null);
  const [form, setForm] = useState<Ics214Form | null>(null);
  const [header, setHeader] = useState<Ics214Header | null>(null);
  const [lineEdits, setLineEdits] = useState<LineEdits>({});
  const [resourceEdits, setResourceEdits] = useState<ResourceEdits>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftAt, setDraftAt] = useState('');
  const [newAt, setNewAt] = useState('');
  const [newText, setNewText] = useState('');
  const [deleting, setDeleting] = useState<Ics214Line | null>(null);
  // Set while the off-screen print view is mounted for the PDF
  const [printing, setPrinting] = useState<{ form: Ics214Form; at: string } | null>(null);

  const take = useCallback((next: Ics214Form) => {
    setForm(next);
    setHeader(next.header);
    const edits = editsFrom(next);
    setLineEdits(edits.lines);
    setResourceEdits(edits.resources);
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [netRes, formRes] = await Promise.all([api.get(`/nets/${id}`), ics214Api.get(id)]);
        setNet(netRes.data);
        take(formRes.data);
        setNewAt(isoToInput(formRes.data.header.period_to, preferUtc));
      } catch (err) {
        setError(getErrorMessage(err, "Couldn't load this net's ICS-214"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, take, preferUtc]);

  // Unsaved changes: ask before the tab closes
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async (): Promise<Ics214Form | null> => {
    if (!header) return null;
    setSaving(true);
    try {
      const res = await ics214Api.save(id, { header, line_edits: lineEdits, resource_edits: resourceEdits });
      take(res.data);
      return res.data;
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save the ICS-214"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    const saved = dirty ? await save() : form;
    if (saved) setPrinting({ form: saved, at: new Date().toISOString() });
  };

  // What the page shows: the saved form with this session's unsaved edits
  const shown = useMemo<Ics214Form | null>(() => form && header ? {
    ...form,
    header,
    lines: form.lines.map((l) => {
      const e = lineEdits[l.key];
      return e ? { ...l, hidden: e.hidden, text: e.text || l.default_text } : l;
    }),
    resources: form.resources.map((r) => {
      const e = resourceEdits[r.key];
      return e ? {
        ...r, hidden: e.hidden, name: e.name ?? r.default_name, position: e.position ?? r.default_position, agency: e.agency || '',
      } : r;
    }),
  } : null, [form, header, lineEdits, resourceEdits]);

  const setHeaderField = (key: keyof Ics214Header, value: string | null) => {
    setHeader((h) => (h ? { ...h, [key]: value } : h));
    setDirty(true);
  };
  const setLine = (key: string, change: Partial<LineEdits[string]>) => {
    setLineEdits((all) => ({ ...all, [key]: { ...(all[key] ?? { hidden: false, text: null }), ...change } }));
    setDirty(true);
  };
  const setResource = (key: string, change: Partial<ResourceEdits[string]>) => {
    setResourceEdits((all) => ({ ...all, [key]: { ...(all[key] ?? { hidden: false, name: null, position: null, agency: null }), ...change } }));
    setDirty(true);
  };

  // A line written by hand is saved straight away; the rest wait for Save
  const writeEntry = async (entryId: number | null, at: string, text: string) => {
    const occurred = inputToIso(at, preferUtc);
    if (!occurred || !text.trim()) {
      setError('Give the line a date, a time and some text.');
      return false;
    }
    try {
      const body = { occurred_at: occurred, text: text.trim() };
      const res = entryId == null ? await ics214Api.addEntry(id, body) : await ics214Api.updateEntry(id, entryId, body);
      // Keep any unsaved header or line edits
      setForm(res.data);
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that line"));
      return false;
    }
  };

  const removeEntry = async (line: Ics214Line) => {
    if (line.entry_id == null) return;
    try {
      await ics214Api.deleteEntry(id, line.entry_id);
      setForm((f) => (f ? { ...f, lines: f.lines.filter((l) => l.key !== line.key) } : f));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that line"));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  const period = { from: header?.period_from ?? null, to: header?.period_to ?? null };
  const timeZoneNote = preferUtc ? ' (UTC)' : '';

  return (
    <Container maxWidth="lg" sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
      <Link component={RouterLink} to={`/nets/${id}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <ArrowBackIcon fontSize="small" /> {net?.name || 'Back to the net'}
      </Link>

      {/* ========== HEADER ========== */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1">ICS-214 Activity Log</Typography>
          <Typography color="text.secondary">
            Filled in from the net's log. Change what you need, then download it.
          </Typography>
        </Box>
        {shown && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="outlined" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={download} disabled={saving || !!printing}>
              Download PDF
            </Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {shown && header && (
        <>
          {/* Shows on a net with a drill plan */}
          {shown.exercise && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This net is a drill, so every page of the form is marked THIS IS AN EXERCISE.
            </Alert>
          )}

          {/* ========== BLOCKS 1-5 AND 8 ========== */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              {HEADER_FIELDS.slice(0, 1).map(({ key, label }) => (
                <Grid item xs={12} md={6} key={key}>
                  <TextField fullWidth size="small" label={label} value={header[key] ?? ''}
                    onChange={(e) => setHeaderField(key, e.target.value)} inputProps={{ maxLength: 200 }} />
                </Grid>
              ))}
              <Grid item xs={12} sm={6} md={3}>
                <TextField fullWidth size="small" type="datetime-local" label={`2. From${timeZoneNote}`}
                  InputLabelProps={{ shrink: true }} value={isoToInput(header.period_from, preferUtc)}
                  onChange={(e) => setHeaderField('period_from', inputToIso(e.target.value, preferUtc))} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField fullWidth size="small" type="datetime-local" label={`2. To${timeZoneNote}`}
                  InputLabelProps={{ shrink: true }} value={isoToInput(header.period_to, preferUtc)}
                  onChange={(e) => setHeaderField('period_to', inputToIso(e.target.value, preferUtc))} />
              </Grid>
              {HEADER_FIELDS.slice(1).map(({ key, label, helper }) => (
                <Grid item xs={12} md={key.startsWith('prepared') ? 6 : 4} key={key}>
                  <TextField fullWidth size="small" label={label} helperText={helper} value={header[key] ?? ''}
                    onChange={(e) => setHeaderField(key, e.target.value)} inputProps={{ maxLength: 200 }} />
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* ========== BLOCK 6: RESOURCES ASSIGNED ========== */}
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>6. Resources assigned</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Everyone who took part, in person included. Untick anyone who doesn't belong on the form.
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">On form</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>ICS position</TableCell>
                  <TableCell>Home agency (and unit)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.resources.map((r) => (
                  <TableRow key={r.key} sx={r.hidden ? { opacity: 0.5 } : undefined}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={!r.hidden} onChange={(e) => setResource(r.key, { hidden: !e.target.checked })}
                        inputProps={{ 'aria-label': `Put ${r.callsign} on the form` }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <TextField size="small" variant="standard" fullWidth value={r.name} placeholder={r.callsign}
                        onChange={(e) => setResource(r.key, { name: e.target.value })}
                        InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">{r.callsign}</Typography> }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      <TextField size="small" variant="standard" fullWidth value={r.position}
                        onChange={(e) => setResource(r.key, { position: e.target.value })} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>
                      <TextField size="small" variant="standard" fullWidth value={r.agency}
                        onChange={(e) => setResource(r.key, { agency: e.target.value })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* ========== BLOCK 7: ACTIVITY LOG ========== */}
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>7. Activity log</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Each line comes from the net's log. Untick a line to leave it off, or reword it. Add what happened off the air below.
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">On form</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Date/Time{timeZoneNote}</TableCell>
                  <TableCell>Notable activities</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.lines.map((l) => {
                  const editing = editingKey === l.key;
                  return (
                    <TableRow key={l.key} sx={l.hidden ? { opacity: 0.5 } : undefined}>
                      <TableCell padding="checkbox">
                        {l.kind !== 'entry' && (
                          <Checkbox checked={!l.hidden} onChange={(e) => setLine(l.key, { hidden: !e.target.checked })}
                            inputProps={{ 'aria-label': 'Put this line on the form' }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top', pt: 1.25 }}>
                        {editing && l.kind === 'entry' ? (
                          <TextField size="small" type="datetime-local" value={draftAt} onChange={(e) => setDraftAt(e.target.value)} />
                        ) : (lineDateTime(l.at, period, preferUtc) || 'Not recorded')}
                      </TableCell>
                      <TableCell sx={{ width: '100%' }}>
                        {editing ? (
                          <TextField size="small" fullWidth multiline autoFocus value={draftText}
                            onChange={(e) => setDraftText(e.target.value)} inputProps={{ maxLength: 2000 }} />
                        ) : (
                          <>
                            {l.text}
                            {/* Shows when a logged line was reworded */}
                            {l.kind !== 'entry' && l.text !== l.default_text && (
                              <Typography variant="caption" color="text.secondary" display="block">Log: {l.default_text}</Typography>
                            )}
                            {l.kind === 'entry' && (
                              <Typography variant="caption" color="text.secondary" display="block">Added by hand</Typography>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {editing ? (
                          <>
                            <Button size="small" onClick={() => setEditingKey(null)}>Cancel</Button>
                            <Button size="small" variant="contained" onClick={async () => {
                              if (l.kind === 'entry') {
                                if (await writeEntry(l.entry_id, draftAt, draftText)) setEditingKey(null);
                              } else {
                                setLine(l.key, { text: draftText.trim() && draftText.trim() !== l.default_text ? draftText.trim() : null });
                                setEditingKey(null);
                              }
                            }}>Done</Button>
                          </>
                        ) : (
                          <>
                            <Tooltip title="Reword">
                              <IconButton size="small" aria-label="Reword" onClick={() => {
                                setEditingKey(l.key);
                                setDraftText(l.text);
                                setDraftAt(isoToInput(l.at, preferUtc));
                              }}><EditIcon fontSize="small" /></IconButton>
                            </Tooltip>
                            {/* Shows when a logged line was reworded */}
                            {l.kind !== 'entry' && l.text !== l.default_text && (
                              <Tooltip title="Back to the log's wording">
                                <IconButton size="small" aria-label="Back to the log's wording" onClick={() => setLine(l.key, { text: null })}>
                                  <RestoreIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {l.kind === 'entry' && (
                              <Tooltip title="Delete">
                                <IconButton size="small" aria-label="Delete" onClick={() => setDeleting(l)}><DeleteIcon fontSize="small" /></IconButton>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* ========== ADD A LINE ========== */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Add a line</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
              <TextField size="small" type="datetime-local" label={`Date and time${timeZoneNote}`} InputLabelProps={{ shrink: true }}
                value={newAt} onChange={(e) => setNewAt(e.target.value)} />
              <TextField size="small" label="What happened" placeholder="Briefed shelter managers at the EOC"
                value={newText} onChange={(e) => setNewText(e.target.value)} sx={{ flex: 1, minWidth: 240 }}
                inputProps={{ maxLength: 2000 }} />
              <Button variant="contained" disabled={!newText.trim()} onClick={async () => {
                if (await writeEntry(null, newAt, newText)) setNewText('');
              }}>Add</Button>
            </Box>
          </Paper>
        </>
      )}

      {/* ========== DELETE A LINE ADDED BY HAND ========== */}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete this line?</DialogTitle>
        <DialogContent><Typography>{deleting?.text}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleting && removeEntry(deleting)}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Off-screen print view, mounted only while the PDF is built. Off
          canvas rather than display:none, since it measures its own pages. */}
      {printing && (
        <Box sx={{ position: 'fixed', top: 0, left: -99999, width: 800, overflow: 'hidden' }}>
          <ICS214PrintView
            id="ics214-print"
            form={printing.form}
            preferUtc={preferUtc}
            preparedAt={printing.at}
            onReady={() => {
              exportPagesToPdf('ics214-print', { filename: `ICS214_${(net?.name || 'net').replace(/ /g, '_')}` })
                .catch((err) => setError(getErrorMessage(err, "Couldn't build the PDF")))
                .finally(() => setPrinting(null));
            }}
          />
        </Box>
      )}
    </Container>
  );
};

export default Ics214Page;

import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import SendIcon from '@mui/icons-material/Send';
import api, { coverageSiteApi, drillPlanApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import { exportElementToPdf } from '../utils/pdfExport';
import { CoverageSite } from '../utils/coverageSites';
import {
  DrillEvent, DrillPlan as Plan, OBJECTIVE_RATING_LABELS, groupObjectives, messageStatus, newPlan,
} from '../utils/drillPlan';
import DrillPlanEditor from '../components/drill/DrillPlanEditor';
import DrillPlanPrintView from '../components/drill/DrillPlanPrintView';

// ========== DRILL PLAN PAGE ==========
// /nets/:netId/drill-plan. The exercise plan for one net's drill: read it,
// mark prepared messages sent as the drill runs, print the plan and each
// site's packet, and (for the net's editors) write and rate it.
//
// Sending a message files it as drill traffic on the net
// (routers/drill_plans.py::send_drill_message); received, relayed and
// delivered are logged on that form in the Traffic panel, and this page
// reads the status back. It refreshes every 30 seconds so two people
// running the drill see each other's sends.

const REFRESH_MS = 30000;

const DrillPlanPage: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const id = Number(netId);
  const [net, setNet] = useState<any>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sites, setSites] = useState<CoverageSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Plan>(newPlan(''));
  const [saving, setSaving] = useState(false);
  const [sendRow, setSendRow] = useState<DrillEvent | null>(null);
  const [sentBy, setSentBy] = useState('');
  const [sending, setSending] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printSite, setPrintSite] = useState<number | ''>('');
  const [printBlanks, setPrintBlanks] = useState('0');
  const [printRatings, setPrintRatings] = useState(false);
  // Set while the off-screen print view is mounted for capture.
  const [printing, setPrinting] = useState<{ siteId: number | null; blanks: number; ratings: boolean } | null>(null);

  const loadPlan = useCallback(async (background = false) => {
    try {
      const res = await drillPlanApi.get(id, background);
      setPlan(res.data);
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 404) setPlan(null);
      else if (!background) setError(getErrorMessage(err, "Couldn't load the drill plan"));
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [netRes, sitesRes] = await Promise.all([api.get(`/nets/${id}`), coverageSiteApi.listSites(id)]);
        setNet(netRes.data);
        setSites(sitesRes.data);
        await loadPlan();
      } catch (err) {
        setError(getErrorMessage(err, "Couldn't load this net"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadPlan]);

  // Background refresh while reading, never while editing a draft.
  useEffect(() => {
    if (editing || !plan) return;
    const timer = setInterval(() => loadPlan(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [editing, plan, loadPlan]);

  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const siteName = sites.find((s) => s.id === printing.siteId)?.name;
      try {
        await exportElementToPdf('drill-plan-print', {
          filename: siteName ? `Drill packet - ${siteName}` : 'Drill plan',
          pageFooter: `${plan?.exercise_name || net?.name || 'Drill plan'}${siteName ? ` - ${siteName}` : ''}`,
        });
      } catch (err) {
        console.error('Failed to build the drill plan PDF:', err);
      } finally {
        if (!cancelled) setPrinting(null);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [printing, plan, net, sites]);

  const canEdit = plan ? !!plan.can_edit : !!net?.actions?.edit;
  const siteName = (sid: number | null | undefined) => sites.find((s) => s.id === sid)?.name;
  const placeSites = sites.filter((s) => s.site_type !== 'infrastructure');

  const startEditing = () => {
    setDraft(plan ? JSON.parse(JSON.stringify(plan)) : newPlan(net?.name || ''));
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...draft,
        objectives: draft.objectives.filter((o) => o.text.trim()),
        events: draft.events.map(({ form_id, form_status, form_message_number, sent_at, ...e }) => e),
      };
      const res = await drillPlanApi.save(id, payload);
      setPlan(res.data);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save the drill plan"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove this drill plan? Messages already sent stay filed as traffic.')) return;
    try {
      await drillPlanApi.remove(id);
      setPlan(null);
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't remove the drill plan"));
    }
  };

  const openSend = (row: DrillEvent) => {
    setSentBy(siteName(row.site_id) || row.initiator || '');
    setSendRow(row);
  };

  const send = async () => {
    if (!sendRow?.id) return;
    setSending(true);
    try {
      await drillPlanApi.send(id, sendRow.id, { handled_by: sentBy.trim() || null });
      setSendRow(null);
      await loadPlan();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't mark the message sent"));
    } finally {
      setSending(false);
    }
  };

  const openPrint = (siteId: number | '') => {
    setPrintSite(siteId);
    setPrintBlanks(siteId === '' ? '0' : '5');
    setPrintOpen(true);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
      <Link component={RouterLink} to={`/nets/${id}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <ArrowBackIcon fontSize="small" /> {net?.name || 'Back to the net'}
      </Link>

      {/* ========== HEADER ========== */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1">
            {editing ? 'Edit drill plan' : plan?.exercise_name || 'Drill plan'}
          </Typography>
          {!editing && plan?.exercise_when && <Typography color="text.secondary">{plan.exercise_when}</Typography>}
          {!editing && plan?.location && <Typography color="text.secondary">{plan.location}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {editing ? (
            <>
              {plan && <Button color="error" onClick={remove}>Remove plan</Button>}
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </>
          ) : plan ? (
            <>
              <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => openPrint('')}>Print</Button>
              {canEdit && <Button variant="contained" startIcon={<EditIcon />} onClick={startEditing}>Edit</Button>}
            </>
          ) : null}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {editing ? (
        <DrillPlanEditor draft={draft} setDraft={setDraft} sites={sites} />
      ) : !plan ? (
        // ========== NO PLAN YET ==========
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography gutterBottom>This net has no drill plan.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A drill plan holds the exercise's scenario, its objectives, and a schedule of events, with prepared ICS-213s
            for the sites that send them. Net control marks each message sent as the drill runs, and each site gets a
            printed packet.
          </Typography>
          {canEdit && <Button variant="contained" onClick={startEditing}>Create drill plan</Button>}
        </Paper>
      ) : (
        <>
          {(plan.purpose || plan.scenario || plan.announcement) && (
            // ========== OVERVIEW ==========
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              {plan.announcement && (
                <Alert severity="warning" sx={{ mb: plan.purpose || plan.scenario ? 2 : 0, whiteSpace: 'pre-wrap' }}>
                  {plan.announcement}
                </Alert>
              )}
              {plan.purpose && (
                <>
                  <Typography variant="subtitle1" fontWeight={600}>Purpose</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>{plan.purpose}</Typography>
                </>
              )}
              {plan.scenario && (
                <>
                  <Typography variant="subtitle1" fontWeight={600}>Scenario</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{plan.scenario}</Typography>
                </>
              )}
            </Paper>
          )}

          {/* ========== OBJECTIVES ========== */}
          {plan.objectives.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>Objectives</Typography>
              {groupObjectives(plan.objectives).map((group, gi) => (
                <Box key={gi} sx={{ mb: 1.5 }}>
                  {group.heading && <Typography fontWeight={600}>{group.heading}</Typography>}
                  <Box component="ol" sx={{ my: 0.5, pl: 3 }}>
                    {group.items.map((o) => (
                      <li key={o.id}>
                        <Typography component="span">{o.text}</Typography>
                        {o.rating && (
                          <Box sx={{ mt: 0.5, mb: 1 }}>
                            <Chip size="small" label={OBJECTIVE_RATING_LABELS[o.rating]}
                              color={o.rating === 'P' ? 'success' : o.rating === 'U' ? 'error' : 'warning'} variant="outlined" />
                            {o.result_note && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{o.result_note}</Typography>
                            )}
                          </Box>
                        )}
                      </li>
                    ))}
                  </Box>
                </Box>
              ))}
            </Paper>
          )}

          {/* ========== SCHEDULE OF EVENTS ========== */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Schedule of events</Typography>
            {plan.events.length === 0 && (
              <Typography color="text.secondary">No events yet.</Typography>
            )}
            {plan.events.map((e, i) => {
              const status = messageStatus(e);
              return (
                <Box key={e.id} data-drill-event={i} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider', py: 1.5 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                    {e.time_label && <Typography fontWeight={700}>{e.time_label}</Typography>}
                    {e.event_type && <Chip size="small" label={e.event_type} />}
                    {(e.initiator || e.receiver) && (
                      <Typography>{[e.initiator, e.receiver].filter(Boolean).join(' to ')}</Typography>
                    )}
                    {e.method && <Typography color="text.secondary">{e.method}</Typography>}
                    {e.site_id != null && <Chip size="small" variant="outlined" label={siteName(e.site_id)} />}
                  </Box>
                  {e.description && <Typography sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{e.description}</Typography>}
                  {e.expected_actions && (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                      Expected: {e.expected_actions}
                    </Typography>
                  )}
                  {e.message && status && (
                    // A prepared ICS-213 and where it is in the chain of custody.
                    <Paper variant="outlined" sx={{ mt: 1, p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>ICS-213: {e.message.subject || '(no subject)'}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {[e.message.from_name && `From ${e.message.from_name}`, e.message.to_name && `to ${e.message.to_name}`].filter(Boolean).join(' ')}
                          {e.message.priority && e.message.priority !== 'Routine' ? ` · ${e.message.priority}` : ''}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip size="small" label={status.label} color={status.tone} />
                        {e.form_id && e.sent_at && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(e.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </Typography>
                        )}
                        {!e.form_id && (
                          <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => openSend(e)} sx={{ minHeight: 36 }}>
                            Mark sent
                          </Button>
                        )}
                      </Box>
                    </Paper>
                  )}
                </Box>
              );
            })}
          </Paper>
        </>
      )}

      {/* ========== MARK SENT DIALOG ========== */}
      <Dialog open={!!sendRow} onClose={() => setSendRow(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark message sent</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Files "{sendRow?.message?.subject}" as drill traffic on this net. Log it received and delivered from the Traffic panel.
          </Typography>
          <TextField label="Sent by" value={sentBy} onChange={(e) => setSentBy(e.target.value)} fullWidth margin="dense"
            helperText="The site or station that sent it" inputProps={{ maxLength: 200 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendRow(null)}>Cancel</Button>
          <Button variant="contained" onClick={send} disabled={sending}>{sending ? 'Sending...' : 'Mark sent'}</Button>
        </DialogActions>
      </Dialog>

      {/* ========== PRINT DIALOG ========== */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Print</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel id="print-what">What to print</InputLabel>
            <Select labelId="print-what" label="What to print" value={printSite}
              onChange={(e) => {
                const v = e.target.value as number | '';
                setPrintSite(v);
                setPrintBlanks(v === '' ? '0' : '5');
              }}>
              <MenuItem value="">The whole plan</MenuItem>
              {placeSites.map((s) => <MenuItem key={s.id} value={s.id}>Packet for {s.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Blank ICS-213s" type="number" value={printBlanks} onChange={(e) => setPrintBlanks(e.target.value)}
            margin="dense" inputProps={{ min: 0, max: 50 }} helperText="Added at the end, with the incident name filled in" />
          <FormControlLabel sx={{ display: 'flex' }}
            control={<Checkbox checked={printRatings} onChange={(e) => setPrintRatings(e.target.checked)} />}
            label="Include objective results" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!!printing} onClick={() => {
            setPrinting({
              siteId: printSite === '' ? null : printSite,
              blanks: Math.min(50, Math.max(0, parseInt(printBlanks, 10) || 0)),
              ratings: printRatings,
            });
            setPrintOpen(false);
          }}>
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>

      {/* Off-screen print view, mounted only while a PDF is being built. Off
          canvas rather than display:none, since html2canvas needs it laid out. */}
      {printing && plan && (
        <Box sx={{ position: 'fixed', top: 0, left: -99999, width: 800, overflow: 'hidden' }}>
          <DrillPlanPrintView id="drill-plan-print" plan={plan} netName={net?.name || ''} sites={sites}
            siteId={printing.siteId} blankForms={printing.blanks} showRatings={printing.ratings} />
        </Box>
      )}
    </Container>
  );
};

export default DrillPlanPage;

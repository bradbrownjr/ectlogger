import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Container, Grid, Link, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../utils/apiErrors';
import { exportPagesToPdf } from '../utils/pdfExport';
import { formDate, formTime } from '../utils/ics214';
import { ICS205_COLUMNS, buildIcs205Rows, ics205PreparedBy } from '../utils/channelPlan';
import ICS205PrintView, { Ics205Header } from '../components/ics205/ICS205PrintView';

// ========== ICS-205 PAGE ==========
// /nets/:netId/ics205. The net's ICS 205 Incident Radio Communications Plan
// (FEMA v3.1), built from its Communication Plan tab: the channel plan
// (order, role, function, assignment, remarks), each frequency's offset,
// tones and N/W, and the special instructions. Read-only here; the plan is
// edited on the net's or schedule's form. Signed-in viewers only (the route
// is a PrivateRoute, and a guest's net response leaves out the plan's
// assignments, remarks and special instructions). Opened from the net's
// Reports menu and the Communication Plan tab, for any net status: a plan is
// usually prepared before the net.
//
// On screen the blocks follow the app's theme. Download PDF mounts the
// light, paper-accurate ICS205PrintView off screen and exports its pages in
// Letter landscape.

const Block: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
    <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>{children}</Typography>
  </Box>
);

const Ics205Page: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const id = Number(netId);
  const { user } = useAuth();
  const preferUtc = !!user?.prefer_utc;
  const [net, setNet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Set while the off-screen print view is mounted for the PDF
  const [printing, setPrinting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/nets/${id}`);
        setNet(res.data);
      } catch (err) {
        setError(getErrorMessage(err, "Couldn't load this net"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const rows = useMemo(() => (net ? buildIcs205Rows(net.channel_plan || [], net.frequencies || []) : []), [net]);

  // Blocks 1, 3, 5 and 6, from the net. Block 6 is the net's primary NCS.
  const header = useMemo<Ics205Header | null>(() => {
    if (!net) return null;
    return {
      incidentName: net.name,
      periodFrom: net.scheduled_start_time || net.started_at || null,
      periodTo: net.closed_at || null,
      // The primary NCS, or blank before the net has one
      preparedBy: ics205PreparedBy(net.ncs_callsign, net.ncs_name),
      specialInstructions: net.ics205_special_instructions || '',
      exercise: !!net.has_drill_plan,
    };
  }, [net]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  const canEdit = !!net?.actions?.edit;
  const utcNote = preferUtc ? ' (UTC)' : '';
  const when = (value: string | null) => (value ? `${formDate(value, preferUtc)} ${formTime(value, preferUtc)}${utcNote}` : '');

  return (
    <Container maxWidth="lg" sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
      <Link component={RouterLink} to={`/nets/${id}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <ArrowBackIcon fontSize="small" /> {net?.name || 'Back to the net'}
      </Link>

      {/* ========== HEADER ========== */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1">ICS-205 Radio Plan</Typography>
          <Typography color="text.secondary">
            Built from the net's Communication Plan tab.
          </Typography>
        </Box>
        {/* Shows once the net has an ICS-205 to download */}
        {net?.ics205_enabled && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {canEdit && (
              <Button variant="outlined" startIcon={<EditIcon />} component={RouterLink} to={`/nets/${id}/edit`}>
                Edit the plan
              </Button>
            )}
            <Button variant="contained" startIcon={<PictureAsPdfIcon />} disabled={!!printing}
              onClick={() => setPrinting(new Date().toISOString())}>
              Download PDF
            </Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ========== NO ICS-205 ON THIS NET ========== */}
      {/* Shows when Build an ICS-205 is off */}
      {net && !net.ics205_enabled && (
        <Alert severity="info">
          This net has no ICS-205. Turn on Build an ICS-205 on the Communication Plan tab of Edit Net.
          {canEdit && (
            <>
              {' '}<Link component={RouterLink} to={`/nets/${id}/edit`}>Edit Net</Link>
            </>
          )}
        </Alert>
      )}

      {net?.ics205_enabled && header && (
        <>
          {/* Shows on a net with a drill plan */}
          {header.exercise && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This net is a drill, so every page of the form is marked THIS IS AN EXERCISE.
            </Alert>
          )}

          {/* ========== BLOCKS 1-3 ========== */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}><Block label="1. Incident name">{header.incidentName}</Block></Grid>
              <Grid item xs={12} sm={6} md={3}><Block label="2. Date/time prepared">When you download it</Block></Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Block label="3. Operational period">
                  {when(header.periodFrom) || 'Not set'}
                  {header.periodTo ? ` to ${when(header.periodTo)}` : ''}
                </Block>
              </Grid>
            </Grid>
          </Paper>

          {/* ========== BLOCK 4: BASIC RADIO CHANNEL USE ========== */}
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>4. Basic radio channel use</Typography>
          {/* Wide, so it scrolls sideways in its own box on a phone */}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 960 }}>
              <TableHead>
                <TableRow>
                  {ICS205_COLUMNS.map((c) => (
                    <TableCell key={c.key} sx={{ fontWeight: 600, verticalAlign: 'bottom' }}>{c.heading}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    {ICS205_COLUMNS.map((c) => (
                      <TableCell key={c.key} sx={c.nowrap ? { whiteSpace: 'nowrap' } : undefined}>{r[c.key]}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {/* Shows when the net has no frequencies */}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={ICS205_COLUMNS.length}>
                      <Typography variant="body2" color="text.secondary">No channels. Add frequencies on the Communication Plan tab.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* ========== BLOCKS 5 AND 6 ========== */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Block label="5. Special instructions">{header.specialInstructions || 'None'}</Block>
              </Grid>
              <Grid item xs={12}>
                <Block label="6. Prepared by (Communications Unit Leader)">{header.preparedBy || 'No NCS yet. Left blank to write in.'}</Block>
              </Grid>
            </Grid>
          </Paper>
        </>
      )}

      {/* Off-screen print view, mounted only while the PDF is built. Off
          canvas rather than display:none, since it measures its own pages. */}
      {printing && header && (
        <Box sx={{ position: 'fixed', top: 0, left: -99999, width: 1100, overflow: 'hidden' }}>
          <ICS205PrintView
            id="ics205-print"
            header={header}
            rows={rows}
            preferUtc={preferUtc}
            preparedAt={printing}
            onReady={() => {
              exportPagesToPdf('ics205-print', {
                filename: `ICS205_${(net?.name || 'net').replace(/ /g, '_')}`,
                orientation: 'landscape',
              })
                .catch((err) => setError(getErrorMessage(err, "Couldn't build the PDF")))
                .finally(() => setPrinting(null));
            }}
          />
        </Box>
      )}
    </Container>
  );
};

export default Ics205Page;

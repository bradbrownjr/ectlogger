import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Skeleton,
  Alert,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  Tabs,
  Tab,
} from '@mui/material';
import {
  ArrowBack,
  TrendingUp,
  People,
  Event,
  BarChart as BarChartIconMui,
  Link as LinkIcon,
  PictureAsPdf as PictureAsPdfIcon,
  EmojiEvents as EmojiEventsIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { statisticsApi, templateApi, netApi } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { exportElementToPdf } from '../utils/pdfExport';

interface RegularOperator {
  callsign: string;
  appearances: number;
  percentage: number;
}

interface RoleLeaderEntry {
  user_id: number;
  callsign: string | null;
  name: string | null;
  nets_count: number;
}

interface RelayLeaderEntry {
  callsign: string;
  nets_count: number;
  relays_count: number;
}

interface NetInstance {
  net_id: number;
  name?: string;
  date: string | null;
  closed_at?: string | null;
  check_in_count: number;
  unique_operators: number;
  ncs_callsigns?: string[];
}

interface TemplateStats {
  template_id: number;
  template_name: string;
  template_owner_id?: number;
  filter_days?: number;
  total_instances: number;
  total_check_ins: number;
  avg_check_ins_per_instance: number;
  unique_operators: number;
  regular_operators: RegularOperator[];
  check_in_leaderboard?: RegularOperator[];
  ncs_leaderboard?: RoleLeaderEntry[];
  logger_leaderboard?: RoleLeaderEntry[];
  relay_leaderboard?: RelayLeaderEntry[];
  instances: NetInstance[];
}

// Time-window filter values that map directly to the backend ?days= param.
// 0 means "all time" on the backend.
type WindowDays = 30 | 90 | 365 | 0;
const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
  { value: 0, label: 'All' },
];

// ========== LEADERBOARD TABLE ==========
// Small reusable table for the four leaderboards. Adds a medal icon to the
// top three rows so readers can spot the top performers quickly.
interface LeaderboardRow {
  key: string;
  cells: React.ReactNode[];
}
const MEDALS = ['🥇', '🥈', '🥉'];
const LeaderboardTable: React.FC<{
  columns: string[];
  rows: LeaderboardRow[];
  emptyMessage: string;
}> = ({ columns, rows, emptyMessage }) => {
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        {emptyMessage}
      </Typography>
    );
  }
  return (
    <TableContainer sx={{ maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((c, idx) => (
              <TableCell key={c} align={idx === 0 ? 'left' : 'right'}>{c}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={row.key} hover>
              {row.cells.map((cell, cidx) => (
                <TableCell key={cidx} align={cidx === 0 ? 'left' : 'right'}>
                  {cidx === 0 ? (
                    <Typography component="span" fontWeight={idx < 3 ? 'bold' : 'normal'}>
                      {idx < 3 ? MEDALS[idx] + ' ' : ''}{cell}
                    </Typography>
                  ) : (
                    cell
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

interface LinkableNet {
  id: number;
  name: string;
  status: string | null;
  started_at: string | null;
  closed_at: string | null;
  owner_callsign: string | null;
  current_template_id: number | null;
}

const ScheduleStatistics: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TemplateStats | null>(null);

  // Time-window filter for stats. Default 30 days; persists across schedules
  // for the lifetime of the page. Triggers a refetch when changed.
  const [windowDays, setWindowDays] = useState<WindowDays>(30);

  // Which leaderboard tab is active.
  const [leaderboardTab, setLeaderboardTab] = useState<0 | 1 | 2 | 3>(0);

  // PDF export state
  const [exporting, setExporting] = useState(false);

  // ========== LINK EXISTING NET DIALOG STATE ==========
  // Lets the schedule owner (or admin) attach an ad-hoc net to this schedule
  // so its check-ins start counting against the schedule's stats.
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkableNets, setLinkableNets] = useState<LinkableNet[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [linkableError, setLinkableError] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<number | ''>('');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  // Caller can manage this schedule if they own it or are an admin.
  const canManageSchedule = !!(
    stats &&
    user &&
    (user.role === 'admin' || stats.template_owner_id === user.id)
  );

  const refetchStats = async () => {
    if (!templateId) return;
    const response = await statisticsApi.getTemplateStats(parseInt(templateId), windowDays);
    setStats(response.data);
  };

  const openLinkDialog = async () => {
    if (!templateId) return;
    setLinkDialogOpen(true);
    setSelectedNetId('');
    setLinkableError(null);
    setLinkableLoading(true);
    try {
      const resp = await templateApi.linkableNets(parseInt(templateId));
      setLinkableNets(resp.data);
    } catch (err: any) {
      setLinkableError(err.response?.data?.detail || 'Failed to load linkable nets');
    } finally {
      setLinkableLoading(false);
    }
  };

  const submitLink = async () => {
    if (!templateId || selectedNetId === '') return;
    setLinkSubmitting(true);
    setLinkableError(null);
    try {
      await netApi.linkToTemplate(Number(selectedNetId), parseInt(templateId));
      setLinkDialogOpen(false);
      setLinkSuccess('Net linked to this schedule.');
      await refetchStats();
    } catch (err: any) {
      setLinkableError(err.response?.data?.detail || 'Failed to link net');
    } finally {
      setLinkSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      if (!templateId) return;
      
      try {
        setLoading(true);
        const response = await statisticsApi.getTemplateStats(parseInt(templateId), windowDays);
        setStats(response.data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch schedule statistics:', err);
        setError(err.response?.data?.detail || 'Failed to load schedule statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [templateId, windowDays]);

  // Export the stats container to PDF. We export the inner content div so the
  // page header / toolbar buttons aren't included in the report.
  const handleExportPdf = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      const filename = `${(stats.template_name || 'Schedule').replace(/[^a-zA-Z0-9]/g, '_')}_Statistics`;
      await exportElementToPdf('schedule-stats-content', {
        filename,
        orientation: 'portrait',
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="text" width={300} height={40} />
        <Grid container spacing={3} sx={{ mt: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rectangular" height={300} sx={{ mt: 3, borderRadius: 1 }} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/scheduler')}
          sx={{ mt: 2 }}
        >
          Back to Scheduler
        </Button>
      </Container>
    );
  }

  if (!stats) {
    return null;
  }

  // Prepare instances data for trend chart (reverse to show oldest first)
  const instancesChartData = [...stats.instances]
    .reverse()
    .map((instance, index) => ({
      name: instance.date 
        ? new Date(instance.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : `Net ${index + 1}`,
      checkIns: instance.check_in_count,
      operators: instance.unique_operators,
      net_id: instance.net_id,
    }));

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header (excluded from PDF export) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <IconButton onClick={() => navigate('/scheduler')}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
          <Typography variant="h5" fontWeight="bold">
            {stats.template_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Historical statistics for this scheduled net series
          </Typography>
        </Box>
        {/* ========== TIME WINDOW FILTER ========== */}
        {/* Applies to all stats below: instance count, check-in counts,
            leaderboards, and history log. Default 30 days. 0 = all-time. */}
        <ToggleButtonGroup
          value={windowDays}
          exclusive
          size="small"
          onChange={(_, v) => v !== null && setWindowDays(v as WindowDays)}
          aria-label="Time window"
        >
          {WINDOW_OPTIONS.map((opt) => (
            <ToggleButton key={opt.value} value={opt.value} aria-label={opt.label}>
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {/* Schedule owners and admins can pull an existing ad-hoc net into this schedule */}
        {canManageSchedule && (
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={openLinkDialog}
          >
            Link Existing Net
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<PictureAsPdfIcon />}
          onClick={handleExportPdf}
          disabled={exporting}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<Event />}
          onClick={() => navigate('/scheduler')}
        >
          Back to Scheduler
        </Button>
      </Box>

      {/* ========== EXPORTABLE STATS CONTENT ========== */}
      {/* Everything inside #schedule-stats-content is captured by the PDF
          export. The header/toolbar above intentionally sits outside it. */}
      <Box id="schedule-stats-content">
        {/* PDF-only header so the exported document has a title block */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="h5" fontWeight="bold">
            {stats.template_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Schedule Performance Report — {WINDOW_OPTIONS.find(o => o.value === windowDays)?.label || ''}
            {windowDays === 0 ? ' (all-time)' : ''}
          </Typography>
        </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Event color="primary" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.total_instances}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Net Instances
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <TrendingUp color="success" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.total_check_ins}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Check-ins
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <BarChartIconMui color="info" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.avg_check_ins_per_instance}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg per Net
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <People color="secondary" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.unique_operators}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unique Operators
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Check-ins Over Time */}
        {instancesChartData.length > 1 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Check-ins Over Time
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={instancesChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="checkIns" 
                    name="Check-ins"
                    stroke={theme.palette.primary.main} 
                    strokeWidth={2}
                    dot={{ fill: theme.palette.primary.main }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="operators" 
                    name="Unique Operators"
                    stroke={theme.palette.secondary.main} 
                    strokeWidth={2}
                    dot={{ fill: theme.palette.secondary.main }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* ========== LEADERBOARDS ========== */}
        {/* Tabbed view: Check-ins / NCS / Logger / Relay. All scoped to the
            currently-selected time window. Counts represent distinct nets
            within the window, not raw event counts. */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <EmojiEventsIcon color="warning" />
              <Typography variant="h6">Leaderboards</Typography>
            </Box>
            <Tabs
              value={leaderboardTab}
              onChange={(_, v) => setLeaderboardTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ mb: 1 }}
            >
              <Tab label={`Check-ins (${stats.check_in_leaderboard?.length ?? stats.regular_operators.length})`} />
              <Tab label={`NCS (${stats.ncs_leaderboard?.length ?? 0})`} />
              <Tab label={`Logger (${stats.logger_leaderboard?.length ?? 0})`} />
              <Tab label={`Relay (${stats.relay_leaderboard?.length ?? 0})`} />
            </Tabs>

            {/* Check-in leaderboard */}
            {leaderboardTab === 0 && (
              <LeaderboardTable
                emptyMessage="No check-ins recorded in this window."
                columns={['Callsign', 'Nets', 'Participation']}
                rows={(stats.check_in_leaderboard ?? stats.regular_operators).map((op) => ({
                  key: op.callsign,
                  cells: [
                    op.callsign,
                    op.appearances,
                    <Chip
                      key="pct"
                      label={`${op.percentage}%`}
                      size="small"
                      color={op.percentage >= 80 ? 'success' : op.percentage >= 50 ? 'info' : 'default'}
                    />,
                  ],
                }))}
              />
            )}

            {/* NCS leaderboard */}
            {leaderboardTab === 1 && (
              <LeaderboardTable
                emptyMessage="No NCS assignments recorded in this window."
                columns={['Operator', 'Nets Run']}
                rows={(stats.ncs_leaderboard ?? []).map((row) => ({
                  key: String(row.user_id),
                  cells: [
                    row.callsign
                      ? `${row.callsign}${row.name ? ' (' + row.name + ')' : ''}`
                      : (row.name || `User #${row.user_id}`),
                    row.nets_count,
                  ],
                }))}
              />
            )}

            {/* Logger leaderboard */}
            {leaderboardTab === 2 && (
              <LeaderboardTable
                emptyMessage="No Logger assignments recorded in this window."
                columns={['Operator', 'Nets Logged']}
                rows={(stats.logger_leaderboard ?? []).map((row) => ({
                  key: String(row.user_id),
                  cells: [
                    row.callsign
                      ? `${row.callsign}${row.name ? ' (' + row.name + ')' : ''}`
                      : (row.name || `User #${row.user_id}`),
                    row.nets_count,
                  ],
                }))}
              />
            )}

            {/* Relay leaderboard — derived from CheckIn.relayed_by */}
            {leaderboardTab === 3 && (
              <LeaderboardTable
                emptyMessage="No relayed check-ins recorded in this window."
                columns={['Callsign', 'Nets', 'Total Relays']}
                rows={(stats.relay_leaderboard ?? []).map((row) => ({
                  key: row.callsign,
                  cells: [row.callsign, row.nets_count, row.relays_count],
                }))}
              />
            )}
          </Paper>
        </Grid>

        {/* ========== HISTORY LOG (Recent Net Instances) ========== */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Net History
            </Typography>
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>NCS</TableCell>
                    <TableCell align="right">Check-ins</TableCell>
                    <TableCell align="right">Operators</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.instances.map((instance) => (
                    <TableRow key={instance.net_id} hover>
                      <TableCell>
                        {instance.date 
                          ? formatDateTime(instance.date, user?.prefer_utc || false)
                          : '—'
                        }
                      </TableCell>
                      <TableCell>
                        {instance.ncs_callsigns && instance.ncs_callsigns.length > 0
                          ? instance.ncs_callsigns.join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell align="right">{instance.check_in_count}</TableCell>
                      <TableCell align="right">{instance.unique_operators}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="View net statistics">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/statistics/nets/${instance.net_id}`)}
                          >
                            <BarChartIconMui fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {stats.instances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography color="text.secondary" sx={{ py: 2 }}>
                          No nets in the selected time window.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
      </Box>{/* end #schedule-stats-content */}

      {/* ========== LINK EXISTING NET DIALOG ========== */}
      {/* Owner/admin selects one of their nets that is not already attached to this
          schedule and links it. After success, the net's check-ins will count toward
          this schedule's stats. */}
      <Dialog
        open={linkDialogOpen}
        onClose={() => !linkSubmitting && setLinkDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Link Existing Net to {stats.template_name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Attach a net that was started outside this schedule (for example an
            ad-hoc net) so its check-ins count toward this schedule's statistics.
          </Typography>
          {linkableError && (
            <Alert severity="error" sx={{ mb: 2 }}>{linkableError}</Alert>
          )}
          {linkableLoading ? (
            <Skeleton variant="rectangular" height={56} />
          ) : linkableNets.length === 0 ? (
            <Alert severity="info">
              No eligible nets to link. You can only link nets you own that are not
              already attached to this schedule.
            </Alert>
          ) : (
            <TextField
              select
              fullWidth
              label="Net to link"
              value={selectedNetId}
              onChange={(e) => setSelectedNetId(Number(e.target.value))}
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 400 } } } }}
            >
              {linkableNets.map((n) => {
                const dateLabel = n.started_at
                  ? formatDateTime(n.started_at, user?.prefer_utc || false)
                  : 'not started';
                const detached = n.current_template_id == null
                  ? 'unscheduled'
                  : `currently linked to schedule #${n.current_template_id}`;
                return (
                  <MenuItem key={n.id} value={n.id}>
                    <Box>
                      <Typography variant="body2">
                        #{n.id} — {n.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {dateLabel} · {n.status || 'unknown'} · {detached}
                      </Typography>
                    </Box>
                  </MenuItem>
                );
              })}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)} disabled={linkSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitLink}
            disabled={selectedNetId === '' || linkSubmitting}
          >
            {linkSubmitting ? 'Linking…' : 'Link Net'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!linkSuccess}
        autoHideDuration={4000}
        onClose={() => setLinkSuccess(null)}
        message={linkSuccess || ''}
      />
    </Container>
  );
};

export default ScheduleStatistics;

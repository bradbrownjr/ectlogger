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
} from '@mui/material';
import {
  ArrowBack,
  TrendingUp,
  People,
  Event,
  BarChart as BarChartIconMui,
  Link as LinkIcon,
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

interface RegularOperator {
  callsign: string;
  appearances: number;
  percentage: number;
}

interface NetInstance {
  net_id: number;
  date: string | null;
  check_in_count: number;
  unique_operators: number;
}

interface TemplateStats {
  template_id: number;
  template_name: string;
  template_owner_id?: number;
  total_instances: number;
  total_check_ins: number;
  avg_check_ins_per_instance: number;
  unique_operators: number;
  regular_operators: RegularOperator[];
  instances: NetInstance[];
}

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
    const response = await statisticsApi.getTemplateStats(parseInt(templateId));
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
        const response = await statisticsApi.getTemplateStats(parseInt(templateId));
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
  }, [templateId]);

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
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/scheduler')}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight="bold">
            {stats.template_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Historical statistics for this scheduled net series
          </Typography>
        </Box>
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
          startIcon={<Event />}
          onClick={() => navigate('/scheduler')}
        >
          Back to Scheduler
        </Button>
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

        {/* Regular Operators */}
        {stats.regular_operators.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Regular Operators
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Operators who participated in 50%+ of nets
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Callsign</TableCell>
                      <TableCell align="right">Appearances</TableCell>
                      <TableCell align="right">Participation</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats.regular_operators.map((op, index) => (
                      <TableRow key={op.callsign}>
                        <TableCell>
                          <Typography fontWeight={index < 3 ? 'bold' : 'normal'}>
                            {index < 3 ? ['🥇', '🥈', '🥉'][index] + ' ' : ''}{op.callsign}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{op.appearances}</TableCell>
                        <TableCell align="right">
                          <Chip 
                            label={`${op.percentage}%`}
                            size="small"
                            color={op.percentage >= 80 ? 'success' : op.percentage >= 60 ? 'info' : 'default'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}

        {/* Recent Net Instances */}
        <Grid item xs={12} md={stats.regular_operators.length > 0 ? 6 : 12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Net Instances
            </Typography>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
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
                      <TableCell colSpan={4} align="center">
                        <Typography color="text.secondary" sx={{ py: 2 }}>
                          No nets have been created from this schedule yet
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

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
  Chip,
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
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack,
  Timer,
  People,
  Refresh,
  TrendingUp,
  Radio,
  PictureAsPdf,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { statisticsApi } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { exportElementToPdf } from '../utils/pdfExport';

interface TimeSeriesDataPoint {
  label: string;
  value: number;
  date: string;
}

interface TopOperator {
  callsign: string;
  check_in_count: number;
}

interface NetStats {
  net_id: number;
  net_name: string;
  status: string;
  total_check_ins: number;
  unique_callsigns: number;
  rechecks: number;
  duration_minutes: number | null;
  started_at: string | null;
  closed_at: string | null;
  status_counts: Record<string, number>;
  check_ins_timeline: TimeSeriesDataPoint[];
  top_operators: TopOperator[];
  check_ins_by_frequency: Record<string, number>;
}

const NetStatistics: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);
  const [exporting, setExporting] = useState(false);

  // Handle PDF export
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const filename = stats?.net_name 
        ? `${stats.net_name.replace(/[^a-zA-Z0-9]/g, '_')}_Statistics`
        : 'Net_Statistics';
      await exportElementToPdf('net-stats-content', {
        filename,
        orientation: 'portrait',
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      if (!netId) return;
      
      try {
        setLoading(true);
        const response = await statisticsApi.getNetStats(parseInt(netId));
        setStats(response.data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch net statistics:', err);
        setError(err.response?.data?.detail || 'Failed to load net statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [netId]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Colors for pie chart
  const COLORS = [
    theme.palette.success.main,
    theme.palette.info.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.primary.main,
    theme.palette.secondary.main,
  ];

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
          onClick={() => navigate(-1)}
          sx={{ mt: 2 }}
        >
          Go Back
        </Button>
      </Container>
    );
  }

  if (!stats) {
    return null;
  }

  // Prepare data for status pie chart
  const statusData = Object.entries(stats.status_counts).map(([name, value]) => ({
    name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value,
  }));

  // Prepare data for frequency bar chart
  const frequencyData = Object.entries(stats.check_ins_by_frequency).map(([name, value]) => ({
    name,
    count: value,
  }));

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight="bold">
            {stats.net_name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Chip
              label={stats.status.toUpperCase()}
              color={stats.status === 'active' ? 'success' : stats.status === 'closed' ? 'default' : 'info'}
              size="small"
            />
            {stats.started_at && (
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(stats.started_at, user?.prefer_utc || false)}
                {stats.closed_at && ` — ${formatDateTime(stats.closed_at, user?.prefer_utc || false)}`}
              </Typography>
            )}
          </Box>
        </Box>
        <Tooltip title="Export to PDF">
          <Button
            variant="outlined"
            onClick={handleExportPdf}
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} /> : <PictureAsPdf />}
          >
            {exporting ? 'Exporting...' : 'PDF'}
          </Button>
        </Tooltip>
        <Button
          variant="outlined"
          startIcon={<Radio />}
          onClick={() => navigate(`/nets/${stats.net_id}`)}
        >
          View Net
        </Button>
      </Box>

      {/* Content wrapper for PDF export */}
      <Box id="net-stats-content">
        {/* Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
              <TrendingUp color="primary" sx={{ fontSize: 32 }} />
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
              <People color="info" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.unique_callsigns}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unique Operators
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Refresh color="warning" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.rechecks}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Re-checks
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Timer color="secondary" sx={{ fontSize: 32 }} />
              <Typography variant="h4" fontWeight="bold">
                {stats.duration_minutes ? formatDuration(stats.duration_minutes) : '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Duration
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Status Breakdown */}
        {statusData.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Check-in Status
              </Typography>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* Check-ins by Frequency */}
        {frequencyData.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Check-ins by Frequency
              </Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={frequencyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                  <Bar dataKey="count" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* Top Operators */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Top Operators
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Callsign</TableCell>
                    <TableCell align="right">Check-ins</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.top_operators.map((op, index) => (
                    <TableRow key={op.callsign}>
                      <TableCell>
                        {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={index < 3 ? 'bold' : 'normal'}>
                          {op.callsign}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{op.check_in_count}</TableCell>
                    </TableRow>
                  ))}
                  {stats.top_operators.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography color="text.secondary">No check-ins yet</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
      </Box>
    </Container>
  );
};

export default NetStatistics;

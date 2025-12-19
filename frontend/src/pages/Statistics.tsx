import React, { useState, useEffect } from 'react';
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
  Tabs,
  Tab,
  Chip,
  useTheme,
  useMediaQuery,
  Button,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  TrendingUp,
  People,
  Radio,
  Today,
  DateRange,
  CalendarMonth,
  PictureAsPdf,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { statisticsApi } from '../services/api';
import { exportElementToPdf } from '../utils/pdfExport';

interface TimeSeriesDataPoint {
  label: string;
  value: number;
  date: string;
}

interface GlobalStats {
  total_nets: number;
  total_check_ins: number;
  total_users: number;
  unique_operators: number;
  active_nets: number;
  nets_last_24h: number;
  nets_last_7_days: number;
  nets_last_30_days: number;
  check_ins_last_24h: number;
  check_ins_last_7_days: number;
  avg_check_ins_per_net: number;
  nets_per_day: TimeSeriesDataPoint[];
  nets_per_week: TimeSeriesDataPoint[];
  check_ins_per_day: TimeSeriesDataPoint[];
  unique_operators_per_week: TimeSeriesDataPoint[];
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color }) => {
  const theme = useTheme();
  
  return (
    <Card 
      elevation={2}
      sx={{ 
        height: '100%',
        background: theme.palette.mode === 'dark' 
          ? `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${color || theme.palette.primary.dark}22 100%)`
          : `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${color || theme.palette.primary.light}22 100%)`,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" component="div" fontWeight="bold">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box 
            sx={{ 
              color: color || theme.palette.primary.main,
              opacity: 0.8,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const Statistics: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [chartTab, setChartTab] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Handle PDF export
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportElementToPdf('stats-content', {
        filename: 'ECTLogger_Statistics',
        orientation: 'landscape',
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await statisticsApi.getGlobal();
        setStats(response.data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch statistics:', err);
        setError(err.response?.data?.detail || 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const chartColors = {
    primary: theme.palette.primary.main,
    secondary: theme.palette.secondary.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          <Skeleton width={200} />
        </Typography>
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={i}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 4 }}>
          <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 1 }} />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header with PDF export button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BarChartIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              ECTLogger Statistics
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Platform activity and usage trends
            </Typography>
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
      </Box>

      {/* Content wrapper for PDF export */}
      <Box id="stats-content">
        {/* Summary Stats Cards */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
            title="Total Nets"
            value={stats.total_nets}
            icon={<Radio sx={{ fontSize: 32 }} />}
            color={theme.palette.primary.main}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Total Check-ins"
            value={stats.total_check_ins}
            icon={<TrendingUp sx={{ fontSize: 32 }} />}
            color={theme.palette.success.main}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Registered Users"
            value={stats.total_users}
            icon={<People sx={{ fontSize: 32 }} />}
            color={theme.palette.info.main}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Unique Operators"
            value={stats.unique_operators}
            subtitle="Distinct callsigns"
            icon={<People sx={{ fontSize: 32 }} />}
            color={theme.palette.warning.main}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Active Now"
            value={stats.active_nets}
            subtitle="Nets in progress"
            icon={<Radio sx={{ fontSize: 32 }} />}
            color={theme.palette.error.main}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Avg Check-ins"
            value={stats.avg_check_ins_per_net}
            subtitle="Per net"
            icon={<TrendingUp sx={{ fontSize: 32 }} />}
            color={theme.palette.secondary.main}
          />
        </Grid>
      </Grid>

      {/* Recent Activity Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Today color="primary" />
              <Typography variant="h6">Last 24 Hours</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Chip 
                label={`${stats.nets_last_24h} nets`} 
                color="primary" 
                variant="outlined" 
              />
              <Chip 
                label={`${stats.check_ins_last_24h} check-ins`} 
                color="success" 
                variant="outlined" 
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <DateRange color="primary" />
              <Typography variant="h6">Last 7 Days</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Chip 
                label={`${stats.nets_last_7_days} nets`} 
                color="primary" 
                variant="outlined" 
              />
              <Chip 
                label={`${stats.check_ins_last_7_days} check-ins`} 
                color="success" 
                variant="outlined" 
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CalendarMonth color="primary" />
              <Typography variant="h6">Last 30 Days</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Chip 
                label={`${stats.nets_last_30_days} nets`} 
                color="primary" 
                variant="outlined" 
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Paper sx={{ p: 3 }}>
        <Tabs 
          value={chartTab} 
          onChange={(_, v) => setChartTab(v)}
          sx={{ mb: 3 }}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons="auto"
        >
          <Tab label="Nets (Daily)" />
          <Tab label="Nets (Weekly)" />
          <Tab label="Check-ins (Daily)" />
          <Tab label="Operators (Weekly)" />
        </Tabs>

        {/* Nets per Day Chart */}
        {chartTab === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Nets Started Per Day (Last 30 Days)
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={stats.nets_per_day}>
                <defs>
                  <linearGradient id="colorNets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                  interval={isMobile ? 4 : 2}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  name="Nets"
                  stroke={chartColors.primary} 
                  fillOpacity={1}
                  fill="url(#colorNets)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Nets per Week Chart */}
        {chartTab === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Nets Per Week (Last 6 Months)
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={stats.nets_per_week}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                  interval={isMobile ? 4 : 2}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <Bar 
                  dataKey="value" 
                  name="Nets"
                  fill={chartColors.primary}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Check-ins per Day Chart */}
        {chartTab === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Check-ins Per Day (Last 30 Days)
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={stats.check_ins_per_day}>
                <defs>
                  <linearGradient id="colorCheckins" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.success} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={chartColors.success} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                  interval={isMobile ? 4 : 2}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  name="Check-ins"
                  stroke={chartColors.success} 
                  fillOpacity={1}
                  fill="url(#colorCheckins)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Unique Operators per Week Chart */}
        {chartTab === 3 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Unique Operators Per Week (Last 6 Months)
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={stats.unique_operators_per_week}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                  interval={isMobile ? 4 : 2}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  name="Operators"
                  stroke={chartColors.warning} 
                  strokeWidth={2}
                  dot={{ fill: chartColors.warning, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Paper>
      </Box>
    </Container>
  );
};

export default Statistics;

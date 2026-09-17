import React, { useState, useRef, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useApiData from '../hooks/useApiData';
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
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  TrendingUp,
  People,
  Radio,
  DateRange,
  PictureAsPdf,
  Mail as MailIcon,
  EmojiEvents,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
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
import GlobalCheckInMap from '../components/GlobalCheckInMap';

interface TimeSeriesDataPoint {
  label: string;
  value: number;
  date: string;
}

interface TopNetEntry {
  template_id: number;
  template_name: string;
  total_check_ins: number;
  occurrence_count: number;
}

interface GlobalStats {
  total_nets: number;
  total_check_ins: number;
  total_users: number;
  unique_operators: number;
  active_nets: number;
  window_nets: number;
  window_check_ins: number;
  window_unique_operators: number;
  window_avg_check_ins_per_net: number;
  // Assisted Traffic Handling: distinct forms with any log entry
  // platform-wide, broken out by action. See
  // TRAFFIC-HANDLING-DESIGN.md section 3.5.
  traffic_handled: number;
  traffic_by_action: Record<string, number>;
  top_nets: TopNetEntry[];
  nets_over_time: TimeSeriesDataPoint[];
  check_ins_over_time: TimeSeriesDataPoint[];
  unique_operators_over_time: TimeSeriesDataPoint[];
}

// Window options shared by the selector, the activity cards, the scoreboard,
// and the chart titles -- one flip of this toggle drives every windowed
// figure on the page (see ROADMAP.md "Most-attended nets scoreboard").
const WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: 'Week' },
  { value: 30, label: 'Month' },
  { value: 182, label: '6 Months' },
  { value: 365, label: 'Year' },
  { value: 0, label: 'All Time' },
];

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
  const [windowDays, setWindowDays] = useState(30);
  const { data: stats, loading, error, refetch } = useApiData<GlobalStats>(
    () => statisticsApi.getGlobal(windowDays).then((r) => r.data),
  );
  // useApiData already fetches on mount; only refetch here on a later change
  // of windowDays, or the selector's own default would fire a duplicate
  // request alongside the hook's initial one.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  }, [windowDays, refetch]);
  const windowLabel = WINDOW_OPTIONS.find(o => o.value === windowDays)?.label ?? 'Month';
  const [chartTab, setChartTab] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Swipe-to-switch tabs on touch
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchOnScrollable = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    // If the gesture starts inside a horizontally-scrollable element, let it scroll
    // natively instead of hijacking the drag as a tab swipe.
    touchOnScrollable.current = false;
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth) {
        touchOnScrollable.current = true;
        break;
      }
      el = el.parentElement;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (touchOnScrollable.current) return;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;
    setChartTab(v => deltaX < 0 ? Math.min(v + 1, 2) : Math.max(v - 1, 0));
  };

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
      {/* Header with window selector and PDF export button */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BarChartIcon sx={{ fontSize: 32, color: 'text.primary' }} />
          Statistics
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={windowDays}
            onChange={(_e, v) => v !== null && setWindowDays(v)}
          >
            {WINDOW_OPTIONS.map(opt => (
              <ToggleButton key={opt.value} value={opt.value} sx={{ px: { xs: 1, sm: 1.5 } }}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
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
            value={stats.window_avg_check_ins_per_net}
            subtitle={`Per net, ${windowLabel}`}
            icon={<TrendingUp sx={{ fontSize: 32 }} />}
            color={theme.palette.secondary.main}
          />
        </Grid>
        {/* Assisted Traffic Handling tile — only shown once there's any platform-wide */}
        {stats.traffic_handled > 0 && (
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              title="Traffic Handled"
              value={stats.traffic_handled}
              subtitle="Radiograms & forms"
              icon={<MailIcon sx={{ fontSize: 32 }} />}
              color={theme.palette.error.main}
            />
          </Grid>
        )}
      </Grid>

      {/* Windowed Activity + Most-Attended Nets Scoreboard */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <DateRange color="primary" />
              <Typography variant="h6">Activity — {windowLabel}</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Chip
                label={`${stats.window_nets} nets`}
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`${stats.window_check_ins} check-ins`}
                color="success"
                variant="outlined"
              />
              <Chip
                label={`${stats.window_unique_operators} operators`}
                color="warning"
                variant="outlined"
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <EmojiEvents color="primary" />
              <Typography variant="h6">Most-Attended Nets — {windowLabel}</Typography>
            </Box>
            {stats.top_nets.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No scheduled-net activity in this window yet.
              </Typography>
            ) : (
              <List dense disablePadding>
                {stats.top_nets.map((entry, i) => (
                  <ListItemButton
                    key={entry.template_id}
                    component={RouterLink}
                    to={`/statistics/schedules/${entry.template_id}`}
                    sx={{ borderRadius: 1, px: 1 }}
                  >
                    <ListItemText
                      primary={`${i + 1}. ${entry.template_name}`}
                      secondary={`${entry.occurrence_count} net${entry.occurrence_count === 1 ? '' : 's'} held`}
                    />
                    <Chip size="small" label={`${entry.total_check_ins} check-ins`} color="primary" variant="outlined" />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Paper sx={{ p: 3 }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <Tabs
          value={chartTab}
          onChange={(_, v) => setChartTab(v)}
          variant="scrollable"
          scrollButtons={false}
          sx={{
            mb: 3,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { minWidth: { xs: 80, sm: 110 }, px: { xs: 1, sm: 2 } },
          }}
        >
          <Tab label="Nets" />
          <Tab label="Check-ins" />
          <Tab label="Operators" />
        </Tabs>

        {/* Nets over Time Chart */}
        {chartTab === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Nets Started — {windowLabel}
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={stats.nets_over_time}>
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
                <RechartsTooltip
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

        {/* Check-ins over Time Chart */}
        {chartTab === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Check-ins — {windowLabel}
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={stats.check_ins_over_time}>
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
                <RechartsTooltip
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

        {/* Unique Operators over Time Chart */}
        {chartTab === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Unique Operators — {windowLabel}
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={stats.unique_operators_over_time}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  interval={isMobile ? 4 : 2}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartsTooltip
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

      {/* ========== Check-In Geographic Map ========== */}
      {/* Shows approximate regions where check-ins have originated */}
      <GlobalCheckInMap />
      </Box>
    </Container>
  );
};

export default Statistics;

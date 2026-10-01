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
  ListItem,
  ListItemButton,
  ListItemText,
  Link,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  TrendingUp,
  People,
  Radio,
  PictureAsPdf,
  Mail as MailIcon,
  EmojiEvents,
  Star,
} from '@mui/icons-material';
import {
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
import UserProfileDialog from '../components/UserProfileDialog';

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

interface TopOperatorEntry {
  callsign: string;
  first_name: string | null;
  user_id: number | null;
  nets_attended: number;
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
  window_new_operators: number;
  window_traffic_handled: number;
  avg_check_ins_per_net: number;
  // Assisted Traffic Handling: distinct forms with any log entry
  // platform-wide, broken out by action. See
  // TRAFFIC-HANDLING-DESIGN.md section 3.5.
  traffic_handled: number;
  traffic_by_action: Record<string, number>;
  top_nets: TopNetEntry[];
  top_operators: TopOperatorEntry[];
  nets_over_time: TimeSeriesDataPoint[];
  check_ins_over_time: TimeSeriesDataPoint[];
  unique_operators_over_time: TimeSeriesDataPoint[];
  traffic_over_time: TimeSeriesDataPoint[];
}

// Window options for the selector. One flip of this toggle drives every
// figure below the "All-time totals" row: the period summary, the charts,
// both scoreboards and the check-in map. `heading` names the period above that section; the
// windows are rolling (Month is the last 30 days, not the calendar month).
const WINDOW_OPTIONS: { value: number; label: string; heading: string }[] = [
  { value: 7, label: 'Week', heading: 'Last 7 days' },
  { value: 30, label: 'Month', heading: 'Last 30 days' },
  { value: 182, label: '6 Months', heading: 'Last 6 months' },
  { value: 365, label: 'Year', heading: 'Last 12 months' },
  { value: 0, label: 'All Time', heading: 'All time' },
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
  const windowHeading = WINDOW_OPTIONS.find(o => o.value === windowDays)?.heading ?? 'Last 30 days';
  const [chartTab, setChartTab] = useState(0);
  // Profile popup for the most-active operators scoreboard: an account
  // opens by user id, a guest callsign by callsign.
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [profileCallsign, setProfileCallsign] = useState<string | null>(null);
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
    setChartTab(v => deltaX < 0 ? Math.min(v + 1, 3) : Math.max(v - 1, 0));
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

  // Selected-period figures shown above the charts
  const periodFigures = [
    { label: 'Nets', value: stats.window_nets, color: theme.palette.primary.main },
    { label: 'Check-ins', value: stats.window_check_ins, color: theme.palette.success.main },
    { label: 'Operators', value: stats.window_unique_operators, color: theme.palette.warning.main },
    { label: 'New operators', value: stats.window_new_operators, color: theme.palette.warning.main },
    { label: 'Avg per net', value: stats.window_avg_check_ins_per_net, color: theme.palette.secondary.main },
    { label: 'Traffic handled', value: stats.window_traffic_handled, color: theme.palette.error.main },
  ];

  // One entry per chart tab, in tab order
  const charts = [
    { key: 'nets', tab: 'Nets', data: stats.nets_over_time, color: theme.palette.primary.main },
    { key: 'checkins', tab: 'Check-ins', data: stats.check_ins_over_time, color: theme.palette.success.main },
    { key: 'operators', tab: 'Operators', data: stats.unique_operators_over_time, color: theme.palette.warning.main },
    { key: 'traffic', tab: 'Traffic', data: stats.traffic_over_time, color: theme.palette.error.main },
  ];
  const activeChart = charts[chartTab];

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
        {/* ========== ALL-TIME TOTALS ========== */}
        {/* Lifetime / current-moment figures: not affected by the window selector */}
        <Typography variant="h6" sx={{ mb: 1.5 }}>All-time totals</Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            mb: 4,
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(7, 1fr)' },
          }}
        >
          <StatCard
            title="Total Nets"
            value={stats.total_nets}
            icon={<Radio sx={{ fontSize: 32 }} />}
            color={theme.palette.primary.main}
          />
          <StatCard
            title="Total Check-ins"
            value={stats.total_check_ins}
            icon={<TrendingUp sx={{ fontSize: 32 }} />}
            color={theme.palette.success.main}
          />
          <StatCard
            title="Registered Users"
            value={stats.total_users}
            icon={<People sx={{ fontSize: 32 }} />}
            color={theme.palette.info.main}
          />
          <StatCard
            title="Unique Operators"
            value={stats.unique_operators}
            subtitle="Distinct callsigns"
            icon={<People sx={{ fontSize: 32 }} />}
            color={theme.palette.warning.main}
          />
          <StatCard
            title="Avg Check-ins"
            value={stats.avg_check_ins_per_net}
            subtitle="Per net"
            icon={<TrendingUp sx={{ fontSize: 32 }} />}
            color={theme.palette.secondary.main}
          />
          <StatCard
            title="Traffic Handled"
            value={stats.traffic_handled}
            subtitle="Radiograms & forms"
            icon={<MailIcon sx={{ fontSize: 32 }} />}
            color={theme.palette.error.main}
          />
          <StatCard
            title="Active Now"
            value={stats.active_nets}
            subtitle="Nets in progress"
            icon={<Radio sx={{ fontSize: 32 }} />}
            color={theme.palette.error.main}
          />
        </Box>

        {/* ========== SELECTED PERIOD ========== */}
        {/* Everything from here down, the map included, follows the window selector */}
        <Typography variant="h6" sx={{ mb: 1.5 }}>{windowHeading}</Typography>
        {/* ===== Period summary + charts (full width) ===== */}
        <Paper sx={{ p: 3, mb: 2 }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* Period summary figures */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              mb: 2,
              gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(6, 1fr)' },
            }}
          >
            {periodFigures.map(f => (
              <Box key={f.label}>
                <Typography variant="h5" fontWeight="bold" sx={{ color: f.color }}>
                  {f.value.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">{f.label}</Typography>
              </Box>
            ))}
          </Box>

          <Tabs
            value={chartTab}
            onChange={(_, v) => setChartTab(v)}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              mb: 2,
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': { minWidth: { xs: 80, sm: 110 }, px: { xs: 1, sm: 2 } },
            }}
          >
            {charts.map(c => <Tab key={c.key} label={c.tab} />)}
          </Tabs>

          {/* Active chart. Fixed height so the whole card fits on one
              screen; it used to stretch to a neighbouring column and
              reached ~900px with real data. */}
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeChart.data}>
                <defs>
                  <linearGradient id={`color-${activeChart.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={activeChart.color} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={activeChart.color} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  interval={isMobile ? 4 : 2}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name={activeChart.tab}
                  stroke={activeChart.color}
                  fillOpacity={1}
                  fill={`url(#color-${activeChart.key})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* ===== Scoreboards (side by side on desktop; stacked on mobile) ===== */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            {/* Most-attended nets: one row per schedule */}
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <EmojiEvents color="primary" />
                <Typography variant="h6">Most-Attended Nets</Typography>
              </Box>
              {stats.top_nets.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No scheduled-net activity in this period.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {stats.top_nets.map((entry, i) => (
                    <ListItemButton
                      key={entry.template_id}
                      component={RouterLink}
                      to={`/statistics/schedules/${entry.template_id}`}
                      sx={{ borderRadius: 1, px: 1, gap: 1 }}
                    >
                      {/* One line per net so this board matches the operators board's height */}
                      <ListItemText
                        primary={`${i + 1}. ${entry.template_name}`}
                        title={entry.template_name}
                        primaryTypographyProps={{ noWrap: true }}
                        sx={{ minWidth: 0 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {`${entry.occurrence_count} net${entry.occurrence_count === 1 ? '' : 's'}`}
                      </Typography>
                      <Chip size="small" label={`${entry.total_check_ins} check-ins`} color="primary" variant="outlined" />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            {/* Most-active operators: distinct nets attended per callsign.
                The callsign opens the operator's profile popup. */}
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Star color="primary" />
                <Typography variant="h6">Most-Active Operators</Typography>
              </Box>
              {stats.top_operators.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No check-ins in this period.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {stats.top_operators.map((op, i) => (
                    <ListItem key={op.callsign} disableGutters sx={{ px: 1 }}>
                      <ListItemText
                        primary={
                          <>
                            {`${i + 1}. `}
                            <Link
                              component="button"
                              variant="body2"
                              underline="hover"
                              fontWeight="bold"
                              onClick={() => {
                                if (op.user_id) setProfileUserId(op.user_id);
                                else setProfileCallsign(op.callsign);
                              }}
                              sx={{ verticalAlign: 'baseline' }}
                            >
                              {op.callsign}
                            </Link>
                            {op.first_name && ` ${op.first_name}`}
                          </>
                        }
                      />
                      <Chip
                        size="small"
                        label={`${op.nets_attended} net${op.nets_attended === 1 ? '' : 's'}`}
                        color="primary"
                        variant="outlined"
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>
        </Grid>

      {/* ========== Check-In Geographic Map ========== */}
      {/* Shows approximate regions where check-ins have originated */}
      <GlobalCheckInMap days={windowDays} />
      </Box>

      {/* ========== OPERATOR PROFILE POPUP ========== */}
      <UserProfileDialog
        userId={profileUserId}
        callsign={profileCallsign}
        onClose={() => { setProfileUserId(null); setProfileCallsign(null); }}
      />
    </Container>
  );
};

export default Statistics;

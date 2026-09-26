import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Dialog,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  ArrowBack,
  Timer,
  People,
  Refresh,
  TrendingUp,
  Radio,
  PictureAsPdf,
  Map as MapIcon,
  Assessment,
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  Mail as MailIcon,
  Image as ImageIcon,
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
  AreaChart,
  Area,
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import { statisticsApi, checkInApi, netRoleApi } from '../services/api';
import { useMappedCheckIns } from '../hooks/useMappedCheckIns';
import { getCheckInMarkerColor, getMarkerRoleIds, buildMarkerLegend } from '../utils/checkInMarkers';
import { createStationMarkerIcon } from '../utils/checkInMarkerIcon';
import { getStatusLabel } from '../components/netview/checkInStatusHelpers';
import { computeDualMapData } from '../utils/dualMap';
import { formatDateTime } from '../utils/dateUtils';
import { getErrorMessage } from '../utils/apiErrors';
import { useAuth } from '../contexts/AuthContext';
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, getMapTileClassName } from '../utils/mapTiles';
import { computeCheckInTimeline } from '../utils/checkInTimeline';

// Fix default Leaflet marker icons for Vite/webpack
const DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// FitBounds: auto-fits the map to show all markers, then stays put.
const FitBoundsOnce: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();
  const hasFitRef = useRef(false);
  useEffect(() => {
    if (positions.length === 0 || hasFitRef.current) return;
    hasFitRef.current = true;
    const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10, animate: false });
  }, [map, positions]);
  return null;
};

interface TimeSeriesDataPoint {
  label: string;
  value: number;
  date: string;
}

interface TopOperator {
  callsign: string;
  check_in_count: number;
  first_check_in: string;  // ISO datetime - used for tie-breaking
}

interface NetStats {
  net_id: number;
  net_name: string;
  status: string;
  template_id: number | null;  // ID of the recurring net template, if any
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
  frequency_count: number;
  // Assisted Traffic Handling: distinct forms with any log entry whose own
  // net_id is this net, broken out by action. See
  // TRAFFIC-HANDLING-DESIGN.md section 3.5.
  traffic_handled: number;
  traffic_by_action: Record<string, number>;
}

// Individual check-in record (for location map)
interface CheckInRecord {
  id: number;
  callsign: string;
  name?: string;
  location?: string;
  status: string;
  // Only used to color a station by the net role it held - see markerRoles.
  user_id?: number;
}

const NetStatistics: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Location map state. Parsing/geocoding lives in the shared hook and marker
  // colors in the shared palette, so this page's map plots exactly what the
  // net report's map does, in the same colors.
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  // Roles are fetched only to color a station by the role it held (NCS,
  // Logger, Relay), which is what the live map and the report both do.
  const [netRoles, setNetRoles] = useState<any[]>([]);
  const { mapped: mappedCheckIns, loading: mapLoading } = useMappedCheckIns(checkIns);
  const markerRoles = getMarkerRoleIds(netRoles);
  const mapLegend = buildMarkerLegend(
    mappedCheckIns.map(m => m.checkIn),
    markerRoles,
    getStatusLabel
  );

  // PDF and PNG exports are the net report's: one layout for a single net,
  // not a second set built here. ?export=pdf / ?export=png starts the export
  // once the report loads.
  const handleExportPdf = () => {
    if (stats) navigate(`/nets/${stats.net_id}/report?export=pdf`);
  };
  const handleExportPngs = () => {
    if (stats) navigate(`/nets/${stats.net_id}/report?export=png`);
  };

  // Fetch stats and check-in list in parallel

  useEffect(() => {
    const fetchData = async () => {
      if (!netId) return;
      try {
        setLoading(true);
        const [statsRes, checkInsRes, rolesRes] = await Promise.all([
          statisticsApi.getNetStats(parseInt(netId)),
          checkInApi.list(parseInt(netId)),
          netRoleApi.list(parseInt(netId)),
        ]);
        setStats(statsRes.data);
        setCheckIns(checkInsRes.data);
        setNetRoles(rolesRes.data || []);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch net statistics:', err);
        setError(getErrorMessage(err, 'Failed to load net statistics'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
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

  // ========== HOOKS (must all be called before any early returns) ==========

  // Compute dual-map split: non-null when positions have significant outliers
  const dualMapData = useMemo(() => {
    if (mappedCheckIns.length < 3) return null;
    const pts = mappedCheckIns.map(m => ({ lat: m.parsedLocation.lat, lon: m.parsedLocation.lon }));
    return computeDualMapData(pts);
  }, [mappedCheckIns]);

  // Binned check-in activity: counts per adaptive time window, capped at last check-in.
  // See utils/checkInTimeline.ts for the binning itself and the negative-
  // minutes edge case (a net whose started_at postdates its check-ins) that
  // used to crash this page outright.
  const { timelineData, binSize } = useMemo(
    () => computeCheckInTimeline(stats?.check_ins_timeline),
    [stats]
  );

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

  // Compute column width so visible charts always fill the full row
  const showFrequency = stats.frequency_count > 1 && frequencyData.length > 0;
  const chartCount = [statusData.length > 0, timelineData.length >= 2, showFrequency].filter(Boolean).length;
  const chartMd = (chartCount === 3 ? 4 : chartCount === 2 ? 6 : 12) as 4 | 6 | 12;

  // Tile layer -- see utils/mapTiles.ts for why dark mode is a CSS filter on
  // OSM tiles rather than a separate tile server.
  const tileUrl = MAP_TILE_URL;
  const tileAttribution = MAP_TILE_ATTRIBUTION;
  const tileClassName = getMapTileClassName(isDarkMode, false);

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
        {/* Export controls match NetReport.tsx exactly -- same labels and
            variant, per the DESIGN.md symmetry rule. Export PDF opens the net
            report and exports it from there. */}
        <Tooltip title="Export the net report to PDF">
          <Button
            variant="contained"
            onClick={handleExportPdf}
            startIcon={<PictureAsPdf />}
          >
            Export PDF
          </Button>
        </Tooltip>
        {/* Opens the net report and downloads its social-media images there. */}
        <Tooltip title="Download the net report's images for social media">
          <Button
            variant="contained"
            onClick={handleExportPngs}
            startIcon={<ImageIcon />}
          >
            Export PNG
          </Button>
        </Tooltip>
        <Button
          variant="outlined"
          startIcon={<Radio />}
          onClick={() => navigate(`/nets/${stats.net_id}`)}
        >
          View Net
        </Button>
        {/* Only shown if this net belongs to a recurring template */}
        {stats.template_id && (
          <Button
            variant="outlined"
            startIcon={<Assessment />}
            onClick={() => navigate(`/statistics/schedules/${stats.template_id}`)}
          >
            All-Time Stats
          </Button>
        )}
      </Box>

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
        {/* Assisted Traffic Handling tile — only shown when this net has any */}
        {stats.traffic_handled > 0 && (
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <MailIcon color="error" sx={{ fontSize: 32 }} />
                <Typography variant="h4" fontWeight="bold">
                  {stats.traffic_handled}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Traffic Handled
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <Grid container spacing={3}>
        {/* ========== GRAPHS ========== */}
        {chartCount > 0 && (
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUp /> Graphs
            </Typography>
          </Box>
          {/* A plain Box absorbs the Grid container's negative top margin,
              which would otherwise pull it up over the heading. */}
          <Box sx={{ pt: 2, display: 'flex' }}>
          <Grid
            container
            spacing={3}
            sx={{ flex: 1, minWidth: 0 }}
          >
        {/* Status Breakdown */}
        {statusData.length > 0 && (
          <Grid item xs={12} md={chartMd}>
            <Paper id="net-stats-chart-status" sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Check-in Status</Typography>
                                  <Tooltip title="Expand">
                    <IconButton size="small" onClick={() => setExpandedCard('status')} sx={{ ml: 'auto' }}>
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
              </Box>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="45%"
                    outerRadius={72}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={{ stroke: '#666', strokeWidth: 1 }}
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* ========== CHECK-IN ACTIVITY CHART ========== */}
        {/* Binned area chart showing check-in flow over time */}
        {timelineData.length >= 2 && (
          <Grid item xs={12} md={chartMd}>
            <Paper id="net-stats-chart-activity" sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="h6">Check-in Activity</Typography>
                                  <Tooltip title="Expand">
                    <IconButton size="small" onClick={() => setExpandedCard('activity')} sx={{ ml: 'auto' }}>
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Check-ins per {binSize}-min window
              </Typography>
              <ResponsiveContainer width="100%" height={262}>
                <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval={Math.max(0, Math.floor(timelineData.length / 6) - 1)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Check-ins', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11 } }}
                  />
                  <RechartsTooltip
                    formatter={(value: number) => [value, `check-ins in ${binSize}m`]}
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                  <Area
                    type="basis"
                    dataKey="count"
                    stroke={theme.palette.success.main}
                    strokeWidth={2}
                    fill="url(#activityGradient)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* Check-ins by Frequency — only shown when net has multiple frequencies */}
        {showFrequency && (
          <Grid item xs={12} md={chartMd}>
            <Paper id="net-stats-chart-frequency" sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Check-ins by Frequency</Typography>
                                  <Tooltip title="Expand">
                    <IconButton size="small" onClick={() => setExpandedCard('frequency')} sx={{ ml: 'auto' }}>
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
              </Box>
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
          </Grid>
          </Box>
        </Grid>
        )}

        {/* ========== CHECK-IN LOCATION MAP ========== */}
        {(mappedCheckIns.length > 0 || mapLoading) && (
          <Grid item xs={12}>
            <Paper
              id="net-stats-map"
              sx={{ p: 2, height: '100%' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MapIcon color="action" fontSize="small" />
                <Typography variant="h6">
                  Check-in Locations
                </Typography>
                {mappedCheckIns.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    ({mappedCheckIns.length} plotted)
                    {dualMapData && ' — split view: cluster detail (left) and full overview (right)'}
                  </Typography>
                )}
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {mapLoading && <CircularProgress size={14} />}
                  {mappedCheckIns.length > 0 && !mapLoading && (
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setExpandedCard('map')}>
                        <FullscreenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
              {mappedCheckIns.length > 0 && (
                dualMapData ? (
                  // ---- DUAL MAP: cluster detail + full overview side-by-side ----
                  <Grid container spacing={2}>
                    {/* Left: cluster zoom (stacked on top during a PNG export) */}
                    <Grid item xs={12} md={6}>
                      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                          <Typography variant="caption" fontWeight="medium">
                            📍 Cluster Detail ({dualMapData.clusterPositions.length} stations)
                          </Typography>
                        </Box>
                        <Box sx={{ height: 320, width: '100%' }}>
                          <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer
                              attribution={tileAttribution}
                              url={tileUrl}
                              className={tileClassName}
                            />
                            <FitBoundsOnce positions={dualMapData.clusterPositions} />
                            {mappedCheckIns.map((mapped) => (
                              <Marker
                                key={`cluster-${mapped.checkIn.id}`}
                                position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                                icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles), 22, 30)}
                              >
                                <Popup>
                                  <strong>{mapped.checkIn.callsign}</strong>
                                  {mapped.checkIn.name && <><br />{mapped.checkIn.name}</>}
                                  {mapped.checkIn.location && <><br /><span style={{ color: '#666' }}>{mapped.checkIn.location}</span></>}
                                </Popup>
                              </Marker>
                            ))}
                          </MapContainer>
                        </Box>
                      </Paper>
                    </Grid>
                    {/* Right: full overview (stacked underneath during a PNG export) */}
                    <Grid item xs={12} md={6}>
                      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                          <Typography variant="caption" fontWeight="medium">
                            🌐 Full Overview ({dualMapData.allPositions.length} stations)
                          </Typography>
                        </Box>
                        <Box sx={{ height: 320, width: '100%' }}>
                          <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer
                              attribution={tileAttribution}
                              url={tileUrl}
                              className={tileClassName}
                            />
                            <FitBoundsOnce positions={dualMapData.allPositions} />
                            {mappedCheckIns.map((mapped) => (
                              <Marker
                                key={`overview-${mapped.checkIn.id}`}
                                position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                                icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles), 22, 30)}
                              >
                                <Popup>
                                  <strong>{mapped.checkIn.callsign}</strong>
                                  {mapped.checkIn.name && <><br />{mapped.checkIn.name}</>}
                                  {mapped.checkIn.location && <><br /><span style={{ color: '#666' }}>{mapped.checkIn.location}</span></>}
                                </Popup>
                              </Marker>
                            ))}
                          </MapContainer>
                        </Box>
                      </Paper>
                    </Grid>
                  </Grid>
                ) : (
                  // ---- SINGLE MAP: all stations fit in one view ----
                  <Box sx={{ width: '100%', borderRadius: 1, overflow: 'hidden', height: 350 }}>
                    <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                      <TileLayer
                        attribution={tileAttribution}
                        url={tileUrl}
                        className={tileClassName}
                      />
                      <FitBoundsOnce
                        positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])}
                       
                      />
                      {mappedCheckIns.map((mapped) => (
                        <Marker
                          key={mapped.checkIn.id}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles), 22, 30)}
                        >
                          <Popup>
                            <strong>{mapped.checkIn.callsign}</strong>
                            {mapped.checkIn.name && <><br />{mapped.checkIn.name}</>}
                            {mapped.checkIn.location && <><br /><span style={{ color: '#666' }}>{mapped.checkIn.location}</span></>}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </Box>
                )
              )}

              {/* Marker legend -- built from the same palette the markers draw
                  from, so it lists exactly the colors on this net's map */}
              {mapLegend.length > 0 && !mapLoading && (
                <Box sx={{ px: 2, pb: 2, pt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {mapLegend.map((item) => (
                    <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color }} />
                      <Typography variant="caption">{item.label}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Grid>
        )}

        {/* ========== OPERATORS TABLE ========== */}
        {/* Lists all operators; name/location pulled from the already-fetched checkIns list */}
        <Grid item xs={12}>
          <Paper id="net-stats-operators" sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">
                Operators ({stats.top_operators.length})
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Callsign</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Location</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.top_operators.map((op) => {
                    // Look up the most recent check-in record for this callsign to get name/location
                    const record = checkIns.find(c => c.callsign === op.callsign);
                    return (
                      <TableRow key={op.callsign}>
                        <TableCell>{op.callsign}</TableCell>
                        <TableCell>{record?.name || '—'}</TableCell>
                        <TableCell>{record?.location || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* ========== FULLSCREEN EXPAND DIALOG ========== */}
      <Dialog fullScreen open={expandedCard !== null} onClose={() => setExpandedCard(null)}>
        <AppBar sx={{ position: 'relative' }} elevation={1}>
          <Toolbar>
            <Typography variant="h6" sx={{ flex: 1 }}>
              {expandedCard === 'status' && 'Check-in Status'}
              {expandedCard === 'activity' && `Check-in Activity — ${binSize}-min windows`}
              {expandedCard === 'frequency' && 'Check-ins by Frequency'}
              {expandedCard === 'map' && `Check-in Locations (${mappedCheckIns.length} plotted)`}
            </Typography>
            <IconButton color="inherit" edge="end" onClick={() => setExpandedCard(null)}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: 3, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>

          {/* ---- Expanded: Status Pie ---- */}
          {expandedCard === 'status' && statusData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" outerRadius="35%" dataKey="value"
                  label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={{ stroke: '#666', strokeWidth: 1 }}
                >
                  {statusData.map((_, index) => (
                    <Cell key={`exp-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}

          {/* ---- Expanded: Activity Area Chart ---- */}
          {expandedCard === 'activity' && timelineData.length >= 2 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="expandedActivityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 13 }}
                  interval={Math.max(0, Math.floor(timelineData.length / 12) - 1)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13 }}
                  label={{ value: 'Check-ins', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 13 } }} />
                <RechartsTooltip
                  formatter={(value: number) => [value, `check-ins in ${binSize}m`]}
                  contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }}
                />
                <Area type="basis" dataKey="count" stroke={theme.palette.success.main} strokeWidth={2.5}
                  fill="url(#expandedActivityGradient)" dot={false} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* ---- Expanded: Frequency Bar Chart ---- */}
          {expandedCard === 'frequency' && showFrequency && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={frequencyData} layout="vertical" margin={{ top: 10, right: 40, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 13 }} />
                <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 13 }} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }}
                />
                <Bar dataKey="count" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* ---- Expanded: Map ---- */}
          {expandedCard === 'map' && mappedCheckIns.length > 0 && (
            dualMapData ? (
              <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden' }}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ height: 'calc(100vh - 130px)', borderRadius: 1, overflow: 'hidden' }}>
                    <MapContainer key="exp-cluster" center={[39.8283, -98.5795]} zoom={4}
                      style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                      <TileLayer attribution={tileAttribution} url={tileUrl} className={tileClassName} />
                      <FitBoundsOnce positions={dualMapData.clusterPositions} />
                      {mappedCheckIns.map(mapped => (
                        <Marker key={`exp-c-${mapped.checkIn.id}`}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles), 22, 30)}>
                          <Popup>
                            <strong>{mapped.checkIn.callsign}</strong>
                            {mapped.checkIn.name && <><br />{mapped.checkIn.name}</>}
                            {mapped.checkIn.location && <><br /><span style={{ color: '#666' }}>{mapped.checkIn.location}</span></>}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box sx={{ height: 'calc(100vh - 130px)', borderRadius: 1, overflow: 'hidden' }}>
                    <MapContainer key="exp-overview" center={[39.8283, -98.5795]} zoom={4}
                      style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                      <TileLayer attribution={tileAttribution} url={tileUrl} className={tileClassName} />
                      <FitBoundsOnce positions={dualMapData.allPositions} />
                      {mappedCheckIns.map(mapped => (
                        <Marker key={`exp-o-${mapped.checkIn.id}`}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles), 22, 30)}>
                          <Popup>
                            <strong>{mapped.checkIn.callsign}</strong>
                            {mapped.checkIn.name && <><br />{mapped.checkIn.name}</>}
                            {mapped.checkIn.location && <><br /><span style={{ color: '#666' }}>{mapped.checkIn.location}</span></>}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </Box>
                </Grid>
              </Grid>
            ) : (
              <Box sx={{ flex: 1, borderRadius: 1, overflow: 'hidden' }}>
                <MapContainer key="exp-single" center={[39.8283, -98.5795]} zoom={4}
                  style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                  <TileLayer attribution={tileAttribution} url={tileUrl} className={tileClassName} />
                  <FitBoundsOnce positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])} />
                  {mappedCheckIns.map(mapped => (
                    <Marker key={`exp-${mapped.checkIn.id}`}
                      position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                      icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles), 22, 30)}>
                      <Popup>
                        <strong>{mapped.checkIn.callsign}</strong>
                        {mapped.checkIn.name && <><br />{mapped.checkIn.name}</>}
                        {mapped.checkIn.location && <><br /><span style={{ color: '#666' }}>{mapped.checkIn.location}</span></>}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </Box>
            )
          )}

        </Box>
      </Dialog>
    </Container>
  );
};

export default NetStatistics;

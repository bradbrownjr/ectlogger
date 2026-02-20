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
import { statisticsApi, checkInApi } from '../services/api';
import { parseLocation, geocodeAddress, ParsedLocation } from '../utils/locationParser';
import { formatDateTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { exportElementToPdf } from '../utils/pdfExport';

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

// Simple green pin for all historical check-in locations on the stats map
const statsMarkerIcon = L.divIcon({
  className: 'custom-marker',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 24 32">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
          fill="#4caf50" stroke="#333" stroke-width="2"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>`,
  iconSize: [22, 30],
  iconAnchor: [11, 30],
  popupAnchor: [0, -30],
});

// FitBounds: auto-fits the map to show all markers, then stays put
const FitBoundsOnce: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();
  const hasFitRef = useRef(false);
  useEffect(() => {
    if (positions.length > 0 && !hasFitRef.current) {
      hasFitRef.current = true;
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [map, positions]);
  return null;
};

// Dual-map split: detects outliers and separates cluster from full overview
interface DualMapData {
  clusterPositions: [number, number][];
  allPositions: [number, number][];
}

const computeDualMapData = (pts: { lat: number; lon: number }[]): DualMapData | null => {
  if (pts.length < 3) return null;
  const centLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const centLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  const dists = pts.map(p => Math.sqrt(Math.pow(p.lat - centLat, 2) + Math.pow(p.lon - centLon, 2)));
  const sorted = [...dists].sort((a, b) => a - b);
  const medianDist = sorted[Math.floor(sorted.length / 2)];
  const maxDist = sorted[sorted.length - 1];
  if (medianDist < 0.5 || maxDist < medianDist * 3) return null;
  const clusterThreshold = medianDist * 2.5;
  const clusterPositions = pts
    .filter((_, i) => dists[i] <= clusterThreshold)
    .map(p => [p.lat, p.lon] as [number, number]);
  const allPositions = pts.map(p => [p.lat, p.lon] as [number, number]);
  if (clusterPositions.length < 2 || clusterPositions.length === allPositions.length) return null;
  return { clusterPositions, allPositions };
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

// Individual check-in record (for location map)
interface CheckInRecord {
  id: number;
  callsign: string;
  name?: string;
  location?: string;
  status: string;
}

interface MappedCheckIn {
  checkIn: CheckInRecord;
  parsedLocation: ParsedLocation;
}

const NetStatistics: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  // Use CartoDB Dark Matter tiles in dark mode, OSM in light mode
  const tileUrl = isDarkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = isDarkMode
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);
  const [exporting, setExporting] = useState(false);

  // Location map state
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [mappedCheckIns, setMappedCheckIns] = useState<MappedCheckIn[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const processedKeyRef = useRef<string>('');

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

  // Fetch stats and check-in list in parallel
  useEffect(() => {
    const fetchData = async () => {
      if (!netId) return;
      try {
        setLoading(true);
        const [statsRes, checkInsRes] = await Promise.all([
          statisticsApi.getNetStats(parseInt(netId)),
          checkInApi.list(parseInt(netId)),
        ]);
        setStats(statsRes.data);
        setCheckIns(checkInsRes.data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch net statistics:', err);
        setError(err.response?.data?.detail || 'Failed to load net statistics');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [netId]);

  // Process check-in locations for the map
  useEffect(() => {
    if (checkIns.length === 0) return;

    const checkInsKey = checkIns
      .filter(c => c.location)
      .map(c => `${c.id}:${c.location}`)
      .join('|');

    if (processedKeyRef.current === checkInsKey && mappedCheckIns.length > 0) return;

    const processLocations = async () => {
      setMapLoading(true);
      const results: MappedCheckIn[] = [];
      const addressesToGeocode: { checkIn: CheckInRecord; parsed: ParsedLocation }[] = [];

      for (const checkIn of checkIns) {
        if (!checkIn.location) continue;
        const parsed = parseLocation(checkIn.location);
        if (parsed) {
          if (parsed.type === 'address') {
            addressesToGeocode.push({ checkIn, parsed });
          } else {
            results.push({ checkIn, parsedLocation: parsed });
          }
        }
      }

      // Geocode up to 10 addresses to avoid excessive API calls
      for (let i = 0; i < Math.min(addressesToGeocode.length, 10); i++) {
        const { checkIn, parsed } = addressesToGeocode[i];
        const coords = await geocodeAddress(parsed.original);
        if (coords) {
          results.push({ checkIn, parsedLocation: { ...coords, type: 'address', original: parsed.original } });
        }
      }

      processedKeyRef.current = checkInsKey;
      setMappedCheckIns(results);
      setMapLoading(false);
    };

    processLocations();
  }, [checkIns]);

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

  // Prepare cumulative check-in pace data from timeline
  const timelineData = useMemo(() => {
    if (!stats || !stats.check_ins_timeline || stats.check_ins_timeline.length < 2) return [];
    const sorted = [...stats.check_ins_timeline].sort((a, b) => {
      const parse = (lbl: string) => parseInt(lbl.replace('+', '').replace('m', ''), 10);
      return parse(a.label) - parse(b.label);
    });
    let cumulative = 0;
    return sorted.map(pt => {
      cumulative += 1;
      return { label: pt.label, cumulative };
    });
  }, [stats]);

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
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Check-in Status
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="45%"
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent, x, y, midAngle }) => {
                      // Position labels outside the pie with offset based on angle
                      const RADIAN = Math.PI / 180;
                      const radius = 110;
                      const cx2 = x + (radius - 90) * Math.cos(-midAngle * RADIAN);
                      const cy2 = y + (radius - 90) * Math.sin(-midAngle * RADIAN);
                      return (
                        <text
                          x={cx2}
                          y={cy2}
                          fill={COLORS[statusData.findIndex(d => d.name === name) % COLORS.length]}
                          textAnchor={cx2 > x ? 'start' : 'end'}
                          dominantBaseline="central"
                          fontSize={12}
                        >
                          {`${name} (${(percent * 100).toFixed(0)}%)`}
                        </text>
                      );
                    }}
                    labelLine={{ stroke: '#666', strokeWidth: 1 }}
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* ========== CHECK-IN PACE CHART ========== */}
        {/* Cumulative area chart showing how quickly stations checked in over time */}
        {timelineData.length >= 2 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Check-in Pace
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Cumulative arrivals from net open
              </Typography>
              <ResponsiveContainer width="100%" height={262}>
                <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="paceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.35} />
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
                    formatter={(value: number) => [value, 'Total checked in']}
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke={theme.palette.success.main}
                    strokeWidth={2}
                    fill="url(#paceGradient)"
                    dot={{ r: 3, fill: theme.palette.success.main }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* Check-ins by Frequency */}
        {frequencyData.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
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

        {/* ========== CHECK-IN LOCATION MAP ========== */}
        {(mappedCheckIns.length > 0 || mapLoading) && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2, height: '100%' }}>
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
                {mapLoading && <CircularProgress size={14} sx={{ ml: 'auto' }} />}
              </Box>
              {mappedCheckIns.length > 0 && (
                dualMapData ? (
                  // ---- DUAL MAP: cluster detail + full overview side-by-side ----
                  <Grid container spacing={2}>
                    {/* Left: cluster zoom */}
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
                            />
                            <FitBoundsOnce positions={dualMapData.clusterPositions} />
                            {mappedCheckIns.map((mapped) => (
                              <Marker
                                key={`cluster-${mapped.checkIn.id}`}
                                position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                                icon={statsMarkerIcon}
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
                    {/* Right: full overview */}
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
                            />
                            <FitBoundsOnce positions={dualMapData.allPositions} />
                            {mappedCheckIns.map((mapped) => (
                              <Marker
                                key={`overview-${mapped.checkIn.id}`}
                                position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                                icon={statsMarkerIcon}
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
                  <Box sx={{ height: 350, width: '100%', borderRadius: 1, overflow: 'hidden' }}>
                    <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                      <TileLayer
                        attribution={tileAttribution}
                        url={tileUrl}
                      />
                      <FitBoundsOnce
                        positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])}
                      />
                      {mappedCheckIns.map((mapped) => (
                        <Marker
                          key={mapped.checkIn.id}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={statsMarkerIcon}
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
            </Paper>
          </Grid>
        )}

        {/* Top Operators */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, height: '100%' }}>
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

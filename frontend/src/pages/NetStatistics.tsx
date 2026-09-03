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
  Download as DownloadIcon,
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
import { statisticsApi, checkInApi } from '../services/api';
import { parseLocation, geocodeAddress, ParsedLocation } from '../utils/locationParser';
import { formatDateTime } from '../utils/dateUtils';
import { getErrorMessage } from '../utils/apiErrors';
import { useAuth } from '../contexts/AuthContext';
import CardActionButton from '../components/CardActionButton';
import { exportElementToPdf, exportElementToPng } from '../utils/pdfExport';
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
// resizeToken: bump when the map's *container* changes shape (the PNG export
// reshapes it -- see PNG_EXPORT_* below) to force a re-fit even though the
// initial fit already happened. Leaflet only watches window resize, never its
// own container, so without invalidateSize() the capture shows tiles laid out
// for the old dimensions. Same rule as NetReport.tsx's FitBounds.
const FitBoundsOnce: React.FC<{ positions: [number, number][]; resizeToken?: number }> = ({ positions, resizeToken }) => {
  const map = useMap();
  const hasFitRef = useRef(false);
  const lastTokenRef = useRef(resizeToken);
  useEffect(() => {
    if (positions.length === 0) return;
    const resized = lastTokenRef.current !== resizeToken;
    lastTokenRef.current = resizeToken;
    if (hasFitRef.current && !resized) return;
    hasFitRef.current = true;
    if (resized) map.invalidateSize({ animate: false });
    const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10, animate: false });
  }, [map, positions, resizeToken]);
  return null;
};

// ========== PNG EXPORT LAYOUT (social-media friendly aspect ratios) ==========
// The map card spans the full content width, which captures as a ~2.65:1
// letterbox that feed thumbnails crop and a portrait phone renders too small.
// The chart cards already sit in grid columns and export at a sane shape, so
// only the map is reshaped. Mirrors NetReport.tsx's constants.
const PNG_EXPORT_WIDTH_PX = 960;
// Applies to the whole card (heading + map), done with flex so the ratio holds
// however the heading wraps.
const PNG_EXPORT_MAP_ASPECT = '4 / 3';
// Dual-map cards stack their two panes and are sized by giving each pane a
// fixed height: the panes are MUI Grid items, whose own MuiGrid-grid-xs-* class
// sets flex-basis:100%/flex-grow:0 and beats an sx override, so a flex chain
// cannot reach them. Two 560px panes plus the headings land near 960x1290
// (1:1.34), inside a 16:10 (1:1.6) cap.
const PNG_EXPORT_DUAL_PANE_HEIGHT_PX = 560;

// Wraps a card so its export progress spinner sits OUTSIDE the element being
// captured. Each card's <Paper> carries the id html2canvas captures, so a
// spinner inside that Paper's heading row lands in the exported PNG -- the same
// defect NetReport.tsx hit with its map. The wrapper is position:relative and
// the spinner absolute, so it overlays the card on screen without joining it.
const CardExportProgress: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <Box sx={{ position: 'relative', height: '100%' }}>
    {active && (
      <CircularProgress size={16} sx={{ position: 'absolute', top: 22, right: 22, zIndex: 2 }} />
    )}
    {children}
  </Box>
);

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
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  // Which widget is currently being captured to PNG, keyed by its element id --
  // lets each widget's own download button show its own spinner independently.
  const [pngExportingId, setPngExportingId] = useState<string | null>(null);
  // Separate from pngExportingId, which tracks the one card mid-capture: this
  // stays true across the whole "Export PNG" run so the header button can show
  // progress and stay disabled between individual captures.
  const [exportingAllPngs, setExportingAllPngs] = useState(false);

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

  // Download a single widget (a chart, the map, or the operators table) as
  // its own PNG, e.g. for a social media post -- reuses the PDF export's
  // capture logic, minus the page-splitting.
  const handleExportPng = async (elementId: string, label: string) => {
    setPngExportingId(elementId);
    // Let React re-render before html2canvas reads the DOM -- this is what
    // takes the card's own PNG/Expand buttons out of frame. The map waits
    // longer: it also changes shape, and invalidateSize() has to fetch tiles
    // for the edges the new shape exposes.
    await new Promise(resolve => setTimeout(resolve, elementId === 'net-stats-map' ? 900 : 250));
    try {
      const netLabel = stats?.net_name ? stats.net_name.replace(/[^a-zA-Z0-9]/g, '_') : 'Net';
      await exportElementToPng(elementId, {
        filename: `${netLabel}_${label}`,
        scale: 2,
      });
    } catch (err) {
      console.error(`Failed to export ${label} PNG:`, err);
    } finally {
      setPngExportingId(null);
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
        setError(getErrorMessage(err, 'Failed to load net statistics'));
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

  // True only while the map card is being captured, which is when the
  // social-media export layout applies (see PNG_EXPORT_* above).
  const isMapPngExport = pngExportingId === 'net-stats-map';

  // The cards the header's "Export PNG" button downloads, in page order. Each
  // is conditional on the same test that decides whether the card renders at
  // all, so the run never tries to capture a card that isn't on the page.
  // Mirrors NetReport.tsx's pngSections.
  const pngSections: { id: string; label: string }[] = [
    ...(statusData.length > 0 ? [{ id: 'net-stats-chart-status', label: 'Check-in_Status' }] : []),
    ...(timelineData.length >= 2 ? [{ id: 'net-stats-chart-activity', label: 'Check-in_Activity' }] : []),
    ...(showFrequency ? [{ id: 'net-stats-chart-frequency', label: 'Check-ins_by_Frequency' }] : []),
    ...(mappedCheckIns.length > 0 && !mapLoading ? [{ id: 'net-stats-map', label: 'Check-in_Locations' }] : []),
    { id: 'net-stats-operators', label: 'Operators' },
  ];

  // Downloads every card on the page as its own PNG. Sequential, not parallel:
  // each capture re-renders the live DOM to take the card's own buttons out of
  // frame, so two at once would fight over it. The gap matters too -- browsers
  // drop rapid programmatic downloads without one.
  const handleExportAllPngs = async () => {
    setExportingAllPngs(true);
    try {
      for (const section of pngSections) {
        await handleExportPng(section.id, section.label);
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    } finally {
      setExportingAllPngs(false);
    }
  };

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
        {/* Export controls match NetReport.tsx exactly -- same labels, variant
            and progress treatment, per the DESIGN.md symmetry rule. */}
        <Tooltip title="Export to PDF">
          <Button
            variant="contained"
            onClick={handleExportPdf}
            disabled={exporting || exportingAllPngs}
            startIcon={exporting ? <CircularProgress size={16} /> : <PictureAsPdf />}
          >
            {exporting ? 'Exporting...' : 'Export PDF'}
          </Button>
        </Tooltip>
        {/* Downloads each card as its own PNG, for social media posts. The
            same captures the per-card PNG buttons produce. */}
        <Tooltip title={`Download all ${pngSections.length} cards as PNG images`}>
          <Button
            variant="contained"
            onClick={handleExportAllPngs}
            disabled={exporting || exportingAllPngs}
            startIcon={exportingAllPngs ? <CircularProgress size={16} /> : <ImageIcon />}
          >
            {exportingAllPngs ? 'Exporting...' : 'Export PNG'}
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
        {/* Status Breakdown */}
        {statusData.length > 0 && (
          <Grid item xs={12} md={chartMd}>
            <CardExportProgress active={pngExportingId === 'net-stats-chart-status'}>
            <Paper id="net-stats-chart-status" sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Check-in Status</Typography>
                {/* Both controls hide for a PDF export too: the PDF captures
                    net-stats-content, which contains every card. */}
                {!exporting && !pngExportingId && (
                  <>
                  <Box sx={{ ml: 'auto' }}>
                    <CardActionButton
                      icon={<DownloadIcon fontSize="small" />}
                      label="PNG"
                      tooltip="Download this chart as a PNG image"
                      onClick={() => handleExportPng('net-stats-chart-status', 'Check-in_Status')}
                    />
                  </Box>
                  <Tooltip title="Expand">
                    <IconButton size="small" onClick={() => setExpandedCard('status')}>
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  </>
                )}
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
            </CardExportProgress>
          </Grid>
        )}

        {/* ========== CHECK-IN ACTIVITY CHART ========== */}
        {/* Binned area chart showing check-in flow over time */}
        {timelineData.length >= 2 && (
          <Grid item xs={12} md={chartMd}>
            <CardExportProgress active={pngExportingId === 'net-stats-chart-activity'}>
            <Paper id="net-stats-chart-activity" sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="h6">Check-in Activity</Typography>
                {!exporting && !pngExportingId && (
                  <>
                  <Box sx={{ ml: 'auto' }}>
                    <CardActionButton
                      icon={<DownloadIcon fontSize="small" />}
                      label="PNG"
                      tooltip="Download this chart as a PNG image"
                      onClick={() => handleExportPng('net-stats-chart-activity', 'Check-in_Activity')}
                    />
                  </Box>
                  <Tooltip title="Expand">
                    <IconButton size="small" onClick={() => setExpandedCard('activity')}>
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  </>
                )}
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
            </CardExportProgress>
          </Grid>
        )}

        {/* Check-ins by Frequency — only shown when net has multiple frequencies */}
        {showFrequency && (
          <Grid item xs={12} md={chartMd}>
            <CardExportProgress active={pngExportingId === 'net-stats-chart-frequency'}>
            <Paper id="net-stats-chart-frequency" sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Check-ins by Frequency</Typography>
                {!exporting && !pngExportingId && (
                  <>
                  <Box sx={{ ml: 'auto' }}>
                    <CardActionButton
                      icon={<DownloadIcon fontSize="small" />}
                      label="PNG"
                      tooltip="Download this chart as a PNG image"
                      onClick={() => handleExportPng('net-stats-chart-frequency', 'Check-ins_by_Frequency')}
                    />
                  </Box>
                  <Tooltip title="Expand">
                    <IconButton size="small" onClick={() => setExpandedCard('frequency')}>
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  </>
                )}
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
            </CardExportProgress>
          </Grid>
        )}

        {/* ========== CHECK-IN LOCATION MAP ========== */}
        {(mappedCheckIns.length > 0 || mapLoading) && (
          <Grid item xs={12}>
            <CardExportProgress active={pngExportingId === 'net-stats-map'}>
            <Paper
              id="net-stats-map"
              sx={{
                p: 2,
                height: '100%',
                // Reshaped only while being captured. Single map: flex column +
                // a pinned ratio lets the map absorb whatever the heading does
                // not use, so the card is exactly 4:3. Dual sizes its panes
                // directly instead (see PNG_EXPORT_DUAL_PANE_HEIGHT_PX).
                ...(isMapPngExport && {
                  width: PNG_EXPORT_WIDTH_PX,
                  height: 'auto',
                  ...(dualMapData ? {} : {
                    aspectRatio: PNG_EXPORT_MAP_ASPECT,
                    display: 'flex',
                    flexDirection: 'column',
                  }),
                }),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MapIcon color="action" fontSize="small" />
                <Typography variant="h6">
                  Check-in Locations
                </Typography>
                {mappedCheckIns.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    ({mappedCheckIns.length} plotted)
                    {/* The panes stack for the PNG export, so "left/right"
                        would be wrong in the exported image. */}
                    {dualMapData && (isMapPngExport
                      ? ' — split view: cluster detail (top) and full overview (bottom)'
                      : ' — split view: cluster detail (left) and full overview (right)')}
                  </Typography>
                )}
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {mapLoading && <CircularProgress size={14} />}
                  {mappedCheckIns.length > 0 && !mapLoading && !exporting && !pngExportingId && (
                    <>
                    <CardActionButton
                      icon={<DownloadIcon fontSize="small" />}
                      label="PNG"
                      tooltip="Download the map as a PNG image"
                      onClick={() => handleExportPng('net-stats-map', 'Check-in_Locations')}
                    />
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setExpandedCard('map')}>
                        <FullscreenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    </>
                  )}
                </Box>
              </Box>
              {mappedCheckIns.length > 0 && (
                dualMapData ? (
                  // ---- DUAL MAP: cluster detail + full overview side-by-side ----
                  <Grid container spacing={2}>
                    {/* Left: cluster zoom (stacked on top during a PNG export) */}
                    <Grid item xs={12} md={isMapPngExport ? 12 : 6}>
                      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                          <Typography variant="caption" fontWeight="medium">
                            📍 Cluster Detail ({dualMapData.clusterPositions.length} stations)
                          </Typography>
                        </Box>
                        <Box sx={{ height: isMapPngExport ? PNG_EXPORT_DUAL_PANE_HEIGHT_PX : 320, width: '100%' }}>
                          <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer
                              attribution={tileAttribution}
                              url={tileUrl}
                            />
                            <FitBoundsOnce positions={dualMapData.clusterPositions} resizeToken={isMapPngExport ? 1 : 0} />
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
                    {/* Right: full overview (stacked underneath during a PNG export) */}
                    <Grid item xs={12} md={isMapPngExport ? 12 : 6}>
                      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                        <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                          <Typography variant="caption" fontWeight="medium">
                            🌐 Full Overview ({dualMapData.allPositions.length} stations)
                          </Typography>
                        </Box>
                        <Box sx={{ height: isMapPngExport ? PNG_EXPORT_DUAL_PANE_HEIGHT_PX : 320, width: '100%' }}>
                          <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer
                              attribution={tileAttribution}
                              url={tileUrl}
                            />
                            <FitBoundsOnce positions={dualMapData.allPositions} resizeToken={isMapPngExport ? 1 : 0} />
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
                  <Box sx={{ width: '100%', borderRadius: 1, overflow: 'hidden', ...(isMapPngExport ? { flex: 1, minHeight: 0 } : { height: 350 }) }}>
                    <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                      <TileLayer
                        attribution={tileAttribution}
                        url={tileUrl}
                      />
                      <FitBoundsOnce
                        positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])}
                        resizeToken={isMapPngExport ? 1 : 0}
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
            </CardExportProgress>
          </Grid>
        )}

        {/* ========== OPERATORS TABLE ========== */}
        {/* Lists all operators; name/location pulled from the already-fetched checkIns list */}
        <Grid item xs={12}>
          <CardExportProgress active={pngExportingId === 'net-stats-operators'}>
          <Paper id="net-stats-operators" sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">
                Operators ({stats.top_operators.length})
              </Typography>
              {!exporting && !pngExportingId && (
                <Box sx={{ ml: 'auto' }}>
                  <CardActionButton
                    icon={<DownloadIcon fontSize="small" />}
                    label="PNG"
                    tooltip="Download the operators table as a PNG image"
                    onClick={() => handleExportPng('net-stats-operators', 'Operators')}
                  />
                </Box>
              )}
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
          </CardExportProgress>
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
                      <TileLayer attribution={tileAttribution} url={tileUrl} />
                      <FitBoundsOnce positions={dualMapData.clusterPositions} />
                      {mappedCheckIns.map(mapped => (
                        <Marker key={`exp-c-${mapped.checkIn.id}`}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={statsMarkerIcon}>
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
                      <TileLayer attribution={tileAttribution} url={tileUrl} />
                      <FitBoundsOnce positions={dualMapData.allPositions} />
                      {mappedCheckIns.map(mapped => (
                        <Marker key={`exp-o-${mapped.checkIn.id}`}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={statsMarkerIcon}>
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
                  <TileLayer attribution={tileAttribution} url={tileUrl} />
                  <FitBoundsOnce positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])} />
                  {mappedCheckIns.map(mapped => (
                    <Marker key={`exp-${mapped.checkIn.id}`}
                      position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                      icon={statsMarkerIcon}>
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

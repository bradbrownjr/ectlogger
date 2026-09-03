import React, { useState, useEffect, useRef, useMemo } from 'react';
import AppLogo from '../components/AppLogo';
import { displayCallsign } from '../utils/userDisplay';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  useTheme,
  Tooltip,
  Dialog,
  AppBar,
  Toolbar,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  ArrowBack,
  PictureAsPdf,
  TrendingUp,
  Radio,
  Chat as ChatIcon,
  Assignment,
  Map as MapIcon,
  QuestionAnswer as TopicIcon,
  Dns as SystemLogIcon,
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  Hearing as HearingIcon,
  Download as DownloadIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseLocation, geocodeAddress, ParsedLocation } from '../utils/locationParser';

// Fix for default marker icons in webpack/vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom marker colors based on status
// Uses SVG for better html2canvas PDF export compatibility
// ========== DUAL-MAP OUTLIER DETECTION ==========
// Detects whether check-in positions have significant geographic outliers that justify
// showing two maps side-by-side: one zoomed into the cluster and one full overview.
// Uses degree-based Euclidean distance from centroid (sufficient for relative comparison).
interface DualMapData {
  clusterPositions: [number, number][];
  allPositions: [number, number][];
}

const computeDualMapData = (
  pts: { lat: number; lon: number }[]
): DualMapData | null => {
  if (pts.length < 3) return null;

  // Centroid
  const centLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const centLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;

  // Distance from centroid for each point (degrees)
  const dists = pts.map(p =>
    Math.sqrt(Math.pow(p.lat - centLat, 2) + Math.pow(p.lon - centLon, 2))
  );

  const sorted = [...dists].sort((a, b) => a - b);
  const medianDist = sorted[Math.floor(sorted.length / 2)];
  const maxDist = sorted[sorted.length - 1];

  // Only split when the maximal outlier is >3× the median distance AND
  // the cluster itself spans a meaningful area (≥0.5°, roughly 50 km)
  if (medianDist < 0.5 || maxDist < medianDist * 3) return null;

  const clusterThreshold = medianDist * 2.5;
  const clusterPositions = pts
    .filter((_, i) => dists[i] <= clusterThreshold)
    .map(p => [p.lat, p.lon] as [number, number]);

  const allPositions = pts.map(p => [p.lat, p.lon] as [number, number]);

  // Only worth splitting if there are ≥2 cluster points AND at least 1 outlier
  if (clusterPositions.length < 2 || clusterPositions.length === allPositions.length) return null;

  return { clusterPositions, allPositions };
};

const createColoredIcon = (color: string) => {
  // Create an SVG marker that renders properly in PDF export
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" 
            fill="${color}" 
            stroke="#333333" 
            stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
    </svg>
  `;
  const encodedSvg = encodeURIComponent(svg);
  
  return L.divIcon({
    className: 'custom-marker',
    html: `<img src="data:image/svg+xml,${encodedSvg}" width="24" height="32" style="display: block;" />`,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -32],
  });
};

// Component to fit map bounds to markers
//
// resizeToken: bump this whenever the map's *container* changes shape (the PNG
// export reshapes the map panes -- see PNG_EXPORT_* below). Leaflet only
// watches window resize, never its own container, so a container that changes
// size leaves the tile layer positioned for the old dimensions: grey gutters
// down the side and clipped edges in the capture. invalidateSize() re-lays the
// tiles, and re-fitting afterwards re-centres the markers for the new aspect.
const FitBounds: React.FC<{ positions: [number, number][]; resizeToken?: number }> = ({ positions, resizeToken }) => {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      map.invalidateSize({ animate: false });
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      // animate: false -- these are static report maps (scroll/zoom already
      // disabled), and an animated pan risks the PDF export's html2canvas
      // snapshot landing mid-transition, where marker/polyline layers can be
      // captured at different points in the animation and appear misaligned.
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10, animate: false });
    }
  }, [map, positions, resizeToken]);

  return null;
};

// ========== PNG EXPORT LAYOUT (social-media friendly aspect ratios) ==========
// On screen the report is wide: charts sit side by side and the map spans the
// full content width. Captured as-is that exports a roughly 2.5:1 letterbox,
// which feed thumbnails crop and a portrait phone renders too small to read.
// For the PNG capture only, the charts stack and the map block is pinned to a
// fixed width and aspect ratio. None of this affects the on-screen layout or
// the PDF export.
const PNG_EXPORT_WIDTH_PX = 960;
// Applies to the whole map block (heading + map + legend), not just the map
// pane -- the block is what gets posted, so it's the block that has to be 4:3.
// Achieved with flex rather than pixel maths: the heading and legend take their
// natural height and the map pane absorbs whatever is left, so the ratio holds
// regardless of how tall the text wraps.
const PNG_EXPORT_MAP_ASPECT = '4 / 3';
// Charts are short on the page because they sit in narrow grid columns. Stacked
// full width for the export they would otherwise read as a sparse strip -- a
// 60px-radius pie floating in a 960px box, which is what the first version
// shipped. These export-only sizes let the content fill the frame and bring two
// stacked charts to roughly 4:3, matching the single-map export.
const PNG_EXPORT_PIE_HEIGHT_PX = 340;
const PNG_EXPORT_PIE_RADIUS_PX = 130;
const PNG_EXPORT_CHART_HEIGHT_PX = 300;
// Dual-map nets stack their two panes, and are sized by giving each pane a
// fixed height rather than by pinning the block's aspect ratio. The flex
// approach above cannot reach through the panes: they are MUI Grid items, whose
// own `MuiGrid-grid-xs-*` class sets `flex-basis: 100%; flex-grow: 0` and wins
// over an `sx` override, which collapsed both panes to 16px. Two 600px panes
// plus the headings and legend land near 960x1380 (1:1.44), inside the 16:10
// (1:1.6) cap with ~150px of slack for a net name long enough to wrap.
const PNG_EXPORT_DUAL_PANE_HEIGHT_PX = 600;

// Coverage line colors - matches the live overlay in CheckInMap.tsx (kept as
// a local copy rather than a cross-import; this file already duplicates the
// rest of its Leaflet marker/popup setup independently of CheckInMap.tsx).
const COVERAGE_TWO_WAY_COLOR = '#ffab00'; // amber - confirmed both directions
const COVERAGE_ONE_WAY_COLOR = '#616161'; // neutral gray - reported one direction only

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
import { netApi, statisticsApi, checkInApi, netRoleApi, canHearApi } from '../services/api';
import { chatApi, ChatMessage, formatChatMessageText } from '../api/chat';
import { formatDateTime, formatTimeWithDate } from '../utils/dateUtils';
import { getErrorMessage } from '../utils/apiErrors';
import { useAuth } from '../contexts/AuthContext';
import { exportElementToPdf, exportElementToPng } from '../utils/pdfExport';
import { computeCheckInTimeline } from '../utils/checkInTimeline';
import CardActionButton from '../components/CardActionButton';
import CoverageReport, { CanHearReportEntry } from '../components/netview/CoverageReport';
import ICS309PrintView, { Ics309LogData } from '../components/traffic/print/ICS309PrintView';

// ========== INTERFACES ==========

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  owner_id: number;
  ics309_enabled?: boolean;
  propagation_logging_enabled?: boolean;
  topic_of_week_enabled?: boolean;
  topic_of_week_prompt?: string;
  poll_enabled?: boolean;
  poll_question?: string;
  frequencies: Frequency[];
  started_at?: string;
  closed_at?: string;
  created_at: string;
}

interface TopicResponse {
  callsign: string;
  name: string | null;
  response: string;
}

interface PollResult {
  response: string;
  count: number;
}

interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

interface CheckIn {
  id: number;
  callsign: string;
  name: string;
  location: string;
  status: string;
  is_recheck: boolean;
  checked_in_at: string;
  frequency_id?: number;
  notes?: string;
  relayed_by?: string;
}

interface TimeSeriesDataPoint {
  label: string;
  value: number;
  date: string;
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
  check_ins_by_frequency: Record<string, number>;
  check_ins_timeline: TimeSeriesDataPoint[];
  top_operators: { callsign: string; check_in_count: number; first_check_in: string }[];
}

interface NetRole {
  id: number;
  user_id: number;
  email: string;
  name?: string;
  callsign?: string;
  role: string;
}

// ========== COMPONENT ==========

const NetReport: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const [net, setNet] = useState<Net | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [netRoles, setNetRoles] = useState<NetRole[]>([]);
  const [topicPrompt, setTopicPrompt] = useState<string | null>(null);
  const [topicResponses, setTopicResponses] = useState<TopicResponse[]>([]);
  const [pollQuestion, setPollQuestion] = useState<string | null>(null);
  const [pollResults, setPollResults] = useState<PollResult[]>([]);
  const [canHearReports, setCanHearReports] = useState<CanHearReportEntry[]>([]);
  const [ics309LogData, setIcs309LogData] = useState<Ics309LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Which report section is currently being captured to PNG, keyed by its
  // element id -- lets each section's download button show its own spinner
  // independently instead of one shared "exporting" flag for all three.
  const [pngExportingId, setPngExportingId] = useState<string | null>(null);
  // Separate from pngExportingId, which tracks the one section mid-capture:
  // this stays true across the whole "Export PNG" run so the header button can
  // show progress and stay disabled between individual captures.
  const [exportingAllPngs, setExportingAllPngs] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  // Opt-in, view-time only (not persisted) - per-station coverage maps make
  // an already-long report substantially longer, so they're off by default.
  const [includeCoverageMaps, setIncludeCoverageMaps] = useState(false);

  // Always use OSM light tiles in the report — this is a print/export document
  // and dark tiles are unreadable on white paper regardless of app UI mode.
  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // State for mapped locations
  interface MappedCheckIn {
    checkIn: CheckIn;
    parsedLocation: ParsedLocation;
  }
  const [mappedCheckIns, setMappedCheckIns] = useState<MappedCheckIn[]>([]);
  // Checked-in (non-checked-out) stations that couldn't be placed on the map --
  // no location on file, an unparseable location, or a geocode that came back
  // empty. Surfaced explicitly rather than silently dropped, see Section 3 below.
  const [unmappedCheckIns, setUnmappedCheckIns] = useState<CheckIn[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapTilesReady, setMapTilesReady] = useState(false);
  const processedKeyRef = useRef<string>('');

  // Colors for pie chart
  const COLORS = [
    theme.palette.success.main,
    theme.palette.info.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.primary.main,
    theme.palette.secondary.main,
  ];

  // ========== DATA FETCHING ==========

  useEffect(() => {
    const fetchAllData = async () => {
      if (!netId) return;

      try {
        setLoading(true);
        setError(null);

        // Fetch all data in parallel
        const [netRes, statsRes, checkInsRes, chatRes, rolesRes, topicRes, pollRes, canHearRes, ics309Res] = await Promise.all([
          netApi.get(parseInt(netId)),
          statisticsApi.getNetStats(parseInt(netId)),
          checkInApi.list(parseInt(netId)),
          chatApi.list(parseInt(netId)),
          netRoleApi.list(parseInt(netId)),
          netApi.getTopicResponses(parseInt(netId)),
          netApi.getPollResults(parseInt(netId)),
          canHearApi.list(parseInt(netId)),
          netApi.getIcs309Log(parseInt(netId)),
        ]);

        setNet(netRes.data);
        setStats(statsRes.data);
        setCheckIns(checkInsRes.data);
        setChatMessages(chatRes.data);
        setNetRoles(rolesRes.data);
        setTopicPrompt(topicRes.data.prompt || null);
        setTopicResponses(topicRes.data.responses || []);
        setPollQuestion(pollRes.data.question || null);
        setPollResults(pollRes.data.results || []);
        setCanHearReports(canHearRes.data || []);
        setIcs309LogData(ics309Res.data);
      } catch (err: any) {
        console.error('Failed to fetch net report data:', err);
        setError(getErrorMessage(err, 'Failed to load net report'));
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [netId]);

  // ========== LOCATION PROCESSING FOR MAP ==========

  // Process check-in locations for map display
  useEffect(() => {
    if (checkIns.length === 0) return;

    // Create a stable key for checkIns to prevent unnecessary re-runs
    const checkInsKey = checkIns
      .filter(c => c.location && c.status.toUpperCase() !== 'CHECKED_OUT')
      .map(c => `${c.id}:${c.location}:${c.status}`)
      .join('|');

    // Skip if we've already processed this exact set of checkIns
    if (processedKeyRef.current === checkInsKey && mappedCheckIns.length > 0) {
      return;
    }

    const processLocations = async () => {
      setMapLoading(true);
      const results: MappedCheckIn[] = [];
      const failed: CheckIn[] = [];
      const addressesToGeocode: { checkIn: CheckIn; parsed: ParsedLocation }[] = [];

      // First pass: parse all locations
      for (const checkIn of checkIns) {
        if (checkIn.status.toUpperCase() === 'CHECKED_OUT') continue;
        if (!checkIn.location) {
          failed.push(checkIn);
          continue;
        }

        const parsed = parseLocation(checkIn.location);
        if (parsed) {
          if (parsed.type === 'address') {
            // Need to geocode this address
            addressesToGeocode.push({ checkIn, parsed });
          } else {
            // Already have coordinates
            results.push({ checkIn, parsedLocation: parsed });
          }
        } else {
          failed.push(checkIn);
        }
      }

      // Geocode every address that needs it. Nominatim rate limiting is
      // already serialized server-side (app/routers/geocode.py) and results
      // are cached there, so there's no reason to cap this list -- a net
      // with many unique locations just takes a few extra seconds the first
      // time. (Previously hard-capped at 10, which silently dropped every
      // station past the 10th with no indication anything was missing --
      // see docs/CHANGELOG.md.)
      for (const { checkIn, parsed } of addressesToGeocode) {
        const geocoded = await geocodeAddress(parsed.original);
        if (geocoded) {
          results.push({
            checkIn,
            parsedLocation: {
              ...geocoded,
              type: 'address',
              original: parsed.original
            }
          });
        } else {
          failed.push(checkIn);
        }
      }

      processedKeyRef.current = checkInsKey;
      setMappedCheckIns(results);
      setUnmappedCheckIns(failed);
      setMapTilesReady(false);
      setMapLoading(false);
    };

    processLocations();
  }, [checkIns]);

  // Get marker color based on status (handle UPPERCASE database values)
  const getStatusColor = (status: string): string => {
    switch (status.toUpperCase()) {
      case 'CHECKED_IN': return theme.palette.success.main;
      case 'HAS_TRAFFIC': return theme.palette.error.main;
      case 'TACTICAL': return theme.palette.warning.main;
      case 'MONITORING': return theme.palette.info.main;
      case 'LISTENING': return theme.palette.info.main;
      case 'CHECKING_OUT': return theme.palette.error.light;
      default: return theme.palette.grey[500];
    }
  };

  // Get status label formatted nicely
  const getStatusLabel = (status: string): string => {
    const normalized = status.toLowerCase().replace('_', ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  // PDF-friendly status badge (html2canvas doesn't render MUI Chip text properly)
  const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const color = getStatusColor(status);
    const label = getStatusLabel(status);
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '12px',
          backgroundColor: color,
          color: '#ffffff',
          fontSize: '0.7rem',
          fontWeight: 500,
          textTransform: 'capitalize',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    );
  };

  // ========== HELPERS ==========

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getFrequencyLabel = (freq: Frequency): string => {
    if (freq.frequency) {
      return `${freq.frequency} ${freq.mode}`;
    }
    if (freq.network && freq.talkgroup) {
      return `${freq.network} TG ${freq.talkgroup}`;
    }
    return freq.description || 'Unknown';
  };

  const getFrequencyById = (freqId?: number): string => {
    if (!freqId || !net?.frequencies) return '—';
    const freq = net.frequencies.find(f => f.id === freqId);
    return freq ? getFrequencyLabel(freq) : '—';
  };

  // ========== PDF EXPORT ==========

  const handleExportPdf = async () => {
    setExporting(true);
    // Let React re-render (hides expand buttons) before html2canvas captures
    await new Promise(resolve => setTimeout(resolve, 60));
    try {
      const filename = net?.name
        ? `${net.name.replace(/[^a-zA-Z0-9]/g, '_')}_Net_Report`
        : 'Net_Report';

      await exportElementToPdf('net-report-content', {
        filename,
        orientation: 'portrait',
        scale: 1.2, // JPEG compression handles quality; lower scale = smaller file
        margin: 10,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  // ========== PNG EXPORT (per report section, for social media posts) ==========

  const handleExportPng = async (elementId: string, label: string) => {
    setPngExportingId(elementId);
    // Let React re-render before html2canvas reads the DOM. This does more
    // than hide the section's own Expand/Download buttons: the charts restack
    // to full width and the map block changes shape, and both Recharts'
    // ResponsiveContainer and Leaflet re-measure asynchronously. 60ms is
    // enough for a visibility toggle but not for a reflow -- too short and the
    // charts capture at their old width. The map waits longer still, because
    // invalidateSize() has to fetch tiles for the edges its new shape exposes.
    const reflowDelayMs = elementId === 'net-report-map' ? 900 : 350;
    await new Promise(resolve => setTimeout(resolve, reflowDelayMs));
    try {
      const netLabel = net?.name ? net.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Net';
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

  // Compute dual-map data (memoized) - must be before any early returns to satisfy React hooks rules
  const dualMapData = useMemo(() => {
    if (mappedCheckIns.length < 3) return null;
    const pts = mappedCheckIns.map(m => ({ lat: m.parsedLocation.lat, lon: m.parsedLocation.lon }));
    return computeDualMapData(pts);
  }, [mappedCheckIns]);

  // One entry per station that filed at least one "can hear" report as
  // reporter, with the list of stations it heard. Stations that were only
  // ever heard (never reported hearing anyone themselves) don't get their
  // own map - there's nothing to plot from their side.
  const stationCoverageMaps = useMemo(() => {
    if (canHearReports.length === 0) return [];

    const positionByCheckInId = new Map<number, [number, number]>();
    for (const m of mappedCheckIns) {
      if (m.parsedLocation.lat !== 0 || m.parsedLocation.lon !== 0) {
        positionByCheckInId.set(m.checkIn.id, [m.parsedLocation.lat, m.parsedLocation.lon]);
      }
    }

    // Two-way detection mirrors CheckInMap.tsx's coverageLines logic: a pair
    // is two-way when both directions were independently reported.
    const allEdgeKeys = new Set(
      canHearReports.map((r) => `${r.reporter_check_in_id}-${r.heard_check_in_id}-${r.frequency_id ?? 'none'}`)
    );

    const byReporter = new Map<number, { callsign: string; reports: CanHearReportEntry[] }>();
    for (const r of canHearReports) {
      const entry = byReporter.get(r.reporter_check_in_id);
      if (entry) entry.reports.push(r);
      else byReporter.set(r.reporter_check_in_id, { callsign: r.reporter_callsign, reports: [r] });
    }

    const result = Array.from(byReporter.entries()).map(([reporterCheckInId, { callsign, reports }]) => ({
      reporterCheckInId,
      reporterCallsign: callsign,
      reporterPosition: positionByCheckInId.get(reporterCheckInId) ?? null,
      heard: reports.map((r) => ({
        reportId: r.id,
        checkInId: r.heard_check_in_id,
        callsign: r.heard_callsign,
        position: positionByCheckInId.get(r.heard_check_in_id) ?? null,
        twoWay: allEdgeKeys.has(`${r.heard_check_in_id}-${r.reporter_check_in_id}-${r.frequency_id ?? 'none'}`),
      })),
    }));

    result.sort((a, b) => a.reporterCallsign.localeCompare(b.reporterCallsign));
    return result;
  }, [canHearReports, mappedCheckIns]);

  // Binned check-in activity: counts per adaptive time window, capped at last check-in.
  // See utils/checkInTimeline.ts -- this was an exact duplicate of
  // NetStatistics.tsx's own copy, including the negative-minutes bug that
  // crashed this page ("RangeError: Invalid array length") on production
  // net 56 after the same fix had already landed in NetStatistics.tsx.
  const { timelineData, binSize } = useMemo(
    () => computeCheckInTimeline(stats?.check_ins_timeline),
    [stats]
  );

  // ========== LOADING & ERROR STATES ==========

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <CircularProgress size={48} />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Generating Net Report...
          </Typography>
        </Box>
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

  if (!net || !stats) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">Net not found</Alert>
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

  // Prepare chart data
  const statusData = Object.entries(stats.status_counts).map(([name, value]) => ({
    name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value,
  }));

  const frequencyData = Object.entries(stats.check_ins_by_frequency).map(([name, value]) => ({
    name,
    count: value,
  }));

  // Compute column width so visible charts always fill the full row
  const showFrequency = net.frequencies.length > 1 && frequencyData.length > 0;
  const chartCount = [statusData.length > 0, timelineData.length >= 2, showFrequency].filter(Boolean).length;
  const chartMd = (chartCount === 3 ? 4 : chartCount === 2 ? 6 : 12) as 4 | 6 | 12;

  // True only while that specific section is being captured as a PNG, which is
  // when the social-media export layout applies (see PNG_EXPORT_* above).
  const isChartPngExport = pngExportingId === 'net-report-charts';
  const isMapPngExport = pngExportingId === 'net-report-map';

  // The sections the header's "Export PNG" button downloads, in report order.
  // Charts and the map are conditional -- a net with no location data has no
  // map section to capture, and a single-frequency net may have no charts.
  const pngSections: { id: string; label: string }[] = [
    ...(chartCount > 0 ? [{ id: 'net-report-charts', label: 'Graphs' }] : []),
    ...(mappedCheckIns.length > 0 ? [{ id: 'net-report-map', label: 'Map' }] : []),
    { id: 'net-report-checkin-log', label: 'CheckIn_List' },
  ];

  // Downloads every present section as its own PNG. Sequential, not parallel:
  // each capture reshapes the live DOM (see PNG_EXPORT_* above), so two at once
  // would fight over the same layout. The gap between them matters too --
  // browsers throttle rapid programmatic downloads, and without it the later
  // files can be silently dropped.
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

  // Get NCS operators from net roles
  // NetRole.role is always stored uppercase ("NCS") -- every other role
  // comparison in the frontend (NetView.tsx, NetPaneWindow.tsx,
  // NCSStaffModal.tsx) matches on 'NCS'. This one compared against 'ncs'
  // instead, so the "Net Control Station(s)" section below silently
  // rendered nothing on every net report, for every net, until this fix.
  const ncsOperators = netRoles.filter(r => r.role === 'NCS');

  // Split chat into user messages and system log entries
  const userChatMessages = chatMessages.filter(m => !m.is_system);
  const systemLogMessages = chatMessages.filter(m => m.is_system);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* ========== HEADER (outside PDF content) ========== */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight="bold">
            Net Report
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Comprehensive report for {net.name}
          </Typography>
        </Box>
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
        {/* Downloads each report section as its own PNG, for social media
            posts. The same captures the per-section PNG buttons produce. */}
        <Tooltip title={`Download all ${pngSections.length} report sections as PNG images`}>
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
          onClick={() => navigate(`/nets/${net.id}`)}
        >
          View Net
        </Button>
      </Box>

      {/* Report-wide options live at the top, not buried next to the section
          they affect further down the page, so a user scanning the report
          before scrolling can see this choice exists. */}
      {net.propagation_logging_enabled && canHearReports.length > 0 && !exporting && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeCoverageMaps}
                onChange={(e) => setIncludeCoverageMaps(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Include per-station coverage maps</Typography>}
          />
        </Box>
      )}

      {/* ========== PDF CONTENT WRAPPER ========== */}
      {/* Force light mode styling for print-friendly PDF export */}
      <Box 
        id="net-report-content" 
        sx={{ 
          backgroundColor: '#ffffff !important',
          color: '#000000 !important', 
          p: 2, 
          borderRadius: 1,
          // Force all text to be dark for printing
          '& *': {
            colorAdjust: 'exact',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          },
          '& .MuiTypography-root': {
            color: '#000000 !important',
          },
          '& .MuiTypography-colorTextSecondary': {
            color: '#666666 !important',
          },
          '& .MuiPaper-root': {
            backgroundColor: '#ffffff !important',
          },
          '& .MuiTableCell-root': {
            color: '#000000 !important',
            borderColor: '#e0e0e0 !important',
          },
          '& .MuiCard-root': {
            backgroundColor: '#ffffff !important',
          },
          '& .MuiCardContent-root': {
            backgroundColor: '#ffffff !important',
          },
          '& .MuiChip-label': {
            color: '#000000 !important',
          },
          '& .MuiChip-root': {
            borderColor: '#666666 !important',
          },
        }}
      >
        
        {/* ========== REPORT TITLE HEADER ========== */}
        <Box sx={{ textAlign: 'center', mb: 3, pb: 2, borderBottom: 2, borderColor: 'primary.main' }}>
          <Typography variant="h3" fontWeight="bold" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <AppLogo size={48} variant="default" /> ECTLogger
          </Typography>
          <Typography variant="h5" fontWeight="medium" gutterBottom>
            Net Report
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {window.location.origin}
          </Typography>
        </Box>

        {/* ========== SECTION 1: NET INFO HEADER ========== */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            {net.name}
          </Typography>
          {net.description && (
            <Typography variant="body1" color="text.secondary" paragraph>
              {net.description}
            </Typography>
          )}
          {/* No status/ICS-309 badge row here. Reports are read after the net
              has closed or been archived, so the status adds nothing, and the
              ICS-309 log gets its own section below plus a download button for
              net managers. */}
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Started: {stats.started_at ? formatDateTime(stats.started_at, user?.prefer_utc || false) : '—'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Closed: {stats.closed_at ? formatDateTime(stats.closed_at, user?.prefer_utc || false) : '—'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Duration: {stats.duration_minutes ? formatDuration(stats.duration_minutes) : '—'}
            </Typography>
          </Box>

          {/* Frequencies */}
          {net.frequencies.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Frequencies:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {net.frequencies.map((freq) => (
                  <Chip key={freq.id} label={getFrequencyLabel(freq)} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>
          )}

          {/* NCS Operators */}
          {ncsOperators.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Net Control Station(s):
              </Typography>
              <Typography variant="body2">
                {ncsOperators.map(r => displayCallsign(r) || r.email).join(', ')}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* ========== SECTION 2: STATISTICS SUMMARY ========== */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp /> Statistics Summary
          </Typography>
          {/* Labelled, not icon-only: an unlabelled icon relies on a hover
              tooltip that never appears on a phone, which made these
              effectively invisible. See DESIGN.md "Touch targets". */}
          {!exporting && !pngExportingId && chartCount > 0 && (
            <Box sx={{ ml: 'auto' }}>
              <CardActionButton
                icon={<DownloadIcon fontSize="small" />}
                label="PNG"
                tooltip="Download graphs as a PNG image"
                onClick={() => handleExportPng('net-report-charts', 'Graphs')}
              />
            </Box>
          )}
          {pngExportingId === 'net-report-charts' && <CircularProgress size={18} sx={{ ml: 'auto' }} />}
        </Box>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight="bold" color="primary">
                  {stats.total_check_ins}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Check-ins
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight="bold" color="info.main">
                  {stats.unique_callsigns}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Unique Operators
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight="bold" color="warning.main">
                  {stats.rechecks}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Re-checks
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" fontWeight="bold" color="secondary">
                  {stats.duration_minutes ? formatDuration(stats.duration_minutes) : '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Duration
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Charts Row — all three charts fit one row */}
        {/* Pinned to the same export width as the map: stacked full-bleed at
            the report's own width leaves the pie stranded in a very wide box,
            and both sections should post at a consistent size. During export
            a stats sidebar joins the charts inside the same captured box, so
            the id moves from the Grid to this wrapping Box; the Grid itself
            just becomes the flex-1 left column. */}
        <Box
          id="net-report-charts"
          sx={{
            mb: 3,
            display: 'flex',
            gap: isChartPngExport ? 3 : 0,
            ...(isChartPngExport && { width: PNG_EXPORT_WIDTH_PX, mb: 0 }),
          }}
        >
        <Grid container spacing={3} sx={{ flex: 1, minWidth: 0 }}>
          {/* Status Breakdown Pie Chart */}
          {statusData.length > 0 && (
            <Grid item xs={12} md={isChartPngExport ? 12 : chartMd}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="medium">Check-in Status</Typography>
                  {!exporting && !pngExportingId && (
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setExpandedCard('status')} sx={{ ml: 'auto' }}>
                        <FullscreenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                <ResponsiveContainer width="100%" height={isChartPngExport ? PNG_EXPORT_PIE_HEIGHT_PX : 200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="45%"
                      outerRadius={isChartPngExport ? PNG_EXPORT_PIE_RADIUS_PX : 60}
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
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* ========== CHECK-IN ACTIVITY CHART ========== */}
          {/* Binned area chart showing check-in flow over time */}
          {timelineData.length >= 2 && (
            <Grid item xs={12} md={isChartPngExport ? 12 : chartMd}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight="medium">Check-in Activity</Typography>
                  {!exporting && !pngExportingId && (
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setExpandedCard('activity')} sx={{ ml: 'auto' }}>
                        <FullscreenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Check-ins per {binSize}-min window
                </Typography>
                <ResponsiveContainer width="100%" height={isChartPngExport ? PNG_EXPORT_CHART_HEIGHT_PX : 170}>
                  <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="reportActivityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      interval={Math.max(0, Math.floor(timelineData.length / 5) - 1)}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'Check-ins', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 10 } }}
                    />
                    <RechartsTooltip
                      formatter={(value: number) => [value, `check-ins in ${binSize}m`]}
                    />
                    <Area
                      type="basis"
                      dataKey="count"
                      stroke={theme.palette.success.main}
                      strokeWidth={2}
                      fill="url(#reportActivityGradient)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* Frequency Bar Chart — only shown when net has multiple frequencies */}
          {showFrequency && (
            <Grid item xs={12} md={isChartPngExport ? 12 : chartMd}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="medium">Check-ins by Frequency</Typography>
                  {!exporting && !pngExportingId && (
                    <Tooltip title="Expand">
                      <IconButton size="small" onClick={() => setExpandedCard('frequency')} sx={{ ml: 'auto' }}>
                        <FullscreenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
                <ResponsiveContainer width="100%" height={isChartPngExport ? PNG_EXPORT_CHART_HEIGHT_PX : 200}>
                  <BarChart data={frequencyData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}
        </Grid>
        {/* Stats sidebar: only rendered during export -- on screen these
            numbers already appear in the Statistics Summary cards above, so
            duplicating them here would just repeat the page. The graphs
            export is a standalone image with no cards around it, so it needs
            its own copy to be self-contained. */}
        {isChartPngExport && (
          <Box sx={{ flex: '0 0 216px', display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'space-between' }}>
            {[
              { value: stats.total_check_ins, label: 'Total Check-ins', color: 'primary.main' },
              { value: stats.unique_callsigns, label: 'Unique Operators', color: 'info.main' },
              { value: stats.rechecks, label: 'Re-checks', color: 'warning.main' },
              { value: stats.duration_minutes ? formatDuration(stats.duration_minutes) : '—', label: 'Duration', color: 'secondary.main' },
            ].map((s) => (
              <Card key={s.label} variant="outlined">
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: s.color }}>
                    {s.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {s.label}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
        </Box>

        {/* ========== SECTION 3: CHECK-IN MAP (if locations available) ========== */}
        {mappedCheckIns.length > 0 && (
          <Box sx={{ position: 'relative' }}>
          {/* Progress sits OUTSIDE #net-report-map: the map's heading row is
              inside the captured element, so a spinner in that row lands in the
              exported PNG. The chart and log sections keep theirs inline
              because their heading rows are siblings of the captured element,
              not part of it. */}
          {isMapPngExport && (
            <CircularProgress size={18} sx={{ position: 'absolute', top: 30, right: 0, zIndex: 2 }} />
          )}
          <Box
            id="net-report-map"
            // Pinned to a fixed width and aspect ratio only while being
            // captured (see PNG_EXPORT_* above). Flex column so the heading and
            // legend keep their natural height and the map pane takes the rest.
            sx={isMapPngExport ? {
              width: PNG_EXPORT_WIDTH_PX,
              // Single map only: flex column + a pinned ratio lets the map pane
              // absorb whatever the heading and legend don't use, so the block
              // is exactly 4:3 however the text wraps. The dual layout can't do
              // this (see PNG_EXPORT_DUAL_PANE_HEIGHT_PX) and sizes its panes
              // directly instead.
              ...(dualMapData ? {} : {
                aspectRatio: PNG_EXPORT_MAP_ASPECT,
                display: 'flex',
                flexDirection: 'column',
              }),
            } : undefined}
          >
            <Box sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 1, ...(isMapPngExport && { mt: 0, flexShrink: 0 }) }}>
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MapIcon /> Check-in Map ({mappedCheckIns.length} locations)
              </Typography>
              {dualMapData && (
                <Typography variant="caption" color="text.secondary">
                  {/* The panes stack for the PNG export, so "left/right" would
                      be wrong in the exported image. */}
                  {isMapPngExport
                    ? '— split view: cluster detail (top) and full overview (bottom)'
                    : '— split view: cluster detail (left) and full overview (right)'}
                </Typography>
              )}
              {!exporting && !pngExportingId && (
                <Box sx={{ ml: 'auto' }}>
                  <CardActionButton
                    icon={<DownloadIcon fontSize="small" />}
                    label="PNG"
                    tooltip="Download the map as a PNG image"
                    onClick={() => handleExportPng('net-report-map', 'Map')}
                  />
                </Box>
              )}
              {!exporting && !pngExportingId && (
                <Tooltip title="Expand">
                  <IconButton size="small" onClick={() => setExpandedCard('map')}>
                    <FullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            {/* ---- Helper: shared marker list for a given MapContainer ---- */}
            {/* Rendered inline inside each MapContainer below */}

            {dualMapData ? (
              // ---- DUAL MAP: cluster detail + full overview side-by-side ----
              <Grid container spacing={2} sx={{ mb: 3, ...(isMapPngExport && { mb: 0 }) }}>
                {/* Left: cluster zoom (stacked on top during a PNG export) */}
                <Grid item xs={12} md={isMapPngExport ? 12 : 6}>
                  <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                      <Typography variant="caption" fontWeight="medium">
                        📍 Cluster Detail ({dualMapData.clusterPositions.length} stations)
                      </Typography>
                    </Box>
                    <Box sx={{ position: 'relative', width: '100%', height: isMapPngExport ? PNG_EXPORT_DUAL_PANE_HEIGHT_PX : 320 }}>
                      {!mapTilesReady && (
                        <Box sx={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: 'background.paper' }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" color="text.secondary">Loading map...</Typography>
                        </Box>
                      )}
                      <MapContainer
                        center={[39.8283, -98.5795]}
                        zoom={4}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={false}
                      >
                        <TileLayer
                          attribution={tileAttribution}
                          url={tileUrl}
                          eventHandlers={{ load: () => setMapTilesReady(true) }}
                        />
                        <FitBounds positions={dualMapData.clusterPositions} resizeToken={isMapPngExport ? 1 : 0} />
                        {mappedCheckIns.map((mapped) => (
                          <Marker
                            key={`cluster-${mapped.checkIn.id}`}
                            position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                            icon={createColoredIcon(getStatusColor(mapped.checkIn.status))}
                          >
                            <Popup>
                              <Box sx={{ minWidth: 150 }}>
                                <Typography variant="subtitle2" fontWeight="bold">{mapped.checkIn.callsign}</Typography>
                                {mapped.checkIn.name && <Typography variant="body2">{mapped.checkIn.name}</Typography>}
                                <Typography variant="body2" color="text.secondary">{mapped.checkIn.location}</Typography>
                                <Box sx={{ mt: 0.5 }}><StatusBadge status={mapped.checkIn.status} /></Box>
                              </Box>
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
                    <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                      <Typography variant="caption" fontWeight="medium">
                        🌐 Full Overview ({dualMapData.allPositions.length} stations)
                      </Typography>
                    </Box>
                    <Box sx={{ position: 'relative', width: '100%', height: isMapPngExport ? PNG_EXPORT_DUAL_PANE_HEIGHT_PX : 320 }}>
                      {!mapTilesReady && (
                        <Box sx={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: 'background.paper' }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" color="text.secondary">Loading map...</Typography>
                        </Box>
                      )}
                      <MapContainer
                        center={[39.8283, -98.5795]}
                        zoom={4}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={false}
                      >
                        <TileLayer
                          attribution={tileAttribution}
                          url={tileUrl}
                          eventHandlers={{ load: () => setMapTilesReady(true) }}
                        />
                        <FitBounds positions={dualMapData.allPositions} resizeToken={isMapPngExport ? 1 : 0} />
                        {mappedCheckIns.map((mapped) => (
                          <Marker
                            key={`overview-${mapped.checkIn.id}`}
                            position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                            icon={createColoredIcon(getStatusColor(mapped.checkIn.status))}
                          >
                            <Popup>
                              <Box sx={{ minWidth: 150 }}>
                                <Typography variant="subtitle2" fontWeight="bold">{mapped.checkIn.callsign}</Typography>
                                {mapped.checkIn.name && <Typography variant="body2">{mapped.checkIn.name}</Typography>}
                                <Typography variant="body2" color="text.secondary">{mapped.checkIn.location}</Typography>
                                <Box sx={{ mt: 0.5 }}><StatusBadge status={mapped.checkIn.status} /></Box>
                              </Box>
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </Box>
                  </Paper>
                </Grid>

                {/* Shared legend below both maps */}
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.success.main }} />
                      <Typography variant="caption">Checked In</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.warning.main }} />
                      <Typography variant="caption">Tactical</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.info.main }} />
                      <Typography variant="caption">Monitoring</Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            ) : (
              // ---- SINGLE MAP: all stations in one view ----
              <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden', ...(isMapPngExport && { mb: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }) }}>
                <Box sx={{ position: 'relative', width: '100%', ...(isMapPngExport ? { flex: 1, minHeight: 0 } : { height: 400 }) }}>
                  {!mapTilesReady && (
                    <Box sx={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: 'background.paper' }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">Loading map...</Typography>
                    </Box>
                  )}
                  <MapContainer
                    center={[39.8283, -98.5795]}
                    zoom={4}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      attribution={tileAttribution}
                      url={tileUrl}
                      eventHandlers={{ load: () => setMapTilesReady(true) }}
                    />
                    <FitBounds
                      positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])}
                      resizeToken={isMapPngExport ? 1 : 0}
                    />
                    {mappedCheckIns.map((mapped) => (
                      <Marker
                        key={mapped.checkIn.id}
                        position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                        icon={createColoredIcon(getStatusColor(mapped.checkIn.status))}
                      >
                        <Popup>
                          <Box sx={{ minWidth: 150 }}>
                            <Typography variant="subtitle2" fontWeight="bold">{mapped.checkIn.callsign}</Typography>
                            {mapped.checkIn.name && <Typography variant="body2">{mapped.checkIn.name}</Typography>}
                            <Typography variant="body2" color="text.secondary">{mapped.checkIn.location}</Typography>
                            <Box sx={{ mt: 0.5 }}><StatusBadge status={mapped.checkIn.status} /></Box>
                          </Box>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </Box>
                {/* Map Legend */}
                <Box sx={{ p: 1, display: 'flex', gap: 2, flexWrap: 'wrap', borderTop: `1px solid ${theme.palette.divider}`, ...(isMapPngExport && { flexShrink: 0 }) }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.success.main }} />
                    <Typography variant="caption">Checked In</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.warning.main }} />
                    <Typography variant="caption">Tactical</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.info.main }} />
                    <Typography variant="caption">Monitoring</Typography>
                  </Box>
                </Box>
              </Paper>
            )}
          </Box>
          </Box>
        )}
        {mapLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">Loading map locations...</Typography>
          </Box>
        )}

        {/* ---- Stations the primary check-in map couldn't place ---- */}
        {/* No location on file, an unparseable location, or a geocode that
            came back empty -- listed explicitly rather than just vanishing
            from the map with no explanation. */}
        {!mapLoading && unmappedCheckIns.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Not mapped due to insufficient location information: {unmappedCheckIns.map((c) => c.callsign).join(', ')}
            </Typography>
          </Box>
        )}

        {/* ========== SECTION 4: CHECK-IN LOG ========== */}
        <Box id="net-report-checkin-log">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Assignment /> Check-in Log ({checkIns.length} event{checkIns.length !== 1 ? 's' : ''} &mdash; {stats.unique_callsigns} unique station{stats.unique_callsigns !== 1 ? 's' : ''}{stats.rechecks > 0 ? `, ${stats.rechecks} re-check${stats.rechecks !== 1 ? 's' : ''}` : ''})
          </Typography>
          {!exporting && !pngExportingId && (
            <Box sx={{ ml: 'auto' }}>
              <CardActionButton
                icon={<DownloadIcon fontSize="small" />}
                label="PNG"
                tooltip="Download the check-in list as a PNG image"
                onClick={() => handleExportPng('net-report-checkin-log', 'CheckIn_List')}
              />
            </Box>
          )}
          {pngExportingId === 'net-report-checkin-log' && <CircularProgress size={18} sx={{ ml: 'auto' }} />}
        </Box>

        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Callsign</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Location</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Frequency</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {checkIns.map((checkIn, index) => (
                <TableRow key={checkIn.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover }, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                    {formatTimeWithDate(checkIn.checked_in_at, user?.prefer_utc || false)}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {checkIn.callsign}
                      </Typography>
                      {checkIn.is_recheck && (
                        <span style={{ 
                          display: 'inline-block',
                          padding: '0 4px', 
                          borderRadius: '8px', 
                          backgroundColor: theme.palette.grey[400],
                          color: '#ffffff',
                          fontSize: '0.6rem',
                          fontWeight: 600,
                        }}>R</span>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{checkIn.name || '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {checkIn.location || '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={checkIn.status} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>
                    {getFrequencyById(checkIn.frequency_id)}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem' }}>
                    {checkIn.relayed_by ? `Via ${checkIn.relayed_by}` : ''}{checkIn.relayed_by && checkIn.notes ? ' - ' : ''}{checkIn.notes || ''}
                  </TableCell>
                </TableRow>
              ))}
              {checkIns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="text.secondary">No check-ins recorded</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </Box>

        {/* ========== SECTION 5: TOPIC OF THE WEEK (if enabled and responses exist) ========== */}
        {topicPrompt && (
          <>
            <Typography variant="h6" sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <TopicIcon /> Topic of the Week ({topicResponses.length} response{topicResponses.length !== 1 ? 's' : ''})
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                {topicPrompt}
              </Typography>
              {topicResponses.length > 0 ? (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Callsign</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 150 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Answer</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topicResponses.map((r: TopicResponse, i: number) => (
                        <TableRow key={i} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
                          <TableCell><Typography variant="body2" fontWeight="medium">{r.callsign}</Typography></TableCell>
                          <TableCell>{r.name || '—'}</TableCell>
                          <TableCell>{r.response}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">No responses recorded.</Typography>
              )}
            </Paper>
          </>
        )}

        {/* ========== SECTION 6: POLL RESULTS (if poll enabled and responses exist) ========== */}
        {pollQuestion && pollResults.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <TopicIcon sx={{ transform: 'scaleX(-1)' }} /> Poll Results ({pollResults.reduce((s, r) => s + r.count, 0)} response{pollResults.reduce((s, r) => s + r.count, 0) !== 1 ? 's' : ''})
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                {pollQuestion}
              </Typography>
              <ResponsiveContainer width="100%" height={Math.max(160, pollResults.length * 48)}>
                <BarChart
                  data={pollResults.map(r => ({ name: r.response, count: r.count }))}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 12 }} />
                  <RechartsTooltip formatter={(v: number) => [`${v} vote${v !== 1 ? 's' : ''}`, 'Votes']} />
                  <Bar dataKey="count" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]}>
                    {pollResults.map((_, index) => (
                      <Cell key={`poll-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Tabular fallback for PDF export */}
              <TableContainer sx={{ mt: 2, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Response</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 80 }} align="right">Votes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pollResults.map((r: PollResult, i: number) => (
                      <TableRow key={i} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
                        <TableCell>{r.response}</TableCell>
                        <TableCell align="right">{r.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}

        {/* ========== SECTION 7: CHAT MESSAGES (operator messages only) ========== */}
        {userChatMessages.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChatIcon /> Chat Messages ({userChatMessages.length} message{userChatMessages.length !== 1 ? 's' : ''})
            </Typography>
            
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 'bold', width: 140 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', width: 100 }}>From</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {userChatMessages.map((msg: ChatMessage) => (
                    <TableRow key={msg.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {formatTimeWithDate(msg.created_at, user?.prefer_utc || false)}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {msg.callsign || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatChatMessageText(msg.message)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* ========== SECTION 8: SYSTEM LOG (automated event entries only) ========== */}
        {systemLogMessages.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SystemLogIcon /> System Log ({systemLogMessages.length} event{systemLogMessages.length !== 1 ? 's' : ''})
            </Typography>
            
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell sx={{ fontWeight: 'bold', width: 140 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Event</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {systemLogMessages.map((msg: ChatMessage) => (
                    <TableRow key={msg.id} sx={{ backgroundColor: theme.palette.action.hover }}>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {formatTimeWithDate(msg.created_at, user?.prefer_utc || false)}
                      </TableCell>
                      <TableCell sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.85rem' }}>
                        {msg.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* ========== SECTION 9: ICS-309 FORMAT (if enabled) ========== */}
        {/* Same ICS309PrintView used by NetView's standalone "ICS-309 PDF"
            button, fed by the same GET .../export/ics309?format=json data --
            one accurate rendering of this form, not a second approximation
            built from checkIns/net directly. See TRAFFIC-HANDLING-DESIGN.md
            section 4.5. */}
        {net.ics309_enabled && ics309LogData && (
          <>
            <Typography variant="h6" sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Assignment /> ICS-309 Communications Log
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 3, overflowX: 'auto' }}>
              <ICS309PrintView id="net-report-ics309-view" data={ics309LogData} />
            </Paper>
          </>
        )}

        {/* ========== SECTION 10: STATION COVERAGE (if propagation logging enabled) ========== */}
        {/* Deliberately a separate section from ICS-309 above, not merged into
            it - coverage reports are not radio traffic, so they don't belong
            in a communications log format (see docs/ROADMAP.md Phase 3). */}
        {net.propagation_logging_enabled && (
          <>
            <Box sx={{ mt: 3, mb: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HearingIcon /> Station Coverage ({canHearReports.length} report{canHearReports.length !== 1 ? 's' : ''})
              </Typography>
              {canHearReports.length > 0 && !exporting && (
                <FormControlLabel
                  sx={{ ml: 'auto', mr: 0 }}
                  control={
                    <Switch
                      size="small"
                      checked={includeCoverageMaps}
                      onChange={(e) => setIncludeCoverageMaps(e.target.checked)}
                    />
                  }
                  label={<Typography variant="body2">Include per-station maps</Typography>}
                />
              )}
            </Box>

            <Box sx={{ mb: 3 }}>
              <CoverageReport
                netId={net.id}
                reports={canHearReports}
                frequencyLabels={Object.fromEntries(net.frequencies.map(f => [f.id, getFrequencyLabel(f)]))}
                showFrequencyColumn={net.frequencies.length > 1}
              />
            </Box>

            {/* ---- Per-station coverage maps (opt-in) ----
                One small map per reporting station, showing that station's
                pin plus every station it reported hearing, connected by
                lines (amber = confirmed two-way, gray dashed = one-way).
                Pin labels are permanent Leaflet tooltips, not click popups,
                so they survive the html2canvas PDF snapshot. */}
            {includeCoverageMaps && stationCoverageMaps.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="medium" sx={{ mb: 1 }}>
                  Per-Station Coverage Maps
                </Typography>
                <Grid container spacing={2}>
                  {stationCoverageMaps.map((station) => {
                    const mappableHeard = station.heard.filter((h) => h.position !== null);
                    const positions: [number, number][] = station.reporterPosition
                      ? [station.reporterPosition, ...mappableHeard.map((h) => h.position as [number, number])]
                      : [];

                    return (
                      <Grid item xs={12} md={6} key={station.reporterCheckInId}>
                        {/* data-pdf-avoid-break: utils/pdfExport.ts keeps a page
                            cut from ever landing inside this card, which would
                            otherwise print as two useless half-map images. */}
                        <Paper variant="outlined" sx={{ overflow: 'hidden' }} data-pdf-avoid-break="true">
                          <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="caption" fontWeight="medium">
                              {station.reporterCallsign} heard {station.heard.length} station{station.heard.length !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                          {!station.reporterPosition || positions.length < 2 ? (
                            <Box sx={{ p: 2 }}>
                              <Typography variant="body2" color="text.secondary">
                                Not enough location data to plot this station's coverage.
                              </Typography>
                            </Box>
                          ) : (
                            <Box sx={{ height: 280, width: '100%' }}>
                              <MapContainer
                                center={station.reporterPosition}
                                zoom={6}
                                style={{ height: '100%', width: '100%' }}
                                scrollWheelZoom={false}
                                preferCanvas
                              >
                                <TileLayer attribution={tileAttribution} url={tileUrl} />
                                <FitBounds positions={positions} />
                                {mappableHeard.map((h) => (
                                  <Polyline
                                    key={h.reportId}
                                    positions={[station.reporterPosition as [number, number], h.position as [number, number]]}
                                    pathOptions={
                                      h.twoWay
                                        ? { color: COVERAGE_TWO_WAY_COLOR, weight: 3, opacity: 0.85 }
                                        : { color: COVERAGE_ONE_WAY_COLOR, weight: 2, opacity: 0.75, dashArray: '6 6' }
                                    }
                                  />
                                ))}
                                <Marker position={station.reporterPosition} icon={createColoredIcon(theme.palette.primary.main)}>
                                  <LeafletTooltip permanent direction="top" offset={[0, -28]} opacity={1}>
                                    {station.reporterCallsign}
                                  </LeafletTooltip>
                                </Marker>
                                {mappableHeard.map((h) => (
                                  <Marker key={h.checkInId} position={h.position as [number, number]} icon={createColoredIcon(theme.palette.grey[600])}>
                                    <LeafletTooltip permanent direction="top" offset={[0, -28]} opacity={1}>
                                      {h.callsign}
                                    </LeafletTooltip>
                                  </Marker>
                                ))}
                              </MapContainer>
                            </Box>
                          )}
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            )}
          </>
        )}

        {/* ========== FOOTER ========== */}
        <Box sx={{ textAlign: 'center', pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Generated by ECTLogger on {formatDateTime(new Date().toISOString(), user?.prefer_utc || false)}
          </Typography>
        </Box>
      </Box>

      {/* ========== FULLSCREEN EXPAND DIALOG ========== */}
      <Dialog fullScreen open={expandedCard !== null} onClose={() => setExpandedCard(null)}>
        <AppBar sx={{ position: 'relative' }} elevation={1}>
          <Toolbar>
            <Typography variant="h6" sx={{ flex: 1 }}>
              {expandedCard === 'status' && 'Check-in Status'}
              {expandedCard === 'activity' && `Check-in Activity — ${binSize}-min windows`}
              {expandedCard === 'frequency' && 'Check-ins by Frequency'}
              {expandedCard === 'map' && `Check-in Map (${mappedCheckIns.length} locations)`}
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
                <RechartsTooltip formatter={(value: number, name: string) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          )}

          {/* ---- Expanded: Activity Area Chart ---- */}
          {expandedCard === 'activity' && timelineData.length >= 2 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="reportExpandedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 13 }}
                  interval={Math.max(0, Math.floor(timelineData.length / 12) - 1)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13 }}
                  label={{ value: 'Check-ins', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 13 } }} />
                <RechartsTooltip formatter={(value: number) => [value, `check-ins in ${binSize}m`]} />
                <Area type="basis" dataKey="count" stroke={theme.palette.success.main} strokeWidth={2.5}
                  fill="url(#reportExpandedGradient)" dot={false} activeDot={{ r: 6 }} />
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
                <RechartsTooltip />
                <Bar dataKey="count" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* ---- Expanded: Map ---- */}
          {expandedCard === 'map' && mappedCheckIns.length > 0 && (
            dualMapData ? (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ height: 'calc(100vh - 130px)', borderRadius: 1, overflow: 'hidden' }}>
                    <MapContainer key="rep-exp-cluster" center={[39.8283, -98.5795]} zoom={4}
                      style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                      <TileLayer attribution={tileAttribution} url={tileUrl} />
                      <FitBounds positions={dualMapData.clusterPositions} />
                      {mappedCheckIns.map(mapped => (
                        <Marker key={`rep-exp-c-${mapped.checkIn.id}`}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={createColoredIcon(getStatusColor(mapped.checkIn.status))}>
                          <Popup>
                            <Box sx={{ minWidth: 150 }}>
                              <Typography variant="subtitle2" fontWeight="bold">{mapped.checkIn.callsign}</Typography>
                              {mapped.checkIn.name && <Typography variant="body2">{mapped.checkIn.name}</Typography>}
                              <Typography variant="body2" color="text.secondary">{mapped.checkIn.location}</Typography>
                              <Box sx={{ mt: 0.5 }}><StatusBadge status={mapped.checkIn.status} /></Box>
                            </Box>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box sx={{ height: 'calc(100vh - 130px)', borderRadius: 1, overflow: 'hidden' }}>
                    <MapContainer key="rep-exp-overview" center={[39.8283, -98.5795]} zoom={4}
                      style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                      <TileLayer attribution={tileAttribution} url={tileUrl} />
                      <FitBounds positions={dualMapData.allPositions} />
                      {mappedCheckIns.map(mapped => (
                        <Marker key={`rep-exp-o-${mapped.checkIn.id}`}
                          position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                          icon={createColoredIcon(getStatusColor(mapped.checkIn.status))}>
                          <Popup>
                            <Box sx={{ minWidth: 150 }}>
                              <Typography variant="subtitle2" fontWeight="bold">{mapped.checkIn.callsign}</Typography>
                              {mapped.checkIn.name && <Typography variant="body2">{mapped.checkIn.name}</Typography>}
                              <Typography variant="body2" color="text.secondary">{mapped.checkIn.location}</Typography>
                              <Box sx={{ mt: 0.5 }}><StatusBadge status={mapped.checkIn.status} /></Box>
                            </Box>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </Box>
                </Grid>
              </Grid>
            ) : (
              <Box sx={{ flex: 1, borderRadius: 1, overflow: 'hidden' }}>
                <MapContainer key="rep-exp-single" center={[39.8283, -98.5795]} zoom={4}
                  style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                  <TileLayer attribution={tileAttribution} url={tileUrl} />
                  <FitBounds positions={mappedCheckIns.map(m => [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number])} />
                  {mappedCheckIns.map(mapped => (
                    <Marker key={`rep-exp-${mapped.checkIn.id}`}
                      position={[mapped.parsedLocation.lat, mapped.parsedLocation.lon]}
                      icon={createColoredIcon(getStatusColor(mapped.checkIn.status))}>
                      <Popup>
                        <Box sx={{ minWidth: 150 }}>
                          <Typography variant="subtitle2" fontWeight="bold">{mapped.checkIn.callsign}</Typography>
                          {mapped.checkIn.name && <Typography variant="body2">{mapped.checkIn.name}</Typography>}
                          <Typography variant="body2" color="text.secondary">{mapped.checkIn.location}</Typography>
                          <Box sx={{ mt: 0.5 }}><StatusBadge status={mapped.checkIn.status} /></Box>
                        </Box>
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

export default NetReport;

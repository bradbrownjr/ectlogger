import React, { useState, useEffect, useMemo, useRef } from 'react';
import { displayCallsign } from '../utils/userDisplay';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
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
  Radio,
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMappedCheckIns } from '../hooks/useMappedCheckIns';
import { getCheckInMarkerColor, getMarkerRoleIds, buildMarkerLegend } from '../utils/checkInMarkers';
import { createStationMarkerIcon } from '../utils/checkInMarkerIcon';
import { getStatusLabel } from '../components/netview/checkInStatusHelpers';
import { computeDualMapData } from '../utils/dualMap';

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
// The graphs and check-in list post as SocialSummaryImages
// (components/report/), a layout of its own rendered off-screen. The map is
// captured from the report itself: on screen it spans the full content width,
// which captured as-is is a roughly 2.5:1 letterbox that feed thumbnails crop,
// so for the PNG only the map block is pinned to a fixed width and aspect
// ratio. None of this affects the on-screen layout or the PDF export.
const PNG_EXPORT_WIDTH_PX = SOCIAL_PAGE_WIDTH_PX;
// Applies to the whole map block (heading + map + legend), not just the map
// pane -- the block is what gets posted, so it's the block that has to be 4:3.
// Achieved with flex rather than pixel maths: the heading and legend take their
// natural height and the map pane absorbs whatever is left, so the ratio holds
// regardless of how tall the text wraps.
const PNG_EXPORT_MAP_ASPECT = '4 / 3';
// Dual-map nets stack their two panes, and are sized by giving each pane a
// fixed height rather than by pinning the block's aspect ratio. The flex
// approach above cannot reach through the panes: they are MUI Grid items, whose
// own `MuiGrid-grid-xs-*` class sets `flex-basis: 100%; flex-grow: 0` and wins
// over an `sx` override, which collapsed both panes to 16px. The panes are
// sized so the whole image stays within 4:5 like the summary images: with the
// compact masthead, headings and legend, 600px panes came out at 1:1.56
// (net 15, 2026-09-26); 420px panes land near 1:1.2.
const PNG_EXPORT_DUAL_PANE_HEIGHT_PX = 420;

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
import { formatDateTime, formatTimeWithDate, formatReportSpan, formatReportShortDate } from '../utils/dateUtils';
import { getErrorMessage } from '../utils/apiErrors';
import { useAuth } from '../contexts/AuthContext';
import { exportElementToPdf, exportElementToPng, exportToPng } from '../utils/pdfExport';
import { computeCheckInTimeline } from '../utils/checkInTimeline';
import CardActionButton from '../components/CardActionButton';
import ReportPaper from '../components/report/ReportPaper';
import { getReportAccent } from '../components/report/ReportAccent';
import ReportMasthead from '../components/report/ReportMasthead';
import ReportFigures from '../components/report/ReportFigures';
import ReportSectionTitle from '../components/report/ReportSectionTitle';
import ReportFooter from '../components/report/ReportFooter';
import SocialSummaryImages, { SocialRosterRow, SOCIAL_PAGE_WIDTH_PX } from '../components/report/SocialSummaryImages';
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
  logo_url?: string | null;
  logo_accent_colors?: string[];
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
  // Mounts SocialSummaryImages off-screen for the length of an Export PNG run.
  const [socialExporting, setSocialExporting] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  // Opt-in, view-time only (not persisted) - per-station coverage maps make
  // an already-long report substantially longer, so they're off by default.
  const [includeCoverageMaps, setIncludeCoverageMaps] = useState(false);

  // Always use OSM light tiles in the report — this is a print/export document
  // and dark tiles are unreadable on white paper regardless of app UI mode.
  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // State for mapped locations. Parsing/geocoding lives in the shared hook so
  // this map always plots exactly what the statistics page's map does --
  // including checked-out stations, which took part in the net and belong in
  // its record. Stations the hook couldn't place (no location on file, an
  // unparseable location, or an empty geocode) come back as unmappedCheckIns
  // and are named explicitly rather than silently dropped, see Section 3 below.
  const { mapped: mappedCheckIns, unmapped: unmappedCheckIns, loading: mapLoading } =
    useMappedCheckIns(checkIns);
  const [mapTilesReady, setMapTilesReady] = useState(false);

  // A new set of markers means the tiles behind them have to redraw, so the
  // "map still rendering" overlay goes back up until a TileLayer reports load.
  useEffect(() => {
    setMapTilesReady(false);
  }, [mappedCheckIns]);

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

  // Role lookup for the map's markers and legend, so a station is the same
  // color here as on the live map (see utils/checkInMarkers.ts).
  const markerRoles = getMarkerRoleIds(netRoles);
  const mapLegend = buildMarkerLegend(
    mappedCheckIns.map(m => m.checkIn),
    markerRoles,
    getStatusLabel
  );

  // PDF-friendly status badge (html2canvas doesn't render MUI Chip text properly)
  const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const color = getCheckInMarkerColor({ status });
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
        pageFooter: net && stats?.started_at
          ? `${net.name} · ${formatReportShortDate(stats.started_at, user?.prefer_utc || false)}`
          : net?.name,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  // ========== PNG EXPORT (the map, for social media posts) ==========

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
        trim: true,
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

  // ========== SOCIAL-MEDIA IMAGES (Export PNG) ==========
  // One row per station, first check-in first: the summary image lists who
  // took part, not every recheck event.
  const socialRows: SocialRosterRow[] = [];
  const seenCallsigns = new Set<string>();
  [...checkIns]
    .sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
    .forEach((c) => {
      const key = c.callsign.toUpperCase();
      if (seenCallsigns.has(key)) return;
      seenCallsigns.add(key);
      socialRows.push({ callsign: c.callsign, name: c.name, location: c.location });
    });

  // Export PNG downloads the summary image(s) -- header, figures, graphs and
  // check-in list, split so no image is taller than 4:5 -- and then the map,
  // if the net has one. Sequential with a gap between files: browsers
  // throttle rapid programmatic downloads and silently drop the later ones.
  const handleExportAllPngs = async () => {
    setExportingAllPngs(true);
    const netLabel = net?.name ? net.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Net';
    try {
      setSocialExporting(true);
      // SocialSummaryImages measures, paginates and renders its pages.
      let pages: HTMLElement[] = [];
      for (let tries = 0; tries < 30 && pages.length === 0; tries++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        pages = Array.from(document.querySelectorAll<HTMLElement>('[data-social-page]'));
      }
      for (const [k, page] of pages.entries()) {
        await exportToPng(page, {
          filename: pages.length > 1 ? `${netLabel}_Summary_${k + 1}_of_${pages.length}` : `${netLabel}_Summary`,
          scale: 2,
          trim: true,
        });
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      setSocialExporting(false);
      if (mappedCheckIns.length > 0) {
        await handleExportPng('net-report-map', 'Map');
      }
    } catch (err) {
      console.error('Failed to export PNG images:', err);
    } finally {
      setSocialExporting(false);
      setExportingAllPngs(false);
    }
  };

  // ========== AUTO EXPORT (?export=pdf, ?export=png) ==========
  // The per-net statistics page's Export PDF and Export PNG open this report
  // with ?export=pdf / ?export=png rather than keeping layouts of their own. Waits for
  // the data, then for the map tiles (or 10 s, so a blocked tile server can't
  // strand it), plus a beat for the charts' entry animation to finish.
  const [searchParams, setSearchParams] = useSearchParams();
  const autoExportFormat = searchParams.get('export');
  const autoExportRequested = autoExportFormat === 'pdf' || autoExportFormat === 'png';
  const autoExportStarted = useRef(false);
  const autoExportReady = mappedCheckIns.length === 0 || mapTilesReady;
  useEffect(() => {
    if (!autoExportRequested || autoExportStarted.current || loading || !net || !stats || mapLoading) return;
    const timer = setTimeout(() => {
      autoExportStarted.current = true;
      setSearchParams((params) => {
        params.delete('export');
        return params;
      }, { replace: true });
      if (autoExportFormat === 'png') handleExportAllPngs();
      else handleExportPdf();
    }, autoExportReady ? 1500 : 10000);
    return () => clearTimeout(timer);
    // handleExportPdf is recreated every render; the inputs it reads are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExportRequested, loading, net, stats, mapLoading, autoExportReady]);

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

  // True only while the map is being captured as a PNG, which is when its
  // social-media layout applies (see PNG_EXPORT_* above).
  const isMapPngExport = pngExportingId === 'net-report-map';


  // Get NCS operators from net roles
  // NetRole.role is always stored uppercase ("NCS") -- every other role
  // comparison in the frontend (NetView.tsx, NetPaneWindow.tsx,
  // NCSStaffModal.tsx) matches on 'NCS'. This one compared against 'ncs'
  // instead, so the "Net Control Station(s)" section below silently
  // rendered nothing on every net report, for every net, until this fix.
  const ncsOperators = netRoles.filter(r => r.role === 'NCS');

  // Masthead date line, e.g. "Monday, September 21, 2026 · 5:52 – 6:23 PM EDT".
  // Single-series graphs (activity, frequencies) take the logo's accent
  // color; the status pie keeps its per-status colors.
  const reportAccent = getReportAccent(net.logo_accent_colors).accent;
  // Shared by the report's figures row and the social summary image.
  const reportFigures = [
    { value: stats.total_check_ins, label: 'Total Check-ins' },
    { value: stats.unique_callsigns, label: 'Unique Operators' },
    { value: stats.rechecks, label: 'Re-checks' },
    { value: stats.duration_minutes ? formatDuration(stats.duration_minutes) : '—', label: 'Duration' },
  ];
  const reportSpan = stats.started_at
    ? formatReportSpan(stats.started_at, stats.closed_at, user?.prefer_utc || false)
    : null;

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
        {/* Downloads the social-media images: the summary (continued on
            more images for a long list) and the map. */}
        <Tooltip title={mappedCheckIns.length > 0 ? "Download images for social media: a summary and the map" : "Download a summary image for social media"}>
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
      {/* Always a white page, on screen and in the PDF, tinted to the net's
          logo colors (components/report/ReportPaper.tsx). */}
      <ReportPaper id="net-report-content" accentColors={net.logo_accent_colors}>
        
        {/* ========== REPORT MASTHEAD ========== */}
        {/* The net is the subject: its logo and name lead, tinted to the
            logo's colors. ECTLogger is credited in ReportFooter below. */}
        <ReportMasthead
          logoUrl={net.logo_url}
          eyebrow="Net Report"
          title={net.name}
          when={reportSpan?.when}
          whenDetail={reportSpan?.detail}
        />

        {/* ========== SECTION 1: NET DETAILS ========== */}
        {/* No status/ICS-309 badge row here. Reports are read after the net
            has closed or been archived, so the status adds nothing, and the
            ICS-309 log gets its own section below plus a download button for
            net managers. Start/close times are in the masthead. */}
        {net.description && (
          <Typography variant="body1" color="text.secondary" paragraph sx={{ whiteSpace: 'pre-line' }}>
            {net.description}
          </Typography>
        )}

        {/* NCS Operators */}
        {ncsOperators.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Net Control Station(s):
            </Typography>
            <Typography variant="body2">
              {ncsOperators.map(r => displayCallsign(r) || r.email).join(', ')}
            </Typography>
          </Box>
        )}

        {/* Frequencies */}
        {net.frequencies.length > 0 && (
          <Box sx={{ mb: 3 }}>
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

        {/* ========== SECTION 2: STATISTICS SUMMARY ========== */}
        <ReportFigures
          figures={reportFigures}
        />

        <ReportSectionTitle>Graphs</ReportSectionTitle>

        {/* Charts Row — all three charts fit one row */}
        <Box sx={{ mb: 3, display: 'flex' }}>
        <Grid container spacing={3} sx={{ flex: 1, minWidth: 0 }}>
          {/* Status Breakdown Pie Chart */}
          {statusData.length > 0 && (
            <Grid item xs={12} md={chartMd}>
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
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="45%"
                      outerRadius={60}
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
            <Grid item xs={12} md={chartMd}>
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
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="reportActivityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={reportAccent} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={reportAccent} stopOpacity={0.02} />
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
                      stroke={reportAccent}
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
            <Grid item xs={12} md={chartMd}>
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
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={frequencyData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill={reportAccent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}
        </Grid>
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
            {/* The posted map image says whose net it is, like the summary image. */}
            {isMapPngExport && (
              <Box sx={{ flexShrink: 0 }}>
                <ReportMasthead
                  compact
                  logoUrl={net.logo_url}
                  eyebrow="Check-in Map"
                  title={net.name}
                  when={reportSpan?.when}
                  whenDetail={reportSpan?.detail}
                />
              </Box>
            )}
            <ReportSectionTitle
              sx={{ mb: 2, ...(isMapPngExport && { mt: 0, flexShrink: 0 }) }}
              action={<>
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
              </>}
            >
              Check-in Map ({mappedCheckIns.length} locations)
            </ReportSectionTitle>

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
                            icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles))}
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
                            icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles))}
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

                {/* Shared legend below both maps -- built from the same palette
                    the markers draw from, so it lists exactly the colors on
                    this net's map and nothing else */}
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {mapLegend.map((item) => (
                      <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color }} />
                        <Typography variant="caption">{item.label}</Typography>
                      </Box>
                    ))}
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
                        icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles))}
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
                {/* Map Legend -- same source as the dual-map legend above */}
                <Box sx={{ p: 1, display: 'flex', gap: 2, flexWrap: 'wrap', borderTop: `1px solid ${theme.palette.divider}`, ...(isMapPngExport && { flexShrink: 0 }) }}>
                  {mapLegend.map((item) => (
                    <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color }} />
                      <Typography variant="caption">{item.label}</Typography>
                    </Box>
                  ))}
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
        <Box>
        <ReportSectionTitle
          sx={{ mb: 2 }}
        >
          Check-in Log ({checkIns.length} event{checkIns.length !== 1 ? 's' : ''} &mdash; {stats.unique_callsigns} unique station{stats.unique_callsigns !== 1 ? 's' : ''}{stats.rechecks > 0 ? `, ${stats.rechecks} re-check${stats.rechecks !== 1 ? 's' : ''}` : ''})
        </ReportSectionTitle>

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
            <ReportSectionTitle sx={{ mb: 2 }}>
              Topic of the Week ({topicResponses.length} response{topicResponses.length !== 1 ? 's' : ''})
            </ReportSectionTitle>

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
            <ReportSectionTitle sx={{ mb: 2 }}>
              Poll Results ({pollResults.reduce((s, r) => s + r.count, 0)} response{pollResults.reduce((s, r) => s + r.count, 0) !== 1 ? 's' : ''})
            </ReportSectionTitle>

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
            <ReportSectionTitle sx={{ mb: 2 }}>
              Chat Messages ({userChatMessages.length} message{userChatMessages.length !== 1 ? 's' : ''})
            </ReportSectionTitle>
            
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
            <ReportSectionTitle sx={{ mb: 2 }}>
              System Log ({systemLogMessages.length} event{systemLogMessages.length !== 1 ? 's' : ''})
            </ReportSectionTitle>
            
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
            <ReportSectionTitle sx={{ mb: 2 }}>
              ICS-309 Communications Log
            </ReportSectionTitle>

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
            <ReportSectionTitle
              sx={{ mb: 2 }}
              action={canHearReports.length > 0 && !exporting && (
                <FormControlLabel
                  sx={{ mr: 0 }}
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
            >
              Station Coverage ({canHearReports.length} report{canHearReports.length !== 1 ? 's' : ''})
            </ReportSectionTitle>

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
                                <Marker position={station.reporterPosition} icon={createStationMarkerIcon(theme.palette.primary.main)}>
                                  <LeafletTooltip permanent direction="top" offset={[0, -28]} opacity={1}>
                                    {station.reporterCallsign}
                                  </LeafletTooltip>
                                </Marker>
                                {mappableHeard.map((h) => (
                                  <Marker key={h.checkInId} position={h.position as [number, number]} icon={createStationMarkerIcon(theme.palette.grey[600])}>
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
        <ReportFooter generatedAt={formatDateTime(new Date().toISOString(), user?.prefer_utc || false)} />
      </ReportPaper>

      {/* ========== SOCIAL-MEDIA SUMMARY IMAGES (off-screen) ========== */}
      {/* Mounted only for the length of an Export PNG run; see handleExportAllPngs. */}
      {socialExporting && (
        <SocialSummaryImages
          accentColors={net.logo_accent_colors}
          logoUrl={net.logo_url}
          title={net.name}
          when={reportSpan?.when}
          whenDetail={reportSpan?.detail}
          figures={reportFigures}
          timeline={timelineData}
          binSize={binSize}
          statusCounts={stats.status_counts}
          frequencyCounts={stats.check_ins_by_frequency}
          rows={socialRows}
        />
      )}

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
                    <stop offset="5%" stopColor={reportAccent} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={reportAccent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 13 }}
                  interval={Math.max(0, Math.floor(timelineData.length / 12) - 1)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13 }}
                  label={{ value: 'Check-ins', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 13 } }} />
                <RechartsTooltip formatter={(value: number) => [value, `check-ins in ${binSize}m`]} />
                <Area type="basis" dataKey="count" stroke={reportAccent} strokeWidth={2.5}
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
                <Bar dataKey="count" fill={reportAccent} radius={[0, 4, 4, 0]} />
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
                          icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles))}>
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
                          icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles))}>
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
                      icon={createStationMarkerIcon(getCheckInMarkerColor(mapped.checkIn, markerRoles))}>
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

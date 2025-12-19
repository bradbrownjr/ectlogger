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
  Divider,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack,
  PictureAsPdf,
  TrendingUp,
  Radio,
  Chat as ChatIcon,
  Assignment,
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
} from 'recharts';
import { netApi, statisticsApi, checkInApi, netRoleApi } from '../services/api';
import { chatApi, ChatMessage } from '../api/chat';
import { formatDateTime, formatTimeWithDate } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { exportElementToPdf } from '../utils/pdfExport';

// ========== INTERFACES ==========

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  owner_id: number;
  ics309_enabled?: boolean;
  frequencies: Frequency[];
  started_at?: string;
  closed_at?: string;
  created_at: string;
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
  top_operators: { callsign: string; check_in_count: number }[];
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

  // State for all net data
  const [net, setNet] = useState<Net | null>(null);
  const [stats, setStats] = useState<NetStats | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [netRoles, setNetRoles] = useState<NetRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
        const [netRes, statsRes, checkInsRes, chatRes, rolesRes] = await Promise.all([
          netApi.get(parseInt(netId)),
          statisticsApi.getNetStats(parseInt(netId)),
          checkInApi.list(parseInt(netId)),
          chatApi.list(parseInt(netId)),
          netRoleApi.list(parseInt(netId)),
        ]);

        setNet(netRes.data);
        setStats(statsRes.data);
        setCheckIns(checkInsRes.data);
        setChatMessages(chatRes.data);
        setNetRoles(rolesRes.data);
      } catch (err: any) {
        console.error('Failed to fetch net report data:', err);
        setError(err.response?.data?.detail || 'Failed to load net report');
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [netId]);

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

  // Filter non-system chat messages for the report
  const userChatMessages = chatMessages.filter(m => !m.is_system);

  // ========== PDF EXPORT ==========

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const filename = net?.name 
        ? `${net.name.replace(/[^a-zA-Z0-9]/g, '_')}_Net_Report`
        : 'Net_Report';
      
      await exportElementToPdf('net-report-content', {
        filename,
        orientation: 'portrait',
        scale: 1.5, // Higher quality for dense content
        margin: 10,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

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

  // Get NCS operators from net roles
  const ncsOperators = netRoles.filter(r => r.role === 'ncs');

  // ========== RENDER ==========

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
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} /> : <PictureAsPdf />}
          >
            {exporting ? 'Exporting...' : 'Export PDF'}
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

      {/* ========== PDF CONTENT WRAPPER ========== */}
      <Box id="net-report-content" sx={{ backgroundColor: theme.palette.background.paper, p: 2, borderRadius: 1 }}>
        
        {/* ========== SECTION 1: NET INFO HEADER ========== */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                {net.name}
              </Typography>
              {net.description && (
                <Typography variant="body1" color="text.secondary" paragraph>
                  {net.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <Chip
                  label={net.status.toUpperCase()}
                  color={net.status === 'active' ? 'success' : net.status === 'closed' ? 'default' : 'info'}
                  size="small"
                />
                {net.ics309_enabled && (
                  <Chip label="ICS-309" color="primary" size="small" variant="outlined" />
                )}
              </Box>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
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
                {ncsOperators.map(r => r.callsign || r.name || r.email).join(', ')}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* ========== SECTION 2: STATISTICS SUMMARY ========== */}
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp /> Statistics Summary
        </Typography>
        
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

        {/* Charts Row */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {/* Status Breakdown Pie Chart */}
          {statusData.length > 0 && (
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                  Check-in Status
                </Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ stroke: '#666', strokeWidth: 1 }}
                    >
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* Frequency Bar Chart */}
          {frequencyData.length > 0 && (
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                  Check-ins by Frequency
                </Typography>
                <ResponsiveContainer width="100%" height={200}>
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

        {/* ========== SECTION 3: CHECK-IN LOG ========== */}
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Assignment /> Check-in Log ({checkIns.length} entries)
        </Typography>
        
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
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
                <TableRow key={checkIn.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
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
                        <Chip label="R" size="small" sx={{ height: 16, fontSize: '0.65rem' }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{checkIn.name || '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {checkIn.location || '—'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={checkIn.status.replace('_', ' ')} 
                      size="small" 
                      color={checkIn.status === 'checked_in' ? 'success' : checkIn.status === 'checked_out' ? 'default' : 'warning'}
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
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

        {/* ========== SECTION 4: CHAT LOG (if there are user messages) ========== */}
        {userChatMessages.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChatIcon /> Chat Log ({userChatMessages.length} messages)
            </Typography>
            
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
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
                      <TableCell>{msg.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* ========== SECTION 5: ICS-309 FORMAT (if enabled) ========== */}
        {net.ics309_enabled && (
          <>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Assignment /> ICS-309 Communications Log
            </Typography>
            
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              {/* ICS-309 Header */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2"><strong>1. Incident Name:</strong> {net.name}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2">
                    <strong>2. Operational Period:</strong> {stats.started_at ? formatDateTime(stats.started_at, true) : '—'} to {stats.closed_at ? formatDateTime(stats.closed_at, true) : '—'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2">
                    <strong>3. Radio Operator Name/Position:</strong> {ncsOperators.map(r => r.callsign || r.name).join(', ') || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2">
                    <strong>4. Radio Channel:</strong> {net.frequencies.map(f => getFrequencyLabel(f)).join(', ') || 'N/A'}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* ICS-309 Log Entries */}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>From (Station)</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>To</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Subject/Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {checkIns.map((checkIn) => (
                      <TableRow key={checkIn.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {formatTimeWithDate(checkIn.checked_in_at, true)}
                        </TableCell>
                        <TableCell>
                          {checkIn.callsign}
                          {checkIn.relayed_by && ` (via ${checkIn.relayed_by})`}
                        </TableCell>
                        <TableCell>Net Control</TableCell>
                        <TableCell>
                          {checkIn.is_recheck ? 'Re-check' : 'Check-in'}
                          {checkIn.name ? ` - ${checkIn.name}` : ''}
                          {checkIn.location ? ` @ ${checkIn.location}` : ''}
                          {checkIn.notes ? ` - ${checkIn.notes}` : ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Divider sx={{ my: 2 }} />

              {/* ICS-309 Footer */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2"><strong>5. Prepared by:</strong> ECTLogger</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2"><strong>Date/Time:</strong> {formatDateTime(new Date().toISOString(), true)}</Typography>
                </Grid>
              </Grid>
            </Paper>
          </>
        )}

        {/* ========== FOOTER ========== */}
        <Box sx={{ textAlign: 'center', pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Generated by ECTLogger on {formatDateTime(new Date().toISOString(), user?.prefer_utc || false)}
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default NetReport;

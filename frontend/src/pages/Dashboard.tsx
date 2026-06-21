import React, { useEffect, useState } from 'react';
import CellTowerIcon from '@mui/icons-material/CellTower';
import { displayCallsign } from '../utils/userDisplay';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  Fab,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  TextField,
  InputAdornment,
  useMediaQuery,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Snackbar,
  Alert,
  TablePagination,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RadioIcon from '@mui/icons-material/Radio';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import LanguageIcon from '@mui/icons-material/Language';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import FilterListIcon from '@mui/icons-material/FilterList';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import BoltIcon from '@mui/icons-material/Bolt';
import ClearIcon from '@mui/icons-material/Clear';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EmailIcon from '@mui/icons-material/Email';
import CircularProgress from '@mui/material/CircularProgress';
import { netApi } from '../services/api';
import NCSStaffModal from '../components/NCSStaffModal';
import ExpandableDescription from '../components/ExpandableDescription';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/dateUtils';

interface Net {
  id: number;
  name: string;
  description: string;
  info_url?: string;
  status: string;
  owner_id: number;
  owner_callsign?: string | null;
  owner_name?: string | null;
  // Currently-assigned NCS for this net (most recent NetRole with role='NCS').
  // May be null if no NCS has been assigned yet, or the same person as the
  // owner. The owner is the "Net Manager"; the NCS is whoever is actually
  // running the net on the air.
  ncs_callsign?: string | null;
  ncs_name?: string | null;
  template_id?: number | null;  // ID of the template this net was created from
  started_at?: string;
  closed_at?: string;
  created_at: string;
  scheduled_start_time?: string;
  frequencies: any[];
  check_in_count?: number;
  can_manage?: boolean;
  user_attended?: boolean | null;
  user_ran?: boolean | null;
}

const Dashboard: React.FC = () => {
  const [nets, setNets] = useState<Net[]>([]);
  const [archivedNets, setArchivedNets] = useState<Net[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [netToDelete, setNetToDelete] = useState<Net | null>(null);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [selectedNet, setSelectedNet] = useState<Net | null>(null);
  const [archiveFilter, setArchiveFilter] = useState('');
  const [archiveDateFrom, setArchiveDateFrom] = useState('');
  const [archiveDateTo, setArchiveDateTo] = useState('');
  const [archivedPage, setArchivedPage] = useState(0);
  const [archivedPerPage, setArchivedPerPage] = useState(25);
  const [archiveSortField, setArchiveSortField] = useState<'name' | 'owner' | 'check_ins' | 'closed'>('closed');
  const [archiveSortDirection, setArchiveSortDirection] = useState<'asc' | 'desc'>('desc');
  const [archiveShowAttended, setArchiveShowAttended] = useState(false);
  const [archiveShowRan, setArchiveShowRan] = useState(false);
  // View mode, sort order, and filter state - persist view/sort preference
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const saved = localStorage.getItem('dashboard-view-mode');
    return (saved === 'list' || saved === 'card') ? saved : 'card';
  });
  const [netSortOrder, setNetSortOrder] = useState<'status' | 'alpha'>(() => {
    const saved = localStorage.getItem('dashboard-sort-order');
    return saved === 'alpha' ? 'alpha' : 'status';
  });
  const [showFilter, setShowFilter] = useState(false);
  const [netFilter, setNetFilter] = useState('');
  // Email subscribers dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailNet, setEmailNet] = useState<Net | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const [emailSending, setEmailSending] = useState(false);
  // Snackbar state for toast notifications
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Share the same favorites store as the Scheduler page — keyed by schedule/template ID
  const favKey = `scheduler-favorites-${user?.id ?? 'anon'}`;
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(favKey);
      return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    } catch { return new Set<number>(); }
  });

  const toggleFavorite = (templateId: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
      try { localStorage.setItem(favKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  useEffect(() => {
    fetchNets();
  }, [location.key]);

  const fetchNets = async () => {
    try {
      const response = await netApi.list();
      setNets(response.data);
    } catch (error) {
      console.error('Failed to fetch nets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedNets = async () => {
    try {
      const response = await netApi.listArchived();
      // Sort by closed_at date, newest first
      const sorted = response.data.sort((a: Net, b: Net) => {
        const dateA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
        const dateB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
        return dateB - dateA;
      });
      setArchivedNets(sorted);
    } catch (error) {
      console.error('Failed to fetch archived nets:', error);
    }
  };

  const handleOpenArchived = () => {
    fetchArchivedNets();
    setArchivedPage(0);
    setShowArchived(true);
  };

  const handleArchiveNet = async (netId: number) => {
    try {
      await netApi.archive(netId);
      fetchNets(); // Refresh active nets
    } catch (error) {
      console.error('Failed to archive net:', error);
    }
  };

  const handleExportCSV = async (net: Net) => {
    try {
      const response = await api.get(`/nets/${net.id}/export/csv`, {
        responseType: 'blob',
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${net.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'lobby': return 'warning';  // Yellow/orange for pre-net lobby mode
      case 'closed': return 'default';
      case 'scheduled': return 'info';
      default: return 'default';
    }
  };

  const handleStartNet = async (netId: number) => {
    try {
      await netApi.start(netId);
      // Navigate to the net view so owner is automatically "joined"
      navigate(`/nets/${netId}`);
    } catch (error) {
      console.error('Failed to start net:', error);
    }
  };

  const handleDeleteClick = (net: Net) => {
    setNetToDelete(net);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!netToDelete) return;
    try {
      await netApi.delete(netToDelete.id);
      fetchNets();
      // Also refresh archived nets if the dialog is open
      if (showArchived) {
        fetchArchivedNets();
      }
    } catch (error) {
      console.error('Failed to delete net:', error);
      alert('Failed to delete net. Make sure you have permission.');
    } finally {
      setDeleteConfirmOpen(false);
      setNetToDelete(null);
    }
  };

  // ========== EMAIL SUBSCRIBERS HANDLERS ==========
  const handleEmailClick = (net: Net) => {
    setEmailNet(net);
    setEmailForm({ subject: '', message: '' });
    setEmailDialogOpen(true);
  };

  // ========== UNARCHIVE HANDLER ==========
  const handleUnarchive = async (net: Net) => {
    try {
      await netApi.unarchive(net.id);
      // Refresh both lists
      fetchNets();
      fetchArchivedNets();
      setSnackbar({ open: true, message: `"${net.name}" has been unarchived`, severity: 'success' });
    } catch (error: any) {
      console.error('Failed to unarchive net:', error);
      const message = error.response?.data?.detail || 'Failed to unarchive net';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  };

  const handleSendEmail = async () => {
    if (!emailNet || !emailForm.subject.trim() || !emailForm.message.trim()) return;
    
    setEmailSending(true);
    try {
      const response = await api.post(`/nets/${emailNet.id}/email-subscribers`, {
        subject: emailForm.subject,
        message: emailForm.message,
      });
      setSnackbar({ open: true, message: `Email sent to ${response.data.sent} subscriber(s)`, severity: 'success' });
      setEmailDialogOpen(false);
      setEmailNet(null);
      setEmailForm({ subject: '', message: '' });
    } catch (error: any) {
      console.error('Failed to send email:', error);
      const message = error.response?.data?.detail || 'Failed to send email';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setEmailSending(false);
    }
  };

  // Handle archive sort
  const handleArchiveSort = (field: 'name' | 'owner' | 'check_ins' | 'closed') => {
    if (archiveSortField === field) {
      setArchiveSortDirection(archiveSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setArchiveSortField(field);
      setArchiveSortDirection(field === 'closed' ? 'desc' : 'asc');
    }
    setArchivedPage(0);
  };

  // Filter and sort archived nets
  const filteredArchivedNets = archivedNets
    .filter((net) => {
      // Text filter
      if (archiveFilter) {
        const search = archiveFilter.toLowerCase();
        const matchesText = (
          net.name.toLowerCase().includes(search) ||
          (net.owner_callsign?.toLowerCase() || '').includes(search) ||
          (net.owner_name?.toLowerCase() || '').includes(search)
        );
        if (!matchesText) return false;
      }
      
      // Date filter
      if (archiveDateFrom || archiveDateTo) {
        const closedDate = net.closed_at ? new Date(net.closed_at) : null;
        if (!closedDate) return false;

        if (archiveDateFrom) {
          const fromDate = new Date(archiveDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (closedDate < fromDate) return false;
        }

        if (archiveDateTo) {
          const toDate = new Date(archiveDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (closedDate > toDate) return false;
        }
      }

      // Personal filters (only meaningful when backend has populated the flags)
      if (archiveShowAttended || archiveShowRan) {
        const matchesAttended = archiveShowAttended && net.user_attended === true;
        const matchesRan = archiveShowRan && net.user_ran === true;
        if (!matchesAttended && !matchesRan) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (archiveSortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'owner':
          comparison = (a.owner_callsign || '').localeCompare(b.owner_callsign || '');
          break;
        case 'check_ins':
          comparison = (a.check_in_count ?? 0) - (b.check_in_count ?? 0);
          break;
        case 'closed':
          const dateA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
          const dateB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
          comparison = dateA - dateB;
          break;
      }
      return archiveSortDirection === 'asc' ? comparison : -comparison;
    });

  // ========== ACTIVE NETS FILTERING ==========
  const filteredNets = nets
    .filter((net) => {
      if (!netFilter) return true;
      const searchTerm = netFilter.toLowerCase();
      return (
        net.name.toLowerCase().includes(searchTerm) ||
        (net.description?.toLowerCase() || '').includes(searchTerm) ||
        (net.owner_callsign?.toLowerCase() || '').includes(searchTerm) ||
        (net.owner_name?.toLowerCase() || '').includes(searchTerm) ||
        net.frequencies.some((f: any) =>
          (f.frequency?.toLowerCase() || '').includes(searchTerm) ||
          (f.network?.toLowerCase() || '').includes(searchTerm) ||
          (f.talkgroup?.toLowerCase() || '').includes(searchTerm)
        )
      );
    })
    .sort((a, b) => {
      // Favorites always first
      const aFav = a.template_id != null && favorites.has(a.template_id) ? 0 : 1;
      const bFav = b.template_id != null && favorites.has(b.template_id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;

      if (netSortOrder === 'status') {
        const statusPriority: Record<string, number> = { active: 0, lobby: 1, scheduled: 2, draft: 3 };
        const aPri = statusPriority[a.status] ?? 4;
        const bPri = statusPriority[b.status] ?? 4;
        if (aPri !== bPri) return aPri - bPri;
        // Within active/lobby: most recently started first
        if (a.status === 'active' || a.status === 'lobby') {
          const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
          const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
          if (aTime !== bTime) return bTime - aTime;
        }
        // Within scheduled/draft: soonest first
        if (a.status === 'scheduled' || a.status === 'draft') {
          const aTime = a.scheduled_start_time ? new Date(a.scheduled_start_time).getTime() : Infinity;
          const bTime = b.scheduled_start_time ? new Date(b.scheduled_start_time).getTime() : Infinity;
          if (aTime !== bTime) return aTime - bTime;
        }
      }
      // Alphabetical (primary for alpha mode, tiebreaker for status mode)
      return a.name.localeCompare(b.name);
    });

  // ========== CARD VIEW RENDERER ==========
  // auto-fit collapses empty column tracks, so 2 cards fill 2 columns instead of
  // leaving a gap where a 3rd card would go. max(300px, calc(100%/6 - 20px)) caps
  // at 6 columns on ultrawide by raising the min once 100%/6 exceeds 300px.
  const renderCardView = () => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(max(300px, calc(100% / 6 - 20px)), 1fr))' },
        gap: { xs: 2, sm: 3 },
      }}
    >
      {filteredNets.map((net: Net) => (
        <Box key={net.id} sx={{ display: 'flex' }}>
          {renderNetCard(net)}
        </Box>
      ))}
    </Box>
  );

  // ========== LIST VIEW RENDERER ==========
  const renderListView = () => (
    <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>NCS</TableCell>
            <TableCell>Frequencies</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredNets.map((net: Net) => (
            <TableRow key={net.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/nets/${net.id}`)}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {net.template_id != null && (
                    <Tooltip title={favorites.has(net.template_id) ? 'Remove from favorites' : 'Add to favorites'}>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(net.template_id!); }}
                        sx={{ color: favorites.has(net.template_id) ? 'warning.main' : 'action.disabled', p: 0.25 }}
                      >
                        {favorites.has(net.template_id) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </Tooltip>
                  )}
                  <Typography variant="body2" fontWeight="medium">{net.name}</Typography>
                </Box>
                {net.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {net.description.length > 50 ? `${net.description.substring(0, 50)}...` : net.description}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Chip label={net.status} color={getStatusColor(net.status)} size="small" />
              </TableCell>
              <TableCell>
                {/* Show assigned NCS when set; fall back to net manager */}
                {(net.ncs_callsign || net.owner_callsign) && (
                  <Typography variant="body2">
                    {net.ncs_callsign || net.owner_callsign}
                    {(net.ncs_callsign ? net.ncs_name : net.owner_name) && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}({net.ncs_callsign ? net.ncs_name : net.owner_name})
                      </Typography>
                    )}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {net.frequencies.map((f: any) => {
                    if (f.frequency) return f.frequency;
                    if (f.network && f.talkgroup) return `${f.network} TG${f.talkgroup}`;
                    if (f.network) return f.network;
                    return '';
                  }).filter((s: string) => s).join(', ')}
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                <Tooltip title="View net">
                  <IconButton size="small" color="primary" onClick={() => navigate(`/nets/${net.id}`)}>
                    <SearchIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* Net staff - always visible */}
                <Tooltip title="Net staff">
                  <IconButton size="small" sx={{ color: '#9c27b0' }} onClick={() => { setSelectedNet(net); setStaffModalOpen(true); }}>
                    <GroupsIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* Active net actions */}
                {(net.status === 'active' || net.status === 'lobby') && (
                  <Tooltip title="Statistics">
                    <IconButton size="small" sx={{ color: '#ff9800' }} onClick={() => navigate(`/statistics/nets/${net.id}`)}>
                      <BarChartIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {/* Active net delete: owner/admin/NCS can discard a net */}
                {/* mid-flight (e.g. an aborted training run). Confirmation */}
                {/* dialog warns about losing all check-ins and chat. */}
                {(net.status === 'active' || net.status === 'lobby') && net.can_manage && (
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDeleteClick(net)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {/* Draft/Scheduled net actions */}
                {(net.status === 'draft' || net.status === 'scheduled') && net.can_manage && (
                  <>
                    {/* Email subscribers - only if net has a template */}
                    {net.template_id && (
                      <Tooltip title="Email subscribers">
                        <IconButton size="small" onClick={() => handleEmailClick(net)}>
                          <EmailIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => navigate(`/nets/${net.id}/edit`)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Start">
                      <IconButton size="small" color="success" onClick={() => handleStartNet(net.id)}>
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {/* Delete scheduled net (cancel this instance) */}
                    <Tooltip title="Cancel this net">
                      <IconButton size="small" color="error" onClick={() => handleDeleteClick(net)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                {/* Closed net actions */}
                {net.status === 'closed' && (
                  <>
                    <Tooltip title="Statistics">
                      <IconButton size="small" sx={{ color: '#ff9800' }} onClick={() => navigate(`/statistics/nets/${net.id}`)}>
                        <BarChartIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {net.can_manage && (
                      <>
                        <Tooltip title="Export log">
                          <IconButton size="small" sx={{ color: '#4caf50' }} onClick={() => handleExportCSV(net)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Net report (PDF)">
                          <IconButton size="small" sx={{ color: '#4caf50' }} onClick={() => navigate(`/nets/${net.id}/report`)}>
                            <PictureAsPdfIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Archive">
                          <IconButton size="small" onClick={() => handleArchiveNet(net.id)}>
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {/* Owners (and admins) can delete closed nets. The */}
                        {/* confirmation dialog warns about data loss and */}
                        {/* offers Archive as a safer alternative. */}
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDeleteClick(net)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  // ========== NET CARD COMPONENT ==========
  const renderNetCard = (net: Net) => (
    <Card sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <CardContent sx={{ flex: 1 }}>
        {/* Title with Status */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography
            variant="h6"
            component="h2"
            onClick={() => navigate(`/nets/${net.id}`)}
            sx={{
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              flex: 1,
              mr: 0.5,
            }}
          >
            {net.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Chip label={net.status} color={getStatusColor(net.status)} size="small" />
            {net.template_id != null && (
              <Tooltip title={favorites.has(net.template_id) ? 'Remove from favorites' : 'Add to favorites'}>
                <IconButton
                  size="small"
                  onClick={() => toggleFavorite(net.template_id!)}
                  sx={{ color: favorites.has(net.template_id) ? 'warning.main' : 'action.disabled', p: 0.25 }}
                >
                  {favorites.has(net.template_id) ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
        
        {/* Description */}
        <ExpandableDescription text={net.description} />
        
        {/* Info List */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Time info based on status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {net.status === 'closed' && net.closed_at && (
                <>Closed: {formatDateTime(net.closed_at, user?.prefer_utc || false)}</>
              )}
              {net.status === 'active' && net.started_at && (
                <>Started: {formatDateTime(net.started_at, user?.prefer_utc || false)}</>
              )}
              {net.status === 'lobby' && net.scheduled_start_time && (
                <>Starts at: {formatDateTime(net.scheduled_start_time, user?.prefer_utc || false)}</>
              )}
              {(net.status === 'draft' || net.status === 'scheduled') && net.scheduled_start_time && (
                <>Scheduled: {formatDateTime(net.scheduled_start_time, user?.prefer_utc || false)}</>
              )}
              {(net.status === 'draft' || net.status === 'scheduled') && !net.scheduled_start_time && (
                <>Created: {formatDateTime(net.created_at, user?.prefer_utc || false)}</>
              )}
            </Typography>
          </Box>
          
          {/* Frequencies */}
          {net.frequencies.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2" color="text.secondary">
                {net.frequencies.map((f: any) => {
                  if (f.frequency) {
                    return f.frequency;
                  } else if (f.network && f.talkgroup) {
                    return `${f.network} TG${f.talkgroup}`;
                  } else if (f.network) {
                    return f.network;
                  }
                  return '';
                }).filter((s: string) => s).join(', ')}
              </Typography>
            </Box>
          )}
          
          {/* ========== NET MANAGER (owner) ========== */}
          {/* The owner of the net record. They created/scheduled it and may */}
          {/* not be the operator running it on the air. Always shown when set. */}
          {net.owner_callsign && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                <strong>Net Manager:</strong> {net.owner_callsign}
                {net.owner_name && ` (${net.owner_name})`}
              </Typography>
            </Box>
          )}

          {/* ========== CURRENT / NEXT NCS ========== */}
          {/* Whoever is actually running the net (NetRole role='NCS'). For */}
          {/* draft/scheduled nets this is effectively the "next" NCS; for */}
          {/* active or closed nets it's the operator who ran it. On active/ */}
          {/* closed nets suppress when NCS == manager to avoid redundancy; */}
          {/* on scheduled/draft always show so the duty operator is visible. */}
          {net.ncs_callsign && (
            (net.status === 'draft' || net.status === 'scheduled')
              ? true
              : net.ncs_callsign !== net.owner_callsign
          ) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                <strong>{net.status === 'draft' || net.status === 'scheduled' ? 'Next NCS' : 'NCS'}:</strong> {net.ncs_callsign}
                {net.ncs_name && ` (${net.ncs_name})`}
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
      <CardActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
        {/* View - always available, left side */}
        <Box>
          <Tooltip title="View net">
            <IconButton
              size="small"
              color="primary"
              onClick={() => navigate(`/nets/${net.id}`)}
            >
              <SearchIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Net staff - always visible */}
          <Tooltip title="View net staff">
            <IconButton
              size="small"
              sx={{ color: '#9c27b0' }}
              onClick={() => {
                setSelectedNet(net);
                setStaffModalOpen(true);
              }}
            >
              <GroupsIcon />
            </IconButton>
          </Tooltip>
          {/* Active/Lobby net - show stats on right side */}
          {(net.status === 'active' || net.status === 'lobby') && (
            <Tooltip title="Net statistics">
              <IconButton
                size="small"
                sx={{ color: '#ff9800' }}
                onClick={() => navigate(`/statistics/nets/${net.id}`)}
              >
                <BarChartIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* Active/Lobby net - allow the owner (or admin/NCS) to delete */}
          {/* their own net. Useful for training/practice runs the owner */}
          {/* wants to discard. Confirmation dialog warns before deleting. */}
          {(net.status === 'active' || net.status === 'lobby') && net.can_manage && (
            <Tooltip title="Delete net">
              <IconButton
                size="small"
                color="error"
                onClick={() => handleDeleteClick(net)}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
          {net.info_url && (
            <Tooltip title="Net/Club info">
              <IconButton
                size="small"
                onClick={() => window.open(net.info_url, '_blank')}
              >
                <LanguageIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* Draft/Scheduled net actions */}
          {(net.status === 'draft' || net.status === 'scheduled') && net.can_manage && (
            <>
              {/* Email subscribers - only if net has a template */}
              {net.template_id && (
                <Tooltip title="Email subscribers">
                  <IconButton
                    size="small"
                    onClick={() => handleEmailClick(net)}
                  >
                    <EmailIcon />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Edit net">
                <IconButton
                  size="small"
                  onClick={() => navigate(`/nets/${net.id}/edit`)}
                >
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Start net">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => handleStartNet(net.id)}
                >
                  <PlayArrowIcon />
                </IconButton>
              </Tooltip>
              {/* Cancel this net instance */}
              <Tooltip title="Cancel this net">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteClick(net)}
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
          
          {/* Closed net actions */}
          {net.status === 'closed' && net.can_manage && (
            <>
              <Tooltip title="Net statistics">
                <IconButton
                  size="small"
                  sx={{ color: '#ff9800' }}
                  onClick={() => navigate(`/statistics/nets/${net.id}`)}
                >
                  <BarChartIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export log">
                <IconButton
                  size="small"
                  sx={{ color: '#4caf50' }}
                  onClick={() => handleExportCSV(net)}
                >
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Net report (PDF)">
                <IconButton
                  size="small"
                  sx={{ color: '#4caf50' }}
                  onClick={() => navigate(`/nets/${net.id}/report`)}
                >
                  <PictureAsPdfIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Archive net">
                <IconButton
                  size="small"
                  onClick={() => handleArchiveNet(net.id)}
                >
                  <ArchiveIcon />
                </IconButton>
              </Tooltip>
              {/* Closed net delete: any user who can manage the net (owner, */}
              {/* admin, or NCS) may permanently delete it. Confirmation */}
              {/* dialog steers them toward Archive when appropriate. */}
              <Tooltip title="Delete net">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteClick(net)}
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </CardActions>
    </Card>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, pb: 12, px: { xs: 1, sm: 3 } }}>
      {/* ========== HEADER WITH SORT, FILTER, AND VIEW TOGGLE ========== */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant={isMobile ? "h5" : "h4"} component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CellTowerIcon sx={{ fontSize: isMobile ? 24 : 32, color: 'text.primary' }} />
          {isMobile ? 'Active' : 'Active Nets'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {!isMobile && (
            <Typography variant="body2" color="text.secondary">
              {isAuthenticated ? (
                `Welcome, ${displayCallsign(user)}`
              ) : (
                "Welcome! Feel free to look around."
              )}
            </Typography>
          )}
          {/* Filter button */}
          <Tooltip title={showFilter ? 'Hide filter' : 'Filter nets'}>
            <IconButton
              size="small"
              color={showFilter ? 'primary' : 'default'}
              onClick={() => setShowFilter(!showFilter)}
              aria-label="filter"
            >
              <FilterListIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {/* Sort order toggle */}
          <ToggleButtonGroup
            value={netSortOrder}
            exclusive
            onChange={(_, newSort) => {
              if (newSort) {
                setNetSortOrder(newSort);
                localStorage.setItem('dashboard-sort-order', newSort);
              }
            }}
            size="small"
          >
            <ToggleButton value="status" aria-label="sort by status">
              <Tooltip title="Sort by status (active first, then next up)">
                <BoltIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="alpha" aria-label="sort alphabetically">
              <Tooltip title="Sort alphabetically">
                <SortByAlphaIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          {/* View mode toggle */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => {
              if (newMode) {
                setViewMode(newMode);
                localStorage.setItem('dashboard-view-mode', newMode);
              }
            }}
            size="small"
          >
            <ToggleButton value="card" aria-label="card view">
              <Tooltip title="Card view">
                <ViewModuleIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="list" aria-label="list view">
              <Tooltip title="List view">
                <ViewListIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* ========== FILTER BAR (COLLAPSIBLE) ========== */}
      <Collapse in={showFilter}>
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Filter by name, description, NCS, or frequency..."
            value={netFilter}
            onChange={(e) => setNetFilter(e.target.value)}
            sx={{ flexGrow: 1, maxWidth: 500 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: netFilter && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setNetFilter('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {filteredNets.length} of {nets.length}
          </Typography>
        </Box>
      </Collapse>

      {/* ========== NETS DISPLAY ========== */}
      {loading ? (
        <Typography>Loading nets...</Typography>
      ) : nets.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No nets yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first net to get started
          </Typography>
        </Box>
      ) : filteredNets.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No nets match your filter
          </Typography>
          <Button variant="text" onClick={() => setNetFilter('')}>
            Clear filter
          </Button>
        </Box>
      ) : viewMode === 'card' ? (
        renderCardView()
      ) : (
        renderListView()
      )}

      {/* ========== FLOATING ACTION BUTTONS ========== */}
      {isAuthenticated && (
        <>
          <Tooltip title="View archived nets">
            <Fab
              color="default"
              aria-label="view archived"
              sx={{ position: 'fixed', bottom: 16, right: 80 }}
              onClick={handleOpenArchived}
            >
              <ArchiveIcon />
            </Fab>
          </Tooltip>
          <Tooltip title="Create new net">
            <Fab
              color="primary"
              aria-label="create net"
              sx={{ position: 'fixed', bottom: 16, right: 16 }}
              onClick={() => navigate('/scheduler/create?type=one_time')}
            >
              <AddIcon />
            </Fab>
          </Tooltip>
        </>
      )}

      {/* Archived Nets Dialog */}
      <Dialog
        open={showArchived}
        onClose={() => {
          setShowArchived(false);
          setArchiveFilter('');
          setArchiveDateFrom('');
          setArchiveDateTo('');
          setArchiveShowAttended(false);
          setArchiveShowRan(false);
          setArchivedPage(0);
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          📦 Archived Nets ({filteredArchivedNets.length}{(archiveFilter || archiveDateFrom || archiveDateTo || archiveShowAttended || archiveShowRan) ? ` of ${archivedNets.length}` : ''})
          <IconButton onClick={() => {
            setShowArchived(false);
            setArchiveFilter('');
            setArchiveDateFrom('');
            setArchiveDateTo('');
            setArchivedPage(0);
          }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {/* Search/Filter */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search by net name or NCS callsign..."
              value={archiveFilter}
              onChange={(e) => { setArchiveFilter(e.target.value); setArchivedPage(0); }}
              sx={{ flexGrow: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              size="small"
              type="date"
              label="From"
              value={archiveDateFrom}
              onChange={(e) => { setArchiveDateFrom(e.target.value); setArchivedPage(0); }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200, '& .MuiInputBase-input': { pl: 1.5 } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={archiveDateTo}
              onChange={(e) => { setArchiveDateTo(e.target.value); setArchivedPage(0); }}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200, '& .MuiInputBase-input': { pl: 1.5 } }}
            />
            {isAuthenticated && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={archiveShowAttended}
                      onChange={(e) => { setArchiveShowAttended(e.target.checked); setArchivedPage(0); }}
                    />
                  }
                  label="Attended"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={archiveShowRan}
                      onChange={(e) => { setArchiveShowRan(e.target.checked); setArchivedPage(0); }}
                    />
                  }
                  label="Ran as NCS"
                />
              </Box>
            )}
          </Box>
          
          {archivedNets.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No archived nets found
            </Typography>
          ) : filteredArchivedNets.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No nets match your search
            </Typography>
          ) : (
            <>
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={archiveSortField === 'name'}
                        direction={archiveSortField === 'name' ? archiveSortDirection : 'asc'}
                        onClick={() => handleArchiveSort('name')}
                      >
                        Net Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={archiveSortField === 'owner'}
                        direction={archiveSortField === 'owner' ? archiveSortDirection : 'asc'}
                        onClick={() => handleArchiveSort('owner')}
                      >
                        NCS
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">
                      <TableSortLabel
                        active={archiveSortField === 'check_ins'}
                        direction={archiveSortField === 'check_ins' ? archiveSortDirection : 'asc'}
                        onClick={() => handleArchiveSort('check_ins')}
                      >
                        Check-ins
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={archiveSortField === 'closed'}
                        direction={archiveSortField === 'closed' ? archiveSortDirection : 'asc'}
                        onClick={() => handleArchiveSort('closed')}
                      >
                        Closed
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(archivedPerPage === -1 ? filteredArchivedNets : filteredArchivedNets.slice(archivedPage * archivedPerPage, (archivedPage + 1) * archivedPerPage)).map((net) => (
                    <TableRow key={net.id} hover>
                      <TableCell>{net.name}</TableCell>
                      <TableCell>
                        {net.owner_callsign || 'Unknown'}
                        {net.owner_name && ` (${net.owner_name})`}
                      </TableCell>
                      <TableCell align="center">{net.check_in_count ?? 0}</TableCell>
                      <TableCell>
                        {net.closed_at ? formatDateTime(net.closed_at, user?.prefer_utc || false) : 'N/A'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="View net">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => {
                              setShowArchived(false);
                              navigate(`/nets/${net.id}`);
                            }}
                          >
                            <SearchIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Export log">
                          <IconButton
                            size="small"
                            onClick={() => handleExportCSV(net)}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Net report (PDF)">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/nets/${net.id}/report`)}
                          >
                            <PictureAsPdfIcon />
                          </IconButton>
                        </Tooltip>
                        {(user?.role === 'admin' || net.can_manage) && (
                          <Tooltip title="Unarchive net">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleUnarchive(net)}
                            >
                              <UnarchiveIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {user?.role === 'admin' && (
                          <Tooltip title="Delete net">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteClick(net)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredArchivedNets.length}
              page={archivedPage}
              onPageChange={(_, newPage) => setArchivedPage(newPage)}
              rowsPerPage={archivedPerPage}
              onRowsPerPageChange={(e) => { setArchivedPerPage(parseInt(e.target.value, 10)); setArchivedPage(0); }}
              rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
              labelRowsPerPage="Per page:"
            />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== DELETE CONFIRMATION DIALOG ========== */}
      {/* Hard-coded button colors per design: */}
      {/*   - Cancel: blue (primary)   – default safe action */}
      {/*   - Archive: yellow (warning) – only for closed nets, hides from */}
      {/*     active list while preserving check-ins/chat for later review */}
      {/*   - Delete: red (error)      – permanent destruction of all data */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle>Delete "{netToDelete?.name}"?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Deleting this net will <strong>permanently remove</strong> every record
            tied to it, including:
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
            <li><Typography variant="body2">All check-ins logged during this net</Typography></li>
            <li><Typography variant="body2">All chat messages sent in this net</Typography></li>
            <li><Typography variant="body2">Any reports, statistics, and history for this instance</Typography></li>
          </Box>
          <Typography color="error" sx={{ mb: 2, fontWeight: 'bold' }}>
            This cannot be undone.
          </Typography>
          {netToDelete?.status === 'closed' ? (
            <Typography variant="body2" color="text.secondary">
              If you only want to clear this net out of the active list while keeping
              the log for later, choose <strong>Archive</strong> instead. Archived
              nets stay searchable and can be restored at any time.
            </Typography>
          ) : netToDelete?.status === 'active' || netToDelete?.status === 'lobby' ? (
            <Typography variant="body2" color="text.secondary">
              If you'd rather keep the log for the record, choose
              {' '}<strong>Close &amp; Archive</strong>. The net is closed normally
              (a complete log is emailed to you), then immediately archived so it
              disappears from the active list but every check-in and chat message
              is preserved and downloadable.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              If you'd rather keep the log for the record, close the net first and
              then archive it &mdash; archiving hides the net from the active list
              but preserves every check-in and message.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {/* Blue Cancel — keep on the left, the safe default */}
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            variant="contained"
            color="primary"
          >
            Cancel
          </Button>
          {/* Yellow Close & Archive — for active/lobby nets, runs close */}
          {/* (which emails the full log to the owner) then archive in one */}
          {/* shot. Saves the manager from a two-step "close, then archive" */}
          {/* dance when they realize mid-net they want to keep the record. */}
          {(netToDelete?.status === 'active' || netToDelete?.status === 'lobby') && (
            <Button
              onClick={async () => {
                if (!netToDelete) return;
                const id = netToDelete.id;
                const name = netToDelete.name;
                setDeleteConfirmOpen(false);
                setNetToDelete(null);
                try {
                  await netApi.close(id);
                  await netApi.archive(id);
                  fetchNets();
                  if (showArchived) fetchArchivedNets();
                  setSnackbar({ open: true, message: `"${name}" closed and archived. The log was emailed to you.`, severity: 'success' });
                } catch (error: any) {
                  console.error('Failed to close & archive net:', error);
                  const message = error.response?.data?.detail || 'Failed to close and archive net';
                  setSnackbar({ open: true, message, severity: 'error' });
                }
              }}
              variant="contained"
              color="warning"
              startIcon={<ArchiveIcon />}
            >
              Close &amp; Archive
            </Button>
          )}
          {/* Yellow Archive — only valid for closed nets (the only state */}
          {/* the existing archive endpoint accepts) */}
          {netToDelete?.status === 'closed' && (
            <Button
              onClick={async () => {
                if (!netToDelete) return;
                const id = netToDelete.id;
                setDeleteConfirmOpen(false);
                setNetToDelete(null);
                await handleArchiveNet(id);
              }}
              variant="contained"
              color="warning"
              startIcon={<ArchiveIcon />}
            >
              Archive Instead
            </Button>
          )}
          {/* Red Delete — destructive, requires explicit click */}
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
          >
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== EMAIL SUBSCRIBERS DIALOG ========== */}
      <Dialog open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
        <DialogTitle>Email Subscribers - {emailNet?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Subject"
              value={emailForm.subject}
              onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
              required
              fullWidth
              placeholder="e.g., Net Cancelled for Dec 25"
            />
            <TextField
              label="Message"
              value={emailForm.message}
              onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && e.ctrlKey && emailForm.subject && emailForm.message && !emailSending) {
                  e.preventDefault();
                  handleSendEmail();
                }
              }}
              required
              multiline
              rows={6}
              fullWidth
              placeholder="Enter your message to subscribers..."
              helperText="Ctrl+Enter to send. This will be sent to all users subscribed to this net's template who have email notifications enabled."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSendEmail} 
            variant="contained" 
            disabled={!emailForm.subject || !emailForm.message || emailSending}
          >
            {emailSending ? <CircularProgress size={24} /> : 'Send Email'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* NCS Staff Modal */}
      <NCSStaffModal
        open={staffModalOpen}
        onClose={() => {
          setStaffModalOpen(false);
          setSelectedNet(null);
        }}
        net={selectedNet ? {
          id: selectedNet.id,
          name: selectedNet.name,
          owner_id: selectedNet.owner_id,
          owner_callsign: selectedNet.owner_callsign || undefined,
          owner_name: selectedNet.owner_name || undefined,
          status: selectedNet.status,
          template_id: selectedNet.template_id ?? null,
        } : null}
        onUpdate={fetchNets}
      />

      {/* Snackbar for toast notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Dashboard;

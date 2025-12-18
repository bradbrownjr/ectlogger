import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RadioIcon from '@mui/icons-material/Radio';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArchiveIcon from '@mui/icons-material/Archive';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import LanguageIcon from '@mui/icons-material/Language';
import InfoIcon from '@mui/icons-material/Info';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import { netApi } from '../services/api';
import NCSStaffModal from '../components/NCSStaffModal';
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
  started_at?: string;
  closed_at?: string;
  created_at: string;
  scheduled_start_time?: string;
  frequencies: any[];
  check_in_count?: number;
  can_manage?: boolean;
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
  const [archiveSortField, setArchiveSortField] = useState<'name' | 'owner' | 'check_ins' | 'closed'>('closed');
  const [archiveSortDirection, setArchiveSortDirection] = useState<'asc' | 'desc'>('desc');
  // View mode and filter state - persist view preference
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const saved = localStorage.getItem('dashboard-view-mode');
    return (saved === 'list' || saved === 'card') ? saved : 'card';
  });
  const [showFilter, setShowFilter] = useState(false);
  const [netFilter, setNetFilter] = useState('');
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    fetchNets();
  }, []);

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

  // Handle archive sort
  const handleArchiveSort = (field: 'name' | 'owner' | 'check_ins' | 'closed') => {
    if (archiveSortField === field) {
      setArchiveSortDirection(archiveSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setArchiveSortField(field);
      setArchiveSortDirection(field === 'closed' ? 'desc' : 'asc');
    }
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
  const filteredNets = nets.filter((net) => {
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
  });

  // ========== CARD VIEW RENDERER ==========
  const renderCardView = () => (
    <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
      {filteredNets.map((net: Net) => (
        <Grid item xs={12} sm={6} md={4} key={net.id} sx={{ display: 'flex' }}>
          {renderNetCard(net)}
        </Grid>
      ))}
    </Grid>
  );

  // ========== LIST VIEW RENDERER ==========
  const renderListView = () => (
    <TableContainer component={Paper}>
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
                <Typography variant="body2" fontWeight="medium">{net.name}</Typography>
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
                {net.owner_callsign && (
                  <Typography variant="body2">
                    {net.owner_callsign}
                    {net.owner_name && <Typography component="span" variant="caption" color="text.secondary"> ({net.owner_name})</Typography>}
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
                  <IconButton size="small" onClick={() => navigate(`/nets/${net.id}`)}>
                    <SearchIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* Net staff - always visible */}
                <Tooltip title="Net staff">
                  <IconButton size="small" onClick={() => { setSelectedNet(net); setStaffModalOpen(true); }}>
                    <GroupsIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* Active net actions */}
                {net.status === 'active' && (
                  <Tooltip title="Statistics">
                    <IconButton size="small" onClick={() => navigate(`/statistics/nets/${net.id}`)}>
                      <BarChartIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {/* Draft net actions */}
                {net.status === 'draft' && net.can_manage && (
                  <>
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
                  </>
                )}
                {/* Closed net actions */}
                {net.status === 'closed' && (
                  <>
                    <Tooltip title="Statistics">
                      <IconButton size="small" onClick={() => navigate(`/statistics/nets/${net.id}`)}>
                        <BarChartIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {net.can_manage && (
                      <>
                        <Tooltip title="Export log">
                          <IconButton size="small" onClick={() => handleExportCSV(net)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Archive">
                          <IconButton size="small" onClick={() => handleArchiveNet(net.id)}>
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {user?.role === 'admin' && (
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDeleteClick(net)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
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
          <Typography variant="h6" component="h2">
            {net.name}
          </Typography>
          <Chip 
            label={net.status} 
            color={getStatusColor(net.status)} 
            size="small"
          />
        </Box>
        
        {/* Description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {net.description || 'No description'}
        </Typography>
        
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
          
          {/* Host/NCS */}
          {net.owner_callsign && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                <strong>NCS:</strong> {net.owner_callsign}
                {net.owner_name && ` (${net.owner_name})`}
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
      <CardActions sx={{ justifyContent: 'space-between' }}>
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
        
        <Box>
          {/* Net staff - always visible */}
          <Tooltip title="View net staff">
            <IconButton
              size="small"
              onClick={() => {
                setSelectedNet(net);
                setStaffModalOpen(true);
              }}
            >
              <GroupsIcon />
            </IconButton>
          </Tooltip>
          {/* Active net - show stats on right side */}
          {net.status === 'active' && (
            <Tooltip title="Net statistics">
              <IconButton
                size="small"
                onClick={() => navigate(`/statistics/nets/${net.id}`)}
              >
                <BarChartIcon />
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
          {/* Draft net actions */}
          {net.status === 'draft' && net.can_manage && (
            <>
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
            </>
          )}
          
          {/* Closed net actions */}
          {net.status === 'closed' && net.can_manage && (
            <>
              <Tooltip title="Net statistics">
                <IconButton
                  size="small"
                  onClick={() => navigate(`/statistics/nets/${net.id}`)}
                >
                  <BarChartIcon />
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
              <Tooltip title="Archive net">
                <IconButton
                  size="small"
                  onClick={() => handleArchiveNet(net.id)}
                >
                  <ArchiveIcon />
                </IconButton>
              </Tooltip>
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
            </>
          )}
        </Box>
      </CardActions>
    </Card>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, px: { xs: 1, sm: 3 } }}>
      {/* ========== HEADER WITH VIEW TOGGLE ========== */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant={isMobile ? "h5" : "h4"} component="h1">
          📻 {isMobile ? 'Active' : 'Active Nets'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isMobile && (
            <Typography variant="body2" color="text.secondary">
              {isAuthenticated ? (
                `Welcome, ${user?.callsign || user?.name || user?.email}`
              ) : (
                "Welcome! Feel free to look around."
              )}
            </Typography>
          )}
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
          <Tooltip title={showFilter ? "Hide filter" : "Filter nets"}>
            <Fab
              color={showFilter ? "primary" : "default"}
              aria-label="filter"
              sx={{ position: 'fixed', bottom: 16, right: 144 }}
              onClick={() => setShowFilter(!showFilter)}
              size="medium"
            >
              <FilterListIcon />
            </Fab>
          </Tooltip>
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
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          📦 Archived Nets ({filteredArchivedNets.length}{(archiveFilter || archiveDateFrom || archiveDateTo) ? ` of ${archivedNets.length}` : ''})
          <IconButton onClick={() => {
            setShowArchived(false);
            setArchiveFilter('');
            setArchiveDateFrom('');
            setArchiveDateTo('');
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
              onChange={(e) => setArchiveFilter(e.target.value)}
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
              onChange={(e) => setArchiveDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200, '& .MuiInputBase-input': { pl: 1.5 } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={archiveDateTo}
              onChange={(e) => setArchiveDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200, '& .MuiInputBase-input': { pl: 1.5 } }}
            />
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
            <TableContainer component={Paper} variant="outlined">
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
                  {filteredArchivedNets.map((net) => (
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
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Net</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete "{netToDelete?.name}"?
          </Typography>
          <Typography color="error" sx={{ mt: 1 }}>
            This will delete all check-ins and cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
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
        } : null}
        onUpdate={fetchNets}
      />
    </Container>
  );
};

export default Dashboard;

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
  Chip,
  Fab,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Snackbar,
  Alert,
  Radio,
  RadioGroup,
  FormControl,
  FormControlLabel as MuiFormControlLabel,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RadioIcon from '@mui/icons-material/Radio';
import LanguageIcon from '@mui/icons-material/Language';
import BarChartIcon from '@mui/icons-material/BarChart';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { templateApi, netApi, ncsRotationApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import NCSStaffModal from '../components/NCSStaffModal';

interface NextNCS {
  date: string;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
}

interface Schedule {
  id: number;
  name: string;
  description: string;
  info_url?: string;
  owner_id: number;
  owner_callsign?: string | null;
  owner_name?: string | null;
  is_active: boolean;
  subscriber_count: number;
  frequencies: any[];
  is_subscribed: boolean;
  can_manage?: boolean;  // True if current user can edit (owner, admin, or NCS rotation member)
  schedule_type?: string;
  schedule_config?: {
    day_of_week?: number;
    week_of_month?: number[];
    time?: string;
  };
  nextNCS?: NextNCS | null;
}

// Format schedule for display
const formatSchedule = (schedule: Schedule): string => {
  if (!schedule.schedule_type || schedule.schedule_type === 'ad_hoc') {
    return 'Ad-hoc (no recurring schedule)';
  }
  
  const config = schedule.schedule_config;
  if (!config) return schedule.schedule_type;
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = config.day_of_week !== undefined ? days[config.day_of_week] : '';
  const time = config.time || '';
  
  // Format time to 12-hour
  let timeStr = '';
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    timeStr = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }
  
  switch (schedule.schedule_type) {
    case 'daily':
      return `Daily at ${timeStr}`;
    case 'weekly':
      return `${dayName}s at ${timeStr}`;
    case 'monthly':
      const weeks = config.week_of_month || [];
      const weekNames = weeks.map(w => w === 5 ? 'Last' : `${w}${w === 1 ? 'st' : w === 2 ? 'nd' : w === 3 ? 'rd' : 'th'}`).join(', ');
      return `${weekNames} ${dayName} at ${timeStr}`;
    default:
      return schedule.schedule_type;
  }
};

const Scheduler: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<Schedule | null>(null);
  const [rotationModalOpen, setRotationModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  // View mode and filter state - persist view preference
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const saved = localStorage.getItem('scheduler-view-mode');
    return (saved === 'list' || saved === 'card') ? saved : 'card';
  });
  const [showFilter, setShowFilter] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('');
  // ========== MERGE MODE STATE ==========
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<number>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergePreview, setMergePreview] = useState<any>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleOpenRotationModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setRotationModalOpen(true);
  };

  const handleCloseRotationModal = () => {
    setRotationModalOpen(false);
    setSelectedSchedule(null);
  };

  const fetchSchedules = async () => {
    try {
      const response = await templateApi.list();
      const schedulesData = response.data;
      
      // Fetch next NCS for each schedule (in parallel)
      const schedulesWithNCS = await Promise.all(
        schedulesData.map(async (schedule: Schedule) => {
          try {
            const ncsResponse = await ncsRotationApi.getNextNCS(schedule.id);
            return { ...schedule, nextNCS: ncsResponse.data };
          } catch {
            // No NCS rotation configured for this schedule
            return { ...schedule, nextNCS: null };
          }
        })
      );
      
      setSchedules(schedulesWithNCS);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (scheduleId: number) => {
    try {
      await templateApi.subscribe(scheduleId);
      fetchSchedules(); // Refresh to update subscription status and subscriber count
    } catch (error: any) {
      console.error('Failed to subscribe:', error);
      alert(error.response?.data?.detail || 'Failed to subscribe');
    }
  };

  const handleUnsubscribe = async (scheduleId: number) => {
    try {
      await templateApi.unsubscribe(scheduleId);
      fetchSchedules(); // Refresh to update subscription status and subscriber count
    } catch (error: any) {
      console.error('Failed to unsubscribe:', error);
      alert(error.response?.data?.detail || 'Failed to unsubscribe');
    }
  };

  const handleCreateNetFromSchedule = async (scheduleId: number) => {
    try {
      const response = await templateApi.createNetFromTemplate(scheduleId);
      navigate(`/nets/${response.data.id}`);
    } catch (error: any) {
      console.error('Failed to create net from schedule:', error);
      alert(error.response?.data?.detail || 'Failed to create net');
    }
  };

  const handleDelete = async (scheduleId: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      await templateApi.delete(scheduleId);
      fetchSchedules();
    } catch (error: any) {
      console.error('Failed to delete schedule:', error);
      alert(error.response?.data?.detail || 'Failed to delete schedule');
    }
  };

  const isOwner = (schedule: Schedule) => user?.id === schedule.owner_id;
  const isAdmin = user?.role === 'admin';

  // ========== MERGE MODE HELPERS ==========
  /** Can the current user merge this template? (admin or owner only) */
  const canMerge = useCallback((schedule: Schedule) => {
    return isAdmin || (user?.id === schedule.owner_id);
  }, [isAdmin, user?.id]);

  /** Number of templates the user could merge */
  const mergeableCount = schedules.filter(canMerge).length;

  const handleToggleMergeSelect = (id: number) => {
    setMergeSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExitMergeMode = () => {
    setMergeMode(false);
    setMergeSelected(new Set());
    setMergePreview(null);
    setMergeTargetId(null);
  };

  const handleOpenMergeDialog = async () => {
    if (mergeSelected.size < 2) return;
    // Default target = first selected
    const selectedIds = Array.from(mergeSelected);
    setMergeTargetId(selectedIds[0]);
    setMergeDialogOpen(true);
    // Fetch preview with first selected as target
    await fetchMergePreview(selectedIds[0], selectedIds.filter(id => id !== selectedIds[0]));
  };

  const fetchMergePreview = async (targetId: number, sourceIds: number[]) => {
    setMergeLoading(true);
    setMergeError(null);
    try {
      const response = await templateApi.mergePreview({
        target_template_id: targetId,
        source_template_ids: sourceIds,
      });
      setMergePreview(response.data);
    } catch (error: any) {
      setMergeError(error.response?.data?.detail || 'Failed to load merge preview');
      setMergePreview(null);
    } finally {
      setMergeLoading(false);
    }
  };

  const handleMergeTargetChange = async (newTargetId: number) => {
    setMergeTargetId(newTargetId);
    const sourceIds = Array.from(mergeSelected).filter(id => id !== newTargetId);
    await fetchMergePreview(newTargetId, sourceIds);
  };

  const handleConfirmMerge = async () => {
    if (!mergeTargetId) return;
    const sourceIds = Array.from(mergeSelected).filter(id => id !== mergeTargetId);
    setMergeLoading(true);
    setMergeError(null);
    try {
      const response = await templateApi.merge({
        target_template_id: mergeTargetId,
        source_template_ids: sourceIds,
      });
      const r = response.data;
      setMergeSuccess(
        `Merged ${r.templates_deleted} schedule${r.templates_deleted !== 1 ? 's' : ''} into target. ` +
        `Moved ${r.nets_moved} net${r.nets_moved !== 1 ? 's' : ''}, ` +
        `${r.subscribers_moved} subscriber${r.subscribers_moved !== 1 ? 's' : ''}, ` +
        `${r.staff_moved} staff, ${r.rotation_members_moved} rotation member${r.rotation_members_moved !== 1 ? 's' : ''}.`
      );
      setMergeDialogOpen(false);
      handleExitMergeMode();
      fetchSchedules();
    } catch (error: any) {
      setMergeError(error.response?.data?.detail || 'Merge failed');
    } finally {
      setMergeLoading(false);
    }
  };

  // ========== SCHEDULE FILTERING ==========
  const filteredSchedules = schedules.filter((schedule) => {
    if (!scheduleFilter) return true;
    const searchTerm = scheduleFilter.toLowerCase();
    return (
      schedule.name.toLowerCase().includes(searchTerm) ||
      (schedule.description?.toLowerCase() || '').includes(searchTerm) ||
      (schedule.owner_callsign?.toLowerCase() || '').includes(searchTerm) ||
      (schedule.owner_name?.toLowerCase() || '').includes(searchTerm) ||
      (schedule.nextNCS?.user_callsign?.toLowerCase() || '').includes(searchTerm) ||
      schedule.frequencies.some((f: any) => 
        (f.frequency?.toLowerCase() || '').includes(searchTerm) ||
        (f.network?.toLowerCase() || '').includes(searchTerm) ||
        (f.talkgroup?.toLowerCase() || '').includes(searchTerm)
      )
    );
  });

  // ========== CARD VIEW RENDERER ==========
  const renderCardView = () => (
    <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
      {filteredSchedules.map((schedule: Schedule) => (
        <Grid item xs={12} sm={6} md={4} key={schedule.id} sx={{ display: 'flex', position: 'relative' }}>
          {/* Merge mode checkbox overlay on top-right of card */}
          {mergeMode && canMerge(schedule) && (
            <Checkbox
              checked={mergeSelected.has(schedule.id)}
              onChange={() => handleToggleMergeSelect(schedule.id)}
              sx={{
                position: 'absolute', top: 4, right: 4, zIndex: 2,
                bgcolor: 'background.paper', borderRadius: 1,
                boxShadow: 1,
              }}
            />
          )}
          <Box
            sx={{
              width: '100%',
              opacity: mergeMode && !canMerge(schedule) ? 0.4 : 1,
              pointerEvents: mergeMode && !canMerge(schedule) ? 'none' : 'auto',
            }}
          >
            {renderScheduleCard(schedule)}
          </Box>
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
            {/* Merge mode checkbox column */}
            {mergeMode && <TableCell padding="checkbox" />}
            <TableCell>Name</TableCell>
            <TableCell>Schedule</TableCell>
            <TableCell>NCS/Host</TableCell>
            <TableCell>Frequencies</TableCell>
            <TableCell align="center">Subscribers</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredSchedules.map((schedule: Schedule) => (
            <TableRow
              key={schedule.id}
              hover
              sx={{ opacity: mergeMode && !canMerge(schedule) ? 0.4 : 1 }}
            >
              {/* Merge mode checkbox */}
              {mergeMode && (
                <TableCell padding="checkbox">
                  {canMerge(schedule) && (
                    <Checkbox
                      checked={mergeSelected.has(schedule.id)}
                      onChange={() => handleToggleMergeSelect(schedule.id)}
                      size="small"
                    />
                  )}
                </TableCell>
              )}
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight="medium">{schedule.name}</Typography>
                  {!schedule.is_active && <Chip label="Inactive" size="small" />}
                </Box>
                {schedule.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {schedule.description.length > 40 ? `${schedule.description.substring(0, 40)}...` : schedule.description}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {formatSchedule(schedule)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {schedule.nextNCS ? (
                    <>
                      {schedule.nextNCS.user_callsign}
                      <Typography component="span" variant="caption" color="text.secondary"> (next)</Typography>
                    </>
                  ) : (
                    schedule.owner_callsign || 'Unknown'
                  )}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {schedule.frequencies.map((f: any) => {
                    if (f.frequency) return f.frequency;
                    if (f.network && f.talkgroup) return `${f.network} TG${f.talkgroup}`;
                    if (f.network) return f.network;
                    return '';
                  }).filter((s: string) => s).join(', ')}
                </Typography>
              </TableCell>
              <TableCell align="center">
                <Chip label={schedule.subscriber_count} size="small" variant="outlined" />
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {schedule.can_create_net && (
                  <Tooltip title="Create Net">
                    <IconButton size="small" color="success" onClick={() => handleCreateNetFromSchedule(schedule.id)}>
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Statistics">
                  <IconButton size="small" sx={{ color: '#ff9800' }} onClick={() => navigate(`/statistics/schedules/${schedule.id}`)}>
                    <BarChartIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Net Staff">
                  <IconButton size="small" sx={{ color: '#9c27b0' }} onClick={() => handleOpenRotationModal(schedule)}>
                    <GroupsIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {isAuthenticated && (
                  schedule.is_subscribed ? (
                    <Tooltip title="Unsubscribe">
                      <IconButton size="small" color="primary" onClick={() => handleUnsubscribe(schedule.id)}>
                        <NotificationsActiveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Subscribe">
                      <IconButton size="small" onClick={() => handleSubscribe(schedule.id)}>
                        <NotificationsOffIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )
                )}
                {(schedule.can_manage || isAdmin) && (
                  <>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => navigate(`/scheduler/${schedule.id}/edit`)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => handleDelete(schedule.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  // ========== SCHEDULE CARD COMPONENT ==========
  const renderScheduleCard = (schedule: Schedule) => (
    <Card sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <CardContent sx={{ flex: 1 }}>
        {/* Title */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography variant="h6" component="h2">
            {schedule.name}
          </Typography>
          {!schedule.is_active && (
            <Chip label="Inactive" color="default" size="small" />
          )}
        </Box>
        
        {/* Description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {schedule.description || 'No description'}
        </Typography>
        
        {/* Info List */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Schedule */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarMonthIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {formatSchedule(schedule)}
            </Typography>
          </Box>
          
          {/* Frequencies */}
          {schedule.frequencies.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2" color="text.secondary">
                {schedule.frequencies.map((f: any) => {
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
          
          {/* Host / Next NCS */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {schedule.nextNCS ? (
                <>
                  <strong>Next NCS:</strong> {schedule.nextNCS.user_callsign}
                  {schedule.nextNCS.user_name && ` (${schedule.nextNCS.user_name})`}
                  {' - '}
                  {new Date(schedule.nextNCS.date).toLocaleDateString(undefined, { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </>
              ) : (
                <>
                  <strong>Host:</strong> {schedule.owner_callsign || 'Unknown'}
                  {schedule.owner_name && ` (${schedule.owner_name})`}
                </>
              )}
            </Typography>
          </Box>
          
          {/* Subscribers */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationsActiveIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {schedule.subscriber_count} subscriber{schedule.subscriber_count !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>
      </CardContent>
      
      <CardActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Box>
          {schedule.can_create_net && (
            <Button
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={() => handleCreateNetFromSchedule(schedule.id)}
            >
              Create Net
            </Button>
          )}
        </Box>
        <Box>
          {schedule.info_url && (
            <Tooltip title="Net/Club info">
              <IconButton
                size="small"
                color="primary"
                onClick={() => window.open(schedule.info_url, '_blank')}
              >
                <LanguageIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Schedule statistics">
            <IconButton
              size="small"
              sx={{ color: '#ff9800' }}
              onClick={() => navigate(`/statistics/schedules/${schedule.id}`)}
            >
              <BarChartIcon />
            </IconButton>
          </Tooltip>
          {/* Net Staff - always visible */}
          <Tooltip title="View net staff">
            <IconButton
              size="small"
              sx={{ color: '#9c27b0' }}
              onClick={() => handleOpenRotationModal(schedule)}
            >
              <GroupsIcon />
            </IconButton>
          </Tooltip>
          {/* Notifications - auth required */}
          {isAuthenticated && (
            schedule.is_subscribed ? (
              <Tooltip title="Unsubscribe from notifications">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleUnsubscribe(schedule.id)}
                >
                  <NotificationsActiveIcon />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Subscribe to notifications">
                <IconButton
                  size="small"
                  onClick={() => handleSubscribe(schedule.id)}
                >
                  <NotificationsOffIcon />
                </IconButton>
              </Tooltip>
            )
          )}
          
          {/* Edit & Delete for owners, admins, or NCS rotation members */}
          {(schedule.can_manage || isAdmin) && (
            <>
              <Tooltip title="Edit schedule">
                <IconButton
                  size="small"
                  onClick={() => navigate(`/scheduler/${schedule.id}/edit`)}
                >
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete schedule">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(schedule.id)}
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
    <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, px: { xs: 1, sm: 3 } }}>
      {/* ========== HEADER WITH VIEW TOGGLE ========== */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant={isMobile ? "h5" : "h4"} component="h1">
          📅 {isMobile ? 'Schedule' : 'Net Schedule'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isMobile && (
            <Typography variant="caption" color="text.secondary">
              Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </Typography>
          )}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => {
              if (newMode) {
                setViewMode(newMode);
                localStorage.setItem('scheduler-view-mode', newMode);
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
            value={scheduleFilter}
            onChange={(e) => setScheduleFilter(e.target.value)}
            sx={{ flexGrow: 1, maxWidth: 500 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: scheduleFilter && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setScheduleFilter('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {filteredSchedules.length} of {schedules.length}
          </Typography>
        </Box>
      </Collapse>

      {/* ========== SCHEDULES DISPLAY ========== */}
      {loading ? (
        <Typography>Loading Nets...</Typography>
      ) : schedules.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            None scheduled yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first schedule to get started
          </Typography>
        </Box>
      ) : filteredSchedules.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No schedules match your filter
          </Typography>
          <Button variant="text" onClick={() => setScheduleFilter('')}>
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
          {/* Merge FAB — visible when user can merge 2+ templates and NOT in merge mode */}
          {!mergeMode && mergeableCount >= 2 && (
            <Tooltip title="Merge schedules">
              <Fab
                color="default"
                aria-label="merge schedules"
                sx={{ position: 'fixed', bottom: 16, right: 144 }}
                onClick={() => setMergeMode(true)}
                size="medium"
              >
                <CallMergeIcon />
              </Fab>
            </Tooltip>
          )}
          {/* Cancel merge FAB — visible in merge mode */}
          {mergeMode && (
            <Tooltip title="Cancel merge">
              <Fab
                color="default"
                aria-label="cancel merge"
                sx={{ position: 'fixed', bottom: 16, right: 144 }}
                onClick={handleExitMergeMode}
                size="medium"
              >
                <ClearIcon />
              </Fab>
            </Tooltip>
          )}
          <Tooltip title={showFilter ? "Hide filter" : "Filter schedules"}>
            <Fab
              color={showFilter ? "primary" : "default"}
              aria-label="filter"
              sx={{ position: 'fixed', bottom: 16, right: 80 }}
              onClick={() => setShowFilter(!showFilter)}
              size="medium"
            >
              <FilterListIcon />
            </Fab>
          </Tooltip>
          <Tooltip title="Create new schedule">
            <Fab
              color="primary"
              aria-label="create schedule"
              sx={{ position: 'fixed', bottom: 16, right: 16 }}
              onClick={() => navigate('/scheduler/create')}
            >
              <AddIcon />
            </Fab>
          </Tooltip>
        </>
      )}

      {/* NCS Staff Modal */}
      <NCSStaffModal
        open={rotationModalOpen}
        onClose={handleCloseRotationModal}
        schedule={selectedSchedule ? {
          id: selectedSchedule.id,
          name: selectedSchedule.name,
          owner_id: selectedSchedule.owner_id,
          owner_callsign: selectedSchedule.owner_callsign || undefined,
          owner_name: selectedSchedule.owner_name || undefined,
        } : null}
        onUpdate={fetchSchedules}
      />

      {/* ========== MERGE SELECTION BAR (bottom of screen in merge mode) ========== */}
      {mergeMode && (
        <Box
          sx={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200,
            bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider',
            py: 1.5, px: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: 3,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            <CallMergeIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            {mergeSelected.size} schedule{mergeSelected.size !== 1 ? 's' : ''} selected
            {mergeSelected.size < 2 && ' (select at least 2)'}
          </Typography>
          <Button
            variant="contained"
            color="warning"
            startIcon={<CallMergeIcon />}
            disabled={mergeSelected.size < 2}
            onClick={handleOpenMergeDialog}
          >
            Merge Selected
          </Button>
        </Box>
      )}

      {/* ========== MERGE CONFIRMATION DIALOG ========== */}
      <Dialog
        open={mergeDialogOpen}
        onClose={() => !mergeLoading && setMergeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CallMergeIcon color="warning" /> Merge Schedules
        </DialogTitle>
        <DialogContent dividers>
          {mergeError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMergeError(null)}>
              {mergeError}
            </Alert>
          )}

          {/* Master template selection */}
          <Typography variant="subtitle2" gutterBottom>
            Select the master schedule (the one that will survive):
          </Typography>
          <FormControl component="fieldset" sx={{ mb: 2, width: '100%' }}>
            <RadioGroup
              value={mergeTargetId?.toString() || ''}
              onChange={(e) => handleMergeTargetChange(Number(e.target.value))}
            >
              {Array.from(mergeSelected).map(id => {
                const schedule = schedules.find(s => s.id === id);
                if (!schedule) return null;
                return (
                  <MuiFormControlLabel
                    key={id}
                    value={id.toString()}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {schedule.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatSchedule(schedule)} · {schedule.owner_callsign || 'Unknown owner'}
                          {schedule.subscriber_count > 0 && ` · ${schedule.subscriber_count} subscriber${schedule.subscriber_count !== 1 ? 's' : ''}`}
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start', mb: 0.5 }}
                  />
                );
              })}
            </RadioGroup>
          </FormControl>

          {/* Loading spinner */}
          {mergeLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          )}

          {/* Preview summary */}
          {mergePreview && !mergeLoading && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Merge summary:
              </Typography>
              <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5, mb: 2 }}>
                {mergePreview.source_templates.map((src: any) => (
                  <Typography key={src.id} variant="body2">
                    <strong>{src.name}</strong>: {src.net_count} net{src.net_count !== 1 ? 's' : ''}
                    {src.subscriber_count > 0 && `, ${src.subscriber_count} subscriber${src.subscriber_count !== 1 ? 's' : ''}`}
                  </Typography>
                ))}
                <Typography variant="body2" sx={{ mt: 1 }} fontWeight="medium">
                  Total moving to <em>{mergePreview.target_template_name}</em>:
                  {' '}{mergePreview.total_nets_moved} net{mergePreview.total_nets_moved !== 1 ? 's' : ''},
                  {' '}{mergePreview.total_subscribers_moved} new subscriber{mergePreview.total_subscribers_moved !== 1 ? 's' : ''},
                  {' '}{mergePreview.total_staff_moved} staff,
                  {' '}{mergePreview.total_rotation_members_moved} rotation member{mergePreview.total_rotation_members_moved !== 1 ? 's' : ''}
                </Typography>
              </Box>

              {/* Conflict warnings */}
              {mergePreview.conflicts.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <WarningAmberIcon fontSize="small" /> Settings that differ (source values will be lost):
                  </Typography>
                  <Box sx={{ bgcolor: 'warning.light', borderRadius: 1, p: 1.5, mb: 2, opacity: 0.9 }}>
                    {mergePreview.conflicts.map((c: any, i: number) => (
                      <Box key={i} sx={{ mb: i < mergePreview.conflicts.length - 1 ? 1 : 0 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {c.field} — from "{c.source_template_name}"
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          Master: {c.target_value} · Source: {c.source_value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </>
          )}

          <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
            This will combine all nets, subscribers, and staff into the master schedule. 
            Source schedules will be <strong>permanently deleted</strong>. This cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeDialogOpen(false)} disabled={mergeLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConfirmMerge}
            disabled={mergeLoading || !mergePreview || !mergeTargetId}
            startIcon={mergeLoading ? <CircularProgress size={16} /> : <CallMergeIcon />}
          >
            Merge
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== MERGE SUCCESS SNACKBAR ========== */}
      <Snackbar
        open={!!mergeSuccess}
        autoHideDuration={8000}
        onClose={() => setMergeSuccess(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setMergeSuccess(null)}>
          {mergeSuccess}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Scheduler;

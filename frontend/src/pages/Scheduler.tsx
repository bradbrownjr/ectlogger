import React, { useEffect, useState } from 'react';
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
import { templateApi, netApi, ncsRotationApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import NCSRotationModal from '../components/NCSRotationModal';

interface NextNCS {
  date: string;
  user_id: number;
  callsign: string;
  name: string | null;
}

interface Schedule {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  is_active: boolean;
  subscriber_count: number;
  frequencies: any[];
  is_subscribed: boolean;
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

  return (
    <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, px: { xs: 1, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant={isMobile ? "h5" : "h4"} component="h1" gutterBottom>
          📅 {isMobile ? 'Schedule' : 'Net Schedule'}
        </Typography>
        <Box sx={{ textAlign: 'right' }}>
          {!isMobile && (
            <Typography variant="body1" color="text.secondary">
              Create recurring net schedules and subscribe to notifications
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Typography>
        </Box>
      </Box>

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
      ) : (
        <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
          {schedules.map((schedule: Schedule) => (
            <Grid item xs={12} sm={6} md={4} key={schedule.id} sx={{ display: 'flex' }}>
              <Card sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <CardContent sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6" component="h2">
                      {schedule.name}
                    </Typography>
                    {!schedule.is_active && (
                      <Chip label="Inactive" color="default" size="small" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {schedule.description || 'No description'}
                  </Typography>
                  <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                    📆 {formatSchedule(schedule)}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <NotificationsActiveIcon fontSize="small" color="action" />
                    <Typography variant="caption" color="text.secondary">
                      {schedule.subscriber_count} subscriber{schedule.subscriber_count !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  {schedule.frequencies.length > 0 && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      Frequencies: {schedule.frequencies.map((f: any) => {
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
                  )}
                  {/* Next NCS Display */}
                  {schedule.nextNCS && (
                    <Box 
                      sx={{ 
                        mt: 1.5, 
                        p: 1, 
                        bgcolor: 'action.hover', 
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      <PersonIcon fontSize="small" color="primary" />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Next NCS
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {schedule.nextNCS.callsign}
                          {schedule.nextNCS.name && ` (${schedule.nextNCS.name})`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(schedule.nextNCS.date).toLocaleDateString(undefined, { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </Typography>
                      </Box>
                      <Tooltip title="View rotation schedule">
                        <IconButton 
                          size="small" 
                          onClick={() => handleOpenRotationModal(schedule)}
                        >
                          <CalendarMonthIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                  {/* Show rotation setup button for owners without rotation */}
                  {!schedule.nextNCS && (isOwner(schedule) || isAdmin) && (
                    <Box sx={{ mt: 1.5 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<GroupsIcon />}
                        onClick={() => handleOpenRotationModal(schedule)}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        Set Up NCS Rotation
                      </Button>
                    </Box>
                  )}
                </CardContent>
                {isAuthenticated && (
                <CardActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Box>
                    <Button
                      size="small"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => handleCreateNetFromSchedule(schedule.id)}
                    >
                      Create Net
                    </Button>
                  </Box>
                  <Box>
                    {schedule.is_subscribed ? (
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleUnsubscribe(schedule.id)}
                        title="Unsubscribe from notifications"
                      >
                        <NotificationsActiveIcon />
                      </IconButton>
                    ) : (
                      <IconButton
                        size="small"
                        onClick={() => handleSubscribe(schedule.id)}
                        title="Subscribe to notifications"
                      >
                        <NotificationsOffIcon />
                      </IconButton>
                    )}
                    {(isOwner(schedule) || isAdmin) && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/scheduler/${schedule.id}/edit`)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(schedule.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </Box>
                </CardActions>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {isAuthenticated && (
        <Fab
          color="primary"
          aria-label="create schedule"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => navigate('/scheduler/create')}
        >
          <AddIcon />
        </Fab>
      )}

      {/* NCS Rotation Modal */}
      <NCSRotationModal
        open={rotationModalOpen}
        onClose={handleCloseRotationModal}
        schedule={selectedSchedule}
        onUpdate={fetchSchedules}
      />
    </Container>
  );
};

export default Scheduler;

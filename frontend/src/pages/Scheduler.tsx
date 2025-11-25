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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { templateApi, netApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const response = await templateApi.list();
      setSchedules(response.data);
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
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          📅 Nets
        </Typography>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body1" color="text.secondary">
            Create recurring net schedules and subscribe to notifications
          </Typography>
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
    </Container>
  );
};

export default Scheduler;

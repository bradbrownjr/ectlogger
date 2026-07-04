import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
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
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ExpandableDescription from '../ExpandableDescription';

// ---- Types ----

interface NextNCS {
  date: string;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
}

export interface Schedule {
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
  can_manage?: boolean;
  can_create_net?: boolean;
  schedule_type?: string;
  schedule_config?: {
    day_of_week?: number;
    week_of_month?: number[];
    time?: string;
  };
  nextNCS?: NextNCS | null;
}

// ---- Utilities (pure — safe to use in both ScheduleCard and Scheduler) ----

export const computeNextOccurrence = (schedule: Schedule): number => {
  const { schedule_type: type, schedule_config: config } = schedule;
  if (!type || type === 'ad_hoc' || type === 'one_time' || !config) return Infinity;

  const now = new Date();
  const [hour, minute] = (config.time || '19:00').split(':').map(Number);

  if (type === 'daily') {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime();
  }

  if (type === 'weekly') {
    const targetDay = config.day_of_week ?? 0;
    const daysUntil = (targetDay - now.getDay() + 7) % 7;
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil, hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 7);
    return next.getTime();
  }

  if (type === 'monthly') {
    const targetDay = config.day_of_week ?? 0;
    const weeksOfMonth = config.week_of_month || [1];
    const limit = new Date(now);
    limit.setDate(limit.getDate() + 56);
    const check = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (check <= now) check.setDate(check.getDate() + 1);
    while (check <= limit) {
      if (check.getDay() === targetDay) {
        let occurrence = 0;
        for (let d = 1; d <= check.getDate(); d++) {
          if (new Date(check.getFullYear(), check.getMonth(), d).getDay() === targetDay) occurrence++;
        }
        if (weeksOfMonth.includes(occurrence)) return check.getTime();
      }
      check.setDate(check.getDate() + 1);
    }
    return Infinity;
  }

  return Infinity;
};

export const formatSchedule = (schedule: Schedule): string => {
  if (!schedule.schedule_type || schedule.schedule_type === 'ad_hoc') {
    return 'Ad-hoc (no recurring schedule)';
  }
  const config = schedule.schedule_config;
  if (!config) return schedule.schedule_type;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = config.day_of_week !== undefined ? days[config.day_of_week] : '';
  const time = config.time || '';

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
    case 'monthly': {
      const weeks = config.week_of_month || [];
      const weekNames = weeks.map(w =>
        w === 5 ? 'Last' : `${w}${w === 1 ? 'st' : w === 2 ? 'nd' : w === 3 ? 'rd' : 'th'}`
      ).join(', ');
      return `${weekNames} ${dayName} at ${timeStr}`;
    }
    default:
      return schedule.schedule_type;
  }
};

// ---- Props ----

interface ScheduleCardProps {
  schedule: Schedule;
  favorites: Set<number>;
  onToggleFavorite: (id: number) => void;
  isAuthenticated: boolean;
  /** Whether the current user can manage (edit) this schedule (pre-computed by parent). */
  canManage: boolean;
  /** Whether the current user is the owner or an admin (pre-computed by parent). */
  isOwnerOrAdmin: boolean;
  onCreateNet: () => void;
  onOpenRotationModal: () => void;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onDelete: () => void;
}

// ========== SCHEDULE CARD COMPONENT ==========
// Card tile for a single schedule, used in the Scheduler card view.

const ScheduleCard: React.FC<ScheduleCardProps> = ({
  schedule,
  favorites,
  onToggleFavorite,
  isAuthenticated,
  canManage,
  isOwnerOrAdmin,
  onCreateNet,
  onOpenRotationModal,
  onSubscribe,
  onUnsubscribe,
  onDelete,
}) => {
  const navigate = useNavigate();
  const isFavorite = favorites.has(schedule.id);

  return (
    // height: 100% stretches sibling cards to equal height in a Grid row.
    // minHeight keeps short/lone cards from looking uneven.
    <Card sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 260 }}>
      <CardContent sx={{ flex: 1 }}>
        {/* ---- Title with inactive chip and favorite toggle ---- */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography
            variant="h6"
            component="h2"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              flex: 1,
              mr: 0.5,
            }}
          >
            {schedule.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {!schedule.is_active && <Chip label="Inactive" color="default" size="small" />}
            <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
              <IconButton
                size="small"
                onClick={() => onToggleFavorite(schedule.id)}
                sx={{ color: isFavorite ? 'warning.main' : 'action.disabled', p: 0.25 }}
              >
                {isFavorite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* ---- Description ---- */}
        <ExpandableDescription text={schedule.description} />

        {/* ---- Info list ---- */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Schedule recurrence */}
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
                  if (f.frequency) return f.frequency;
                  if (f.network && f.talkgroup) return `${f.network} TG${f.talkgroup}`;
                  if (f.network) return f.network;
                  return '';
                }).filter((s: string) => s).join(', ')}
              </Typography>
            </Box>
          )}

          {/* ---- Net Manager (owner) ----
              Always shown so it's clear who maintains the schedule. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              <strong>Net Manager:</strong> {schedule.owner_callsign || 'Unknown'}
              {schedule.owner_name && ` (${schedule.owner_name})`}
            </Typography>
          </Box>

          {/* ---- Next NCS ----
              Suppressed when no rotation is set, or when the next NCS is the manager. */}
          {schedule.nextNCS && schedule.nextNCS.user_callsign !== schedule.owner_callsign && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                <strong>Next NCS:</strong> {schedule.nextNCS.user_callsign}
                {schedule.nextNCS.user_name && ` (${schedule.nextNCS.user_name})`}
                {' - '}
                {new Date(schedule.nextNCS.date).toLocaleDateString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric'
                })}
              </Typography>
            </Box>
          )}

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
            <Button size="small" startIcon={<PlayArrowIcon />} onClick={onCreateNet}>
              Create Net
            </Button>
          )}
        </Box>
        <Box>
          {schedule.info_url && (
            <Tooltip title="Net/Club info">
              <IconButton size="small" color="primary" onClick={() => window.open(schedule.info_url, '_blank')}>
                <LanguageIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Schedule statistics">
            <IconButton size="small" sx={{ color: '#ff9800' }} onClick={() => navigate(`/statistics/schedules/${schedule.id}`)}>
              <BarChartIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="View net staff">
            <IconButton size="small" sx={{ color: '#9c27b0' }} onClick={onOpenRotationModal}>
              <GroupsIcon />
            </IconButton>
          </Tooltip>
          {isAuthenticated && (
            schedule.is_subscribed ? (
              <Tooltip title="Unsubscribe from notifications">
                <IconButton size="small" color="primary" onClick={onUnsubscribe}>
                  <NotificationsActiveIcon />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Subscribe to notifications">
                <IconButton size="small" onClick={onSubscribe}>
                  <NotificationsOffIcon />
                </IconButton>
              </Tooltip>
            )
          )}
          {canManage && (
            <Tooltip title="Edit schedule">
              <IconButton size="small" onClick={() => navigate(`/scheduler/${schedule.id}/edit`)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* Delete is restricted to owner and admin only */}
          {isOwnerOrAdmin && (
            <Tooltip title="Delete schedule">
              <IconButton size="small" color="error" onClick={onDelete}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </CardActions>
    </Card>
  );
};

export default ScheduleCard;

import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Container,
  Link,
  Paper,
  Typography,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LoginIcon from '@mui/icons-material/Login';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RadioIcon from '@mui/icons-material/Radio';
import ExpandableDescription from '../components/ExpandableDescription';
import { Schedule, formatSchedule } from '../components/scheduler/ScheduleCard';
import { useAuth } from '../contexts/AuthContext';
import { templateApi } from '../services/api';
import { formatFrequencyList } from '../utils/frequencyList';
import { setScheduleSubscription } from '../utils/scheduleSubscription';
import { subscribePath } from '../utils/subscribeLink';

/**
 * Subscribe page: where a schedule's shared subscribe link lands.
 *
 * Works signed out. It shows which net the link is for, and subscribing is
 * always a deliberate click on this page: opening the link never subscribes
 * anyone by itself, so a link preview or a crafted URL cannot do it for them.
 * A signed-out visitor is sent to sign-in and returned here afterward.
 */
const SubscribeToSchedule: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [saving, setSaving] = useState(false);

  const fetchSchedule = useCallback(async () => {
    const id = Number(scheduleId);
    if (!Number.isInteger(id) || id <= 0) {
      setStatus('not_found');
      return;
    }
    try {
      const response = await templateApi.get(id);
      setSchedule(response.data);
      setStatus('ready');
    } catch (error: any) {
      setStatus(error?.response?.status === 404 ? 'not_found' : 'error');
    }
  }, [scheduleId]);

  // Re-read after sign-in too, so "already subscribed" reflects this account
  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule, isAuthenticated]);

  const handleSetSubscribed = async (subscribe: boolean) => {
    if (!schedule) return;
    setSaving(true);
    if (await setScheduleSubscription(schedule.id, subscribe)) await fetchSchedule();
    setSaving(false);
  };

  const handleSignIn = () => {
    navigate(`/login?redirect=${encodeURIComponent(subscribePath(scheduleId || ''))}`);
  };

  // Net-start emails need both switches on (backend/app/net_start.py), so a
  // new subscriber with either one off would otherwise wait for an email
  // that is never sent.
  const startEmailsOff = !!user && (user.email_notifications === false || user.notify_net_start === false);

  const browseButton = (
    <Button component={RouterLink} to="/scheduler" variant="outlined" sx={{ minHeight: 44 }}>
      Browse the net schedule
    </Button>
  );

  return (
    <Container maxWidth="sm" sx={{ mt: { xs: 2, sm: 8 }, mb: 4 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center' }}>
        {/* Shows while the schedule is being read */}
        {status === 'loading' && (
          <Box sx={{ py: 4 }}>
            <CircularProgress size={48} />
          </Box>
        )}

        {/* Shows when the link's schedule does not exist */}
        {status === 'not_found' && (
          <Box sx={{ py: 2 }}>
            <Typography variant="h5" component="h1" gutterBottom>
              Net not found
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              This subscribe link does not match a net on this site.
            </Typography>
            {browseButton}
          </Box>
        )}

        {/* Shows when the schedule could not be read (network or server error) */}
        {status === 'error' && (
          <Box sx={{ py: 2 }}>
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              This net could not be loaded. Check your connection and try again.
            </Alert>
            <Button variant="contained" onClick={fetchSchedule} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          </Box>
        )}

        {status === 'ready' && schedule && (
          <>
            {/* ========== NET IDENTITY ========== */}
            {schedule.logo_url && (
              <Avatar
                variant="rounded"
                src={schedule.logo_url}
                alt=""
                sx={{ width: 96, height: 96, mx: 'auto', mb: 2 }}
              />
            )}
            <Typography variant="overline" color="text.secondary" display="block">
              Subscribe to net notifications
            </Typography>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ typography: { xs: 'h5', sm: 'h4' }, overflowWrap: 'anywhere' }}
            >
              {schedule.name}
            </Typography>

            <Box sx={{ textAlign: 'left' }}>
              <ExpandableDescription text={schedule.description} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarMonthIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {formatSchedule(schedule)}
                  </Typography>
                </Box>
                {schedule.frequencies.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" color="text.secondary">
                      {formatFrequencyList(schedule.frequencies)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* ========== SUBSCRIBE ACTION ========== */}
            {/* Shows when the schedule has been deactivated: nothing to subscribe to */}
            {!schedule.is_active && (
              <>
                <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
                  This net is no longer scheduled.
                </Alert>
                {browseButton}
              </>
            )}

            {/* Shows to a signed-out visitor */}
            {schedule.is_active && !isAuthenticated && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Subscribers are emailed when this net starts. Sign in or create an
                  account with your email address, and you will come back to this page.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<LoginIcon />}
                  onClick={handleSignIn}
                >
                  Sign in to subscribe
                </Button>
              </>
            )}

            {/* Shows to a signed-in visitor who is not subscribed yet */}
            {schedule.is_active && isAuthenticated && !schedule.is_subscribed && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Subscribers are emailed when this net starts.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<NotificationsActiveIcon />}
                  disabled={saving}
                  onClick={() => handleSetSubscribed(true)}
                >
                  Subscribe
                </Button>
              </>
            )}

            {/* Shows once subscribed (just now, or on an earlier visit) */}
            {schedule.is_active && isAuthenticated && schedule.is_subscribed && (
              <>
                <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
                  You are subscribed to this net.
                </Alert>
                {startEmailsOff && (
                  <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                    Net start emails are turned off for your account, so you will not be
                    emailed when this net starts.{' '}
                    <Link component={RouterLink} to="/profile?tab=notifications">
                      Change your notification settings
                    </Link>
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {browseButton}
                  <Button
                    color="inherit"
                    disabled={saving}
                    onClick={() => handleSetSubscribed(false)}
                    sx={{ minHeight: 44 }}
                  >
                    Unsubscribe
                  </Button>
                </Box>
              </>
            )}
          </>
        )}
      </Paper>
    </Container>
  );
};

export default SubscribeToSchedule;

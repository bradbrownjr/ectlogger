import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Link, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Schedule } from './ScheduleCard';
import { useAuth } from '../../contexts/AuthContext';
import { setScheduleSubscription } from '../../utils/scheduleSubscription';
import { scheduleSubscribeTarget } from '../../utils/scheduleLinks';

interface ScheduleSubscribePanelProps {
  schedule: Schedule;
  // Re-read the schedule after a change, so is_subscribed is current
  onChanged: () => Promise<void> | void;
  // Arrived by the subscribe link: outline the panel and scroll it into view
  highlighted?: boolean;
}

// ========== SCHEDULE SUBSCRIBE PANEL ==========
// The schedule home page's Subscribe block, where a schedule's subscribe link
// lands. Works signed out. Subscribing is always a deliberate click here:
// opening the link never subscribes anyone by itself, so a link preview or a
// crafted URL cannot do it for them. A signed-out visitor is sent to sign-in
// and returned to this panel afterward, so subscribing stays one click.

const ScheduleSubscribePanel: React.FC<ScheduleSubscribePanelProps> = ({ schedule, onChanged, highlighted }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  const handleSetSubscribed = async (subscribe: boolean) => {
    setSaving(true);
    if (await setScheduleSubscription(schedule.id, subscribe)) await onChanged();
    setSaving(false);
  };

  const handleSignIn = () => {
    navigate(`/login?redirect=${encodeURIComponent(scheduleSubscribeTarget(schedule.id))}`);
  };

  // Net-start emails need both switches on (backend/app/net_start.py), so a
  // new subscriber with either one off would otherwise wait for an email
  // that is never sent.
  const startEmailsOff = !!user && (user.email_notifications === false || user.notify_net_start === false);

  return (
    <Box
      ref={panelRef}
      sx={{
        borderRadius: 1,
        // Outline only when the subscribe link brought the visitor here
        ...(highlighted && { outline: 2, outlineColor: 'primary.main', outlineOffset: 8 }),
      }}
    >
      {/* Shows when the schedule has been deactivated: nothing to subscribe to */}
      {!schedule.is_active && (
        <Alert severity="info">This net is no longer scheduled.</Alert>
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
          <Alert
            severity="success"
            sx={{ mb: startEmailsOff ? 2 : 0 }}
            action={
              <Button color="inherit" size="small" disabled={saving} onClick={() => handleSetSubscribed(false)}>
                Unsubscribe
              </Button>
            }
          >
            You are subscribed to this net.
          </Alert>
          {startEmailsOff && (
            <Alert severity="warning">
              Net start emails are turned off for your account, so you won't get one when this net starts.{' '}
              <Link component={RouterLink} to="/profile?tab=notifications">
                Change your notification settings
              </Link>
            </Alert>
          )}
        </>
      )}
    </Box>
  );
};

export default ScheduleSubscribePanel;

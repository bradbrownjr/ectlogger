import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, IconButton, Snackbar } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../contexts/AuthContext';
import { templateApi } from '../../services/api';
import { setScheduleSubscription } from '../../utils/scheduleSubscription';
import { scheduleSubscribeTarget } from '../../utils/scheduleLinks';

interface NetClosedNoticeProps {
  status: string | undefined;
  templateId: number | null | undefined;
  // Net staff get the archive reminder instead of this notice
  suppressed: boolean;
}

// What the notice can offer about the net's schedule
type Offer = 'none' | 'subscribe' | 'sign-in' | 'subscribed';

// ========== NET CLOSED NOTICE ==========
// The slide-up every viewer sees when a net closes (or when they open one that
// already has), offering to subscribe to its schedule so they get an email
// when it next starts. Replaced a modal that only the person who clicked
// Close ever saw (it ran inside handleCloseNet, never on the WebSocket close).
// Lived inside Chat until 2026-11-08, so it was missing whenever chat wasn't
// on screen.
const NetClosedNotice: React.FC<NetClosedNoticeProps> = ({ status, templateId, suppressed }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState<Offer>('none');
  const [saving, setSaving] = useState(false);

  const ended = status === 'closed' || status === 'archived';

  useEffect(() => {
    if (ended && !suppressed) setOpen(true);
  }, [ended, suppressed]);

  // Decide the offer from the schedule. GET /templates/{id} is public, so this
  // works signed out. Only a schedule that runs again has a next net to hear
  // about: not a one-time or ad hoc one, and not one that was deactivated.
  useEffect(() => {
    if (!open || !templateId) return;
    let cancelled = false;
    templateApi.get(templateId)
      .then(({ data }) => {
        if (cancelled) return;
        const type = data.schedule_type;
        const runsAgain = data.is_active && !!type && type !== 'ad_hoc' && type !== 'one_time';
        if (!runsAgain || data.is_subscribed) setOffer('none');
        else setOffer(isAuthenticated ? 'subscribe' : 'sign-in');
      })
      .catch(() => { if (!cancelled) setOffer('none'); });
    return () => { cancelled = true; };
  }, [open, templateId, isAuthenticated]);

  const handleSubscribe = async () => {
    if (!templateId) return;
    setSaving(true);
    if (await setScheduleSubscription(templateId, true)) setOffer('subscribed');
    setSaving(false);
  };

  const handleSignIn = () => {
    if (!templateId) return;
    navigate(`/login?redirect=${encodeURIComponent(scheduleSubscribeTarget(templateId))}`);
  };

  // An Alert drops its own close button when given an action, so the offer
  // and the close button are drawn together here
  const offerButton =
    offer === 'subscribe' ? (
      <Button color="inherit" size="small" disabled={saving} onClick={handleSubscribe}>
        Subscribe
      </Button>
    ) : offer === 'sign-in' ? (
      <Button color="inherit" size="small" onClick={handleSignIn}>
        Sign in to subscribe
      </Button>
    ) : null;

  const message =
    offer === 'subscribed'
      ? 'You are subscribed to this net.'
      : status === 'archived'
        ? 'This net has been archived. You are viewing historical data.'
        : 'This net has been closed. Check-ins are no longer accepted.';

  return (
    <Snackbar
      open={open}
      // Longer with a button, so there's time to read it and decide
      autoHideDuration={offerButton ? 10000 : 5000}
      onClose={(_, reason) => { if (reason !== 'clickaway') setOpen(false); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={offer === 'subscribed' ? 'success' : 'info'}
        action={
          <>
            {offerButton}
            <IconButton size="small" color="inherit" aria-label="Close" onClick={() => setOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
        sx={{ width: '100%', alignItems: 'center' }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

export default NetClosedNotice;

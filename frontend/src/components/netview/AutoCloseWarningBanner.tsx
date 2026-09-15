import React, { useState } from 'react';
import { Alert, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TimerIcon from '@mui/icons-material/Timer';

interface AutoCloseWarningBannerProps {
  autoCloseAt: string; // net.auto_close_at, used only as a dismissal key
  remainingLabel: string; // pre-formatted mm:ss, ticked by NetView's 1s timer effect
}

// Dismissible warning shown on NetView when a net's auto-close-on-inactivity
// toggle (Net.auto_close_after_minutes) is close to firing. Same visual
// pattern as MaintenanceBanner/UpdateAvailableBanner (filled Alert, no
// Collapse wrapper so it stays full width), but net-scoped so it's mounted
// inside NetView rather than the global App shell.
//
// Dismissal is keyed to autoCloseAt rather than a plain boolean (same idea as
// UpdateAvailableBanner's dismissedFor/latestBuildId): a check-in or chat
// message resets the server-side inactivity clock and pushes auto_close_at
// forward, so a dismissal of *this* warning must not silently suppress a
// later one if the net goes quiet again after that reset.
const AutoCloseWarningBanner: React.FC<AutoCloseWarningBannerProps> = ({ autoCloseAt, remainingLabel }) => {
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  if (dismissedFor === autoCloseAt) return null;

  return (
    <Alert
      variant="filled"
      severity="warning"
      icon={<TimerIcon fontSize="inherit" />}
      action={
        <IconButton
          aria-label="dismiss auto-close warning"
          color="inherit"
          size="small"
          onClick={() => setDismissedFor(autoCloseAt)}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      }
      sx={{ mb: 1, '& .MuiAlert-message': { flexGrow: 1 } }}
    >
      This net will automatically close in {remainingLabel} due to inactivity. Any check-in or chat message resets this timer.
    </Alert>
  );
};

export default AutoCloseWarningBanner;

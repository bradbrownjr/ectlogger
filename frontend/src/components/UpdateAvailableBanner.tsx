import React, { useEffect, useState } from 'react';
import { Alert, Button, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { useBuildVersion } from '../hooks/useBuildVersion';

const UpdateAvailableBanner: React.FC = () => {
  const { stale, latestBuildId } = useBuildVersion();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    // If another build ships after a dismissal, show the notice again
    // rather than staying silent because *some* older version was dismissed.
    if (latestBuildId && dismissedFor && latestBuildId !== dismissedFor) {
      setDismissedFor(null);
    }
  }, [latestBuildId, dismissedFor]);

  if (!stale || dismissedFor === latestBuildId) return null;

  // Render directly (no Collapse wrapper) so the Alert stretches to full flex
  // width, matching MaintenanceBanner. variant="filled" for dark-mode contrast.
  // severity="warning" (yellow) marks this as a brief, non-blocking interruption --
  // distinct from MaintenanceBanner's severity="error" (red), which is a blocker.
  return (
    <Alert
      variant="filled"
      severity="warning"
      icon={<SystemUpdateAltIcon fontSize="inherit" />}
      action={
        <>
          <Button
            color="inherit"
            size="small"
            variant="outlined"
            onClick={() => window.location.reload()}
            sx={{ mr: 1 }}
          >
            Reload
          </Button>
          <IconButton
            aria-label="dismiss update notice"
            color="inherit"
            size="small"
            onClick={() => setDismissedFor(latestBuildId)}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </>
      }
      sx={{ borderRadius: 0, '& .MuiAlert-message': { flexGrow: 1 } }}
    >
      A new version of ECTLogger is available. Reload when you have a moment
      -- your check-ins and net data are already saved.
    </Alert>
  );
};

export default UpdateAvailableBanner;

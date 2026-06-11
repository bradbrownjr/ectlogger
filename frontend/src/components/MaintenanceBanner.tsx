import React, { useState, useEffect, useCallback } from 'react';
import { Alert, IconButton, Collapse } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BuildIcon from '@mui/icons-material/Build';
import axios from 'axios';

interface BannerState {
  active: boolean;
  message: string | null;
  dismissible: boolean;
}

// Re-check the banner state every 60 seconds to catch scheduled on/off transitions
// without requiring a page reload.
const POLL_INTERVAL_MS = 60_000;

const MaintenanceBanner: React.FC = () => {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchBanner = useCallback(async () => {
    try {
      // Use plain axios (no auth header) — this is an unauthenticated endpoint
      const res = await axios.get('/api/settings/maintenance-banner');
      setBanner(res.data);
      // If the banner becomes active again (scheduled re-enable), un-dismiss it
      if (res.data.active) {
        setDismissed(false);
      }
    } catch {
      // Fail silently; do not break the app if the endpoint is unreachable
    }
  }, []);

  useEffect(() => {
    fetchBanner();
    const timer = setInterval(fetchBanner, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchBanner]);

  if (!banner?.active || dismissed) return null;

  return (
    <Collapse in>
      <Alert
        severity="warning"
        icon={<BuildIcon fontSize="inherit" />}
        action={
          banner.dismissible ? (
            <IconButton
              aria-label="close maintenance banner"
              color="inherit"
              size="small"
              onClick={() => setDismissed(true)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          ) : undefined
        }
        sx={{ borderRadius: 0, '& .MuiAlert-message': { flexGrow: 1 } }}
      >
        {banner.message || 'Scheduled maintenance is in progress. Some features may be temporarily unavailable.'}
      </Alert>
    </Collapse>
  );
};

export default MaintenanceBanner;

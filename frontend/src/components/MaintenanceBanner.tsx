import React, { useState, useEffect, useCallback } from 'react';
import { Alert, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BuildIcon from '@mui/icons-material/Build';
import axios from 'axios';

interface BannerState {
  active: boolean;
  message: string | null;
  dismissible: boolean;
}

// Poll frequently so enable/disable changes reflect within ~10 seconds without a page reload.
// Scheduled transition windows also fire within this window.
const POLL_INTERVAL_MS = 10_000;

const MaintenanceBanner: React.FC = () => {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchBanner = useCallback(async () => {
    try {
      const res = await axios.get('/api/settings/maintenance-banner');
      setBanner(prev => {
        // When banner transitions from active → inactive, clear dismissed so
        // re-enabling it always shows it again without needing a page reload.
        if (prev?.active && !res.data.active) {
          setDismissed(false);
        }
        // When banner transitions from inactive → active, clear any prior dismiss.
        if (!prev?.active && res.data.active) {
          setDismissed(false);
        }
        return res.data;
      });
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

  // Render directly (no Collapse wrapper) so the Alert stretches to full flex width.
  // variant="filled" gives a solid high-contrast background in both light and dark modes,
  // unlike the standard severity="warning" which is nearly invisible in dark mode.
  return (
    <Alert
      variant="filled"
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
  );
};

export default MaintenanceBanner;

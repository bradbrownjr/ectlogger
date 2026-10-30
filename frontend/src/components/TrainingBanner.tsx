import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Box, Button, Chip, IconButton, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { trainingApi, TrainingSession } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { STORAGE_KEYS } from '../utils/localStorageKeys';
import { formatBannerWhen, isTrainingBannerPage, pickBannerSession } from '../utils/trainingSessions';
import TrainingDialog from './TrainingDialog';

// ========== TRAINING BANNER ==========
// Announces the next training session on the main pages, from a week before it
// starts until it is over. Purple: an announcement, below the red maintenance
// and yellow update banners in urgency (DESIGN.md "Sitewide Alert Banners").
// Fixed colors rather than the theme's, so the meaning holds in every theme;
// each passes 4.5:1 with white text and sits comfortably on its mode's page.
const PURPLE = { light: '#7b1fa2', dark: '#6b3fa0' };

// Re-read the list this often, so a session posted while a tab is open appears.
const REFRESH_MS = 30 * 60 * 1000;

// A signed-out browser's closes. Kept to sessions still listed, so it can't grow.
const readGuestClosed = (): Set<number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRAINING_BANNER_CLOSED);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
};

const writeGuestClosed = (ids: Set<number>) => {
  try {
    localStorage.setItem(STORAGE_KEYS.TRAINING_BANNER_CLOSED, JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the banner just comes back on the next visit.
  }
};

const TrainingBanner: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [guestClosed, setGuestClosed] = useState<Set<number>>(readGuestClosed);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    trainingApi.listForBanner()
      .then((r) => {
        setSessions(r.data);
        setNow(new Date());
        // Forget a guest's closes of sessions that are over
        setGuestClosed((prev) => {
          const listed = new Set(r.data.map((s) => s.id));
          const kept = new Set([...prev].filter((id) => listed.has(id)));
          if (kept.size !== prev.size) writeGuestClosed(kept);
          return kept;
        });
      })
      .catch(() => {});
  }, []);

  // Signing in or out changes which closes apply, so reload then too
  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, isAuthenticated]);

  const session = pickBannerSession(sessions, now, isAuthenticated ? undefined : guestClosed);

  // ========== TRAINING DIALOG ==========
  // Kept mounted outside the page check, so an open dialog survives navigation
  const dialog = (
    <TrainingDialog
      open={dialogOpen}
      onClose={() => {
        setDialogOpen(false);
        load(); // an admin may have changed the sessions from inside it
      }}
    />
  );

  // Main pages only: never inside a net or on a form
  if (!session || !isTrainingBannerPage(location.pathname)) return dialog;

  const dismiss = () => {
    if (isAuthenticated) {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, banner_dismissed: true } : s)));
      trainingApi.dismissBanner(session.id).catch(() => {});
    } else {
      const next = new Set(guestClosed).add(session.id);
      setGuestClosed(next);
      writeGuestClosed(next);
    }
  };

  // In person and Online up front, so nobody has to ask whether it's on Zoom
  const chipSx = { color: 'inherit', borderColor: 'rgba(255,255,255,0.7)', '& .MuiChip-icon': { color: 'inherit' } };

  // Rendered directly, no Collapse (DESIGN.md "Layout — no Collapse wrapper")
  return (
    <>
      <Alert
        variant="filled"
        icon={<SchoolOutlinedIcon fontSize="inherit" />}
        action={
          <>
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={() => setDialogOpen(true)}
              sx={{ mr: 1, whiteSpace: 'nowrap' }}
            >
              More info
            </Button>
            <IconButton aria-label="dismiss training notice" color="inherit" size="small" onClick={dismiss}>
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </>
        }
        sx={{
          borderRadius: 0,
          bgcolor: PURPLE[theme.palette.mode],
          color: '#fff',
          '& .MuiAlert-icon': { color: '#fff' },
          '& .MuiAlert-message': { flexGrow: 1 },
        }}
      >
        <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}>
          <span>
            <strong>Training:</strong> {session.title}, {formatBannerWhen(session.starts_at)}
          </span>
          {session.location && (
            <Chip size="small" variant="outlined" icon={<PlaceOutlinedIcon />} label="In person" sx={chipSx} />
          )}
          {session.has_online_link && (
            <Chip size="small" variant="outlined" icon={<VideocamOutlinedIcon />} label="Online" sx={chipSx} />
          )}
        </Box>
      </Alert>
      {dialog}
    </>
  );
};

export default TrainingBanner;

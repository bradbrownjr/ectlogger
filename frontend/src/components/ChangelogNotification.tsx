import React, { useState, useEffect } from 'react';
import {
  Fab,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  Chip,
  IconButton,
  useTheme,
  alpha,
  keyframes,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';

// Pulse animation for the changelog badge
const pulseAnimation = keyframes`
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
  }
  50% {
    transform: scale(1.2);
    box-shadow: 0 0 0 6px rgba(244, 67, 54, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
  }
`;

// ========== CHANGELOG DATA ==========
// When making user-impacting changes, add an entry here and increment the version.
// The version number triggers the unread notification for users.
// Mark entries with `userImpact: true` to highlight them in the UI.

const CHANGELOG_VERSION = '2026.01.26';

interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    title: string;
    type: 'feature' | 'improvement' | 'bugfix';
    items: {
      text: string;
      userImpact?: boolean;  // Highlight as user-impacting change
    }[];
  }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026.01.26',
    date: 'January 26, 2026',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Announcements / General Traffic - Separate field from net script for listing upcoming events and announcements. Visible to all via megaphone icon. Supports Markdown.', userImpact: true },
          { text: 'Prior Topics Log - Tracks previously used "Topic of the Week" prompts to avoid repetition. View via history icon for template-based nets.', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2026.01.25c',
    date: 'January 25, 2026',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Audio Stream URL - Add Shoutcast/Broadcastify stream links to nets for in-browser listening', userImpact: true },
          { text: 'Unarchive button added directly to the Archived Nets list', userImpact: true },
        ],
      },
      {
        title: 'Bug Fixes',
        type: 'bugfix',
        items: [
          { text: 'Net staff members can now create and start nets (not just rotation members)', userImpact: true },
          { text: 'WebSocket connections now auto-reconnect if disconnected unexpectedly', userImpact: true },
          { text: 'Users can now check out their own check-in (previously only NCS/Logger could)', userImpact: true },
          { text: 'Role assignments (NCS, Logger, Relay) are now logged in chat', userImpact: true },
          { text: 'Improved map PDF export reliability', userImpact: true },
          { text: 'Net closure now immediately updates all connected clients', userImpact: false },
          { text: 'Fixed dead WebSocket connections being kept in memory', userImpact: false },
        ],
      },
    ],
  },
  {
    version: '2025.12.19',
    date: 'December 19, 2025',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Email unsubscribe links in all notification emails', userImpact: true },
          { text: 'Subscription prompt after check-in when a scheduled net closes', userImpact: true },
        ],
      },
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          { text: 'Admin Users list now shows three-tier online status (green/yellow/red)', userImpact: false },
          { text: 'PDF exports now force light mode for better printing', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2025.12.18',
    date: 'December 18, 2025',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Lobby Mode - NCS can start nets early with countdown to official start', userImpact: true },
          { text: 'Unarchive Nets - Restore archived nets to closed status', userImpact: true },
          { text: 'Net Report (PDF) - Comprehensive multi-page PDF reports for closed nets', userImpact: true },
          { text: 'Inline Check-In Editing - Click any row to edit directly', userImpact: true },
          { text: 'Countdown Timer - Shows time until scheduled net start', userImpact: true },
        ],
      },
    ],
  },
];

const ChangelogNotification: React.FC = () => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const lastReadVersion = localStorage.getItem('changelog_last_read_version');
    if (lastReadVersion !== CHANGELOG_VERSION) {
      setHasUnread(true);
    }
  }, []);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    // Mark as read when dialog is closed
    localStorage.setItem('changelog_last_read_version', CHANGELOG_VERSION);
    setHasUnread(false);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'feature':
        return <NewReleasesIcon fontSize="small" sx={{ color: 'success.main' }} />;
      case 'improvement':
        return <BuildIcon fontSize="small" sx={{ color: 'info.main' }} />;
      case 'bugfix':
        return <BugReportIcon fontSize="small" sx={{ color: 'warning.main' }} />;
      default:
        return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'success';
      case 'improvement':
        return 'info';
      case 'bugfix':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <>
      {/* ========== FLOATING ACTION BUTTON ========== */}
      <Fab
        size="small"
        color="primary"
        onClick={handleOpen}
        sx={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 1000,
        }}
        aria-label="What's new"
      >
        <Badge
          color="error"
          variant="dot"
          invisible={!hasUnread}
          sx={{
            '& .MuiBadge-badge': {
              right: -3,
              top: -3,
              animation: hasUnread ? `${pulseAnimation} 1.5s ease-in-out infinite` : 'none',
            },
          }}
        >
          <InfoIcon />
        </Badge>
      </Fab>

      {/* ========== CHANGELOG DIALOG ========== */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { maxHeight: '80vh' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NewReleasesIcon color="primary" />
            <Typography variant="h6">What's New in ECTLogger</Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {CHANGELOG.map((entry, entryIndex) => (
            <Box key={entry.version} sx={{ mb: entryIndex < CHANGELOG.length - 1 ? 3 : 0 }}>
              {/* Version header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {entry.date}
                </Typography>
                <Chip
                  label={`v${entry.version}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
                {entry.version === CHANGELOG_VERSION && hasUnread && (
                  <Chip
                    label="NEW"
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }}
                  />
                )}
              </Box>

              {/* Sections */}
              {entry.sections.map((section, sectionIndex) => (
                <Box key={sectionIndex} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    {getTypeIcon(section.type)}
                    <Typography variant="subtitle2" color={`${getTypeColor(section.type)}.main`}>
                      {section.title}
                    </Typography>
                  </Box>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {section.items.map((item, itemIndex) => (
                      <Box
                        component="li"
                        key={itemIndex}
                        sx={{
                          mb: 0.5,
                          ...(item.userImpact && {
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            borderRadius: 1,
                            mx: -1,
                            px: 1,
                            py: 0.25,
                          }),
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            ...(item.userImpact && { fontWeight: 500 }),
                          }}
                        >
                          {item.text}
                          {item.userImpact && (
                            <Chip
                              label="User Impact"
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ ml: 1, height: 16, fontSize: '0.6rem' }}
                            />
                          )}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}

              {entryIndex < CHANGELOG.length - 1 && <Divider sx={{ mt: 2 }} />}
            </Box>
          ))}

          {/* Link to full changelog */}
          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" align="center">
              For the complete changelog, see{' '}
              <a
                href="https://github.com/bradbrownjr/ectlogger/blob/main/docs/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.palette.primary.main }}
              >
                docs/CHANGELOG.md
              </a>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} variant="contained">
            Got it!
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ChangelogNotification;

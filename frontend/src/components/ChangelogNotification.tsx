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
import { useAuth } from '../contexts/AuthContext';

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

const CHANGELOG_VERSION = '2026.02.26b';

interface ChangelogEntry {
  version: string;
  date: string; // ISO date string: "YYYY-MM-DD"
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
    version: '2026.02.26b',
    date: '2026-02-26',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Check-In Map on the Statistics page — shows a geographic map of approximate regions where check-ins have originated (by grid square or state/province), without revealing individual locations.', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2026.02.26',
    date: '2026-02-26',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Callsign auto-fill now uses contacts directory — when NCS enters a callsign, name, location, and SKYWARN number are auto-filled from the user\'s account or from prior check-in history. Fields remain editable.', userImpact: true },
          { text: 'Admin Contacts tab — manage station contacts, fix misspelled names, add emails, and send invites to create user accounts.', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2026.02.23c',
    date: '2026-02-23',
    sections: [
      {
        title: 'Bug Fixes',
        type: 'bugfix',
        items: [
          { text: 'Check-in location map now plots all stations, including those that checked out during the net — checked-out stations still participated and are shown.', userImpact: true },
          { text: 'Location parser now recognizes full state names (e.g., "Skowhegan Maine") in addition to abbreviations, so more check-in locations are mapped correctly.', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2026.02.23b',
    date: '2026-02-23',
    sections: [
      {
        title: 'Improvements',
        type: 'improvement',
        items: [
          { text: 'Browser autocomplete disabled on the Name field in check-in forms — prevents browsers from overwriting the platform\'s own callsign-based name lookup with saved personal data.', userImpact: true },
          { text: 'What\'s New dialog now shows the correct local date for changelog entries regardless of timezone. Same-day releases are merged into a single section.', userImpact: false },
        ],
      },
    ],
  },
  {
    version: '2026.02.23',
    date: '2026-02-23',
    sections: [
      {
        title: 'Bug Fixes',
        type: 'bugfix',
        items: [
          { text: 'Logger role now works correctly — loggers can change check-in statuses and use the check-in entry form. Previously, only NCS and above could perform these actions due to a role-name mismatch.', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2026.02.19',
    date: '2026-02-19',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Dual-map view in PDF Report — when check-ins are geographically clustered with a few outliers at a significant distance, the report now shows two side-by-side maps: a zoomed cluster view and a full overview, so neither is lost.', userImpact: true },
          { text: 'Check-in location map on the Net Statistics page — fills the empty space next to the status chart with a map showing all check-in locations for that net.', userImpact: true },
          { text: 'Check-in Pace chart on the Net Statistics page — shows cumulative arrivals over time so you can see at a glance whether stations checked in quickly or trickled in throughout the net.', userImpact: true },
        ],
      },
      {
        title: 'Bug Fixes',
        type: 'bugfix',
        items: [
          { text: 'Check-in now works in LOBBY mode — stations can check in as soon as the NCS opens the lobby before the official start time.', userImpact: true },
          { text: 'Check-in errors now show as in-app notifications instead of browser alert pop-ups, with the actual error detail from the server.', userImpact: true },
          { text: 'Map zoom no longer snaps back to show all stations when the check-in list updates. Your zoom level and pan position are now preserved after the initial auto-fit.', userImpact: true },
        ],
      },
    ],
  },
  {
    version: '2026.01.25f',
    date: '2026-01-25',
    sections: [
      {
        title: 'New Features',
        type: 'feature',
        items: [
          { text: 'Per-user Chat System Messages Toggle — users can now hide or show system (activity) messages from the chat via a toolbar icon (left of the pop-out button). Preference is saved to your profile and persists across sessions.', userImpact: true },
          { text: 'Announcements / General Traffic - Separate field from net script for listing upcoming events and announcements. Visible to all via megaphone icon. Supports Markdown.', userImpact: true },
          { text: 'Prior Topics Log - Tracks previously used "Topic of the Week" prompts to avoid repetition. View via history icon for template-based nets.', userImpact: true },
          { text: 'Audio Stream URL - Add Shoutcast/Broadcastify stream links to nets for in-browser listening', userImpact: true },
          { text: 'Unarchive button added directly to the Archived Nets list', userImpact: true },
          { text: 'In-App Changelog floating button (Whats New) with unread indicator', userImpact: true },
          { text: 'Consistent Action Button Colors - All buttons now use consistent colors throughout the UI (blue for view/search, purple for people/staff, orange for stats, green for exports, teal for ICS-309, red for delete/close) making them easier to find', userImpact: true },
        ],
      },
      {
        title: 'Bug Fixes & Improvements',
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
    date: '2025-12-19',
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
    date: '2025-12-18',
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
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // Format an ISO date string ("YYYY-MM-DD") respecting the user's UTC preference.
  // Parsed at noon UTC to avoid date-boundary shifts in any timezone.
  // Format a changelog ISO date ("YYYY-MM-DD") as a readable label.
  // Dates are stored as the author's local calendar date, not a UTC timestamp.
  // Using the multi-arg Date constructor avoids any UTC-offset day shift.
  const formatChangelogDate = (isoDate: string): string => {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Group same-date entries so they appear as a single block in the dialog.
  // CHANGELOG is ordered newest-first; we preserve that order within each group.
  // Sections with the same type on the same date are merged into one section.
  const groupedEntries: { date: string; versions: string[]; sections: ChangelogEntry['sections'] }[] = [];
  for (const entry of CHANGELOG) {
    const last = groupedEntries[groupedEntries.length - 1];
    if (last && last.date === entry.date) {
      last.versions.push(entry.version);
      // Merge into existing section of the same type, or append as a new section
      for (const newSection of entry.sections) {
        const existing = last.sections.find(s => s.type === newSection.type);
        if (existing) {
          existing.items = [...existing.items, ...newSection.items];
        } else {
          last.sections.push({ ...newSection });
        }
      }
    } else {
      groupedEntries.push({ date: entry.date, versions: [entry.version], sections: entry.sections.map(s => ({ ...s, items: [...s.items] })) });
    }
  }

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
          {/* Render one block per calendar day; same-day versions are merged into one heading */}
          {groupedEntries.map((group, groupIndex) => (
            <Box key={group.date} sx={{ mb: groupIndex < groupedEntries.length - 1 ? 3 : 0 }}>
              {/* Date + version chip(s) header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {formatChangelogDate(group.date)}
                </Typography>
                {/* Show a chip for each version in this day-group */}
                {group.versions.map((v) => (
                  <Chip
                    key={v}
                    label={`v${v}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                ))}
                {group.versions.includes(CHANGELOG_VERSION) && hasUnread && (
                  <Chip
                    label="NEW"
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }}
                  />
                )}
              </Box>

              {/* All sections for this date group */}
              {group.sections.map((section, sectionIndex) => (
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
                          sx={{ ...(item.userImpact && { fontWeight: 500 }) }}
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

              {groupIndex < groupedEntries.length - 1 && <Divider sx={{ mt: 2 }} />}
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

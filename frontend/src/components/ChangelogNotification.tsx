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
  Tooltip,
  useTheme,
  alpha,
  keyframes,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';
import DescriptionIcon from '@mui/icons-material/Description';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import changelogData from '../changelog.json';

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

// Sparkle animation for the Subscribe button when the user is NOT yet
// subscribed — gently rotates the AutoAwesome icon and brightens the text
// to draw the eye without being annoying.
const sparkleAnimation = keyframes`
  0%, 100% { transform: rotate(0deg) scale(1); opacity: 1; }
  50% { transform: rotate(15deg) scale(1.15); opacity: 0.85; }
`;
// ========== CHANGELOG DATA ==========
// The canonical changelog lives in frontend/src/changelog.json so the
// in-app dialog AND the backend "What's New" digest email both render
// the same content. Update changelog.json (bump "version" and prepend
// a new entry) when you ship a user-impacting change.

interface ChangelogItem {
  text: string;
  userImpact?: boolean;
  importance?: 'critical' | 'high' | 'medium' | 'low';
}

type ChangelogSectionType = 'feature' | 'improvement' | 'bugfix' | 'fix';

interface ChangelogSection {
  title: string;
  type: ChangelogSectionType;
  items: ChangelogItem[];
}

interface ChangelogEntry {
  version: string;
  date: string; // ISO date string: "YYYY-MM-DD"
  sections: ChangelogSection[];
}

const CHANGELOG_VERSION: string = (changelogData as { version: string }).version;
const CHANGELOG: ChangelogEntry[] = (changelogData as { entries: ChangelogEntry[] }).entries;

const SECTION_PRIORITY: Record<'feature' | 'fix' | 'improvement', number> = {
  feature: 0,
  improvement: 1,
  fix: 2,
};

const IMPORTANCE_PRIORITY: Record<'critical' | 'high' | 'medium' | 'low', number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const normalizeSectionType = (type: ChangelogSectionType): 'feature' | 'fix' | 'improvement' => {
  if (type === 'bugfix') return 'fix';
  return type;
};

const sortItemsForSection = (section: ChangelogSection): ChangelogItem[] => {
  const normalizedType = normalizeSectionType(section.type);
  if (normalizedType !== 'fix') {
    return section.items;
  }

  return section.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aImportance = IMPORTANCE_PRIORITY[a.item.importance ?? 'medium'];
      const bImportance = IMPORTANCE_PRIORITY[b.item.importance ?? 'medium'];
      if (aImportance !== bImportance) {
        return aImportance - bImportance;
      }

      const aImpact = a.item.userImpact ? 0 : 1;
      const bImpact = b.item.userImpact ? 0 : 1;
      if (aImpact !== bImpact) {
        return aImpact - bImpact;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
};

const getOrderedSections = (sections: ChangelogSection[]): ChangelogSection[] => {
  return sections
    .map((section, index) => ({
      section: {
        ...section,
        items: sortItemsForSection(section),
      },
      index,
    }))
    .sort((a, b) => {
      const aPriority = SECTION_PRIORITY[normalizeSectionType(a.section.type)];
      const bPriority = SECTION_PRIORITY[normalizeSectionType(b.section.type)];
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.index - b.index;
    })
    .map(({ section }) => section);
};

const EMOJI_REGEX = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
const TWEMOJI_BASE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72';
const emojiImageCache = new Map<string, string | null>();

const toTwemojiCodepoint = (emoji: string): string => {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0))
    .filter((cp): cp is number => cp !== undefined && cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join('-');
};

const loadEmojiDataUrl = async (emoji: string): Promise<string | null> => {
  if (emojiImageCache.has(emoji)) {
    return emojiImageCache.get(emoji) ?? null;
  }

  try {
    const codepoint = toTwemojiCodepoint(emoji);
    if (!codepoint) {
      emojiImageCache.set(emoji, null);
      return null;
    }

    const response = await fetch(`${TWEMOJI_BASE_URL}/${codepoint}.png`);
    if (!response.ok) {
      emojiImageCache.set(emoji, null);
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert emoji image to data URL'));
      reader.readAsDataURL(blob);
    });

    emojiImageCache.set(emoji, dataUrl);
    return dataUrl;
  } catch {
    emojiImageCache.set(emoji, null);
    return null;
  }
};

const splitByEmoji = (input: string): Array<{ type: 'text' | 'emoji'; value: string }> => {
  const parts: Array<{ type: 'text' | 'emoji'; value: string }> = [];
  let lastIndex = 0;

  for (const match of input.matchAll(EMOJI_REGEX)) {
    const start = match.index ?? 0;
    const value = match[0];
    if (start > lastIndex) {
      parts.push({ type: 'text', value: input.slice(lastIndex, start) });
    }
    parts.push({ type: 'emoji', value });
    lastIndex = start + value.length;
  }

  if (lastIndex < input.length) {
    parts.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return parts;
};

const tokenizeLineForWrap = (input: string): Array<{ type: 'text' | 'emoji'; value: string }> => {
  const tokens: Array<{ type: 'text' | 'emoji'; value: string }> = [];
  for (const part of splitByEmoji(input)) {
    if (part.type === 'emoji') {
      tokens.push(part);
      continue;
    }

    const textTokens = part.value.match(/\S+|\s+/g) || [];
    for (const t of textTokens) {
      tokens.push({ type: 'text', value: t });
    }
  }
  return tokens;
};

const measureTokenWidth = (
  pdf: jsPDF,
  token: { type: 'text' | 'emoji'; value: string },
  emojiWidthPt: number,
): number => {
  if (token.type === 'emoji') {
    return emojiWidthPt;
  }
  return pdf.getTextWidth(token.value);
};

const wrapEmojiAwareLine = (
  pdf: jsPDF,
  text: string,
  maxWidth: number,
  emojiWidthPt: number,
): Array<Array<{ type: 'text' | 'emoji'; value: string }>> => {
  const tokens = tokenizeLineForWrap(text);
  const lines: Array<Array<{ type: 'text' | 'emoji'; value: string }>> = [];
  let currentLine: Array<{ type: 'text' | 'emoji'; value: string }> = [];
  let currentWidth = 0;

  for (const token of tokens) {
    const tokenWidth = measureTokenWidth(pdf, token, emojiWidthPt);
    const isLeadingWhitespace = token.type === 'text' && token.value.trim() === '' && currentLine.length === 0;
    if (isLeadingWhitespace) {
      continue;
    }

    if (currentWidth + tokenWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
      if (token.type === 'text' && token.value.trim() === '') {
        continue;
      }
    }

    currentLine.push(token);
    currentWidth += tokenWidth;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [[{ type: 'text', value: '' }]];
};

const renderEmojiAwareLine = async (
  pdf: jsPDF,
  line: Array<{ type: 'text' | 'emoji'; value: string }>,
  x: number,
  y: number,
  emojiWidthPt: number,
): Promise<void> => {
  let cursorX = x;
  const emojiYOffset = 8;

  for (const token of line) {
    if (token.type === 'text') {
      if (token.value) {
        pdf.text(token.value, cursorX, y);
        cursorX += pdf.getTextWidth(token.value);
      }
      continue;
    }

    const emojiDataUrl = await loadEmojiDataUrl(token.value);
    if (emojiDataUrl) {
      pdf.addImage(emojiDataUrl, 'PNG', cursorX, y - emojiYOffset, emojiWidthPt, emojiWidthPt);
      cursorX += emojiWidthPt;
    } else {
      pdf.text(token.value, cursorX, y);
      cursorX += pdf.getTextWidth(token.value);
    }
  }
};


const ChangelogNotification: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  // ========== "What's New" subscription state ==========
  // Mirrors user.notify_whats_new locally so the Subscribe button can
  // give immediate feedback after PUT /users/me succeeds.
  const [subscribed, setSubscribed] = useState<boolean>(!!user?.notify_whats_new);
  const [subscribeBusy, setSubscribeBusy] = useState(false);

  useEffect(() => {
    setSubscribed(!!user?.notify_whats_new);
  }, [user?.notify_whats_new]);

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
  // CHANGELOG is ordered newest-first; we preserve section boundaries so
  // unrelated same-type sections never get blended together.
  const groupedEntries: { date: string; versions: string[]; sections: ChangelogEntry['sections'] }[] = [];
  for (const entry of CHANGELOG) {
    const last = groupedEntries[groupedEntries.length - 1];
    if (last && last.date === entry.date) {
      last.versions.push(entry.version);
      last.sections.push(...entry.sections.map(s => ({ ...s, items: [...s.items] })));
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

  // ========== "What's New" subscription toggle ==========
  // Single click flips notify_whats_new on the user profile via PUT /users/me.
  // Hidden entirely when the user isn't authenticated (handled in render).
  const handleToggleSubscribe = async () => {
    if (!user || subscribeBusy) return;
    const next = !subscribed;
    setSubscribeBusy(true);
    try {
      // Auto-capture the browser's IANA timezone the first time the user
      // subscribes so the daily 8 AM digest fires in their local time
      // instead of the PST fallback. Safe to send every time; backend just
      // overwrites with the latest detected zone.
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api.put('/users/me', {
        notify_whats_new: next,
        ...(browserTz ? { timezone: browserTz } : {}),
      });
      setSubscribed(next);
    } catch (err) {
      console.error('Failed to update What\'s New subscription:', err);
    } finally {
      setSubscribeBusy(false);
    }
  };

  // ========== PDF EXPORT ==========
  // Render the changelog as a text-native PDF (selectable text, small file
  // size — same approach the net report PDF uses post-2026.03.12). One-shot
  // helper builds a doc from a list of grouped entries; callers pass either
  // just the latest day's group or the entire grouped list.
  const buildChangelogPdf = async (
    groups: { date: string; versions: string[]; sections: ChangelogSection[] }[],
    title: string,
  ): Promise<jsPDF> => {
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureRoom = (needed: number) => {
      if (y + needed > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(title, margin, y);
    y += 22;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    pdf.text(`Generated ${new Date().toLocaleString()}`, margin, y);
    y += 18;
    pdf.setTextColor(0);

    const typeLabel: Record<string, string> = {
      feature: 'New Features',
      improvement: 'Improvements',
      fix: 'Bug Fixes',
      bugfix: 'Bug Fixes',
    };

    for (const group of groups) {
      ensureRoom(40);
      // Date heading
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text(formatChangelogDate(group.date), margin, y);
      y += 16;
      // Version chip(s)
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(group.versions.map(v => `v${v}`).join('  ·  '), margin, y);
      y += 14;
      pdf.setTextColor(0);

      const orderedSections = getOrderedSections(group.sections);
      for (const section of orderedSections) {
        ensureRoom(28);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(`${typeLabel[section.type] || section.title}: ${section.title}`, margin, y);
        y += 14;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        for (const item of section.items) {
          const bullet = '\u2022 ';
          const emojiWidthPt = 10;
          const lineHeightPt = 12;
          const wrappedLines = wrapEmojiAwareLine(pdf, bullet + item.text, contentWidth - 12, emojiWidthPt);
          ensureRoom(wrappedLines.length * lineHeightPt + 4);
          for (const line of wrappedLines) {
            await renderEmojiAwareLine(pdf, line, margin + 6, y, emojiWidthPt);
            y += lineHeightPt;
          }
          y += 2;
        }
        y += 6;
      }
      y += 8;
    }
    return pdf;
  };

  const handleDownloadLatest = async () => {
    // Latest = the newest day-group (groupedEntries[0]).
    if (!groupedEntries.length) return;
    const latest = groupedEntries[0];
    const pdf = await buildChangelogPdf(
      [latest],
      `What's New in ECTLogger — ${formatChangelogDate(latest.date)}`,
    );
    pdf.save(`ECTLogger_WhatsNew_${latest.date}.pdf`);
  };

  const handleDownloadAll = async () => {
    const pdf = await buildChangelogPdf(groupedEntries, 'ECTLogger Changelog');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    pdf.save(`ECTLogger_Changelog_${today}.pdf`);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'feature':
        return <NewReleasesIcon fontSize="small" sx={{ color: 'success.main' }} />;
      case 'improvement':
        return <BuildIcon fontSize="small" sx={{ color: 'info.main' }} />;
      case 'fix':
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
      case 'fix':
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
              {getOrderedSections(group.sections).map((section, sectionIndex) => (
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
        <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
          {/* ========== LEFT GROUP: PDF download icon buttons ========== */}
          {/* Single page = latest day's changelog. Open book = entire changelog. */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Download latest version's changelog (PDF)">
              <IconButton onClick={handleDownloadLatest} size="small" color="primary" aria-label="Download latest changelog as PDF">
                <DescriptionIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download entire changelog (PDF)">
              <IconButton onClick={handleDownloadAll} size="small" color="primary" aria-label="Download entire changelog as PDF">
                <MenuBookIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* ========== RIGHT GROUP: Subscribe + close ========== */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {/* Subscribe button — only shown when authenticated. Sparkles when
                NOT yet subscribed to draw the eye, calmly green when active. */}
            {user && (
              <Tooltip
                title={
                  subscribed
                    ? "You're subscribed to the daily What's New digest. Click to unsubscribe."
                    : "Get a daily 8 AM email summarizing each day's new features and fixes."
                }
              >
                <span>
                  <Button
                    onClick={handleToggleSubscribe}
                    disabled={subscribeBusy}
                    variant={subscribed ? 'contained' : 'outlined'}
                    color={subscribed ? 'success' : 'primary'}
                    size="small"
                    startIcon={
                      <AutoAwesomeIcon
                        fontSize="small"
                        sx={{
                          animation: !subscribed
                            ? `${sparkleAnimation} 2s ease-in-out infinite`
                            : 'none',
                        }}
                      />
                    }
                  >
                    {subscribed ? 'Subscribed' : 'Subscribe'}
                  </Button>
                </span>
              </Tooltip>
            )}
            <Button onClick={handleClose} variant="contained">
              Got it!
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ChangelogNotification;

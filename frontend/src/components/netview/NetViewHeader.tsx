import React, { useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  useMediaQuery,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Popover,
} from '@mui/material';
import { keyframes } from '@mui/system';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import MapIcon from '@mui/icons-material/Map';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import BarChartIcon from '@mui/icons-material/BarChart';
import FastForwardIcon from '@mui/icons-material/FastForward';
import SearchIcon from '@mui/icons-material/Search';
import PanToolIcon from '@mui/icons-material/PanTool';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';
import CampaignIcon from '@mui/icons-material/Campaign';
import SpeakerNotesIcon from '@mui/icons-material/SpeakerNotes';
import HistoryIcon from '@mui/icons-material/History';
import GroupIcon from '@mui/icons-material/Group';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import LanguageIcon from '@mui/icons-material/Language';
import InfoIcon from '@mui/icons-material/Info';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TimerIcon from '@mui/icons-material/Timer';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import type { UseDialogResult } from '../../hooks/useDialog';

// ========== NET VIEW HEADER ==========
// Title row (name, description, status/stat/frequency chips) plus a full-width
// command bar toolbar below it. Purely presentational — the parent owns all
// state, derived flags, and handlers. See docs/DESIGN.md "Net View Toolbar"
// for the full layout spec (approved direction 3a).
//
// The command bar's collapse behavior is driven by the bar's actual measured
// width (ResizeObserver), not fixed viewport breakpoints — nothing is ever
// pinned to the More menu just because a breakpoint says so. Every item
// carries a `priority`; when the bar doesn't fit, the lowest-priority items
// lose their label first, then (if still short on room) move into the More
// menu, lowest-priority first, until what remains fits.

type NcsColor = { bg: string; border: string; text: string } | null;

const pulseAnimationGreen = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(46, 125, 50, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(46, 125, 50, 0); }
  100% { box-shadow: 0 0 0 0 rgba(46, 125, 50, 0); }
`;

const shimmerYellow = keyframes`
  0% { background-color: rgba(255, 193, 7, 0.3); }
  50% { background-color: rgba(255, 193, 7, 0.7); }
  100% { background-color: rgba(255, 193, 7, 0.3); }
`;

// Command bar button geometry/colors — matches the approved design handoff
// (design_handoff_netview_toolbar, option 3a): borderless "application
// toolbar" buttons flush against each other so labelled controls read as
// one calm strip instead of a wall of separate cards.
// 'primary' follows the active named color theme (theme.palette.primary.main)
// so the "active" tone always matches whichever theme the viewer selected;
// 'warning'/'success' are fixed semantic hues, unrelated to brand identity,
// so they stay literal. See DESIGN.md "Multi-theme compliance".
const getActiveToneColors = (primaryMain: string): Record<'primary' | 'warning' | 'success', { border: string; background: string; hoverBackground: string }> => ({
  primary: { border: primaryMain, background: alpha(primaryMain, 0.12), hoverBackground: alpha(primaryMain, 0.24) },
  warning: { border: '#ed6c02', background: 'rgba(237,108,2,0.12)', hoverBackground: 'rgba(237,108,2,0.24)' },
  success: { border: '#2e7d32', background: 'rgba(46,125,50,0.14)', hoverBackground: 'rgba(46,125,50,0.28)' },
});

const flushBtnSx = (
  comfortable: boolean,
  iconOnly: boolean,
  isDarkMode: boolean,
  primaryMain: string,
  opts: { emphasis?: boolean; active?: boolean; activeTone?: 'primary' | 'warning' | 'success' } = {}
) => {
  const activeToneColors = getActiveToneColors(primaryMain);
  return {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: iconOnly ? 0 : '5px',
  flex: '0 0 auto',
  minWidth: 0,
  height: comfortable ? 30 : 26,
  padding: iconOnly ? '0 6px' : '0 7px',
  borderRadius: '3px',
  border: '1px solid',
  borderColor: opts.active ? activeToneColors[opts.activeTone ?? 'primary'].border : 'transparent',
  backgroundColor: opts.active ? activeToneColors[opts.activeTone ?? 'primary'].background : 'transparent',
  color: opts.emphasis ? (isDarkMode ? '#f28b82' : '#c62828') : (isDarkMode ? '#e8eaed' : '#25282c'),
  fontWeight: opts.emphasis ? 500 : 400,
  fontSize: comfortable ? 13 : 12,
  lineHeight: 1,
  textTransform: 'none' as const,
  letterSpacing: '.01em',
  whiteSpace: 'nowrap' as const,
  '&:hover': opts.active
    ? {
        backgroundColor: activeToneColors[opts.activeTone ?? 'primary'].hoverBackground,
        borderColor: activeToneColors[opts.activeTone ?? 'primary'].border,
      }
    : {
        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#e6e9ec',
        borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : '#d3d7dc',
      },
  '&.Mui-disabled': {
    opacity: 0.4,
  },
  };
};

// Collapse priority: 4 = never loses its label and never overflows (the
// single primary status CTA for whatever state the net is in right now).
// 1 = first to lose its label, first to move into the More menu.
type Priority = 1 | 2 | 3 | 4;
type ItemMode = 'label' | 'icon' | 'overflow';

interface ToolbarItemDef {
  key: string;
  visible: boolean;
  group: 'info' | 'management';
  priority: Priority;
  Icon: React.ComponentType<any>;
  color: string;
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeTone?: 'primary' | 'warning' | 'success';
  emphasis?: boolean;
  extraSx?: object;
  // Start net needs a loading spinner in place of its icon.
  iconOverride?: React.ReactNode;
}

interface NetViewHeaderProps {
  net: any;
  netId: string | undefined;
  canManage: boolean;
  canManageCheckIns: boolean | undefined;
  canStartNet: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isAssignedNCS: boolean;
  isNCS: boolean;
  hasNCS: boolean;
  otherActiveNCSExists: boolean;
  user: any;
  userNetRole: any;
  userActiveCheckIn: any;
  netStats: any;
  countdownTime: string | null;
  lobbyOpensCountdown: string | null;
  durationTime: string | null;
  checkInsCount: number;
  searchQuery: string;
  filteredFrequencyIds: number[];
  setFilteredFrequencyIds: React.Dispatch<React.SetStateAction<number[]>>;
  startingNet: boolean;
  highlightStartNet: boolean;
  highlightCheckIn: boolean;
  needsTopicPollConfig: () => boolean | undefined;

  getNcsColor: (userId: number) => NcsColor;
  getNcsColorForFrequency: (frequencyId: number) => NcsColor;
  getNcsForFrequency: (frequencyId: number) => string | null;
  onFrequencyChipClick: (frequencyId: number, event: React.MouseEvent) => void;

  // Dialogs opened directly with no pre-processing
  bulkCheckIn: UseDialogResult;
  search: UseDialogResult;
  map: UseDialogResult;
  script: UseDialogResult;
  scheduleAnnouncements: UseDialogResult;
  announcements: UseDialogResult;
  topicHistory: UseDialogResult;
  importDialog: UseDialogResult;
  closeNetDialog: UseDialogResult;

  // Actions requiring parent-owned pre-processing or API calls
  onOpenTopicPollConfig: () => void;
  onOpenRoleDialog: () => void;
  onOpenCheckIn: () => void;
  onStartNetClick: () => void;
  onClaimNCS: () => void;
  onToggleHand: (checkInId: number) => void;
  onStatusChange: (checkInId: number, newStatus: string) => void;
  onToggleNCSRole: () => void;
  onCheckOut: () => void;
  onGoLive: () => void;
  onExportCSV: () => void;
  onExportICS309: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}

// Given real measured widths for each visible item (plus chrome: divider,
// container padding, the More button), figure out how many can stay fully
// labelled, which get squeezed to icon-only, and which have to move into
// the More menu — in that order, lowest-priority items degrading first —
// until everything fits inside `containerWidth`. Pure function so it's easy
// to reason about independent of React's render cycle.
function computeLayout(
  items: ToolbarItemDef[],
  widths: Record<string, { label: number; icon: number }>,
  containerWidth: number,
  dividerWidth: number,
  moreIconWidth: number,
  showDivider: boolean
): Map<string, ItemMode> {
  const GAP = 1;
  const CONTAINER_PADDING = 16;
  const modes = new Map<string, ItemMode>();
  items.forEach(i => modes.set(i.key, 'label'));

  const total = () => {
    const inline = items.filter(i => modes.get(i.key) !== 'overflow');
    const anyOverflow = items.some(i => modes.get(i.key) === 'overflow');
    let w = CONTAINER_PADDING;
    inline.forEach(i => {
      const mode = modes.get(i.key);
      const measured = widths[i.key];
      w += measured ? (mode === 'label' ? measured.label : measured.icon) : 0;
    });
    if (showDivider) w += dividerWidth;
    if (anyOverflow) w += moreIconWidth;
    const slots = inline.length + (anyOverflow ? 1 : 0);
    w += Math.max(0, slots - 1) * GAP;
    return w;
  };

  if (total() <= containerWidth) return modes;

  const collapsible = items.filter(i => i.priority < 4).sort((a, b) => a.priority - b.priority);

  for (const item of collapsible) {
    if (total() <= containerWidth) break;
    modes.set(item.key, 'icon');
  }
  if (total() <= containerWidth) return modes;

  for (const item of collapsible) {
    if (total() <= containerWidth) break;
    modes.set(item.key, 'overflow');
  }
  return modes;
}

const NetViewHeader: React.FC<NetViewHeaderProps> = ({
  net,
  netId,
  canManage,
  canManageCheckIns,
  canStartNet,
  isAdmin,
  isAuthenticated,
  isAssignedNCS,
  isNCS,
  hasNCS,
  otherActiveNCSExists,
  user,
  userNetRole,
  userActiveCheckIn,
  netStats,
  countdownTime,
  lobbyOpensCountdown,
  durationTime,
  checkInsCount,
  searchQuery,
  filteredFrequencyIds,
  setFilteredFrequencyIds,
  startingNet,
  highlightStartNet,
  highlightCheckIn,
  needsTopicPollConfig,
  getNcsColor,
  getNcsColorForFrequency,
  getNcsForFrequency,
  onFrequencyChipClick,
  bulkCheckIn,
  search,
  map,
  script,
  scheduleAnnouncements,
  announcements,
  topicHistory,
  importDialog,
  closeNetDialog,
  onOpenTopicPollConfig,
  onOpenRoleDialog,
  onOpenCheckIn,
  onStartNetClick,
  onClaimNCS,
  onToggleHand,
  onStatusChange,
  onToggleNCSRole,
  onCheckOut,
  onGoLive,
  onExportCSV,
  onExportICS309,
  onArchive,
  onUnarchive,
  onDelete,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [descriptionAnchorEl, setDescriptionAnchorEl] = useState<HTMLElement | null>(null);
  const descriptionExpanded = !!descriptionAnchorEl;
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);
  const [stepAwayConfirmOpen, setStepAwayConfirmOpen] = useState(false);

  // Touch-target sizing only (26px dense vs 30px comfortable) — unrelated to
  // the content-driven collapse logic below, which reacts to the bar's own
  // measured width rather than a viewport breakpoint.
  const comfortable = !useMediaQuery('(min-width:600px)');

  const isActiveOrLobby = net.status === 'active' || net.status === 'lobby';
  const isDraftOrScheduled = net.status === 'draft' || net.status === 'scheduled';
  const isClosedOrArchived = net.status === 'closed' || net.status === 'archived';

  const startingUpNet = canStartNet && isDraftOrScheduled;

  // Neutral (non-brand-colored) toolbar icon color — the dark-mode value
  // must be light enough to read against the dark command bar background.
  const neutralIconColor = isDarkMode ? '#b0b7c0' : '#4a4f55';

  // ===== INFO GROUP (read / view actions) =====
  const infoItems: ToolbarItemDef[] = [
    {
      key: 'bulk', group: 'info', priority: 3,
      visible: isActiveOrLobby && checkInsCount > 0 && !!canManageCheckIns,
      Icon: FastForwardIcon, color: theme.palette.primary.main, label: 'Bulk add',
      tooltip: 'Bulk add multiple check-ins', onClick: () => bulkCheckIn.onOpen(),
    },
    {
      key: 'search', group: 'info', priority: 3,
      visible: checkInsCount > 0,
      Icon: SearchIcon, color: theme.palette.primary.main, label: 'Search',
      tooltip: 'Search check-ins', onClick: () => search.onOpen(),
      active: !!searchQuery, activeTone: 'primary',
    },
    {
      key: 'map', group: 'info', priority: 3,
      visible: checkInsCount > 0,
      Icon: MapIcon, color: theme.palette.primary.main, label: 'Map',
      tooltip: 'View check-in locations on map', onClick: map.onOpen,
    },
    {
      key: 'audio', group: 'info', priority: 1,
      visible: checkInsCount > 0 && !!net.stream_url,
      Icon: VolumeUpIcon, color: '#9c27b0', label: 'Audio',
      tooltip: 'Listen to net audio', onClick: () => window.open(net.stream_url, '_blank'),
    },
    {
      key: 'script', group: 'info', priority: 2,
      visible: checkInsCount > 0 && !!net.script,
      Icon: ArticleIcon, color: neutralIconColor, label: 'Script',
      tooltip: 'View net script', onClick: () => script.onOpen(),
    },
    {
      key: 'schedule-announcements', group: 'info', priority: 2,
      visible: checkInsCount > 0 && !!net.template_id,
      Icon: CampaignIcon, color: neutralIconColor, label: 'Announcements',
      tooltip: 'View schedule announcements', onClick: () => scheduleAnnouncements.onOpen(),
    },
    {
      key: 'notes', group: 'info', priority: 2,
      visible: checkInsCount > 0 && !!net.announcements,
      Icon: SpeakerNotesIcon, color: neutralIconColor, label: 'Notes',
      tooltip: 'View net notes', onClick: () => announcements.onOpen(),
    },
    {
      key: 'topics', group: 'info', priority: 2,
      visible: checkInsCount > 0 && !!net.template_id,
      Icon: HistoryIcon, color: neutralIconColor, label: 'Topics',
      tooltip: 'View prior topics', onClick: () => topicHistory.onOpen(),
    },
    {
      key: 'stats', group: 'info', priority: 3,
      visible: checkInsCount > 0,
      Icon: BarChartIcon, color: '#ed6c02', label: 'Stats',
      tooltip: 'Net statistics', onClick: () => navigate(`/statistics/nets/${netId}`),
    },
    {
      key: 'website', group: 'info', priority: 1,
      visible: !!net.info_url,
      Icon: LanguageIcon, color: theme.palette.primary.main, label: 'Website',
      tooltip: 'Net/Club info', onClick: () => window.open(net.info_url, '_blank'),
    },
    {
      // Staff-only: this is a read-only render of the net's configuration
      // form (rotation, custom fields, ICS-309 settings, etc.) — not
      // appropriate for standard/guest visitors, and redundant with
      // Edit net while that's available (active/lobby/draft/scheduled).
      key: 'net-info', group: 'info', priority: 1,
      visible: canManage && !isActiveOrLobby,
      Icon: InfoIcon, color: theme.palette.primary.main, label: 'Net info',
      tooltip: 'View net info', onClick: () => navigate(`/nets/${netId}/info`),
    },
    {
      key: 'import', group: 'info', priority: 1,
      visible: canManage && (isActiveOrLobby || isClosedOrArchived),
      Icon: UploadFileIcon, color: '#2e7d32', label: 'Import',
      tooltip: 'Import check-ins from CSV', onClick: importDialog.onOpen,
    },
  ];

  // ===== MANAGEMENT GROUP (state / participation-changing actions) =====
  const managementItems: ToolbarItemDef[] = [
    {
      key: 'start-net', group: 'management', priority: 4,
      visible: startingUpNet,
      Icon: PlayArrowIcon, color: '#2e7d32', label: 'Start net',
      tooltip: 'Start the net', onClick: onStartNetClick,
      disabled: startingNet,
      iconOverride: startingNet ? <CircularProgress size={16} sx={{ color: '#2e7d32' }} /> : undefined,
      extraSx: highlightStartNet ? { animation: `${pulseAnimationGreen} 1s infinite` } : undefined,
    },
    {
      key: 'edit-net', group: 'management', priority: 3,
      visible: canManage && (isDraftOrScheduled || isActiveOrLobby),
      Icon: EditIcon, color: neutralIconColor, label: 'Edit net',
      tooltip: 'Edit net settings', onClick: () => navigate(`/nets/${netId}/edit`),
    },
    {
      key: 'roles', group: 'management', priority: 3,
      visible: canManage && (isDraftOrScheduled || isActiveOrLobby),
      Icon: GroupIcon, color: '#9c27b0', label: 'Roles',
      tooltip: isDraftOrScheduled
        ? 'Assign NCS and logger roles (any assigned NCS can start the net)'
        : 'Manage NCS and logger roles',
      onClick: onOpenRoleDialog,
    },
    {
      key: 'ncs-role', group: 'management', priority: 3,
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn && isAssignedNCS,
      Icon: WorkspacePremiumIcon, color: theme.palette.primary.main, label: isNCS ? 'Role: NCS' : 'Role: Standard',
      tooltip: isNCS ? 'Acting as NCS — click to step down to Standard' : 'Acting as Standard — click to step up to NCS',
      onClick: onToggleNCSRole,
      active: isNCS, activeTone: 'primary',
    },
    {
      key: 'claim-ncs', group: 'management', priority: 2,
      visible: canManage && isActiveOrLobby && !hasNCS,
      Icon: WorkspacePremiumIcon, color: '#ed6c02', label: 'Claim NCS',
      tooltip: 'Claim NCS role for this net', onClick: onClaimNCS,
    },
    {
      // Not offered to the acting NCS — raising a hand to get NCS's own
      // attention doesn't make sense; they run the queue, they don't join it.
      key: 'raise-hand', group: 'management', priority: 3,
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn && !isNCS,
      Icon: PanToolIcon, color: neutralIconColor,
      label: userActiveCheckIn?.hand_raised ? 'Lower hand' : 'Raise hand',
      tooltip: userActiveCheckIn?.hand_raised ? 'Lower hand' : 'Raise hand',
      onClick: () => onToggleHand(userActiveCheckIn?.id),
      active: !!userActiveCheckIn?.hand_raised, activeTone: 'warning',
    },
    {
      key: 'step-away', group: 'management', priority: 3,
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn,
      Icon: PauseCircleOutlineIcon, color: neutralIconColor,
      label: userActiveCheckIn?.status === 'away' ? 'Return' : 'Step away',
      tooltip: userActiveCheckIn?.status === 'away'
        ? 'Return from break'
        : (isNCS && !otherActiveNCSExists ? 'Step away (you are the only active NCS)' : 'Step away'),
      onClick: () => {
        const goingAway = userActiveCheckIn?.status !== 'away';
        if (goingAway && isNCS && !otherActiveNCSExists) {
          setStepAwayConfirmOpen(true);
          return;
        }
        onStatusChange(userActiveCheckIn?.id, goingAway ? 'away' : 'checked_in');
      },
      active: userActiveCheckIn?.status === 'away', activeTone: 'warning',
    },
    {
      key: 'check-out', group: 'management', priority: 3,
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn,
      Icon: LogoutIcon, color: '#d32f2f', label: 'Check out',
      tooltip: 'Check out of net', onClick: onCheckOut,
    },
    {
      key: 'check-in', group: 'management', priority: 4,
      visible: isAuthenticated && isActiveOrLobby && !userActiveCheckIn
        && !!(net.self_checkin_enabled !== false || canManageCheckIns),
      Icon: LoginIcon, color: theme.palette.primary.main, label: 'Check in',
      tooltip: 'Check into net', onClick: onOpenCheckIn,
      active: true, activeTone: 'success',
      extraSx: highlightCheckIn ? { animation: `${pulseAnimationGreen} 1s infinite` } : undefined,
    },
    {
      key: 'go-live', group: 'management', priority: 4,
      visible: canManage && net.status === 'lobby',
      Icon: PlayArrowIcon, color: '#2e7d32', label: 'Go live',
      tooltip: 'Go live - Start the net officially and notify subscribers', onClick: onGoLive,
    },
    {
      key: 'close-net', group: 'management', priority: 4, emphasis: true,
      visible: canManage && isActiveOrLobby,
      Icon: CloseIcon, color: '#d32f2f', label: 'Close net',
      tooltip: 'Close net', onClick: () => closeNetDialog.onOpen(),
    },
    {
      key: 'export', group: 'management', priority: 2,
      visible: isClosedOrArchived,
      Icon: DownloadIcon, color: '#4caf50', label: 'Export',
      tooltip: 'Export check-ins to CSV', onClick: onExportCSV,
    },
    {
      key: 'ics309', group: 'management', priority: 2,
      visible: isClosedOrArchived,
      Icon: DescriptionIcon, color: '#009688', label: 'ICS-309',
      tooltip: 'Download ICS-309 Communications Log', onClick: onExportICS309,
    },
    {
      key: 'report', group: 'management', priority: 2,
      visible: isClosedOrArchived,
      Icon: PictureAsPdfIcon, color: '#4caf50', label: 'Report',
      tooltip: 'Generate comprehensive net report (PDF)', onClick: () => navigate(`/nets/${netId}/report`),
    },
    {
      key: 'archive', group: 'management', priority: 2,
      visible: canManage && net.status === 'closed',
      Icon: ArchiveIcon, color: neutralIconColor, label: 'Archive',
      tooltip: 'Archive net', onClick: onArchive,
    },
    {
      key: 'delete-admin', group: 'management', priority: 2,
      visible: isAdmin && net.status === 'closed',
      Icon: DeleteIcon, color: '#d32f2f', label: 'Delete',
      tooltip: 'Delete net', onClick: onDelete,
    },
    {
      key: 'unarchive', group: 'management', priority: 2,
      visible: canManage && net.status === 'archived',
      Icon: UnarchiveIcon, color: neutralIconColor, label: 'Unarchive',
      tooltip: 'Unarchive net - restore to closed status', onClick: onUnarchive,
    },
    {
      key: 'delete-manager', group: 'management', priority: 2,
      visible: canManage && (net.status === 'draft' || net.status === 'archived'),
      Icon: DeleteIcon, color: '#d32f2f', label: 'Delete',
      tooltip: 'Delete net', onClick: onDelete,
    },
  ];

  const allItems = [...infoItems, ...managementItems].filter(i => i.visible);
  const infoVisible = allItems.filter(i => i.group === 'info');
  const managementVisible = allItems.filter(i => i.group === 'management');
  const showDivider = infoVisible.length > 0 && managementVisible.length > 0;

  // ===== Width measurement =====
  // A hidden clone of every visible item (in both label and icon-only form)
  // plus the divider and the More button, rendered off-screen so it has real
  // layout without affecting the page. Measured widths feed computeLayout().
  const measureRefs = useRef<Record<string, HTMLElement | null>>({});
  const [widths, setWidths] = useState<Record<string, { label: number; icon: number }>>({});
  const [dividerWidth, setDividerWidth] = useState(9);
  const [moreIconWidth, setMoreIconWidth] = useState(32);

  const signature = allItems.map(i => `${i.key}:${i.label}:${i.disabled ? 1 : 0}`).join('|') + '|' + comfortable;

  useLayoutEffect(() => {
    const nextWidths: Record<string, { label: number; icon: number }> = {};
    allItems.forEach(item => {
      const labelEl = measureRefs.current[`${item.key}__label`];
      const iconEl = measureRefs.current[`${item.key}__icon`];
      nextWidths[item.key] = {
        label: labelEl?.getBoundingClientRect().width ?? 0,
        icon: iconEl?.getBoundingClientRect().width ?? labelEl?.getBoundingClientRect().width ?? 0,
      };
    });
    setWidths(nextWidths);
    const dividerEl = measureRefs.current['__divider'];
    if (dividerEl) setDividerWidth(dividerEl.getBoundingClientRect().width);
    const moreEl = measureRefs.current['__more_icon'];
    if (moreEl) setMoreIconWidth(moreEl.getBoundingClientRect().width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ===== Available width tracking =====
  const barRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(9999);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    // Read getBoundingClientRect() rather than the ResizeObserver entry's
    // contentRect: NetView applies a CSS `zoom` on short viewports (see
    // NetView.tsx) to fit the logging panel without scrolling, and
    // contentRect reports the pre-zoom layout width while
    // getBoundingClientRect() reports the actual post-zoom rendered width —
    // the same basis used for the item widths measured below.
    const measure = () => setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const modes = computeLayout(allItems, widths, containerWidth, dividerWidth, moreIconWidth, showDivider);
  const overflowItems = allItems.filter(i => modes.get(i.key) === 'overflow');

  const renderItem = (item: ToolbarItemDef, mode: ItemMode) => {
    const showLabel = mode === 'label';
    return (
      <Tooltip key={item.key} title={item.tooltip}>
        <span>
          <Button
            variant="text"
            disableElevation
            onClick={item.onClick}
            disabled={item.disabled}
            sx={{
              ...flushBtnSx(comfortable, !showLabel, isDarkMode, theme.palette.primary.main, { emphasis: item.emphasis, active: item.active, activeTone: item.activeTone }),
              ...item.extraSx,
            }}
          >
            {item.iconOverride ?? <item.Icon sx={{ fontSize: 18, color: item.color }} />}
            {showLabel && <Box component="span">{item.label}</Box>}
          </Button>
        </span>
      </Tooltip>
    );
  };

  // Renders both a labelled and an icon-only clone of every item (plus
  // chrome) off-screen so their real widths can be measured.
  const measurementBlock = (
    <Box sx={{ position: 'fixed', top: -9999, left: -9999, visibility: 'hidden', pointerEvents: 'none', display: 'flex' }} aria-hidden>
      {allItems.map(item => (
        <React.Fragment key={item.key}>
          <span ref={el => { measureRefs.current[`${item.key}__label`] = el; }}>
            {renderItem(item, 'label')}
          </span>
          <span ref={el => { measureRefs.current[`${item.key}__icon`] = el; }}>
            {renderItem(item, 'icon')}
          </span>
        </React.Fragment>
      ))}
      <span ref={el => { measureRefs.current['__divider'] = el; }}>
        <Box sx={{ width: '1px', height: 20, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : '#dcdfe3', mx: 0.5 }} />
      </span>
      <span ref={el => { measureRefs.current['__more_icon'] = el; }}>
        <Button variant="text" sx={flushBtnSx(comfortable, true, isDarkMode, theme.palette.primary.main)}>
          <MoreHorizIcon sx={{ fontSize: 18, color: neutralIconColor }} />
        </Button>
      </span>
    </Box>
  );

  return (
    <Box sx={{ flexShrink: 0 }}>
      {measurementBlock}
      {/* ===== TITLE ROW: net name, description, status/stat/frequency chips ===== */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, flexWrap: 'wrap', px: 2, pt: 1.25, pb: 0.75 }}>
        <Typography variant="h5" component="h1" sx={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>
          {net.name}
        </Typography>
        {net.description && (
          <>
            <Typography
              variant="body2"
              title={net.description}
              onClick={(e) => setDescriptionAnchorEl(a => a ? null : e.currentTarget)}
              sx={{
                // flex-basis: 0 (not 'auto') is required here — with 'auto',
                // the browser's line-wrap decision uses this item's
                // *unshrunk* content width as its hypothetical size (since
                // the text itself is white-space:nowrap), which for a long
                // description is far wider than the row, so the whole row
                // wraps onto separate lines instead of the description
                // shrinking to fit + ellipsis in place.
                flex: '1 1 0',
                minWidth: 40,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontStyle: 'italic',
                color: 'text.secondary',
                cursor: 'pointer',
                borderBottom: '1px dotted',
                borderColor: 'divider',
              }}
            >
              — {net.description}
            </Typography>
            <Box
              component="button"
              onClick={(e) => setDescriptionAnchorEl(a => a ? null : e.currentTarget)}
              sx={{
                flex: '0 0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                font: '500 12px/1 Roboto',
                color: 'primary.main',
                cursor: 'pointer',
                padding: '3px 5px',
                borderRadius: '3px',
                border: 'none',
                background: 'none',
                '&:hover': { backgroundColor: 'rgba(25,118,210,0.08)' },
              }}
            >
              <InfoIcon sx={{ fontSize: 16 }} />
              {descriptionExpanded ? 'Hide' : 'More'}
            </Box>
          </>
        )}
        {/* ===== STATUS / STAT / FREQUENCY CHIPS (moved here from below the toolbar) ===== */}
        {/* flex-shrink must stay enabled (not '0 0 auto') — a flex:0
            container's hypothetical/max-content width for line-wrap
            purposes is its full all-chips-unwrapped width (same gotcha as
            the description above), so with shrink disabled this box never
            gets constrained down to the row's actual width and its own
            flexWrap never has a reason to kick in, overflowing the whole
            page horizontally on narrow (mobile) screens instead of
            wrapping chips onto additional lines. */}
        <Box sx={{ flex: '0 1 auto', display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', ml: 'auto' }}>
          <Chip label={net.status === 'lobby' ? 'LOBBY' : net.status} size="small" color={net.status === 'active' ? 'success' : net.status === 'lobby' ? 'warning' : 'default'} />
          {countdownTime && (
            <Chip
              icon={<TimerIcon />}
              label={countdownTime === 'Starting soon' ? countdownTime : `Starts in ${countdownTime}`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ fontFamily: 'monospace' }}
            />
          )}
          {lobbyOpensCountdown && (
            <Tooltip title="This net's lobby opens automatically. The check runs every minute, so it may open shortly after this countdown reaches zero.">
              <Chip
                icon={<TimerIcon />}
                label={lobbyOpensCountdown === 'Opening any moment' ? lobbyOpensCountdown : `Lobby opens in ${lobbyOpensCountdown}`}
                size="small"
                color="info"
                variant="outlined"
                sx={{ fontFamily: 'monospace' }}
              />
            </Tooltip>
          )}
          {durationTime && (
            <Chip
              icon={<AccessTimeIcon />}
              label={durationTime}
              size="small"
              color="info"
              variant="outlined"
              sx={{ fontFamily: 'monospace' }}
            />
          )}
          {netStats && (
            <>
              <Chip label={`${netStats.unique_stations ?? netStats.total_check_ins} Stations`} size="small" color="primary" variant="outlined" />
              {(netStats.recheck_count ?? 0) > 0 && (
                <Chip label={`${netStats.recheck_count} Rechecks`} size="small" color="warning" variant="outlined" />
              )}
              {netStats.checked_out_count > 0 && (
                <Chip label={`${netStats.checked_out_count} Checked Out`} size="small" color="default" variant="outlined" />
              )}
              <Chip label={`${netStats.online_count} Online`} size="small" color="success" variant="outlined" />
              {netStats.guest_count > 0 && (
                <Chip label={`${netStats.guest_count} ${netStats.guest_count === 1 ? 'Guest' : 'Guests'}`} size="small" color="default" variant="outlined" />
              )}
            </>
          )}
          {net.frequencies && net.frequencies.length > 0 && (
            <>
              {filteredFrequencyIds.length > 0 && (
                <Chip
                  label="Show All"
                  size="small"
                  color="secondary"
                  onClick={() => setFilteredFrequencyIds([])}
                  onDelete={() => setFilteredFrequencyIds([])}
                  sx={{ height: 24 }}
                />
              )}
              {net.frequencies.map((freq: any) => {
                const ncsColor = getNcsColorForFrequency(freq.id);
                const ncsCallsign = getNcsForFrequency(freq.id);
                const isFiltered = filteredFrequencyIds.includes(freq.id);
                const isActive = freq.id === net.active_frequency_id;
                const isMyFrequency = userNetRole?.role === 'NCS' && userNetRole?.active_frequency_id === freq.id;
                const myNcsColor = isMyFrequency && user?.id ? getNcsColor(user.id) : null;
                const isInactiveNet = net.status === 'closed' || net.status === 'archived';

                let tooltipText = '';
                if (isMyFrequency) {
                  tooltipText = '⭐ YOUR claimed frequency\n';
                } else if (ncsCallsign) {
                  tooltipText = `${ncsCallsign} is monitoring this frequency\n`;
                }
                if (!isInactiveNet && canManageCheckIns) {
                  if (userNetRole?.role === 'NCS') {
                    tooltipText += 'Click to claim • ';
                  } else {
                    tooltipText += 'Click to set active • ';
                  }
                }
                tooltipText += 'Ctrl+click to filter';

                return (
                  <Tooltip key={freq.id} title={tooltipText} arrow>
                    <Chip
                      label={freq.frequency
                        ? `${freq.frequency} MHz ${freq.mode || ''}`.trim()
                        : `${freq.network || ''}${freq.talkgroup ? ` TG${freq.talkgroup}` : ''} ${freq.mode || ''}`.trim()
                      }
                      size="small"
                      color={isActive ? 'primary' : isFiltered ? 'info' : 'default'}
                      variant={isFiltered ? 'filled' : 'outlined'}
                      onClick={(e) => onFrequencyChipClick(freq.id, e)}
                      clickable
                      sx={{
                        height: 24,
                        cursor: 'pointer',
                        fontWeight: isActive ? 'bold' : 'normal',
                        ...(isMyFrequency && myNcsColor && {
                          backgroundColor: myNcsColor.bg,
                          borderColor: myNcsColor.border,
                          borderWidth: 3,
                          boxShadow: `0 0 8px ${myNcsColor.border}`,
                          '& .MuiChip-label': {
                            color: myNcsColor.text,
                            fontWeight: 'bold',
                          },
                          '&:hover': {
                            backgroundColor: myNcsColor.bg,
                            opacity: 0.9,
                          },
                        }),
                        ...(!isMyFrequency && ncsColor && {
                          backgroundColor: ncsColor.bg,
                          borderColor: ncsColor.border,
                          '& .MuiChip-label': {
                            color: ncsColor.text,
                          },
                          '&:hover': {
                            backgroundColor: ncsColor.bg,
                            opacity: 0.8,
                          },
                        }),
                        ...(isFiltered && {
                          backgroundColor: 'info.main',
                          '& .MuiChip-label': {
                            color: 'white',
                          },
                        }),
                      }}
                    />
                  </Tooltip>
                );
              })}
            </>
          )}
        </Box>
      </Box>

      {/* ===== EXPANDED DESCRIPTION POPOVER — floats over the page instead
          of pushing the toolbar/content down ===== */}
      <Popover
        open={descriptionExpanded}
        anchorEl={descriptionAnchorEl}
        onClose={() => setDescriptionAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 420,
              mt: 0.5,
              borderRadius: '4px',
              boxShadow: '0 6px 20px rgba(15,23,42,.12)',
              p: '10px 13px',
            },
          },
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
          {net.description}
        </Typography>
      </Popover>

      {/* ===== COMMAND BAR — full-bleed strip spanning the whole page width ===== */}
      <Box
        ref={barRef}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '1px',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          px: 1,
          py: 0.5,
          mx: -0.5,
          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#f7f8f9',
          borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e4e6e9'}`,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e4e6e9'}`,
        }}
      >
        {infoVisible.map(item => {
          const mode = modes.get(item.key)!;
          return mode === 'overflow' ? null : renderItem(item, mode);
        })}

        {overflowItems.length > 0 && (
          <Tooltip title="More net information">
            <Button
              variant="text"
              disableElevation
              onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
              sx={flushBtnSx(comfortable, true, isDarkMode, theme.palette.primary.main)}
            >
              <MoreHorizIcon sx={{ fontSize: 18, color: neutralIconColor }} />
            </Button>
          </Tooltip>
        )}
        <Menu
          anchorEl={moreMenuAnchor}
          open={!!moreMenuAnchor}
          onClose={() => setMoreMenuAnchor(null)}
        >
          {overflowItems.map(item => (
            <MenuItem
              key={item.key}
              disabled={item.disabled}
              onClick={() => { setMoreMenuAnchor(null); item.onClick(); }}
            >
              <ListItemIcon>
                <item.Icon sx={{ fontSize: 18, color: item.color }} />
              </ListItemIcon>
              <ListItemText>{item.label}</ListItemText>
            </MenuItem>
          ))}
        </Menu>

        {showDivider && (
          <Box sx={{ width: '1px', height: 20, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : '#dcdfe3', mx: 0.5, flex: '0 0 auto' }} />
        )}

        {managementVisible.map(item => {
          const mode = modes.get(item.key)!;
          if (mode === 'overflow') return null;
          if (item.key === 'start-net') {
            return (
              <React.Fragment key={item.key}>
                {renderItem(item, mode)}
                {needsTopicPollConfig() && (
                  <Tooltip title="Topic or poll question needs to be set before starting">
                    <IconButton
                      size="small"
                      onClick={onOpenTopicPollConfig}
                      sx={{
                        p: 0.5,
                        borderRadius: '50%',
                        animation: `${shimmerYellow} 2s ease-in-out infinite`,
                      }}
                    >
                      <HelpOutlineIcon fontSize="small" sx={{ color: 'warning.dark' }} />
                    </IconButton>
                  </Tooltip>
                )}
              </React.Fragment>
            );
          }
          return renderItem(item, mode);
        })}
      </Box>

      <Dialog open={stepAwayConfirmOpen} onClose={() => setStepAwayConfirmOpen(false)}>
        <DialogTitle>Step away as the only active NCS?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            No one else is currently acting as NCS on this net. Stepping away leaves it without anyone
            actively running it until you return or hand the NCS role to someone else. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStepAwayConfirmOpen(false)}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setStepAwayConfirmOpen(false);
              onStatusChange(userActiveCheckIn?.id, 'away');
            }}
          >
            Step Away Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NetViewHeader;

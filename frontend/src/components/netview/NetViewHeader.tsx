import React, { useState } from 'react';
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

type NcsColor = { bg: string; border: string; text: string } | null;

// Pulse animation for highlighting the check-in button (blue)
const pulseAnimation = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(25, 118, 210, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);
  }
`;

// Pulse animation for highlighting the start net button (green)
const pulseAnimationGreen = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(46, 125, 50, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(46, 125, 50, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(46, 125, 50, 0);
  }
`;

// Yellow shimmer animation for topic/poll config needed indicator
const shimmerYellow = keyframes`
  0% {
    background-color: rgba(255, 193, 7, 0.3);
  }
  50% {
    background-color: rgba(255, 193, 7, 0.7);
  }
  100% {
    background-color: rgba(255, 193, 7, 0.3);
  }
`;

// Command bar button geometry/colors — matches the approved design handoff
// (design_handoff_netview_toolbar, option 3a): borderless "application
// toolbar" buttons flush against each other so 15 labelled controls read as
// one calm strip instead of a wall of separate cards.
const flushBtnSx = (
  comfortable: boolean,
  iconOnly: boolean,
  opts: { emphasis?: boolean; active?: boolean; activeTone?: 'primary' | 'warning' } = {}
) => ({
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
  borderColor: opts.active ? (opts.activeTone === 'warning' ? '#ed6c02' : '#90caf9') : 'transparent',
  backgroundColor: opts.active ? (opts.activeTone === 'warning' ? 'rgba(237,108,2,0.12)' : 'rgba(25,118,210,0.12)') : 'transparent',
  color: opts.emphasis ? '#c62828' : '#25282c',
  fontWeight: opts.emphasis ? 500 : 400,
  fontSize: comfortable ? 13 : 12,
  lineHeight: 1,
  textTransform: 'none' as const,
  letterSpacing: '.01em',
  whiteSpace: 'nowrap' as const,
  '&:hover': {
    backgroundColor: '#e6e9ec',
    borderColor: '#d3d7dc',
  },
  '&.Mui-disabled': {
    opacity: 0.4,
  },
});

interface ToolbarItemDef {
  key: string;
  visible: boolean;
  Icon: React.ComponentType<any>;
  color: string;
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  // Stays inline (never collapses into the More menu) even at the narrowest
  // tier. For the info group this is the "Bulk add / Search / Map / Stats"
  // set; for the management group it marks the primary status CTA.
  core?: boolean;
  active?: boolean;
  activeTone?: 'primary' | 'warning';
  emphasis?: boolean;
  extraSx?: object;
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
  user: any;
  userNetRole: any;
  userActiveCheckIn: any;
  netStats: any;
  countdownTime: string | null;
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
  onOpenTimeEdit: () => void;
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
  user,
  userNetRole,
  userActiveCheckIn,
  netStats,
  countdownTime,
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
  onOpenTimeEdit,
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
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);

  // Collapse ladder — page-width breakpoints from the design handoff, not
  // the app's default MUI breakpoints. >=1400: everything labelled.
  // 1024-1399: info group icon-only, management stays labelled. <1024:
  // only Bulk add/Search/Map/Stats stay inline from the info group (the
  // rest join the More menu); management is icon-only except the primary
  // status CTA (Start net / Check in / Go live / Close net).
  const isFull = useMediaQuery('(min-width:1400px)');
  const isMediumUp = useMediaQuery('(min-width:1024px)');
  const comfortable = !useMediaQuery('(min-width:600px)');
  const tier: 'full' | 'medium' | 'compact' = isFull ? 'full' : isMediumUp ? 'medium' : 'compact';

  const isActiveOrLobby = net.status === 'active' || net.status === 'lobby';
  const isDraftOrScheduled = net.status === 'draft' || net.status === 'scheduled';
  const isClosedOrArchived = net.status === 'closed' || net.status === 'archived';

  // ===== INFO GROUP (read / view actions) =====
  const infoItems: ToolbarItemDef[] = [
    {
      key: 'bulk', core: true,
      visible: isActiveOrLobby && checkInsCount > 0,
      Icon: FastForwardIcon, color: '#1976d2', label: 'Bulk add',
      tooltip: 'Bulk add multiple check-ins', onClick: () => bulkCheckIn.onOpen(),
    },
    {
      key: 'search', core: true,
      visible: checkInsCount > 0,
      Icon: SearchIcon, color: '#1976d2', label: 'Search',
      tooltip: 'Search check-ins', onClick: () => search.onOpen(),
      active: !!searchQuery, activeTone: 'primary',
    },
    {
      key: 'map', core: true,
      visible: checkInsCount > 0,
      Icon: MapIcon, color: '#1976d2', label: 'Map',
      tooltip: 'View check-in locations on map', onClick: map.onOpen,
    },
    {
      key: 'audio', core: false,
      visible: checkInsCount > 0 && !!net.stream_url,
      Icon: VolumeUpIcon, color: '#9c27b0', label: 'Audio',
      tooltip: 'Listen to net audio', onClick: () => window.open(net.stream_url, '_blank'),
    },
    {
      key: 'stats', core: true,
      visible: checkInsCount > 0,
      Icon: BarChartIcon, color: '#ed6c02', label: 'Stats',
      tooltip: 'Net statistics', onClick: () => navigate(`/statistics/nets/${netId}`),
    },
    {
      key: 'script', core: false,
      visible: checkInsCount > 0 && !!net.script,
      Icon: ArticleIcon, color: '#4a4f55', label: 'Script',
      tooltip: 'View net script', onClick: () => script.onOpen(),
    },
    {
      key: 'schedule-announcements', core: false,
      visible: checkInsCount > 0 && !!net.template_id,
      Icon: CampaignIcon, color: '#4a4f55', label: 'Announcements',
      tooltip: 'View schedule announcements', onClick: () => scheduleAnnouncements.onOpen(),
    },
    {
      key: 'notes', core: false,
      visible: checkInsCount > 0 && !!net.announcements,
      Icon: SpeakerNotesIcon, color: '#4a4f55', label: 'Notes',
      tooltip: 'View net notes', onClick: () => announcements.onOpen(),
    },
    {
      key: 'topics', core: false,
      visible: checkInsCount > 0 && !!net.template_id,
      Icon: HistoryIcon, color: '#4a4f55', label: 'Topics',
      tooltip: 'View prior topics', onClick: () => topicHistory.onOpen(),
    },
  ];

  // Rarest info-adjacent items — always live in the More menu regardless of
  // tier ("the two rarest (Website, Import) live in a More menu").
  const overflowOnlyItems: ToolbarItemDef[] = [
    {
      key: 'website', visible: !!net.info_url,
      Icon: LanguageIcon, color: '#1976d2', label: 'Website',
      tooltip: 'Net/Club info', onClick: () => window.open(net.info_url, '_blank'),
    },
    {
      key: 'net-info', visible: !(canManage && isActiveOrLobby),
      Icon: InfoIcon, color: '#1976d2', label: 'Net info',
      tooltip: 'View net info', onClick: () => navigate(`/nets/${netId}/info`),
    },
    {
      key: 'import', visible: canManage && (isActiveOrLobby || isClosedOrArchived),
      Icon: UploadFileIcon, color: '#2e7d32', label: 'Import',
      tooltip: 'Import check-ins from CSV', onClick: importDialog.onOpen,
    },
  ];

  // ===== MANAGEMENT GROUP (state / participation-changing actions) =====
  const managementItems: ToolbarItemDef[] = [
    // Start net is rendered separately (loading spinner + adjacent topic/poll
    // warning icon), but still occupies its ordinal position in the bar.
    {
      key: 'edit-net',
      visible: canManage && (isDraftOrScheduled || isActiveOrLobby),
      Icon: EditIcon, color: '#4a4f55', label: 'Edit net',
      tooltip: 'Edit net settings', onClick: () => navigate(`/nets/${netId}/edit`),
    },
    {
      key: 'roles',
      visible: canManage && (isDraftOrScheduled || isActiveOrLobby),
      Icon: GroupIcon, color: '#9c27b0', label: 'Roles',
      tooltip: isDraftOrScheduled
        ? 'Assign NCS and logger roles (any assigned NCS can start the net)'
        : 'Manage NCS and logger roles',
      onClick: onOpenRoleDialog,
    },
    {
      key: 'claim-ncs',
      visible: canManage && isActiveOrLobby && !hasNCS,
      Icon: WorkspacePremiumIcon, color: '#ed6c02', label: 'Claim NCS',
      tooltip: 'Claim NCS role for this net', onClick: onClaimNCS,
    },
    {
      key: 'raise-hand',
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn,
      Icon: PanToolIcon, color: '#4a4f55',
      label: userActiveCheckIn?.hand_raised ? 'Lower hand' : 'Raise hand',
      tooltip: userActiveCheckIn?.hand_raised ? 'Lower hand' : 'Raise hand',
      onClick: () => onToggleHand(userActiveCheckIn?.id),
      active: !!userActiveCheckIn?.hand_raised, activeTone: 'warning',
    },
    {
      key: 'step-away',
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn,
      Icon: PauseCircleOutlineIcon, color: '#4a4f55',
      label: userActiveCheckIn?.status === 'away' ? 'Return' : 'Step away',
      tooltip: userActiveCheckIn?.status === 'away' ? 'Return from break' : 'Step away',
      onClick: () => onStatusChange(userActiveCheckIn?.id, userActiveCheckIn?.status === 'away' ? 'checked_in' : 'away'),
      active: userActiveCheckIn?.status === 'away', activeTone: 'warning',
    },
    {
      key: 'ncs-role',
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn && isAssignedNCS,
      Icon: WorkspacePremiumIcon, color: '#1976d2', label: 'NCS role',
      tooltip: isNCS ? 'Step down — stop acting as NCS' : 'Step up — take NCS role',
      onClick: onToggleNCSRole,
      active: isNCS, activeTone: 'primary',
    },
    {
      key: 'check-out',
      visible: isAuthenticated && isActiveOrLobby && !!userActiveCheckIn,
      Icon: LogoutIcon, color: '#d32f2f', label: 'Check out',
      tooltip: 'Check out of net', onClick: onCheckOut,
    },
    {
      key: 'check-in', core: true,
      visible: isAuthenticated && isActiveOrLobby && !userActiveCheckIn
        && !!(net.self_checkin_enabled !== false || canManageCheckIns),
      Icon: LoginIcon, color: '#1976d2', label: 'Check in',
      tooltip: 'Check into net', onClick: onOpenCheckIn,
      extraSx: highlightCheckIn ? { animation: `${pulseAnimation} 1s infinite` } : undefined,
    },
    {
      key: 'go-live', core: true,
      visible: canManage && net.status === 'lobby',
      Icon: PlayArrowIcon, color: '#2e7d32', label: 'Go live',
      tooltip: 'Go live - Start the net officially and notify subscribers', onClick: onGoLive,
    },
    {
      key: 'close-net', core: true, emphasis: true,
      visible: canManage && isActiveOrLobby,
      Icon: CloseIcon, color: '#d32f2f', label: 'Close net',
      tooltip: 'Close net', onClick: () => closeNetDialog.onOpen(),
    },
    {
      key: 'export',
      visible: isClosedOrArchived,
      Icon: DownloadIcon, color: '#4caf50', label: 'Export',
      tooltip: 'Export check-ins to CSV', onClick: onExportCSV,
    },
    {
      key: 'ics309',
      visible: isClosedOrArchived,
      Icon: DescriptionIcon, color: '#009688', label: 'ICS-309',
      tooltip: 'Download ICS-309 Communications Log', onClick: onExportICS309,
    },
    {
      key: 'report',
      visible: isClosedOrArchived,
      Icon: PictureAsPdfIcon, color: '#4caf50', label: 'Report',
      tooltip: 'Generate comprehensive net report (PDF)', onClick: () => navigate(`/nets/${netId}/report`),
    },
    {
      key: 'archive',
      visible: canManage && net.status === 'closed',
      Icon: ArchiveIcon, color: '#4a4f55', label: 'Archive',
      tooltip: 'Archive net', onClick: onArchive,
    },
    {
      key: 'delete-admin',
      visible: isAdmin && net.status === 'closed',
      Icon: DeleteIcon, color: '#d32f2f', label: 'Delete',
      tooltip: 'Delete net', onClick: onDelete,
    },
    {
      key: 'unarchive',
      visible: canManage && net.status === 'archived',
      Icon: UnarchiveIcon, color: '#4a4f55', label: 'Unarchive',
      tooltip: 'Unarchive net - restore to closed status', onClick: onUnarchive,
    },
    {
      key: 'delete-manager',
      visible: canManage && (net.status === 'draft' || net.status === 'archived'),
      Icon: DeleteIcon, color: '#d32f2f', label: 'Delete',
      tooltip: 'Delete net', onClick: onDelete,
    },
  ];

  const visibleInfo = infoItems.filter(i => i.visible);
  const inlineInfo = tier === 'compact' ? visibleInfo.filter(i => i.core) : visibleInfo;
  const overflowInfo = tier === 'compact' ? visibleInfo.filter(i => !i.core) : [];
  const overflowItems = [...overflowInfo, ...overflowOnlyItems.filter(i => i.visible)];
  const visibleManagement = managementItems.filter(i => i.visible);

  const showStartNet = canStartNet && isDraftOrScheduled;
  const infoShowLabel = tier === 'full';
  const managementShowLabel = (item: ToolbarItemDef) => tier !== 'compact' || !!item.core;

  const renderItem = (item: ToolbarItemDef, showLabel: boolean) => (
    <Tooltip key={item.key} title={item.tooltip}>
      <span>
        <Button
          variant="text"
          disableElevation
          onClick={item.onClick}
          disabled={item.disabled}
          sx={{
            ...flushBtnSx(comfortable, !showLabel, { emphasis: item.emphasis, active: item.active, activeTone: item.activeTone }),
            ...item.extraSx,
          }}
        >
          <item.Icon sx={{ fontSize: 18, color: item.color }} />
          {showLabel && <Box component="span">{item.label}</Box>}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Box sx={{ flexShrink: 0 }}>
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
              onClick={() => setDescriptionExpanded(v => !v)}
              sx={{
                flex: '1 1 auto',
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
              onClick={() => setDescriptionExpanded(v => !v)}
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
        <Box sx={{ flex: '0 0 auto', display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', ml: 'auto' }}>
          <Chip label={net.status === 'lobby' ? 'LOBBY' : net.status} size="small" color={net.status === 'active' ? 'success' : net.status === 'lobby' ? 'warning' : 'default'} />
          {canManage && (net.status === 'active' || net.status === 'closed' || net.status === 'archived') && (
            <Tooltip title="Edit net start/end times">
              <IconButton
                size="small"
                onClick={onOpenTimeEdit}
                sx={{ p: 0.25, display: { xs: 'none', md: 'inline-flex' } }}
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
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

      {/* ===== EXPANDED DESCRIPTION BLOCK (only when toggled open) ===== */}
      {descriptionExpanded && net.description && (
        <Box
          sx={{
            mx: 2, mb: 1, maxWidth: 620,
            backgroundColor: 'background.paper',
            border: '1px solid #dfe1e5',
            borderRadius: '4px',
            boxShadow: '0 6px 20px rgba(15,23,42,.12)',
            p: '10px 13px',
          }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
            {net.description}
          </Typography>
        </Box>
      )}

      {/* ===== COMMAND BAR — full-bleed strip spanning the whole page width ===== */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '1px',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          px: 1,
          py: 0.5,
          mx: -0.5,
          backgroundColor: '#f7f8f9',
          borderTop: '1px solid #e4e6e9',
          borderBottom: '1px solid #e4e6e9',
        }}
      >
        {inlineInfo.map(item => renderItem(item, infoShowLabel))}

        {overflowItems.length > 0 && (
          <Tooltip title="More net information">
            <Button
              variant="text"
              disableElevation
              onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
              sx={flushBtnSx(comfortable, tier === 'compact')}
            >
              <MoreHorizIcon sx={{ fontSize: 18, color: '#5f6368' }} />
              {tier !== 'compact' && <Box component="span">More</Box>}
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
                <item.Icon sx={{ fontSize: 18, color: '#5f6368' }} />
              </ListItemIcon>
              <ListItemText>{item.label}</ListItemText>
            </MenuItem>
          ))}
        </Menu>

        {(inlineInfo.length > 0 || overflowItems.length > 0) && visibleManagement.length + (showStartNet ? 1 : 0) > 0 && (
          <Box sx={{ width: '1px', height: 20, backgroundColor: '#dcdfe3', mx: 0.5, flex: '0 0 auto' }} />
        )}

        {/* Start net — rendered separately for its loading spinner + adjacent topic/poll warning */}
        {showStartNet && (
          <>
            <Tooltip title="Start the net">
              <span>
                <Button
                  variant="text"
                  disableElevation
                  onClick={onStartNetClick}
                  disabled={startingNet}
                  sx={{
                    ...flushBtnSx(comfortable, false),
                    ...(highlightStartNet && { animation: `${pulseAnimationGreen} 1s infinite` }),
                  }}
                >
                  {startingNet ? (
                    <CircularProgress size={16} sx={{ color: '#2e7d32' }} />
                  ) : (
                    <PlayArrowIcon sx={{ fontSize: 18, color: '#2e7d32' }} />
                  )}
                  <Box component="span">Start net</Box>
                </Button>
              </span>
            </Tooltip>
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
          </>
        )}

        {visibleManagement.map(item => renderItem(item, managementShowLabel(item)))}
      </Box>
    </Box>
  );
};

export default NetViewHeader;

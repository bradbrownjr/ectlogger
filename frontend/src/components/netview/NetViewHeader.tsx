import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Button,
  CircularProgress,
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
import type { UseDialogResult } from '../../hooks/useDialog';

// ========== NET VIEW HEADER ==========
// Net info (name, status, timers, stats, frequency chips) plus the two-row
// action toolbar (view actions, then state-changing actions). Purely
// presentational — the parent owns all state, derived flags, and handlers.

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

  return (
    <Box sx={{ flexShrink: 0 }}>
      <Grid container spacing={0} sx={{ mt: 0.5, flex: 1, minHeight: 0 }}>
        <Grid item xs={12} md={8} sx={{ pr: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="h5" component="h1" sx={{ mb: 0 }}>
              {net.name}
            </Typography>
            {net.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: 'italic' }}
              >
                — {net.description}
              </Typography>
            )}
          </Box>
          {/* Stats and Frequency chips row */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mb: 0.5, gap: 0.5 }}>
            {/* Left side: Status, timers, and stats */}
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={net.status === 'lobby' ? 'LOBBY' : net.status} size="small" color={net.status === 'active' ? 'success' : net.status === 'lobby' ? 'warning' : 'default'} />
              {/* Edit net times button — NCS/admin only, hidden on mobile to keep
                  the header chip row compact. Net times can also be edited from
                  the net info page. */}
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
              {/* Countdown timer - shows time until scheduled start */}
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
              {/* Duration timer - shows elapsed time since net started.
                  Label drops the "Duration: " prefix on mobile to keep all
                  header chips on a single row. The clock icon already conveys
                  meaning. */}
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
            </Box>
            {/* Right side: Frequency chips - always show so attendees know where to tune */}
            {net.frequencies && net.frequencies.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Show All chip when filtering is active */}
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
                  // Check if current user is the NCS who claimed this frequency
                  const isMyFrequency = userNetRole?.role === 'NCS' && userNetRole?.active_frequency_id === freq.id;
                  const myNcsColor = isMyFrequency && user?.id ? getNcsColor(user.id) : null;
                  // For closed/archived nets, chips are view-only except Ctrl+click filter
                  const isInactiveNet = net.status === 'closed' || net.status === 'archived';

                  // Build tooltip text
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
                          // Highlight current user's claimed frequency with thick ring
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
                          // Apply NCS color if assigned (but not current user)
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
                          // Override with filter styling if filtered
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
              </Box>
            )}
          </Box>
        </Grid>
        <Grid item xs={12} md={4} sx={{ pl: { md: 0.5 } }}>
          {/* Two-row toolbar:
              Row 1 = net info  (read/view: search, map, stats, script, etc.)
              Row 2 = net actions (write/change: start, check-in, close, export, import, etc.)
              Hover over any icon button to reveal its function. */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: { xs: 'flex-start', md: 'flex-end' } }}>
          {/* ===== ROW 1: NET INFO ===== */}
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 0.25, md: 0.5 },
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: { xs: 'flex-start', md: 'flex-end' },
              '& .MuiButton-root': {
                px: { xs: 0.5, md: 1 },
                minWidth: { xs: 32, md: 'auto' },
              },
            }}
          >
            {/* Bulk check-in shortcut */}
            {(net.status === 'active' || net.status === 'lobby') && checkInsCount > 0 && (
              <Tooltip title="Bulk add multiple check-ins">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => bulkCheckIn.onOpen()}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <FastForwardIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {checkInsCount > 0 && (
              <>
                <Tooltip title="Search check-ins">
                  <Button
                    size="small"
                    variant={searchQuery ? "contained" : "outlined"}
                    color="primary"
                    onClick={() => search.onOpen()}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <SearchIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="View check-in locations on map">
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    onClick={map.onOpen}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <MapIcon fontSize="small" />
                  </Button>
                </Tooltip>
                {net.stream_url && (
                  <Tooltip title="Listen to net audio">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => window.open(net.stream_url, '_blank')}
                      sx={{ minWidth: 'auto', px: 1, color: '#9c27b0', borderColor: '#9c27b0', '&:hover': { borderColor: '#9c27b0', backgroundColor: 'rgba(156, 39, 176, 0.08)' } }}
                    >
                      <VolumeUpIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="Net statistics">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(`/statistics/nets/${netId}`)}
                    sx={{ minWidth: 'auto', px: 1, color: '#ff9800', borderColor: '#ff9800', '&:hover': { borderColor: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.08)' } }}
                  >
                    <BarChartIcon fontSize="small" />
                  </Button>
                </Tooltip>
                {net.script && (
                  <Tooltip title="View net script">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => script.onOpen()}
                      sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                    >
                      <ArticleIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {net.template_id && (
                  <Tooltip title="View schedule announcements">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => scheduleAnnouncements.onOpen()}
                      sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                    >
                      <CampaignIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {net.announcements && (
                  <Tooltip title="View net notes">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => announcements.onOpen()}
                      sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                    >
                      <SpeakerNotesIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {net.template_id && (
                  <Tooltip title="View prior topics">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => topicHistory.onOpen()}
                      sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                    >
                      <HistoryIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
              </>
            )}
            {net.info_url && (
              <Tooltip title="Net/Club info">
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  onClick={() => window.open(net.info_url, '_blank')}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <LanguageIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Info page link — shown for non-managers and on all inactive net states */}
            {!(canManage && (net.status === 'active' || net.status === 'lobby')) && (
              <Tooltip title="View net info">
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  onClick={() => navigate(`/nets/${netId}/info`)}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <InfoIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
          </Box>
          {/* ===== ROW 2: NET ACTIONS (start, roles, check-in, close, export, import, archive, delete) ===== */}
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 0.25, md: 0.5 },
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: { xs: 'flex-start', md: 'flex-end' },
              '& .MuiButton-root': {
                px: { xs: 0.5, md: 1 },
                minWidth: { xs: 32, md: 'auto' },
              },
            }}
          >
            {/* Start Net - draft/scheduled */}
            {canStartNet && (net.status === 'draft' || net.status === 'scheduled') && (
              <>
                <Tooltip title="Start the net">
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    onClick={onStartNetClick}
                    disabled={startingNet}
                    sx={{
                      minWidth: 'auto',
                      px: 1,
                      ...(highlightStartNet && {
                        animation: `${pulseAnimationGreen} 1s infinite`,
                      })
                    }}
                  >
                    {startingNet ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <PlayArrowIcon fontSize="small" />
                    )}
                  </Button>
                </Tooltip>
                {/* Show yellow shimmer ? icon if topic/poll needs configuration */}
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
            {/* Edit and Roles - draft/scheduled */}
            {canManage && (net.status === 'draft' || net.status === 'scheduled') && (
              <>
                <Tooltip title="Edit net settings">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(`/nets/${netId}/edit`)}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <EditIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Assign NCS and logger roles (any assigned NCS can start the net)">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onOpenRoleDialog}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <GroupIcon fontSize="small" />
                  </Button>
                </Tooltip>
              </>
            )}
            {/* Edit, Roles, Claim NCS - active/lobby */}
            {canManage && (net.status === 'active' || net.status === 'lobby') && (
              <>
                <Tooltip title="Edit net settings">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(`/nets/${netId}/edit`)}
                    sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                  >
                    <EditIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Manage NCS and logger roles">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onOpenRoleDialog}
                    sx={{ minWidth: 'auto', px: 1, color: '#9c27b0', borderColor: '#9c27b0', '&:hover': { borderColor: '#9c27b0', backgroundColor: 'rgba(156, 39, 176, 0.08)' } }}
                  >
                    <GroupIcon fontSize="small" />
                  </Button>
                </Tooltip>
                {!hasNCS && (
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    onClick={onClaimNCS}
                  >
                    Claim NCS
                  </Button>
                )}
              </>
            )}
            {/* Check-in / user status buttons - active/lobby */}
            {isAuthenticated && (net.status === 'active' || net.status === 'lobby') && (
              userActiveCheckIn ? (
                <>
                <Tooltip title={userActiveCheckIn?.hand_raised ? 'Lower hand' : 'Raise hand'}>
                  <Button
                    size="small"
                    variant="outlined"
                    color={userActiveCheckIn?.hand_raised ? 'warning' : 'inherit'}
                    onClick={() => onToggleHand(userActiveCheckIn.id)}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <PanToolIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title={userActiveCheckIn?.status === 'away' ? 'Return from break' : 'Step away'}>
                  <Button
                    size="small"
                    variant="outlined"
                    color={userActiveCheckIn?.status === 'away' ? 'warning' : 'inherit'}
                    onClick={() => onStatusChange(userActiveCheckIn.id, userActiveCheckIn?.status === 'away' ? 'checked_in' : 'away')}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <PauseCircleOutlineIcon fontSize="small" />
                  </Button>
                </Tooltip>
                {/* Role toggle — only visible to operators with an NCS assignment */}
                {isAssignedNCS && (
                  <Tooltip title={isNCS ? 'Step down — stop acting as NCS' : 'Step up — take NCS role'}>
                    <Button
                      size="small"
                      variant="outlined"
                      color={isNCS ? 'primary' : 'inherit'}
                      onClick={onToggleNCSRole}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <WorkspacePremiumIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="Check out of net">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={onCheckOut}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    <LogoutIcon fontSize="small" />
                  </Button>
                </Tooltip>
                </>
              ) : (
                /* Self check-in may be disabled for this net — staff still add stations via the manage forms */
                (net.self_checkin_enabled !== false || canManageCheckIns) && (
                  <Tooltip title="Check into net">
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={onOpenCheckIn}
                      sx={{
                        minWidth: 'auto',
                        px: 1,
                        ...(highlightCheckIn && {
                          animation: `${pulseAnimation} 1s infinite`,
                        })
                      }}
                    >
                      <LoginIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )
              )
            )}
            {/* Go Live - lobby */}
            {canManage && net.status === 'lobby' && (
              <Tooltip title="Go live - Start the net officially and notify subscribers">
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={onGoLive}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <PlayArrowIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Close Net - active/lobby */}
            {canManage && (net.status === 'active' || net.status === 'lobby') && (
              <Tooltip title="Close net">
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  onClick={() => closeNetDialog.onOpen()}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <CloseIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Export CSV — closed and archived */}
            {(net.status === 'closed' || net.status === 'archived') && (
              <Tooltip title="Export check-ins to CSV">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onExportCSV}
                  sx={{ minWidth: 'auto', px: 1, color: '#4caf50', borderColor: '#4caf50', '&:hover': { borderColor: '#4caf50', backgroundColor: 'rgba(76, 175, 80, 0.08)' } }}
                >
                  <DownloadIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Import CSV — open, closed, and archived nets (canManage) */}
            {canManage && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
              <Tooltip title="Import check-ins from CSV">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={importDialog.onOpen}
                  sx={{ minWidth: 'auto', px: 1, color: '#2e7d32', borderColor: '#2e7d32', '&:hover': { borderColor: '#2e7d32', backgroundColor: 'rgba(46, 125, 50, 0.08)' } }}
                >
                  <UploadFileIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* ICS-309 Communications Log — closed and archived */}
            {(net.status === 'closed' || net.status === 'archived') && (
              <Tooltip title="Download ICS-309 Communications Log">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onExportICS309}
                  sx={{ minWidth: 'auto', px: 1, color: '#009688', borderColor: '#009688', '&:hover': { borderColor: '#009688', backgroundColor: 'rgba(0, 150, 136, 0.08)' } }}
                >
                  <DescriptionIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* PDF Report — closed and archived */}
            {(net.status === 'closed' || net.status === 'archived') && (
              <Tooltip title="Generate comprehensive net report (PDF)">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigate(`/nets/${netId}/report`)}
                  sx={{ minWidth: 'auto', px: 1, color: '#4caf50', borderColor: '#4caf50', '&:hover': { borderColor: '#4caf50', backgroundColor: 'rgba(76, 175, 80, 0.08)' } }}
                >
                  <PictureAsPdfIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Archive — closed (canManage) */}
            {canManage && net.status === 'closed' && (
              <Tooltip title="Archive net">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onArchive}
                  sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                >
                  <ArchiveIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Delete — closed (isAdmin) */}
            {isAdmin && net.status === 'closed' && (
              <Tooltip title="Delete net">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={onDelete}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <DeleteIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Unarchive — archived (canManage) */}
            {canManage && net.status === 'archived' && (
              <Tooltip title="Unarchive net - restore to closed status">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onUnarchive}
                  sx={{ minWidth: 'auto', px: 1, borderColor: 'grey.400' }}
                >
                  <UnarchiveIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {/* Delete — draft or archived (canManage) */}
            {canManage && (net.status === 'draft' || net.status === 'archived') && (
              <Tooltip title="Delete net">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={onDelete}
                  sx={{ minWidth: 'auto', px: 1 }}
                >
                  <DeleteIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
          </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default NetViewHeader;

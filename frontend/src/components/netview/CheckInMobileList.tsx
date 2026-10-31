import React, { useEffect, useRef, useState } from 'react';
import { fieldLabel, shownDetailFields } from '../../utils/checkInFields';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import HearingIcon from '@mui/icons-material/Hearing';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import UserAvatar from '../UserAvatar';
import { formatTimeWithDate } from '../../utils/dateUtils';
import { STATUS_SELECT_MENU_PROPS } from './statusSelectMenuProps';
import { inPersonRowTint, STATUS_SELECT_VALUES } from './checkInStatusHelpers';
import { sneakInFade, SNEAK_IN_HIGHLIGHT_MS, useOffscreenArrivalIndicator } from './sneakInHighlight';
import OffscreenArrivalArrow from './OffscreenArrivalArrow';
import CheckInLocation from './CheckInLocation';
import HandRaisedIndicator from './HandRaisedIndicator';
import { findCheckInRole, roleMatchesCheckIn, StationRole } from '../../utils/stationRoles';
import { checkInTimeText, isLogOpen } from '../../utils/netLog';
import { StationRow } from '../../utils/stationRows';
import StationChannels from './StationChannels';
import StationTimeline from './StationTimeline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// ========== CHECK-IN LIST TABLE 2: Mobile View ==========
// The small-screen (xs only) check-in table. Intentionally simpler than the
// desktop/detached tables: cells are read-only (no click-to-edit) so a
// station's fields aren't changed by accident while scrolling a phone, and the
// only per-row action is delete. Status can still be changed via the Select.
// Purely presentational — the parent owns all state, derived flags, and actions.

type NcsColor = { bg: string; border: string; text: string } | null;

interface CheckInMobileListProps {
  // The site's field list, for each built-in field's heading (utils/checkInFields.ts::fieldLabel).
  fieldDefinitions?: { name: string; label?: string | null }[];
  net: any;
  // One row per station per place (utils/stationRows.ts), same as the desktop table.
  stationRows: StationRow<any>[];
  // Account and callsign-only roles merged (utils/stationRoles.ts).
  netRoles: StationRole[];
  ncsRoles: StationRole[];
  user: any;
  onlineUserIds: number[];
  activeSpeakerId: number | null;
  // Relayed By column: the net has the field on, or it's in use (utils/checkInFields.ts::isRelayedByShown)
  showRelayedBy: boolean;
  canManage: boolean;
  canManageCheckIns: boolean | undefined;
  getNcsColor: (station: { user_id?: number | null; callsign?: string | null }) => NcsColor;
  getEnabledCustomFields: () => any[];
  isFieldRequired: (fieldName: string) => boolean;
  getStatusIcon: (status: string, checkIn?: any) => string;
  getStatusLabel: (status: string) => string;
  getNcsIcon: (checkIn: any) => string;
  onStatusChange: (checkInId: number, newStatus: string) => Promise<any> | void;
  onRefreshRoles: () => Promise<any> | void;
  onRefreshCheckIns: () => Promise<any> | void;
  onDeleteCheckIn: (checkInId: number, groupIds?: number[]) => void;
  // Net control marks a station's channel offline or back (StationChannels).
  onMarkChannel?: (checkInId: number, frequencyId: number, offline: boolean) => void;
  formatFrequencyDisplay: (freq: any) => string;
  onShowProfile: (userId: number) => void;
  // Opens the guest/accountless profile popup for a check-in with no linked
  // user_id. Only offered to standard/view-only users, matching the desktop
  // table -- staff use the callsign cell to correct entries, not to browse.
  onShowGuestProfile?: (callsign: string) => void;
  // "Can hear" propagation logging: whether the current user (NCS/Logger/Relay)
  // may open the reporting dialog, which check-ins already have at least one
  // report (for the row indicator), and the handler to open the dialog for a row.
  canReportCanHear: boolean;
  canHearReporterCheckInIds: number[];
  onOpenCanHearDialog: (checkInId: number) => void;
  // Check-in ids currently playing the "sneak-in" arrival flash -- see
  // sneakInHighlight.ts.
  highlightedCheckInIds?: Set<number>;
  // Authenticated nets (net.authenticated): opens IdentityVerifyDialog for a
  // row's padlock icon. Optional so existing callers aren't forced to wire it.
  onOpenIdentityVerify?: (checkIn: any) => void;
}

const CheckInMobileList: React.FC<CheckInMobileListProps> = ({
  net,
  stationRows,
  netRoles,
  ncsRoles,
  user,
  onlineUserIds,
  activeSpeakerId,
  showRelayedBy,
  canManage,
  canManageCheckIns,
  getNcsColor,
  getEnabledCustomFields,
  fieldDefinitions,
  isFieldRequired,
  getStatusIcon,
  getStatusLabel,
  getNcsIcon,
  onStatusChange,
  onRefreshRoles,
  onRefreshCheckIns,
  onDeleteCheckIn,
  onMarkChannel,
  formatFrequencyDisplay,
  onShowProfile,
  onShowGuestProfile,
  canReportCanHear,
  canHearReporterCheckInIds,
  onOpenCanHearDialog,
  highlightedCheckInIds,
  onOpenIdentityVerify,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // The Actions column is for staff acting on other stations' rows: delete
  // (NCS/Logger) and "who can this station hear?" (Relay too, only on a net
  // that logs coverage). A station's own controls (hand, step away, I hear)
  // live in the toolbar. Until 2026-10-04 the column also appeared for
  // anyone with their own check-in, for a self "can hear" icon that only
  // existed when coverage logging was on, so on most nets a participant got
  // an empty column on their own row and nothing on anyone else's.
  const showCanHear = !!net?.propagation_logging_enabled && canReportCanHear;
  const showActions = canManage || showCanHear;
  // Every column, for the channels and timeline row under a station.
  const columnCount = 4 + (net?.field_config?.name?.enabled ? 1 : 0) + (net?.field_config?.location?.enabled ? 1 : 0)
    + shownDetailFields(net?.field_config).length + getEnabledCustomFields().length
    + (net?.topic_of_week_enabled ? 1 : 0) + (net?.poll_enabled ? 1 : 0) + (showRelayedBy ? 1 : 0) + (showActions ? 1 : 0);
  // Which stations have their timeline open, by station key.
  const [openTimelines, setOpenTimelines] = useState<Set<string>>(new Set());
  const toggleTimeline = (key: string) => setOpenTimelines((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // A shadow on the frozen Actions column's left edge signals "there's more
  // to the left" only while that's actually true — see CheckInTable.tsx for
  // the full rationale; same technique here.
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasMoreToScroll, setHasMoreToScroll] = useState(false);
  const stickyShadow = hasMoreToScroll ? '-4px 0 6px -4px rgba(0,0,0,0.3)' : 'none';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      setHasMoreToScroll(maxScrollLeft > 1 && el.scrollLeft < maxScrollLeft - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [stationRows.length]);

  // Sneak-in off-screen arrow -- see sneakInHighlight.ts for the shared
  // arrival-detection/dismissal hook, and OffscreenArrivalArrow.tsx for the
  // shared visual, both used identically by CheckInTable.tsx.
  const rowElRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const offscreenArrival = useOffscreenArrivalIndicator(containerRef, rowElRefs, highlightedCheckInIds);

  return (
    <Box sx={{ position: 'relative', display: { xs: 'block', md: 'none' }, maxHeight: 400 }}>
      {/* ========== SNEAK-IN OFF-SCREEN ARROW ========== */}
      {/* Says "a new self check-in just landed outside the visible area" and
          scrolls it into view on click. See sneakInHighlight.ts. */}
      <OffscreenArrivalArrow
        visible={offscreenArrival.visible}
        direction={offscreenArrival.direction}
        onClick={offscreenArrival.onClick}
      />
      <TableContainer ref={containerRef} sx={{
      overflow: 'auto',
      border: 1,
      borderColor: 'divider',
      borderRadius: '4px',
      maxHeight: 400,
      '&::-webkit-scrollbar': {
        width: 8,
        height: 8,
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
        borderRadius: 4,
        '&:hover': {
          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
        },
      },
    }}>
      <Table size="small">
        <TableHead sx={{ position: 'sticky', top: 0, backgroundColor: 'background.default', zIndex: 1 }}>
          <TableRow>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>#</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>Callsign *</TableCell>
            {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{fieldLabel(fieldDefinitions, 'name')} {net.field_config.name.required && '*'}</TableCell>}
            {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{fieldLabel(fieldDefinitions, 'location')} {net.field_config.location.required && '*'}</TableCell>}
            {/* Spotter # through Notes, as the net has them on (utils/checkInFields.ts) */}
            {shownDetailFields(net?.field_config).map((field) => (
              <TableCell key={field} sx={{ whiteSpace: 'nowrap' }}>{fieldLabel(fieldDefinitions, field)} {isFieldRequired(field) && '*'}</TableCell>
            ))}
            {getEnabledCustomFields().map((field) => (
              <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                {field.label} {isFieldRequired(field.name) && '*'}
              </TableCell>
            ))}
            {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Topic</TableCell>}
            {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Poll</TableCell>}
            {showRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>{fieldLabel(fieldDefinitions, 'relayed_by')}</TableCell>}
            <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
            {/* Actions column: staff only (see showActions) */}
            {showActions && (
              <TableCell
                sx={{
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  right: 0,
                  zIndex: 2,
                  backgroundColor: 'background.default',
                  boxShadow: stickyShadow,
                }}
              >
                Actions
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {stationRows.map((group, index) => {
            // The station's newest check-in at this place
            const checkIn = group.row;
            const timelineOpen = openTimelines.has(group.key);
            const hasChannels = net.frequencies?.length > 1 && group.worked.length + group.listed.length > 0;
            const isOnActiveFrequency = net.active_frequency_id
              && (group.worked.includes(net.active_frequency_id) || group.listed.includes(net.active_frequency_id));
            // Get NCS color if this user is an NCS
            const ncsColor = getNcsColor(checkIn);
            const isNcsUser = ncsRoles.some((r: any) => roleMatchesCheckIn(r, checkIn));

            // Row background reflects status/role state, resolved (not a function) so
            // the sticky Actions cell can layer it over an opaque backdrop below.
            const rowBgColor = checkIn.id === activeSpeakerId
              ? (isDarkMode ? theme.palette.success.dark : theme.palette.success.light)
              : checkIn.status === 'checked_out' ? theme.palette.action.disabledBackground
              : checkIn.status === 'in_person' ? inPersonRowTint(isDarkMode)
              : isNcsUser && ncsColor ? ncsColor.bg
              : isOnActiveFrequency ? (isDarkMode ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)') : 'inherit';
            // NCS/active-frequency/disabled tints are semi-transparent rgba() values
            // meant to blend over the table's plain background. A sticky cell using
            // one directly still lets the column scrolling underneath show through
            // the alpha gap, so paint an opaque backdrop first and layer the tint on
            // top as a background-image gradient (see CheckInTable.tsx for the same
            // technique in more detail).
            const stickyCellSx = {
              backgroundColor: 'background.default',
              backgroundImage: rowBgColor !== 'inherit' ? `linear-gradient(${rowBgColor}, ${rowBgColor})` : 'none',
            };

            const isSneakInHighlighted = !!highlightedCheckInIds?.has(checkIn.id);

            return (
              <React.Fragment key={group.key}>
              <TableRow
                ref={(el: HTMLTableRowElement | null) => {
                  if (el) rowElRefs.current.set(checkIn.id, el);
                  else rowElRefs.current.delete(checkIn.id);
                }}
                sx={{
                  backgroundColor: rowBgColor,
                  opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                  ...((hasChannels || timelineOpen) ? { '& td': { borderBottom: 0 } } : {}),
                  // Add left border for NCS users
                  ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                    borderLeft: `3px solid ${ncsColor.border}`,
                  }),
                  // A station checked itself in without staff typing it in --
                  // single-shot fade to catch the eye. See sneakInHighlight.ts.
                  ...(isSneakInHighlighted && {
                    animation: `${sneakInFade} ${SNEAK_IN_HIGHLIGHT_MS}ms ease-out`,
                  }),
                }}
              >
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {index + 1}
                  {/* Shows when the station has checked in more than once here */}
                  {group.rows.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => toggleTimeline(group.key)}
                      title={timelineOpen ? 'Hide timeline' : `Show all ${group.rows.length} check-ins here`}
                      sx={{ p: 0.25 }}
                    >
                      {timelineOpen ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {/* Also editable on a closed/archived net: a backfilled import or a
                      misattributed NCS/Logger role still needs correcting after the fact,
                      same reasoning as the Edit net and Roles toolbar actions. */}
                  {(net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                    const userRole = findCheckInRole(netRoles, checkIn);
                    let selectValue = checkIn.status.toLowerCase();
                    // Role only takes over the value while checked in -- same rule as
                    // the desktop table and getStatusIcon (see checkInStatusHelpers.ts).
                    if (selectValue === 'checked_in' && userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                      selectValue = userRole.role.toLowerCase();
                    }
                    if (!STATUS_SELECT_VALUES.includes(selectValue)) {
                      selectValue = 'checked_in';
                    }
                    return (
                      <Select
                        size="small"
                        value={selectValue}
                        onChange={async (e) => {
                          await onStatusChange(checkIn.id, e.target.value);
                          await onRefreshRoles();
                          await onRefreshCheckIns();
                        }}
                        sx={{ minWidth: 45 }}
                        MenuProps={STATUS_SELECT_MENU_PROPS}
                        renderValue={(v) => v === 'ncs' ? getNcsIcon(checkIn) : v === 'logger' ? '📋' : getStatusIcon(v as string, checkIn)}
                      >
                        {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">{getNcsIcon(checkIn)}  {getStatusLabel('ncs')}</MenuItem>)}
                        {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋  {getStatusLabel('logger')}</MenuItem>)}
                        <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}  {checkIn.is_recheck ? 'Re-check' : getStatusLabel('checked_in')}</MenuItem>
                        <MenuItem value="listening">👂  {getStatusLabel('listening')}</MenuItem>
                        <MenuItem value="relay">📡  {getStatusLabel('relay')}</MenuItem>
                        <MenuItem value="away">⏸️  {getStatusLabel('away')}</MenuItem>
                        <MenuItem value="has_traffic">🚨  {getStatusLabel('has_traffic')}</MenuItem>
                        <MenuItem value="announcements">📢  {getStatusLabel('announcements')}</MenuItem>
                        <MenuItem value="mobile">🚗  {getStatusLabel('mobile')}</MenuItem>
                        <MenuItem value="in_person">🧍  {getStatusLabel('in_person')}</MenuItem>
                        {(canManageCheckIns || checkIn.user_id === user?.id) && <MenuItem value="checked_out">👋  {getStatusLabel('checked_out')}</MenuItem>}
                      </Select>
                    );
                  })() : (
                    <span>{getStatusIcon(checkIn.status, checkIn)}</span>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {/* Avatar opens the profile for everyone, staff included,
                        same as the desktop table. */}
                    <Box
                      onClick={(e) => {
                        e.stopPropagation();
                        if (checkIn.user_id) onShowProfile(checkIn.user_id);
                        else onShowGuestProfile?.(checkIn.callsign);
                      }}
                      sx={{ cursor: 'pointer', display: 'inline-flex' }}
                    >
                      <UserAvatar
                        avatarUrl={checkIn.avatar_url}
                        callsign={checkIn.callsign}
                        name={checkIn.name}
                        size={24}
                        hasProfile={!!checkIn.user_id}
                      isOnline={!!(checkIn.user_id && onlineUserIds.includes(checkIn.user_id))}
                      />
                    </Box>
                    <Box
                      component="span"
                      onClick={() => {
                        if (canManageCheckIns) return;
                        if (checkIn.user_id) onShowProfile(checkIn.user_id);
                        else onShowGuestProfile?.(checkIn.callsign);
                      }}
                      sx={{ cursor: !canManageCheckIns ? 'pointer' : 'default' }}
                    >
                      {checkIn.callsign}
                    </Box>
                    {checkIn.relayed_by && (
                      <Tooltip title={`Relayed by ${checkIn.relayed_by}`} arrow>
                        <span>📡</span>
                      </Tooltip>
                    )}
                    {/* Raised hand: read-only, visible to every viewer (this
                        list has no hand toggle, so it is the only place a
                        phone user, staff included, sees it) */}
                    <HandRaisedIndicator handRaised={checkIn.hand_raised} status={checkIn.status} />
                    {net?.authenticated && (
                      canManageCheckIns && checkIn.user_id ? (
                        <IconButton
                          size="small"
                          sx={{ p: 0.25 }}
                          disabled={!checkIn.identity_verifiable}
                          onClick={() => onOpenIdentityVerify?.(checkIn)}
                          color={checkIn.identity_verified ? 'success' : 'default'}
                          title={
                            !checkIn.identity_verifiable
                              ? `${checkIn.callsign} has not set up two-factor authentication`
                              : checkIn.identity_verified
                                ? 'Identity verified — tap to re-check'
                                : 'Identity not verified — tap to check TOTP code'
                          }
                        >
                          {checkIn.identity_verified
                            ? <LockIcon fontSize="small" />
                            : <LockOpenIcon fontSize="small" />}
                        </IconButton>
                      ) : (
                        <span
                          title={checkIn.identity_verified ? 'Identity verified' : 'Identity not verified'}
                          style={{ display: 'inline-flex', opacity: 0.7 }}
                        >
                          {checkIn.identity_verified
                            ? <LockIcon fontSize="small" color="success" />
                            : <LockOpenIcon fontSize="small" />}
                        </span>
                      )
                    )}
                  </Box>
                </TableCell>
                {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.name}</TableCell>}
                {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}><CheckInLocation location={checkIn.location} gridSquare={checkIn.grid_square} /></TableCell>}
                {shownDetailFields(net?.field_config).map((field) => (
                  <TableCell key={field} sx={{ whiteSpace: 'nowrap' }}>{checkIn[field]}</TableCell>
                ))}
                {getEnabledCustomFields().map((field) => (
                  <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                    {field.field_type === 'checkbox'
                      ? (checkIn.custom_fields?.[field.name] === 'true' ? 'Yes' : 'No')
                      : checkIn.custom_fields?.[field.name] || ''}
                  </TableCell>
                ))}
                {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.topic_response || ''}</TableCell>}
                {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.poll_response || ''}</TableCell>}
                {showRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.relayed_by || ''}</TableCell>}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkInTimeText(checkIn, (at) => formatTimeWithDate(at, user?.prefer_utc || false, net?.started_at))}</TableCell>
                {showActions && (
                  <TableCell
                    sx={{
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      right: 0,
                      zIndex: 1,
                      ...stickyCellSx,
                      boxShadow: stickyShadow,
                    }}
                  >
                    {canManage && (
                      <IconButton
                        size="small"
                        onClick={() => onDeleteCheckIn(checkIn.id, group.rows.map((r) => r.id))}
                        title={group.rows.length > 1 ? `Delete all ${group.rows.length} check-ins here` : 'Delete check-in'}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                    {showCanHear && isLogOpen(net) && checkIn.status !== 'checked_out' && (
                      <IconButton
                        size="small"
                        onClick={() => onOpenCanHearDialog(checkIn.id)}
                        color={group.rows.some((r) => canHearReporterCheckInIds.includes(r.id)) ? 'info' : 'default'}
                        title="Who can this station hear?"
                        sx={{ opacity: group.rows.some((r) => canHearReporterCheckInIds.includes(r.id)) ? 1 : 0.4 }}
                      >
                        <HearingIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
              {/* ========== CHANNELS AND TIMELINE under the station ========== */}
              {(hasChannels || timelineOpen) && (
                <TableRow sx={{ backgroundColor: rowBgColor, opacity: checkIn.status === 'checked_out' ? 0.6 : 1 }}>
                  <TableCell colSpan={columnCount - (showActions ? 1 : 0)} sx={{ pt: 0, pb: 0.75 }}>
                    <Box sx={{ pl: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {hasChannels && (
                        <StationChannels
                          group={group}
                          frequencies={net.frequencies}
                          formatFrequencyDisplay={formatFrequencyDisplay}
                          preferUtc={user?.prefer_utc || false}
                          netStartedAt={net?.started_at}
                          onMark={canManageCheckIns && isLogOpen(net) ? onMarkChannel : undefined}
                        />
                      )}
                      {timelineOpen && (
                        <StationTimeline
                          group={group}
                          frequencies={net.frequencies || []}
                          formatFrequencyDisplay={formatFrequencyDisplay}
                          getStatusLabel={getStatusLabel}
                          preferUtc={user?.prefer_utc || false}
                          netStartedAt={net?.started_at}
                          onDelete={canManage ? (id) => onDeleteCheckIn(id) : undefined}
                        />
                      )}
                    </Box>
                  </TableCell>
                  {showActions && <TableCell sx={{ position: 'sticky', right: 0, zIndex: 1, ...stickyCellSx, pt: 0, pb: 0.75 }} />}
                </TableRow>
              )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
      </TableContainer>
    </Box>
  );
};

export default CheckInMobileList;

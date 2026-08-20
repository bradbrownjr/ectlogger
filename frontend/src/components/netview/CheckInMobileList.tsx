import React, { useEffect, useRef, useState } from 'react';
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
import UserAvatar from '../UserAvatar';
import { formatTimeWithDate } from '../../utils/dateUtils';
import { STATUS_SELECT_MENU_PROPS } from './statusSelectMenuProps';

// ========== CHECK-IN LIST TABLE 2: Mobile View ==========
// The small-screen (xs only) check-in table. Intentionally simpler than the
// desktop/detached tables: cells are read-only (no click-to-edit) so a
// station's fields aren't changed by accident while scrolling a phone, and the
// only per-row action is delete. Status can still be changed via the Select.
// Purely presentational — the parent owns all state, derived flags, and actions.

type NcsColor = { bg: string; border: string; text: string } | null;

interface CheckInMobileListProps {
  net: any;
  filteredCheckIns: any[];
  netRoles: any[];
  ncsRoles: any[];
  user: any;
  onlineUserIds: number[];
  activeSpeakerId: number | null;
  latestCheckedInAtByCallsign: Map<string, string>;
  hasAnyRelayedBy: boolean;
  canManage: boolean;
  canManageCheckIns: boolean | undefined;
  getNcsColor: (userId: number) => NcsColor;
  getEnabledCustomFields: () => any[];
  isFieldRequired: (fieldName: string) => boolean;
  getStatusIcon: (status: string, checkIn?: any) => string;
  getStatusLabel: (status: string) => string;
  getNcsIcon: (checkIn: any) => string;
  onStatusChange: (checkInId: number, newStatus: string) => Promise<any> | void;
  onRefreshRoles: () => Promise<any> | void;
  onRefreshCheckIns: () => Promise<any> | void;
  onDeleteCheckIn: (checkInId: number) => void;
  onShowProfile: (userId: number) => void;
  // "Can hear" propagation logging: whether the current user (NCS/Logger/Relay)
  // may open the reporting dialog, which check-ins already have at least one
  // report (for the row indicator), and the handler to open the dialog for a row.
  canReportCanHear: boolean;
  canHearReporterCheckInIds: number[];
  onOpenCanHearDialog: (checkInId: number) => void;
}

const CheckInMobileList: React.FC<CheckInMobileListProps> = ({
  net,
  filteredCheckIns,
  netRoles,
  ncsRoles,
  user,
  onlineUserIds,
  activeSpeakerId,
  latestCheckedInAtByCallsign,
  hasAnyRelayedBy,
  canManage,
  canManageCheckIns,
  getNcsColor,
  getEnabledCustomFields,
  isFieldRequired,
  getStatusIcon,
  getStatusLabel,
  getNcsIcon,
  onStatusChange,
  onRefreshRoles,
  onRefreshCheckIns,
  onDeleteCheckIn,
  onShowProfile,
  canReportCanHear,
  canHearReporterCheckInIds,
  onOpenCanHearDialog,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // A station can report what it itself can hear (unless the net has turned
  // self-reporting off), so the Actions column (and its per-row icon) must
  // also show for the viewer's own check-in even without canManage/canReportCanHear.
  const selfCanHearAllowed = net?.self_can_hear_enabled !== false;
  const hasOwnCheckIn = selfCanHearAllowed && filteredCheckIns.some((c) => c.user_id === user?.id);

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
  }, [filteredCheckIns.length]);

  return (
    <TableContainer ref={containerRef} sx={{
      display: { xs: 'block', md: 'none' },
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
            {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Name {net.field_config.name.required && '*'}</TableCell>}
            {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Location {net.field_config.location.required && '*'}</TableCell>}
            {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Spotter {net.field_config.skywarn_number.required && '*'}</TableCell>}
            {net?.field_config?.weather_observation?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Weather {net.field_config.weather_observation.required && '*'}</TableCell>}
            {net?.field_config?.power_source?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power Src {net.field_config.power_source.required && '*'}</TableCell>}
            {net?.field_config?.power?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power {net.field_config.power.required && '*'}</TableCell>}
            {net?.field_config?.notes?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Notes {net.field_config.notes.required && '*'}</TableCell>}
            {getEnabledCustomFields().map((field) => (
              <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                {field.label} {isFieldRequired(field.name) && '*'}
              </TableCell>
            ))}
            {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Topic</TableCell>}
            {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Poll</TableCell>}
            {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
            <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
            {/* Actions column also shows for Relay-only staff (canReportCanHear),
                who can't manage check-ins but can report "can hear" edges, and
                for anyone with their own check-in in this net (self-report) */}
            {(canManage || canReportCanHear || hasOwnCheckIn) && (
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
          {filteredCheckIns.map((checkIn, index) => {
            const isOnActiveFrequency = net.active_frequency_id && checkIn.available_frequencies?.includes(net.active_frequency_id);
            // Get NCS color if this user is an NCS
            const ncsColor = checkIn.user_id ? getNcsColor(checkIn.user_id) : null;
            const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
            const isPriorRowMobile = (() => {
              const latest = latestCheckedInAtByCallsign.get(checkIn.callsign);
              return latest !== undefined && checkIn.checked_in_at < latest;
            })();

            // Row background reflects status/role state, resolved (not a function) so
            // the sticky Actions cell can layer it over an opaque backdrop below.
            const rowBgColor = checkIn.id === activeSpeakerId
              ? (isDarkMode ? theme.palette.success.dark : theme.palette.success.light)
              : checkIn.status === 'checked_out' ? theme.palette.action.disabledBackground
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

            return (
              <TableRow key={checkIn.id} sx={{
                backgroundColor: rowBgColor,
                opacity: isPriorRowMobile ? 0.4 : checkIn.status === 'checked_out' ? 0.6 : 1,
                // Add left border for NCS users
                ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                  borderLeft: `3px solid ${ncsColor.border}`,
                }),
              }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                    const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
                    let selectValue = checkIn.status.toLowerCase();
                    // Role only takes over the value while checked in -- same rule as
                    // the desktop table and getStatusIcon (see checkInStatusHelpers.ts).
                    if (selectValue === 'checked_in' && userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                      selectValue = userRole.role.toLowerCase();
                    }
                    const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'has_traffic', 'announcements', 'mobile', 'checked_out'];
                    if (!validValues.includes(selectValue)) {
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
                        {(canManageCheckIns || checkIn.user_id === user?.id) && <MenuItem value="checked_out">👋  {getStatusLabel('checked_out')}</MenuItem>}
                      </Select>
                    );
                  })() : (
                    <span>{getStatusIcon(checkIn.status, checkIn)}</span>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      onClick={() => checkIn.user_id && onShowProfile(checkIn.user_id)}
                      sx={{ cursor: checkIn.user_id ? 'pointer' : 'default', display: 'inline-flex' }}
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
                    {checkIn.callsign}
                    {checkIn.relayed_by && (
                      <Tooltip title={`Relayed by ${checkIn.relayed_by}`} arrow>
                        <span>📡</span>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
                {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.name}</TableCell>}
                {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.location}</TableCell>}
                {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.skywarn_number}</TableCell>}
                {net?.field_config?.weather_observation?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.weather_observation}</TableCell>}
                {net?.field_config?.power_source?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.power_source}</TableCell>}
                {net?.field_config?.power?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.power}</TableCell>}
                {net?.field_config?.notes?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.notes}</TableCell>}
                {getEnabledCustomFields().map((field) => (
                  <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                    {field.field_type === 'checkbox'
                      ? (checkIn.custom_fields?.[field.name] === 'true' ? 'Yes' : 'No')
                      : checkIn.custom_fields?.[field.name] || ''}
                  </TableCell>
                ))}
                {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.topic_response || ''}</TableCell>}
                {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.poll_response || ''}</TableCell>}
                {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.relayed_by || ''}</TableCell>}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTimeWithDate(checkIn.checked_in_at, user?.prefer_utc || false, net?.started_at)}</TableCell>
                {(canManage || canReportCanHear || (checkIn.user_id === user?.id && selfCanHearAllowed)) && (
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
                      <IconButton size="small" onClick={() => onDeleteCheckIn(checkIn.id)}><DeleteIcon fontSize="small" /></IconButton>
                    )}
                    {net.propagation_logging_enabled && (canReportCanHear || (checkIn.user_id === user?.id && selfCanHearAllowed)) && (net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (
                      <IconButton
                        size="small"
                        onClick={() => onOpenCanHearDialog(checkIn.id)}
                        color={canHearReporterCheckInIds.includes(checkIn.id) ? 'info' : 'default'}
                        title="Who can this station hear?"
                        sx={{ opacity: canHearReporterCheckInIds.includes(checkIn.id) ? 1 : 0.4 }}
                      >
                        <HearingIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default CheckInMobileList;

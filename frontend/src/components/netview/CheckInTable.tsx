import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupIcon from '@mui/icons-material/Group';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PanToolIcon from '@mui/icons-material/PanTool';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import UserAvatar from '../UserAvatar';
import { formatTimeWithDate } from '../../utils/dateUtils';

// ========== CHECK-IN LIST TABLE 1: Desktop Inline (attached) ==========
// The full-featured desktop check-in table: sticky header, inline click-to-edit
// per field (data-field targeting + refs/focus/blur), status Select, NCS row
// coloring, active-speaker highlighting, and the per-frequency chip sub-row.
// Purely presentational — the parent owns all state, refs, and handlers; they
// are passed through with their original names so this table body is a verbatim
// lift from NetView (safest form for the riskiest block in the split).
//
// Rendered in the attached <Grid> placement today. Step 4 will also render it in
// the detached <FloatingWindow> so both placements share identical behavior.

type NcsColor = { bg: string; border: string; text: string } | null;

interface CheckInTableProps {
  net: any;
  filteredCheckIns: any[];
  netRoles: any[];
  ncsRoles: any[];
  owner: any;
  user: any;
  onlineUserIds: number[];
  activeSpeakerId: number | null;
  latestCheckedInAtByCallsign: Map<string, string>;
  hasAnyRelayedBy: boolean;
  hideDuplicates: boolean;
  canManage: boolean;
  canManageCheckIns: boolean | undefined;
  inlineEditingId: number | null;
  inlineEditValues: any;
  inlineEditFocusField: string | null;
  inlineEditRowRef: React.Ref<HTMLTableRowElement>;
  getNcsColor: (userId: number) => NcsColor;
  getNcsColorForFrequency: (frequencyId: number) => NcsColor;
  getEnabledCustomFields: () => any[];
  isFieldRequired: (fieldName: string) => boolean;
  formatFrequencyDisplay: (freq: any) => string;
  getStatusIcon: (status: string, checkIn?: any) => string;
  getStatusTooltip: (status: string, checkIn?: any) => string;
  getStatusLabel: (status: string) => string;
  getNcsIcon: (checkIn: any) => string;
  setHideDuplicates: (v: boolean) => void;
  handleDetachCheckInList: () => void;
  handleStartInlineEdit: (checkIn: any, focusField?: string) => void;
  handleInlineFieldChange: (field: string, value: string) => void;
  handleInlineKeyDown: (e: React.KeyboardEvent) => void;
  handleInlineBlur: (e: React.FocusEvent) => void;
  handleStatusChange: (checkInId: number, newStatus: string) => Promise<any> | void;
  fetchNetRoles: () => Promise<any> | void;
  fetchCheckIns: () => Promise<any> | void;
  handleToggleHand: (checkInId: number) => void;
  handleSetActiveSpeaker: (checkInId: number | null) => void;
  handleDeleteCheckIn: (checkInId: number) => void;
  setProfileUserId: (userId: number | null) => void;
}

const CheckInTable: React.FC<CheckInTableProps> = ({
  net,
  filteredCheckIns,
  netRoles,
  ncsRoles,
  owner,
  user,
  onlineUserIds,
  activeSpeakerId,
  latestCheckedInAtByCallsign,
  hasAnyRelayedBy,
  hideDuplicates,
  canManage,
  canManageCheckIns,
  inlineEditingId,
  inlineEditValues,
  inlineEditFocusField,
  inlineEditRowRef,
  getNcsColor,
  getNcsColorForFrequency,
  getEnabledCustomFields,
  isFieldRequired,
  formatFrequencyDisplay,
  getStatusIcon,
  getStatusTooltip,
  getStatusLabel,
  getNcsIcon,
  setHideDuplicates,
  handleDetachCheckInList,
  handleStartInlineEdit,
  handleInlineFieldChange,
  handleInlineKeyDown,
  handleInlineBlur,
  handleStatusChange,
  fetchNetRoles,
  fetchCheckIns,
  handleToggleHand,
  handleSetActiveSpeaker,
  handleDeleteCheckIn,
  setProfileUserId,
}) => {
  return (
              <TableContainer sx={{ 
                flex: { xs: 'none', md: 1 }, 
                overflow: 'auto', 
                border: 1, 
                borderColor: 'divider', 
                borderRadius: '4px', 
                minHeight: 0, 
                display: { xs: 'none', md: 'block' },
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
                {/* ========== CHECK-IN LIST TABLE 1: Desktop Inline (attached) ========== */}
                {/* This table displays when check-in list is NOT detached, on medium+ screens */}
                <Table size="small" sx={{ borderCollapse: 'collapse' }}>
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
                      {/* Custom fields */}
                      {getEnabledCustomFields().map((field) => (
                        <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                          {field.label} {isFieldRequired(field.name) && '*'}
                        </TableCell>
                      ))}
                      {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Topic</TableCell>}
                      {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Poll</TableCell>}
                      {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                      {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>Actions</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap', width: 30, p: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => setHideDuplicates(!hideDuplicates)}
                          title={hideDuplicates ? 'Show all rows (including re-checks)' : 'Hide duplicate rows (show latest per station)'}
                          sx={{ p: 0.25, color: hideDuplicates ? 'primary.main' : 'text.secondary' }}
                        >
                          <GroupIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={handleDetachCheckInList}
                          title="Detach to floating window"
                          sx={{ p: 0.25 }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                  {/* Existing check-ins */}
                  {filteredCheckIns.map((checkIn, index) => {
                    // Check if this station is available on the active frequency
                    const isOnActiveFrequency = net.active_frequency_id && 
                      checkIn.available_frequencies && 
                      checkIn.available_frequencies.includes(net.active_frequency_id);
                    // Get NCS color if this user is an NCS
                    const ncsColor = checkIn.user_id ? getNcsColor(checkIn.user_id) : null;
                    const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
                    
                    // Calculate column count for frequency chip row colspan
                    const hasFrequencyChips = net.frequencies && net.frequencies.length > 1 && checkIn.available_frequencies && checkIn.available_frequencies.length > 0;
                    let columnCount = 5; // #, Status, Callsign, Time, pop-out icon
                    if (net?.field_config?.name?.enabled) columnCount++;
                    if (net?.field_config?.location?.enabled) columnCount++;
                    if (net?.field_config?.skywarn_number?.enabled) columnCount++;
                    if (net?.field_config?.weather_observation?.enabled) columnCount++;
                    if (net?.field_config?.power_source?.enabled) columnCount++;
                    if (net?.field_config?.power?.enabled) columnCount++;
                    if (net?.field_config?.notes?.enabled) columnCount++;
                    columnCount += getEnabledCustomFields().length;
                    if (hasAnyRelayedBy) columnCount++;
                    if (canManage) columnCount++;
                    
                    // Check if this row is being inline edited
                    const isInlineEditing = inlineEditingId === checkIn.id;
                    
                    // Gray out rows that are not the latest for this callsign
                    const isPriorRow = (() => {
                      const latest = latestCheckedInAtByCallsign.get(checkIn.callsign);
                      return latest !== undefined && checkIn.checked_in_at < latest;
                    })();

                    return (
                    <React.Fragment key={checkIn.id}>
                    <TableRow
                      ref={isInlineEditing ? inlineEditRowRef : undefined}
                      onClick={(e) => {
                        // Don't start editing if clicking on interactive elements
                        const target = e.target as HTMLElement;
                        if (target.closest('button, select, input, .MuiSelect-root, .MuiIconButton-root')) return;
                        // Don't start editing if already editing this row
                        if (isInlineEditing) return;
                        // Determine which field was clicked based on the cell's data-field attribute
                        const cell = target.closest('td[data-field]') as HTMLElement | null;
                        const focusField = cell?.dataset.field || 'callsign';
                        // Start inline editing
                        if (canManageCheckIns && checkIn.status !== 'checked_out') {
                          handleStartInlineEdit(checkIn, focusField);
                        }
                      }}
                      sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : checkIn.status === 'away'
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 193, 7, 0.18)' : 'rgba(255, 193, 7, 0.22)'
                          : isNcsUser && ncsColor ? ncsColor.bg
                          : isOnActiveFrequency
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)'
                          : 'transparent',
                        opacity: isPriorRow ? 0.4 : checkIn.status === 'checked_out' ? 0.6 : 1,
                        border: checkIn.id === activeSpeakerId ? 2 : 0,
                        borderColor: checkIn.id === activeSpeakerId ? 'success.main' : 'transparent',
                        // Add left border for NCS users
                        ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                          borderLeft: `3px solid ${ncsColor.border}`,
                        }),
                        // Cursor pointer when row is editable
                        cursor: canManageCheckIns && checkIn.status !== 'checked_out' && !isInlineEditing ? 'pointer' : 'default',
                        // Highlight row being edited
                        ...(isInlineEditing && {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                        }),
                        '& td, & th': {
                          ...(checkIn.id === activeSpeakerId ? { fontWeight: 'bold' } : {}),
                          verticalAlign: 'middle',
                          whiteSpace: 'nowrap',
                          // Remove bottom border and padding if frequency chips row follows
                          ...(hasFrequencyChips ? { border: 0, paddingBottom: 0 } : {}),
                        }
                      }}
                    >
                      <TableCell sx={{ width: 35 }}>{index + 1}</TableCell>
                      <TableCell sx={{ width: 75 }} onClick={(e) => e.stopPropagation()}>
                        {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                          // Calculate value once

                          // Ensure selectValue matches MenuItem values exactly
                          // Determine selectValue: show role if present, else status
                          const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
                          let selectValue = checkIn.status.toLowerCase();
                          if (userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                            selectValue = userRole.role.toLowerCase();
                          } else if (userRole && ['NCS', 'LOGGER'].includes(userRole.role)) {
                            selectValue = userRole.role.toLowerCase();
                          }
                          // Only allow lowercase values for Select and MenuItem
                          const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'has_traffic', 'announcements', 'mobile', 'checked_out'];
                          if (!validValues.includes(selectValue)) {
                            selectValue = 'checked_in';
                          }

                          return (
                            <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} placement="right" arrow>
                              <Select
                                size="small"
                                value={selectValue}
                                onChange={async (e) => {
                                  await handleStatusChange(checkIn.id, e.target.value);
                                  // Force refresh after role assignment
                                  await fetchNetRoles();
                                  await fetchCheckIns();
                                }}
                                sx={{ minWidth: 50 }}
                                disabled={owner?.id === checkIn.user_id}
                                MenuProps={{
                                  disableScrollLock: true,
                                  disableAutoFocusItem: false,
                                  autoFocus: true,
                                }}
                                renderValue={(v) => v === 'ncs' ? getNcsIcon(checkIn) : v === 'logger' ? '📋' : getStatusIcon(v as string, checkIn)}
                              >
                                {/* Always render the current value as an option to prevent MUI errors.
                                    Each option shows icon + text label so new NCS users can pick the
                                    correct status without memorizing the icon legend. */}
                                {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">{getNcsIcon(checkIn)}  {getStatusLabel('ncs')}</MenuItem>)}
                                {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋  {getStatusLabel('logger')}</MenuItem>)}
                                <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}  {checkIn.is_recheck ? 'Re-check' : getStatusLabel('checked_in')}</MenuItem>
                                <MenuItem value="listening">👂  {getStatusLabel('listening')}</MenuItem>
                                <MenuItem value="relay">📡  {getStatusLabel('relay')}</MenuItem>
                                <MenuItem value="away">⏸️  {getStatusLabel('away')}</MenuItem>
                                <MenuItem value="has_traffic">🚨  {getStatusLabel('has_traffic')}</MenuItem>
                                <MenuItem value="announcements">📢  {getStatusLabel('announcements')}</MenuItem>
                                <MenuItem value="mobile">🚗  {getStatusLabel('mobile')}</MenuItem>
                                {(canManageCheckIns || checkIn.user_id === user?.id) && <MenuItem value="checked_out">👋  {getStatusLabel('checked_out')}</MenuItem>}
                              </Select>
                            </Tooltip>
                          );
                        })() : (
                          <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} placement="right" arrow>
                            <span style={{ cursor: 'help' }}>{getStatusIcon(checkIn.status, checkIn)}</span>
                          </Tooltip>
                        )}
                      </TableCell>
                      {/* Callsign cell - inline editable */}
                      <TableCell data-field="callsign" sx={{ width: 140 }}>
                        {isInlineEditing ? (
                          <TextField
                            size="small"
                            value={inlineEditValues.callsign || ''}
                            onChange={(e) => handleInlineFieldChange('callsign', e.target.value.toUpperCase())}
                            onKeyDown={handleInlineKeyDown}
                            onBlur={handleInlineBlur}
                            autoFocus={inlineEditFocusField === 'callsign'}
                            inputProps={{ style: { textTransform: 'uppercase', padding: '4px 8px' } }}
                            sx={{ width: '100%' }}
                          />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box
                              onClick={() => checkIn.user_id && setProfileUserId(checkIn.user_id)}
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
                            <Box sx={{ fontWeight: 500 }}>
                              {checkIn.callsign}
                            </Box>
                            {checkIn.relayed_by && (
                              <Tooltip title={`Relayed by ${checkIn.relayed_by}`} arrow>
                                <span style={{ cursor: 'help' }}>📡</span>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      {/* Name cell - inline editable */}
                      {net?.field_config?.name?.enabled && (
                        <TableCell data-field="name">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.name || ''}
                              onChange={(e) => handleInlineFieldChange('name', e.target.value)}
                              onKeyDown={handleInlineKeyDown} 
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'name'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.name}
                        </TableCell>
                      )}
                      {/* Location cell - inline editable */}
                      {net?.field_config?.location?.enabled && (
                        <TableCell data-field="location">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.location || ''}
                              onChange={(e) => handleInlineFieldChange('location', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'location'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.location}
                        </TableCell>
                      )}
                      {/* Skywarn Number - inline editable */}
                      {net?.field_config?.skywarn_number?.enabled && (
                        <TableCell data-field="skywarn_number" sx={{ width: 70 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.skywarn_number || ''}
                              onChange={(e) => handleInlineFieldChange('skywarn_number', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'skywarn_number'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.skywarn_number}
                        </TableCell>
                      )}
                      {/* Weather Observation - inline editable */}
                      {net?.field_config?.weather_observation?.enabled && (
                        <TableCell data-field="weather_observation">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.weather_observation || ''}
                              onChange={(e) => handleInlineFieldChange('weather_observation', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'weather_observation'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.weather_observation}
                        </TableCell>
                      )}
                      {/* Power Source - inline editable */}
                      {net?.field_config?.power_source?.enabled && (
                        <TableCell data-field="power_source" sx={{ width: 70 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.power_source || ''}
                              onChange={(e) => handleInlineFieldChange('power_source', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'power_source'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.power_source}
                        </TableCell>
                      )}
                      {/* Power - inline editable */}
                      {net?.field_config?.power?.enabled && (
                        <TableCell data-field="power" sx={{ width: 70 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.power || ''}
                              onChange={(e) => handleInlineFieldChange('power', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'power'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.power}
                        </TableCell>
                      )}
                      {/* Notes - inline editable */}
                      {net?.field_config?.notes?.enabled && (
                        <TableCell data-field="notes">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.notes || ''}
                              onChange={(e) => handleInlineFieldChange('notes', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'notes'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.notes}
                        </TableCell>
                      )}
                      {/* Custom field values - inline editable */}
                      {getEnabledCustomFields().map((field) => (
                        <TableCell key={field.name} data-field={`custom_${field.name}`}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.custom_fields?.[field.name] || ''}
                              onChange={(e) => handleInlineFieldChange(`custom_${field.name}`, e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === `custom_${field.name}`}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.custom_fields?.[field.name] || ''}
                        </TableCell>
                      ))}
                      {/* Topic response - inline editable */}
                      {net?.topic_of_week_enabled && (
                        <TableCell data-field="topic_response" sx={{ whiteSpace: 'nowrap' }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.topic_response || ''}
                              onChange={(e) => handleInlineFieldChange('topic_response', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'topic_response'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.topic_response || ''}
                        </TableCell>
                      )}
                      {/* Poll response - inline editable */}
                      {net?.poll_enabled && (
                        <TableCell data-field="poll_response" sx={{ whiteSpace: 'nowrap' }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.poll_response || ''}
                              onChange={(e) => handleInlineFieldChange('poll_response', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'poll_response'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.poll_response || ''}
                        </TableCell>
                      )}
                      {/* Relayed By - inline editable */}
                      {hasAnyRelayedBy && (
                        <TableCell data-field="relayed_by" sx={{ width: 80 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.relayed_by || ''}
                              onChange={(e) => handleInlineFieldChange('relayed_by', e.target.value.toUpperCase())}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'relayed_by'}
                              inputProps={{ style: { textTransform: 'uppercase', padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.relayed_by || ''}
                        </TableCell>
                      )}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {formatTimeWithDate(checkIn.checked_in_at, user?.prefer_utc || false, net?.started_at)}
                      </TableCell>
                      {/* Actions column - hand raise, active speaker and delete */}
                      {(canManage || checkIn.user_id === user?.id) && (
                      <TableCell sx={{ width: 70 }} onClick={(e) => e.stopPropagation()}>
                        {/* Step away button - only show when net is active or lobby */}
                        {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (
                          <IconButton
                            size="small"
                            onClick={() => handleStatusChange(checkIn.id, checkIn.status === 'away' ? 'checked_in' : 'away')}
                            color={checkIn.status === 'away' ? 'warning' : 'default'}
                            title={checkIn.status === 'away' ? 'Return from break' : 'Step away'}
                            sx={{ opacity: checkIn.status === 'away' ? 1 : 0.4 }}
                          >
                            <PauseCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        )}
                        {/* Hand Raise button - only show when net is active or lobby */}
                        {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (
                          <IconButton
                            size="small"
                            onClick={() => handleToggleHand(checkIn.id)}
                            color={checkIn.hand_raised ? 'warning' : 'default'}
                            title={checkIn.hand_raised ? 'Lower hand' : 'Raise hand'}
                            sx={{ opacity: checkIn.hand_raised ? 1 : 0.4 }}
                          >
                            <PanToolIcon fontSize="small" />
                          </IconButton>
                        )}
                        {canManage && (
                        <>
                        {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (
                          <IconButton
                            size="small"
                            onClick={() => handleSetActiveSpeaker(checkIn.id)}
                            color={checkIn.id === activeSpeakerId ? 'primary' : 'default'}
                            title="Mark as active speaker"
                          >
                            🗣️
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCheckIn(checkIn.id)}
                          title="Delete check-in"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                        </>
                        )}
                      </TableCell>
                      )}
                      <TableCell />
                    </TableRow>
                    {/* Frequency chips row - only show if net has multiple frequencies */}
                    {hasFrequencyChips && (
                      <TableRow sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : isNcsUser && ncsColor ? ncsColor.bg
                          : isOnActiveFrequency
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)'
                          : 'transparent',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                        // Add left border for NCS users
                        ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                          borderLeft: `3px solid ${ncsColor.border}`,
                        }),
                      }}>
                        <TableCell colSpan={columnCount} sx={{ pt: 0, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 4 }}>
                            {checkIn.available_frequencies!.map((freqId: number) => {
                              const freq = net.frequencies.find((f: any) => f.id === freqId);
                              const isActive = freqId === checkIn.frequency_id;
                              // Get NCS color for this frequency
                              const freqNcsColor = getNcsColorForFrequency(freqId);
                              return freq ? (
                                <Chip 
                                  key={freqId}
                                  label={isActive ? `📡 ${formatFrequencyDisplay(freq)}` : formatFrequencyDisplay(freq)}
                                  size="small"
                                  variant="filled"
                                  sx={{ 
                                    height: 18, 
                                    fontSize: '0.7rem',
                                    // Use NCS color if available, otherwise default styling
                                    ...(freqNcsColor ? {
                                      backgroundColor: freqNcsColor.bg,
                                      borderColor: freqNcsColor.border,
                                      border: `1px solid ${freqNcsColor.border}`,
                                      '& .MuiChip-label': {
                                        color: freqNcsColor.text,
                                      },
                                    } : isActive ? {
                                      backgroundColor: 'primary.main',
                                      '& .MuiChip-label': { color: 'white' },
                                    } : {
                                      backgroundColor: 'action.selected',
                                    }),
                                  }}
                                />
                              ) : null;
                            })}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  )})}
                </TableBody>
              </Table>
            </TableContainer>
  );
};

export default CheckInTable;

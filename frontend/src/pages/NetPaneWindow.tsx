import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNetData } from '../hooks/useNetData';
import { useNetWebSocket } from '../hooks/useNetWebSocket';
import Chat from '../components/Chat';
import ActivityLog from '../components/ActivityLog';
import CheckInMap from '../components/CheckInMap';
import CoverageReport from '../components/netview/CoverageReport';
import TrafficPanel from '../components/netview/TrafficPanel';
import FileTrafficDialog from '../components/netview/FileTrafficDialog';
import CheckInTable from '../components/netview/CheckInTable';
import CanHearDialog from '../components/netview/CanHearDialog';
import { getCheckInActions } from '../components/netview/checkInActions';
import { getCheckInStatusHelpers } from '../components/netview/checkInStatusHelpers';
import { CheckInFormState } from '../components/netview/CheckInFormDialog';
import { canHearApi } from '../services/api';

// NCS color palette for check-in row / frequency-chip coloring — duplicated
// from NetView.tsx (a small static constant, not worth a shared module for).
const NCS_COLORS = [
  { bg: 'rgba(244, 67, 54, 0.15)', border: '#f44336', text: '#f44336' },
  { bg: 'rgba(33, 150, 243, 0.15)', border: '#2196f3', text: '#2196f3' },
  { bg: 'rgba(76, 175, 80, 0.15)', border: '#4caf50', text: '#4caf50' },
  { bg: 'rgba(156, 39, 176, 0.15)', border: '#9c27b0', text: '#9c27b0' },
  { bg: 'rgba(255, 152, 0, 0.15)', border: '#ff9800', text: '#ff9800' },
  { bg: 'rgba(0, 188, 212, 0.15)', border: '#00bcd4', text: '#00bcd4' },
];

const PANE_LABELS: Record<string, string> = {
  chat: 'Chat',
  'activity-log': 'Activity Log',
  'check-ins': 'Check-Ins',
  map: 'Map',
  coverage: 'Station Coverage',
  traffic: 'Traffic',
};

// Bare-bones page rendered inside a real popped-out browser window (see
// usePoppedOutWindow / the "Open in new window" buttons in CheckInTable,
// Chat, and ActivityLog). No Navbar/chrome — App.tsx suppresses those for
// this route. Runs as its own independent SPA instance with its own
// WebSocket connection; it does not share state with the NetView tab that
// opened it. Uses the same useNetData hook NetView uses (rather than a
// second hand-rolled fetch) so the check-ins pane — which needs roles,
// permissions, and the check-in action handlers — isn't duplicating
// NetView's data layer.
const NetPaneWindow: React.FC = () => {
  const { netId, paneType } = useParams<{ netId: string; paneType: string }>();
  const { user } = useAuth();
  const [toastMessage, setToastMessage] = useState('');
  const [, setHighlightCheckIn] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [filteredFrequencyIds, setFilteredFrequencyIds] = useState<number[]>([]);
  const [inlineEditingId, setInlineEditingId] = useState<number | null>(null);
  const [inlineEditValues, setInlineEditValues] = useState<Partial<any>>({});
  const [inlineEditFocusField, setInlineEditFocusField] = useState<string | null>(null);
  const inlineEditRowRef = useRef<HTMLTableRowElement | null>(null);
  // "Can hear" propagation logging: same shape as NetView.tsx - the check-in
  // currently being reported for (dialog open when non-null) and the full
  // report list for this net, refetched on mount and on can_hear_changed.
  const [canHearDialogCheckInId, setCanHearDialogCheckInId] = useState<number | null>(null);
  const [canHearReports, setCanHearReports] = useState<any[]>([]);
  // Coverage overlay on/off for the standalone popped-out map window - a
  // plain local toggle since there's no Coverage panel in this isolated
  // window to cross-link with (see CheckInMap.tsx's lifted-state comment).
  const [mapCoverageOverlayOn, setMapCoverageOverlayOn] = useState(false);
  // Traffic composer for the popped-out Traffic pane (see NetView.tsx).
  const [fileTrafficOpen, setFileTrafficOpen] = useState(false);
  const [checkInForm, setCheckInForm] = useState<CheckInFormState>({
    callsign: '',
    name: '',
    location: '',
    skywarn_number: '',
    weather_observation: '',
    power_source: '',
    power: '',
    feedback: '',
    notes: '',
    relayed_by: '',
    available_frequency_ids: [],
    custom_fields: {},
    topic_response: '',
    poll_response: '',
    status: 'checked_in',
  });

  const {
    net, setNet, checkIns, setCheckIns, netRoles, fieldDefinitions, owner,
    pollResponses, topicResponses,
    fetchNet, fetchCheckIns, fetchNetRoles, fetchNetStats, fetchPollResponses,
  } = useNetData(netId);

  useEffect(() => {
    const label = PANE_LABELS[paneType || ''] || 'Net';
    document.title = net?.name ? `${label} — ${net.name}` : `${label} — ECTLogger`;
  }, [paneType, net?.name]);

  // Fetches the full "can hear" report list for this net - see NetView.tsx's
  // fetchCanHearReports for why this is always a full refetch, never a patch.
  const fetchCanHearReports = async () => {
    if (!netId) return;
    try {
      const response = await canHearApi.list(parseInt(netId));
      setCanHearReports(response.data);
    } catch (error) {
      console.error('Failed to fetch can-hear reports:', error);
    }
  };

  useEffect(() => {
    fetchCanHearReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId]);

  // Own WebSocket connection — a popped-out window is a separate browsing
  // context and cannot share the opener tab's socket.
  const ws = useNetWebSocket({
    netId,
    user,
    fetchCheckIns,
    fetchNet,
    fetchNetRoles,
    fetchNetStats,
    fetchCanHearReports,
    setActiveSpeakerId,
    setCheckIns,
    setToastMessage,
    setHighlightCheckIn,
  });

  // Must run every render (before any early return) so hook count never
  // changes between renders — same constraint noted in NetView.tsx.
  const latestCheckedInAtByCallsign = useMemo(() => {
    const map = new Map<string, string>();
    for (const ci of checkIns) {
      const prev = map.get(ci.callsign);
      if (!prev || ci.checked_in_at > prev) {
        map.set(ci.callsign, ci.checked_in_at);
      }
    }
    return map;
  }, [checkIns]);

  // Check-in ids that already have at least one outgoing "can hear" report -
  // must run before the early return below so hook count never changes.
  const canHearReporterCheckInIds = useMemo(() => {
    return Array.from(new Set(canHearReports.map((r: any) => r.reporter_check_in_id)));
  }, [canHearReports]);

  if (!net) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (paneType === 'chat') {
    return (
      <Box sx={{ height: '100vh', width: '100vw', p: 0.5, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Chat
          netId={Number(netId)}
          netStartedAt={net.started_at}
          netStatus={net.status}
          // user?.role (from useAuth(), already masked by simulateRegularUser)
          // plus net.is_owner_or_ncs (never carries the admin bypass) --
          // NOT net.can_manage, which does and would leak a simulating
          // admin's real access back in. Matches the canManage formula
          // further down this file and in NetView.tsx.
          canManage={user?.role === 'admin' || !!net.is_owner_or_ncs}
          chatGracePeriodMinutes={net.chat_grace_period_minutes ?? undefined}
          closedAt={net.closed_at}
        />
        <Snackbar open={toastMessage !== ''} autoHideDuration={6000} onClose={() => setToastMessage('')} message={toastMessage} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
      </Box>
    );
  }

  if (paneType === 'activity-log') {
    return (
      <Box sx={{ height: '100vh', width: '100vw', p: 0.5, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ActivityLog netId={Number(netId)} />
        <Snackbar open={toastMessage !== ''} autoHideDuration={6000} onClose={() => setToastMessage('')} message={toastMessage} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
      </Box>
    );
  }

  if (paneType === 'map') {
    return (
      <Box sx={{ height: '100vh', width: '100vw', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CheckInMap
          open
          onClose={() => {}}
          checkIns={checkIns}
          netName={net.name || 'Net'}
          ncsUserIds={netRoles.filter((r: any) => r.role === 'NCS').map((r: any) => r.user_id)}
          loggerUserIds={netRoles.filter((r: any) => r.role === 'LOGGER').map((r: any) => r.user_id)}
          relayUserIds={netRoles.filter((r: any) => r.role === 'Relay').map((r: any) => r.user_id)}
          embedded
          canHearReports={canHearReports}
          frequencyLabels={Object.fromEntries(
            (net?.frequencies || []).map((f: any) => [f.id, `${f.frequency || f.network || ''} ${f.mode || ''}`.trim()])
          )}
          coverageOverlayOn={mapCoverageOverlayOn}
          onToggleCoverageOverlay={() => setMapCoverageOverlayOn((v) => !v)}
        />
      </Box>
    );
  }

  if (paneType === 'coverage') {
    return (
      <Box sx={{ height: '100vh', width: '100vw', p: 0.5, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <CoverageReport
          netId={Number(netId)}
          reports={canHearReports}
          showFrequencyColumn={(net.frequencies || []).length > 1}
          frequencyLabels={Object.fromEntries(
            (net?.frequencies || []).map((f: any) => [f.id, `${f.frequency || f.network || ''} ${f.mode || ''}`.trim()])
          )}
        />
      </Box>
    );
  }

  if (paneType === 'traffic') {
    return (
      <Box sx={{ height: '100vh', width: '100vw', p: 0.5, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* No chrome props: in a real window there is nothing to close to,
            detach from, or minimize into — the window controls do that. */}
        <TrafficPanel
          netId={Number(netId)}
          currentUserId={user?.id}
          onCompose={() => setFileTrafficOpen(true)}
        />
        {/* Outside TrafficPanel, matching NetView — the composer must not be
            owned by the panel it is opened from. */}
        <FileTrafficDialog
          netId={Number(netId)}
          net={net}
          open={fileTrafficOpen}
          onClose={() => setFileTrafficOpen(false)}
        />
      </Box>
    );
  }

  // paneType === 'check-ins' — mirrors NetView.tsx's permission derivation
  // and the check-in list's detached FloatingWindow content (table + legend
  // + manual check-in form). No search box or bulk/import/map/stats tools
  // here; this is the check-in table itself, not the whole NetView toolbar.
  const isOwner = user?.id === net.owner_id;
  const isAdmin = user?.role === 'admin';
  const userNetRole = netRoles.find((role: any) => role.user_id === user?.id);
  const isAssignedNCS = userNetRole?.role === 'NCS';
  const isNCS = isAssignedNCS && userNetRole?.is_active !== false;
  const isNCSOrLogger = userNetRole && ((userNetRole.role === 'NCS' && userNetRole.is_active !== false) || userNetRole.role === 'LOGGER');
  // net.is_owner_or_ncs, not net.can_manage -- see NetView.tsx's identical
  // canManage computation for the full explanation (can_manage carries an
  // admin bypass computed from the real/unmasked identity, which leaks
  // through simulateRegularUser's "View as Regular User" mode).
  const canManage = isOwner || isAdmin || isNCS || !!net?.is_owner_or_ncs;
  const canManageCheckIns = canManage || isNCSOrLogger;

  // Relay staff can't manage check-ins generally, but can report "can hear" -
  // see NetView.tsx's identical derivation.
  const isRelay = userNetRole?.role?.toUpperCase() === 'RELAY';
  const canReportCanHear = canManageCheckIns || isRelay;
  const canHearDialogCheckIn = canHearDialogCheckInId !== null
    ? checkIns.find((ci: any) => ci.id === canHearDialogCheckInId) || null
    : null;

  const ncsRoles = netRoles
    .filter((role: any) => role.role === 'NCS')
    .sort((a: any, b: any) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime());

  const { getStatusIcon, getStatusTooltip, getStatusLabel, getNcsIcon } =
    getCheckInStatusHelpers({ net, netRoles, checkIns, ncsRoles });

  const getNcsColor = (userId: number) => {
    const index = ncsRoles.findIndex((r: any) => r.user_id === userId);
    return index >= 0 ? NCS_COLORS[index % NCS_COLORS.length] : null;
  };

  const getNcsColorForFrequency = (frequencyId: number) => {
    const role = ncsRoles.find((r: any) => r.active_frequency_id === frequencyId);
    if (role) {
      const index = ncsRoles.findIndex((r: any) => r.user_id === role.user_id);
      return index >= 0 ? NCS_COLORS[index % NCS_COLORS.length] : null;
    }
    return null;
  };

  const getEnabledCustomFields = () => {
    return (fieldDefinitions as any[]).filter((field: any) =>
      !field.is_builtin && net?.field_config?.[field.name]?.enabled
    );
  };

  const isFieldRequired = (fieldName: string) => net?.field_config?.[fieldName]?.required ?? false;

  const formatFrequencyDisplay = (freq: any) => {
    if (!freq) return '';
    if (freq.frequency) {
      return `${freq.frequency} MHz${freq.mode ? ` (${freq.mode})` : ''}`;
    }
    const label = freq.channel || freq.talkgroup || 'Digital';
    return freq.mode ? `${label} ${freq.mode}` : label;
  };

  const hasAnyRelayedBy = checkIns.some((ci: any) => ci.relayed_by);

  const {
    handleCallsignLookup,
    handleCheckIn,
    handleStatusChange,
    handleDeleteCheckIn,
    handleStartInlineEdit,
    handleInlineFieldChange,
    handleInlineKeyDown,
    handleInlineBlur,
    handleSetActiveSpeaker,
    handleToggleHand,
  } = getCheckInActions({
    netId, net, checkIns, netRoles, user, isOwner, isAdmin, owner,
    canManageCheckIns, userNetRole, ws,
    checkInForm, inlineEditingId, inlineEditValues, activeSpeakerId, inlineEditRowRef,
    setCheckInForm, setToastMessage, setInlineEditingId, setInlineEditFocusField,
    setInlineEditValues, setCheckIns, setActiveSpeakerId, setNet, setFilteredFrequencyIds,
    fetchCheckIns, fetchNetRoles, fetchPollResponses,
  });

  // Only promote NCS users who checked in before the first non-NCS station —
  // see NetView.tsx for why (template-staff bulk role assignment).
  const firstNonNcsCheckInTime = checkIns
    .filter((ci: any) => !ncsRoles.some((r: any) => r.user_id === ci.user_id))
    .reduce((min: number, ci: any) => Math.min(min, new Date(ci.checked_in_at).getTime()), Infinity);

  const filteredCheckIns = checkIns.filter((checkIn: any) => {
    if (filteredFrequencyIds.length > 0) {
      const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
      if (!isNcsUser) {
        const checkInFreqs = checkIn.available_frequencies || [];
        const hasMatchingFreq = filteredFrequencyIds.some((fid) => checkInFreqs.includes(fid));
        if (!hasMatchingFreq) return false;
      }
    }
    if (hideDuplicates) {
      const latest = latestCheckedInAtByCallsign.get(checkIn.callsign);
      if (latest && checkIn.checked_in_at < latest) return false;
    }
    return true;
  }).sort((a: any, b: any) => {
    const aIsNcs = ncsRoles.some((r: any) => r.user_id === a.user_id) &&
                   new Date(a.checked_in_at).getTime() < firstNonNcsCheckInTime;
    const bIsNcs = ncsRoles.some((r: any) => r.user_id === b.user_id) &&
                   new Date(b.checked_in_at).getTime() < firstNonNcsCheckInTime;
    if (aIsNcs !== bIsNcs) return aIsNcs ? -1 : 1;
    if (net?.mobile_priority_sort !== false) {
      const aIsMobile = a.status === 'mobile';
      const bIsMobile = b.status === 'mobile';
      if (aIsMobile !== bIsMobile) return aIsMobile ? -1 : 1;
    }
    return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime();
  });

  const showCheckInForm = (net.status === 'active' || net.status === 'lobby') && canManageCheckIns;

  return (
    <Box sx={{ height: '100vh', width: '100vw', p: 0.5, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <CheckInTable
        detached
        net={net}
        filteredCheckIns={filteredCheckIns}
        netRoles={netRoles}
        ncsRoles={ncsRoles}
        owner={owner}
        user={user}
        onlineUserIds={[]}
        activeSpeakerId={activeSpeakerId}
        latestCheckedInAtByCallsign={latestCheckedInAtByCallsign}
        hasAnyRelayedBy={hasAnyRelayedBy}
        hideDuplicates={hideDuplicates}
        canManage={canManage}
        canManageCheckIns={canManageCheckIns}
        inlineEditingId={inlineEditingId}
        inlineEditValues={inlineEditValues}
        inlineEditFocusField={inlineEditFocusField}
        inlineEditRowRef={inlineEditRowRef}
        getNcsColor={getNcsColor}
        getNcsColorForFrequency={getNcsColorForFrequency}
        getEnabledCustomFields={getEnabledCustomFields}
        isFieldRequired={isFieldRequired}
        formatFrequencyDisplay={formatFrequencyDisplay}
        getStatusIcon={getStatusIcon}
        getStatusTooltip={getStatusTooltip}
        getStatusLabel={getStatusLabel}
        getNcsIcon={getNcsIcon}
        setHideDuplicates={setHideDuplicates}
        handleDetachCheckInList={() => {}}
        handleStartInlineEdit={handleStartInlineEdit}
        handleInlineFieldChange={handleInlineFieldChange}
        handleInlineKeyDown={handleInlineKeyDown}
        handleInlineBlur={handleInlineBlur}
        handleStatusChange={handleStatusChange}
        fetchNetRoles={fetchNetRoles}
        fetchCheckIns={fetchCheckIns}
        handleToggleHand={handleToggleHand}
        handleSetActiveSpeaker={handleSetActiveSpeaker}
        handleDeleteCheckIn={handleDeleteCheckIn}
        setProfileUserId={() => {}}
        canReportCanHear={canReportCanHear}
        canHearReporterCheckInIds={canHearReporterCheckInIds}
        onOpenCanHearDialog={setCanHearDialogCheckInId}
      />

      {/* "Who can this station hear?" dialog - same component NetView.tsx uses */}
      {canHearDialogCheckIn && netId && (
        <CanHearDialog
          key={canHearDialogCheckIn.id}
          open
          onClose={() => setCanHearDialogCheckInId(null)}
          netId={Number(netId)}
          net={net}
          reporterCheckIn={canHearDialogCheckIn}
          allCheckIns={checkIns}
          existingReports={canHearReports}
          onSaved={() => setCanHearDialogCheckInId(null)}
          onToast={setToastMessage}
        />
      )}

      {/* Legend */}
      <Box sx={{ p: 0.5, backgroundColor: 'action.hover', border: 1, borderColor: 'divider', borderTop: 0, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Legend:</Typography>
          <Tooltip title="Net Control Station" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👑 NCS</Typography></Tooltip>
          <Tooltip title="2nd NCS" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🤴 2nd NCS</Typography></Tooltip>
          <Tooltip title="Logger" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📋 Logger</Typography></Tooltip>
          <Tooltip title="Checked in" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>✅ Standard</Typography></Tooltip>
          <Tooltip title="Re-check" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🔄 Recheck</Typography></Tooltip>
          <Tooltip title="Listening only" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👂 Listening</Typography></Tooltip>
          <Tooltip title="Relay station" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📡 Relay</Typography></Tooltip>
          <Tooltip title="Away" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>⏸️ Away</Typography></Tooltip>
          <Tooltip title="Has traffic" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🚨 Traffic</Typography></Tooltip>
          <Tooltip title="Has announcements" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📢 Announce</Typography></Tooltip>
          <Tooltip title="Checked out" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👋 Out</Typography></Tooltip>
          {showCheckInForm && (
            <Tooltip title="Click any row to edit check-in details inline" placement="top" arrow>
              <Typography variant="caption" sx={{ cursor: 'help', color: 'primary.main', fontStyle: 'italic' }}>
                💡 Click row to edit
              </Typography>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Check-in form */}
      {showCheckInForm && (
        <Paper sx={{ border: 1, borderColor: 'divider', borderTop: 0, borderRadius: '0 0 4px 4px', p: 1, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              value={checkInForm.callsign}
              onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
              onBlur={(e) => handleCallsignLookup(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCheckIn(); } }}
              placeholder="Callsign *"
              inputProps={{ style: { textTransform: 'uppercase' } }}
              sx={{ width: 120 }}
              required
            />
            {net?.field_config?.name?.enabled && (
              <TextField size="small" value={checkInForm.name} onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })} placeholder="Name" autoComplete="off" sx={{ width: 120 }} />
            )}
            {net?.field_config?.location?.enabled && (
              <TextField size="small" value={checkInForm.location} onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })} placeholder="Location" sx={{ width: 150 }} />
            )}
            {net?.field_config?.skywarn_number?.enabled && (
              <TextField size="small" value={checkInForm.skywarn_number} onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })} placeholder="Spotter #" sx={{ width: 100 }} />
            )}
            {net?.field_config?.notes?.enabled && (
              <TextField size="small" value={checkInForm.notes} onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })} placeholder="Notes" sx={{ flex: 1, minWidth: 150 }} />
            )}
            {net?.topic_of_week_enabled && (
              <Autocomplete
                freeSolo
                size="small"
                options={topicResponses.responses.map((r) => r.response)}
                value={checkInForm.topic_response || ''}
                onChange={(_, newValue) => setCheckInForm({ ...checkInForm, topic_response: newValue || '' })}
                onInputChange={(_, newInputValue) => setCheckInForm({ ...checkInForm, topic_response: newInputValue })}
                renderInput={(params) => (
                  <TextField {...params} placeholder={net?.topic_of_week_prompt?.substring(0, 15) + '...' || 'Topic...'} sx={{ width: 120 }} />
                )}
                sx={{ width: 120 }}
              />
            )}
            {net?.poll_enabled && (
              <Autocomplete
                freeSolo
                size="small"
                options={pollResponses}
                value={checkInForm.poll_response || ''}
                onChange={(_, newValue) => setCheckInForm({ ...checkInForm, poll_response: newValue || '' })}
                onInputChange={(_, newInputValue) => setCheckInForm({ ...checkInForm, poll_response: newInputValue })}
                renderInput={(params) => (
                  <TextField {...params} placeholder={net?.poll_question?.substring(0, 15) + '...' || 'Poll...'} sx={{ width: 120 }} />
                )}
                sx={{ width: 120 }}
              />
            )}
            <TextField
              size="small"
              value={checkInForm.relayed_by}
              onChange={(e) => setCheckInForm({ ...checkInForm, relayed_by: e.target.value.toUpperCase() })}
              placeholder="Relayed By"
              inputProps={{ style: { textTransform: 'uppercase' } }}
              sx={{ width: 100 }}
            />
            <Button variant="contained" onClick={handleCheckIn} disabled={!checkInForm.callsign} size="small">
              Add
            </Button>
          </Box>
        </Paper>
      )}

      <Snackbar open={toastMessage !== ''} autoHideDuration={6000} onClose={() => setToastMessage('')} message={toastMessage} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
};

export default NetPaneWindow;

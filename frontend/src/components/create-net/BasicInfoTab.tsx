import React from 'react';
import {
  TextField,
  Typography,
  Box,
  Select,
  MenuItem,
  Button,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useCreateNetContext } from '../../contexts/CreateNetContext';
import NetFeaturesPanel, { FeatureSwitch } from '../forms/NetFeaturesPanel';
import CoverageSitesEditor from '../forms/CoverageSitesEditor';
import NetLogoSection from '../NetLogoSection';
import { draftsToPayload } from '../../utils/siteDrafts';

// ========== NET TIMING SWITCHES ==========
// Chat grace, lobby and auto-close for this net, shown in General Net
// Features after the shared switches. The schedule form keeps these on its
// Schedule tab, where they depend on the schedule type.
const NetTimingSwitches: React.FC = () => {
  const {
    chatGracePeriodEnabled, setChatGracePeriodEnabled,
    chatGracePeriodMinutes, setChatGracePeriodMinutes,
    autoLobbyEnabled, setAutoLobbyEnabled,
    autoLobbyMinutes, setAutoLobbyMinutes,
    autoCloseEnabled, setAutoCloseEnabled,
    autoCloseAfterMinutes, setAutoCloseAfterMinutes,
    scheduledStartTime,
  } = useCreateNetContext();

  return (
    <>
      <FeatureSwitch
        label="Keep chat open after closing"
        caption="Chat stays open for a set time after the net closes, so participants can wrap up off-air conversations before it goes read-only."
        checked={chatGracePeriodEnabled}
        onChange={setChatGracePeriodEnabled}
      >
        {/* Shows when the chat grace period is on */}
        {chatGracePeriodEnabled && (
          <Box sx={{ ml: 4.5 }}>
            <Select
              size="small" value={chatGracePeriodMinutes}
              onChange={(e) => setChatGracePeriodMinutes(Number(e.target.value))}
            >
              <MenuItem value={15}>15 minutes</MenuItem>
              <MenuItem value={30}>30 minutes</MenuItem>
              <MenuItem value={60}>60 minutes</MenuItem>
            </Select>
          </Box>
        )}
      </FeatureSwitch>

      {/* Lobby, no start time: nothing to count down from, so the switch
          only decides whether Open lobby is offered next to Start net
          (utils/netStart.ts::canOpenLobby). Same control as the schedule
          form's Ad-Hoc case. Until 2026-10-22 this form hid the lobby
          setting entirely without a start time, so a one-time net saved
          with none could never offer Open lobby (net 137). */}
      {!scheduledStartTime && (
        <FeatureSwitch
          label="Enable lobby"
          caption="This net has no start time, so there's nothing to count down from. When this is on, the net shows an Open lobby button next to Start net, so stations can check in and chat before Net Control clicks Go Live."
          checked={autoLobbyEnabled}
          onChange={setAutoLobbyEnabled}
        />
      )}

      {/* Auto-open lobby: needs a scheduled start time to count back from.
          Inherited from the schedule; changing it here affects this net only. */}
      {!!scheduledStartTime && (
        <FeatureSwitch
          label="Open the lobby automatically before the net"
          caption="Stations can check in and chat ahead of the official start without waiting for Net Control to open the net. Turn this off if you aren't sure this net will run."
          checked={autoLobbyEnabled}
          onChange={setAutoLobbyEnabled}
        >
          {/* Shows when auto-open is on */}
          {autoLobbyEnabled && (
            <Box sx={{ ml: 4.5 }}>
              <Select
                size="small" value={autoLobbyMinutes}
                onChange={(e) => setAutoLobbyMinutes(Number(e.target.value))}
              >
                <MenuItem value={5}>5 minutes before</MenuItem>
                <MenuItem value={10}>10 minutes before</MenuItem>
                <MenuItem value={15}>15 minutes before</MenuItem>
                <MenuItem value={30}>30 minutes before</MenuItem>
                <MenuItem value={60}>60 minutes before</MenuItem>
              </Select>
            </Box>
          )}
        </FeatureSwitch>
      )}

      {/* Auto-close on inactivity: independent of a scheduled start time,
          unlike auto-open lobby above; based on the last check-in/recheck
          or chat message instead of the clock. */}
      <FeatureSwitch
        label="Close this net automatically after inactivity"
        caption="If nobody checks in, rechecks, or chats for this long, the net closes itself and the usual closing log still goes out. Off by default — leave off for a SKYWARN/ARES activation that may go hours between check-ins."
        checked={autoCloseEnabled}
        onChange={setAutoCloseEnabled}
      >
        {/* Shows when auto-close is on */}
        {autoCloseEnabled && (
          <Box sx={{ ml: 4.5 }}>
            <Select
              size="small" value={autoCloseAfterMinutes}
              onChange={(e) => setAutoCloseAfterMinutes(Number(e.target.value))}
            >
              <MenuItem value={60}>1 hour of inactivity</MenuItem>
              <MenuItem value={120}>2 hours of inactivity</MenuItem>
              <MenuItem value={180}>3 hours of inactivity</MenuItem>
              <MenuItem value={240}>4 hours of inactivity</MenuItem>
            </Select>
          </Box>
        )}
      </FeatureSwitch>
    </>
  );
};

// ========== TAB 0: BASIC INFO ==========
// Net name, description, URLs, stream URL, scheduled start time, logo,
// actual times, then the feature switches (components/forms/NetFeaturesPanel.tsx)

const BasicInfoTab: React.FC = () => {
  const ctx = useCreateNetContext();
  const {
    name, setName,
    description, setDescription,
    infoUrl, setInfoUrl,
    streamUrl, setStreamUrl,
    logoUrl, setLogoUrl,
    propagationLoggingEnabled,
    coverageSites, setCoverageSites,
    frequencies, selectedFrequencyIds,
    topicHistory,
    scheduledStartTime, setScheduledStartTime,
    startedAt, setStartedAt,
    closedAt, setClosedAt,
    onSaveTimes,
    netId,
    isEditMode,
    featureSections,
  } = ctx;

  return (
    <>
      <Typography variant="h6" gutterBottom>Net Information</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter the basic information about this net.
      </Typography>

      <TextField
        fullWidth label="Net Name" value={name}
        onChange={(e: any) => setName(e.target.value)}
        margin="normal" required
        placeholder="e.g., SKYWARN Net, Emergency Comm Net"
      />

      <TextField
        fullWidth label="Description" value={description}
        onChange={(e: any) => setDescription(e.target.value)}
        margin="normal" multiline rows={4}
        placeholder="Describe the purpose and scope of this net..."
      />

      <TextField
        fullWidth label="Info URL" value={infoUrl}
        onChange={(e: any) => setInfoUrl(e.target.value)}
        margin="normal"
        placeholder="https://example.com/club-info"
        helperText="Optional link to club, organization, or net information page"
      />

      <TextField
        fullWidth label="Audio Stream URL" value={streamUrl}
        onChange={(e: any) => setStreamUrl(e.target.value)}
        margin="normal"
        placeholder="https://broadcastify.com/listen/... or Shoutcast URL"
        helperText="Optional. Direct audio stream URL (Shoutcast, Broadcastify, etc.) for net listeners"
      />

      {/* Logo — only once the net exists (upload needs an id). Shown on net
          cards and to the left of the net name on the check-in page. */}
      {isEditMode && netId && (
        <NetLogoSection
          entityType="net"
          entityId={Number(netId)}
          logoUrl={logoUrl}
          onLogoChange={setLogoUrl}
        />
      )}

      {/* Scheduled Start Time — countdown timer */}
      <TextField
        fullWidth label="Scheduled Start Time" type="datetime-local"
        value={scheduledStartTime}
        onChange={(e: any) => setScheduledStartTime(e.target.value)}
        margin="normal" InputLabelProps={{ shrink: true }}
        helperText="Optional. If set, a countdown timer will be displayed before the net starts."
      />

      {/* Actual Start/End Time — correction, only once the net has actually
          run. Editable on both Edit Net (active nets) and the read-only Net
          Info page (closed/archived nets), since staff still need to fix
          these for accurate logs after a net closes. */}
      {!!startedAt && (
        <Box sx={{ mt: 2, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>Actual Net Times</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Correct the recorded start/end times if the net was started or closed late (or early).
            This affects the official log, not the countdown timer above.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              label="Actual Start Time" type="datetime-local"
              value={startedAt}
              onChange={(e: any) => setStartedAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: '1 1 220px' }}
            />
            <TextField
              label="Actual End Time" type="datetime-local"
              value={closedAt}
              onChange={(e: any) => setClosedAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: '1 1 220px' }}
            />
            <Button variant="outlined" onClick={onSaveTimes}>Save Times</Button>
          </Box>
        </Box>
      )}

      {/* ========== FEATURES ========== */}
      {/* Shared with the schedule form; this net's own extras are passed in */}
      <NetFeaturesPanel
        scope="net"
        fields={ctx}
        sections={featureSections}
        topicHistory={topicHistory}
        generalExtra={<NetTimingSwitches />}
        sites={{
          count: draftsToPayload(coverageSites).length,
          editor: (
            // Any net may have sites (shelters, aid stations); coverage logging
            // adds repeaters/nodes and primary sites to the same list.
            <CoverageSitesEditor
              sites={coverageSites}
              setSites={setCoverageSites}
              frequencies={frequencies.filter((f) => f.id != null && selectedFrequencyIds.includes(f.id))}
              netId={isEditMode && netId ? Number(netId) : undefined}
              coverage={propagationLoggingEnabled}
            />
          ),
        }}
        aresExtra={
          // Drill plan: its own page, so only once the net exists
          isEditMode && netId ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Drill plan</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                For an exercise: the scenario, objectives, and schedule of events, with prepared ICS-213s for the
                sites that send them, and a printed packet for each site.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AssignmentIcon />}
                href={`/nets/${netId}/drill-plan`}
                target="_blank"
                rel="noopener"
              >
                Open drill plan
              </Button>
            </Box>
          ) : undefined
        }
      />
    </>
  );
};

export default BasicInfoTab;

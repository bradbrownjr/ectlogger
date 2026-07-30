import React from 'react';
import {
  TextField,
  Typography,
  Box,
  FormControlLabel,
  FormGroup,
  Switch,
} from '@mui/material';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 0: BASIC INFO ==========
// Name, description, general net features, community features, ARES/EmComm features, active flag

const BasicInfoTab: React.FC = () => {
  const {
    name, setName,
    description, setDescription,
    infoUrl, setInfoUrl,
    ics309Enabled, setIcs309Enabled,
    mobilePrioritySort, setMobilePrioritySort,
    selfCheckinEnabled, setSelfCheckinEnabled,
    topicOfWeekEnabled, setTopicOfWeekEnabled,
    topicOfWeekPrompt, setTopicOfWeekPrompt,
    pollEnabled, setPollEnabled,
    pollQuestion, setPollQuestion,
    isEdit,
  } = useCreateScheduleContext();

  return (
    <>
      <TextField
        fullWidth
        label="Schedule Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        margin="normal"
        required
        helperText="e.g., 'Weekly SKYWARN Net', 'Monthly Emergency Preparedness Net'"
      />

      <TextField
        fullWidth
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        margin="normal"
        multiline
        rows={4}
        helperText="Optional description of the net schedule"
      />

      <TextField
        fullWidth
        label="Info URL"
        value={infoUrl}
        onChange={(e) => setInfoUrl(e.target.value)}
        margin="normal"
        type="url"
        placeholder="https://example.com/net-info"
        helperText="Optional URL for net, club or organization info"
      />

      {/* ========== General Net Features ========== */}
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
        General Net Features
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Common check-in and chat behavior for any net.
      </Typography>

      <FormGroup>
        <Box sx={{ ml: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={mobilePrioritySort}
                onChange={(e) => setMobilePrioritySort(e.target.checked)}
              />
            }
            label="Prioritize mobile stations in check-in list"
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
            Mobile stations appear at the top of the check-in list (after NCS) so they can be called before they move out of range. Disable for strict chronological order.
          </Typography>
        </Box>

        <Box sx={{ ml: 1, mt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={selfCheckinEnabled}
                onChange={(e) => setSelfCheckinEnabled(e.target.checked)}
              />
            }
            label="Allow self check-in"
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
            When disabled, stations can't check themselves in from the app; only Net Control and logging staff can add check-ins. Use this if self check-in causes confusion alongside voice roll call.
          </Typography>
        </Box>
      </FormGroup>

      {/* ========== Community Net Features ========== */}
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
        Community Net Features
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Optional features to encourage participation in informal community nets.
      </Typography>

      <FormGroup>
        <Box sx={{ ml: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={topicOfWeekEnabled}
                onChange={(e) => setTopicOfWeekEnabled(e.target.checked)}
              />
            }
            label="Topic of the Week"
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5, mb: 1 }}>
            Adds a topic response field to check-ins. Great for icebreaker questions.
          </Typography>
          {topicOfWeekEnabled && (
            <TextField
              fullWidth
              label="Default Topic Prompt"
              value={topicOfWeekPrompt}
              onChange={(e) => setTopicOfWeekPrompt(e.target.value)}
              placeholder="e.g., What's your favorite radio memory?"
              helperText="This can be changed when starting each net"
              sx={{ mt: 1, mb: 2, ml: 4.5, width: 'calc(100% - 36px)' }}
            />
          )}

          <FormControlLabel
            control={
              <Switch
                checked={pollEnabled}
                onChange={(e) => setPollEnabled(e.target.checked)}
              />
            }
            label="Participant Poll"
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5, mb: 1 }}>
            Adds a poll question to check-ins with auto-complete for consistent answers.
          </Typography>
          {pollEnabled && (
            <TextField
              fullWidth
              label="Default Poll Question"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="e.g., What band do you operate most?"
              helperText="This can be changed when starting each net"
              sx={{ mt: 1, mb: 2, ml: 4.5, width: 'calc(100% - 36px)' }}
            />
          )}
        </Box>
      </FormGroup>

      {/* ========== ARES & EmComm Features ========== */}
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 'bold' }}>
        ARES &amp; EmComm Features
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Features for emergency communications and formal net operations.
      </Typography>

      <FormGroup>
        <Box sx={{ ml: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={ics309Enabled}
                onChange={(e) => setIcs309Enabled(e.target.checked)}
              />
            }
            label="Enable ICS-309 Communications Log format"
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
            When enabled, net close emails will use the official ICS-309 format used by ARES, RACES, and EmComm organizations.
          </Typography>
        </Box>
      </FormGroup>

      {/* Owner selector is in the Net Staff tab alongside the rotation. */}
    </>
  );
};

export default BasicInfoTab;

import React from 'react';
import {
  TextField,
  Typography,
  Box,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
  Autocomplete,
} from '@mui/material';
import { useCreateNetContext } from '../../contexts/CreateNetContext';

// ========== TAB 0: BASIC INFO ==========
// Net name, description, URLs, stream URL, scheduled start time,
// ARES/EmComm features, and community net features (topic/poll)

const BasicInfoTab: React.FC = () => {
  const {
    name, setName,
    description, setDescription,
    infoUrl, setInfoUrl,
    streamUrl, setStreamUrl,
    ics309Enabled, setIcs309Enabled,
    mobilePrioritySort, setMobilePrioritySort,
    chatGracePeriodEnabled, setChatGracePeriodEnabled,
    chatGracePeriodMinutes, setChatGracePeriodMinutes,
    topicOfWeekEnabled, setTopicOfWeekEnabled,
    topicOfWeekPrompt, setTopicOfWeekPrompt,
    topicHistory,
    pollEnabled, setPollEnabled,
    pollQuestion, setPollQuestion,
    scheduledStartTime, setScheduledStartTime,
    isInfoMode,
  } = useCreateNetContext();

  return (
    <>
      <Typography variant="h6" gutterBottom>Net Information</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter the basic information about this net.
      </Typography>

      <TextField
        fullWidth label="Net Name" value={name}
        onChange={(e: any) => setName(e.target.value)}
        margin="normal" required={!isInfoMode}
        placeholder="e.g., SKYWARN Net, Emergency Comm Net"
        InputProps={{ readOnly: isInfoMode }}
      />

      <TextField
        fullWidth label="Description" value={description}
        onChange={(e: any) => setDescription(e.target.value)}
        margin="normal" multiline rows={4}
        placeholder="Describe the purpose and scope of this net..."
        InputProps={{ readOnly: isInfoMode }}
      />

      <TextField
        fullWidth label="Info URL" value={infoUrl}
        onChange={(e: any) => setInfoUrl(e.target.value)}
        margin="normal"
        placeholder="https://example.com/club-info"
        helperText={isInfoMode && infoUrl ? <a href={infoUrl} target="_blank" rel="noopener noreferrer">Open link</a> : "Optional link to club, organization, or net information page"}
        InputProps={{ readOnly: isInfoMode }}
      />

      <TextField
        fullWidth label="Audio Stream URL" value={streamUrl}
        onChange={(e: any) => setStreamUrl(e.target.value)}
        margin="normal"
        placeholder="https://broadcastify.com/listen/... or Shoutcast URL"
        helperText="Optional. Direct audio stream URL (Shoutcast, Broadcastify, etc.) for net listeners"
        InputProps={{ readOnly: isInfoMode }}
      />

      {/* Scheduled Start Time — countdown timer */}
      {!isInfoMode && (
        <TextField
          fullWidth label="Scheduled Start Time" type="datetime-local"
          value={scheduledStartTime}
          onChange={(e: any) => setScheduledStartTime(e.target.value)}
          margin="normal" InputLabelProps={{ shrink: true }}
          helperText="Optional. If set, a countdown timer will be displayed before the net starts."
        />
      )}

      {/* ========== ARES / EmComm Features ========== */}
      {!isInfoMode && (
        <>
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={ics309Enabled} onChange={(e) => setIcs309Enabled(e.target.checked)} />}
              label="Enable ICS-309 Communications Log format"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
              When enabled, net close emails will use the official ICS-309 format used by ARES, RACES, and EmComm organizations.
            </Typography>
          </Box>

          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={mobilePrioritySort} onChange={(e) => setMobilePrioritySort(e.target.checked)} />}
              label="Prioritize mobile stations in check-in list"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
              When enabled, mobile stations appear at the top of the check-in list (after NCS) so they can be called before they move out of range. Disable for strict chronological order.
            </Typography>
          </Box>

          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={chatGracePeriodEnabled} onChange={(e) => setChatGracePeriodEnabled(e.target.checked)} />}
              label="Keep chat open after closing"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5, mb: chatGracePeriodEnabled ? 1 : 0 }}>
              Chat stays open for a set time after the net closes, so participants can wrap up off-air conversations before it goes read-only.
            </Typography>
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
          </Box>
        </>
      )}

      {/* ========== Community Net Features ========== */}
      {!isInfoMode && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
            Community Net Features
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Optional features for informal community nets to increase engagement and collect fun responses from participants.
          </Typography>

          {/* Topic of the Week */}
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={topicOfWeekEnabled} onChange={(e) => setTopicOfWeekEnabled(e.target.checked)} />}
              label="Topic of the Week"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
              Ask participants a question during check-in. Responses are collected and can be exported for club newsletters or blogs.
            </Typography>
            {topicOfWeekEnabled && (
              <Autocomplete
                freeSolo
                options={topicHistory}
                value={topicOfWeekPrompt}
                onChange={(_, newValue) => setTopicOfWeekPrompt(newValue || '')}
                onInputChange={(_, newInputValue) => setTopicOfWeekPrompt(newInputValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Topic Question" margin="normal"
                    placeholder="e.g., What's your favorite radio or antenna?"
                    helperText={topicHistory.length > 0 ? 'Select from prior topics or enter a new one' : 'The question to ask participants during check-in'}
                  />
                )}
                sx={{ ml: 4.5, width: 'calc(100% - 36px)' }}
              />
            )}
          </Box>

          {/* Poll */}
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={pollEnabled} onChange={(e) => setPollEnabled(e.target.checked)} />}
              label="Participant Poll"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
              Run a quick poll during the net. Answers are auto-completed to ensure consistent tracking and results are shown as a chart.
            </Typography>
            {pollEnabled && (
              <TextField
                fullWidth label="Poll Question" value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                margin="normal"
                placeholder="e.g., What mode do you use most: SSB, FM, or Digital?"
                helperText="The poll question - NCS will enter responses with autocomplete to ensure consistency"
                sx={{ ml: 4.5, width: 'calc(100% - 36px)' }}
              />
            )}
          </Box>
        </>
      )}
    </>
  );
};

export default BasicInfoTab;

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Autocomplete,
  Chip,
  CircularProgress,
} from '@mui/material';
import type { UseDialogResult } from '../../hooks/useDialog';

// ========== NET CONTROL DIALOGS ==========
// The small NCS/owner net-control modals grouped in one place: Close Net,
// Subscribe-to-schedule, Topic/Poll configuration, and Available Frequencies.
// Each is purely presentational; the parent owns all state and actions.
// Grouped to keep NetView's JSX lean without a file per tiny dialog.

interface NetControlDialogsProps {
  // Close Net
  closeNetDialog: UseDialogResult;
  onCloseNet: () => void;

  // Subscribe to schedule
  subscribeDialog: UseDialogResult;
  netName: string | undefined;
  subscribing: boolean;
  onSkipSubscribe: () => void;
  onSubscribe: () => void;

  // Topic / Poll configuration
  topicPollDialog: UseDialogResult;
  topicEnabled: boolean;
  pollEnabled: boolean;
  tempTopicPrompt: string;
  setTempTopicPrompt: (v: string) => void;
  tempPollQuestion: string;
  setTempPollQuestion: (v: string) => void;
  onSaveAndStart: () => void;

  // Available frequencies
  frequencyDialog: UseDialogResult;
  frequencies: any[] | undefined;
  availableFrequencyIds: number[];
  onAvailableFrequencyIdsChange: (ids: number[]) => void;
  formatFrequency: (freq: any) => string;
}

const NetControlDialogs: React.FC<NetControlDialogsProps> = ({
  closeNetDialog,
  onCloseNet,
  subscribeDialog,
  netName,
  subscribing,
  onSkipSubscribe,
  onSubscribe,
  topicPollDialog,
  topicEnabled,
  pollEnabled,
  tempTopicPrompt,
  setTempTopicPrompt,
  tempPollQuestion,
  setTempPollQuestion,
  onSaveAndStart,
  frequencyDialog,
  frequencies,
  availableFrequencyIds,
  onAvailableFrequencyIdsChange,
  formatFrequency,
}) => {
  return (
    <>
      {/* ========== CLOSE NET DIALOG ========== */}
      <Dialog
        open={closeNetDialog.open}
        onClose={closeNetDialog.onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCloseNet();
          }
        }}
      >
        <DialogTitle>Close Net?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to close this net? This will end the session and send log emails to subscribers.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeNetDialog.onClose}>Cancel</Button>
          <Button onClick={onCloseNet} variant="contained" color="error">
            Close Net
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== SUBSCRIBE TO SCHEDULE DIALOG ========== */}
      {/* Shown after a net closes if user checked in and isn't already subscribed */}
      <Dialog
        open={subscribeDialog.open}
        onClose={onSkipSubscribe}
        maxWidth="sm"
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle>
          📬 Subscribe to Future Nets?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Thanks for checking in to <strong>{netName}</strong>!
          </Typography>
          <Typography>
            Would you like to receive email notifications when future instances of this net are scheduled or go active?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            You can manage your subscriptions and notification preferences in your profile settings.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onSkipSubscribe} color="inherit">
            No Thanks
          </Button>
          <Button
            onClick={onSubscribe}
            variant="contained"
            disabled={subscribing}
            startIcon={subscribing ? <CircularProgress size={16} /> : null}
          >
            {subscribing ? 'Subscribing...' : 'Subscribe'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== TOPIC / POLL CONFIGURATION DIALOG ========== */}
      <Dialog
        open={topicPollDialog.open}
        onClose={topicPollDialog.onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSaveAndStart();
          }
        }}
      >
        <DialogTitle>Configure Community Net Features</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Set the topic and/or poll question for this net session. These prompts will be shown to participants during check-in.
            </Typography>
            {topicEnabled && (
              <TextField
                fullWidth
                label="Topic of the Week"
                value={tempTopicPrompt}
                onChange={(e) => setTempTopicPrompt(e.target.value)}
                placeholder="e.g., What's your favorite radio memory?"
                helperText="What would you like participants to share?"
                sx={{ mb: 3 }}
              />
            )}
            {pollEnabled && (
              <TextField
                fullWidth
                label="Poll Question"
                value={tempPollQuestion}
                onChange={(e) => setTempPollQuestion(e.target.value)}
                placeholder="e.g., What band do you operate most?"
                helperText="Answers will be tracked and displayed as a chart"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={topicPollDialog.onClose}>Cancel</Button>
          <Button onClick={onSaveAndStart} variant="contained" color="success">
            Save & Start Net
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== AVAILABLE FREQUENCIES DIALOG ========== */}
      <Dialog
        open={frequencyDialog.open}
        onClose={frequencyDialog.onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            frequencyDialog.onClose();
          }
        }}
      >
        <DialogTitle>Available Frequencies</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              For SKYWARN nets: indicate which frequencies this station can monitor.
            </Typography>
            <Autocomplete
              multiple
              options={frequencies || []}
              getOptionLabel={(option: any) => formatFrequency(option)}
              value={(frequencies || []).filter((f: any) => (availableFrequencyIds || []).includes(f.id))}
              onChange={(_, newValue: any[]) => {
                onAvailableFrequencyIdsChange(newValue.map(f => f.id));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Frequencies"
                  placeholder="Choose frequencies..."
                />
              )}
              renderTags={(value: any[], getTagProps) =>
                value.map((option: any, index: number) => (
                  <Chip
                    {...getTagProps({ index })}
                    label={formatFrequency(option)}
                    size="small"
                  />
                ))
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={frequencyDialog.onClose}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NetControlDialogs;

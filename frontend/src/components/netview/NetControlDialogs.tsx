import React from 'react';
import {
  Alert,
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

// Which button opened the Topic/Poll dialog, so saving resumes it.
export type TopicPollAction = 'open-lobby' | 'start' | 'go-live';

// Which Close Net button is running, so it shows the spinner and the
// others wait for it.
export type ClosingAction = 'hold' | 'send' | 'accept-and-send';

interface NetControlDialogsProps {
  // Close Net
  closeNetDialog: UseDialogResult;
  // holdLog: close without emailing the log ("Finish the log later")
  onCloseNet: (holdLog?: boolean) => void;
  // Stations' off-net log entries still awaiting review (net control only)
  pendingOffNetCount: number;
  onReviewOffNet: () => void;
  onAcceptOffNetAndClose: () => void;
  closingAction: ClosingAction | null;

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
  // Which action the save button resumes: Open lobby or Start net on a
  // draft/scheduled net, or Go Live from the lobby.
  topicPollAction: TopicPollAction;

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
  pendingOffNetCount,
  onReviewOffNet,
  onAcceptOffNetAndClose,
  closingAction,
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
  topicPollAction,
  frequencyDialog,
  frequencies,
  availableFrequencyIds,
  onAvailableFrequencyIdsChange,
  formatFrequency,
}) => {
  return (
    <>
      {/* ========== CLOSE NET DIALOG ========== */}
      {/* Two ways to close: send the log now, or hold it while net control
          finishes it (utils/netLog.ts). No Enter shortcut, since that would
          pick one for you. */}
      <Dialog
        open={closeNetDialog.open}
        onClose={closingAction ? undefined : closeNetDialog.onClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Close Net?</DialogTitle>
        <DialogContent>
          <Typography>
            Closing ends the net. Stations can no longer check in, and chat closes.
          </Typography>
          <Typography sx={{ mt: 1.5 }}>
            <strong>Close and send the log</strong> emails the log to subscribers and net control now.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            <strong>Finish the log later</strong> holds the email while you add offline logs and fix entries.
            The report is marked as a draft, and you send the log from the net page when it's done.
          </Typography>
          {/* Shows when stations' off-net entries are waiting for review */}
          {pendingOffNetCount > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {pendingOffNetCount === 1 ? '1 off-net entry is' : `${pendingOffNetCount} off-net entries are`} awaiting
              review. If you send the log now, entries you haven't accepted are left off its ICS-309.
            </Alert>
          )}
        </DialogContent>
        {/* One right-aligned row, colored by what each choice does
            (docs/DESIGN.md "Dialog Button Colors"): outline backs out or
            looks, orange closes and leaves the log to finish, green sends it.
            It wraps only when off-net entries add Review and Accept all. */}
        <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }} disableSpacing>
          <Button onClick={closeNetDialog.onClose} variant="outlined" color="inherit" disabled={!!closingAction}>
            Cancel
          </Button>
          {pendingOffNetCount > 0 && (
            <Button onClick={onReviewOffNet} variant="outlined" color="inherit" disabled={!!closingAction}>
              Review
            </Button>
          )}
          <Button
            onClick={() => onCloseNet(true)}
            variant="contained"
            color="warning"
            disabled={!!closingAction}
            startIcon={closingAction === 'hold' ? <CircularProgress size={20} color="inherit" /> : undefined}
          >
            Finish the log later
          </Button>
          {pendingOffNetCount > 0 && (
            <Button
              onClick={onAcceptOffNetAndClose}
              variant="outlined"
              color="success"
              disabled={!!closingAction}
              startIcon={closingAction === 'accept-and-send' ? <CircularProgress size={20} color="inherit" /> : undefined}
            >
              Accept all and send
            </Button>
          )}
          <Button
            onClick={() => onCloseNet(false)}
            variant="contained"
            color="success"
            disabled={!!closingAction}
            startIcon={closingAction === 'send' ? <CircularProgress size={20} color="inherit" /> : undefined}
          >
            Close and send the log
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
            {{ 'open-lobby': 'Save & Open Lobby', start: 'Save & Start Net', 'go-live': 'Save & Go Live' }[topicPollAction]}
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

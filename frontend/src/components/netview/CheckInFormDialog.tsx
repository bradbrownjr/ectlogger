import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Autocomplete,
  Chip,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
} from '@mui/material';
import type { UseDialogResult } from '../../hooks/useDialog';

// ========== CHECK-IN FORM DIALOG ==========
// The "Check In to {net}" modal. Renders the dynamic check-in form (fields shown
// per the net's field_config) plus the optional frequency selector. Purely
// presentational — the parent owns the form state, callsign lookup, and submit.

export interface CheckInFormState {
  callsign: string;
  name: string;
  location: string;
  skywarn_number: string;
  weather_observation: string;
  power_source: string;
  power: string;
  feedback: string;
  notes: string;
  relayed_by: string;
  available_frequency_ids: number[];
  custom_fields: Record<string, string>;
  topic_response: string;
  poll_response: string;
  status: string;
  // Which role this self-check-in requests -- see backend
  // permissions.is_eligible_for_ncs_auto_grant /
  // is_eligible_for_logger_self_grant. Meaningless (ignored server-side)
  // unless showNcsChoice or showLoggerChoice below is true. Always defaults
  // to 'standard' -- see the fail-safe history in schemas.py's
  // CheckInCreate.self_role_choice.
  self_role_choice?: 'standard' | 'ncs' | 'logger';
}

interface CheckInFormDialogProps {
  dialog: UseDialogResult;
  netName: string | undefined;
  fieldConfig: any;
  frequencies: any[] | undefined;
  checkInForm: CheckInFormState;
  setCheckInForm: React.Dispatch<React.SetStateAction<CheckInFormState>>;
  onCallsignLookup: (callsign: string) => void;
  onCheckIn: () => void;
  formatFrequency: (freq: any) => string;
  // True when checking in would auto-grant the current user NCS (an active
  // co-manager or NCS rotation member for this net's schedule, with no
  // NetRole here yet) -- shows the NCS choice when true.
  showNcsChoice?: boolean;
  // True when checking in would auto-grant the current user LOGGER (the net
  // owner, or the same co-manager/rotation population as NCS, with no
  // NetRole here yet) -- shows the Logger choice when true.
  showLoggerChoice?: boolean;
  // Live topic/poll question text, shown as context above the answer field
  // so whoever is checking in (or logging someone in) knows what's being
  // asked -- previously only visible via the schedule's historical Topics
  // planning tool or the chat banner, not here where the answer is entered.
  topicOfWeekEnabled?: boolean;
  topicOfWeekPrompt?: string | null;
  pollEnabled?: boolean;
  pollQuestion?: string | null;
  // Prior poll answers for this net, offered as Autocomplete suggestions so
  // self-check-in answers stay consistent with staff-entered ones (see the
  // identical pattern in NetView.tsx's inline check-in rows).
  pollResponses?: string[];
}

const CheckInFormDialog: React.FC<CheckInFormDialogProps> = ({
  dialog,
  netName,
  fieldConfig,
  frequencies,
  checkInForm,
  setCheckInForm,
  onCallsignLookup,
  onCheckIn,
  formatFrequency,
  showNcsChoice,
  showLoggerChoice,
  topicOfWeekEnabled,
  topicOfWeekPrompt,
  pollEnabled,
  pollQuestion,
  pollResponses,
}) => {
  const submit = () => {
    onCheckIn();
    dialog.onClose();
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
      disableRestoreFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogTitle>Check In to {netName}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Callsign"
            value={checkInForm.callsign}
            onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
            onBlur={(e) => onCallsignLookup(e.target.value)}
            fullWidth
            required
            inputProps={{ style: { textTransform: 'uppercase' } }}
          />

          {(showNcsChoice || showLoggerChoice) && (
            <FormControl>
              <FormLabel sx={{ fontSize: '0.9rem' }}>Check in as</FormLabel>
              <RadioGroup
                row
                value={checkInForm.self_role_choice || 'standard'}
                onChange={(e) => setCheckInForm({ ...checkInForm, self_role_choice: e.target.value as 'standard' | 'ncs' | 'logger' })}
              >
                {showNcsChoice && (
                  <FormControlLabel value="ncs" control={<Radio size="small" />} label="NCS (backup net control)" />
                )}
                {showLoggerChoice && (
                  <FormControlLabel value="logger" control={<Radio size="small" />} label="Logger" />
                )}
                <FormControlLabel value="standard" control={<Radio size="small" />} label="Standard participant" />
              </RadioGroup>
              <Typography variant="caption" color="text.secondary">
                You're a co-manager, rotation member, or the net owner, so you can help run this net. Choose Standard if you're just checking in as a participant this time.
              </Typography>
            </FormControl>
          )}

          {fieldConfig?.name?.enabled && (
            <TextField
              label="Name"
              value={checkInForm.name}
              onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
              fullWidth
              required={fieldConfig.name.required}
            />
          )}

          {fieldConfig?.location?.enabled && (
            <TextField
              label="Location"
              value={checkInForm.location}
              onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
              fullWidth
              required={fieldConfig.location.required}
            />
          )}

          {fieldConfig?.skywarn_number?.enabled && (
            <TextField
              label="Spotter #"
              value={checkInForm.skywarn_number}
              onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })}
              fullWidth
              required={fieldConfig.skywarn_number.required}
            />
          )}

          {fieldConfig?.weather_observation?.enabled && (
            <TextField
              label="Weather Observation"
              value={checkInForm.weather_observation}
              onChange={(e) => setCheckInForm({ ...checkInForm, weather_observation: e.target.value })}
              fullWidth
              multiline
              rows={2}
              required={fieldConfig.weather_observation.required}
            />
          )}

          {fieldConfig?.power_source?.enabled && (
            <TextField
              label="Power Src"
              value={checkInForm.power_source}
              onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
              fullWidth
              required={fieldConfig.power_source.required}
            />
          )}

          {fieldConfig?.power?.enabled && (
            <TextField
              label="Power"
              value={checkInForm.power}
              onChange={(e) => setCheckInForm({ ...checkInForm, power: e.target.value })}
              fullWidth
              required={fieldConfig.power.required}
            />
          )}

          {fieldConfig?.notes?.enabled && (
            <TextField
              label="Notes"
              value={checkInForm.notes}
              onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
              required={fieldConfig.notes.required}
            />
          )}

          {topicOfWeekEnabled && topicOfWeekPrompt && (
            <TextField
              label="Your Response"
              value={checkInForm.topic_response}
              onChange={(e) => setCheckInForm({ ...checkInForm, topic_response: e.target.value })}
              fullWidth
              multiline
              rows={2}
              helperText={`Topic of the Week: ${topicOfWeekPrompt}`}
            />
          )}

          {pollEnabled && pollQuestion && (
            <Autocomplete
              freeSolo
              options={pollResponses || []}
              value={checkInForm.poll_response}
              onChange={(_, newValue) => setCheckInForm({ ...checkInForm, poll_response: newValue || '' })}
              onInputChange={(_, newInputValue) => setCheckInForm({ ...checkInForm, poll_response: newInputValue })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Your Answer"
                  helperText={`Poll: ${pollQuestion}`}
                />
              )}
            />
          )}

          {frequencies && frequencies.length > 1 && (
            <Autocomplete
              multiple
              options={frequencies || []}
              getOptionLabel={(option: any) => formatFrequency(option)}
              value={frequencies.filter((f: any) => checkInForm.available_frequency_ids.includes(f.id))}
              onChange={(_, newValue: any[]) => {
                setCheckInForm({
                  ...checkInForm,
                  available_frequency_ids: newValue.map(f => f.id)
                });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Available Frequencies (optional)"
                  helperText="For SKYWARN nets: indicate which frequencies you can reach"
                />
              )}
              renderTags={(value: any[], getTagProps) =>
                value.map((option: any, index: number) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip
                      key={key}
                      {...tagProps}
                      label={formatFrequency(option)}
                      size="small"
                    />
                  );
                })
              }
            />
          )}

          {frequencies && frequencies.length === 1 && (
            <Box sx={{
              p: 1.5,
              bgcolor: 'action.hover',
              borderRadius: 1,
              textAlign: 'center',
              fontSize: '0.9rem',
              color: 'text.secondary'
            }}>
              📡 Frequency: {frequencies[0].frequency || frequencies[0].network || 'Unknown'}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={dialog.onClose}>Cancel</Button>
        <Button
          onClick={submit}
          variant="contained"
          color="primary"
          disabled={!checkInForm.callsign}
        >
          Check In
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CheckInFormDialog;

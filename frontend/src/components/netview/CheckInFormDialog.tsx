import React, { useEffect, useState } from 'react';
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
  Alert,
} from '@mui/material';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import type { UseDialogResult } from '../../hooks/useDialog';
import { looksLikeEmailOrUrl, NAME_FIELD_EMAIL_WARNING, FIELD_SPAM_WARNING } from '../../utils/nameFieldGuard';
import api from '../../services/api';
import { DETAIL_FIELDS, MULTILINE_FIELDS, fieldLabel, isFieldShown, shownDetailFields } from '../../utils/checkInFields';
import SiteField, { netHasSites } from './SiteField';
import type { CoverageSite } from '../../utils/coverageSites';
import { PARTICIPANTS_ONLY_HINT } from './ParticipantsOnlyChip';
import CustomFieldInput, { type CustomFieldDefinition } from './CustomFieldInput';

// ========== CHECK-IN FORM DIALOG ==========
// The "Check In to {net}" modal, and in edit mode "Edit your check-in"
// (EditOwnCheckInDialog). Renders the dynamic check-in form (fields shown per
// the net's field_config, custom fields included) plus the frequency
// selectors. Purely presentational — the parent owns the form state, callsign
// lookup, and submit.

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
  // The frequency the station checked in on. Edit mode only: a new check-in
  // gets its frequency from the net (routers/check_ins.py).
  frequency_id?: number | null;
  custom_fields: Record<string, string>;
  // "HH:MM" from a paper log, for a check-in added after the net closed
  // (utils/netLog.ts heldLogTimeToIso). Blank means nobody recorded it.
  held_time?: string;
  topic_response: string;
  poll_response: string;
  status: string;
  // Which role this self-check-in requests -- see backend
  // permissions.is_eligible_for_ncs_auto_grant /
  // is_eligible_for_logger_self_grant. Meaningless (ignored server-side)
  // unless showNcsChoice or showLoggerChoice below is true. Always defaults
  // to 'standard' -- see the fail-safe history in schemas.py's
  // CheckInCreate.self_role_choice.
  // 'participant' (an explicit choice) also steps down from a role already
  // held on this net; 'standard' (the default) leaves roles alone.
  self_role_choice?: 'standard' | 'participant' | 'ncs' | 'logger';
  // Where the station is, picked from the Site box on a net with sites
  // (SiteField, utils/stationPlace.ts). Absent otherwise.
  coverage_site_id?: number | null;
  operating_position?: string | null;
}

interface CheckInFormDialogProps {
  dialog: UseDialogResult;
  // 'edit' is a station correcting its own check-in: no role choice, and
  // a Save button instead of Check In.
  mode?: 'create' | 'edit';
  // The admin-defined fields this net turns on (Admin > Check-in Fields).
  customFields?: CustomFieldDefinition[];
  // A participants-only net (Net.participants_only): says so above the form.
  participantsOnly?: boolean;
  // The site's field list, for each built-in field's label.
  fieldDefinitions?: { name: string; label?: string | null }[];
  netName: string | undefined;
  fieldConfig: any;
  frequencies: any[] | undefined;
  checkInForm: CheckInFormState;
  setCheckInForm: React.Dispatch<React.SetStateAction<CheckInFormState>>;
  onCallsignLookup?: (callsign: string) => void;
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
  // The net's sites, offered in the Site box.
  coverageSites?: CoverageSite[];
  // The station's usual town, which picking Home in the Site box fills in.
  savedTown?: string;
}

const CheckInFormDialog: React.FC<CheckInFormDialogProps> = ({
  dialog,
  mode = 'create',
  customFields = [],
  participantsOnly,
  fieldDefinitions,
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
  coverageSites = [],
  savedTown,
}) => {
  // A built-in field's label, as the admin named it.
  const labelOf = (name: string) => fieldLabel(fieldDefinitions, name);
  // Which check-in fields currently reject a URL/email-looking value --
  // admin-configurable per field (Admin > Check-in Fields > Spam Guard),
  // on by default. Fetched once; the dialog is short-lived enough that a
  // mid-session admin change just takes effect next time it's opened.
  const [spamGuardedFields, setSpamGuardedFields] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.get('/settings/fields')
      .then((res) => {
        const guarded = (res.data || [])
          .filter((f: { spam_guard_enabled?: boolean }) => f.spam_guard_enabled)
          .map((f: { name: string }) => f.name);
        setSpamGuardedFields(new Set(guarded));
      })
      .catch(() => {
        // Non-critical: fields just render without the inline warning: the
        // server-side guard in routers/check_ins.py still enforces this on
        // submit regardless.
      });
  }, []);

  const isSpammy = (fieldName: string, value: string) =>
    spamGuardedFields.has(fieldName) && looksLikeEmailOrUrl(value);

  // Only fields this net shows count: a hidden one is never submitted (see
  // utils/checkInFields.ts), and the NCS couldn't clear it anyway.
  const hasSpammyField = [
    ['name', checkInForm.name],
    ['location', checkInForm.location],
    ...DETAIL_FIELDS.map((field) => [field, checkInForm[field]]),
  ].some(([fieldName, value]) => isFieldShown(fieldConfig, fieldName) && isSpammy(fieldName, value));

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
          if (checkInForm.callsign && !hasSpammyField) {
            submit();
          }
        }
      }}
    >
      <DialogTitle>{mode === 'edit' ? 'Edit your check-in' : `Check In to ${netName}`}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* Shows on a participants-only net: a notice, not a gate */}
          {participantsOnly && (
            <Alert severity="error" variant="outlined" icon={<LockPersonIcon />}>
              <strong>Participants only.</strong> {PARTICIPANTS_ONLY_HINT}
            </Alert>
          )}
          <TextField
            label="Callsign"
            value={checkInForm.callsign}
            onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
            onBlur={(e) => onCallsignLookup?.(e.target.value)}
            fullWidth
            required
            inputProps={{ style: { textTransform: 'uppercase' } }}
          />

          {mode === 'create' && (showNcsChoice || showLoggerChoice) && (
            <FormControl>
              <FormLabel sx={{ fontSize: '0.9rem' }}>Check in as</FormLabel>
              <RadioGroup
                row
                value={!checkInForm.self_role_choice || checkInForm.self_role_choice === 'standard' ? 'participant' : checkInForm.self_role_choice}
                onChange={(e) => setCheckInForm({ ...checkInForm, self_role_choice: e.target.value as 'participant' | 'ncs' | 'logger' })}
              >
                {showNcsChoice && (
                  <FormControlLabel value="ncs" control={<Radio size="small" />} label="NCS (backup net control)" />
                )}
                {showLoggerChoice && (
                  <FormControlLabel value="logger" control={<Radio size="small" />} label="Logger" />
                )}
                <FormControlLabel value="participant" control={<Radio size="small" />} label="Standard participant" />
              </RadioGroup>
              <Typography variant="caption" color="text.secondary">
                You're a co-manager, rotation member, or the net owner, so you can help run this net. Choose Standard if you're just checking in as a participant this time.
              </Typography>
            </FormControl>
          )}

          {fieldConfig?.name?.enabled && (
            <TextField
              label={labelOf('name')}
              value={checkInForm.name}
              onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
              fullWidth
              required={fieldConfig.name.required}
              error={isSpammy('name', checkInForm.name)}
              helperText={isSpammy('name', checkInForm.name) ? NAME_FIELD_EMAIL_WARNING : undefined}
            />
          )}

          {/* Site, ahead of Location, on a net with sites */}
          {netHasSites(coverageSites) && (
            <SiteField
              sites={coverageSites}
              form={checkInForm}
              setForm={setCheckInForm}
              savedTown={savedTown}
              textFieldProps={{ label: 'Site', fullWidth: true, helperText: 'Where you are operating from' }}
            />
          )}

          {fieldConfig?.location?.enabled && (
            <TextField
              label={labelOf('location')}
              value={checkInForm.location}
              onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
              fullWidth
              required={fieldConfig.location.required}
              error={isSpammy('location', checkInForm.location)}
              helperText={isSpammy('location', checkInForm.location) ? FIELD_SPAM_WARNING : undefined}
            />
          )}

          {/* Spotter # through Notes, as the net has them on (utils/checkInFields.ts) */}
          {shownDetailFields(fieldConfig).map((field) => (
            <TextField
              key={field}
              label={labelOf(field)}
              value={checkInForm[field]}
              onChange={(e) => setCheckInForm({ ...checkInForm, [field]: e.target.value })}
              fullWidth
              multiline={MULTILINE_FIELDS.has(field)}
              rows={MULTILINE_FIELDS.has(field) ? 2 : undefined}
              required={!!fieldConfig?.[field]?.required}
              error={isSpammy(field, checkInForm[field])}
              helperText={isSpammy(field, checkInForm[field]) ? FIELD_SPAM_WARNING : undefined}
            />
          ))}

          {/* Custom fields, after the built-in ones as on the staff entry forms */}
          {customFields.map((field) => (
            <CustomFieldInput
              key={field.name}
              field={field}
              value={checkInForm.custom_fields[field.name]}
              required={!!fieldConfig?.[field.name]?.required}
              size="medium"
              onChange={(value) => setCheckInForm({
                ...checkInForm,
                custom_fields: { ...checkInForm.custom_fields, [field.name]: value },
              })}
            />
          ))}

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

          {/* Shows when editing a check-in on a net with more than one frequency */}
          {mode === 'edit' && frequencies && frequencies.length > 1 && (
            <Autocomplete
              options={frequencies}
              getOptionLabel={(option: any) => formatFrequency(option)}
              value={frequencies.find((f: any) => f.id === checkInForm.frequency_id) ?? null}
              onChange={(_, freq: any) => setCheckInForm({ ...checkInForm, frequency_id: freq?.id ?? null })}
              renderInput={(params) => <TextField {...params} label="Checked in on" />}
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
          disabled={!checkInForm.callsign || hasSpammyField}
        >
          {mode === 'edit' ? 'Save' : 'Check In'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CheckInFormDialog;

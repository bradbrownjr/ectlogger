import React, { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { canHearApi } from '../../services/api';

// ========== "WHO CAN THIS STATION HEAR?" COVERAGE REPORTING DIALOG ==========
// Phase 2 of the "can hear" inter-station propagation logging feature (see
// docs/ROADMAP.md "Relaying & Propagation Mapping"). Lets NCS/Logger/Relay
// record which other checked-in stations the reporting station can hear, on
// a given frequency. Saving reconciles the full set for that (reporter,
// frequency) pair server-side (insert new, delete unchecked, touch kept
// edges) - the dialog itself only ever shows current state, never a diff.
//
// State is intentionally re-derived (not optimistically patched) after a
// save: the parent's canHearReports list refreshes from the can_hear_changed
// WebSocket broadcast, which every viewer (including the saver) receives.

const OPERATING_POSITION_OPTIONS = ['Home', 'Field Deployed'];

interface CanHearDialogProps {
  open: boolean;
  onClose: () => void;
  netId: number;
  net: any;
  reporterCheckIn: any;
  allCheckIns: any[];
  existingReports: any[];
  onSaved: () => void;
  // Reuses NetView's existing app-wide toast/Snackbar (setToastMessage) for
  // error display, matching the pattern already used across checkInActions.ts.
  onToast: (message: string) => void;
}

// Reports are scoped per (reporter, frequency), so which boxes are pre-checked
// depends on whatever frequency is currently selected in the dialog. Normalize
// null/undefined frequency ids to null so "no frequency" reports match cleanly.
function deriveCheckedIds(reports: any[], reporterCheckInId: number, frequencyId: number | null): Set<number> {
  const normalizedFreq = frequencyId ?? null;
  return new Set(
    reports
      .filter((r: any) => r.reporter_check_in_id === reporterCheckInId && (r.frequency_id ?? null) === normalizedFreq)
      .map((r: any) => r.heard_check_in_id)
  );
}

const CanHearDialog: React.FC<CanHearDialogProps> = ({
  open,
  onClose,
  netId,
  net,
  reporterCheckIn,
  allCheckIns,
  existingReports,
  onSaved,
  onToast,
}) => {
  const [selectedFrequencyId, setSelectedFrequencyId] = useState<number | null>(
    net?.active_frequency_id ?? null
  );
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() =>
    deriveCheckedIds(existingReports, reporterCheckIn.id, net?.active_frequency_id ?? null)
  );
  const [operatingPosition, setOperatingPosition] = useState<string>(reporterCheckIn.operating_position || '');
  const [saving, setSaving] = useState(false);

  // Changing the frequency re-derives which checkboxes are pre-checked, since
  // reports are scoped per frequency - any in-progress (unsaved) toggles for
  // the previous frequency are discarded, matching "the dialog shows current
  // state" rather than accumulating edits across frequencies.
  const handleFrequencyChange = (newFrequencyId: number | null) => {
    setSelectedFrequencyId(newFrequencyId);
    setCheckedIds(deriveCheckedIds(existingReports, reporterCheckIn.id, newFrequencyId));
  };

  const toggleStation = (checkInId: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(checkInId)) {
        next.delete(checkInId);
      } else {
        next.add(checkInId);
      }
      return next;
    });
  };

  // Every other station in the net, checked-out ones sorted last (not
  // filtered out - a station reported earlier that has since checked out
  // must remain visible, just deprioritized). Array.prototype.sort is a
  // stable sort, so check-in order is otherwise preserved.
  const otherStations = allCheckIns
    .filter((ci: any) => ci.id !== reporterCheckIn.id)
    .slice()
    .sort((a: any, b: any) => {
      const aOut = a.status === 'checked_out' ? 1 : 0;
      const bOut = b.status === 'checked_out' ? 1 : 0;
      return aOut - bOut;
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      await canHearApi.save(netId, {
        reporter_check_in_id: reporterCheckIn.id,
        heard_check_in_ids: Array.from(checkedIds),
        frequency_id: selectedFrequencyId,
        operating_position: operatingPosition.trim() || null,
      });
      onSaved();
    } catch (error: any) {
      // 403 (toggle off / role lost), 400 (self-edge / cross-net), and 409
      // (concurrent save) all carry a human-readable detail from the API -
      // show it and leave the dialog open so the user can retry.
      const detail = error?.response?.data?.detail;
      onToast(typeof detail === 'string' ? detail : 'Failed to save coverage report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Who can {reporterCheckIn.callsign} hear?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Check every station {reporterCheckIn.callsign} can hear on the selected frequency. Saving replaces the current report for this station and frequency.
        </Typography>

        {/* Frequency selector - reports are scoped per frequency, so a combined
            repeater/simplex drill can tell them apart. Defaults to the net's
            active frequency. */}
        {net?.frequencies && net.frequencies.length > 0 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="can-hear-frequency-label">Frequency</InputLabel>
            <Select
              labelId="can-hear-frequency-label"
              label="Frequency"
              value={selectedFrequencyId ?? ''}
              onChange={(e) => handleFrequencyChange(e.target.value === '' ? null : Number(e.target.value))}
            >
              <MenuItem value="">
                <em>No specific frequency</em>
              </MenuItem>
              {net.frequencies.map((freq: any) => (
                <MenuItem key={freq.id} value={freq.id}>
                  {`${freq.frequency || ''} ${freq.mode || ''}`.trim()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Responsive 2-3 column checkbox grid - a 25-station net fits without scrolling */}
        {otherStations.length > 0 ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, mb: 2 }}>
            {otherStations.map((station: any) => (
              <FormControlLabel
                key={station.id}
                control={
                  <Checkbox
                    checked={checkedIds.has(station.id)}
                    onChange={() => toggleStation(station.id)}
                  />
                }
                label={station.callsign + (station.status === 'checked_out' ? ' (checked out)' : '')}
                sx={{ opacity: station.status === 'checked_out' ? 0.6 : 1 }}
              />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No other stations are checked in yet.
          </Typography>
        )}

        {/* Operating position describes the reporting station, not the pair -
            see docs/ROADMAP.md "Operating position" for why it lives here. */}
        <Autocomplete
          freeSolo
          options={OPERATING_POSITION_OPTIONS}
          value={operatingPosition}
          onChange={(_, newValue) => setOperatingPosition(newValue || '')}
          onInputChange={(_, newInputValue) => setOperatingPosition(newInputValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Operating Position"
              margin="normal"
              placeholder="Home, Field Deployed, or type your own"
              helperText={`Describes ${reporterCheckIn.callsign}'s setup, not this report`}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CanHearDialog;

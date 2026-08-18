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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { canHearApi } from '../../services/api';

// ========== "WHO CAN THIS STATION HEAR?" COVERAGE REPORTING DIALOG ==========
// Phase 2 of the "can hear" inter-station propagation logging feature (see
// docs/ROADMAP.md "Relaying & Propagation Mapping"). Lets NCS/Logger/Relay
// record which other checked-in stations the reporting station can hear, on
// a given frequency. Saving reconciles the full set for a (reporter,
// frequency) pair server-side (insert new, delete unchecked, touch kept
// edges) - the dialog itself only ever shows current state, never a diff.
//
// Two layouts, chosen by how many frequencies the net has:
//   - 0 or 1 frequency: the original single-list layout below, with a
//     frequency dropdown (only shown when the net has one) that scopes
//     which set of checkboxes is being edited.
//   - 2+ frequencies: a grid (one column per frequency/band) so a combined
//     repeater/simplex or multi-band drill can record who was heard on
//     which frequency in one pass, instead of re-selecting the dropdown and
//     re-checking stations once per frequency. Each column is still its own
//     independent (reporter, frequency) reconciliation server-side - saving
//     the grid just fires one PUT per column instead of one PUT total.
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

// Column header for a net frequency in grid mode: "146.520 FM (2m)". `band`
// comes pre-derived from the backend (Frequency.band, see band_utils.py) -
// this never re-derives it client-side.
function frequencyLabel(freq: any): string {
  const base = `${freq.frequency || freq.network || ''} ${freq.mode || ''}`.trim() || freq.description || `Frequency #${freq.id}`;
  return freq.band ? `${base} (${freq.band})` : base;
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
  const netFrequencies: any[] = net?.frequencies || [];
  // 2+ frequencies switches to the per-frequency grid layout - with 0 or 1
  // there's nothing for columns to distinguish, so the original single list
  // (with its own frequency dropdown for the 1-frequency case) stays simpler.
  const gridMode = netFrequencies.length > 1;

  const [selectedFrequencyId, setSelectedFrequencyId] = useState<number | null>(
    net?.active_frequency_id ?? null
  );
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() =>
    deriveCheckedIds(existingReports, reporterCheckIn.id, net?.active_frequency_id ?? null)
  );
  // Grid mode: one checked-set per net frequency, keyed by frequency_id -
  // each column reconciles independently server-side, so this just mirrors
  // that scoping client-side. Initialized once from existingReports; not
  // re-derived on prop changes since the dialog is remounted (key=checkIn.id
  // in NetView.tsx) whenever a different station's report is opened.
  const [checkedByFrequency, setCheckedByFrequency] = useState<Record<number, Set<number>>>(() => {
    const initial: Record<number, Set<number>> = {};
    netFrequencies.forEach((freq) => {
      initial[freq.id] = deriveCheckedIds(existingReports, reporterCheckIn.id, freq.id);
    });
    return initial;
  });
  // Defaults to "Home" when the station has no operating position recorded
  // yet - most stations reporting on a routine net are home stations, so
  // this saves the common case a click rather than leaving the field blank.
  const [operatingPosition, setOperatingPosition] = useState<string>(reporterCheckIn.operating_position || 'Home');
  const [saving, setSaving] = useState(false);

  // Changing the frequency re-derives which checkboxes are pre-checked, since
  // reports are scoped per frequency - any in-progress (unsaved) toggles for
  // the previous frequency are discarded, matching "the dialog shows current
  // state" rather than accumulating edits across frequencies. Single-list
  // mode only.
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

  const toggleGridStation = (frequencyId: number, checkInId: number) => {
    setCheckedByFrequency((prev) => {
      const next = { ...prev, [frequencyId]: new Set(prev[frequencyId] ?? []) };
      const set = next[frequencyId];
      if (set.has(checkInId)) {
        set.delete(checkInId);
      } else {
        set.add(checkInId);
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
      if (gridMode) {
        // Each column is its own (reporter, frequency) scope server-side -
        // save every column so an all-unchecked column still reconciles to
        // "delete everything", not "skip this frequency entirely".
        await Promise.all(
          netFrequencies.map((freq) =>
            canHearApi.save(netId, {
              reporter_check_in_id: reporterCheckIn.id,
              heard_check_in_ids: Array.from(checkedByFrequency[freq.id] ?? []),
              frequency_id: freq.id,
              operating_position: operatingPosition.trim() || null,
            })
          )
        );
      } else {
        await canHearApi.save(netId, {
          reporter_check_in_id: reporterCheckIn.id,
          heard_check_in_ids: Array.from(checkedIds),
          frequency_id: selectedFrequencyId,
          operating_position: operatingPosition.trim() || null,
        });
      }
      onSaved();
    } catch (error: any) {
      // 403 (toggle off / role lost), 400 (self-edge / cross-net), and 409
      // (concurrent save) all carry a human-readable detail from the API -
      // show it and leave the dialog open so the user can retry. In grid
      // mode a column that already saved before a later one failed stays
      // saved server-side; re-clicking Save just resends every column,
      // which is a harmless reconfirmation for the ones that succeeded.
      const detail = error?.response?.data?.detail;
      onToast(typeof detail === 'string' ? detail : 'Failed to save coverage report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth={gridMode ? 'md' : 'sm'} fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Who can {reporterCheckIn.callsign} hear?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {gridMode
            ? `Check every station ${reporterCheckIn.callsign} can hear, on every frequency it hears them on. Saving replaces the current report for each frequency.`
            : `Check every station ${reporterCheckIn.callsign} can hear on the selected frequency. Saving replaces the current report for this station and frequency.`}
        </Typography>

        {/* Frequency selector - single-list mode only. Reports are scoped
            per frequency, so a combined repeater/simplex drill can tell them
            apart. Defaults to the net's active frequency. Grid mode below
            replaces this with one column per frequency instead. */}
        {!gridMode && net?.frequencies && net.frequencies.length > 0 && (
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
                  {frequencyLabel(freq)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {otherStations.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No other stations are checked in yet.
          </Typography>
        ) : gridMode ? (
          /* One column per net frequency/band - a multi-band net records who
             was heard on which frequency in one pass instead of re-selecting
             the dropdown per frequency. */
          <TableContainer sx={{ mb: 2, maxHeight: 360, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Station</TableCell>
                  {netFrequencies.map((freq) => (
                    <TableCell key={freq.id} align="center" sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {frequencyLabel(freq)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {otherStations.map((station: any) => (
                  <TableRow key={station.id} sx={{ opacity: station.status === 'checked_out' ? 0.6 : 1 }}>
                    <TableCell>
                      {station.callsign}{station.status === 'checked_out' ? ' (checked out)' : ''}
                    </TableCell>
                    {netFrequencies.map((freq) => (
                      <TableCell key={freq.id} align="center" sx={{ p: 0 }}>
                        <Checkbox
                          checked={checkedByFrequency[freq.id]?.has(station.id) ?? false}
                          onChange={() => toggleGridStation(freq.id, station.id)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          /* Responsive 2-3 column checkbox grid - a 25-station net fits without scrolling */
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

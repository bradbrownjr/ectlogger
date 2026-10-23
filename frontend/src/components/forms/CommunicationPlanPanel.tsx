import React, { useState } from 'react';
import {
  TextField,
  Typography,
  Box,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  InputAdornment,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControlLabel,
  Switch,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { frequencyApi, FrequencyFormContext } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getErrorMessage } from '../../utils/apiErrors';
import { FREQUENCY_MODES, frequencyEntryFor } from '../../utils/frequencyModes';
import FrequencyChangeRequestDialog, { FrequencyChangeRequest } from './FrequencyChangeRequestDialog';

// ========== SHARED COMMUNICATION PLAN PANEL ==========
// Frequency / channel selection table used by both CreateSchedule and CreateNet.
// Frequencies are one list shared by every net and schedule. Whoever added a
// frequency may edit or delete it here while no other net, schedule or
// check-in uses it; admins may edit any (routers/frequencies.py::
// change_refusal). Anything refused can be sent to the admins as a request
// (FrequencyChangeRequestDialog).

export interface FrequencyItem {
  id?: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
  // Server's reason the viewer can't change it, or null when they can
  edit_refused?: string | null;
  delete_refused?: string | null;
}

// Fields of the add row and of a row being edited
interface FrequencyDraft {
  frequency: string;
  mode: string;
  network: string;
  talkgroup: string;
  description: string;
}

const EMPTY_DRAFT: FrequencyDraft = { frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' };

const toPayload = (d: FrequencyDraft) => ({
  frequency: d.frequency || null,
  mode: d.mode,
  network: d.network || null,
  talkgroup: d.talkgroup || null,
  description: d.description || null,
});

const toDraft = (f: FrequencyItem): FrequencyDraft => ({
  frequency: f.frequency || '',
  mode: f.mode,
  network: f.network || '',
  talkgroup: f.talkgroup || '',
  description: f.description || '',
});

// "3.940 SSB (ME ARES 75m)"
const describeFrequency = (f: { frequency?: string | null; network?: string | null; mode: string; talkgroup?: string | null; description?: string | null }) => {
  const text = [f.frequency || f.network, f.mode, f.talkgroup ? `TG ${f.talkgroup}` : ''].filter(Boolean).join(' ');
  return f.description ? `${text} (${f.description})` : text;
};

type FrequencySortField = 'mode' | 'frequency' | 'talkgroup' | 'description';
type SortDirection = 'asc' | 'desc';

interface CommunicationPlanPanelProps {
  frequencies: FrequencyItem[];
  setFrequencies: React.Dispatch<React.SetStateAction<FrequencyItem[]>>;
  selectedFrequencyIds: number[];
  setSelectedFrequencyIds: React.Dispatch<React.SetStateAction<number[]>>;
  // Coverage logging on: which of the selected frequencies collect coverage
  // reports. Stored as an exclusion list (Net/NetTemplate
  // .coverage_excluded_frequency_ids) so a frequency added later collects
  // them by default. Omit both to hide the section.
  coverageExcludedFrequencyIds?: number[];
  setCoverageExcludedFrequencyIds?: React.Dispatch<React.SetStateAction<number[]>>;
  // The net or schedule being edited, whose own use of a frequency doesn't
  // stop its creator from fixing it. Omit when creating a new one.
  context?: FrequencyFormContext;
}

const CommunicationPlanPanel: React.FC<CommunicationPlanPanelProps> = ({
  frequencies,
  setFrequencies,
  selectedFrequencyIds,
  setSelectedFrequencyIds,
  coverageExcludedFrequencyIds,
  setCoverageExcludedFrequencyIds,
  context,
}) => {
  const { user } = useAuth();
  const [newFrequency, setNewFrequency] = useState<FrequencyDraft>(EMPTY_DRAFT);
  // Row being edited in place, and its fields
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<FrequencyDraft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<FrequencyItem | null>(null);
  const [changeRequest, setChangeRequest] = useState<FrequencyChangeRequest | null>(null);
  const [frequencyFilter, setFrequencyFilter] = useState('');
  // Narrows the shared list to this net's or schedule's own frequencies.
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [frequencySortField, setFrequencySortField] = useState<FrequencySortField>('mode');
  const [frequencySortDirection, setFrequencySortDirection] = useState<SortDirection>('asc');

  // ---- Filtering and sorting ----
  const filteredFrequencies = frequencies.filter((freq: FrequencyItem) => {
    if (selectedOnly && !(freq.id != null && selectedFrequencyIds.includes(freq.id))) return false;
    if (!frequencyFilter) return true;
    const s = frequencyFilter.toLowerCase();
    return (
      (freq.frequency?.toLowerCase().includes(s)) ||
      (freq.mode?.toLowerCase().includes(s)) ||
      (freq.network?.toLowerCase().includes(s)) ||
      (freq.talkgroup?.toLowerCase().includes(s)) ||
      (freq.description?.toLowerCase().includes(s))
    );
  });

  const sortedFrequencies = [...filteredFrequencies].sort((a: FrequencyItem, b: FrequencyItem) => {
    let aVal = '';
    let bVal = '';
    switch (frequencySortField) {
      case 'mode': aVal = a.mode || ''; bVal = b.mode || ''; break;
      case 'frequency': aVal = a.frequency || a.network || ''; bVal = b.frequency || b.network || ''; break;
      case 'talkgroup': aVal = a.talkgroup || ''; bVal = b.talkgroup || ''; break;
      case 'description': aVal = a.description || ''; bVal = b.description || ''; break;
    }
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
    return frequencySortDirection === 'asc' ? cmp : -cmp;
  });

  const handleFrequencySort = (field: FrequencySortField) => {
    if (frequencySortField === field) {
      setFrequencySortDirection(frequencySortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setFrequencySortField(field);
      setFrequencySortDirection('asc');
    }
  };

  // ---- Add a frequency ----
  const handleAddFrequency = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    if (!newFrequency.frequency && !newFrequency.network) return;
    try {
      const response = await frequencyApi.create(toPayload(newFrequency));
      setFrequencies([...frequencies, response.data]);
      setSelectedFrequencyIds([...selectedFrequencyIds, response.data.id]);
      setNewFrequency(EMPTY_DRAFT);
    } catch (error) {
      console.error('Failed to create frequency:', error);
      alert('Failed to create frequency. Check that you filled in required fields.');
    }
  };

  // ---- Edit or delete a frequency ----
  // The list says up front whether the server will refuse (edit_refused /
  // delete_refused); a refusal opens the request-to-admins dialog instead.
  // A 403 from a list gone stale (another net started using it meanwhile)
  // lands in the same dialog.
  const openChangeRequest = (freq: FrequencyItem, action: 'edit' | 'delete', message: string) => {
    const proposed = action === 'edit' ? toPayload(editDraft) : undefined;
    setChangeRequest({
      frequencyId: freq.id!,
      action,
      message,
      current: describeFrequency(freq),
      proposed,
      proposedText: proposed ? describeFrequency(proposed as any) : undefined,
    });
  };

  const refusalFrom = (error: any): string | null => {
    const detail = error.response?.data?.detail;
    return error.response?.status === 403 && detail?.code === 'frequency_change_refused' ? detail.message : null;
  };

  const startEdit = (freq: FrequencyItem) => {
    setEditingId(freq.id!);
    setEditDraft(toDraft(freq));
  };

  const handleSaveEdit = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    const freq = frequencies.find((f) => f.id === editingId);
    if (!freq || (!editDraft.frequency && !editDraft.network)) return;
    if (freq.edit_refused) {
      openChangeRequest(freq, 'edit', freq.edit_refused);
      return;
    }
    try {
      const response = await frequencyApi.update(freq.id!, toPayload(editDraft), context);
      setFrequencies(frequencies.map((f) => (f.id === freq.id ? response.data : f)));
      setEditingId(null);
    } catch (error: any) {
      const refusal = refusalFrom(error);
      if (refusal) {
        openChangeRequest(freq, 'edit', refusal);
      } else {
        alert(getErrorMessage(error, 'Failed to save the frequency.'));
      }
    }
  };

  const handleDeleteClick = (freq: FrequencyItem) => {
    if (!freq.delete_refused) {
      setDeleteTarget(freq);
    } else if (user?.role === 'admin') {
      // An admin can't be refused for permission, only because it's in use
      alert(freq.delete_refused);
    } else {
      openChangeRequest(freq, 'delete', freq.delete_refused);
    }
  };

  const handleConfirmDelete = async () => {
    const freq = deleteTarget;
    if (!freq) return;
    setDeleteTarget(null);
    try {
      await frequencyApi.delete(freq.id!, context);
      setFrequencies(frequencies.filter((f) => f.id !== freq.id));
      setSelectedFrequencyIds((prev) => prev.filter((id) => id !== freq.id));
      setCoverageExcludedFrequencyIds?.((prev) => prev.filter((id) => id !== freq.id));
      if (editingId === freq.id) setEditingId(null);
    } catch (error: any) {
      const refusal = refusalFrom(error);
      if (refusal) {
        openChangeRequest(freq, 'delete', refusal);
      } else {
        alert(getErrorMessage(error, 'Failed to delete the frequency.'));
      }
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedFrequencyIds((prev: number[]) =>
      prev.includes(id) ? prev.filter((fid: number) => fid !== id) : [...prev, id]
    );
  };

  const getDisplayText = (freq: FrequencyItem) => {
    if (freq.frequency) return freq.frequency;
    if (freq.network) return freq.network;
    return 'N/A';
  };

  // ---- Row renderers ----
  // Mode / frequency / TG / description inputs, shared by the add row and a
  // row being edited so the two can't drift.
  const renderEditorCells = (
    draft: FrequencyDraft,
    setDraft: (d: FrequencyDraft) => void,
    onKeyPress: (e: React.KeyboardEvent) => void,
  ) => {
    const entry = frequencyEntryFor(draft.mode);
    const isAnalog = entry === 'frequency';
    const isYSF = entry === 'room';

    return (
      <>
        <TableCell>
          <FormControl size="small" fullWidth>
            <Select
              value={draft.mode}
              onChange={(e: any) => setDraft({ ...draft, mode: e.target.value })}
            >
              {FREQUENCY_MODES.map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </TableCell>
        <TableCell>
          {isAnalog ? (
            <TextField size="small" fullWidth value={draft.frequency}
              onChange={(e: any) => setDraft({ ...draft, frequency: e.target.value, network: '', talkgroup: '' })}
              onKeyPress={onKeyPress} placeholder="146.520 MHz"
            />
          ) : (
            <TextField size="small" fullWidth value={draft.network}
              onChange={(e: any) => setDraft({ ...draft, network: e.target.value, frequency: '' })}
              onKeyPress={onKeyPress} placeholder={isYSF ? 'UFB, America-Link...' : 'Network name'}
            />
          )}
        </TableCell>
        <TableCell>
          {!isAnalog && !isYSF ? (
            <TextField size="small" fullWidth value={draft.talkgroup}
              onChange={(e: any) => setDraft({ ...draft, talkgroup: e.target.value })}
              onKeyPress={onKeyPress} placeholder="TG"
            />
          ) : '-'}
        </TableCell>
        <TableCell>
          <TextField size="small" fullWidth value={draft.description}
            onChange={(e: any) => setDraft({ ...draft, description: e.target.value })}
            onKeyPress={onKeyPress} placeholder="Optional"
          />
        </TableCell>
      </>
    );
  };

  const renderRow = (freq: FrequencyItem) => {
    // ========== ROW BEING EDITED ==========
    if (freq.id === editingId) {
      return (
        <TableRow key={freq.id}>
          <TableCell padding="checkbox">
            <Checkbox
              checked={selectedFrequencyIds.includes(freq.id!)}
              onChange={() => toggleSelection(freq.id!)}
            />
          </TableCell>
          {renderEditorCells(editDraft, setEditDraft, handleSaveEdit)}
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <Button type="button" size="small" variant="contained" onClick={() => handleSaveEdit()}
              disabled={!editDraft.frequency && !editDraft.network}
            >
              Save
            </Button>
            <Button type="button" size="small" onClick={() => setEditingId(null)} sx={{ ml: 1 }}>
              Cancel
            </Button>
          </TableCell>
        </TableRow>
      );
    }

    const hasTalkgroup = frequencyEntryFor(freq.mode) === 'network';

    return (
      <TableRow key={freq.id}>
        <TableCell padding="checkbox">
          <Checkbox
            checked={selectedFrequencyIds.includes(freq.id!)}
            onChange={() => toggleSelection(freq.id!)}
          />
        </TableCell>
        <TableCell>{freq.mode}</TableCell>
        <TableCell>{getDisplayText(freq)}</TableCell>
        <TableCell>{hasTalkgroup && freq.talkgroup ? freq.talkgroup : '-'}</TableCell>
        <TableCell>{freq.description || '-'}</TableCell>
        {/* Offered on every row: one the viewer can't change opens a request to the admins */}
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          <Tooltip title={freq.edit_refused ? 'Request a change' : 'Edit frequency'}>
            <IconButton size="small" onClick={() => startEdit(freq)} aria-label={`Edit ${describeFrequency(freq)}`}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={freq.delete_refused ? 'Request deletion' : 'Delete frequency'}>
            <IconButton size="small" color="error" onClick={() => handleDeleteClick(freq)} aria-label={`Delete ${describeFrequency(freq)}`}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
    );
  };

  const renderNewRow = () => (
    <TableRow>
      <TableCell padding="checkbox"></TableCell>
      {renderEditorCells(newFrequency, setNewFrequency, handleAddFrequency)}
      <TableCell>
        <Button type="button" size="small" variant="contained" onClick={() => handleAddFrequency()}
          disabled={!newFrequency.frequency && !newFrequency.network}
        >
          Add
        </Button>
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Check the boxes to select frequencies. Press Enter in any field to add a new frequency. You can edit or delete a frequency you added until another net uses it.
      </Typography>

      {/* ========== FREQUENCY FILTER ========== */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Filter frequencies..." value={frequencyFilter}
          onChange={(e) => setFrequencyFilter(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 400 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon color="action" fontSize="small" /></InputAdornment>
            ),
            endAdornment: frequencyFilter && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setFrequencyFilter('')}><ClearIcon fontSize="small" /></IconButton>
              </InputAdornment>
            ),
          }}
        />
        <FormControlLabel
          control={<Switch size="small" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />}
          label="Selected only"
          sx={{ mr: 0, whiteSpace: 'nowrap' }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {filteredFrequencies.length} of {frequencies.length}
        </Typography>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">Use</TableCell>
              {(['mode', 'frequency', 'talkgroup', 'description'] as FrequencySortField[]).map((field) => (
                <TableCell key={field} sortDirection={frequencySortField === field ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === field}
                    direction={frequencySortField === field ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort(field)}
                  >
                    {field === 'frequency' ? 'Frequency/Network' : field === 'talkgroup' ? 'TG/Room' : field.charAt(0).toUpperCase() + field.slice(1)}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedFrequencies.map((freq: FrequencyItem) => renderRow(freq))}
            {renderNewRow()}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ========== DELETE CONFIRMATION ========== */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete frequency?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget && describeFrequency(deleteTarget)} will be removed from the shared list.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* ========== REQUEST A CHANGE FROM THE ADMINS ========== */}
      <FrequencyChangeRequestDialog
        request={changeRequest}
        context={context}
        onClose={() => {
          setChangeRequest(null);
          setEditingId(null);
        }}
      />

      {/* ========== COVERAGE FREQUENCIES ========== */}
      {/* Only when coverage logging is on: a drill's repeater or DMR
          talkgroup says nothing about who hears whom directly, so the
          manager can leave it out of the "who can you hear?" dialog. */}
      {coverageExcludedFrequencyIds && setCoverageExcludedFrequencyIds && selectedFrequencyIds.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2">Coverage reports</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Untick repeaters and talkgroups. Everyone hears everyone through them, so only direct (simplex) frequencies
            say who can reach whom. To record whether a site could get into a repeater, add it as a site of type
            Repeater or node instead.
          </Typography>
          {frequencies
            .filter((f) => f.id != null && selectedFrequencyIds.includes(f.id))
            .map((f) => (
              <Box key={f.id}>
                <Checkbox
                  size="small"
                  checked={!coverageExcludedFrequencyIds.includes(f.id!)}
                  onChange={(e) => setCoverageExcludedFrequencyIds((prev) =>
                    e.target.checked ? prev.filter((id) => id !== f.id) : [...prev, f.id!]
                  )}
                  inputProps={{ 'aria-label': `Collect coverage reports on ${getDisplayText(f)} ${f.mode}` }}
                />
                <Typography variant="body2" component="span">
                  {getDisplayText(f)} {f.mode}{f.talkgroup ? ` TG ${f.talkgroup}` : ''}{f.description ? ` (${f.description})` : ''}
                </Typography>
              </Box>
            ))}
        </Box>
      )}
    </>
  );
};

export default CommunicationPlanPanel;

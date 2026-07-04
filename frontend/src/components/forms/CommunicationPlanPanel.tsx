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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { frequencyApi } from '../../services/api';

// ========== SHARED COMMUNICATION PLAN PANEL ==========
// Frequency / channel selection table used by both CreateSchedule and CreateNet

export interface FrequencyItem {
  id?: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

type FrequencySortField = 'mode' | 'frequency' | 'talkgroup' | 'description';
type SortDirection = 'asc' | 'desc';

interface CommunicationPlanPanelProps {
  frequencies: FrequencyItem[];
  setFrequencies: React.Dispatch<React.SetStateAction<FrequencyItem[]>>;
  selectedFrequencyIds: number[];
  setSelectedFrequencyIds: React.Dispatch<React.SetStateAction<number[]>>;
}

const CommunicationPlanPanel: React.FC<CommunicationPlanPanelProps> = ({
  frequencies,
  setFrequencies,
  selectedFrequencyIds,
  setSelectedFrequencyIds,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FrequencyItem | null>(null);
  const [newFrequency, setNewFrequency] = useState({ frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' });
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [frequencySortField, setFrequencySortField] = useState<FrequencySortField>('mode');
  const [frequencySortDirection, setFrequencySortDirection] = useState<SortDirection>('asc');

  // ---- Filtering and sorting ----
  const filteredFrequencies = frequencies.filter((freq: FrequencyItem) => {
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

  // ---- Frequency CRUD ----
  const handleAddFrequency = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    if (!newFrequency.frequency && !newFrequency.network) return;
    try {
      const cleanData = {
        frequency: newFrequency.frequency || null,
        mode: newFrequency.mode,
        network: newFrequency.network || null,
        talkgroup: newFrequency.talkgroup || null,
        description: newFrequency.description || null,
      };
      const response = await frequencyApi.create(cleanData);
      setFrequencies([...frequencies, response.data]);
      setSelectedFrequencyIds([...selectedFrequencyIds, response.data.id]);
      setNewFrequency({ frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' });
    } catch (error) {
      console.error('Failed to create frequency:', error);
      alert('Failed to create frequency. Check that you filled in required fields.');
    }
  };

  const handleDeleteFrequency = async (id: number) => {
    if (!confirm('Delete this frequency?')) return;
    try {
      await frequencyApi.delete(id);
      setFrequencies(frequencies.filter((f: FrequencyItem) => f.id !== id));
      setSelectedFrequencyIds(selectedFrequencyIds.filter((fid: number) => fid !== id));
    } catch (error) {
      console.error('Failed to delete frequency:', error);
    }
  };

  const startEdit = (freq: FrequencyItem) => {
    setEditingId(freq.id!);
    setEditForm({ ...freq });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const doSaveEdit = async (overrideForm?: FrequencyItem | null) => {
    const formToSave = overrideForm || editForm;
    if (!formToSave || !editingId) return;
    try {
      const cleanData = {
        frequency: formToSave.frequency || null,
        mode: formToSave.mode,
        network: formToSave.network || null,
        talkgroup: formToSave.talkgroup || null,
        description: formToSave.description || null,
      };
      const response = await frequencyApi.update(editingId, cleanData);
      setFrequencies(frequencies.map((f: FrequencyItem) => f.id === editingId ? response.data : f));
      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Failed to update frequency:', error);
      alert('Failed to update frequency.');
    }
  };

  const saveEdit = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    await doSaveEdit();
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
  const renderEditableRow = (freq: FrequencyItem) => {
    const isEditing = editingId === freq.id;
    const form = isEditing ? editForm! : freq;
    const isAnalog = ['FM', 'SSB', 'GMRS'].includes(form.mode);
    const isYSF = form.mode === 'YSF';

    return (
      <TableRow key={freq.id}>
        <TableCell padding="checkbox">
          <Checkbox
            checked={selectedFrequencyIds.includes(freq.id!)}
            onChange={() => toggleSelection(freq.id!)}
          />
        </TableCell>
        <TableCell>
          {isEditing ? (
            <FormControl size="small" fullWidth>
              <Select
                value={form.mode}
                onChange={(e: any) => {
                  const newMode = e.target.value;
                  const updatedForm = { ...form, mode: newMode };
                  setEditForm(updatedForm);
                  doSaveEdit(updatedForm);
                }}
              >
                <MenuItem value="FM">FM</MenuItem>
                <MenuItem value="GMRS">GMRS</MenuItem>
                <MenuItem value="SSB">SSB</MenuItem>
                <MenuItem value="DMR">DMR</MenuItem>
                <MenuItem value="D-STAR">D-STAR</MenuItem>
                <MenuItem value="YSF">YSF</MenuItem>
                <MenuItem value="P25">P25</MenuItem>
              </Select>
            </FormControl>
          ) : (
            freq.mode
          )}
        </TableCell>
        <TableCell>
          {isEditing ? (
            isAnalog ? (
              <TextField
                size="small" fullWidth value={form.frequency || ''}
                onChange={(e: any) => setEditForm({ ...form, frequency: e.target.value, network: '', talkgroup: '' })}
                onKeyPress={saveEdit} placeholder="146.520 MHz"
              />
            ) : (
              <TextField
                size="small" fullWidth value={form.network || ''}
                onChange={(e: any) => setEditForm({ ...form, network: e.target.value, frequency: '' })}
                onKeyPress={saveEdit} placeholder={isYSF ? 'Room (e.g., UFB)' : 'Network'}
              />
            )
          ) : (
            getDisplayText(freq)
          )}
        </TableCell>
        <TableCell>
          {isEditing && !isAnalog && !isYSF ? (
            <TextField
              size="small" fullWidth value={form.talkgroup || ''}
              onChange={(e: any) => setEditForm({ ...form, talkgroup: e.target.value })}
              onKeyPress={saveEdit} placeholder="TG"
            />
          ) : !isAnalog && freq.talkgroup ? (
            freq.talkgroup
          ) : (
            '-'
          )}
        </TableCell>
        <TableCell>
          {isEditing ? (
            <TextField
              size="small" fullWidth value={form.description || ''}
              onChange={(e: any) => setEditForm({ ...form, description: e.target.value })}
              onKeyPress={saveEdit}
            />
          ) : (
            freq.description || '-'
          )}
        </TableCell>
        <TableCell>
          {isEditing ? (
            <>
              <IconButton type="button" size="small" onClick={() => saveEdit()} color="primary"><CheckIcon /></IconButton>
              <IconButton type="button" size="small" onClick={cancelEdit}><CloseIcon /></IconButton>
            </>
          ) : (
            <>
              <IconButton type="button" size="small" onClick={() => startEdit(freq)}><EditIcon /></IconButton>
              <IconButton type="button" size="small" onClick={() => handleDeleteFrequency(freq.id!)} color="error"><DeleteIcon /></IconButton>
            </>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const renderNewRow = () => {
    const isAnalog = ['FM', 'SSB', 'GMRS'].includes(newFrequency.mode);
    const isYSF = newFrequency.mode === 'YSF';

    return (
      <TableRow>
        <TableCell padding="checkbox"></TableCell>
        <TableCell>
          <FormControl size="small" fullWidth>
            <Select
              value={newFrequency.mode}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, mode: e.target.value })}
            >
              <MenuItem value="FM">FM</MenuItem>
              <MenuItem value="GMRS">GMRS</MenuItem>
              <MenuItem value="SSB">SSB</MenuItem>
              <MenuItem value="DMR">DMR</MenuItem>
              <MenuItem value="D-STAR">D-STAR</MenuItem>
              <MenuItem value="YSF">YSF</MenuItem>
              <MenuItem value="P25">P25</MenuItem>
            </Select>
          </FormControl>
        </TableCell>
        <TableCell>
          {isAnalog ? (
            <TextField size="small" fullWidth value={newFrequency.frequency}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, frequency: e.target.value, network: '', talkgroup: '' })}
              onKeyPress={handleAddFrequency} placeholder="146.520 MHz"
            />
          ) : (
            <TextField size="small" fullWidth value={newFrequency.network}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, network: e.target.value, frequency: '' })}
              onKeyPress={handleAddFrequency} placeholder={isYSF ? 'UFB, America-Link...' : 'Network name'}
            />
          )}
        </TableCell>
        <TableCell>
          {!isAnalog && !isYSF ? (
            <TextField size="small" fullWidth value={newFrequency.talkgroup}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, talkgroup: e.target.value })}
              onKeyPress={handleAddFrequency} placeholder="TG"
            />
          ) : '-'}
        </TableCell>
        <TableCell>
          <TextField size="small" fullWidth value={newFrequency.description}
            onChange={(e: any) => setNewFrequency({ ...newFrequency, description: e.target.value })}
            onKeyPress={handleAddFrequency} placeholder="Optional"
          />
        </TableCell>
        <TableCell>
          <Button type="button" size="small" variant="contained" onClick={() => handleAddFrequency()}
            disabled={!newFrequency.frequency && !newFrequency.network}
          >
            Add
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Check the boxes to select frequencies for this schedule. Press Enter in any field to add a new frequency.
      </Typography>

      {/* ========== FREQUENCY FILTER ========== */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
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
        <Typography variant="body2" color="text.secondary">
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
            {sortedFrequencies.map((freq: FrequencyItem) => renderEditableRow(freq))}
            {renderNewRow()}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default CommunicationPlanPanel;

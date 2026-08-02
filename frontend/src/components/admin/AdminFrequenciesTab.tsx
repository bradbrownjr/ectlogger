import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Fab,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import useSortableTable from '../../hooks/useSortableTable';
import { frequencyApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
  created_at: string;
  net_count: number;
}

type FrequencySortField = 'frequency' | 'mode' | 'network' | 'talkgroup' | 'description' | 'net_count';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AdminFrequenciesTab: React.FC<Props> = ({ showSnackbar }) => {
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [frequenciesLoading, setFrequenciesLoading] = useState(false);
  const [frequencyDialogOpen, setFrequencyDialogOpen] = useState(false);
  const [editingFrequency, setEditingFrequency] = useState<Frequency | null>(null);
  const [frequencyForm, setFrequencyForm] = useState({
    frequency: '',
    mode: 'FM',
    network: '',
    talkgroup: '',
    description: '',
  });
  const [frequencySaving, setFrequencySaving] = useState(false);
  const [deleteFrequencyDialogOpen, setDeleteFrequencyDialogOpen] = useState(false);
  const [frequencyToDelete, setFrequencyToDelete] = useState<Frequency | null>(null);
  const [frequencyFilter, setFrequencyFilter] = useState('');

  const { sortField: frequencySortField, sortDirection: frequencySortDirection, handleSort: handleFrequencySort } =
    useSortableTable<FrequencySortField>('frequency');

  const fetchFrequencies = async () => {
    setFrequenciesLoading(true);
    try {
      const response = await frequencyApi.listWithUsage();
      setFrequencies(response.data);
    } catch (error) {
      console.error('Failed to fetch frequencies:', error);
    } finally {
      setFrequenciesLoading(false);
    }
  };

  useEffect(() => {
    fetchFrequencies();
  }, []);

  // ========== FREQUENCY FILTERING & SORTING ==========
  const filteredFrequencies = frequencies.filter((freq) => {
    if (!frequencyFilter) return true;
    const searchTerm = frequencyFilter.toLowerCase();
    return (
      (freq.frequency?.toLowerCase().includes(searchTerm)) ||
      (freq.mode?.toLowerCase().includes(searchTerm)) ||
      (freq.network?.toLowerCase().includes(searchTerm)) ||
      (freq.talkgroup?.toLowerCase().includes(searchTerm)) ||
      (freq.description?.toLowerCase().includes(searchTerm))
    );
  });

  const sortedFrequencies = [...filteredFrequencies].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (frequencySortField) {
      case 'frequency':
        aVal = a.frequency || '';
        bVal = b.frequency || '';
        break;
      case 'mode':
        aVal = a.mode || '';
        bVal = b.mode || '';
        break;
      case 'network':
        aVal = a.network || '';
        bVal = b.network || '';
        break;
      case 'talkgroup':
        aVal = a.talkgroup || '';
        bVal = b.talkgroup || '';
        break;
      case 'description':
        aVal = a.description || '';
        bVal = b.description || '';
        break;
      case 'net_count':
        aVal = a.net_count;
        bVal = b.net_count;
        break;
    }

    if (frequencySortField === 'net_count') {
      return frequencySortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }

    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return frequencySortDirection === 'asc' ? comparison : -comparison;
  });

  const handleOpenFrequencyDialog = (frequency?: Frequency) => {
    if (frequency) {
      setEditingFrequency(frequency);
      setFrequencyForm({
        frequency: frequency.frequency || '',
        mode: frequency.mode,
        network: frequency.network || '',
        talkgroup: frequency.talkgroup || '',
        description: frequency.description || '',
      });
    } else {
      setEditingFrequency(null);
      setFrequencyForm({
        frequency: '',
        mode: 'FM',
        network: '',
        talkgroup: '',
        description: '',
      });
    }
    setFrequencyDialogOpen(true);
  };

  const handleSaveFrequency = async () => {
    if (!frequencyForm.frequency && !frequencyForm.network) {
      showSnackbar('Either frequency or network is required', 'error');
      return;
    }

    setFrequencySaving(true);
    try {
      const payload = {
        frequency: frequencyForm.frequency || null,
        mode: frequencyForm.mode,
        network: frequencyForm.network || null,
        talkgroup: frequencyForm.talkgroup || null,
        description: frequencyForm.description || null,
      };

      if (editingFrequency) {
        await frequencyApi.update(editingFrequency.id, payload);
        showSnackbar('Frequency updated successfully', 'success');
      } else {
        await frequencyApi.create(payload);
        showSnackbar('Frequency created successfully', 'success');
      }
      setFrequencyDialogOpen(false);
      fetchFrequencies();
    } catch (error: any) {
      console.error('Failed to save frequency:', error);
      const message = getErrorMessage(error, 'Failed to save frequency');
      showSnackbar(message, 'error');
    } finally {
      setFrequencySaving(false);
    }
  };

  const handleDeleteFrequencyClick = (frequency: Frequency) => {
    setFrequencyToDelete(frequency);
    setDeleteFrequencyDialogOpen(true);
  };

  const handleDeleteFrequency = async () => {
    if (!frequencyToDelete) return;

    try {
      await frequencyApi.delete(frequencyToDelete.id);
      showSnackbar('Frequency deleted successfully', 'success');
      setDeleteFrequencyDialogOpen(false);
      setFrequencyToDelete(null);
      fetchFrequencies();
    } catch (error: any) {
      console.error('Failed to delete frequency:', error);
      const message = getErrorMessage(error, 'Failed to delete frequency');
      showSnackbar(message, 'error');
    }
  };

  return (
    <>
      {/* ========== FREQUENCIES TAB ========== */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Manage global frequencies available for all nets. Pre-populate common frequencies, DMR talkgroups, and digital modes.
      </Alert>

      {/* ========== FREQUENCY FILTER INPUT ========== */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField
          size="small"
          placeholder="Filter by frequency, mode, network, talkgroup, or description..."
          value={frequencyFilter}
          onChange={(e) => setFrequencyFilter(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 500 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: frequencyFilter && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setFrequencyFilter('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {filteredFrequencies.length} of {frequencies.length} frequencies
        </Typography>
      </Box>

      {frequenciesLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            {/* ========== SORTABLE TABLE HEADERS ========== */}
            <TableHead>
              <TableRow>
                <TableCell sortDirection={frequencySortField === 'frequency' ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === 'frequency'}
                    direction={frequencySortField === 'frequency' ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort('frequency')}
                  >
                    Frequency
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={frequencySortField === 'mode' ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === 'mode'}
                    direction={frequencySortField === 'mode' ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort('mode')}
                  >
                    Mode
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={frequencySortField === 'network' ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === 'network'}
                    direction={frequencySortField === 'network' ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort('network')}
                  >
                    Network
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={frequencySortField === 'talkgroup' ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === 'talkgroup'}
                    direction={frequencySortField === 'talkgroup' ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort('talkgroup')}
                  >
                    Talkgroup
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={frequencySortField === 'description' ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === 'description'}
                    direction={frequencySortField === 'description' ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort('description')}
                  >
                    Description
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sortDirection={frequencySortField === 'net_count' ? frequencySortDirection : false}>
                  <TableSortLabel
                    active={frequencySortField === 'net_count'}
                    direction={frequencySortField === 'net_count' ? frequencySortDirection : 'asc'}
                    onClick={() => handleFrequencySort('net_count')}
                  >
                    Nets Using
                  </TableSortLabel>
                </TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedFrequencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {frequencies.length === 0
                        ? 'No frequencies defined. Click the + button to add one.'
                        : 'No frequencies match your filter.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedFrequencies.map((freq) => (
                  <TableRow key={freq.id}>
                    <TableCell>{freq.frequency || '-'}</TableCell>
                    <TableCell>
                      <Chip label={freq.mode} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{freq.network || '-'}</TableCell>
                    <TableCell>{freq.talkgroup || '-'}</TableCell>
                    <TableCell>{freq.description || '-'}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={freq.net_count}
                        size="small"
                        color={freq.net_count > 0 ? 'primary' : 'default'}
                        variant={freq.net_count > 0 ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit frequency">
                        <IconButton size="small" onClick={() => handleOpenFrequencyDialog(freq)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={freq.net_count > 0 ? 'Cannot delete: frequency is in use' : 'Delete frequency'}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteFrequencyClick(freq)}
                            disabled={freq.net_count > 0}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Frequency FAB */}
      <Tooltip title="Add frequency">
        <Fab
          color="primary"
          aria-label="add frequency"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => handleOpenFrequencyDialog()}
        >
          <AddIcon />
        </Fab>
      </Tooltip>

      {/* Frequency Add/Edit Dialog */}
      <Dialog open={frequencyDialogOpen} onClose={() => setFrequencyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingFrequency ? 'Edit Frequency' : 'Add Frequency'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Frequency"
              value={frequencyForm.frequency}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, frequency: e.target.value })}
              placeholder="e.g., 146.520 MHz"
              helperText="Leave blank for digital-only modes"
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Mode</InputLabel>
              <Select
                value={frequencyForm.mode}
                label="Mode"
                onChange={(e) => setFrequencyForm({ ...frequencyForm, mode: e.target.value })}
              >
                <MenuItem value="FM">FM</MenuItem>
                <MenuItem value="AM">AM</MenuItem>
                <MenuItem value="SSB">SSB</MenuItem>
                <MenuItem value="CW">CW</MenuItem>
                <MenuItem value="DMR">DMR</MenuItem>
                <MenuItem value="D-STAR">D-STAR</MenuItem>
                <MenuItem value="YSF">YSF (Fusion)</MenuItem>
                <MenuItem value="P25">P25</MenuItem>
                <MenuItem value="NXDN">NXDN</MenuItem>
                <MenuItem value="M17">M17</MenuItem>
                <MenuItem value="VARA">VARA</MenuItem>
                <MenuItem value="Winlink">Winlink</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Network"
              value={frequencyForm.network}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, network: e.target.value })}
              placeholder="e.g., Brandmeister, Wires-X, REF030C"
              helperText="For digital modes: network or reflector name"
              fullWidth
            />
            <TextField
              label="Talkgroup/Room"
              value={frequencyForm.talkgroup}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, talkgroup: e.target.value })}
              placeholder="e.g., 31665, Room 12345"
              helperText="For digital modes: talkgroup ID or room number"
              fullWidth
            />
            <TextField
              label="Description"
              value={frequencyForm.description}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, description: e.target.value })}
              placeholder="e.g., Local repeater, SKYWARN net"
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFrequencyDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveFrequency}
            variant="contained"
            disabled={frequencySaving || (!frequencyForm.frequency && !frequencyForm.network)}
            startIcon={frequencySaving ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {editingFrequency ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Frequency Confirmation Dialog */}
      <Dialog open={deleteFrequencyDialogOpen} onClose={() => setDeleteFrequencyDialogOpen(false)}>
        <DialogTitle>Delete Frequency</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this frequency?
          </Typography>
          {frequencyToDelete && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Frequency:</strong> {frequencyToDelete.frequency || '-'}
              </Typography>
              <Typography variant="body2">
                <strong>Mode:</strong> {frequencyToDelete.mode}
              </Typography>
              {frequencyToDelete.network && (
                <Typography variant="body2">
                  <strong>Network:</strong> {frequencyToDelete.network}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFrequencyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteFrequency} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AdminFrequenciesTab;

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  FormControl,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Checkbox,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { netApi, frequencyApi } from '../services/api';

interface Frequency {
  id?: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

const CreateNet: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState<number[]>([]);
  const [newFrequency, setNewFrequency] = useState({ frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Frequency | null>(null);
  const [fieldConfig, setFieldConfig] = useState({
    name: { enabled: true, required: false },
    location: { enabled: true, required: false },
    skywarn_number: { enabled: false, required: false },
    weather_observation: { enabled: false, required: false },
    power_source: { enabled: false, required: false },
    feedback: { enabled: false, required: false },
    notes: { enabled: false, required: false },
  });
  const navigate = useNavigate();
  const isEditMode = !!netId;

  useEffect(() => {
    fetchFrequencies();
    if (netId) {
      fetchNetData();
    }
  }, [netId]);

  const fetchNetData = async () => {
    if (!netId) return;
    try {
      const response = await netApi.get(parseInt(netId));
      setName(response.data.name);
      setDescription(response.data.description || '');
      setSelectedFrequencies(response.data.frequencies.map((f: Frequency) => f.id!));
      if (response.data.field_config) {
        setFieldConfig(response.data.field_config);
      }
    } catch (error) {
      console.error('Failed to fetch net:', error);
      alert('Failed to load net data');
    }
  };

  const fetchFrequencies = async () => {
    try {
      const response = await frequencyApi.list();
      setFrequencies(response.data);
    } catch (error) {
      console.error('Failed to fetch frequencies:', error);
    }
  };

  const handleAddFrequency = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    if (!newFrequency.frequency && !newFrequency.network) return;
    
    try {
      // Clean up the data - convert empty strings to null
      const cleanData = {
        frequency: newFrequency.frequency || null,
        mode: newFrequency.mode,
        network: newFrequency.network || null,
        talkgroup: newFrequency.talkgroup || null,
        description: newFrequency.description || null,
      };
      
      const response = await frequencyApi.create(cleanData);
      setFrequencies([...frequencies, response.data]);
      setSelectedFrequencies([...selectedFrequencies, response.data.id]);
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
      setFrequencies(frequencies.filter((f: Frequency) => f.id !== id));
      setSelectedFrequencies(selectedFrequencies.filter((fid: number) => fid !== id));
    } catch (error) {
      console.error('Failed to delete frequency:', error);
    }
  };

  const startEdit = (freq: Frequency) => {
    setEditingId(freq.id!);
    setEditForm({ ...freq });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;
    if (!editForm || !editingId) return;
    
    try {
      // Clean up the data - convert empty strings to null
      const cleanData = {
        frequency: editForm.frequency || null,
        mode: editForm.mode,
        network: editForm.network || null,
        talkgroup: editForm.talkgroup || null,
        description: editForm.description || null,
      };
      
      const response = await frequencyApi.update(editingId, cleanData);
      setFrequencies(frequencies.map((f: Frequency) => f.id === editingId ? response.data : f));
      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Failed to update frequency:', error);
      alert('Failed to update frequency.');
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedFrequencies((prev: number[]) =>
      prev.includes(id) ? prev.filter((fid: number) => fid !== id) : [...prev, id]
    );
  };

  const getDisplayText = (freq: Frequency) => {
    if (freq.frequency) return freq.frequency;
    if (freq.network) return freq.network;
    return 'N/A';
  };

  const renderEditableRow = (freq: Frequency) => {
    const isEditing = editingId === freq.id;
    const form = isEditing ? editForm! : freq;
    const isAnalog = ['FM', 'SSB'].includes(form.mode);
    const isYSF = form.mode === 'YSF';

    return (
      <TableRow key={freq.id}>
        <TableCell padding="checkbox">
          <Checkbox
            checked={selectedFrequencies.includes(freq.id!)}
            onChange={() => toggleSelection(freq.id!)}
          />
        </TableCell>
        <TableCell>
          {isEditing ? (
            <FormControl size="small" fullWidth>
              <Select
                value={form.mode}
                onChange={(e: any) => setEditForm({ ...form, mode: e.target.value })}
              >
                <MenuItem value="FM">FM</MenuItem>
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
                size="small"
                fullWidth
                value={form.frequency || ''}
                onChange={(e: any) => setEditForm({ ...form, frequency: e.target.value, network: '', talkgroup: '' })}
                onKeyPress={saveEdit}
                placeholder="146.520 MHz"
              />
            ) : (
              <TextField
                size="small"
                fullWidth
                value={form.network || ''}
                onChange={(e: any) => setEditForm({ ...form, network: e.target.value, frequency: '' })}
                onKeyPress={saveEdit}
                placeholder={isYSF ? "Room (e.g., UFB)" : "Network"}
              />
            )
          ) : (
            getDisplayText(freq)
          )}
        </TableCell>
        <TableCell>
          {isEditing && !isAnalog && !isYSF ? (
            <TextField
              size="small"
              fullWidth
              value={form.talkgroup || ''}
              onChange={(e: any) => setEditForm({ ...form, talkgroup: e.target.value })}
              onKeyPress={saveEdit}
              placeholder="TG"
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
              size="small"
              fullWidth
              value={form.description || ''}
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
              <IconButton size="small" onClick={saveEdit} color="primary">
                <CheckIcon />
              </IconButton>
              <IconButton size="small" onClick={cancelEdit}>
                <CloseIcon />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton size="small" onClick={() => startEdit(freq)}>
                <EditIcon />
              </IconButton>
              <IconButton size="small" onClick={() => handleDeleteFrequency(freq.id!)} color="error">
                <DeleteIcon />
              </IconButton>
            </>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const renderNewRow = () => {
    const isAnalog = ['FM', 'SSB'].includes(newFrequency.mode);
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
            <TextField
              size="small"
              fullWidth
              value={newFrequency.frequency}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, frequency: e.target.value, network: '', talkgroup: '' })}
              onKeyPress={handleAddFrequency}
              placeholder="146.520 MHz"
            />
          ) : (
            <TextField
              size="small"
              fullWidth
              value={newFrequency.network}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, network: e.target.value, frequency: '' })}
              onKeyPress={handleAddFrequency}
              placeholder={isYSF ? "UFB, America-Link..." : "Network name"}
            />
          )}
        </TableCell>
        <TableCell>
          {!isAnalog && !isYSF ? (
            <TextField
              size="small"
              fullWidth
              value={newFrequency.talkgroup}
              onChange={(e: any) => setNewFrequency({ ...newFrequency, talkgroup: e.target.value })}
              onKeyPress={handleAddFrequency}
              placeholder="TG"
            />
          ) : (
            '-'
          )}
        </TableCell>
        <TableCell>
          <TextField
            size="small"
            fullWidth
            value={newFrequency.description}
            onChange={(e: any) => setNewFrequency({ ...newFrequency, description: e.target.value })}
            onKeyPress={handleAddFrequency}
            placeholder="Optional"
          />
        </TableCell>
        <TableCell>
          <Button
            size="small"
            variant="contained"
            onClick={() => handleAddFrequency()}
            disabled={!newFrequency.frequency && !newFrequency.network}
          >
            Add
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const handleCreateNet = async () => {
    try {
      if (isEditMode) {
        const response = await netApi.update(parseInt(netId!), {
          name,
          description,
          frequency_ids: selectedFrequencies,
          field_config: fieldConfig,
        });
        navigate(`/nets/${response.data.id}`);
      } else {
        const response = await netApi.create({
          name,
          description,
          frequency_ids: selectedFrequencies,
          field_config: fieldConfig,
        });
        navigate(`/nets/${response.data.id}`);
      }
    } catch (error) {
      console.error('Failed to save net:', error);
      alert('Failed to save net');
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {isEditMode ? 'Edit Net' : 'Create New Net'}
        </Typography>

        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            label="Net Name"
            value={name}
            onChange={(e: any) => setName(e.target.value)}
            margin="normal"
            required
          />

          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e: any) => setDescription(e.target.value)}
            margin="normal"
            multiline
            rows={3}
          />

          <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
            Check-In Fields
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configure which fields are available during check-in. Callsign is always required.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {Object.entries(fieldConfig).map(([fieldName, config]) => (
              <Box key={fieldName} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Checkbox
                  checked={config.enabled}
                  onChange={(e: any) => 
                    setFieldConfig({
                      ...fieldConfig,
                      [fieldName]: { ...config, enabled: e.target.checked, required: e.target.checked ? config.required : false }
                    })
                  }
                />
                <Typography sx={{ minWidth: 200 }}>
                  {fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </Typography>
                {config.enabled && (
                  <Checkbox
                    checked={config.required}
                    onChange={(e: any) =>
                      setFieldConfig({
                        ...fieldConfig,
                        [fieldName]: { ...config, required: e.target.checked }
                      })
                    }
                  />
                )}
                {config.enabled && (
                  <Typography variant="body2" color="text.secondary">
                    Required
                  </Typography>
                )}
              </Box>
            ))}
          </Box>

          <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
            Communication Plan
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Check the boxes to select frequencies for this net. Press Enter in any field to add a new frequency.
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">Use</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Frequency/Network</TableCell>
                  <TableCell>TG/Room</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {frequencies.map((freq: Frequency) => renderEditableRow(freq))}
                {renderNewRow()}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCreateNet}
              disabled={!name || selectedFrequencies.length === 0}
            >
              {isEditMode ? 'Save Changes' : 'Create Net'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateNet;

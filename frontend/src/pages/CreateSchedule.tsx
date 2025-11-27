import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Autocomplete,
  InputLabel,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { templateApi, frequencyApi, userApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

interface FieldDefinition {
  id: number;
  name: string;
  label: string;
  field_type: string;
  options?: string[];
  placeholder?: string;
  default_enabled: boolean;
  default_required: boolean;
  is_builtin: boolean;
  is_archived: boolean;
  sort_order: number;
}

// Get timezone abbreviation (e.g., EST, EDT, UTC)
const getTimezoneAbbr = () => {
  const date = new Date();
  const timeString = date.toLocaleTimeString('en-US', { timeZoneName: 'short' });
  const match = timeString.match(/[A-Z]{2,5}$/);
  return match ? match[0] : Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const CreateSchedule: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(scheduleId);
  const timezoneAbbr = getTimezoneAbbr();
  const { user: currentUser } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [selectedFrequencyIds, setSelectedFrequencyIds] = useState<number[]>([]);
  const [newFrequency, setNewFrequency] = useState({ frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Frequency | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [fieldConfig, setFieldConfig] = useState<Record<string, { enabled: boolean; required: boolean }>>({});
  const [isActive, setIsActive] = useState(true);
  
  // Owner management (for editing)
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [originalOwnerId, setOriginalOwnerId] = useState<number | null>(null);
  
  // Schedule configuration
  const [scheduleType, setScheduleType] = useState('ad_hoc');
  const [scheduleConfig, setScheduleConfig] = useState({
    day_of_week: 1, // Monday
    week_of_month: [], // e.g., [1, 3] for 1st and 3rd week
    time: '18:00'
  });

  useEffect(() => {
    fetchFrequencies();
    fetchFieldDefinitions();
    if (isEdit) {
      fetchUsers();
    }
  }, [isEdit]);

  useEffect(() => {
    if (isEdit && fieldDefinitions.length > 0) {
      fetchScheduleData();
    }
  }, [scheduleId, fieldDefinitions]);

  const fetchFieldDefinitions = async () => {
    try {
      const response = await api.get('/settings/fields');
      setFieldDefinitions(response.data);
      // Initialize fieldConfig with defaults from field definitions
      const defaultConfig: Record<string, { enabled: boolean; required: boolean }> = {};
      response.data.forEach((field: FieldDefinition) => {
        defaultConfig[field.name] = {
          enabled: field.default_enabled,
          required: field.default_required,
        };
      });
      setFieldConfig(defaultConfig);
    } catch (error) {
      console.error('Failed to fetch field definitions:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await userApi.listUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
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
      setFrequencies(frequencies.filter((f: Frequency) => f.id !== id));
      setSelectedFrequencyIds(selectedFrequencyIds.filter((fid: number) => fid !== id));
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
    await doSaveEdit();
  };

  const doSaveEdit = async (overrideForm?: typeof editForm) => {
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
      setFrequencies(frequencies.map((f: Frequency) => f.id === editingId ? response.data : f));
      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error('Failed to update frequency:', error);
      alert('Failed to update frequency.');
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedFrequencyIds((prev: number[]) =>
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
                  // Auto-save when mode changes
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

  const fetchScheduleData = async () => {
    if (!scheduleId) return;
    try {
      const response = await templateApi.get(Number(scheduleId));
      const Schedule = response.data;
      setName(Schedule.name);
      setDescription(Schedule.description || '');
      setSelectedFrequencyIds(Schedule.frequencies.map((f: any) => f.id));
      // Set owner info
      setOwnerId(Schedule.owner_id);
      setOriginalOwnerId(Schedule.owner_id);
      // Merge saved config with field definitions (in case new fields were added)
      if (Schedule.field_config) {
        const mergedConfig: Record<string, { enabled: boolean; required: boolean }> = {};
        fieldDefinitions.forEach((field: FieldDefinition) => {
          mergedConfig[field.name] = Schedule.field_config[field.name] || {
            enabled: field.default_enabled,
            required: field.default_required,
          };
        });
        setFieldConfig(mergedConfig);
      }
      setIsActive(Schedule.is_active);
      setScheduleType(Schedule.schedule_type || 'ad_hoc');
      setScheduleConfig(Schedule.schedule_config || { day_of_week: 1, week_of_month: [], time: '18:00' });
    } catch (error) {
      console.error('Failed to fetch Schedule:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const ScheduleData: any = {
      name,
      description,
      frequency_ids: selectedFrequencyIds,
      field_config: fieldConfig,
      is_active: isActive,
      schedule_type: scheduleType,
      schedule_config: scheduleConfig,
    };
    
    // Include owner_id if changed (only for edit mode)
    if (isEdit && ownerId && ownerId !== originalOwnerId) {
      ScheduleData.owner_id = ownerId;
    }

    try {
      if (isEdit) {
        await templateApi.update(Number(scheduleId), ScheduleData);
      } else {
        await templateApi.create(ScheduleData);
      }
      navigate('/scheduler');
    } catch (error: any) {
      console.error('Failed to save Schedule:', error);
      alert(error.response?.data?.detail || 'Failed to save Schedule');
    }
  };

  const handleFieldToggle = (fieldName: string, property: 'enabled' | 'required') => {
    setFieldConfig(prev => {
      const currentConfig = prev[fieldName] || { enabled: false, required: false };
      return {
        ...prev,
        [fieldName]: {
          ...currentConfig,
          [property]: !currentConfig[property],
          // If disabling, also disable required
          ...(property === 'enabled' && currentConfig.enabled ? { required: false } : {})
        }
      };
    });
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
          <Typography variant="h4" component="h1">
            {isEdit ? 'Edit Schedule' : 'Create Schedule'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
          <TextField
            fullWidth
            label="Schedule Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            required
            helperText="e.g., 'Weekly SKYWARN Net', 'Monthly Emergency Preparedness Net'"
          />

          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            margin="normal"
            multiline
            rows={3}
            helperText="Optional description of the net Schedule"
          />

          {/* Owner selector - only show when editing and user is owner or admin */}
          {isEdit && users.length > 0 && (currentUser?.role === 'admin' || currentUser?.id === originalOwnerId) && (
            <Autocomplete
              options={users}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={users.find((u: User) => u.id === ownerId) || null}
              onChange={(_: any, value: User | null) => setOwnerId(value?.id || null)}
              renderInput={(params: any) => (
                <TextField 
                  {...params} 
                  label="Owner / Default NCS" 
                  margin="normal"
                  helperText="The owner is the default NCS when no rotation is configured"
                />
              )}
              sx={{ mt: 2 }}
            />
          )}

          <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
            Schedule Configuration
          </Typography>

          <FormControl fullWidth margin="normal">
            <Select
              value={scheduleType}
              onChange={(e) => {
                setScheduleType(e.target.value);
                // Reset config when changing type
                if (e.target.value === 'ad_hoc') {
                  setScheduleConfig({ day_of_week: 1, week_of_month: [], time: '18:00' });
                }
              }}
            >
              <MenuItem value="ad_hoc">Ad-Hoc (As Needed)</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </Select>
          </FormControl>

          {scheduleType === 'daily' && (
            <TextField
              fullWidth
              type="time"
              label={`Time (${timezoneAbbr})`}
              value={scheduleConfig.time}
              onChange={(e) => setScheduleConfig({ ...scheduleConfig, time: e.target.value })}
              margin="normal"
              InputLabelProps={{ shrink: true }}
            />
          )}

          {scheduleType === 'weekly' && (
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <FormControl fullWidth>
                <Select
                  value={scheduleConfig.day_of_week}
                  onChange={(e) => setScheduleConfig({ ...scheduleConfig, day_of_week: Number(e.target.value) })}
                >
                  <MenuItem value={1}>Monday</MenuItem>
                  <MenuItem value={2}>Tuesday</MenuItem>
                  <MenuItem value={3}>Wednesday</MenuItem>
                  <MenuItem value={4}>Thursday</MenuItem>
                  <MenuItem value={5}>Friday</MenuItem>
                  <MenuItem value={6}>Saturday</MenuItem>
                  <MenuItem value={0}>Sunday</MenuItem>
                </Select>
              </FormControl>
              <TextField
                type="time"
                label={`Time (${timezoneAbbr})`}
                value={scheduleConfig.time}
                onChange={(e) => setScheduleConfig({ ...scheduleConfig, time: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />
            </Box>
          )}

          {scheduleType === 'monthly' && (
            <Box sx={{ mt: 2 }}>
              <FormGroup sx={{ flexDirection: 'row', gap: 2, mb: 2 }}>
                {[1, 2, 3, 4, 5].map(week => (
                  <FormControlLabel
                    key={week}
                    control={
                      <Checkbox
                        checked={scheduleConfig.week_of_month?.includes(week) || false}
                        onChange={(e) => {
                          const weeks = scheduleConfig.week_of_month || [];
                          if (e.target.checked) {
                            setScheduleConfig({ ...scheduleConfig, week_of_month: [...weeks, week] });
                          } else {
                            setScheduleConfig({ ...scheduleConfig, week_of_month: weeks.filter(w => w !== week) });
                          }
                        }}
                      />
                    }
                    label={week === 5 ? 'Last' : `${week}${week === 1 ? 'st' : week === 2 ? 'nd' : week === 3 ? 'rd' : 'th'}`}
                  />
                ))}
              </FormGroup>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl fullWidth>
                  <Select
                    value={scheduleConfig.day_of_week}
                    onChange={(e) => setScheduleConfig({ ...scheduleConfig, day_of_week: Number(e.target.value) })}
                  >
                    <MenuItem value={1}>Monday</MenuItem>
                    <MenuItem value={2}>Tuesday</MenuItem>
                    <MenuItem value={3}>Wednesday</MenuItem>
                    <MenuItem value={4}>Thursday</MenuItem>
                    <MenuItem value={5}>Friday</MenuItem>
                    <MenuItem value={6}>Saturday</MenuItem>
                    <MenuItem value={0}>Sunday</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  type="time"
                  label={`Time (${timezoneAbbr})`}
                  value={scheduleConfig.time}
                  onChange={(e) => setScheduleConfig({ ...scheduleConfig, time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 150 }}
                />
              </Box>
            </Box>
          )}

          <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
            Communication Plan
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Check the boxes to select frequencies for this Schedule. Press Enter in any field to add a new frequency.
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

          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Check-In Field Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Configure which fields are available when stations check in to nets created from this Schedule
            </Typography>
          </Box>

          <FormGroup>
            {fieldDefinitions.map((field) => {
              const config = fieldConfig[field.name] || { enabled: false, required: false };
              return (
              <Box key={field.name} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
                <Typography sx={{ minWidth: 180 }}>
                  {field.label}:
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.enabled}
                      onChange={() => handleFieldToggle(field.name, 'enabled')}
                    />
                  }
                  label="Enabled"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.required}
                      onChange={() => handleFieldToggle(field.name, 'required')}
                      disabled={!config.enabled}
                    />
                  }
                  label="Required"
                />
              </Box>
            )})}
          </FormGroup>

          {isEdit && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
              }
              label="Schedule is active (can be used to create nets)"
              sx={{ mt: 2 }}
            />
          )}

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button variant="outlined" onClick={() => navigate('/scheduler')}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              {isEdit ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateSchedule;

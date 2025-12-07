import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Switch,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { templateApi, frequencyApi, userApi, ncsRotationApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

interface RotationMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  position: number;
  is_active: boolean;
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(scheduleId);
  const timezoneAbbr = getTimezoneAbbr();
  const { user: currentUser } = useAuth();
  
  // Check if coming from Dashboard + button for one-time net
  const initialType = searchParams.get('type') || 'ad_hoc';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [infoUrl, setInfoUrl] = useState('');
  const [script, setScript] = useState('');
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [selectedFrequencyIds, setSelectedFrequencyIds] = useState<number[]>([]);
  const [newFrequency, setNewFrequency] = useState({ frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Frequency | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [fieldConfig, setFieldConfig] = useState<Record<string, { enabled: boolean; required: boolean }>>({});
  const [isActive, setIsActive] = useState(true);
  
  // Script file upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptTextAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // NCS Rotation
  const [rotationMembers, setRotationMembers] = useState<RotationMember[]>([]);
  const [selectedUserForRotation, setSelectedUserForRotation] = useState<User | null>(null);
  // Pending NCS users for new schedules (assigned after creation)
  const [pendingNCSUsers, setPendingNCSUsers] = useState<User[]>([]);
  
  // Owner management (for editing)
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [originalOwnerId, setOriginalOwnerId] = useState<number | null>(null);
  
  // Schedule configuration
  const [scheduleType, setScheduleType] = useState(initialType);
  const [scheduleConfig, setScheduleConfig] = useState({
    day_of_week: 1, // Monday
    week_of_month: [], // e.g., [1, 3] for 1st and 3rd week
    time: '18:00'
  });

  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Prevent double-click from accidentally submitting when advancing to final tab
  const handleNextTab = () => {
    if (activeTab === 4) {
      // Going to final tab - briefly disable submit to prevent accidental double-click
      setIsTransitioning(true);
      setActiveTab(5);
      setTimeout(() => setIsTransitioning(false), 500);
    } else {
      setActiveTab(activeTab + 1);
    }
  };

  useEffect(() => {
    fetchFrequencies();
    fetchFieldDefinitions();
    fetchUsers(); // Always fetch users for NCS rotation
  }, []);

  useEffect(() => {
    if (isEdit && fieldDefinitions.length > 0) {
      fetchScheduleData();
    }
  }, [scheduleId, fieldDefinitions]);

  useEffect(() => {
    // Fetch rotation members when editing
    if (isEdit && scheduleId) {
      fetchRotationMembers();
    }
  }, [scheduleId, isEdit]);

  const fetchRotationMembers = async () => {
    if (!scheduleId) return;
    try {
      const response = await ncsRotationApi.listMembers(Number(scheduleId));
      setRotationMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch rotation members:', error);
    }
  };

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
              <IconButton type="button" size="small" onClick={saveEdit} color="primary">
                <CheckIcon />
              </IconButton>
              <IconButton type="button" size="small" onClick={cancelEdit}>
                <CloseIcon />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton type="button" size="small" onClick={() => startEdit(freq)}>
                <EditIcon />
              </IconButton>
              <IconButton type="button" size="small" onClick={() => handleDeleteFrequency(freq.id!)} color="error">
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
            type="button"
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
      setInfoUrl(Schedule.info_url || '');
      setScript(Schedule.script || '');
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

  // Script file upload handlers
  const handleScriptFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setScript(text);
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleScriptDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setScript(text);
      };
      reader.readAsText(file);
    }
  };

  const handleScriptDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  // Markdown formatting helper
  const insertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '') => {
    const textarea = scriptTextAreaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = script.substring(start, end);
    const textToInsert = selectedText || placeholder;
    
    const newText = script.substring(0, start) + prefix + textToInsert + suffix + script.substring(end);
    setScript(newText);
    
    // Set cursor position after the operation
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + textToInsert.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // NCS Rotation handlers
  const handleAddRotationMember = async () => {
    if (!selectedUserForRotation || !scheduleId) return;
    try {
      const response = await ncsRotationApi.addMember(Number(scheduleId), {
        user_id: selectedUserForRotation.id,
        position: rotationMembers.length + 1
      });
      setRotationMembers([...rotationMembers, response.data]);
      setSelectedUserForRotation(null);
    } catch (error) {
      console.error('Failed to add rotation member:', error);
      alert('Failed to add rotation member');
    }
  };

  const handleRemoveRotationMember = async (memberId: number) => {
    if (!scheduleId) return;
    try {
      await ncsRotationApi.removeMember(Number(scheduleId), memberId);
      setRotationMembers(rotationMembers.filter(m => m.id !== memberId));
    } catch (error) {
      console.error('Failed to remove rotation member:', error);
    }
  };

  const handleToggleRotationMemberActive = async (memberId: number, currentActive: boolean) => {
    if (!scheduleId) return;
    try {
      await ncsRotationApi.updateMember(Number(scheduleId), memberId, { is_active: !currentActive });
      setRotationMembers(rotationMembers.map(m => 
        m.id === memberId ? { ...m, is_active: !currentActive } : m
      ));
    } catch (error) {
      console.error('Failed to update rotation member:', error);
    }
  };

  const handleMoveRotationMember = async (memberId: number, direction: 'up' | 'down') => {
    if (!scheduleId) return;
    const currentIndex = rotationMembers.findIndex(m => m.id === memberId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= rotationMembers.length) return;
    
    const newOrder = [...rotationMembers];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    
    try {
      await ncsRotationApi.reorderMembers(Number(scheduleId), newOrder.map(m => m.id));
      setRotationMembers(newOrder.map((m, i) => ({ ...m, position: i + 1 })));
    } catch (error) {
      console.error('Failed to reorder rotation members:', error);
    }
  };

  // Get users not already in rotation
  const availableUsersForRotation = users.filter(
    u => !rotationMembers.some(m => m.user_id === u.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const ScheduleData: any = {
      name,
      description,
      info_url: infoUrl || null,
      script,
      frequency_ids: selectedFrequencyIds,
      field_config: fieldConfig,
      is_active: isActive,
      schedule_type: scheduleType,
      schedule_config: scheduleConfig,
    };
    
    // Include owner_id if changed (for both create and edit)
    if (isEdit && ownerId && ownerId !== originalOwnerId) {
      ScheduleData.owner_id = ownerId;
    } else if (!isEdit && ownerId && ownerId !== currentUser?.id) {
      // Admin creating for another user
      ScheduleData.owner_id = ownerId;
    }

    try {
      if (isEdit) {
        await templateApi.update(Number(scheduleId), ScheduleData);
        navigate('/scheduler');
      } else {
        const response = await templateApi.create(ScheduleData);
        const newScheduleId = response.data.id;
        
        // Add pending NCS users to the new schedule
        for (const user of pendingNCSUsers) {
          try {
            await ncsRotationApi.addMember(newScheduleId, {
              user_id: user.id,
              position: pendingNCSUsers.indexOf(user) + 1
            });
          } catch (err) {
            console.error(`Failed to add NCS ${user.callsign}:`, err);
          }
        }
        
        // For one-time nets, automatically create the net and navigate to it
        if (scheduleType === 'one_time') {
          try {
            const netResponse = await templateApi.createNetFromTemplate(newScheduleId);
            navigate(`/nets/${netResponse.data.id}`);
            return;
          } catch (err) {
            console.error('Failed to auto-create net:', err);
            // Fall through to navigate to scheduler
          }
        }
        
        navigate('/scheduler');
      }
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

  // Sort frequencies by mode for display
  const sortedFrequencies = [...frequencies].sort((a, b) => {
    const modeOrder = ['FM', 'GMRS', 'SSB', 'DMR', 'D-STAR', 'YSF', 'P25'];
    return modeOrder.indexOf(a.mode) - modeOrder.indexOf(b.mode);
  });

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

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} variant="scrollable" scrollButtons="auto">
            <Tab label="Basic Info" />
            <Tab label="Schedule" />
            <Tab label="Net Staff" />
            <Tab label="Communication Plan" />
            <Tab label="Net Script" />
            <Tab label="Check-In Fields" />
          </Tabs>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          {/* Tab 0: Basic Info */}
          <TabPanel value={activeTab} index={0}>
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
              rows={4}
              helperText="Optional description of the net schedule"
            />

            <TextField
              fullWidth
              label="Info URL"
              value={infoUrl}
              onChange={(e) => setInfoUrl(e.target.value)}
              margin="normal"
              type="url"
              placeholder="https://example.com/net-info"
              helperText="Optional URL for net, club or organization info"
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

            {isEdit && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                }
                label="Schedule is active (can be used to create nets)"
                sx={{ mt: 2, display: 'block' }}
              />
            )}
          </TabPanel>

          {/* Tab 1: Schedule Configuration */}
          <TabPanel value={activeTab} index={1}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose how often this net runs:
            </Typography>
            <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
              <li><strong>One-Time</strong> — Create a single net right now (for special events or testing)</li>
              <li><strong>Ad-Hoc</strong> — Save as a template to start nets manually whenever needed</li>
              <li><strong>Daily/Weekly/Monthly</strong> — Set up a recurring schedule</li>
            </Box>

            <FormControl fullWidth margin="normal">
              <InputLabel>Schedule Type</InputLabel>
              <Select
                value={scheduleType}
                label="Schedule Type"
                onChange={(e) => {
                  setScheduleType(e.target.value);
                  // Reset config when changing type
                  if (e.target.value === 'ad_hoc' || e.target.value === 'one_time') {
                    setScheduleConfig({ day_of_week: 1, week_of_month: [], time: '18:00' });
                  }
                }}
              >
                <MenuItem value="one_time">One-Time Net</MenuItem>
                <MenuItem value="ad_hoc">Ad-Hoc (Start Manually)</MenuItem>
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
                  <InputLabel>Day of Week</InputLabel>
                  <Select
                    value={scheduleConfig.day_of_week}
                    label="Day of Week"
                    onChange={(e) => setScheduleConfig({ ...scheduleConfig, day_of_week: Number(e.target.value) })}
                  >
                    <MenuItem value={0}>Sunday</MenuItem>
                    <MenuItem value={1}>Monday</MenuItem>
                    <MenuItem value={2}>Tuesday</MenuItem>
                    <MenuItem value={3}>Wednesday</MenuItem>
                    <MenuItem value={4}>Thursday</MenuItem>
                    <MenuItem value={5}>Friday</MenuItem>
                    <MenuItem value={6}>Saturday</MenuItem>
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
                <Typography variant="body2" sx={{ mb: 1 }}>Which weeks of the month?</Typography>
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
                    <InputLabel>Day of Week</InputLabel>
                    <Select
                      value={scheduleConfig.day_of_week}
                      label="Day of Week"
                      onChange={(e) => setScheduleConfig({ ...scheduleConfig, day_of_week: Number(e.target.value) })}
                    >
                      <MenuItem value={0}>Sunday</MenuItem>
                      <MenuItem value={1}>Monday</MenuItem>
                      <MenuItem value={2}>Tuesday</MenuItem>
                      <MenuItem value={3}>Wednesday</MenuItem>
                      <MenuItem value={4}>Thursday</MenuItem>
                      <MenuItem value={5}>Friday</MenuItem>
                      <MenuItem value={6}>Saturday</MenuItem>
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
          </TabPanel>

          {/* Tab 2: Net Staff */}
          <TabPanel value={activeTab} index={2}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {isEdit 
                ? 'Manage NCS operators for this schedule. Any operator listed here can start and run nets. Use the arrows to set the rotation order - the system will automatically cycle through operators for each scheduled net.'
                : 'Add NCS operators who can start and run nets from this schedule. The order you add them determines the rotation schedule - the system will automatically assign operators in order for each scheduled net.'}
            </Typography>

            {/* Add user input - works for both new and edit modes */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Autocomplete
                options={isEdit 
                  ? availableUsersForRotation 
                  : users.filter(u => {
                      // Filter out pending users and the owner
                      const effectiveOwnerId = ownerId || currentUser?.id;
                      return u.id !== effectiveOwnerId && !pendingNCSUsers.some(p => p.id === u.id);
                    })}
                getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                value={selectedUserForRotation}
                onChange={(_: any, value: User | null) => setSelectedUserForRotation(value)}
                renderInput={(params: any) => (
                  <TextField {...params} label="Add NCS Operator" size="small" />
                )}
                sx={{ flexGrow: 1 }}
              />
              <Button
                type="button"
                variant="contained"
                startIcon={<PersonAddIcon />}
                onClick={() => {
                  if (isEdit) {
                    handleAddRotationMember();
                  } else if (selectedUserForRotation) {
                    setPendingNCSUsers([...pendingNCSUsers, selectedUserForRotation]);
                    setSelectedUserForRotation(null);
                  }
                }}
                disabled={!selectedUserForRotation}
              >
                Add
              </Button>
            </Box>

            {/* For NEW schedules - show owner first, then pending users */}
            {!isEdit && (
              <>
                {/* Owner display and selector */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Schedule Owner</Typography>
                  {currentUser?.role === 'admin' ? (
                    <Autocomplete
                      options={users}
                      getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                      value={users.find((u: User) => u.id === (ownerId || currentUser?.id)) || null}
                      onChange={(_: any, value: User | null) => setOwnerId(value?.id || null)}
                      renderInput={(params: any) => (
                        <TextField 
                          {...params} 
                          size="small"
                          helperText="Admin: You can assign this schedule to another user"
                        />
                      )}
                    />
                  ) : (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1, 
                      p: 1.5, 
                      bgcolor: 'action.hover', 
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'primary.main'
                    }}>
                      <Typography fontWeight="bold">{currentUser?.callsign}</Typography>
                      {currentUser?.name && (
                        <Typography color="text.secondary">({currentUser.name})</Typography>
                      )}
                      <Chip label="Owner" size="small" color="primary" />
                    </Box>
                  )}
                </Box>

                <Divider sx={{ my: 2 }} />
                
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Additional NCS Operators</Typography>
                {pendingNCSUsers.length === 0 ? (
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No additional NCS operators added yet.
                  </Typography>
                ) : (
                  <List>
                    {pendingNCSUsers.map((user, index) => (
                      <ListItem
                        key={user.id}
                        sx={{
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1,
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography fontWeight="bold">{user.callsign}</Typography>
                              {user.name && (
                                <Typography color="text.secondary">({user.name})</Typography>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            type="button"
                            edge="end"
                            onClick={() => setPendingNCSUsers(pendingNCSUsers.filter(u => u.id !== user.id))}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </>
            )}

            {/* For EDIT mode - show existing rotation members with full controls */}
            {isEdit && (
              rotationMembers.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No additional NCS operators assigned. Add operators above to let them start nets.
                </Typography>
              ) : (
                <List>
                  {rotationMembers.map((member, index) => (
                    <ListItem
                      key={member.id}
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        mb: 1,
                        bgcolor: member.is_active ? 'background.paper' : 'action.disabledBackground',
                      }}
                    >
                      <ListItemIcon>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <IconButton
                            type="button"
                            size="small"
                            onClick={() => handleMoveRotationMember(member.id, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            type="button"
                            size="small"
                            onClick={() => handleMoveRotationMember(member.id, 'down')}
                            disabled={index === rotationMembers.length - 1}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={`#${index + 1}`} size="small" color="primary" variant="outlined" />
                            <Typography fontWeight="bold">{member.user_callsign}</Typography>
                            {member.user_name && (
                              <Typography color="text.secondary">({member.user_name})</Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={member.is_active}
                          onChange={() => handleToggleRotationMemberActive(member.id, member.is_active)}
                          title={member.is_active ? 'Active in rotation' : 'Inactive (skipped)'}
                        />
                        <IconButton
                          type="button"
                          edge="end"
                          onClick={() => handleRemoveRotationMember(member.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )
            )}
          </TabPanel>

          {/* Tab 3: Communication Plan */}
          <TabPanel value={activeTab} index={3}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Check the boxes to select frequencies for this schedule. Press Enter in any field to add a new frequency.
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
                  {sortedFrequencies.map((freq: Frequency) => renderEditableRow(freq))}
                  {renderNewRow()}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* Tab 4: Net Script */}
          <TabPanel value={activeTab} index={4}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter the net script that NCS operators will follow. Use the formatting toolbar for markdown styling.
            </Typography>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleScriptFileUpload}
              accept=".txt,.md,text/plain,text/markdown"
              style={{ display: 'none' }}
            />

            {/* Formatting Toolbar */}
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Tooltip title="Heading 1">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('# ', '', 'Heading')} sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                  H1
                </IconButton>
              </Tooltip>
              <Tooltip title="Heading 2">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('## ', '', 'Heading')} sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                  H2
                </IconButton>
              </Tooltip>
              <Tooltip title="Heading 3">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('### ', '', 'Heading')} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>
                  H3
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Bold (**text**)">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('**', '**', 'bold text')}>
                  <FormatBoldIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Italic (*text*)">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('*', '*', 'italic text')}>
                  <FormatItalicIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Bulleted List">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('- ', '', 'List item')}>
                  <FormatListBulletedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Numbered List">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('1. ', '', 'List item')}>
                  <FormatListNumberedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Horizontal Rule">
                <IconButton type="button" size="small" onClick={() => insertMarkdown('\n---\n', '', '')}>
                  <HorizontalRuleIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <TextField
              fullWidth
              value={script}
              onChange={(e) => setScript(e.target.value)}
              multiline
              rows={18}
              inputRef={scriptTextAreaRef}
              placeholder="Enter your net script here...

## Opening
Good evening, this is **[CALLSIGN]** calling the [NET NAME].

This net meets every [DAY] at [TIME] on [FREQUENCY].

*Is there any emergency or priority traffic?*

---

## Check-Ins
We will now take check-ins...

- Acknowledge each station
- Note any traffic requests

---

## Closing
This concludes tonight's net. 73 to all."
              onDrop={handleScriptDrop}
              onDragOver={handleScriptDragOver}
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'monospace',
                },
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {script.length} characters • Supports Markdown formatting
              </Typography>
              <Button
                type="button"
                size="small"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload .txt or .md file
              </Button>
            </Box>
          </TabPanel>

          {/* Tab 5: Check-In Fields */}
          <TabPanel value={activeTab} index={5}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Configure which fields are available when stations check in to nets created from this schedule.
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Field</TableCell>
                    <TableCell align="center">Enabled</TableCell>
                    <TableCell align="center">Required</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fieldDefinitions.map((field) => {
                    const config = fieldConfig[field.name] || { enabled: false, required: false };
                    return (
                      <TableRow key={field.name}>
                        <TableCell>{field.label}</TableCell>
                        <TableCell align="center">
                          <Checkbox
                            checked={config.enabled}
                            onChange={() => handleFieldToggle(field.name, 'enabled')}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox
                            checked={config.required}
                            onChange={() => handleFieldToggle(field.name, 'required')}
                            disabled={!config.enabled}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* Navigation buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button type="button" variant="outlined" onClick={() => navigate('/scheduler')}>
                Cancel
              </Button>
              {activeTab > 0 && (
                <Button type="button" variant="outlined" onClick={() => setActiveTab(activeTab - 1)}>
                  Previous
                </Button>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {activeTab < 5 ? (
                <Button type="button" variant="contained" onClick={handleNextTab}>
                  Next
                </Button>
              ) : (
                <Button type="submit" variant="contained" color="primary" disabled={isTransitioning}>
                  {isEdit ? 'Save Changes' : 'Create Schedule'}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateSchedule;
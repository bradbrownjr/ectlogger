import React, { useState, useEffect, useRef } from 'react';
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
  Tabs,
  Tab,
  Tooltip,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { netApi, frequencyApi } from '../services/api';
import api from '../services/api';

interface Frequency {
  id?: number;
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
      id={`net-tabpanel-${index}`}
      aria-labelledby={`net-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const CreateNet: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const [activeTab, setActiveTab] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [script, setScript] = useState('');
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState<number[]>([]);
  const [newFrequency, setNewFrequency] = useState({ frequency: '', mode: 'FM', network: '', talkgroup: '', description: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Frequency | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [fieldConfig, setFieldConfig] = useState<Record<string, { enabled: boolean; required: boolean }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const isEditMode = !!netId;

  useEffect(() => {
    fetchFrequencies();
    fetchFieldDefinitions();
  }, []);

  useEffect(() => {
    if (netId && fieldDefinitions.length > 0) {
      fetchNetData();
    }
  }, [netId, fieldDefinitions]);

  const fetchFieldDefinitions = async () => {
    try {
      const response = await api.get('/settings/fields');
      setFieldDefinitions(response.data);
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

  const fetchNetData = async () => {
    if (!netId) return;
    try {
      const response = await netApi.get(parseInt(netId));
      setName(response.data.name);
      setDescription(response.data.description || '');
      setScript(response.data.script || '');
      setSelectedFrequencies(response.data.frequencies.map((f: Frequency) => f.id!));
      if (response.data.field_config) {
        const mergedConfig: Record<string, { enabled: boolean; required: boolean }> = {};
        fieldDefinitions.forEach((field: FieldDefinition) => {
          mergedConfig[field.name] = response.data.field_config[field.name] || {
            enabled: field.default_enabled,
            required: field.default_required,
          };
        });
        setFieldConfig(mergedConfig);
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
    setSelectedFrequencies((prev: number[]) =>
      prev.includes(id) ? prev.filter((fid: number) => fid !== id) : [...prev, id]
    );
  };

  const getDisplayText = (freq: Frequency) => {
    if (freq.frequency) return freq.frequency;
    if (freq.network) return freq.network;
    return 'N/A';
  };

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

  const handleScriptDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && (file.type === 'text/plain' || file.name.endsWith('.txt'))) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setScript(text);
      };
      reader.readAsText(file);
    }
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

  const handleCreateNet = async () => {
    try {
      if (isEditMode) {
        const response = await netApi.update(parseInt(netId!), {
          name,
          description,
          script,
          frequency_ids: selectedFrequencies,
          field_config: fieldConfig,
        });
        navigate(`/nets/${response.data.id}`);
      } else {
        const response = await netApi.create({
          name,
          description,
          script,
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

  // Sort frequencies by mode, then by frequency/network
  const sortedFrequencies = [...frequencies].sort((a, b) => {
    if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
    const aVal = a.frequency || a.network || '';
    const bVal = b.frequency || b.network || '';
    return aVal.localeCompare(bVal);
  });

  const renderEditableRow = (freq: Frequency) => {
    const isEditing = editingId === freq.id;
    const form = isEditing ? editForm! : freq;
    const isAnalog = ['FM', 'SSB', 'GMRS'].includes(form.mode);
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
              <IconButton size="small" onClick={() => saveEdit()} color="primary">
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

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {isEditMode ? 'Edit Net' : 'Create New Net'}
        </Typography>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={(_, newValue) => setActiveTab(newValue)}
            aria-label="net configuration tabs"
          >
            <Tab label="Basic Info" />
            <Tab label="Communication Plan" />
            <Tab label="Net Script" />
            <Tab label="Check-In Fields" />
          </Tabs>
        </Box>

        {/* Tab 1: Basic Info */}
        <TabPanel value={activeTab} index={0}>
          <Typography variant="h6" gutterBottom>
            Net Information
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter the basic information about this net.
          </Typography>

          <TextField
            fullWidth
            label="Net Name"
            value={name}
            onChange={(e: any) => setName(e.target.value)}
            margin="normal"
            required
            placeholder="e.g., SKYWARN Net, Emergency Comm Net"
          />

          <TextField
            fullWidth
            label="Description"
            value={description}
            onChange={(e: any) => setDescription(e.target.value)}
            margin="normal"
            multiline
            rows={4}
            placeholder="Describe the purpose and scope of this net..."
          />
        </TabPanel>

        {/* Tab 2: Communication Plan */}
        <TabPanel value={activeTab} index={1}>
          <Typography variant="h6" gutterBottom>
            Communication Plan
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Select the frequencies and modes for this net. Check the boxes to include them. 
            Press Enter in any field to add a new frequency.
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

          {selectedFrequencies.length === 0 && (
            <Typography color="error" sx={{ mt: 2 }}>
              Please select at least one frequency for this net.
            </Typography>
          )}
        </TabPanel>

        {/* Tab 3: Net Script */}
        <TabPanel value={activeTab} index={2}>
          <Typography variant="h6" gutterBottom>
            Net Script
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter a script or checklist for NCS to follow during the net. 
            Use the formatting toolbar for markdown styling.
          </Typography>

          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            ref={fileInputRef}
            onChange={handleScriptFileUpload}
            style={{ display: 'none' }}
          />

          {/* Formatting Toolbar */}
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Tooltip title="Heading 1">
              <IconButton size="small" onClick={() => insertMarkdown('# ', '', 'Heading')} sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                H1
              </IconButton>
            </Tooltip>
            <Tooltip title="Heading 2">
              <IconButton size="small" onClick={() => insertMarkdown('## ', '', 'Heading')} sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                H2
              </IconButton>
            </Tooltip>
            <Tooltip title="Heading 3">
              <IconButton size="small" onClick={() => insertMarkdown('### ', '', 'Heading')} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>
                H3
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Bold (**text**)">
              <IconButton size="small" onClick={() => insertMarkdown('**', '**', 'bold text')}>
                <FormatBoldIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Italic (*text*)">
              <IconButton size="small" onClick={() => insertMarkdown('*', '*', 'italic text')}>
                <FormatItalicIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Bulleted List">
              <IconButton size="small" onClick={() => insertMarkdown('- ', '', 'List item')}>
                <FormatListBulletedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Numbered List">
              <IconButton size="small" onClick={() => insertMarkdown('1. ', '', 'List item')}>
                <FormatListNumberedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Horizontal Rule">
              <IconButton size="small" onClick={() => insertMarkdown('\n---\n', '', '')}>
                <HorizontalRuleIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <TextField
            fullWidth
            multiline
            rows={20}
            value={script}
            onChange={(e: any) => setScript(e.target.value)}
            inputRef={scriptTextAreaRef}
            placeholder={`## Opening
Good evening, this is **[CALLSIGN]**, Net Control Station for tonight's [NET NAME].

This net meets every [DAY] at [TIME] on [FREQUENCY].

*Is there any emergency or priority traffic?*

---

## Check-Ins
We will now take check-ins. Please give your callsign phonetically, your name, and location.

- Acknowledge each station
- Note any traffic requests
- Keep a log of all check-ins

---

## Closing
This concludes tonight's net. Thank you all for checking in.
This is **[CALLSIGN]**, closing the net at [TIME]. 73 to all.`}
            onDrop={handleScriptDrop}
            onDragOver={(e) => e.preventDefault()}
            sx={{
              '& .MuiInputBase-input': {
                fontFamily: 'monospace',
                fontSize: '0.95rem',
                lineHeight: 1.6,
              },
            }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {script.length} characters • Supports Markdown formatting
            </Typography>
            <Button
              size="small"
              startIcon={<UploadFileIcon />}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload .txt or .md file
            </Button>
          </Box>
        </TabPanel>

        {/* Tab 4: Check-In Fields */}
        <TabPanel value={activeTab} index={3}>
          <Typography variant="h6" gutterBottom>
            Check-In Fields
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure which fields are available during check-in. Callsign is always required.
            Check "Enabled" to show the field, and "Required" to make it mandatory.
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
                      <TableCell>
                        <Typography>{field.label}</Typography>
                        {field.placeholder && (
                          <Typography variant="caption" color="text.secondary">
                            {field.placeholder}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={config.enabled}
                          onChange={(e: any) => 
                            setFieldConfig({
                              ...fieldConfig,
                              [field.name]: { 
                                ...config, 
                                enabled: e.target.checked, 
                                required: e.target.checked ? config.required : false 
                              }
                            })
                          }
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={config.required}
                          disabled={!config.enabled}
                          onChange={(e: any) =>
                            setFieldConfig({
                              ...fieldConfig,
                              [field.name]: { ...config, required: e.target.checked }
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Action Buttons - Always visible */}
        <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 2, justifyContent: 'space-between' }}>
          <Box>
            {activeTab > 0 && (
              <Button variant="outlined" onClick={() => setActiveTab(activeTab - 1)}>
                Previous
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" onClick={() => navigate(isEditMode ? `/nets/${netId}` : '/dashboard')}>
              Cancel
            </Button>
            {activeTab < 3 ? (
              <Button variant="contained" onClick={() => setActiveTab(activeTab + 1)}>
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleCreateNet}
                disabled={!name || selectedFrequencies.length === 0}
              >
                {isEditMode ? 'Save Changes' : 'Create Net'}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateNet;

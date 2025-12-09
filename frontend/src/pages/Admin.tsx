import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tabs,
  Tab,
  TextField,
  Switch,
  Snackbar,
  CircularProgress,
  Tooltip,
  FormHelperText,
  Fab,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  InputAdornment,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import HistoryIcon from '@mui/icons-material/History';
import RadioIcon from '@mui/icons-material/Radio';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { frequencyApi } from '../services/api';

interface User {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
  role: string;
  is_active: boolean;
  created_at: string;
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
  created_at: string;
}

interface Fail2BanStatus {
  installed: boolean;
  running: boolean;
  jail_enabled: boolean;
  currently_banned: number;
  total_banned: number;
  banned_ips: string[];
  log_file_configured: boolean;
  log_file_path: string | null;
  max_retries: number;
  find_time: number;
  ban_time: number;
}

interface SecurityLogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  ip: string | null;
}

interface SecurityInfo {
  fail2ban: Fail2BanStatus;
  recent_auth_events: SecurityLogEntry[];
}

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

// Frequency sorting types
type FrequencySortField = 'frequency' | 'mode' | 'network' | 'talkgroup' | 'description' | 'net_count';
type SortDirection = 'asc' | 'desc';

// User sorting types
type UserSortField = 'email' | 'name' | 'callsign' | 'role' | 'status' | 'created_at';

// Field sorting types
type FieldSortField = 'name' | 'label' | 'type' | 'default_enabled' | 'default_required' | 'status';

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
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text (single line)' },
  { value: 'textarea', label: 'Text Area (multi-line)' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown Select' },
];

const Admin: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  
  // Add user dialog state
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({
    email: '',
    name: '',
    callsign: '',
    role: 'user',
  });
  const [addUserSaving, setAddUserSaving] = useState(false);
  
  // Field definitions state
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [fieldForm, setFieldForm] = useState({
    name: '',
    label: '',
    field_type: 'text',
    options: [] as string[],
    placeholder: '',
    default_enabled: false,
    default_required: false,
    sort_order: 100,
  });
  const [fieldSaving, setFieldSaving] = useState(false);
  
  // Security state
  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  
  // Frequencies state
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
  // Frequency filtering and sorting
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [frequencySortField, setFrequencySortField] = useState<FrequencySortField>('frequency');
  const [frequencySortDirection, setFrequencySortDirection] = useState<SortDirection>('asc');
  
  // User filtering and sorting
  const [userFilter, setUserFilter] = useState('');
  const [userSortField, setUserSortField] = useState<UserSortField>('callsign');
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>('asc');
  
  // Field filtering and sorting
  const [fieldFilter, setFieldFilter] = useState('');
  const [fieldSortField, setFieldSortField] = useState<FieldSortField>('name');
  const [fieldSortDirection, setFieldSortDirection] = useState<SortDirection>('asc');
  
  // Schedule creation limits state
  const [scheduleSettings, setScheduleSettings] = useState({
    schedule_min_account_age_days: 7,
    schedule_min_net_participations: 1,
    schedule_max_per_day: 5,
  });
  const [scheduleSettingsLoading, setScheduleSettingsLoading] = useState(false);
  const [scheduleSettingsSaving, setScheduleSettingsSaving] = useState(false);
  
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchUsers();
    fetchFields();
    fetchSecurityInfo();
    fetchScheduleSettings();
    fetchFrequencies();
  }, [currentUser, navigate]);

  useEffect(() => {
    fetchFields();
  }, [showArchived]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchFields = async () => {
    setFieldsLoading(true);
    try {
      const response = await api.get(`/settings/fields?include_archived=${showArchived}`);
      setFields(response.data);
    } catch (error) {
      console.error('Failed to fetch fields:', error);
    } finally {
      setFieldsLoading(false);
    }
  };

  const fetchSecurityInfo = async () => {
    setSecurityLoading(true);
    try {
      const response = await api.get('/security/info');
      setSecurityInfo(response.data);
    } catch (error) {
      console.error('Failed to fetch security info:', error);
    } finally {
      setSecurityLoading(false);
    }
  };

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

  // ========== FREQUENCY FILTERING & SORTING ==========
  // Filter frequencies by search term (matches any field)
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

  // Sort filtered frequencies
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
    
    // Handle numeric comparison for net_count
    if (frequencySortField === 'net_count') {
      return frequencySortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }
    
    // String comparison for other fields
    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return frequencySortDirection === 'asc' ? comparison : -comparison;
  });

  // Handle sort click
  const handleFrequencySort = (field: FrequencySortField) => {
    if (frequencySortField === field) {
      // Toggle direction if same field
      setFrequencySortDirection(frequencySortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, start with ascending
      setFrequencySortField(field);
      setFrequencySortDirection('asc');
    }
  };

  // ========== USER FILTERING & SORTING ==========
  const filteredUsers = users.filter((user) => {
    if (!userFilter) return true;
    const searchTerm = userFilter.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchTerm) ||
      (user.name?.toLowerCase().includes(searchTerm)) ||
      (user.callsign?.toLowerCase().includes(searchTerm)) ||
      user.role.toLowerCase().includes(searchTerm)
    );
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aVal: string | number | boolean = '';
    let bVal: string | number | boolean = '';
    
    switch (userSortField) {
      case 'email':
        aVal = a.email;
        bVal = b.email;
        break;
      case 'name':
        aVal = a.name || '';
        bVal = b.name || '';
        break;
      case 'callsign':
        aVal = a.callsign || '';
        bVal = b.callsign || '';
        break;
      case 'role':
        aVal = a.role;
        bVal = b.role;
        break;
      case 'status':
        aVal = a.is_active ? 1 : 0;
        bVal = b.is_active ? 1 : 0;
        break;
      case 'created_at':
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
        break;
    }
    
    // Handle numeric comparison
    if (userSortField === 'status' || userSortField === 'created_at') {
      return userSortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }
    
    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return userSortDirection === 'asc' ? comparison : -comparison;
  });

  const handleUserSort = (field: UserSortField) => {
    if (userSortField === field) {
      setUserSortDirection(userSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortField(field);
      setUserSortDirection('asc');
    }
  };

  // ========== FIELD FILTERING & SORTING ==========
  const filteredFields = fields.filter((field) => {
    if (!fieldFilter) return true;
    const searchTerm = fieldFilter.toLowerCase();
    return (
      field.name.toLowerCase().includes(searchTerm) ||
      field.label.toLowerCase().includes(searchTerm) ||
      field.field_type.toLowerCase().includes(searchTerm)
    );
  });

  const sortedFields = [...filteredFields].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';
    
    switch (fieldSortField) {
      case 'name':
        aVal = a.name;
        bVal = b.name;
        break;
      case 'label':
        aVal = a.label;
        bVal = b.label;
        break;
      case 'type':
        aVal = a.field_type;
        bVal = b.field_type;
        break;
      case 'default_enabled':
        aVal = a.default_enabled ? 1 : 0;
        bVal = b.default_enabled ? 1 : 0;
        break;
      case 'default_required':
        aVal = a.default_required ? 1 : 0;
        bVal = b.default_required ? 1 : 0;
        break;
      case 'status':
        // Sort order: Built-in, Custom, Archived
        aVal = a.is_builtin ? 0 : a.is_archived ? 2 : 1;
        bVal = b.is_builtin ? 0 : b.is_archived ? 2 : 1;
        break;
    }
    
    if (fieldSortField === 'status' || fieldSortField === 'default_enabled' || fieldSortField === 'default_required') {
      return fieldSortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }
    
    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return fieldSortDirection === 'asc' ? comparison : -comparison;
  });

  const handleFieldSort = (field: FieldSortField) => {
    if (fieldSortField === field) {
      setFieldSortDirection(fieldSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setFieldSortField(field);
      setFieldSortDirection('asc');
    }
  };

  const fetchScheduleSettings = async () => {
    setScheduleSettingsLoading(true);
    try {
      const response = await api.get('/settings');
      setScheduleSettings({
        schedule_min_account_age_days: response.data.schedule_min_account_age_days ?? 7,
        schedule_min_net_participations: response.data.schedule_min_net_participations ?? 1,
        schedule_max_per_day: response.data.schedule_max_per_day ?? 5,
      });
    } catch (error) {
      console.error('Failed to fetch schedule settings:', error);
    } finally {
      setScheduleSettingsLoading(false);
    }
  };

  const handleSaveScheduleSettings = async () => {
    setScheduleSettingsSaving(true);
    try {
      await api.put('/settings', scheduleSettings);
      setSnackbar({ open: true, message: 'Schedule creation settings saved', severity: 'success' });
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save settings';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setScheduleSettingsSaving(false);
    }
  };

  const handleUnbanIp = async (ip: string) => {
    try {
      await api.post(`/security/unban/${ip}`);
      setSnackbar({ open: true, message: `IP ${ip} has been unbanned`, severity: 'success' });
      fetchSecurityInfo();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to unban IP';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  };

  const handleOpenFieldDialog = (field?: FieldDefinition) => {
    if (field) {
      setEditingField(field);
      setFieldForm({
        name: field.name,
        label: field.label,
        field_type: field.field_type,
        options: field.options || [],
        placeholder: field.placeholder || '',
        default_enabled: field.default_enabled,
        default_required: field.default_required,
        sort_order: field.sort_order,
      });
    } else {
      setEditingField(null);
      setFieldForm({
        name: '',
        label: '',
        field_type: 'text',
        options: [],
        placeholder: '',
        default_enabled: false,
        default_required: false,
        sort_order: 100,
      });
    }
    setFieldDialogOpen(true);
  };

  const handleSaveField = async () => {
    setFieldSaving(true);
    try {
      const payload = {
        label: fieldForm.label,
        field_type: fieldForm.field_type,
        options: fieldForm.field_type === 'select' ? fieldForm.options.filter(o => o.trim()) : null,
        placeholder: fieldForm.placeholder || null,
        default_enabled: fieldForm.default_enabled,
        default_required: fieldForm.default_required,
        sort_order: fieldForm.sort_order,
      };
      
      if (editingField) {
        // Update existing field
        await api.put(`/settings/fields/${editingField.id}`, payload);
        setSnackbar({ open: true, message: 'Field updated successfully', severity: 'success' });
      } else {
        // Create new field
        await api.post('/settings/fields', { ...payload, name: fieldForm.name });
        setSnackbar({ open: true, message: 'Field created successfully', severity: 'success' });
      }
      setFieldDialogOpen(false);
      fetchFields();
    } catch (error: any) {
      console.error('Failed to save field:', error);
      const message = error.response?.data?.detail || 'Failed to save field';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setFieldSaving(false);
    }
  };

  const handleArchiveField = async (field: FieldDefinition) => {
    if (field.is_builtin) {
      setSnackbar({ open: true, message: 'Built-in fields cannot be archived', severity: 'error' });
      return;
    }
    
    try {
      await api.put(`/settings/fields/${field.id}`, { is_archived: !field.is_archived });
      setSnackbar({ 
        open: true, 
        message: field.is_archived ? 'Field restored successfully' : 'Field archived successfully', 
        severity: 'success' 
      });
      fetchFields();
    } catch (error) {
      console.error('Failed to archive field:', error);
      setSnackbar({ open: true, message: 'Failed to archive field', severity: 'error' });
    }
  };

  const handleToggleFieldDefault = async (field: FieldDefinition, key: 'default_enabled' | 'default_required', value: boolean) => {
    try {
      await api.put(`/settings/fields/${field.id}`, { [key]: value });
      fetchFields();
    } catch (error) {
      console.error('Failed to update field:', error);
      setSnackbar({ open: true, message: 'Failed to update field', severity: 'error' });
    }
  };

  // Frequency handlers
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
    // Validate: must have either frequency or network
    if (!frequencyForm.frequency && !frequencyForm.network) {
      setSnackbar({ open: true, message: 'Either frequency or network is required', severity: 'error' });
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
        setSnackbar({ open: true, message: 'Frequency updated successfully', severity: 'success' });
      } else {
        await frequencyApi.create(payload);
        setSnackbar({ open: true, message: 'Frequency created successfully', severity: 'success' });
      }
      setFrequencyDialogOpen(false);
      fetchFrequencies();
    } catch (error: any) {
      console.error('Failed to save frequency:', error);
      const message = error.response?.data?.detail || 'Failed to save frequency';
      setSnackbar({ open: true, message, severity: 'error' });
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
      setSnackbar({ open: true, message: 'Frequency deleted successfully', severity: 'success' });
      setDeleteFrequencyDialogOpen(false);
      setFrequencyToDelete(null);
      fetchFrequencies();
    } catch (error: any) {
      console.error('Failed to delete frequency:', error);
      const message = error.response?.data?.detail || 'Failed to delete frequency';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  };

  const handleBanUser = async (userId: number) => {
    if (!confirm('Are you sure you want to ban this user?')) return;
    
    try {
      await api.put(`/users/${userId}/ban`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to ban user:', error);
      alert('Failed to ban user');
    }
  };

  const handleUnbanUser = async (userId: number) => {
    try {
      await api.put(`/users/${userId}/unban`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to unban user:', error);
      alert('Failed to unban user');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    
    try {
      await api.delete(`/users/${userId}`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    }
  };

  const handleOpenRoleDialog = (user: User) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setRoleDialogOpen(true);
  };

  const handleOpenAddUserDialog = () => {
    setAddUserForm({
      email: '',
      name: '',
      callsign: '',
      role: 'user',
    });
    setAddUserDialogOpen(true);
  };

  const handleAddUser = async () => {
    if (!addUserForm.email) return;
    
    setAddUserSaving(true);
    try {
      await api.post('/users', {
        email: addUserForm.email,
        name: addUserForm.name || null,
        callsign: addUserForm.callsign || null,
        role: addUserForm.role,
      });
      setAddUserDialogOpen(false);
      setSnackbar({ open: true, message: 'User created successfully. They can log in via magic link.', severity: 'success' });
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to create user:', error);
      const message = error.response?.data?.detail || 'Failed to create user';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setAddUserSaving(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    
    try {
      await api.put(`/users/${selectedUser.id}/role`, { role: newRole });
      setRoleDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('Failed to update role');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'error';
      case 'ncs': return 'primary';
      case 'user': return 'default';
      case 'guest': return 'secondary';
      default: return 'default';
    }
  };

  if (currentUser?.role !== 'admin') {
    return null;
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          Admin
        </Typography>

        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Users" id="admin-tab-0" aria-controls="admin-tabpanel-0" icon={<PersonAddIcon />} iconPosition="start" />
          <Tab label="Check-in Fields" id="admin-tab-1" aria-controls="admin-tabpanel-1" icon={<EditIcon />} iconPosition="start" />
          <Tab label="Frequencies" id="admin-tab-2" aria-controls="admin-tabpanel-2" icon={<RadioIcon />} iconPosition="start" />
          <Tab label="Security" id="admin-tab-3" aria-controls="admin-tabpanel-3" icon={<SecurityIcon />} iconPosition="start" />
        </Tabs>

        {/* Users Tab */}
        <TabPanel value={tabValue} index={0}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Manage user accounts, change roles, and ban/unban users.
          </Alert>

          {/* ========== USER FILTER INPUT ========== */}
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              size="small"
              placeholder="Filter by email, name, callsign, or role..."
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              sx={{ flexGrow: 1, maxWidth: 500 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: userFilter && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setUserFilter('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {filteredUsers.length} of {users.length} users
            </Typography>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sortDirection={userSortField === 'email' ? userSortDirection : false}>
                    <TableSortLabel
                      active={userSortField === 'email'}
                      direction={userSortField === 'email' ? userSortDirection : 'asc'}
                      onClick={() => handleUserSort('email')}
                    >
                      Email
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={userSortField === 'name' ? userSortDirection : false}>
                    <TableSortLabel
                      active={userSortField === 'name'}
                      direction={userSortField === 'name' ? userSortDirection : 'asc'}
                      onClick={() => handleUserSort('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={userSortField === 'callsign' ? userSortDirection : false}>
                    <TableSortLabel
                      active={userSortField === 'callsign'}
                      direction={userSortField === 'callsign' ? userSortDirection : 'asc'}
                      onClick={() => handleUserSort('callsign')}
                    >
                      Callsign
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={userSortField === 'role' ? userSortDirection : false}>
                    <TableSortLabel
                      active={userSortField === 'role'}
                      direction={userSortField === 'role' ? userSortDirection : 'asc'}
                      onClick={() => handleUserSort('role')}
                    >
                      Role
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={userSortField === 'status' ? userSortDirection : false}>
                    <TableSortLabel
                      active={userSortField === 'status'}
                      direction={userSortField === 'status' ? userSortDirection : 'asc'}
                      onClick={() => handleUserSort('status')}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={userSortField === 'created_at' ? userSortDirection : false}>
                    <TableSortLabel
                      active={userSortField === 'created_at'}
                      direction={userSortField === 'created_at' ? userSortDirection : 'asc'}
                      onClick={() => handleUserSort('created_at')}
                    >
                      Created
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.name || '-'}</TableCell>
                    <TableCell>{user.callsign || '-'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={user.role.toUpperCase()} 
                        color={getRoleColor(user.role)} 
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={user.is_active ? 'Active' : 'Banned'} 
                        color={user.is_active ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        size="small" 
                        onClick={() => handleOpenRoleDialog(user)}
                        title="Change Role"
                        disabled={user.id === currentUser?.id}
                      >
                        <EditIcon />
                      </IconButton>
                      {user.is_active ? (
                        <IconButton 
                          size="small" 
                          onClick={() => handleBanUser(user.id)}
                          color="warning"
                          title="Ban User"
                          disabled={user.id === currentUser?.id}
                        >
                          <BlockIcon />
                        </IconButton>
                      ) : (
                        <IconButton 
                          size="small" 
                          onClick={() => handleUnbanUser(user.id)}
                          color="success"
                          title="Unban User"
                        >
                          <CheckCircleIcon />
                        </IconButton>
                      )}
                      <IconButton 
                        size="small" 
                        onClick={() => handleDeleteUser(user.id)}
                        color="error"
                        title="Delete User"
                        disabled={user.id === currentUser?.id}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Field Configuration Tab */}
        <TabPanel value={tabValue} index={1}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Configure check-in fields available when creating nets. Custom fields can be added and archived (but not deleted to preserve historical data).
          </Alert>

          {/* ========== FIELD FILTER INPUT ========== */}
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Filter by name, label, or type..."
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              sx={{ flexGrow: 1, maxWidth: 400 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: fieldFilter && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setFieldFilter('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                Show archived
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {sortedFields.filter(f => showArchived || !f.is_archived).length} of {fields.length} fields
            </Typography>
          </Box>

          {fieldsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sortDirection={fieldSortField === 'name' ? fieldSortDirection : false}>
                      <TableSortLabel
                        active={fieldSortField === 'name'}
                        direction={fieldSortField === 'name' ? fieldSortDirection : 'asc'}
                        onClick={() => handleFieldSort('name')}
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={fieldSortField === 'label' ? fieldSortDirection : false}>
                      <TableSortLabel
                        active={fieldSortField === 'label'}
                        direction={fieldSortField === 'label' ? fieldSortDirection : 'asc'}
                        onClick={() => handleFieldSort('label')}
                      >
                        Label
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={fieldSortField === 'type' ? fieldSortDirection : false}>
                      <TableSortLabel
                        active={fieldSortField === 'type'}
                        direction={fieldSortField === 'type' ? fieldSortDirection : 'asc'}
                        onClick={() => handleFieldSort('type')}
                      >
                        Type
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center" sortDirection={fieldSortField === 'default_enabled' ? fieldSortDirection : false}>
                      <TableSortLabel
                        active={fieldSortField === 'default_enabled'}
                        direction={fieldSortField === 'default_enabled' ? fieldSortDirection : 'asc'}
                        onClick={() => handleFieldSort('default_enabled')}
                      >
                        Default Enabled
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center" sortDirection={fieldSortField === 'default_required' ? fieldSortDirection : false}>
                      <TableSortLabel
                        active={fieldSortField === 'default_required'}
                        direction={fieldSortField === 'default_required' ? fieldSortDirection : 'asc'}
                        onClick={() => handleFieldSort('default_required')}
                      >
                        Default Required
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={fieldSortField === 'status' ? fieldSortDirection : false}>
                      <TableSortLabel
                        active={fieldSortField === 'status'}
                        direction={fieldSortField === 'status' ? fieldSortDirection : 'asc'}
                        onClick={() => handleFieldSort('status')}
                      >
                        Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedFields.filter(f => showArchived || !f.is_archived).map((field) => (
                    <TableRow 
                      key={field.id}
                      sx={{ 
                        opacity: field.is_archived ? 0.6 : 1,
                        backgroundColor: field.is_archived ? 'action.hover' : 'inherit',
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {field.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{field.label}</TableCell>
                      <TableCell>
                        <Chip 
                          label={FIELD_TYPES.find(t => t.value === field.field_type)?.label || field.field_type}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={field.default_enabled}
                          onChange={(e) => handleToggleFieldDefault(field, 'default_enabled', e.target.checked)}
                          disabled={field.is_archived}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={field.default_required}
                          onChange={(e) => handleToggleFieldDefault(field, 'default_required', e.target.checked)}
                          disabled={field.is_archived || !field.default_enabled}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {field.is_builtin ? (
                          <Chip label="Built-in" size="small" color="info" />
                        ) : field.is_archived ? (
                          <Chip label="Archived" size="small" color="default" />
                        ) : (
                          <Chip label="Custom" size="small" color="success" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Edit">
                          <IconButton 
                            size="small" 
                            onClick={() => handleOpenFieldDialog(field)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {!field.is_builtin && (
                          <Tooltip title={field.is_archived ? "Restore" : "Archive"}>
                            <IconButton 
                              size="small" 
                              onClick={() => handleArchiveField(field)}
                              color={field.is_archived ? "success" : "warning"}
                            >
                              {field.is_archived ? <UnarchiveIcon /> : <ArchiveIcon />}
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* Frequencies Tab */}
        <TabPanel value={tabValue} index={2}>
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
        </TabPanel>

        {/* Security Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              <SecurityIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Security & Fail2Ban
            </Typography>
            <Button
              startIcon={securityLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
              onClick={fetchSecurityInfo}
              disabled={securityLoading}
            >
              Refresh
            </Button>
          </Box>

          {securityLoading && !securityInfo ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : securityInfo ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Fail2Ban Status Card */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <ShieldIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Fail2Ban Status
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                    <Chip
                      icon={securityInfo.fail2ban.installed ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={securityInfo.fail2ban.installed ? 'Installed' : 'Not Installed'}
                      color={securityInfo.fail2ban.installed ? 'success' : 'error'}
                    />
                    <Chip
                      icon={securityInfo.fail2ban.running ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={securityInfo.fail2ban.running ? 'Running' : 'Not Running'}
                      color={securityInfo.fail2ban.running ? 'success' : 'error'}
                    />
                    <Chip
                      icon={securityInfo.fail2ban.jail_enabled ? <CheckCircleIcon /> : <WarningIcon />}
                      label={securityInfo.fail2ban.jail_enabled ? 'ECTLogger Jail Active' : 'Jail Not Active'}
                      color={securityInfo.fail2ban.jail_enabled ? 'success' : 'warning'}
                    />
                    <Chip
                      icon={securityInfo.fail2ban.log_file_configured ? <CheckCircleIcon /> : <WarningIcon />}
                      label={securityInfo.fail2ban.log_file_configured ? 'Logging Enabled' : 'Logging Not Configured'}
                      color={securityInfo.fail2ban.log_file_configured ? 'success' : 'warning'}
                    />
                  </Box>

                  {!securityInfo.fail2ban.installed && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Fail2Ban is not installed. See FAIL2BAN.md for installation instructions.
                    </Alert>
                  )}

                  {securityInfo.fail2ban.installed && !securityInfo.fail2ban.jail_enabled && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Fail2Ban is installed but the ECTLogger jail is not active. Check /etc/fail2ban/jail.d/ectlogger.conf
                    </Alert>
                  )}

                  {securityInfo.fail2ban.jail_enabled && (
                    <>
                      <Box sx={{ display: 'flex', gap: 4, mt: 2, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography variant="h4" color="error.main">
                            {securityInfo.fail2ban.currently_banned}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Currently Banned
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="h4" color="text.secondary">
                            {securityInfo.fail2ban.total_banned}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Total Banned (All Time)
                          </Typography>
                        </Box>
                      </Box>
                      <Alert severity="info" sx={{ mt: 2 }}>
                        <strong>Ban Settings:</strong> After {securityInfo.fail2ban.max_retries} failed login attempts within {Math.round(securityInfo.fail2ban.find_time / 60)} minutes, the IP is banned for {Math.round(securityInfo.fail2ban.ban_time / 60)} minutes.
                        {' '}Settings can be adjusted in <code>/etc/fail2ban/jail.d/ectlogger.conf</code>
                      </Alert>
                    </>
                  )}

                  {securityInfo.fail2ban.log_file_path && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      Log file: <code>{securityInfo.fail2ban.log_file_path}</code>
                    </Typography>
                  )}
                </CardContent>
              </Card>

              {/* Banned IPs - always show when jail is enabled */}
              {securityInfo.fail2ban.jail_enabled && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <BlockIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                      Currently Banned IPs
                    </Typography>
                    {securityInfo.fail2ban.banned_ips.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No IPs are currently banned. IPs are automatically unbanned after {Math.round(securityInfo.fail2ban.ban_time / 60)} minutes.
                      </Typography>
                    ) : (
                      <>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                          These IPs are blocked from accessing ECTLogger. They will be automatically unbanned after the ban period expires,
                          or you can manually unban them using the button below.
                        </Alert>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>IP Address</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Actions</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {securityInfo.fail2ban.banned_ips.map((ip) => (
                                <TableRow key={ip}>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                      {ip}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip size="small" label="Banned" color="error" icon={<BlockIcon />} />
                                  </TableCell>
                                  <TableCell align="right">
                                    <Tooltip title="Unban this IP - allows immediate access">
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="success"
                                        startIcon={<LockOpenIcon />}
                                        onClick={() => handleUnbanIp(ip)}
                                      >
                                        Unban
                                      </Button>
                                    </Tooltip>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                          To unban via command line: <code>sudo fail2ban-client set ectlogger unbanip IP_ADDRESS</code>
                        </Typography>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Recent Security Events */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <HistoryIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Recent Authentication Events
                  </Typography>
                  {securityInfo.recent_auth_events.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No recent authentication events found.
                    </Typography>
                  ) : (
                    <TableContainer sx={{ maxHeight: 400 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Time</TableCell>
                            <TableCell>Level</TableCell>
                            <TableCell>Message</TableCell>
                            <TableCell>IP</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {securityInfo.recent_auth_events.map((event, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                  {event.timestamp}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={event.level}
                                  color={
                                    event.level === 'ERROR' ? 'error' :
                                    event.level === 'WARNING' ? 'warning' :
                                    event.level === 'INFO' ? 'info' : 'default'
                                  }
                                  icon={
                                    event.level === 'ERROR' ? <ErrorIcon /> :
                                    event.level === 'WARNING' ? <WarningIcon /> :
                                    <InfoIcon />
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                  {event.message}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {event.ip && (
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    {event.ip}
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>

              {/* Schedule Creation Limits Card */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <ShieldIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Schedule Creation Limits
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Configure requirements for non-admin users to create schedules. Admins bypass all restrictions.
                  </Typography>
                  
                  {scheduleSettingsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <TextField
                        label="Minimum Account Age (days)"
                        type="number"
                        value={scheduleSettings.schedule_min_account_age_days}
                        onChange={(e) => setScheduleSettings({
                          ...scheduleSettings,
                          schedule_min_account_age_days: parseInt(e.target.value) || 0
                        })}
                        inputProps={{ min: 0, max: 365 }}
                        helperText="New accounts must wait this many days before creating schedules. Set to 0 to disable."
                        fullWidth
                      />
                      <TextField
                        label="Minimum Net Participations"
                        type="number"
                        value={scheduleSettings.schedule_min_net_participations}
                        onChange={(e) => setScheduleSettings({
                          ...scheduleSettings,
                          schedule_min_net_participations: parseInt(e.target.value) || 0
                        })}
                        inputProps={{ min: 0, max: 100 }}
                        helperText="Users must have checked in to this many nets before creating schedules. Set to 0 to disable."
                        fullWidth
                      />
                      <TextField
                        label="Maximum Schedules Per Day"
                        type="number"
                        value={scheduleSettings.schedule_max_per_day}
                        onChange={(e) => setScheduleSettings({
                          ...scheduleSettings,
                          schedule_max_per_day: parseInt(e.target.value) || 0
                        })}
                        inputProps={{ min: 0, max: 100 }}
                        helperText="Maximum schedules a user can create in one day. Set to 0 for unlimited."
                        fullWidth
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          variant="contained"
                          onClick={handleSaveScheduleSettings}
                          disabled={scheduleSettingsSaving}
                          startIcon={scheduleSettingsSaving ? <CircularProgress size={20} /> : null}
                        >
                          {scheduleSettingsSaving ? 'Saving...' : 'Save Settings'}
                        </Button>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Alert severity="error">
              Failed to load security information. Make sure you have admin access.
            </Alert>
          )}
        </TabPanel>
      </Paper>

      {/* Role Change Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)}>
        <DialogTitle>Change User Role</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, minWidth: 300 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Changing role for: {selectedUser?.callsign || selectedUser?.name || selectedUser?.email}
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={newRole}
                label="Role"
                onChange={(e) => setNewRole(e.target.value)}
              >
                <MenuItem value="guest">Guest</MenuItem>
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="ncs">NCS</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateRole} variant="contained">
            Update Role
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onClose={() => setAddUserDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              value={addUserForm.email}
              onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
              required
              fullWidth
              helperText="User will log in via magic link sent to this email"
            />
            <TextField
              label="Name"
              value={addUserForm.name}
              onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })}
              fullWidth
              helperText="Optional - user can set this in their profile"
            />
            <TextField
              label="Callsign"
              value={addUserForm.callsign}
              onChange={(e) => setAddUserForm({ ...addUserForm, callsign: e.target.value.toUpperCase() })}
              fullWidth
              inputProps={{ style: { textTransform: 'uppercase' } }}
              helperText="Optional - user can set this in their profile"
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={addUserForm.role}
                label="Role"
                onChange={(e) => setAddUserForm({ ...addUserForm, role: e.target.value })}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
              <FormHelperText>User's permission level</FormHelperText>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddUserDialogOpen(false)} disabled={addUserSaving}>Cancel</Button>
          <Button 
            onClick={handleAddUser} 
            variant="contained" 
            disabled={!addUserForm.email || addUserSaving}
          >
            {addUserSaving ? <CircularProgress size={24} /> : 'Add User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Field Edit/Create Dialog */}
      <Dialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingField ? 'Edit Field' : 'Add New Field'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Internal Name"
              value={fieldForm.name}
              onChange={(e) => setFieldForm({ ...fieldForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              disabled={!!editingField}
              required
              helperText="Lowercase letters, numbers, and underscores only. Cannot be changed after creation."
              fullWidth
            />
            <TextField
              label="Display Label"
              value={fieldForm.label}
              onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
              required
              helperText="The label shown to users"
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Field Type</InputLabel>
              <Select
                value={fieldForm.field_type}
                label="Field Type"
                onChange={(e) => setFieldForm({ ...fieldForm, field_type: e.target.value })}
                disabled={editingField?.is_builtin}
              >
                {FIELD_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
                ))}
              </Select>
              <FormHelperText>The type of input control</FormHelperText>
            </FormControl>
            {fieldForm.field_type === 'select' && (
              <TextField
                label="Dropdown Options"
                value={fieldForm.options.join('\n')}
                onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value.split('\n') })}
                multiline
                rows={4}
                helperText="Enter each option on a new line"
                fullWidth
              />
            )}
            <TextField
              label="Placeholder Text"
              value={fieldForm.placeholder}
              onChange={(e) => setFieldForm({ ...fieldForm, placeholder: e.target.value })}
              helperText="Optional hint text shown in empty fields"
              fullWidth
            />
            <TextField
              label="Sort Order"
              type="number"
              value={fieldForm.sort_order}
              onChange={(e) => setFieldForm({ ...fieldForm, sort_order: parseInt(e.target.value) || 100 })}
              helperText="Lower numbers appear first (built-in fields use 10-70)"
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={fieldForm.default_enabled}
                  onChange={(e) => setFieldForm({ ...fieldForm, default_enabled: e.target.checked })}
                />
                <Typography variant="body2">Enabled by default</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={fieldForm.default_required}
                  onChange={(e) => setFieldForm({ ...fieldForm, default_required: e.target.checked })}
                  disabled={!fieldForm.default_enabled}
                />
                <Typography variant="body2">Required by default</Typography>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveField} 
            variant="contained"
            disabled={fieldSaving || !fieldForm.name || !fieldForm.label}
            startIcon={fieldSaving ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {editingField ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Frequency Dialog */}
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

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />

      {/* Floating Action Buttons */}
      {tabValue === 0 && (
        <Tooltip title="Add user">
          <Fab
            color="primary"
            aria-label="add user"
            sx={{ position: 'fixed', bottom: 16, right: 16 }}
            onClick={handleOpenAddUserDialog}
          >
            <PersonAddIcon />
          </Fab>
        </Tooltip>
      )}
      {tabValue === 1 && (
        <Tooltip title="Add field">
          <Fab
            color="primary"
            aria-label="add field"
            sx={{ position: 'fixed', bottom: 16, right: 16 }}
            onClick={() => handleOpenFieldDialog()}
          >
            <AddIcon />
          </Fab>
        </Tooltip>
      )}
      {tabValue === 2 && (
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
      )}
    </Container>
  );
};

export default Admin;

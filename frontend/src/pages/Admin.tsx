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
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface User {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface FieldConfigItem {
  enabled: boolean;
  required: boolean;
  label?: string;
}

interface AppSettings {
  default_field_config: Record<string, FieldConfigItem>;
  field_labels: Record<string, string>;
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
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const FIELD_ORDER = ['name', 'location', 'skywarn_number', 'weather_observation', 'power_source', 'feedback', 'notes'];

const DEFAULT_LABELS: Record<string, string> = {
  name: 'Name',
  location: 'Location',
  skywarn_number: 'Spotter #',
  weather_observation: 'Weather',
  power_source: 'Power Source',
  feedback: 'Feedback',
  notes: 'Notes',
};

const Admin: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
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
    fetchSettings();
  }, [currentUser, navigate]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users/');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await api.get('/settings/');
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      // Initialize with defaults if settings don't exist
      setSettings({
        default_field_config: FIELD_ORDER.reduce((acc, field) => ({
          ...acc,
          [field]: { enabled: ['name', 'location'].includes(field), required: false, label: DEFAULT_LABELS[field] }
        }), {}),
        field_labels: DEFAULT_LABELS,
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      await api.put('/settings/', settings);
      setSnackbar({ open: true, message: 'Settings saved successfully', severity: 'success' });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSnackbar({ open: true, message: 'Failed to save settings', severity: 'error' });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleFieldConfigChange = (field: string, key: keyof FieldConfigItem, value: boolean | string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      default_field_config: {
        ...settings.default_field_config,
        [field]: {
          ...settings.default_field_config[field],
          [key]: value,
        },
      },
    });
  };

  const handleLabelChange = (field: string, label: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      field_labels: {
        ...settings.field_labels,
        [field]: label,
      },
      default_field_config: {
        ...settings.default_field_config,
        [field]: {
          ...settings.default_field_config[field],
          label: label,
        },
      },
    });
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" component="h1">
            Admin
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/dashboard')}>
            Back to Nets
          </Button>
        </Box>

        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Users" id="admin-tab-0" aria-controls="admin-tabpanel-0" />
          <Tab label="Field Configuration" id="admin-tab-1" aria-controls="admin-tabpanel-1" />
        </Tabs>

        {/* Users Tab */}
        <TabPanel value={tabValue} index={0}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Manage user accounts, change roles, and ban/unban users.
          </Alert>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Callsign</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
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
            Configure default check-in fields for new nets. Field labels are used throughout the application.
          </Alert>

          {settingsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : settings && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Field</TableCell>
                      <TableCell>Label</TableCell>
                      <TableCell align="center">Enabled by Default</TableCell>
                      <TableCell align="center">Required by Default</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {FIELD_ORDER.map((field) => {
                      const config = settings.default_field_config[field] || { enabled: false, required: false };
                      const label = settings.field_labels[field] || DEFAULT_LABELS[field];
                      return (
                        <TableRow key={field}>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                              {field}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              value={label}
                              onChange={(e) => handleLabelChange(field, e.target.value)}
                              sx={{ width: 200 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Switch
                              checked={config.enabled}
                              onChange={(e) => handleFieldConfigChange(field, 'enabled', e.target.checked)}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Switch
                              checked={config.required}
                              onChange={(e) => handleFieldConfigChange(field, 'required', e.target.checked)}
                              disabled={!config.enabled}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  startIcon={settingsSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                  onClick={handleSaveSettings}
                  disabled={settingsSaving}
                >
                  Save Settings
                </Button>
              </Box>
            </>
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

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Container>
  );
};

export default Admin;

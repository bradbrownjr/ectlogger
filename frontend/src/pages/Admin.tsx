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
  Tooltip,
  FormHelperText,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
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
  }, [currentUser, navigate]);

  useEffect(() => {
    fetchFields();
  }, [showArchived]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users/');
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
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          Admin
        </Typography>

        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Users" id="admin-tab-0" aria-controls="admin-tabpanel-0" />
          <Tab label="Check-in Fields" id="admin-tab-1" aria-controls="admin-tabpanel-1" />
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
            Configure check-in fields available when creating nets. Custom fields can be added and archived (but not deleted to preserve historical data).
          </Alert>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                Show archived fields
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenFieldDialog()}
            >
              Add Field
            </Button>
          </Box>

          {fieldsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="center">Default Enabled</TableCell>
                    <TableCell align="center">Default Required</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((field) => (
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

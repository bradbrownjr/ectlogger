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
  FormHelperText,
  Switch,
  Tooltip,
  Fab,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import useSortableTable from '../../hooks/useSortableTable';
import api from '../../services/api';

const FIELD_TYPES = [
  { value: 'text', label: 'Text (single line)' },
  { value: 'textarea', label: 'Text Area (multi-line)' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown Select' },
];

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

type FieldSortField = 'name' | 'label' | 'type' | 'default_enabled' | 'default_required' | 'status';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AdminFieldsTab: React.FC<Props> = ({ showSnackbar }) => {
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
  const [fieldFilter, setFieldFilter] = useState('');

  const { sortField: fieldSortField, sortDirection: fieldSortDirection, handleSort: handleFieldSort } =
    useSortableTable<FieldSortField>('name');

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

  useEffect(() => {
    fetchFields();
  }, [showArchived]);

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
        aVal = a.is_archived ? 0 : a.is_builtin ? 2 : 1;
        bVal = b.is_archived ? 0 : b.is_builtin ? 2 : 1;
        break;
    }

    if (fieldSortField === 'default_enabled' || fieldSortField === 'default_required' || fieldSortField === 'status') {
      return fieldSortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }

    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return fieldSortDirection === 'asc' ? comparison : -comparison;
  });

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
        await api.put(`/settings/fields/${editingField.id}`, payload);
        showSnackbar('Field updated successfully', 'success');
      } else {
        await api.post('/settings/fields', { ...payload, name: fieldForm.name });
        showSnackbar('Field created successfully', 'success');
      }
      setFieldDialogOpen(false);
      fetchFields();
    } catch (error: any) {
      console.error('Failed to save field:', error);
      const message = error.response?.data?.detail || 'Failed to save field';
      showSnackbar(message, 'error');
    } finally {
      setFieldSaving(false);
    }
  };

  const handleArchiveField = async (field: FieldDefinition) => {
    if (field.is_builtin) {
      showSnackbar('Built-in fields cannot be archived', 'error');
      return;
    }

    try {
      await api.put(`/settings/fields/${field.id}`, { is_archived: !field.is_archived });
      showSnackbar(field.is_archived ? 'Field restored successfully' : 'Field archived successfully', 'success');
      fetchFields();
    } catch (error) {
      console.error('Failed to archive field:', error);
      showSnackbar('Failed to archive field', 'error');
    }
  };

  const handleToggleFieldDefault = async (field: FieldDefinition, key: 'default_enabled' | 'default_required', value: boolean) => {
    try {
      await api.put(`/settings/fields/${field.id}`, { [key]: value });
      fetchFields();
    } catch (error) {
      console.error('Failed to update field:', error);
      showSnackbar('Failed to update field', 'error');
    }
  };

  return (
    <>
      {/* ========== CHECK-IN FIELDS TAB ========== */}
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
                      <Tooltip title={field.is_archived ? 'Restore' : 'Archive'}>
                        <IconButton
                          size="small"
                          onClick={() => handleArchiveField(field)}
                          color={field.is_archived ? 'success' : 'warning'}
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

      {/* Add Field FAB */}
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
    </>
  );
};

export default AdminFieldsTab;

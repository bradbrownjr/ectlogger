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
  TextField,
  IconButton,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Switch,
  Tooltip,
  Alert,
  Stack,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== ADMIN TRAFFIC TAB ==========
// Admin management of Assisted Traffic Handling form definitions (radiogram,
// ICS-213, etc.) -- modeled closely on AdminFieldsTab.tsx per
// TRAFFIC-HANDLING-DESIGN.md D1's own note that this tab is a near-copy of
// that one. Unlike check-in fields, an admin can never add/remove/retype a
// field on a builtin definition here -- only enable/disable the whole
// definition, reorder it, and override a field's label/description. This UI
// is purely a front end for the existing admin-only PUT
// /traffic/definitions/{id} (backend/app/routers/traffic_definitions.py),
// which already rejects any attempt to touch a builtin's field set.

interface FormDefinitionField {
  id: number;
  name: string;
  label: string;
  field_type: string;
  description?: string | null;
}

interface FormDefinition {
  id: number;
  form_type: string;
  title: string;
  description?: string | null;
  version: string;
  output_format: string;
  is_builtin: boolean;
  is_enabled: boolean;
  sort_order: number;
  fields: FormDefinitionField[];
}

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AdminTrafficTab: React.FC<Props> = ({ showSnackbar }) => {
  const [definitions, setDefinitions] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<FormDefinition | null>(null);
  const [fieldOverrides, setFieldOverrides] = useState<Record<number, { label: string; description: string }>>({});
  const [saving, setSaving] = useState(false);

  const fetchDefinitions = async () => {
    setLoading(true);
    try {
      const response = await trafficApi.listDefinitions(true);
      const sorted = [...response.data].sort(
        (a: FormDefinition, b: FormDefinition) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)
      );
      setDefinitions(sorted);
    } catch (error) {
      console.error('Failed to fetch traffic form definitions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDefinitions();
  }, []);

  const handleToggleEnabled = async (definition: FormDefinition, is_enabled: boolean) => {
    try {
      await trafficApi.updateDefinition(definition.id, { is_enabled });
      showSnackbar(is_enabled ? 'Form enabled' : 'Form disabled', 'success');
      fetchDefinitions();
    } catch (error) {
      console.error('Failed to update form definition:', error);
      showSnackbar(getErrorMessage(error, 'Failed to update form'), 'error');
    }
  };

  const handleSortOrderBlur = async (definition: FormDefinition, value: string) => {
    const sort_order = parseInt(value, 10);
    if (Number.isNaN(sort_order) || sort_order === definition.sort_order) return;
    try {
      await trafficApi.updateDefinition(definition.id, { sort_order });
      fetchDefinitions();
    } catch (error) {
      console.error('Failed to reorder form definition:', error);
      showSnackbar(getErrorMessage(error, 'Failed to reorder form'), 'error');
    }
  };

  const handleOpenFieldDialog = (definition: FormDefinition) => {
    setEditingDefinition(definition);
    const overrides: Record<number, { label: string; description: string }> = {};
    definition.fields.forEach((f) => {
      overrides[f.id] = { label: f.label, description: f.description || '' };
    });
    setFieldOverrides(overrides);
    setFieldDialogOpen(true);
  };

  const handleSaveFieldOverrides = async () => {
    if (!editingDefinition) return;
    setSaving(true);
    try {
      const field_overrides = editingDefinition.fields.map((f) => ({
        id: f.id,
        label: fieldOverrides[f.id]?.label || f.label,
        description: fieldOverrides[f.id]?.description ?? null,
      }));
      await trafficApi.updateDefinition(editingDefinition.id, { field_overrides });
      showSnackbar('Field labels updated', 'success');
      setFieldDialogOpen(false);
      fetchDefinitions();
    } catch (error) {
      console.error('Failed to save field overrides:', error);
      showSnackbar(getErrorMessage(error, 'Failed to save field labels'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Alert severity="info" sx={{ mb: 3 }}>
        Manage which Assisted Traffic Handling forms (radiogram, ICS-213, etc.) are available,
        the order they appear in the type picker, and the label or help text shown for each
        field. Built-in forms follow the ARRL/NTS format exactly, so their field set cannot be
        changed here -- only enabled/disabled, reordered, and re-labeled.
      </Alert>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Form Type</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Format</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Enabled</TableCell>
                <TableCell>Sort Order</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {definitions.map((definition) => (
                <TableRow
                  key={definition.id}
                  sx={{
                    opacity: definition.is_enabled ? 1 : 0.6,
                    backgroundColor: definition.is_enabled ? 'inherit' : 'action.hover',
                  }}
                >
                  <TableCell>{definition.title}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {definition.form_type}
                    </Typography>
                  </TableCell>
                  <TableCell>{definition.version}</TableCell>
                  <TableCell>
                    <Chip label={definition.output_format} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {definition.is_builtin ? (
                      <Chip label="Built-in" size="small" color="info" />
                    ) : (
                      <Chip label="Custom" size="small" color="success" />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={definition.is_enabled}
                      onChange={(e) => handleToggleEnabled(definition, e.target.checked)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      defaultValue={definition.sort_order}
                      onBlur={(e) => handleSortOrderBlur(definition, e.target.value)}
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit field labels">
                      <IconButton size="small" onClick={() => handleOpenFieldDialog(definition)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Field Label/Description Override Dialog */}
      <Dialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingDefinition?.title} &mdash; Field Labels
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Only the display label and help text can be changed. The underlying field name and
            type are fixed so the ARRL/NTS format is never broken.
          </Alert>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {editingDefinition?.fields.map((field) => (
              <Box key={field.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {field.name}
                </Typography>
                <TextField
                  label="Label"
                  size="small"
                  value={fieldOverrides[field.id]?.label ?? field.label}
                  onChange={(e) =>
                    setFieldOverrides((prev) => ({
                      ...prev,
                      [field.id]: { ...prev[field.id], label: e.target.value },
                    }))
                  }
                  fullWidth
                />
                <TextField
                  label="Description / help text"
                  size="small"
                  value={fieldOverrides[field.id]?.description ?? ''}
                  onChange={(e) =>
                    setFieldOverrides((prev) => ({
                      ...prev,
                      [field.id]: { ...prev[field.id], description: e.target.value },
                    }))
                  }
                  multiline
                  rows={2}
                  fullWidth
                />
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveFieldOverrides}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : null}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AdminTrafficTab;

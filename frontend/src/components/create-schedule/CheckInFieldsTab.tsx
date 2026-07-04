import React from 'react';
import {
  Typography,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useCreateScheduleContext, FieldDefinition, FieldConfigEntry } from '../../contexts/CreateScheduleContext';

// ========== TAB 6: CHECK-IN FIELDS ==========
// Enable/require custom check-in fields; locked rows for poll and topic-of-week

const CheckInFieldsTab: React.FC = () => {
  const {
    fieldDefinitions,
    fieldConfig, setFieldConfig,
    pollEnabled,
    topicOfWeekEnabled,
    showToast,
  } = useCreateScheduleContext();

  const handleFieldToggle = (fieldName: string, property: 'enabled' | 'required') => {
    setFieldConfig((prev: Record<string, FieldConfigEntry>) => {
      const current = prev[fieldName] || { enabled: false, required: false };
      return {
        ...prev,
        [fieldName]: {
          ...current,
          [property]: !current[property],
          // Disabling a field also clears required
          ...(property === 'enabled' && current.enabled ? { required: false } : {}),
        },
      };
    });
  };

  return (
    <>
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
            {fieldDefinitions.map((field: FieldDefinition) => {
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

            {/* Poll Response row — locked; shown when poll feature is enabled */}
            {pollEnabled && (
              <TableRow>
                <TableCell>
                  <Typography>Poll Response</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Responses to the poll question configured on the first tab
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Checkbox
                    checked={true}
                    disabled={true}
                    onClick={() => showToast('Poll Response is automatically enabled when Poll feature is turned on')}
                  />
                </TableCell>
                <TableCell align="center">
                  <Checkbox checked={false} disabled={true} />
                </TableCell>
              </TableRow>
            )}

            {/* Topic of the Week Response row — locked; shown when topic feature is enabled */}
            {topicOfWeekEnabled && (
              <TableRow>
                <TableCell>
                  <Typography>Topic of the Week Response</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Responses to the topic of the week configured on the first tab
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Checkbox
                    checked={true}
                    disabled={true}
                    onClick={() => showToast('Topic of the Week Response is automatically enabled when the feature is turned on')}
                  />
                </TableCell>
                <TableCell align="center">
                  <Checkbox checked={false} disabled={true} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default CheckInFieldsTab;

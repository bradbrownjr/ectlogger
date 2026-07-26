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

// ========== SHARED CHECK-IN FIELDS PANEL ==========
// Enable/require custom check-in fields; locked rows for poll and topic-of-week
// Used by both CreateSchedule (CheckInFieldsTab) and CreateNet (Check-In Fields tab)

export interface FieldDefinitionItem {
  id: number;
  name: string;
  label: string;
  field_type: string;
  default_enabled: boolean;
  default_required: boolean;
  is_builtin: boolean;
  is_archived: boolean;
  sort_order: number;
}

export type FieldConfigEntry = { enabled: boolean; required: boolean };

interface CheckInFieldsPanelProps {
  fieldDefinitions: FieldDefinitionItem[];
  fieldConfig: Record<string, FieldConfigEntry>;
  setFieldConfig: React.Dispatch<React.SetStateAction<Record<string, FieldConfigEntry>>>;
  pollEnabled: boolean;
  topicOfWeekEnabled: boolean;
  showToast: (message: string) => void;
}

const CheckInFieldsPanel: React.FC<CheckInFieldsPanelProps> = ({
  fieldDefinitions,
  fieldConfig,
  setFieldConfig,
  pollEnabled,
  topicOfWeekEnabled,
  showToast,
}) => {
  const handleFieldToggle = (fieldName: string, property: 'enabled' | 'required') => {
    setFieldConfig((prev: Record<string, FieldConfigEntry>) => {
      const current = prev[fieldName] || { enabled: false, required: false };
      return {
        ...prev,
        [fieldName]: {
          ...current,
          [property]: !current[property],
          ...(property === 'enabled' && current.enabled ? { required: false } : {}),
        },
      };
    });
  };

  return (
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
          {fieldDefinitions.map((field: FieldDefinitionItem) => {
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
                  checked={true} disabled={true}
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
                  checked={true} disabled={true}
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
  );
};

export default CheckInFieldsPanel;

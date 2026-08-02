import React from 'react';
import { Box, Grid, MenuItem, TextField, Tooltip, IconButton } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { FormDefinition, FormDefinitionField } from '../../hooks/useFormDefinitions';

// ========== FormRenderer ==========
// Generic form renderer driven entirely by FormDefinition.fields (text /
// textarea / choice / yesno, required, max length, validator hint, help
// text). A new definition needs zero React changes to render — see
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 4.3.

interface FormRendererProps {
  definition: FormDefinition;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

const YES_NO_CHOICES = ['Yes', 'No'];

const FormRenderer: React.FC<FormRendererProps> = ({ definition, values, onChange, errors, disabled }) => {
  const renderField = (field: FormDefinitionField) => {
    const value = values[field.name] ?? '';
    const error = errors?.[field.name];
    const common = {
      key: field.name,
      fullWidth: true,
      required: field.is_required,
      label: field.label,
      value,
      disabled,
      error: Boolean(error),
      helperText: error || field.description || undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(field.name, e.target.value),
      inputProps: field.max_length ? { maxLength: field.max_length } : undefined,
    };

    let control: React.ReactNode;
    if (field.field_type === 'textarea') {
      control = <TextField {...common} multiline rows={4} />;
    } else if (field.field_type === 'choice') {
      control = (
        <TextField {...common} select>
          {(field.choices ?? []).map((choice) => (
            <MenuItem key={choice} value={choice}>{choice}</MenuItem>
          ))}
        </TextField>
      );
    } else if (field.field_type === 'yesno') {
      control = (
        <TextField {...common} select>
          {YES_NO_CHOICES.map((choice) => (
            <MenuItem key={choice} value={choice}>{choice}</MenuItem>
          ))}
        </TextField>
      );
    } else {
      control = <TextField {...common} />;
    }

    return (
      <Grid item xs={12} sm={field.field_type === 'textarea' ? 12 : 6} key={field.name}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Box sx={{ flexGrow: 1 }}>{control}</Box>
          {field.help_text && (
            <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{field.help_text}</Box>}>
              <IconButton size="small" sx={{ mt: 1, minWidth: 44, minHeight: 44 }} aria-label={`Help for ${field.label}`}>
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Grid>
    );
  };

  return (
    <Grid container spacing={2}>
      {definition.fields.map(renderField)}
    </Grid>
  );
};

export default FormRenderer;

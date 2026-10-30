import React from 'react';
import { Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, TextField } from '@mui/material';

// ========== CUSTOM CHECK-IN FIELD INPUT ==========
// One admin-defined check-in field (Admin > Check-in Fields), labeled, for the
// stacked check-in forms: the phone entry form and the Check in / Edit your
// check-in dialog. A checkbox always carries its label beside it; an
// unlabeled box is what left a net's FLDIGI field ticked by nobody
// (Ken N1KWG, 2026-10-29). Values are strings, a checkbox's 'true'/'false',
// as stored in CheckIn.custom_fields.

export interface CustomFieldDefinition {
  name: string;
  label: string;
  field_type: string;
  options?: string[];
  placeholder?: string;
}

interface CustomFieldInputProps {
  field: CustomFieldDefinition;
  value: string | undefined;
  required?: boolean;
  onChange: (value: string) => void;
  // 'small' on the phone entry form, where every box is small; 'medium' in
  // the dialog, to match its other boxes.
  size?: 'small' | 'medium';
}

const CustomFieldInput: React.FC<CustomFieldInputProps> = ({ field, value, required, onChange, size = 'small' }) => {
  const label = `${field.label}${required ? ' *' : ''}`;

  if (field.field_type === 'select' && field.options) {
    return (
      <FormControl size={size} fullWidth>
        <InputLabel>{label}</InputLabel>
        <Select value={value || ''} label={label} onChange={(e) => onChange(e.target.value as string)}>
          <MenuItem value="">
            <em>Select {field.label}</em>
          </MenuItem>
          {field.options.map((option) => (
            <MenuItem key={option} value={option}>{option}</MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  if (field.field_type === 'checkbox') {
    return (
      <FormControlLabel
        control={<Checkbox checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} />}
        label={label}
      />
    );
  }

  return (
    <TextField
      size={size}
      label={field.label}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      fullWidth
      required={required}
      type={field.field_type === 'number' ? 'number' : 'text'}
      multiline={field.field_type === 'textarea'}
      rows={field.field_type === 'textarea' ? 2 : 1}
    />
  );
};

export default CustomFieldInput;

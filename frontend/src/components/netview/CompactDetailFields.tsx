import React from 'react';
import { Box, TextField } from '@mui/material';
import CustomFieldInput, { type CustomFieldDefinition } from './CustomFieldInput';
import { MULTILINE_FIELDS, shownDetailFields } from '../../utils/checkInFields';

// ========== COMPACT ENTRY ROW: SPOTTER # THROUGH CUSTOM FIELDS ==========
// The one-line check-in entry under the floating check-in list (NetView) and
// the popped-out list (NetPaneWindow). Both carried their own copy of these
// boxes, with only Spotter # and Notes, so net control there had no box for
// Weather, Power, Feedback or the net's own fields such as FLDIGI
// (2026-10-29). Fields come from utils/checkInFields.ts like every other form.

interface CompactDetailFieldsProps {
  fieldConfig: any;
  customFields: CustomFieldDefinition[];
  form: Record<string, any> & { custom_fields: Record<string, string> };
  setForm: (form: any) => void;
  labelOf: (name: string) => string;
}

const CompactDetailFields: React.FC<CompactDetailFieldsProps> = ({ fieldConfig, customFields, form, setForm, labelOf }) => (
  <>
    {shownDetailFields(fieldConfig).map((field) => (
      <TextField
        key={field}
        size="small"
        value={form[field] || ''}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        placeholder={labelOf(field)}
        // Longer answers take the row's spare width; short ones stay narrow.
        sx={MULTILINE_FIELDS.has(field) ? { flex: 1, minWidth: 150 } : { width: 100 }}
      />
    ))}
    {customFields.map((field) => (
      <Box key={field.name} sx={field.field_type === 'checkbox' ? undefined : { width: 130 }}>
        <CustomFieldInput
          field={field}
          value={form.custom_fields[field.name]}
          required={!!fieldConfig?.[field.name]?.required}
          onChange={(value) => setForm({ ...form, custom_fields: { ...form.custom_fields, [field.name]: value } })}
        />
      </Box>
    ))}
  </>
);

export default CompactDetailFields;

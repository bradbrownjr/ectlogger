import React from 'react';
import { Box, FormControl, FormHelperText, InputLabel, MenuItem, Select, SelectChangeEvent, TextField, Typography } from '@mui/material';

// ========== HxCodeField ==========
// ARRL/NTS handling instructions are a fixed set of seven codes -- there is
// no valid answer outside HXA-HXG, so this is a dropdown, never free text
// (see docs/DESIGN.md "Form fields with a fixed set of valid answers").
// Three codes (HXA/HXB/HXF) carry a numeric parameter; the rest don't.

interface HxCode {
  code: string;
  label: string;
  description: string;
  hasParam: boolean;
  paramLabel: string;
}

const HX_CODES: HxCode[] = [
  { code: 'HXA', label: 'HXA — Collect delivery authorized', description: 'Collect delivery authorized within n miles', hasParam: true, paramLabel: 'n miles' },
  { code: 'HXB', label: 'HXB — Cancel if not delivered in time', description: 'Cancel if not delivered within n hours; notify origin', hasParam: true, paramLabel: 'n hours' },
  { code: 'HXC', label: 'HXC — Report delivery date/time', description: 'Report delivery date/time to originating station', hasParam: false, paramLabel: '' },
  { code: 'HXD', label: 'HXD — Report relay and delivery chain', description: 'Report relay and delivery chain to originating station', hasParam: false, paramLabel: '' },
  { code: 'HXE', label: 'HXE — Get reply from addressee', description: 'Get reply from addressee; originate reply message back', hasParam: false, paramLabel: '' },
  { code: 'HXF', label: 'HXF — Hold delivery until date', description: 'Hold delivery until date n', hasParam: true, paramLabel: 'date n' },
  { code: 'HXG', label: 'HXG — No toll delivery', description: 'No toll delivery; cancel and notify origin if cost required', hasParam: false, paramLabel: '' },
];

// Canonical stored form is bare "HXB48" (see models.py's Form.handling
// comment) -- the reminder service's parser also accepts "HXB(48)"/"HXB 48",
// but this control only ever writes the bare form.
function parseValue(value: string): { code: string; param: string } {
  const match = /^(HX[A-G])(\d*)$/i.exec((value ?? '').trim());
  if (!match) return { code: '', param: '' };
  return { code: match[1].toUpperCase(), param: match[2] || '' };
}

interface HxCodeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

const HxCodeField: React.FC<HxCodeFieldProps> = ({ label, value, onChange, disabled, required, error }) => {
  const { code, param } = parseValue(value);
  const selected = HX_CODES.find((h) => h.code === code);

  const handleCodeChange = (e: SelectChangeEvent) => {
    const newCode = e.target.value;
    onChange(newCode || '');
  };

  const handleParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, '');
    onChange(code ? `${code}${digits}` : '');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <FormControl sx={{ minWidth: 240, flex: '1 1 240px' }} disabled={disabled} required={required} error={Boolean(error)}>
          <InputLabel id="hx-code-label">{label}</InputLabel>
          <Select labelId="hx-code-label" label={label} value={code} onChange={handleCodeChange} displayEmpty>
            <MenuItem value=""><em>None</em></MenuItem>
            {HX_CODES.map((h) => (
              <MenuItem key={h.code} value={h.code}>{h.label}</MenuItem>
            ))}
          </Select>
          {error && <FormHelperText>{error}</FormHelperText>}
        </FormControl>
        {selected?.hasParam && (
          <TextField
            label={selected.paramLabel}
            value={param}
            onChange={handleParamChange}
            disabled={disabled}
            sx={{ width: 140 }}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', 'aria-label': `${selected.code} parameter` }}
          />
        )}
      </Box>
      {selected && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {selected.description}
        </Typography>
      )}
    </Box>
  );
};

export default HxCodeField;

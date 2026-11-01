import React from 'react';
import { TextField, TextFieldProps } from '@mui/material';

// ========== TIME FROM A PAPER LOG ==========
// Shown on the check-in form only while net control finishes a closed net's
// log (utils/netLog.ts isLogHeld). The station is logged at the time typed
// here, in the viewer's own zone (UTC when they prefer it), or as "Not
// recorded" when it is left blank.
interface HeldLogTimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  preferUtc: boolean;
  onEnter?: () => void;
  textFieldProps?: Partial<TextFieldProps>;
}

const HeldLogTimeField: React.FC<HeldLogTimeFieldProps> = ({ value, onChange, preferUtc, onEnter, textFieldProps }) => (
  <TextField
    size="small"
    type="time"
    label={preferUtc ? 'Time (UTC)' : 'Time'}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter();
      }
    }}
    title="When the station was on the net. Leave blank if nobody wrote it down."
    InputLabelProps={{ shrink: true }}
    {...textFieldProps}
  />
);

export default HeldLogTimeField;

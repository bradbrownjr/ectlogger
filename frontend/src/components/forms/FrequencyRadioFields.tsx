import React, { useId, useMemo } from 'react';
import {
  Autocomplete, Box, FormControl, InputLabel, MenuItem, Select, TextField, createFilterOptions,
} from '@mui/material';
import { FrequencyRadioFields as RadioValues, ToneOption, radioFieldsFor, toneOptionsFor } from '../../utils/channelPlan';

// ========== REPEATER FIELDS OF A FREQUENCY ==========
// Offset, TX tone, RX tone and N/W, for every place a frequency is edited:
// the Communication Plan tab's add and edit rows (CommunicationPlanPanel)
// and Admin > Frequencies (AdminFrequenciesTab). Which fields show follows
// the mode (utils/channelPlan.ts::radioFieldsFor). Tones are picked from
// the standard lists, never typed (DESIGN.md "Fixed-answer fields").

export interface RadioDraft {
  offset: string;
  tx_tone: string;
  rx_tone: string;
  bandwidth: string;
}

export const EMPTY_RADIO_DRAFT: RadioDraft = { offset: '', tx_tone: '', rx_tone: '', bandwidth: '' };

export const radioDraftFrom = (f: RadioValues): RadioDraft => ({
  offset: f.offset || '',
  tx_tone: f.tx_tone || '',
  rx_tone: f.rx_tone || '',
  bandwidth: f.bandwidth || '',
});

// The NAC list has 4096 codes; show the first matches only
const filterTones = createFilterOptions<ToneOption>({ limit: 120, stringify: (o) => o.value });

interface ToneFieldProps {
  label: string;
  mode: string;
  value: string;
  onChange: (value: string) => void;
  size?: 'small' | 'medium';
}

const ToneField: React.FC<ToneFieldProps> = ({ label, mode, value, onChange, size }) => {
  const options = useMemo(() => {
    const list = toneOptionsFor(mode);
    // A tone saved before these lists existed still shows
    return value && !list.some((o) => o.value === value) ? [...list, { value, group: list[0].group }] : list;
  }, [mode, value]);
  const selected = value ? options.find((o) => o.value === value) ?? null : null;
  return (
    <Autocomplete
      size={size}
      options={options}
      value={selected}
      onChange={(_, option) => onChange(option?.value ?? '')}
      groupBy={(o) => o.group}
      getOptionLabel={(o) => o.value}
      isOptionEqualToValue={(o, v) => o.value === v.value}
      filterOptions={filterTones}
      renderInput={(params) => <TextField {...params} label={label} placeholder="None" />}
    />
  );
};

interface Props {
  mode: string;
  value: RadioDraft;
  onChange: (value: RadioDraft) => void;
  onKeyPress?: (e: React.KeyboardEvent) => void;
  size?: 'small' | 'medium';
}

const FrequencyRadioFieldsEditor: React.FC<Props> = ({ mode, value, onChange, onKeyPress, size = 'small' }) => {
  const fields = radioFieldsFor(mode);
  const idBase = useId();
  // A mode with none of these (a DMR talkgroup) shows nothing
  if (!fields.offset && !fields.tones && !fields.bandwidth) return null;
  return (
    // Two to a row on a phone, four on a wider screen
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1, alignItems: 'flex-start' }}>
      {/* Offset: dial frequencies only. A full row on a phone, so its label and hint are not cut off */}
      {fields.offset && (
        <TextField
          sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
          size={size}
          label="Offset (MHz)"
          placeholder="-0.600"
          value={value.offset}
          onChange={(e) => onChange({ ...value, offset: e.target.value })}
          onKeyPress={onKeyPress}
          helperText="With a + or - sign. Blank for simplex."
          inputProps={{ maxLength: 16, inputMode: 'decimal' }}
        />
      )}
      {/* Tones: analog modes (CTCSS, DCS) and P25 (NAC) */}
      {fields.tones && (
        <>
          <ToneField label="TX tone" mode={mode} size={size} value={value.tx_tone}
            onChange={(tx_tone) => onChange({ ...value, tx_tone })} />
          <ToneField label="RX tone" mode={mode} size={size} value={value.rx_tone}
            onChange={(rx_tone) => onChange({ ...value, rx_tone })} />
        </>
      )}
      {/* N/W: narrow or wide FM, dial frequencies only */}
      {fields.bandwidth && (
        <FormControl size={size}>
          <InputLabel id={`${idBase}-bandwidth-label`}>N/W</InputLabel>
          <Select
            labelId={`${idBase}-bandwidth-label`}
            label="N/W"
            value={value.bandwidth}
            onChange={(e) => onChange({ ...value, bandwidth: e.target.value })}
          >
            <MenuItem value=""><em>Not set</em></MenuItem>
            <MenuItem value="N">Narrow</MenuItem>
            <MenuItem value="W">Wide</MenuItem>
          </Select>
        </FormControl>
      )}
    </Box>
  );
};

export default FrequencyRadioFieldsEditor;

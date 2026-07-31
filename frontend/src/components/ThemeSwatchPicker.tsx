import React from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import { THEMES } from '../theme/themes';
import { useThemeMode } from '../contexts/ThemeContext';

interface ThemeSwatchPickerProps {
  // Currently selected theme key. Null selects "Follow system default" (only
  // meaningful when allowSystemDefault is set).
  value: string | null;
  onSelect: (key: string | null) => void;
  // Profile usage offers "Follow system default"; Admin's system-default
  // picker does not (there's nothing further up the hierarchy to follow).
  allowSystemDefault?: boolean;
}

const SwatchButton: React.FC<{
  selected: boolean;
  label: string;
  colors: [string, string] | null;
  onClick: () => void;
}> = ({ selected, label, colors, onClick }) => (
  <ButtonBase
    onClick={onClick}
    aria-pressed={selected}
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0.5,
      p: 1,
      minWidth: 76,
      minHeight: 44,
      borderRadius: 2,
      border: '2px solid',
      borderColor: selected ? 'primary.main' : 'divider',
    }}
  >
    <Box
      sx={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid rgba(128,128,128,0.3)',
        background: colors ? `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)` : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'text.secondary',
      }}
    >
      {!colors && <BrightnessAutoIcon fontSize="small" />}
      {selected && colors && <CheckIcon sx={{ fontSize: 18, color: '#fff', filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }} />}
    </Box>
    <Typography variant="caption" color="text.secondary" textAlign="center">
      {label}
    </Typography>
  </ButtonBase>
);

// Shared theme picker: Profile (personal preference, includes "Follow system
// default") and Admin (system default). Swatches preview each theme's colors
// for whichever light/dark mode is currently active.
const ThemeSwatchPicker: React.FC<ThemeSwatchPickerProps> = ({ value, onSelect, allowSystemDefault = false }) => {
  const muiTheme = useTheme();
  const mode = muiTheme.palette.mode;
  const { customTheme } = useThemeMode();

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
      {allowSystemDefault && (
        <SwatchButton
          selected={value === null}
          label="Follow system default"
          colors={null}
          onClick={() => onSelect(null)}
        />
      )}
      {Object.entries(THEMES).map(([key, definition]) => {
        const variant = definition[mode];
        return (
          <SwatchButton
            key={key}
            selected={value === key}
            label={definition.name}
            colors={[variant.primary, variant.secondary]}
            onClick={() => onSelect(key)}
          />
        );
      })}
      {customTheme && (
        <SwatchButton
          selected={value === 'custom'}
          label={customTheme.name}
          colors={[customTheme[mode].primary, customTheme[mode].secondary]}
          onClick={() => onSelect('custom')}
        />
      )}
    </Box>
  );
};

export default ThemeSwatchPicker;

import React from 'react';
import { Box, IconButton, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

// ========== ADMIN FILTER BAR ==========
// The filter box above an admin table, with the table's counts and controls
// (passed as children) beside it. The row wraps, and on a phone the box
// takes a full line of its own. Each tab used to carry its own copy of this
// row without wrapping, so on a phone the counts and "Updated" time
// squeezed the box down to the width of its search icon and there was
// nothing left to tap (reported on the Users tab, 2026-09-28).

interface AdminFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxWidth?: number;
  children?: React.ReactNode;
}

const AdminFilterBar: React.FC<AdminFilterBarProps> = ({ value, onChange, placeholder, maxWidth = 500, children }) => (
  <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ flex: { xs: '1 1 100%', sm: '1 1 240px' }, maxWidth: { sm: maxWidth } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon color="action" />
          </InputAdornment>
        ),
        endAdornment: value && (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => onChange('')} aria-label="Clear filter">
              <ClearIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
    {children}
  </Box>
);

export default AdminFilterBar;

import React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Grid,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { TrafficListFilters } from '../../hooks/useTrafficList';
import { FormDefinition } from '../../hooks/useFormDefinitions';

// ========== TrafficFilters ==========
// The filter bar feeding useTrafficList: free-text search plus form type,
// disposition, precedence, and the "mine" / "held by me" toggles. See
// DESIGN.md "Paginated and Searchable Lists" for the search bar convention.

interface TrafficFiltersProps {
  filters: TrafficListFilters;
  setFilters: React.Dispatch<React.SetStateAction<TrafficListFilters>>;
  definitions: FormDefinition[];
}

const DISPOSITIONS = ['draft', 'pending', 'relayed', 'delivered', 'cancelled'];

const TrafficFilters: React.FC<TrafficFiltersProps> = ({ filters, setFilters, definitions }) => {
  const update = (patch: Partial<TrafficListFilters>) => setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        size="small"
        fullWidth
        placeholder="Search traffic..."
        value={filters.q}
        onChange={(e) => update({ q: e.target.value })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.5 }}
      />
      <Grid container spacing={1.5}>
        <Grid item xs={6} sm={3}>
          <TextField
            select
            size="small"
            fullWidth
            label="Type"
            value={filters.form_type}
            onChange={(e) => update({ form_type: e.target.value })}
          >
            <MenuItem value="">All types</MenuItem>
            {definitions.map((d) => (
              <MenuItem key={d.form_type} value={d.form_type}>{d.title}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField
            select
            size="small"
            fullWidth
            label="Disposition"
            value={filters.disposition}
            onChange={(e) => update({ disposition: e.target.value })}
          >
            <MenuItem value="">Any disposition</MenuItem>
            {DISPOSITIONS.map((d) => (
              <MenuItem key={d} value={d}>{d}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6} sm={3}>
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.mine}
                onChange={(e) => update({ mine: e.target.checked })}
              />
            }
            label="Mine"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.held_by_me}
                onChange={(e) => update({ held_by_me: e.target.checked })}
              />
            }
            label="Held by me"
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default TrafficFilters;

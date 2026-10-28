import React from 'react';
import { Alert, Autocomplete, Box, TextField, Typography } from '@mui/material';
import { whoRanChoices } from '../../utils/netLog';

interface StationChoice {
  id: number;
  callsign: string;
  name?: string | null;
}

interface WhoRanNetFieldProps {
  checkIns: StationChoice[];
  // The chosen check-in's id, sent as ncs_check_in_id
  value: number | null;
  onChange: (checkInId: number | null) => void;
  disabled?: boolean;
}

// ========== WHO RAN THIS NET? ==========
// Shown in the Close Net window and the held log's Send window when nobody
// would be credited as NCS (GET /nets/{id}/ncs-needed). Offers only stations
// in the check-in list, the same rule as crediting a station by callsign.
const WhoRanNetField: React.FC<WhoRanNetFieldProps> = ({ checkIns, value, onChange, disabled }) => {
  const choices = whoRanChoices(checkIns);
  const selected = choices.find((c) => c.id === value) ?? null;
  return (
    <Alert severity="warning" sx={{ mt: 2, '& .MuiAlert-message': { flexGrow: 1 } }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Who ran this net?</Typography>
      <Typography variant="body2">
        Nobody is recorded as NCS. Choose who ran it, and the report, ICS-309 and closing email credit them.
      </Typography>
      <Box sx={{ mt: 1.5 }}>
        <Autocomplete
          options={choices}
          value={selected}
          onChange={(_e, choice) => onChange(choice ? choice.id : null)}
          getOptionLabel={(c) => (c.name ? `${c.callsign} (${c.name})` : c.callsign)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          disabled={disabled}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Net control station"
              size="small"
              helperText="Not listed? Check them in first."
            />
          )}
        />
      </Box>
    </Alert>
  );
};

export default WhoRanNetField;

import React, { useState } from 'react';
import { Autocomplete, Box, Button, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { asCallsign } from '../../utils/staffPeople';

interface DirectoryUser {
  id: number;
  callsign: string;
  name: string | null;
}

export type AddStaffRequest = { user_id: number } | { callsign: string; invite_email?: string };

// ========== ADD STAFF FIELD ==========
// Pick an operator from the directory, or type a callsign that has no account
// yet; for the latter an optional email sends them a sign-up invite. Shared by
// the Staff dialog (NCSStaffRosterTab) and the schedule editor's Net Staff tab
// (create-schedule/StaffRotationTab), which each used to carry their own
// account-only picker.
const AddStaffField: React.FC<{
  options: DirectoryUser[];
  loading?: boolean;
  label?: string;
  isMobile?: boolean;
  onAdd: (request: AddStaffRequest) => Promise<boolean>;
}> = ({ options, loading = false, label = 'Add NCS operator', isMobile = false, onAdd }) => {
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [input, setInput] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Typed text that matches nobody in the directory and is a callsign.
  const typedCallsign = !selected ? asCallsign(input) : null;
  const typedMatchesSomeone = !!typedCallsign && options.some(o => o.callsign?.toUpperCase() === typedCallsign);

  const submit = async () => {
    let request: AddStaffRequest | null = null;
    const match = typedMatchesSomeone ? options.find(o => o.callsign?.toUpperCase() === typedCallsign) : undefined;
    if (selected) request = { user_id: selected.id };
    else if (match) request = { user_id: match.id };
    else if (typedCallsign) request = { callsign: typedCallsign, ...(inviteEmail.trim() ? { invite_email: inviteEmail.trim() } : {}) };
    if (!request) return;
    setBusy(true);
    try {
      if (await onAdd(request)) {
        setSelected(null);
        setInput('');
        setInviteEmail('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, flexDirection: isMobile ? 'column' : 'row', mb: 2 }}>
      <Autocomplete
        freeSolo
        options={options}
        getOptionLabel={(option: DirectoryUser | string) =>
          typeof option === 'string' ? option : `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
        value={selected}
        onChange={(_: any, value: DirectoryUser | string | null) => setSelected(typeof value === 'string' ? null : value)}
        inputValue={input}
        onInputChange={(_: any, value: string) => setInput(value)}
        noOptionsText={loading ? 'Loading users…' : 'No one with an account matches'}
        renderInput={(params: any) => (
          <TextField
            {...params}
            label={label}
            placeholder="Pick someone, or type a callsign"
            size="small"
            helperText={typedCallsign && !typedMatchesSomeone
              ? `${typedCallsign} has no account yet. They'll be added by callsign.`
              : undefined}
          />
        )}
        sx={{ flex: 1 }}
      />
      {/* Shows when the typed callsign has no account */}
      {typedCallsign && !typedMatchesSomeone && (
        <TextField
          label="Email to invite (optional)"
          type="email"
          size="small"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          sx={{ flex: 1 }}
        />
      )}
      <Button
        type="button"
        variant="contained"
        startIcon={<AddIcon />}
        onClick={submit}
        disabled={busy || (!selected && !typedCallsign)}
        sx={{ alignSelf: 'flex-start', minHeight: 40 }}
      >
        Add
      </Button>
    </Box>
  );
};

export default AddStaffField;

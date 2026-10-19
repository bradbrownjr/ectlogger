import React, { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

// ========== PLACEHOLDER EDIT DIALOG ==========
// Fix a callsign-only operator's callsign (a typo is the usual reason) and/or
// send them a sign-up invite. Both are optional; Save sends what changed.
// Shared by the Staff dialog (NCSStaffRosterTab) and the schedule editor's
// Net Staff tab (create-schedule/StaffRotationTab).
interface PlaceholderStaff {
  user_callsign: string;
  invited?: boolean;
}

const PlaceholderEditDialog: React.FC<{
  staffMember: PlaceholderStaff | null;
  onClose: () => void;
  onSave: (changes: { callsign?: string; invite_email?: string }) => void;
}> = ({ staffMember, onClose, onSave }) => {
  const [callsign, setCallsign] = useState('');
  const [email, setEmail] = useState('');
  const open = !!staffMember;
  useEffect(() => {
    setCallsign(staffMember?.user_callsign ?? '');
    setEmail('');
  }, [staffMember]);
  const trimmed = callsign.trim().toUpperCase();
  const changes: { callsign?: string; invite_email?: string } = {};
  if (staffMember && trimmed && trimmed !== staffMember.user_callsign) changes.callsign = trimmed;
  if (email.trim()) changes.invite_email = email.trim();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{staffMember?.user_callsign}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Callsign"
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            helperText="Changes it on the staff list, the rotation and any swaps."
            size="small"
          />
          <TextField
            label={staffMember?.invited ? 'Send the invite again to' : 'Email to invite'}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helperText="They take their place on the team when they sign in with this address."
            size="small"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(changes)} disabled={Object.keys(changes).length === 0}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PlaceholderEditDialog;

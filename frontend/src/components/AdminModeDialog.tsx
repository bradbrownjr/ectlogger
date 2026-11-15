// ========== ADMIN MODE: CODE PROMPT ==========
// Asks an admin for their two-factor code to switch to admin (backend
// app/admin_mode.py). Opened from the account menu, from the Admin page, and
// by api.ts when the server refuses an admin action because admin mode is
// closed, in which case the refused request is sent again once this succeeds.
// Mounted once, in App.tsx.

import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_MODE_IDLE_MINUTES } from '../utils/adminMode';

const AdminModeDialog: React.FC = () => {
  const { adminPromptOpen, finishAdminPrompt, switchToAdmin } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A fresh, empty field each time it opens.
  useEffect(() => {
    if (adminPromptOpen) {
      setCode('');
      setError(null);
    }
  }, [adminPromptOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await switchToAdmin(code.trim());
      finishAdminPrompt(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not switch to admin. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={adminPromptOpen} onClose={() => !busy && finishAdminPrompt(false)} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Switch to admin</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter the code from your authenticator app. Admin mode stays on while you work and
            turns off after {ADMIN_MODE_IDLE_MINUTES} minutes without activity.
          </DialogContentText>
          <TextField
            fullWidth
            label="Verification Code"
            name="otp"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            inputProps={{ inputMode: 'numeric', maxLength: 20 }}
            disabled={busy}
            error={!!error}
            helperText={error || "A backup code also works if you don't have your authenticator handy."}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => finishAdminPrompt(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy || !code.trim()}>
            Switch to admin
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AdminModeDialog;

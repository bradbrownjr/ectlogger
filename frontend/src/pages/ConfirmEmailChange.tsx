import React, { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Container, Paper, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';

// ========== CONFIRM EMAIL CHANGE ==========
// Landing page for the link emailed to a new address (Profile > Security >
// Sign-in email). Opening the page changes nothing: the change needs the
// button click, so a mail scanner or link preview that opens the link
// can't make it. Works signed out, since the link may be opened on another
// device (backend routers/auth.py::confirm_email_change).
// The same page confirms a backup sign-in address, when the link carries
// kind=backup (Profile > Security > Backup emails,
// routers/auth.py::confirm_backup_email).

const ConfirmEmailChange: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isBackup = searchParams.get('kind') === 'backup';
  const { isAuthenticated, login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState<string | null>(null);

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const response = isBackup ? await authApi.confirmBackupEmail(token) : await authApi.confirmEmailChange(token);
      setNewEmail(response.data.email);
      // Refresh the signed-in account so Profile shows the new address.
      const sessionToken = localStorage.getItem('token');
      if (isAuthenticated && sessionToken) await login(sessionToken);
    } catch (err: any) {
      setError(getErrorMessage(err, "This link isn't valid."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6, mb: 4 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        <Typography variant="h5" component="h1" gutterBottom>
          {isBackup ? 'Confirm your backup email' : 'Confirm your new email'}
        </Typography>

        {!token && <Alert severity="error">This link is missing its code. Open it again from the email.</Alert>}

        {/* Shows after a successful confirm */}
        {newEmail && (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              {isBackup ? `${newEmail} now signs in to your account.` : `Your sign-in email is now ${newEmail}.`}
            </Alert>
            <Button component={RouterLink} to={isAuthenticated ? '/profile?tab=security' : '/login'} variant="contained">
              {isAuthenticated ? 'Back to your profile' : 'Sign in'}
            </Button>
          </>
        )}

        {/* Shows until confirmed */}
        {token && !newEmail && (
          <>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {isBackup
                ? 'Sign-in links sent to this address will open your account, alongside your sign-in email.'
                : 'Use this address to sign in from now on. Sign-in links sent to your old address will stop working.'}
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box>
              <Button variant="contained" onClick={confirm} disabled={busy}>
                {busy ? 'Confirming…' : isBackup ? 'Confirm backup email' : 'Confirm new email'}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default ConfirmEmailChange;

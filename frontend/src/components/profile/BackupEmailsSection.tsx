import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== BACKUP EMAILS ==========
// Extra addresses that also sign in to this account, so losing the primary
// mailbox doesn't lock anyone out (backend routers/auth.py BACKUP EMAILS).
// Adding one emails a link to it, and it is added only once that link is
// opened (pages/ConfirmEmailChange.tsx with kind=backup). Remove and Make
// primary act at once, after a confirm dialog that also takes the
// two-factor code. Every address on the account is told about each change.

export interface BackupEmail {
  id: number;
  email: string;
  created_at?: string | null;
}

type PendingAction = { kind: 'remove' | 'primary'; email: string };

interface BackupEmailsSectionProps {
  /** Re-reads the signed-in account, so Sign-in email shows a new primary. */
  onPrimaryChanged: () => Promise<void>;
}

const BackupEmailsSection: React.FC<BackupEmailsSectionProps> = ({ onPrimaryChanged }) => {
  const { user } = useAuth();
  const mfa = !!user?.mfa_enabled;
  // An admin's padlock on Email (Admin > Users > Edit User) covers backups too.
  const locked = !!user?.locked_fields?.includes('email');

  const [backups, setBackups] = useState<BackupEmail[] | null>(null);
  const [maxBackups, setMaxBackups] = useState(3);
  const [loadError, setLoadError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionCode, setActionCode] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async () => {
    try {
      const response = await authApi.getBackupEmails();
      setBackups(response.data.backups);
      setMaxBackups(response.data.max_backups);
      setLoadError('');
    } catch (err: any) {
      setLoadError(getErrorMessage(err, "Couldn't load your backup addresses"));
    }
  };

  useEffect(() => {
    load();
    // Reload when the primary changes from the Sign-in email form above.
  }, [user?.email]);

  const atLimit = backups !== null && backups.length >= maxBackups;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setSentTo('');
    setAddBusy(true);
    try {
      await authApi.requestBackupEmail(newEmail, mfa ? addCode : undefined);
      setSentTo(newEmail.trim().toLowerCase());
      setNewEmail('');
      setAddCode('');
    } catch (err: any) {
      setAddError(getErrorMessage(err, "Couldn't send the confirmation link"));
    } finally {
      setAddBusy(false);
    }
  };

  const openAction = (kind: PendingAction['kind'], email: string) => {
    setPending({ kind, email });
    setActionCode('');
    setActionError('');
  };

  const handleAction = async () => {
    if (!pending) return;
    setActionBusy(true);
    setActionError('');
    try {
      const call = pending.kind === 'remove' ? authApi.removeBackupEmail : authApi.makeBackupEmailPrimary;
      const response = await call(pending.email, mfa ? actionCode : undefined);
      setBackups(response.data.backups);
      setPending(null);
      if (pending.kind === 'primary') await onPrimaryChanged();
    } catch (err: any) {
      setActionError(getErrorMessage(err, "Couldn't change your addresses"));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Backup emails
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        These also sign you in, so losing one mailbox doesn't lock you out. Email from us still goes to your
        sign-in email. You can have up to {maxBackups}.
      </Typography>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {/* Loading, then the list or its empty message */}
      {backups === null && !loadError && <CircularProgress size={20} sx={{ mb: 2 }} />}
      {backups !== null && backups.length === 0 && (
        <Typography variant="body2" sx={{ mb: 2 }}>You have no backup addresses yet.</Typography>
      )}
      {backups !== null && backups.length > 0 && (
        <List dense disablePadding sx={{ mb: 2, maxWidth: 640 }}>
          {backups.map((backup) => (
            <ListItem
              key={backup.id}
              disableGutters
              sx={{ flexWrap: 'wrap', gap: 1, borderBottom: 1, borderColor: 'divider', py: 1 }}
            >
              <ListItemText primary={backup.email} sx={{ flex: '1 1 220px', minWidth: 0, wordBreak: 'break-all' }} />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" disabled={locked} onClick={() => openAction('primary', backup.email)} sx={{ minHeight: 44 }}>
                  Make primary
                </Button>
                <Button size="small" variant="outlined" color="error" disabled={locked} onClick={() => openAction('remove', backup.email)} sx={{ minHeight: 44 }}>
                  Remove
                </Button>
              </Box>
            </ListItem>
          ))}
        </List>
      )}

      {addError && <Alert severity="error" sx={{ mb: 2 }}>{addError}</Alert>}
      {sentTo && (
        <Alert severity="success" sx={{ mb: 2 }}>
          We sent a link to {sentTo}. Open it within 24 hours to add it.
        </Alert>
      )}
      <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start', mb: 2 }}>
        <TextField
          label="Backup email"
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={locked || atLimit}
          helperText={locked ? 'Locked by an administrator' : atLimit ? `You have ${maxBackups}. Remove one to add another.` : undefined}
          required
          sx={{ flex: '1 1 260px', maxWidth: 400 }}
        />
        {/* Shows for accounts with two-factor turned on */}
        {mfa && (
          <TextField
            label="Two-factor code"
            value={addCode}
            onChange={(e) => setAddCode(e.target.value)}
            inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
            required
            sx={{ flex: '0 1 180px' }}
          />
        )}
        <Button type="submit" variant="contained" disabled={locked || atLimit || addBusy || !newEmail.trim()} sx={{ minHeight: 56 }}>
          {addBusy ? 'Sending…' : 'Send link'}
        </Button>
      </Box>

      {/* ========== REMOVE / MAKE PRIMARY CONFIRM DIALOG ========== */}
      <Dialog open={pending !== null} onClose={actionBusy ? undefined : () => setPending(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{pending?.kind === 'remove' ? 'Remove backup email?' : 'Make this your sign-in email?'}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: mfa ? 2 : 0 }}>
            {pending?.kind === 'remove'
              ? <>Sign-in links sent to <strong>{pending?.email}</strong> will stop opening your account.</>
              : <>Email from us goes to <strong>{pending?.email}</strong> from now on, and <strong>{user?.email}</strong> becomes a backup.</>}
          </DialogContentText>
          {/* Shows for accounts with two-factor turned on */}
          {mfa && (
            <TextField
              label="Two-factor code"
              value={actionCode}
              onChange={(e) => setActionCode(e.target.value)}
              inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
              autoFocus
              fullWidth
            />
          )}
          {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}
        </DialogContent>
        <DialogActions disableSpacing sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button variant="outlined" color="inherit" onClick={() => setPending(null)} disabled={actionBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={pending?.kind === 'remove' ? 'error' : 'primary'}
            onClick={handleAction}
            disabled={actionBusy || (mfa && !actionCode.trim())}
            startIcon={actionBusy ? <CircularProgress size={20} color="inherit" /> : undefined}
          >
            {pending?.kind === 'remove' ? 'Remove' : 'Make primary'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default BackupEmailsSection;

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { backupApi } from '../../../services/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { BackupOverview } from './types';

const MIN_LENGTH = 12;

// create:  first passphrase, makes the key
// change:  same key, new passphrase (needs the current one)
// replace: brand-new key; older backups still need the old passphrase
export type BackupKeyMode = 'create' | 'change' | 'replace';

interface Props {
  open: boolean;
  mode: BackupKeyMode;
  onClose: () => void;
  onSaved: (overview: BackupOverview) => void;
}

const TITLES: Record<BackupKeyMode, string> = {
  create: 'Set backup passphrase',
  change: 'Change backup passphrase',
  replace: 'Replace backup key',
};

const BackupKeyDialog: React.FC<Props> = ({ open, mode, onClose, onSaved }) => {
  const [current, setCurrent] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setPassphrase('');
      setConfirm('');
      setError(null);
    }
  }, [open]);

  const tooShort = passphrase.length > 0 && passphrase.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const canSave = passphrase.length >= MIN_LENGTH && confirm === passphrase
    && (mode !== 'change' || current.length > 0) && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await backupApi.setKey({
        passphrase,
        current_passphrase: mode === 'change' ? current : undefined,
        replace: mode === 'replace',
      });
      onSaved(response.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the passphrase'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{TITLES[mode]}</DialogTitle>
      <DialogContent>
        {/* ========== WHAT THIS PASSPHRASE MEANS ========== */}
        {mode === 'replace' ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Backups made from now on use a new key. Backups made before this still need the
            current passphrase, so keep it for as long as you keep those.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No one can restore a backup without this passphrase, and this server does not keep a copy of
            it. Store it somewhere other than this server, such as a password manager.
          </Alert>
        )}
        {mode === 'change' && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The key stays the same, so every existing backup opens with the new passphrase too.
          </Typography>
        )}

        {mode === 'change' && (
          <TextField
            label="Current passphrase"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            fullWidth
            margin="normal"
            autoComplete="current-password"
            autoFocus
          />
        )}
        <TextField
          label="New passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          fullWidth
          margin="normal"
          autoComplete="new-password"
          autoFocus={mode !== 'change'}
          error={tooShort}
          helperText={`At least ${MIN_LENGTH} characters. A few unrelated words work well.`}
        />
        <TextField
          label="Repeat new passphrase"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          fullWidth
          margin="normal"
          autoComplete="new-password"
          error={mismatch}
          helperText={mismatch ? 'Does not match' : ' '}
        />
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          color={mode === 'replace' ? 'warning' : 'primary'}
          onClick={handleSave}
          disabled={!canSave}
          startIcon={saving ? <CircularProgress size={20} /> : undefined}
        >
          {mode === 'replace' ? 'Replace key' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BackupKeyDialog;

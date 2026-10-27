import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { userApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatDate } from '../../utils/dateUtils';

// ========== MERGE ACCOUNTS DIALOG ==========
// Opened from a user row's "Merge into" button, on the account to fold away
// (usually one made by signing in with a different address). Pick the
// account to keep, read what moves, then confirm with a two-factor code.
// The kept account's copy wins wherever both have the same thing, the merged
// account's addresses become backup sign-in addresses on it, and the merged
// account is deleted (backend services/account_merge.py).

export interface MergeCandidate {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
  is_active: boolean;
}

interface MergeSide {
  id: number;
  email: string;
  callsign?: string | null;
  name?: string | null;
  created_at?: string | null;
  last_active?: string | null;
}

interface MergePreview {
  source: MergeSide;
  target: MergeSide;
  moves: { label: string; count: number }[];
}

interface MergeAccountDialogProps {
  /** The account that will be merged away; null when closed. */
  source: MergeCandidate | null;
  users: MergeCandidate[];
  currentUserId?: number;
  preferUtc: boolean;
  onClose: () => void;
  onMerged: (message: string) => void;
}

const describe = (u: { callsign?: string | null; email: string }) => (u.callsign ? `${u.callsign} (${u.email})` : u.email);

const MergeAccountDialog: React.FC<MergeAccountDialogProps> = ({ source, users, currentUserId, preferUtc, onClose, onMerged }) => {
  const [target, setTarget] = useState<MergeCandidate | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Start clean each time the dialog opens on an account.
  useEffect(() => {
    setTarget(null);
    setPreview(null);
    setCode('');
    setError('');
  }, [source?.id]);

  useEffect(() => {
    if (!source || !target) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError('');
    userApi.mergePreview(target.id, source.id)
      .then((response) => setPreview(response.data))
      .catch((err) => { setPreview(null); setError(getErrorMessage(err, "Couldn't preview the merge")); })
      .finally(() => setLoading(false));
  }, [source?.id, target?.id]);

  const candidates = users.filter((u) => u.id !== source?.id && u.is_active);

  const handleMerge = async () => {
    if (!source || !target) return;
    setBusy(true);
    setError('');
    try {
      await userApi.mergeAccount(target.id, source.id, code.trim());
      onMerged(`Merged ${source.email} into ${describe(target)}.`);
    } catch (err: any) {
      setError(getErrorMessage(err, "Couldn't merge the accounts"));
    } finally {
      setBusy(false);
    }
  };

  const sideRow = (label: string, pick: (s: MergeSide) => React.ReactNode) => (
    <TableRow>
      <TableCell component="th" scope="row">{label}</TableCell>
      <TableCell>{preview && pick(preview.target)}</TableCell>
      <TableCell>{preview && pick(preview.source)}</TableCell>
    </TableRow>
  );
  const when = (value?: string | null) => (value ? formatDate(value, preferUtc) : 'Never');

  return (
    <Dialog open={source !== null} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Merge {source ? describe(source) : ''} into another account</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Use this when one operator has two accounts. Pick the one to keep, usually the older one with their callsign
          and check-ins.
        </DialogContentText>
        <Autocomplete
          options={candidates}
          value={target}
          onChange={(_, value) => setTarget(value)}
          getOptionLabel={(u) => [u.callsign, u.name, u.email].filter(Boolean).join(' · ')}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Account to keep" autoFocus />}
          sx={{ mb: 2 }}
        />

        {loading && <CircularProgress size={20} />}

        {/* Shows once an account to keep is picked */}
        {preview && (
          <>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Kept</TableCell>
                  <TableCell>Merged away</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sideRow('Email', (s) => <Box component="span" sx={{ wordBreak: 'break-all' }}>{s.email}</Box>)}
                {sideRow('Callsign', (s) => s.callsign || '')}
                {sideRow('Name', (s) => s.name || '')}
                {sideRow('Created', (s) => when(s.created_at))}
                {sideRow('Last active', (s) => when(s.last_active))}
              </TableBody>
            </Table>

            <Typography variant="subtitle2" gutterBottom>What moves to the kept account</Typography>
            <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
              {preview.moves.map((m) => (
                <li key={m.label}><Typography variant="body2">{m.label}: {m.count}</Typography></li>
              ))}
            </Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              {preview.source.email} will sign in to {describe(preview.target)}. Where both accounts have the same
              thing, the kept account's stays. The other account is then deleted, and this can't be undone. Both
              addresses are told.
            </Alert>
            <TextField
              label="Your two-factor code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
              fullWidth
            />
          </>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {source?.id === currentUserId && <Alert severity="info" sx={{ mt: 2 }}>You can't merge away your own account.</Alert>}
      </DialogContent>
      <DialogActions disableSpacing sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleMerge}
          disabled={!preview || busy || !code.trim()}
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          Merge accounts
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MergeAccountDialog;

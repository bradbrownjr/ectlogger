import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ButtonBase,
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { userApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatDate } from '../../utils/dateUtils';

// ========== MERGE ACCOUNTS DIALOG ==========
// Opened from a user row's "Merge into" button, on the account to fold away
// (usually one made by signing in with a different address). Pick the
// account to keep, tap the values to keep where the two differ (KD1OM wanted
// the newer account's address and the older one's callsign), read what
// moves, then click Merge accounts, which asks
// for a two-factor code in a second dialog. The code box used to sit at the
// bottom of this one, below the fold, so the disabled button gave no hint
// why (KD1OM, 2026-11-12).
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
  gmrs_callsign?: string | null;
  location?: string | null;
  skywarn_number?: string | null;
  website_url?: string | null;
  timezone?: string | null;
  created_at?: string | null;
  last_active?: string | null;
}

type Side = 'source' | 'target';
type ChoosableField = 'email' | 'callsign' | 'name' | 'gmrs_callsign' | 'location' | 'skywarn_number' | 'website_url' | 'timezone';

// The profile values either account can supply (backend
// account_merge.CHOOSABLE_FIELDS), in table order.
const CHOOSABLE: { field: ChoosableField; label: string }[] = [
  { field: 'email', label: 'Email' },
  { field: 'callsign', label: 'Callsign' },
  { field: 'name', label: 'Name' },
  { field: 'gmrs_callsign', label: 'GMRS callsign' },
  { field: 'location', label: 'Location' },
  { field: 'skywarn_number', label: 'SKYWARN number' },
  { field: 'website_url', label: 'Website' },
  { field: 'timezone', label: 'Time zone' },
];

const valueOf = (side: MergeSide, field: ChoosableField) => (side[field] || '').trim();

// A choice is offered only when both accounts have a value and they differ;
// otherwise the merge keeps whichever value exists, as the server does.
const isChoice = (preview: MergePreview, field: ChoosableField) => {
  const kept = valueOf(preview.target, field);
  const other = valueOf(preview.source, field);
  return !!kept && !!other && kept.toLowerCase() !== other.toLowerCase();
};

// Which side's value ends up on the kept account.
const sideUsed = (preview: MergePreview, field: ChoosableField, choices: Partial<Record<ChoosableField, Side>>): Side => {
  if (isChoice(preview, field)) return choices[field] ?? 'target';
  return valueOf(preview.target, field) ? 'target' : 'source';
};

interface MergePreview {
  source: MergeSide;
  target: MergeSide;
  moves: { label: string; count: number }[];
}

interface MergeAccountDialogProps {
  /** The account that will be merged away; null when closed. */
  source: MergeCandidate | null;
  /** The account to start on as the one to keep (a duplicate pair's suggestion). */
  initialTargetId?: number;
  users: MergeCandidate[];
  currentUserId?: number;
  preferUtc: boolean;
  onClose: () => void;
  onMerged: (message: string) => void;
}

const describe = (u: { callsign?: string | null; email: string }) => (u.callsign ? `${u.callsign} (${u.email})` : u.email);

const MergeAccountDialog: React.FC<MergeAccountDialogProps> = ({ source, initialTargetId, users, currentUserId, preferUtc, onClose, onMerged }) => {
  const [target, setTarget] = useState<MergeCandidate | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Values picked from either account, by field; unpicked keeps the kept account's.
  const [choices, setChoices] = useState<Partial<Record<ChoosableField, Side>>>({});
  // The two-factor prompt opened by Merge accounts, and its own error.
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Start clean each time the dialog opens on an account.
  useEffect(() => {
    setTarget(users.find((u) => u.id === initialTargetId && u.id !== source?.id && u.is_active) ?? null);
    setPreview(null);
    setCode('');
    setError('');
    setConfirming(false);
  }, [source?.id]);

  useEffect(() => {
    setChoices({});
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

  const openConfirm = () => {
    setCode('');
    setConfirmError('');
    setConfirming(true);
  };

  const handleMerge = async () => {
    if (!source || !target || !code.trim()) return;
    setBusy(true);
    setConfirmError('');
    try {
      await userApi.mergeAccount(target.id, source.id, code.trim(), choices);
      setConfirming(false);
      onMerged(`Merged ${source.email} into ${describe(target)}.`);
    } catch (err: any) {
      setConfirmError(getErrorMessage(err, "Couldn't merge the accounts"));
    } finally {
      setBusy(false);
    }
  };

  const sideRow = (label: string, pick: (s: MergeSide) => React.ReactNode) => (
    <TableRow key={label}>
      <TableCell component="th" scope="row">{label}</TableCell>
      <TableCell>{preview && pick(preview.target)}</TableCell>
      <TableCell>{preview && pick(preview.source)}</TableCell>
    </TableRow>
  );
  const when = (value?: string | null) => (value ? formatDate(value, preferUtc) : 'Never');

  // One cell of a choosable row: a button when the two accounts differ, the
  // value with a check mark when it is the one that stays.
  const choiceCell = (p: MergePreview, field: ChoosableField, side: Side) => {
    const value = valueOf(side === 'target' ? p.target : p.source, field);
    const used = !!value && sideUsed(p, field, choices) === side;
    // Only an address or link may break mid-word, or a narrow phone column
    // splits ordinary words ("Gorha m").
    const wrap = field === 'email' || field === 'website_url' ? 'anywhere' : 'normal';
    const content = (
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflowWrap: wrap }}>
        {used && <CheckCircleIcon fontSize="small" color="primary" aria-hidden />}
        <span>{value}</span>
      </Box>
    );
    if (!isChoice(p, field)) return <TableCell>{content}</TableCell>;
    return (
      <TableCell sx={{ p: 0.5 }}>
        <ButtonBase
          onClick={() => setChoices((c) => ({ ...c, [field]: side }))}
          aria-pressed={used}
          aria-label={`Keep ${value}`}
          sx={{
            width: '100%', minHeight: 44, px: 1, justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1,
            border: 1, borderColor: used ? 'primary.main' : 'divider',
            bgcolor: used ? 'action.selected' : 'transparent',
            fontWeight: used ? 500 : 400,
          }}
        >
          {content}
        </ButtonBase>
      </TableCell>
    );
  };

  // What the kept account signs in with after the merge, for the warning.
  const primaryEmail = preview ? (sideUsed(preview, 'email', choices) === 'source' ? preview.source : preview.target).email : '';
  const backupEmail = preview ? (primaryEmail === preview.source.email ? preview.target.email : preview.source.email) : '';
  const anyChoice = preview ? CHOOSABLE.some(({ field }) => isChoice(preview, field)) : false;

  return (
    <>
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
                {/* Profile values: tappable where the two accounts differ */}
                {CHOOSABLE.filter(({ field }) => valueOf(preview.target, field) || valueOf(preview.source, field)).map(({ field, label }) => (
                  <TableRow key={field}>
                    <TableCell component="th" scope="row">{label}</TableCell>
                    {choiceCell(preview, field, 'target')}
                    {choiceCell(preview, field, 'source')}
                  </TableRow>
                ))}
                {sideRow('Created', (s) => when(s.created_at))}
                {sideRow('Last active', (s) => when(s.last_active))}
              </TableBody>
            </Table>
            {/* Shows when at least one value differs between the accounts */}
            {anyChoice && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Where they differ, tap the value to keep. The address you don't pick stays a backup sign-in address,
                and the callsign you don't pick stays an additional callsign. Other values you don't pick are dropped.
              </Typography>
            )}

            <Typography variant="subtitle2" gutterBottom>What moves to the kept account</Typography>
            <Box component="ul" sx={{ mt: 0, mb: 0, pl: 3 }}>
              {preview.moves.map((m) => (
                <li key={m.label}><Typography variant="body2">{m.label}: {m.count}</Typography></li>
              ))}
            </Box>
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
          onClick={openConfirm}
          disabled={!preview || busy}
        >
          Merge accounts
        </Button>
      </DialogActions>
    </Dialog>

    {/* ========== TWO-FACTOR PROMPT ========== */}
    {/* Opens on top when Merge accounts is clicked; the merge runs from here */}
    <Dialog open={confirming && preview !== null} onClose={busy ? undefined : () => setConfirming(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm the merge</DialogTitle>
      <DialogContent>
        {preview && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {primaryEmail} will be the primary address and {backupEmail} a backup sign-in address, so either
            signs in. Where both accounts have the same thing, the kept account's stays. The other account is then
            deleted, and this can't be undone. Both addresses are told.
          </Alert>
        )}
        <TextField
          label="Your two-factor code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.trim() && !busy) handleMerge(); }}
          fullWidth
          autoFocus
          autoComplete="one-time-code"
          inputProps={{ inputMode: 'numeric', maxLength: 8 }}
        />
        {confirmError && <Alert severity="error" sx={{ mt: 2 }}>{confirmError}</Alert>}
      </DialogContent>
      <DialogActions disableSpacing sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
        <Button variant="outlined" color="inherit" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleMerge}
          disabled={busy || !code.trim()}
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          Merge accounts
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default MergeAccountDialog;

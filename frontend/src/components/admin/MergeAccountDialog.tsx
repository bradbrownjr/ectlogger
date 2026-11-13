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

// Both values survive a merge: the one not made primary stays as a backup
// sign-in address or an additional callsign (backend account_merge.py).
const PAIRED: { field: 'email' | 'callsign'; label: string; other: string }[] = [
  { field: 'email', label: 'Email', other: 'Backup sign-in' },
  { field: 'callsign', label: 'Callsign', other: 'Additional' },
];
// Only one value survives; the other is dropped.
const SINGLE = CHOOSABLE.filter(({ field }) => field !== 'email' && field !== 'callsign');

const accountName = (u: MergeSide) => u.callsign || u.email;

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

  const when = (value?: string | null) => (value ? formatDate(value, preferUtc) : 'Never');

  // One value in a comparison row. Where the two accounts differ it is a
  // button; either way it says what happens to it (Primary, Backup, Kept,
  // Dropped), since a value can survive from either account.
  const valueCell = (p: MergePreview, field: ChoosableField, side: Side, roleUsed: string, roleOther: string) => {
    const value = valueOf(side === 'target' ? p.target : p.source, field);
    if (!value) return <TableCell />;
    const used = sideUsed(p, field, choices) === side;
    const dropped = !used && roleOther === 'Dropped';
    // Only an address or link may break mid-word, or a narrow phone column
    // splits ordinary words ("Gorha m").
    const wrap = field === 'email' || field === 'website_url' ? 'anywhere' : 'normal';
    const content = (
      <Box component="span" sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, overflowWrap: wrap, minWidth: 0 }}>
        {used && <CheckCircleIcon fontSize="small" color="primary" aria-hidden sx={{ mt: 0.25 }} />}
        <Box component="span" sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ display: 'block', textDecoration: dropped ? 'line-through' : 'none',
            color: dropped ? 'text.secondary' : 'text.primary' }}>
            {value}
          </Box>
          <Typography component="span" variant="caption" sx={{ display: 'block', color: used ? 'primary.main' : 'text.secondary' }}>
            {used ? roleUsed : roleOther}
          </Typography>
        </Box>
      </Box>
    );
    if (!isChoice(p, field)) return <TableCell>{content}</TableCell>;
    return (
      <TableCell sx={{ p: 0.5 }}>
        <ButtonBase
          onClick={() => setChoices((c) => ({ ...c, [field]: side }))}
          aria-pressed={used}
          aria-label={roleUsed === 'Primary' ? `Make ${value} primary` : `Keep ${value}`}
          sx={{
            width: '100%', minHeight: 44, px: 1, py: 0.5, justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1,
            border: 1, borderColor: used ? 'primary.main' : 'divider',
            bgcolor: used ? 'action.selected' : 'transparent',
          }}
        >
          {content}
        </ButtonBase>
      </TableCell>
    );
  };

  // A section's table. The column headings name the two accounts, not what
  // happens to them: KD1OM's gmail address was the one kept, under a heading
  // that read "Merged away" (2026-11-13).
  const comparison = (p: MergePreview, rows: React.ReactNode) => (
    <Table size="small" sx={{ tableLayout: 'fixed', mb: 2 }}>
      <colgroup>
        <col style={{ width: '28%' }} />
        <col style={{ width: '36%' }} />
        <col style={{ width: '36%' }} />
      </colgroup>
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell sx={{ overflowWrap: 'anywhere' }}>{accountName(p.target)}</TableCell>
          <TableCell sx={{ overflowWrap: 'anywhere' }}>{accountName(p.source)}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>{rows}</TableBody>
    </Table>
  );

  const sectionTitle = (title: string, hint: string) => (
    <>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="body2" color="text.secondary">{hint}</Typography>
    </>
  );

  // What the kept account signs in with after the merge, for the warning.
  const primaryEmail = preview ? (sideUsed(preview, 'email', choices) === 'source' ? preview.source : preview.target).email : '';
  const backupEmail = preview ? (primaryEmail === preview.source.email ? preview.target.email : preview.source.email) : '';
  // Profile values only one of which can stay; the rest are kept as they are.
  const profileChoices = preview ? SINGLE.filter(({ field }) => isChoice(preview, field)) : [];

  return (
    <>
    <Dialog open={source !== null} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Merge {source ? describe(source) : ''} into another account</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Use this when one operator has two accounts. Pick the account to keep: its password, two-factor setup, role
          and early access stay as they are. Everything the other account has moves to it, and the other account is
          deleted.
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
            {/* ========== THE TWO ACCOUNTS ========== */}
            {comparison(preview, (
              <>
                <TableRow>
                  <TableCell component="th" scope="row">Account</TableCell>
                  <TableCell><Typography variant="body2" color="primary.main">Kept</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">Deleted after the merge</Typography></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th" scope="row">Created</TableCell>
                  <TableCell>{when(preview.target.created_at)}</TableCell>
                  <TableCell>{when(preview.source.created_at)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th" scope="row">Last active</TableCell>
                  <TableCell>{when(preview.target.last_active)}</TableCell>
                  <TableCell>{when(preview.source.last_active)}</TableCell>
                </TableRow>
              </>
            ))}

            {/* ========== BOTH KEPT: PICK THE PRIMARY ========== */}
            {sectionTitle('Email and callsign', 'Both are kept. Tap the one to make primary.')}
            {comparison(preview, PAIRED.filter(({ field }) => valueOf(preview.target, field) || valueOf(preview.source, field))
              .map(({ field, label, other }) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">{label}</TableCell>
                  {valueCell(preview, field, 'target', 'Primary', other)}
                  {valueCell(preview, field, 'source', 'Primary', other)}
                </TableRow>
              )))}

            {/* ========== ONE KEPT: PICK WHICH ========== */}
            {/* Shows when the accounts have different values for a profile field */}
            {profileChoices.length > 0 && (
              <>
                {sectionTitle('Profile', "Only one is kept. Tap the one to keep. Details only one account has, or both share, are kept as they are.")}
                {comparison(preview, profileChoices.map(({ field, label }) => (
                  <TableRow key={field}>
                    <TableCell component="th" scope="row">{label}</TableCell>
                    {valueCell(preview, field, 'target', 'Kept', 'Dropped')}
                    {valueCell(preview, field, 'source', 'Kept', 'Dropped')}
                  </TableRow>
                )))}
              </>
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

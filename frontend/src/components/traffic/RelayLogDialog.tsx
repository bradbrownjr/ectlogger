import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Autocomplete,
  Box,
  Alert,
} from '@mui/material';
import { trafficApi, userApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { useAuth } from '../../contexts/AuthContext';

// ========== RelayLogDialog ==========
// Appends one hop to a form's chain of custody via POST /traffic/forms/{id}/log.
// Follows docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.3/4.3: action
// select, method select (enum), path name (free text), handed-to (free text
// with an optional account autocomplete reusing the same directory-picker
// pattern as NCSStaffRosterTab.tsx), occurred-at (defaults to now, editable),
// note. The chain is append-only -- this dialog only ever creates a new
// entry, never edits or removes one.
//
// "Handed to" defaults to the logged-in operator's own callsign, since the
// common case is self-service ("I'm logging that I handled this"); it's a
// plain editable text field so it's overwritten freely when the operator is
// instead logging a hop someone else verbally reported to them.

const ACTIONS = [
  { value: 'originated', label: 'Originated' },
  { value: 'received', label: 'Received' },
  { value: 'relayed', label: 'Relayed' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'serviced', label: 'Serviced (reported back to origin)' },
  { value: 'cancelled', label: 'Cancelled' },
];

const METHODS = [
  { value: '', label: '(not specified)' },
  { value: 'voice_net', label: 'Voice net' },
  { value: 'cw_net', label: 'CW net' },
  { value: 'digital_net', label: 'Digital net' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'postal', label: 'Postal' },
  { value: 'other', label: 'Other' },
];

interface DirectoryUser {
  id: number;
  callsign?: string | null;
  name?: string | null;
}

function nowForInput(): string {
  const dt = new Date();
  const tzOffset = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tzOffset).toISOString().slice(0, 16);
}

interface RelayLogDialogProps {
  open: boolean;
  formId: number;
  defaultAction?: string;
  onClose: () => void;
  onLogged: () => void;
}

const RelayLogDialog: React.FC<RelayLogDialogProps> = ({ open, formId, defaultAction, onClose, onLogged }) => {
  const { user } = useAuth();
  const [action, setAction] = useState(defaultAction || 'relayed');
  const [method, setMethod] = useState('');
  const [methodNote, setMethodNote] = useState('');
  const [pathName, setPathName] = useState('');
  const [handedTo, setHandedTo] = useState('');
  const [handedToUser, setHandedToUser] = useState<DirectoryUser | null>(null);
  const [occurredAt, setOccurredAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAction(defaultAction || 'relayed');
    setMethod('');
    setMethodNote('');
    setPathName('');
    setHandedTo(user?.callsign || '');
    setHandedToUser(null);
    setOccurredAt(nowForInput());
    setNote('');
    setError(null);
    userApi.listDirectory().then((res) => setDirectory(res.data)).catch(() => setDirectory([]));
  }, [open, defaultAction, user]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const canSubmit = !submitting && !(method === 'other' && !methodNote.trim());

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await trafficApi.appendLogEntry(formId, {
        action,
        method: method || undefined,
        method_note: method === 'other' ? methodNote.trim() : undefined,
        path_name: pathName.trim() || undefined,
        handed_to: handedToUser
          ? `${handedToUser.callsign || ''}${handedToUser.name ? ` (${handedToUser.name})` : ''}`.trim()
          : (handedTo.trim() || undefined),
        handed_to_user_id: handedToUser?.id,
        occurred_at: new Date(occurredAt).toISOString(),
        note: note.trim() || undefined,
      });
      onLogged();
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to log this handoff'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Log a Handoff</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            select
            label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            fullWidth
            size="small"
          >
            {ACTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            fullWidth
            size="small"
            helperText={method === 'other' ? 'Describe the method below' : ' '}
          >
            {METHODS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>

          {method === 'other' && (
            <TextField
              label="Method note"
              value={methodNote}
              onChange={(e) => setMethodNote(e.target.value)}
              fullWidth
              size="small"
              required
              inputProps={{ maxLength: 255 }}
            />
          )}

          <TextField
            label="Net / path name"
            value={pathName}
            onChange={(e) => setPathName(e.target.value)}
            placeholder="Pine Tree Net, 146.940 W1MTW, NTSD MPG..."
            fullWidth
            size="small"
            inputProps={{ maxLength: 200 }}
          />

          <Autocomplete
            options={directory}
            getOptionLabel={(option: DirectoryUser) => `${option.callsign || ''}${option.name ? ` (${option.name})` : ''}`}
            value={handedToUser}
            onChange={(_: any, value: DirectoryUser | null) => setHandedToUser(value)}
            noOptionsText="No users found"
            renderInput={(params: any) => (
              <TextField {...params} label="Handed to (ECTLogger account, optional)" size="small" />
            )}
          />

          <TextField
            label="Handed to (free text)"
            value={handedTo}
            onChange={(e) => setHandedTo(e.target.value)}
            placeholder="Callsign, name, or addressee"
            fullWidth
            size="small"
            disabled={!!handedToUser}
            helperText={handedToUser ? 'Using the selected account above' : ' '}
            inputProps={{ maxLength: 200 }}
          />

          <TextField
            label="Occurred at"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            rows={2}
            size="small"
            inputProps={{ maxLength: 2000 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit} sx={{ minHeight: 44 }}>
          {submitting ? 'Logging…' : 'Log Handoff'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RelayLogDialog;

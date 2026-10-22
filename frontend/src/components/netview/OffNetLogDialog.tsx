import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { offNetLogApi, OffNetLogEntry, OffNetLogList } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatTimeWithDate } from '../../utils/dateUtils';

// ========== OFF-NET LOG DIALOG ==========
// A station's activity away from this net, for the net's ICS-309: a check-in
// to another net, a call on a statewide talkgroup, a Winlink message sent to
// another county. Records that it happened, never the message itself.
// Net control's entries count at once; a station's own entry waits for NCS,
// Logger or a net manager to accept it (backend routers/off_net_log.py).

interface OffNetLogDialogProps {
  open: boolean;
  onClose: () => void;
  netId: number;
  // Suggestions for the Channel field: this net's frequencies, already formatted
  channelSuggestions: string[];
  preferUtc: boolean;
}

interface Draft {
  id: number | null;
  time: string;          // datetime-local value, in the viewer's display zone
  from_station: string;
  to_station: string;
  channel: string;
  message: string;
  message_id: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

// datetime-local value for an instant, in local time or UTC
const toInput = (date: Date, preferUtc: boolean): string => preferUtc
  ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const fromInput = (value: string, preferUtc: boolean): string =>
  (preferUtc ? new Date(`${value}:00Z`) : new Date(value)).toISOString();

// Backend times are UTC, sometimes without the 'Z'
const parseUtc = (iso: string): Date => new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);

const emptyDraft = (preferUtc: boolean, fromStation: string): Draft => ({
  id: null,
  time: toInput(new Date(), preferUtc),
  from_station: fromStation,
  to_station: '',
  channel: '',
  message: '',
  message_id: '',
});

const STATUS_CHIP: Record<OffNetLogEntry['status'], { label: string; color: 'warning' | 'success' | 'default' }> = {
  pending: { label: 'Awaiting review', color: 'warning' },
  accepted: { label: 'On the log', color: 'success' },
  rejected: { label: 'Rejected', color: 'default' },
};

const OffNetLogDialog: React.FC<OffNetLogDialogProps> = ({ open, onClose, netId, channelSuggestions, preferUtc }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [log, setLog] = useState<OffNetLogList | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchLog = useCallback(async () => {
    try {
      const { data } = await offNetLogApi.list(netId);
      setLog(data);
    } catch (err) {
      setError(getErrorMessage(err, 'The off-net log could not be loaded.'));
    }
  }, [netId]);

  // Load on open, and again whenever anyone changes the log
  useEffect(() => {
    if (!open) return;
    fetchLog();
    const onChanged = () => fetchLog();
    window.addEventListener('offNetLogChanged', onChanged);
    return () => window.removeEventListener('offNetLogChanged', onChanged);
  }, [open, fetchLog]);

  // Each open starts without a half-filled form
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setError('');
    }
  }, [open]);

  const startAdd = () => setDraft(emptyDraft(preferUtc, log?.own_callsign || ''));

  const startEdit = (entry: OffNetLogEntry) => setDraft({
    id: entry.id,
    time: toInput(parseUtc(entry.occurred_at), preferUtc),
    from_station: entry.from_station,
    to_station: entry.to_station,
    channel: entry.channel || '',
    message: entry.message,
    message_id: entry.message_id || '',
  });

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setSaving(true);
    setError('');
    try {
      await action();
      await fetchLog();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, fallback));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    const payload = {
      occurred_at: fromInput(draft.time, preferUtc),
      from_station: draft.from_station.trim() || null,
      to_station: draft.to_station.trim(),
      channel: draft.channel.trim() || null,
      message: draft.message.trim(),
      message_id: draft.message_id.trim() || null,
    };
    const ok = await run(
      () => (draft.id ? offNetLogApi.update(netId, draft.id, payload) : offNetLogApi.add(netId, payload)),
      'The entry could not be saved.',
    );
    if (ok) setDraft(null);
  };

  const handleDelete = (entry: OffNetLogEntry) => {
    if (!window.confirm('Delete this entry from the off-net log?')) return;
    run(() => offNetLogApi.remove(netId, entry.id), 'The entry could not be deleted.');
  };

  const draftValid = !!draft && !!draft.time && !!draft.to_station.trim() && !!draft.message.trim()
    && (!log?.adds_accepted || !!draft.from_station.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ pr: 6 }}>
        Off-net log
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" paragraph>
          What a station did away from this net, such as checking in to another net or sending a Winlink message.
          Each entry is a line on this net's ICS-309. Log that it happened, not the message itself.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {/* Shows for net control when stations' entries are waiting */}
        {log?.can_review && log.pending_count > 0 && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" disabled={saving}
                onClick={() => run(() => offNetLogApi.acceptPending(netId), 'The entries could not be accepted.')}>
                Accept all
              </Button>
            }
          >
            {log.pending_count === 1 ? '1 entry is' : `${log.pending_count} entries are`} awaiting review.
          </Alert>
        )}

        {/* ========== ADD / EDIT FORM ========== */}
        {draft && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <TextField
                  label={preferUtc ? 'Time (UTC)' : 'Time'}
                  type="datetime-local"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  required
                />
                {/* Net control logs for any station; a station logs as itself */}
                <TextField
                  label="From station"
                  value={draft.from_station}
                  onChange={(e) => setDraft({ ...draft, from_station: e.target.value.toUpperCase() })}
                  disabled={!log?.adds_accepted}
                  helperText={log?.adds_accepted ? 'The station that made the contact' : 'Your callsign'}
                  size="small"
                  required
                  inputProps={{ maxLength: 100 }}
                />
                <TextField
                  label="To"
                  placeholder="State ARES net, a neighboring county EMA"
                  value={draft.to_station}
                  onChange={(e) => setDraft({ ...draft, to_station: e.target.value })}
                  size="small"
                  required
                  inputProps={{ maxLength: 200 }}
                />
                <Autocomplete
                  freeSolo
                  options={[...channelSuggestions, 'Winlink']}
                  inputValue={draft.channel}
                  onInputChange={(_, value) => setDraft({ ...draft, channel: value })}
                  renderInput={(params) => (
                    <TextField {...params} label="Channel" placeholder="3.940 LSB, a DMR talkgroup, Winlink" size="small"
                      inputProps={{ ...params.inputProps, maxLength: 200 }} />
                  )}
                />
              </Box>
              <TextField
                label="What happened"
                placeholder="Checked in for our county"
                value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                size="small"
                required
                multiline
                inputProps={{ maxLength: 1000 }}
              />
              <TextField
                label="Message ID (optional)"
                placeholder="The Winlink message ID, to match a printed copy to this line"
                value={draft.message_id}
                onChange={(e) => setDraft({ ...draft, message_id: e.target.value })}
                size="small"
                inputProps={{ maxLength: 100 }}
              />
              {!log?.adds_accepted && (
                <Typography variant="caption" color="text.secondary">
                  Net control reviews your entry before it goes on the ICS-309.
                </Typography>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={handleSave} disabled={!draftValid || saving}>
                  {draft.id ? 'Save' : 'Add to log'}
                </Button>
              </Box>
            </Stack>
          </Paper>
        )}

        {/* ========== ENTRY LIST ========== */}
        {log && log.entries.length === 0 && !draft && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            Nothing logged yet.
          </Typography>
        )}
        <Stack spacing={1}>
          {log?.entries.map((entry) => (
            <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, opacity: entry.status === 'rejected' ? 0.6 : 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatTimeWithDate(entry.occurred_at, preferUtc)} · {entry.from_station} → {entry.to_station}
                  </Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {entry.channel && <strong>{entry.channel}: </strong>}
                    {entry.message}
                    {entry.message_id && ` (msg ID ${entry.message_id})`}
                  </Typography>
                  {entry.entered_by_callsign && entry.entered_by_callsign !== entry.from_station && (
                    <Typography variant="caption" color="text.secondary">Logged by {entry.entered_by_callsign}</Typography>
                  )}
                </Box>
                <Chip size="small" label={STATUS_CHIP[entry.status].label} color={STATUS_CHIP[entry.status].color} variant="outlined" />
                <Box sx={{ display: 'flex' }}>
                  {/* Review: net control only, on an entry not yet accepted or rejected */}
                  {entry.can_review && entry.status !== 'accepted' && (
                    <Tooltip title="Accept">
                      <IconButton size="small" color="success" disabled={saving}
                        onClick={() => run(() => offNetLogApi.review(netId, entry.id, 'accepted'), 'The entry could not be accepted.')}>
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {entry.can_review && entry.status === 'pending' && (
                    <Tooltip title="Reject">
                      <IconButton size="small" disabled={saving}
                        onClick={() => run(() => offNetLogApi.review(netId, entry.id, 'rejected'), 'The entry could not be rejected.')}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {entry.can_edit && (
                    <>
                      <Tooltip title="Edit">
                        <IconButton size="small" disabled={saving} onClick={() => startEdit(entry)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" disabled={saving} onClick={() => handleDelete(entry)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              </Box>
            </Paper>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {log?.can_add && !draft && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={startAdd} data-testid="off-net-log-add">
            Add entry
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default OffNetLogDialog;

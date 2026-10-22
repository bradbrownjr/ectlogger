import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  TextField,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import SendIcon from '@mui/icons-material/Send';
import { frequencyApi, FrequencyFormContext } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

export interface FrequencyChangeRequest {
  frequencyId: number;
  action: 'edit' | 'delete';
  // Server's reason the viewer can't do it themselves (edit_refused / delete_refused)
  message: string;
  current: string;
  // Edit only: what the viewer typed, as display text and as the request payload
  proposedText?: string;
  proposed?: Record<string, string | null>;
}

interface FrequencyChangeRequestDialogProps {
  request: FrequencyChangeRequest | null;
  context?: FrequencyFormContext;
  onClose: () => void;
}

// ========== FREQUENCY CHANGE REQUEST DIALOG ==========
// Shown by CommunicationPlanPanel when a frequency edit or delete is one only
// an admin may make (someone else added it, or another net, schedule or
// check-in uses it; routers/frequencies.py::change_refusal). Sends a private
// email to the admins, like EarlyAccessRequestDialog.
const FrequencyChangeRequestDialog: React.FC<FrequencyChangeRequestDialogProps> = ({ request, context, onClose }) => {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Each refusal starts a fresh request
  useEffect(() => {
    if (request) {
      setNote('');
      setSent(false);
      setError('');
    }
  }, [request]);

  const handleSend = async () => {
    if (!request) return;
    setSending(true);
    setError('');
    try {
      await frequencyApi.requestChange(request.frequencyId, {
        action: request.action,
        proposed: request.proposed,
        note: note.trim() || undefined,
        ...context,
      });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.status === 429
        ? 'You have already sent several requests today. An administrator will be in touch.'
        : getErrorMessage(err, 'The request could not be sent. Please try again later.'));
    } finally {
      setSending(false);
    }
  };

  const isDelete = request?.action === 'delete';

  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderTop: 4, borderColor: 'warning.main' } }}
    >
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <LockIcon sx={{ fontSize: 40, color: 'warning.main', flexShrink: 0, mt: 0.5 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" gutterBottom>
              {isDelete ? 'Cannot Delete Frequency' : 'Cannot Change Frequency'}
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              {request?.message}
            </Typography>

            {/* What would change: current entry, and the edit the viewer typed */}
            <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Typography variant="body2"><strong>Frequency:</strong> {request?.current}</Typography>
              {!isDelete && request?.proposedText && (
                <Typography variant="body2"><strong>Change to:</strong> {request.proposedText}</Typography>
              )}
            </Box>

            {/* Before sending: explain the option and collect an optional note */}
            {!sent && (
              <>
                <Typography variant="body1" color="text.secondary" paragraph>
                  {isDelete
                    ? 'You can ask an administrator to delete it.'
                    : 'You can ask an administrator to make this change.'}
                </Typography>
                <TextField
                  label="Note to the administrators (optional)"
                  placeholder="For example, the band plan or club page that shows the right details"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                  inputProps={{ maxLength: 1000 }}
                  disabled={sending}
                />
              </>
            )}

            {/* After sending: confirmation replaces the form */}
            {sent && (
              <Alert severity="success">
                Your request was sent to the administrators.
              </Alert>
            )}

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {sent ? (
          <Button onClick={onClose} variant="contained" autoFocus>OK</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={sending}>Close</Button>
            <Button onClick={handleSend} variant="contained" startIcon={<SendIcon />} disabled={sending}>
              {sending ? 'Sending...' : 'Send request'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default FrequencyChangeRequestDialog;

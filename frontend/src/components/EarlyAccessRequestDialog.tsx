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
import LockClockIcon from '@mui/icons-material/LockClock';
import SendIcon from '@mui/icons-material/Send';
import { templateApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';

interface EarlyAccessRequestDialogProps {
  open: boolean;
  onClose: () => void;
  // Server's explanation of which requirement wasn't met (account age or nets attended)
  message: string;
}

// ========== EARLY ACCESS REQUEST DIALOG ==========
// Shown instead of the plain error alert when creating a schedule is refused
// for account age or net participation (403 detail code
// SCHEDULE_REQUIREMENTS_NOT_MET in routers/templates_core.py). Sends a private
// email to the admins; the user is emailed back when one grants it.
const EarlyAccessRequestDialog: React.FC<EarlyAccessRequestDialogProps> = ({ open, onClose, message }) => {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Each refusal starts a fresh request
  useEffect(() => {
    if (open) {
      setNote('');
      setSent(false);
      setError('');
    }
  }, [open]);

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      await templateApi.requestEarlyAccess(note.trim() || undefined);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.status === 429
        ? 'You have already sent several requests today. An administrator will be in touch.'
        : getErrorMessage(err, 'The request could not be sent. Please try again later.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderTop: 4, borderColor: 'warning.main' } }}
    >
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <LockClockIcon sx={{ fontSize: 40, color: 'warning.main', flexShrink: 0, mt: 0.5 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" gutterBottom>
              Cannot Create Schedule Yet
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              {message}
            </Typography>

            {/* Before sending: explain the option and collect an optional note */}
            {!sent && (
              <>
                <Typography variant="body1" color="text.secondary" paragraph>
                  An administrator can give you early access. Send them a request below, and you will get an email when it is granted.
                </Typography>
                <TextField
                  label="Note to the administrators (optional)"
                  placeholder="For example, which net you are setting up"
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
                Your request was sent to the administrators. You will get an email when it is granted.
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
              {sending ? 'Sending...' : 'Request early access'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default EarlyAccessRequestDialog;

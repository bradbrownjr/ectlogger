import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { checkInApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

interface IdentityVerifyDialogProps {
  checkIn: { id: number; callsign: string } | null;
  onClose: () => void;
  // Called with the updated check-in after a confirm/reject action commits,
  // so the caller can patch its local state without a full refetch.
  onVerified: (updatedCheckIn: any) => void;
}

// NCS/Logger action, opened by clicking the padlock icon on an authenticated
// net's check-in row. Shows the station's currently-valid TOTP code (plus the
// previous 30s window's code, since it can roll over mid-sentence while the
// operator reads it aloud) and lets NCS confirm or reject the match.
const IdentityVerifyDialog: React.FC<IdentityVerifyDialogProps> = ({ checkIn, onClose, onVerified }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [enrolled, setEnrolled] = useState(false);
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [previousCode, setPreviousCode] = useState<string | null>(null);

  useEffect(() => {
    if (!checkIn) return;
    setLoading(true);
    setError('');
    checkInApi.getExpectedCode(checkIn.id)
      .then(res => {
        setEnrolled(res.data.enrolled);
        setCurrentCode(res.data.current_code);
        setPreviousCode(res.data.previous_code);
      })
      .catch(err => setError(getErrorMessage(err, 'Could not load the expected code')))
      .finally(() => setLoading(false));
  }, [checkIn]);

  const submit = async (verified: boolean) => {
    if (!checkIn) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await checkInApi.verifyIdentity(checkIn.id, verified);
      onVerified(res.data);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the verification'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!checkIn} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Verify {checkIn?.callsign}'s Identity</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

        {!loading && !error && !enrolled && (
          <Alert severity="warning">
            {checkIn?.callsign} has not set up two-factor authentication, so there is no code to
            compare. Use your own judgment before confirming this station's identity.
          </Alert>
        )}

        {!loading && !error && enrolled && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ask {checkIn?.callsign} to read the 6-digit code from their authenticator app.
              Compare it to the code below.
            </Typography>
            <Typography variant="h3" align="center" sx={{ fontFamily: 'monospace', letterSpacing: 4, mb: 1 }}>
              {currentCode}
            </Typography>
            {previousCode && previousCode !== currentCode && (
              <Typography variant="body2" color="text.secondary" align="center">
                Just changed from <span style={{ fontFamily: 'monospace' }}>{previousCode}</span> — accept
                either if it rolled over mid-read.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          color="warning"
          onClick={() => submit(false)}
          disabled={loading || submitting}
        >
          Reject
        </Button>
        <Button
          variant="contained"
          onClick={() => submit(true)}
          disabled={loading || submitting}
        >
          Confirm Match
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default IdentityVerifyDialog;

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Typography, CircularProgress, Box, Button, TextField, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';

const VerifyMagicLink: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [error, setError] = useState<string>('');
  const [verifying, setVerifying] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const token = searchParams.get('token');
  const redirect = searchParams.get('redirect');

  const attemptVerify = async (code?: string) => {
    if (!token) {
      setError('No verification token provided');
      setVerifying(false);
      return;
    }

    // Already have a valid session in this browser -- clicking a stale/bookmarked
    // magic link shouldn't re-run login (and, for an admin, shouldn't surface an
    // MFA prompt that the still-live Navbar menu makes trivially skippable). Magic
    // links are meant to sign in a *different* browser/session; if this one is
    // already authenticated, just go where they were headed.
    if (isAuthenticated) {
      navigate(redirect || '/dashboard');
      return;
    }

    try {
      const response = await authApi.verifyMagicLink(token, code);
      const { login_status, access_token } = response.data;

      if (login_status === 'mfa_required') {
        // Admin account, MFA not satisfied yet -- the magic-link token was
        // deliberately not consumed, so this can be resubmitted with a code.
        setMfaRequired(true);
        setVerifying(false);
        return;
      }

      await login(access_token);
      navigate(login_status === 'mfa_setup_required' ? '/profile?tab=security&mfaRequired=1' : (redirect || '/dashboard'));
    } catch (err: any) {
      console.error('[VERIFY] Magic link verification failed:', err.response?.data);
      setError(getErrorMessage(err, mfaRequired ? 'Incorrect verification code.' : 'Invalid or expired magic link'));
      setVerifying(false);
      if (!mfaRequired) setMfaRequired(false);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    attemptVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount, regardless of dependency changes

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    attemptVerify(totpCode);
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {verifying ? (
          <>
            <CircularProgress size={60} sx={{ mb: 2 }} />
            <Typography variant="h5">Verifying your magic link...</Typography>
          </>
        ) : mfaRequired ? (
          <Box component="form" onSubmit={handleSubmitCode} sx={{ width: '100%' }}>
            <Typography variant="h5" gutterBottom align="center">
              Two-Factor Verification
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
              Enter the 6-digit code from your authenticator app to finish signing in.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              label="Verification Code"
              name="otp"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
              autoFocus
              inputProps={{ inputMode: 'numeric', maxLength: 10 }}
              disabled={submitting}
              sx={{ mb: 2 }}
              helperText="A backup code also works if you don't have your authenticator handy."
            />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={submitting}>
              {submitting ? <CircularProgress size={24} /> : 'Verify'}
            </Button>
          </Box>
        ) : isAuthenticated ? (
          // The link failed, but an existing session is still valid (e.g. an older
          // or already-used link clicked while signed in on this device).
          <>
            <Typography variant="h5" gutterBottom>
              You're already signed in
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              That magic link is no longer valid, but you're still signed in on this device.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
          </>
        ) : (
          <>
            <Typography variant="h5" color="error" gutterBottom>
              Verification Failed
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {error}
            </Typography>
            <Typography variant="body2" sx={{ mt: 2, mb: 3 }}>
              Magic links expire after a period of time. Request a new one to sign in.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/login')}>
              Return to Sign In
            </Button>
          </>
        )}
      </Box>
    </Container>
  );
};

export default VerifyMagicLink;

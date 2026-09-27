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
  // A genuine link that is only too old (410): offer a replacement in one click.
  const [expired, setExpired] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentTo, setResentTo] = useState<string | null>(null);
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
      if (!mfaRequired && err.response?.status === 410) setExpired(true);
      setError(getErrorMessage(err, mfaRequired ? 'Incorrect verification code.' : "This sign-in link isn't valid."));
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

  const handleResend = async () => {
    if (!token) return;
    setResending(true);
    try {
      const response = await authApi.resendMagicLink(token);
      setResentTo(response.data.email_hint);
    } catch (err: any) {
      setError(getErrorMessage(err, "We couldn't send a new link. Request one from the sign-in page."));
      setExpired(false);
    } finally {
      setResending(false);
    }
  };

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
        ) : resentTo ? (
          // ========== NEW LINK SENT ==========
          <>
            <Typography variant="h5" gutterBottom align="center">
              Check your email
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              We sent a new sign-in link to {resentTo}. Open it on this device to sign in.
            </Typography>
          </>
        ) : expired ? (
          // ========== EXPIRED LINK: one-click replacement ==========
          <>
            <Typography variant="h5" gutterBottom align="center">
              This sign-in link has expired
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
              We can email a new one to the same address.
            </Typography>
            <Button variant="contained" size="large" onClick={handleResend} disabled={resending}>
              {resending ? <CircularProgress size={24} /> : 'Send me a new link'}
            </Button>
          </>
        ) : (
          <>
            <Typography variant="h5" color="error" gutterBottom>
              This sign-in link didn't work
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {error}
            </Typography>
            <Typography variant="body2" sx={{ mt: 2, mb: 3 }}>
              Request a new one to sign in.
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

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLogo from '../components/AppLogo';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import { authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../utils/apiErrors';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  // 'magic-link' is the default/primary sign-in path. 'password' is the
  // fallback for when email delivery is down and a magic link can't be
  // retrieved at all.
  const [mode, setMode] = useState<'magic-link' | 'password'>('magic-link');

  const [email, setEmail] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicMessage, setMagicMessage] = useState('');
  const [magicError, setMagicError] = useState('');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // NOTE: Token verification is handled by VerifyMagicLink.tsx at /auth/verify route
  // This component only handles the login forms

  const handleRequestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLoading(true);
    setMagicError('');
    setMagicMessage('');

    try {
      await authApi.requestMagicLink(email);
      setMagicMessage('Check your email for a magic link to sign in! If you don\'t see it, check your spam folder.');
      setEmail('');
    } catch (err: any) {
      if (err?.message?.includes('ERR_CONNECTION_REFUSED') || err?.message?.includes('Network Error') || err?.code === 'ERR_NETWORK') {
        setMagicError('Cannot connect to server. Please ensure the backend is running and check your firewall/ad blocker settings.');
      } else if (err?.response?.status === 403) {
        setMagicError(getErrorMessage(err, 'Your account has been deactivated. Please contact an administrator.'));
      } else if (err?.response?.status === 429) {
        setMagicError(getErrorMessage(err, 'Too many requests. Please wait a bit and try again.'));
      } else {
        setMagicError('Failed to send magic link. Please check your ad blocker settings and try again.');
      }
    } finally {
      setMagicLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError('');

    try {
      const response = await authApi.passwordLogin(identifier, password, mfaRequired ? totpCode : undefined);
      const { login_status, access_token } = response.data;

      if (login_status === 'mfa_required') {
        setMfaRequired(true);
        setPasswordError('');
        return;
      }

      // 'ok' or 'mfa_setup_required' both carry a token -- an unenrolled
      // admin can still sign in, they just get routed to enrollment before
      // reaching any admin-only feature (see api.ts's response interceptor).
      await login(access_token);
      navigate(login_status === 'mfa_setup_required' ? '/profile?tab=security&mfaRequired=1' : '/dashboard');
    } catch (err: any) {
      if (mfaRequired) {
        setPasswordError(getErrorMessage(err, 'Incorrect verification code.'));
      } else if (err?.response?.status === 429) {
        setPasswordError(getErrorMessage(err, 'Too many failed attempts. Try again in a few minutes.'));
      } else if (err?.response?.status === 403) {
        setPasswordError(getErrorMessage(err, 'Your account has been deactivated. Please contact an administrator.'));
      } else {
        setPasswordError(getErrorMessage(err, 'Incorrect callsign/email or password'));
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, mb: 4 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <AppLogo size={40} variant="default" /> ECTLogger
          </Typography>
          <Typography variant="body1" gutterBottom align="center" color="text.secondary">
            Emergency Communications Team Net Logger
          </Typography>

          {mode === 'magic-link' ? (
            <Box component="form" onSubmit={handleRequestMagicLink} sx={{ mt: 3 }}>
              {magicMessage && <Alert severity="success" sx={{ mb: 2 }}>{magicMessage}</Alert>}
              {magicError && <Alert severity="error" sx={{ mb: 2 }}>{magicError}</Alert>}

              <TextField
                fullWidth
                label="Email Address"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={magicLoading}
                sx={{ mb: 2 }}
              />

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={magicLoading}
              >
                {magicLoading ? <CircularProgress size={24} /> : 'Send Magic Link'}
              </Button>

              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
                We'll send you a secure link to sign in.
              </Typography>

              <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary" align="center">
                Magic links are valid for 30 days, keeping you connected during extended emergency events.
              </Typography>

              <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary" align="center">
                Getting logged out sooner than expected? Bookmark the link from your email instead of retyping your address here &mdash; it stays valid for the full 30 days and signs you back in instantly, even if your browser clears cookies or you switch devices.
              </Typography>

              <Typography variant="body2" align="center" sx={{ mt: 3 }}>
                <Link component="button" type="button" onClick={() => setMode('password')} underline="hover">
                  Sign in with a password instead
                </Link>
              </Typography>
            </Box>
          ) : (
            <Box component="form" onSubmit={handlePasswordLogin} sx={{ mt: 3 }}>
              {passwordError && <Alert severity="error" sx={{ mb: 2 }}>{passwordError}</Alert>}
              {mfaRequired && !passwordError && (
                <Alert severity="info" sx={{ mb: 2 }}>Enter the 6-digit code from your authenticator app.</Alert>
              )}

              {!mfaRequired ? (
                <>
                  <TextField
                    fullWidth
                    label="Callsign or Email"
                    name="username"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoFocus
                    disabled={passwordLoading}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={passwordLoading}
                    sx={{ mb: 2 }}
                  />
                </>
              ) : (
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
                  disabled={passwordLoading}
                  sx={{ mb: 2 }}
                  helperText="A backup code also works if you don't have your authenticator handy."
                />
              )}

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={passwordLoading}
              >
                {passwordLoading ? <CircularProgress size={24} /> : mfaRequired ? 'Verify' : 'Sign In'}
              </Button>

              <Typography variant="body2" align="center" sx={{ mt: 3 }}>
                <Link
                  component="button"
                  type="button"
                  onClick={() => {
                    setMode('magic-link');
                    setMfaRequired(false);
                    setPassword('');
                    setTotpCode('');
                    setPasswordError('');
                  }}
                  underline="hover"
                >
                  Use a magic link instead
                </Link>
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;

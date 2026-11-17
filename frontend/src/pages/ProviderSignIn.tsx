// ========== PROVIDER SIGN-IN LANDING PAGE (/auth/provider) ==========
// Where the backend sends the browser after Google, Microsoft or another
// OpenID Connect provider (routers/sign_in_providers.py provider_callback):
// with ?code= to trade for a sign-in token, or ?error= when it didn't work.
// The code is single-use and good for two minutes, so it is traded at once
// and taken off the address bar.

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { signInProvidersApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import { signinErrorText, takeSigninReturn } from '../utils/signInProviders';

const ProviderSignIn: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const code = searchParams.get('code');
  const [error, setError] = useState<string | null>(code ? null : signinErrorText(searchParams.get('error')));
  // React's development double-run of effects would spend the code twice.
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    window.history.replaceState(null, '', '/auth/provider');
    (async () => {
      try {
        const response = await signInProvidersApi.exchange(code);
        const { login_status, access_token } = response.data;
        const returnTo = takeSigninReturn();
        await login(access_token);
        navigate(
          login_status === 'mfa_setup_required' ? '/profile?tab=security&mfaRequired=1' : (returnTo || '/dashboard'),
          { replace: true },
        );
      } catch (err) {
        setError(getErrorMessage(err, signinErrorText('failed')));
      }
    })();
  }, [code, login, navigate]);

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {error ? (
          <>
            {/* ========== DIDN'T SIGN IN ========== */}
            <Typography variant="h5" gutterBottom>Not signed in</Typography>
            <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>{error}</Alert>
            <Button variant="contained" onClick={() => navigate('/login', { replace: true })}>
              Back to sign-in
            </Button>
          </>
        ) : (
          <>
            <CircularProgress size={60} sx={{ mb: 2 }} />
            <Typography variant="h5">Signing you in…</Typography>
          </>
        )}
      </Box>
    </Container>
  );
};

export default ProviderSignIn;

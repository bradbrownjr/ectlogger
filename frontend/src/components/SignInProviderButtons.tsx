// ========== SIGN-IN PROVIDER BUTTONS ==========
// One button per Google, Microsoft or other OpenID Connect sign-in an admin
// turned on (Admin > Security). Shows nothing when none are on, so the sign-in
// page looks as it always did. Each button is a full page load to the
// provider; the provider sends the browser back to pages/ProviderSignIn.tsx.

import React, { useEffect, useState } from 'react';
import { Box, Button, Divider, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import MicrosoftIcon from '@mui/icons-material/Microsoft';
import KeyIcon from '@mui/icons-material/Key';
import { providerStartUrl, signInProvidersApi, SignInProviderPublic } from '../services/api';
import { rememberSigninReturn } from '../utils/signInProviders';

export const providerIcon = (kind: SignInProviderPublic['kind']) =>
  kind === 'google' ? <GoogleIcon /> : kind === 'microsoft' ? <MicrosoftIcon /> : <KeyIcon />;

interface Props {
  /** In-app path to return to after sign-in. */
  redirect: string | null;
}

const SignInProviderButtons: React.FC<Props> = ({ redirect }) => {
  const [providers, setProviders] = useState<SignInProviderPublic[]>([]);

  useEffect(() => {
    signInProvidersApi.list()
      .then((response) => setProviders(response.data))
      .catch(() => setProviders([]));  // the email sign-in below still works
  }, []);

  if (providers.length === 0) return null;

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {providers.map((p) => (
          <Button
            key={p.slug}
            fullWidth
            size="large"
            variant="outlined"
            color="inherit"
            startIcon={providerIcon(p.kind)}
            onClick={() => {
              rememberSigninReturn(redirect);
              window.location.assign(providerStartUrl(p.slug));
            }}
          >
            Sign in with {p.label}
          </Button>
        ))}
      </Box>
      <Divider sx={{ mt: 3 }}>
        <Typography variant="body2" color="text.secondary">or</Typography>
      </Divider>
    </Box>
  );
};

export default SignInProviderButtons;

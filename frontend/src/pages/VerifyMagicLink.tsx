import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Typography, CircularProgress, Box } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';

const VerifyMagicLink: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string>('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        console.error('[VERIFY] No token in URL');
        setError('No verification token provided');
        setVerifying(false);
        return;
      }

      try {
        console.log('[VERIFY] Starting magic link verification...');
        console.log('[VERIFY] Token from URL:', token.substring(0, 20) + '...');
        const response = await authApi.verifyMagicLink(token);
        console.log('[VERIFY] Verification successful!');
        console.log('[VERIFY] Access token received:', response.data.access_token.substring(0, 20) + '...');
        console.log('[VERIFY] Calling login...');
        await login(response.data.access_token);
        console.log('[VERIFY] Login complete, navigating to dashboard...');
        navigate('/dashboard');
      } catch (err: any) {
        console.error('[VERIFY] Verification failed:', err);
        console.error('[VERIFY] Error details:', err.response?.data);
        setError(err.response?.data?.detail || 'Invalid or expired magic link');
        setVerifying(false);
      }
    };

    verifyToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount, regardless of dependency changes

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {verifying ? (
          <>
            <CircularProgress size={60} sx={{ mb: 2 }} />
            <Typography variant="h5">Verifying your magic link...</Typography>
          </>
        ) : (
          <>
            <Typography variant="h5" color="error" gutterBottom>
              Verification Failed
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {error}
            </Typography>
            <Typography variant="body2" sx={{ mt: 2 }}>
              Please request a new magic link from the login page.
            </Typography>
          </>
        )}
      </Box>
    </Container>
  );
};

export default VerifyMagicLink;

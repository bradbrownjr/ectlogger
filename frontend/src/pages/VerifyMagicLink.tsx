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
        setError('No verification token provided');
        setVerifying(false);
        return;
      }

      try {
        const response = await authApi.verifyMagicLink(token);
        login(response.data.access_token, response.data.user);
        navigate('/dashboard');
      } catch (err: any) {
        console.error('Verification failed:', err);
        setError(err.response?.data?.detail || 'Invalid or expired magic link');
        setVerifying(false);
      }
    };

    verifyToken();
  }, [searchParams, navigate, login]);

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

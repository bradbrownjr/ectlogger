import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import { authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  // Check if there's a token in the URL (from magic link)
  React.useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleMagicLinkVerify(token);
    }
  }, [searchParams]);

  const handleMagicLinkVerify = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await authApi.verifyMagicLink(token);
      await login(response.data.access_token);
      navigate('/');
    } catch (err) {
      setError('Invalid or expired magic link. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await authApi.requestMagicLink(email);
      setMessage('Check your email for a magic link to sign in!');
      setEmail('');
    } catch (err) {
      setError('Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, mb: 4 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            📻 ECTLogger
          </Typography>
          <Typography variant="body1" gutterBottom align="center" color="text.secondary">
            Emergency Communications Team Net Logger
          </Typography>

          <Box component="form" onSubmit={handleRequestMagicLink} sx={{ mt: 3 }}>
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              sx={{ mb: 2 }}
            />

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Send Magic Link'}
            </Button>

            <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
              We'll send you a secure link to sign in. No password required!
            </Typography>
          </Box>

          {/* OAuth buttons would go here */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" align="center" color="text.secondary">
              OAuth providers (Google, Microsoft, GitHub) can be configured in settings
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;

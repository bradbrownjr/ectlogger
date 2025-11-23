import React, { useState } from 'react';
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

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // NOTE: Token verification is handled by VerifyMagicLink.tsx at /auth/verify route
  // This component only handles the login form

  const handleRequestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await authApi.requestMagicLink(email);
      setMessage('Check your email for a magic link to sign in! If you don\'t see it, check your spam folder.');
      setEmail('');
    } catch (err: any) {
      // Check if it's a connection error
      if (err?.message?.includes('ERR_CONNECTION_REFUSED') || err?.message?.includes('Network Error') || err?.code === 'ERR_NETWORK') {
        setError('Cannot connect to server. Please ensure the backend is running and check your firewall/ad blocker settings.');
      } else {
        setError('Failed to send magic link. Please check your ad blocker settings and try again.');
      }
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
            
            <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary" align="center">
              Magic links are valid for 30 days, keeping you connected during extended emergency events.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;

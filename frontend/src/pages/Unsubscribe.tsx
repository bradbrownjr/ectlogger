import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  EmailOutlined as EmailIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Undo as UndoIcon,
} from '@mui/icons-material';
import api from '../services/api';

/**
 * Unsubscribe Page - Handles one-click email unsubscribe
 * 
 * This page is accessed via email unsubscribe links.
 * It requires a token parameter and works without authentication.
 */
export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'resubscribed'>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resubscribing, setResubscribing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid unsubscribe link. No token provided.');
      return;
    }

    // Call the unsubscribe endpoint
    const unsubscribe = async () => {
      try {
        const response = await api.get(`/auth/unsubscribe?token=${token}`);
        setStatus('success');
        setMessage(response.data.message);
        setEmail(response.data.email || '');
      } catch (error: any) {
        setStatus('error');
        if (error.response?.status === 404) {
          setMessage('Invalid or expired unsubscribe link.');
        } else {
          setMessage(error.response?.data?.detail || 'Failed to unsubscribe. Please try again later.');
        }
      }
    };

    unsubscribe();
  }, [token]);

  const handleResubscribe = async () => {
    if (!token) return;
    
    setResubscribing(true);
    try {
      await api.post(`/auth/resubscribe?token=${token}`);
      setStatus('resubscribed');
      setMessage('Your email notifications have been re-enabled.');
    } catch (error: any) {
      setMessage(error.response?.data?.detail || 'Failed to re-subscribe. Please update your settings in your profile.');
    } finally {
      setResubscribing(false);
    }
  };

  const handleGoToProfile = () => {
    navigate('/profile');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <EmailIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Email Preferences
          </Typography>
        </Box>

        {/* Status Display */}
        {status === 'loading' && (
          <Box sx={{ py: 4 }}>
            <CircularProgress size={48} />
            <Typography sx={{ mt: 2 }}>Processing your request...</Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box sx={{ py: 2 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
              {message}
            </Alert>
            
            {email && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Email: {email}
              </Typography>
            )}
            
            <Typography variant="body1" sx={{ mb: 3 }}>
              You will no longer receive email notifications from ECTLogger.
              You can still log in and use all features of the application.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={resubscribing ? <CircularProgress size={16} /> : <UndoIcon />}
                onClick={handleResubscribe}
                disabled={resubscribing}
              >
                {resubscribing ? 'Processing...' : 'Undo - Re-enable Notifications'}
              </Button>
              
              <Button
                variant="text"
                onClick={handleGoToProfile}
              >
                Manage Notification Settings
              </Button>
            </Box>
          </Box>
        )}

        {status === 'resubscribed' && (
          <Box sx={{ py: 2 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
              {message}
            </Alert>
            
            <Typography variant="body1" sx={{ mb: 3 }}>
              You will continue to receive email notifications based on your preferences.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleGoToProfile}
              >
                Manage Notification Settings
              </Button>
              
              <Button
                variant="text"
                onClick={handleGoHome}
              >
                Go to Dashboard
              </Button>
            </Box>
          </Box>
        )}

        {status === 'error' && (
          <Box sx={{ py: 2 }}>
            <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {message}
            </Alert>
            
            <Typography variant="body1" sx={{ mb: 3 }}>
              If you're having trouble, you can manage your notification preferences
              by logging in and visiting your profile settings.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleGoToProfile}
              >
                Go to Profile Settings
              </Button>
              
              <Button
                variant="text"
                onClick={handleGoHome}
              >
                Go to Home
              </Button>
            </Box>
          </Box>
        )}

        {/* Footer */}
        <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            ECTLogger - Emergency Communications Team Net Logging
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}

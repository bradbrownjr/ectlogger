import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const ProfileSetupDialog: React.FC = () => {
  const { user, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    callsign: '',
  });

  useEffect(() => {
    // Check if user needs to complete profile
    if (user && (!user.name || !user.callsign)) {
      setOpen(true);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      await api.patch(`/users/${user?.id}`, formData);
      
      // Refresh user data
      const token = localStorage.getItem('token');
      if (token) {
        await login(token);
      }
      
      setOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown>
      <DialogTitle>Complete Your Profile</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Welcome! Please provide your name and call sign to continue. This information will be displayed to other users during net operations.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit} id="profile-setup-form">
          <TextField
            fullWidth
            label="Name *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
            required
            helperText="Your full name or preferred display name"
          />

          <TextField
            fullWidth
            label="Call Sign"
            value={formData.callsign}
            onChange={(e) => setFormData({ ...formData, callsign: e.target.value.toUpperCase() })}
            margin="normal"
            helperText="Amateur radio (e.g., KC1JMH) or GMRS (e.g., WRAT256) call sign (optional)"
            inputProps={{ style: { textTransform: 'uppercase' } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          type="submit"
          form="profile-setup-form"
          variant="contained"
          disabled={saving || !formData.name}
          fullWidth
        >
          {saving ? 'Saving...' : 'Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProfileSetupDialog;

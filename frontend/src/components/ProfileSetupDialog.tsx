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
import { getErrorMessage } from '../utils/apiErrors';
import { looksLikeEmailOrUrl, looksLikeUrl, NAME_FIELD_EMAIL_WARNING } from '../utils/nameFieldGuard';

const ProfileSetupDialog: React.FC = () => {
  const { user, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Which condition opened the dialog -- changes the copy and which fields
  // are shown. A spammy name is a hard block on an otherwise-complete
  // profile, not the "welcome, let's get set up" first-run case.
  const [reason, setReason] = useState<'incomplete' | 'spammy_name'>('incomplete');

  const [formData, setFormData] = useState({
    name: '',
    callsign: '',
    website_url: '',
  });

  useEffect(() => {
    if (!user) return;
    if (!user.name || !user.callsign) {
      setReason('incomplete');
      setFormData({ name: user.name || '', callsign: user.callsign || '', website_url: user.website_url || '' });
      setOpen(true);
    } else if (looksLikeEmailOrUrl(user.name)) {
      // A URL in the Name field is spammy and, worse, widens the callsign
      // column enough to force NCS to horizontally scroll the check-in list
      // (seen on account NB9D). Move it to the Website field instead of
      // just clearing it -- an email has nowhere to go, so leave that blank.
      setReason('spammy_name');
      setFormData({
        name: '',
        callsign: user.callsign || '',
        website_url: looksLikeUrl(user.name) ? user.name : (user.website_url || ''),
      });
      setOpen(true);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      await api.put('/users/me', formData);

      // Refresh user data
      const token = localStorage.getItem('token');
      if (token) {
        await login(token);
      }

      setOpen(false);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  const nameIsSpammy = looksLikeEmailOrUrl(formData.name);

  return (
    <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>{reason === 'spammy_name' ? "Let's Fix Your Name" : 'Complete Your Profile'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {reason === 'spammy_name'
            ? "Your Name field has an email address or a link in it. That's shown to everyone on the check-in list, and a long link there can force Net Control to scroll sideways to read it. Please enter your first name below — and if you'd like to share a link, there's a new Website field for that instead."
            : 'Welcome! Please provide your name and call sign to continue. This information will be displayed to other users during net operations.'}
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
            error={nameIsSpammy}
            helperText={nameIsSpammy ? NAME_FIELD_EMAIL_WARNING : "Your full name or preferred display name"}
          />

          {reason === 'incomplete' && (
            <TextField
              fullWidth
              label="Primary Call Sign"
              value={formData.callsign}
              onChange={(e) => setFormData({ ...formData, callsign: e.target.value.toUpperCase() })}
              margin="normal"
              helperText="Your primary Amateur Radio or GMRS call sign (optional). Additional call signs can be added later in your profile."
              inputProps={{ style: { textTransform: 'uppercase' } }}
            />
          )}

          {reason === 'spammy_name' && (
            <TextField
              fullWidth
              label="Website / YouTube Channel"
              value={formData.website_url}
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              margin="normal"
              helperText="Optional — shown on your profile popup, not the check-in list"
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          type="submit"
          form="profile-setup-form"
          variant="contained"
          disabled={saving || !formData.name || nameIsSpammy}
          fullWidth
        >
          {saving ? 'Saving...' : 'Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProfileSetupDialog;

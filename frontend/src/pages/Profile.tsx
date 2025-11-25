import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  IconButton,
  Chip,
  Stack,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Profile: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [newCallsign, setNewCallsign] = useState('');
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    callsign: user?.callsign || '',
    gmrs_callsign: user?.gmrs_callsign || '',
    callsigns: user?.callsigns || [],
    prefer_utc: user?.prefer_utc || false,
    email_notifications: user?.email_notifications ?? true,
    notify_net_start: user?.notify_net_start ?? true,
    notify_net_close: user?.notify_net_close ?? true,
    notify_net_reminder: user?.notify_net_reminder ?? false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);

    try {
      await api.put('/users/me', formData);
      
      // Refresh user data
      const token = localStorage.getItem('token');
      if (token) {
        await login(token);
      }
      
      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Profile Settings
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Update your name and callsign. This information will be displayed to other users instead of your email address.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>Profile updated successfully!</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
            required
            helperText="Your full name or preferred display name"
          />

          <TextField
            fullWidth
            label="Amateur Radio Call Sign"
            value={formData.callsign}
            onChange={(e) => setFormData({ ...formData, callsign: e.target.value.toUpperCase() })}
            margin="normal"
            helperText="Your FCC amateur radio callsign (e.g., KC1JMH)"
            inputProps={{ style: { textTransform: 'uppercase' } }}
          />

          <TextField
            fullWidth
            label="GMRS Call Sign"
            value={formData.gmrs_callsign}
            onChange={(e) => setFormData({ ...formData, gmrs_callsign: e.target.value.toUpperCase() })}
            margin="normal"
            helperText="Your FCC GMRS callsign (e.g., WROP123) - used for GMRS frequency nets"
            inputProps={{ style: { textTransform: 'uppercase' } }}
          />

          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Additional Callsigns
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add other callsigns you use (Amateur Radio, GMRS, tactical, etc.)
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="small"
                label="Add callsign"
                value={newCallsign}
                onChange={(e) => setNewCallsign(e.target.value.toUpperCase())}
                inputProps={{ style: { textTransform: 'uppercase' } }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newCallsign && !formData.callsigns.includes(newCallsign)) {
                      setFormData({ ...formData, callsigns: [...formData.callsigns, newCallsign] });
                      setNewCallsign('');
                    }
                  }
                }}
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => {
                  if (newCallsign && !formData.callsigns.includes(newCallsign)) {
                    setFormData({ ...formData, callsigns: [...formData.callsigns, newCallsign] });
                    setNewCallsign('');
                  }
                }}
                disabled={!newCallsign}
              >
                Add
              </Button>
            </Box>
            
            {formData.callsigns.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {formData.callsigns.map((cs) => (
                  <Chip
                    key={cs}
                    label={cs}
                    onDelete={() => {
                      setFormData({
                        ...formData,
                        callsigns: formData.callsigns.filter((c) => c !== cs)
                      });
                    }}
                    deleteIcon={<DeleteIcon />}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Box sx={{ mt: 3, mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.prefer_utc}
                  onChange={(e) => setFormData({ ...formData, prefer_utc: e.target.checked })}
                />
              }
              label="Display times in UTC"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
              Show all timestamps in UTC instead of your local timezone
            </Typography>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>
            Email Notifications
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Control which email notifications you receive for nets you're subscribed to.
          </Typography>

          <Box sx={{ ml: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.email_notifications}
                  onChange={(e) => setFormData({ ...formData, email_notifications: e.target.checked })}
                />
              }
              label="Enable email notifications"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
              Master switch for all email notifications (except login links)
            </Typography>

            <Box sx={{ ml: 2, opacity: formData.email_notifications ? 1 : 0.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.notify_net_start}
                    onChange={(e) => setFormData({ ...formData, notify_net_start: e.target.checked })}
                    disabled={!formData.email_notifications}
                  />
                }
                label="Net start notifications"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                Receive an email when a subscribed net goes active
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={formData.notify_net_close}
                    onChange={(e) => setFormData({ ...formData, notify_net_close: e.target.checked })}
                    disabled={!formData.email_notifications}
                  />
                }
                label="Net close notifications (with log)"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                Receive the net log when a subscribed net closes
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={formData.notify_net_reminder}
                    onChange={(e) => setFormData({ ...formData, notify_net_reminder: e.target.checked })}
                    disabled={!formData.email_notifications}
                  />
                }
                label="Net reminder (1 hour before)"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                Receive a reminder email 1 hour before scheduled nets start
              </Typography>
            </Box>
          </Box>

          <TextField
            fullWidth
            label="Email"
            value={user?.email}
            margin="normal"
            disabled
            helperText="Email cannot be changed"
          />

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || !formData.name}
              fullWidth
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/dashboard')}
              disabled={saving}
              fullWidth
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default Profile;

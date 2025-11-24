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
    callsigns: user?.callsigns || [],
    prefer_utc: user?.prefer_utc || false,
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
    <Container maxWidth="sm" sx={{ mt: 4 }}>
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
            label="Primary Call Sign"
            value={formData.callsign}
            onChange={(e) => setFormData({ ...formData, callsign: e.target.value.toUpperCase() })}
            margin="normal"
            helperText="Your main callsign (Amateur Radio, GMRS, etc.)"
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

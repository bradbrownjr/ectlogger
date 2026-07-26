import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../../contexts/AuthContext';
import ProfileAvatarSection from './ProfileAvatarSection';
import type { ProfileFormData } from './profileFormTypes';

// ========== PROFILE TAB ==========
// Identity form: avatar section, name/callsign/gmrs/skywarn/location fields,
// and the additional-callsigns list. formData/handleSubmit are shared with
// SettingsTab (both submit the same PUT /users/me), so they're owned by the
// parent Profile page and passed in as props. Everything else (user,
// navigate) this tab looks up itself.

interface ProfileTabProps {
  formData: ProfileFormData;
  setFormData: (data: ProfileFormData) => void;
  newCallsign: string;
  setNewCallsign: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string;
  success: boolean;
}

const ProfileTab: React.FC<ProfileTabProps> = ({
  formData,
  setFormData,
  newCallsign,
  setNewCallsign,
  handleSubmit,
  saving,
  error,
  success,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Profile updated successfully!</Alert>}

      <ProfileAvatarSection />

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

        {/* Previous callsigns — read-only, auto-populated when primary callsign changes */}
        {user?.previous_callsigns && user.previous_callsigns.length > 0 && (
          <Box sx={{ mt: 0.5, mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Previous callsigns (your check-in history is retained for these):
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {user.previous_callsigns.map((cs) => (
                <Chip key={cs} label={cs} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
              ))}
            </Stack>
          </Box>
        )}

        <TextField
          fullWidth
          label="GMRS Call Sign"
          value={formData.gmrs_callsign}
          onChange={(e) => setFormData({ ...formData, gmrs_callsign: e.target.value.toUpperCase() })}
          margin="normal"
          helperText="Your FCC GMRS callsign (e.g., WROP123) - used for GMRS frequency nets"
          inputProps={{ style: { textTransform: 'uppercase' } }}
        />

        <TextField
          fullWidth
          label="SKYWARN Spotter Number"
          value={formData.skywarn_number}
          onChange={(e) => setFormData({ ...formData, skywarn_number: e.target.value.toUpperCase() })}
          margin="normal"
          helperText="Your NWS SKYWARN spotter ID (e.g., DFW-1234) - auto-fills when checking into SKYWARN nets"
          inputProps={{ style: { textTransform: 'uppercase' } }}
        />

        <TextField
          fullWidth
          label="Default Location"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value.toUpperCase() })}
          margin="normal"
          helperText="Your default location or Maidenhead grid square (e.g., FN43pp) - auto-fills when NCS checks you in"
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
    </>
  );
};

export default ProfileTab;

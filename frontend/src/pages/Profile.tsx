import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Chip,
  Stack,
  FormControlLabel,
  Switch,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BarChartIcon from '@mui/icons-material/BarChart';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import ProfileAvatarSection from '../components/profile/ProfileAvatarSection';
import ActivityTab from '../components/profile/ActivityTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`profile-tabpanel-${index}`}
      aria-labelledby={`profile-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const Profile: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [newCallsign, setNewCallsign] = useState('');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    const tab = parseInt(searchParams.get('tab') || '0', 10);
    setTabValue(isNaN(tab) ? 0 : tab);
  }, [searchParams]);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Swipe left/right to switch tabs on touch devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;
    const next = deltaX < 0 ? Math.min(tabValue + 1, 2) : Math.max(tabValue - 1, 0);
    setTabValue(next);
    setSearchParams(next > 0 ? { tab: String(next) } : {});
  };

  const [formData, setFormData] = useState({
    name: user?.name || '',
    callsign: user?.callsign || '',
    gmrs_callsign: user?.gmrs_callsign || '',
    callsigns: user?.callsigns || [],
    skywarn_number: user?.skywarn_number || '',
    location: user?.location || '',
    prefer_utc: user?.prefer_utc || false,
    show_activity_in_chat: user?.show_activity_in_chat ?? true,
    location_awareness: user?.location_awareness ?? false,
    email_notifications: user?.email_notifications ?? true,
    notify_net_start: user?.notify_net_start ?? true,
    notify_net_close: user?.notify_net_close ?? true,
    notify_net_reminder: user?.notify_net_reminder ?? false,
    notify_ics309: user?.notify_ics309 ?? false,
    notify_whats_new: user?.notify_whats_new ?? false,
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
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 } }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => {
              setTabValue(newValue);
              setSearchParams(newValue > 0 ? { tab: String(newValue) } : {});
            }}
            aria-label="profile tabs"
            variant="scrollable"
            scrollButtons={false}
            sx={{ '& .MuiTab-root': { minWidth: { xs: 80, sm: 120 }, px: { xs: 1.5, sm: 2 } } }}
          >
            <Tab
              icon={<PersonIcon />}
              iconPosition="start"
              label="Profile"
              id="profile-tab-0"
              aria-controls="profile-tabpanel-0"
            />
            <Tab
              icon={<SettingsIcon />}
              iconPosition="start"
              label="Settings"
              id="profile-tab-1"
              aria-controls="profile-tabpanel-1"
            />
            <Tab
              icon={<BarChartIcon />}
              iconPosition="start"
              label="Activity"
              id="profile-tab-2"
              aria-controls="profile-tabpanel-2"
            />
          </Tabs>
        </Box>

        {/* ========== Profile Tab ========== */}
        <TabPanel value={tabValue} index={0}>
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
        </TabPanel>

        {/* ========== Settings Tab ========== */}
        <TabPanel value={tabValue} index={1}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>Settings updated successfully!</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <Box sx={{ mt: 1, mb: 2 }}>
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

            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.show_activity_in_chat}
                    onChange={(e) => setFormData({ ...formData, show_activity_in_chat: e.target.checked })}
                  />
                }
                label="Show activity in chat"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                Display check-in/out and net events as system messages in chat (IRC-style)
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.location_awareness}
                    onChange={(e) => setFormData({ ...formData, location_awareness: e.target.checked })}
                  />
                }
                label="Enable location awareness"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                Show your Maidenhead grid square in the navbar and use it to auto-fill location on check-ins.
                Your browser will prompt for location permission.
              </Typography>
              {formData.location_awareness && user?.live_location && (
                <Box sx={{ ml: 4, mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Current GPS-derived location: <strong>{user.live_location}</strong>
                    {user.live_location_updated && (
                      <> (last updated {new Date(user.live_location_updated).toLocaleString()})</>
                    )}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={async () => {
                      try {
                        await api.put('/users/me/location', { location: '' });
                        const token = localStorage.getItem('token');
                        if (token) await login(token);
                      } catch (err) {
                        console.error('Failed to clear live location', err);
                      }
                    }}
                  >
                    Clear GPS location
                  </Button>
                </Box>
              )}
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

                {/* ICS-309 format option - nested under close notifications */}
                <Box sx={{ ml: 4, opacity: formData.notify_net_close && formData.email_notifications ? 1 : 0.5 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.notify_ics309}
                        onChange={(e) => setFormData({ ...formData, notify_ics309: e.target.checked })}
                        disabled={!formData.email_notifications || !formData.notify_net_close}
                        size="small"
                      />
                    }
                    label="Use ICS-309 format"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                    Format net logs as ICS-309 Communications Log (FEMA standard)
                  </Typography>
                </Box>

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

                {/* ========== "What's New" digest opt-in (off by default) ==========
                    Sends a single daily email at 8 AM (user's local TZ, PST fallback)
                    summarizing platform updates from the previous day. */}
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.notify_whats_new}
                      onChange={(e) => setFormData({ ...formData, notify_whats_new: e.target.checked })}
                      disabled={!formData.email_notifications}
                    />
                  }
                  label="What's New emails"
                />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                  Get a daily 8 AM digest of new ECTLogger features and fixes (sent only on days with updates)
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
        </TabPanel>

        {/* ========== Activity Tab ========== */}
        <TabPanel value={tabValue} index={2}>
          <ActivityTab />
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default Profile;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  FormControlLabel,
  Switch,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import api from '../../services/api';
import type { ProfileFormData } from './profileFormTypes';
import ThemeSwatchPicker from '../ThemeSwatchPicker';
import { clearNetViewLayoutPrefs } from '../../utils/localStorageKeys';

// ========== SETTINGS TAB ==========
// Display/notification toggle switches. formData/handleSubmit are shared
// with ProfileTab (both submit the same PUT /users/me), so they're owned by
// the parent Profile page and passed in as props. Everything else (user,
// login, navigate) this tab looks up itself.

interface SettingsTabProps {
  formData: ProfileFormData;
  setFormData: (data: ProfileFormData) => void;
  handleSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string;
  success: boolean;
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  formData,
  setFormData,
  handleSubmit,
  saving,
  error,
  success,
}) => {
  const { user, login } = useAuth();
  const { mode, toggleColorMode, setPreviewThemeKey } = useThemeMode();
  const navigate = useNavigate();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Reverts to the user's actually-saved theme (or the system default) the
  // moment this tab goes away - whether by switching Profile tabs or
  // navigating off the page entirely - so an unsaved preview never lingers.
  useEffect(() => () => setPreviewThemeKey(undefined), [setPreviewThemeKey]);

  const handleResetLayout = () => {
    clearNetViewLayoutPrefs();
    setResetConfirmOpen(false);
    setResetDone(true);
  };

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Settings updated successfully!</Alert>}

      <Box component="form" onSubmit={handleSubmit}>
        <Typography variant="h6" gutterBottom>
          Appearance
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose a color theme for your account, or follow whatever the system default is set to.
          </Typography>
          <ThemeSwatchPicker
            value={formData.theme}
            onSelect={(key) => {
              setFormData({ ...formData, theme: key });
              setPreviewThemeKey(key);
            }}
            allowSystemDefault
            allowCustom={false}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Applies instantly as a preview — click Save Changes to keep it, or leave without saving to revert.
          </Typography>

          <FormControlLabel
            sx={{ mt: 2 }}
            control={<Switch checked={mode === 'dark'} onChange={toggleColorMode} />}
            label="Dark mode"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
            Switch between light and dark display. Applies immediately — also available from the navbar icon.
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

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

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" gutterBottom>
          Net View Layout
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Panel positions, sizes, and whether Chat, Activity Log, Script, Announcements,
          Notes, and the Map are docked, floating, minimized, or popped out are all
          remembered per device. If a net's layout gets into a state you don't like,
          reset it back to defaults here.
        </Typography>
        <Button
          variant="outlined"
          color="warning"
          onClick={() => setResetConfirmOpen(true)}
        >
          Reset Net View Layout
        </Button>

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

      <Dialog open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)}>
        <DialogTitle>Reset Net View Layout?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This clears every remembered panel position, size, dock state, minimized
            state, and resize ratio for Net View on this device — Chat, Activity Log,
            Script, Announcements, Notes, the Map, and the check-in list. It doesn't
            affect any other settings, and only applies to this device. This can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmOpen(false)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={handleResetLayout}>
            Reset Layout
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={resetDone}
        autoHideDuration={4000}
        onClose={() => setResetDone(false)}
        message="Net View layout reset to defaults"
      />
    </>
  );
};

export default SettingsTab;

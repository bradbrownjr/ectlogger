import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material';
import type { ProfileFormData } from './profileFormTypes';

// ========== NOTIFICATIONS TAB ==========
// Email notification toggles, split out of Settings into their own tab as
// the list grew. formData/handleSubmit are shared with ProfileTab and
// SettingsTab (all three submit the same PUT /users/me), so they're owned
// by the parent Profile page and passed in as props. Room to grow: other
// notification channels (push, SMS, etc.) belong here as the app adds them.

interface NotificationsTabProps {
  formData: ProfileFormData;
  setFormData: (data: ProfileFormData) => void;
  handleSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string;
  success: boolean;
}

const NotificationsTab: React.FC<NotificationsTabProps> = ({
  formData,
  setFormData,
  handleSubmit,
  saving,
  error,
  success,
}) => {
  const navigate = useNavigate();

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Settings updated successfully!</Alert>}

      <Box component="form" onSubmit={handleSubmit}>
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

export default NotificationsTab;

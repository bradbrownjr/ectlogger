import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Switch,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import api from '../../services/api';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AdminMaintenanceTab: React.FC<Props> = ({ showSnackbar }) => {
  const [maintenanceBanner, setMaintenanceBanner] = useState({
    enabled: false,
    message: '',
    dismissible: true,
    scheduledStart: '',
    scheduledEnd: '',
  });
  const [maintenanceBannerSaving, setMaintenanceBannerSaving] = useState(false);

  // Convert ISO datetime string from API to datetime-local input format (YYYY-MM-DDTHH:mm)
  const isoToLocalInput = (iso: string | null | undefined): string => {
    if (!iso) return '';
    return iso.slice(0, 16);
  };

  useEffect(() => {
    api.get('/settings').then((r) => {
      setMaintenanceBanner({
        enabled: r.data.maintenance_banner_enabled ?? false,
        message: r.data.maintenance_banner_message ?? '',
        dismissible: r.data.maintenance_banner_dismissible ?? true,
        scheduledStart: isoToLocalInput(r.data.maintenance_banner_scheduled_start),
        scheduledEnd: isoToLocalInput(r.data.maintenance_banner_scheduled_end),
      });
    }).catch((err) => console.error('Failed to fetch settings:', err));
  }, []);

  const handleSaveMaintenanceBanner = async () => {
    setMaintenanceBannerSaving(true);
    try {
      // Convert datetime-local strings back to ISO 8601 UTC for the API
      const toIso = (local: string) => (local ? local + ':00Z' : null);
      await api.put('/settings', {
        maintenance_banner_enabled: maintenanceBanner.enabled,
        maintenance_banner_message: maintenanceBanner.message || null,
        maintenance_banner_dismissible: maintenanceBanner.dismissible,
        maintenance_banner_scheduled_start: toIso(maintenanceBanner.scheduledStart),
        maintenance_banner_scheduled_end: toIso(maintenanceBanner.scheduledEnd),
      });
      showSnackbar('Maintenance banner settings saved', 'success');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save maintenance banner settings';
      showSnackbar(message, 'error');
    } finally {
      setMaintenanceBannerSaving(false);
    }
  };

  return (
    <>
      {/* ========== TAB 5: MAINTENANCE BANNER ========== */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          <BuildIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
          Maintenance Banner
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Banner toggle card */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>Banner Settings</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              When active, a sitewide warning banner is shown to all visitors — including logged-out users.
              The banner re-checks its state every 60 seconds, so scheduled start/end times take effect
              without requiring a page reload. All times are UTC.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* On/off toggle */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body1">Enable banner</Typography>
                  <Typography variant="caption" color="text.secondary">
                    When on, the banner is visible immediately (subject to scheduled window if set).
                  </Typography>
                </Box>
                <Switch
                  checked={maintenanceBanner.enabled}
                  onChange={(e) => setMaintenanceBanner({ ...maintenanceBanner, enabled: e.target.checked })}
                />
              </Box>

              {/* Message */}
              <TextField
                label="Banner message"
                multiline
                minRows={2}
                value={maintenanceBanner.message}
                onChange={(e) => setMaintenanceBanner({ ...maintenanceBanner, message: e.target.value })}
                helperText="Leave blank to show the default message."
                fullWidth
                inputProps={{ maxLength: 500 }}
              />

              {/* Dismissible toggle */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body1">Dismissible</Typography>
                  <Typography variant="caption" color="text.secondary">
                    When on, users can close the banner. When off, the banner persists until it is disabled.
                  </Typography>
                </Box>
                <Switch
                  checked={maintenanceBanner.dismissible}
                  onChange={(e) => setMaintenanceBanner({ ...maintenanceBanner, dismissible: e.target.checked })}
                />
              </Box>

              {/* Scheduled window */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  label="Scheduled start (UTC)"
                  type="datetime-local"
                  value={maintenanceBanner.scheduledStart}
                  onChange={(e) => setMaintenanceBanner({ ...maintenanceBanner, scheduledStart: e.target.value })}
                  helperText="Banner becomes active at this time (leave blank = immediately when enabled)."
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1, minWidth: 220 }}
                />
                <TextField
                  label="Scheduled end (UTC)"
                  type="datetime-local"
                  value={maintenanceBanner.scheduledEnd}
                  onChange={(e) => setMaintenanceBanner({ ...maintenanceBanner, scheduledEnd: e.target.value })}
                  helperText="Banner automatically clears at this time (leave blank = stays until manually disabled)."
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1, minWidth: 220 }}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleSaveMaintenanceBanner}
                  disabled={maintenanceBannerSaving}
                  startIcon={maintenanceBannerSaving ? <CircularProgress size={20} /> : null}
                >
                  {maintenanceBannerSaving ? 'Saving...' : 'Save Settings'}
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Server-side documentation card */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>Server-Side Maintenance Page</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              For full outages (app down, database unavailable), use the server-side maintenance page
              via SSH. The banner above cannot help when the app itself is not running.
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Requires SSH access to the server. Run the following commands from the install directory:
            </Alert>
            <Box
              component="pre"
              sx={{
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
{`# Enable maintenance mode (serves static maintenance.html via Caddy)
./run --maintenance on

# Enable with a custom message and ETA (writes maintenance.json sidecar)
./run --maintenance on --message "Deploying update" --eta "2026-06-11 20:00 UTC"

# Disable maintenance mode
./run --maintenance off`}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </>
  );
};

export default AdminMaintenanceTab;

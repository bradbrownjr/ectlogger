import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  TextField,
  Switch,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import HistoryIcon from '@mui/icons-material/History';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import api from '../../services/api';

interface Fail2BanStatus {
  installed: boolean;
  running: boolean;
  jail_enabled: boolean;
  currently_banned: number;
  total_banned: number;
  banned_ips: string[];
  log_file_configured: boolean;
  log_file_path: string | null;
  max_retries: number;
  find_time: number;
  ban_time: number;
}

interface SecurityLogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  ip: string | null;
}

interface SecurityInfo {
  fail2ban: Fail2BanStatus;
  recent_auth_events: SecurityLogEntry[];
}

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AdminSecurityTab: React.FC<Props> = ({ showSnackbar }) => {
  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  const [scheduleSettings, setScheduleSettings] = useState({
    schedule_min_account_age_days: 7,
    schedule_min_net_participations: 1,
    schedule_max_per_day: 5,
  });
  const [scheduleSettingsLoading, setScheduleSettingsLoading] = useState(false);
  const [scheduleSettingsSaving, setScheduleSettingsSaving] = useState(false);

  const [sessionSettings, setSessionSettings] = useState({
    session_lifetime_days: 90,
    session_rolling_renewal: true,
  });
  const [sessionSettingsSaving, setSessionSettingsSaving] = useState(false);

  const fetchSecurityInfo = async () => {
    setSecurityLoading(true);
    try {
      const response = await api.get('/security/info');
      setSecurityInfo(response.data);
    } catch (error) {
      console.error('Failed to fetch security info:', error);
    } finally {
      setSecurityLoading(false);
    }
  };

  const fetchSettings = async () => {
    setScheduleSettingsLoading(true);
    try {
      const response = await api.get('/settings');
      setScheduleSettings({
        schedule_min_account_age_days: response.data.schedule_min_account_age_days ?? 7,
        schedule_min_net_participations: response.data.schedule_min_net_participations ?? 1,
        schedule_max_per_day: response.data.schedule_max_per_day ?? 5,
      });
      setSessionSettings({
        session_lifetime_days: response.data.session_lifetime_days ?? 90,
        session_rolling_renewal: response.data.session_rolling_renewal ?? true,
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setScheduleSettingsLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityInfo();
    fetchSettings();
  }, []);

  const handleUnbanIp = async (ip: string) => {
    try {
      await api.post(`/security/unban/${ip}`);
      showSnackbar(`IP ${ip} has been unbanned`, 'success');
      fetchSecurityInfo();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to unban IP';
      showSnackbar(message, 'error');
    }
  };

  const handleSaveScheduleSettings = async () => {
    setScheduleSettingsSaving(true);
    try {
      await api.put('/settings', scheduleSettings);
      showSnackbar('Schedule creation settings saved', 'success');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save settings';
      showSnackbar(message, 'error');
    } finally {
      setScheduleSettingsSaving(false);
    }
  };

  const handleSaveSessionSettings = async () => {
    setSessionSettingsSaving(true);
    try {
      await api.put('/settings', sessionSettings);
      showSnackbar('Session settings saved', 'success');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save session settings';
      showSnackbar(message, 'error');
    } finally {
      setSessionSettingsSaving(false);
    }
  };

  return (
    <>
      {/* ========== SECURITY TAB ========== */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          <SecurityIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
          Security & Fail2Ban
        </Typography>
        <Button
          startIcon={securityLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
          onClick={fetchSecurityInfo}
          disabled={securityLoading}
        >
          Refresh
        </Button>
      </Box>

      {securityLoading && !securityInfo ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : securityInfo ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Fail2Ban Status Card */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <ShieldIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Fail2Ban Status
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                <Chip
                  icon={securityInfo.fail2ban.installed ? <CheckCircleIcon /> : <ErrorIcon />}
                  label={securityInfo.fail2ban.installed ? 'Installed' : 'Not Installed'}
                  color={securityInfo.fail2ban.installed ? 'success' : 'error'}
                />
                <Chip
                  icon={securityInfo.fail2ban.running ? <CheckCircleIcon /> : <ErrorIcon />}
                  label={securityInfo.fail2ban.running ? 'Running' : 'Not Running'}
                  color={securityInfo.fail2ban.running ? 'success' : 'error'}
                />
                <Chip
                  icon={securityInfo.fail2ban.jail_enabled ? <CheckCircleIcon /> : <WarningIcon />}
                  label={securityInfo.fail2ban.jail_enabled ? 'ECTLogger Jail Active' : 'Jail Not Active'}
                  color={securityInfo.fail2ban.jail_enabled ? 'success' : 'warning'}
                />
                <Chip
                  icon={securityInfo.fail2ban.log_file_configured ? <CheckCircleIcon /> : <WarningIcon />}
                  label={securityInfo.fail2ban.log_file_configured ? 'Logging Enabled' : 'Logging Not Configured'}
                  color={securityInfo.fail2ban.log_file_configured ? 'success' : 'warning'}
                />
              </Box>

              {!securityInfo.fail2ban.installed && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Fail2Ban is not installed. See FAIL2BAN.md for installation instructions.
                </Alert>
              )}

              {securityInfo.fail2ban.installed && !securityInfo.fail2ban.jail_enabled && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Fail2Ban is installed but the ECTLogger jail is not active. Check /etc/fail2ban/jail.d/ectlogger.conf
                </Alert>
              )}

              {securityInfo.fail2ban.jail_enabled && (
                <>
                  <Box sx={{ display: 'flex', gap: 4, mt: 2, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography variant="h4" color="error.main">
                        {securityInfo.fail2ban.currently_banned}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Currently Banned
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h4" color="text.secondary">
                        {securityInfo.fail2ban.total_banned}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Banned (All Time)
                      </Typography>
                    </Box>
                  </Box>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <strong>Ban Settings:</strong> After {securityInfo.fail2ban.max_retries} failed login attempts within {Math.round(securityInfo.fail2ban.find_time / 60)} minutes, the IP is banned for {Math.round(securityInfo.fail2ban.ban_time / 60)} minutes.
                    {' '}Settings can be adjusted in <code>/etc/fail2ban/jail.d/ectlogger.conf</code>
                  </Alert>
                </>
              )}

              {securityInfo.fail2ban.log_file_path && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Log file: <code>{securityInfo.fail2ban.log_file_path}</code>
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Banned IPs - always show when jail is enabled */}
          {securityInfo.fail2ban.jail_enabled && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <BlockIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Currently Banned IPs
                </Typography>
                {securityInfo.fail2ban.banned_ips.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No IPs are currently banned. IPs are automatically unbanned after {Math.round(securityInfo.fail2ban.ban_time / 60)} minutes.
                  </Typography>
                ) : (
                  <>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      These IPs are blocked from accessing ECTLogger. They will be automatically unbanned after the ban period expires,
                      or you can manually unban them using the button below.
                    </Alert>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>IP Address</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {securityInfo.fail2ban.banned_ips.map((ip) => (
                            <TableRow key={ip}>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {ip}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip size="small" label="Banned" color="error" icon={<BlockIcon />} />
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="success"
                                  startIcon={<LockOpenIcon />}
                                  onClick={() => handleUnbanIp(ip)}
                                >
                                  Unban
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                      To unban via command line: <code>sudo fail2ban-client set ectlogger unbanip IP_ADDRESS</code>
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Security Events */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <HistoryIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Recent Authentication Events
              </Typography>
              {securityInfo.recent_auth_events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent authentication events found.
                </Typography>
              ) : (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Level</TableCell>
                        <TableCell>Message</TableCell>
                        <TableCell>IP</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {securityInfo.recent_auth_events.map((event, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {event.timestamp}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={event.level}
                              color={
                                event.level === 'ERROR' ? 'error' :
                                event.level === 'WARNING' ? 'warning' :
                                event.level === 'INFO' ? 'info' : 'default'
                              }
                              icon={
                                event.level === 'ERROR' ? <ErrorIcon /> :
                                event.level === 'WARNING' ? <WarningIcon /> :
                                <InfoIcon />
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                              {event.message}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {event.ip && (
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                {event.ip}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* Schedule Creation Limits Card */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <ShieldIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Schedule Creation Limits
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Configure requirements for non-admin users to create schedules. Admins bypass all restrictions.
              </Typography>

              {scheduleSettingsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <TextField
                    label="Minimum Account Age (days)"
                    type="number"
                    value={scheduleSettings.schedule_min_account_age_days}
                    onChange={(e) => setScheduleSettings({
                      ...scheduleSettings,
                      schedule_min_account_age_days: parseInt(e.target.value) || 0
                    })}
                    inputProps={{ min: 0, max: 365 }}
                    helperText="New accounts must wait this many days before creating schedules. Set to 0 to disable."
                    fullWidth
                  />
                  <TextField
                    label="Minimum Net Participations"
                    type="number"
                    value={scheduleSettings.schedule_min_net_participations}
                    onChange={(e) => setScheduleSettings({
                      ...scheduleSettings,
                      schedule_min_net_participations: parseInt(e.target.value) || 0
                    })}
                    inputProps={{ min: 0, max: 100 }}
                    helperText="Users must have checked in to this many nets before creating schedules. Set to 0 to disable."
                    fullWidth
                  />
                  <TextField
                    label="Maximum Schedules Per Day"
                    type="number"
                    value={scheduleSettings.schedule_max_per_day}
                    onChange={(e) => setScheduleSettings({
                      ...scheduleSettings,
                      schedule_max_per_day: parseInt(e.target.value) || 0
                    })}
                    inputProps={{ min: 0, max: 100 }}
                    helperText="Maximum schedules a user can create in one day. Set to 0 for unlimited."
                    fullWidth
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      onClick={handleSaveScheduleSettings}
                      disabled={scheduleSettingsSaving}
                      startIcon={scheduleSettingsSaving ? <CircularProgress size={20} /> : null}
                    >
                      {scheduleSettingsSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Session Settings Card */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SecurityIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Session Settings
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Control how long user sessions last and whether they renew automatically. Changes apply to newly issued tokens only — existing sessions keep their current expiry.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Session Lifetime (days)"
                  type="number"
                  value={sessionSettings.session_lifetime_days}
                  onChange={(e) => setSessionSettings({
                    ...sessionSettings,
                    session_lifetime_days: Math.max(1, parseInt(e.target.value) || 1),
                  })}
                  inputProps={{ min: 1, max: 365 }}
                  helperText="How long a login session lasts before the user must re-authenticate. Default: 90 days."
                  fullWidth
                />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body1">Rolling renewal</Typography>
                    <Typography variant="caption" color="text.secondary">
                      When enabled, sessions with fewer than 7 days remaining are silently refreshed on each request, so active users are never logged out.
                    </Typography>
                  </Box>
                  <Switch
                    checked={sessionSettings.session_rolling_renewal}
                    onChange={(e) => setSessionSettings({
                      ...sessionSettings,
                      session_rolling_renewal: e.target.checked,
                    })}
                  />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    onClick={handleSaveSessionSettings}
                    disabled={sessionSettingsSaving}
                    startIcon={sessionSettingsSaving ? <CircularProgress size={20} /> : null}
                  >
                    {sessionSettingsSaving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      ) : (
        <Alert severity="error">
          Failed to load security information. Make sure you have admin access.
        </Alert>
      )}
    </>
  );
};

export default AdminSecurityTab;

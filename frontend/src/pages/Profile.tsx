import React, { useState, useEffect } from 'react';
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
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../contexts/AuthContext';
import api, { statisticsApi } from '../services/api';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [newCallsign, setNewCallsign] = useState('');
  const [userStats, setUserStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  
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
  });

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        const response = await statisticsApi.getUserStats();
        setUserStats(response.data);
      } catch (err) {
        console.error('Failed to fetch user stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchUserStats();
  }, []);

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
      <Paper sx={{ p: 4 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={(_, newValue) => setTabValue(newValue)}
            aria-label="profile tabs"
          >
            <Tab 
              icon={<SettingsIcon />} 
              iconPosition="start" 
              label="Settings" 
              id="profile-tab-0"
              aria-controls="profile-tabpanel-0"
            />
            <Tab 
              icon={<BarChartIcon />} 
              iconPosition="start" 
              label="Activity" 
              id="profile-tab-1"
              aria-controls="profile-tabpanel-1"
            />
          </Tabs>
        </Box>

        {/* Settings Tab */}
        <TabPanel value={tabValue} index={0}>
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
        </TabPanel>

        {/* Activity Tab */}
        <TabPanel value={tabValue} index={1}>
          {statsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : userStats ? (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="primary">
                        {userStats.total_check_ins}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Check-ins
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="primary">
                        {userStats.nets_participated}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Nets Joined
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="primary">
                        {userStats.nets_as_ncs}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        As NCS
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="primary">
                        {userStats.last_30_days_check_ins}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Last 30 Days
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {userStats.frequent_nets && userStats.frequent_nets.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <EmojiEventsIcon color="warning" />
                    <Typography variant="h6">Your Favorite Nets</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Nets you check into the most.
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Net Name</TableCell>
                          <TableCell align="right">Check-ins</TableCell>
                          <TableCell align="right">Participation Rate</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {userStats.frequent_nets.slice(0, 5).map((net: any, index: number) => (
                          <TableRow 
                            key={net.net_name} 
                            hover
                            sx={{ 
                              backgroundColor: index === 0 ? 'rgba(255, 215, 0, 0.1)' : 'inherit',
                            }}
                          >
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {index === 0 && <EmojiEventsIcon sx={{ color: 'gold', fontSize: 20 }} />}
                                {index === 1 && <EmojiEventsIcon sx={{ color: 'silver', fontSize: 20 }} />}
                                {index === 2 && <EmojiEventsIcon sx={{ color: '#CD7F32', fontSize: 20 }} />}
                                {net.net_name}
                              </Box>
                            </TableCell>
                            <TableCell align="right">{net.check_ins}</TableCell>
                            <TableCell align="right">
                              {net.participation_rate ? `${(net.participation_rate * 100).toFixed(0)}%` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </>
          ) : (
            <Typography color="text.secondary">
              No activity statistics available yet. Check into some nets to build your history!
            </Typography>
          )}
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default Profile;

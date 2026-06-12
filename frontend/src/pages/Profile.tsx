import React, { useState, useEffect, useCallback, useRef } from 'react';
import { displayCallsign } from '../utils/userDisplay';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuth } from '../contexts/AuthContext';
import api, { statisticsApi } from '../services/api';
import { exportElementToPdf } from '../utils/pdfExport';
import UserAvatar from '../components/UserAvatar';

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

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve) => { image.onload = () => resolve(); });
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas is empty')), 'image/jpeg', 0.95);
  });
}

const Profile: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [newCallsign, setNewCallsign] = useState('');
  const [userStats, setUserStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [netDrillDown, setNetDrillDown] = useState<{ title: string; nets: any[] } | null>(null);

  useEffect(() => {
    const tab = parseInt(searchParams.get('tab') || '0', 10);
    setTabValue(isNaN(tab) ? 0 : tab);
  }, [searchParams]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
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

  // Crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleFavoriteNetClick = (net: any) => {
    if (netDrillDown?.title === net.net_name) {
      setNetDrillDown(null);
      return;
    }
    const sessions = ((userStats?.nets_participated_list as any[]) || [])
      .filter((p: any) =>
        net.template_id != null
          ? p.template_id === net.template_id
          : p.net_name === net.net_name && p.template_id == null
      )
      .sort((a: any, b: any) =>
        new Date(b.last_check_in).getTime() - new Date(a.last_check_in).getTime()
      );
    setNetDrillDown({ title: net.net_name, nets: sessions });
  };

  // Handle PDF export for activity stats
  const handleExportActivityPdf = async () => {
    setExportingPdf(true);
    try {
      const callsign = displayCallsign(user) || 'User';
      await exportElementToPdf('activity-stats-content', {
        filename: `${callsign.replace(/[^a-zA-Z0-9]/g, '_')}_Activity_Stats`,
        orientation: 'landscape',
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  // File selected → read as data URL and open crop dialog
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // Crop confirmed → extract pixels via canvas → upload
  const handleCropConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setAvatarError(null);
    setAvatarUploading(true);
    setCropDialogOpen(false);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const form = new FormData();
      form.append('file', blob, 'avatar.jpg');
      await api.post('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const token = localStorage.getItem('token');
      if (token) await login(token);
    } catch (err: any) {
      setAvatarError(err.response?.data?.detail || 'Upload failed.');
    } finally {
      setAvatarUploading(false);
      setImageSrc(null);
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      await api.delete('/users/me/avatar');
      const token = localStorage.getItem('token');
      if (token) await login(token);
    } catch (err: any) {
      setAvatarError('Failed to remove photo.');
    } finally {
      setAvatarUploading(false);
    }
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

          {/* Profile photo section */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, p: 3, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <UserAvatar avatarUrl={(user as any)?.avatar_url} callsign={user?.callsign} name={user?.name} size={120} />
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Profile Photo</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
              {(user as any)?.avatar_url?.startsWith('/api/avatars/')
                ? 'Using uploaded photo'
                : 'Using Gravatar if available, otherwise your initials'}
            </Typography>
            {avatarError && <Alert severity="error" sx={{ mb: 1, py: 0, width: '100%' }}>{avatarError}</Alert>}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
              />
              <Button
                variant="outlined"
                startIcon={avatarUploading ? <CircularProgress size={16} /> : <PhotoCameraIcon />}
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {(user as any)?.avatar_url?.startsWith('/api/avatars/') ? 'Replace Photo' : 'Upload Photo'}
              </Button>
              {(user as any)?.avatar_url?.startsWith('/api/avatars/') && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleAvatarDelete}
                  disabled={avatarUploading}
                >
                  Remove
                </Button>
              )}
            </Stack>
          </Box>

          {/* ========== CROP DIALOG ========== */}
          <Dialog open={cropDialogOpen} onClose={() => setCropDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Crop Profile Photo</DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              {imageSrc && (
                <>
                  <Box sx={{ position: 'relative', width: '100%', height: 360, bgcolor: 'black' }}>
                    <Cropper
                      image={imageSrc}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      cropShape="round"
                      showGrid={false}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                    />
                  </Box>
                  <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>Zoom</Typography>
                    <Slider
                      value={zoom}
                      min={1}
                      max={3}
                      step={0.05}
                      onChange={(_, val) => setZoom(val as number)}
                    />
                  </Box>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setCropDialogOpen(false); setImageSrc(null); }}>Cancel</Button>
              <Button variant="contained" onClick={handleCropConfirm} disabled={!croppedAreaPixels}>
                Crop &amp; Upload
              </Button>
            </DialogActions>
          </Dialog>

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
          {statsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : userStats ? (
            <>
              {/* PDF Export Button */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleExportActivityPdf}
                  disabled={exportingPdf}
                  startIcon={exportingPdf ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
                >
                  {exportingPdf ? 'Exporting...' : 'PDF'}
                </Button>
              </Box>
              
              {/* Content wrapper for PDF export */}
              <Box id="activity-stats-content">
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
                                <Typography
                                  component="span"
                                  sx={{
                                    cursor: 'pointer',
                                    color: 'primary.main',
                                    '&:hover': { textDecoration: 'underline' },
                                    fontWeight: netDrillDown?.title === net.net_name ? 'bold' : 'normal',
                                  }}
                                  onClick={() => handleFavoriteNetClick(net)}
                                >
                                  {net.net_name}
                                </Typography>
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

                  {netDrillDown && (
                    <Box sx={{ mt: 2, pl: 1, borderLeft: 3, borderColor: 'primary.main' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Tooltip title="Close">
                          <IconButton size="small" onClick={() => setNetDrillDown(null)}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Typography variant="subtitle2">
                          Sessions — {netDrillDown.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ({netDrillDown.nets.length} session{netDrillDown.nets.length !== 1 ? 's' : ''})
                        </Typography>
                      </Box>
                      {netDrillDown.nets.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                          No session records found.
                        </Typography>
                      ) : (
                        <TableContainer sx={{ overflowX: 'auto' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell align="right">Check-ins</TableCell>
                                <TableCell align="right">View</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {netDrillDown.nets.map((session: any) => (
                                <TableRow key={session.net_id} hover>
                                  <TableCell>
                                    {new Date(session.last_check_in).toLocaleDateString('en-US', {
                                      year: 'numeric', month: 'short', day: 'numeric',
                                    })}
                                  </TableCell>
                                  <TableCell align="right">{session.check_in_count}</TableCell>
                                  <TableCell align="right">
                                    <Tooltip title="View net">
                                      <IconButton
                                        size="small"
                                        onClick={() => navigate(`/nets/${session.net_id}`)}
                                      >
                                        <OpenInNewIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  )}
                </>
              )}
              </Box>
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

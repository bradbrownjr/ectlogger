import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Tabs,
  Tab,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsIcon from '@mui/icons-material/Notifications';
import MapIcon from '@mui/icons-material/Map';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import ProfileTab from '../components/profile/ProfileTab';
import SettingsTab from '../components/profile/SettingsTab';
import NotificationsTab from '../components/profile/NotificationsTab';
import ActivityTab from '../components/profile/ActivityTab';
import CoverageTab from '../components/profile/CoverageTab';

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
  const touchOnScrollable = useRef(false);

  // Swipe left/right to switch tabs on touch devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    // If the gesture starts inside a horizontally-scrollable element, let it scroll
    // natively instead of hijacking the drag as a tab swipe.
    touchOnScrollable.current = false;
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth) {
        touchOnScrollable.current = true;
        break;
      }
      el = el.parentElement;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (touchOnScrollable.current) return;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;
    // Clamp to the last tab index (4: Profile, Settings, Notifications,
    // Activity, Coverage) - this was hardcoded to 2 and stale ever since the
    // Activity tab (index 3) was added, making it unreachable by swipe.
    const next = deltaX < 0 ? Math.min(tabValue + 1, 4) : Math.max(tabValue - 1, 0);
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
    theme: user?.theme ?? null,
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
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update profile'));
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
              icon={<NotificationsIcon />}
              iconPosition="start"
              label="Notifications"
              id="profile-tab-2"
              aria-controls="profile-tabpanel-2"
            />
            <Tab
              icon={<BarChartIcon />}
              iconPosition="start"
              label="Activity"
              id="profile-tab-3"
              aria-controls="profile-tabpanel-3"
            />
            <Tab
              icon={<MapIcon />}
              iconPosition="start"
              label="Coverage"
              id="profile-tab-4"
              aria-controls="profile-tabpanel-4"
            />
          </Tabs>
        </Box>

        {/* ========== Profile Tab ========== */}
        <TabPanel value={tabValue} index={0}>
          <ProfileTab
            formData={formData}
            setFormData={setFormData}
            newCallsign={newCallsign}
            setNewCallsign={setNewCallsign}
            handleSubmit={handleSubmit}
            saving={saving}
            error={error}
            success={success}
          />
        </TabPanel>

        {/* ========== Settings Tab ========== */}
        <TabPanel value={tabValue} index={1}>
          <SettingsTab
            formData={formData}
            setFormData={setFormData}
            handleSubmit={handleSubmit}
            saving={saving}
            error={error}
            success={success}
          />
        </TabPanel>

        {/* ========== Notifications Tab ========== */}
        <TabPanel value={tabValue} index={2}>
          <NotificationsTab
            formData={formData}
            setFormData={setFormData}
            handleSubmit={handleSubmit}
            saving={saving}
            error={error}
            success={success}
          />
        </TabPanel>

        {/* ========== Activity Tab ========== */}
        <TabPanel value={tabValue} index={3}>
          <ActivityTab />
        </TabPanel>

        {/* ========== Coverage Tab ========== */}
        <TabPanel value={tabValue} index={4}>
          <CoverageTab />
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default Profile;

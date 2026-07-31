import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Tabs,
  Tab,
  Snackbar,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ContactsIcon from '@mui/icons-material/ContactPhone';
import EditIcon from '@mui/icons-material/Edit';
import RadioIcon from '@mui/icons-material/Radio';
import SecurityIcon from '@mui/icons-material/Security';
import BuildIcon from '@mui/icons-material/Build';
import PaletteIcon from '@mui/icons-material/Palette';
import { useAuth } from '../contexts/AuthContext';
import AdminUsersTab from '../components/admin/AdminUsersTab';
import AdminContactsTab from '../components/admin/AdminContactsTab';
import AdminFieldsTab from '../components/admin/AdminFieldsTab';
import AdminFrequenciesTab from '../components/admin/AdminFrequenciesTab';
import AdminSecurityTab from '../components/admin/AdminSecurityTab';
import AdminMaintenanceTab from '../components/admin/AdminMaintenanceTab';
import AdminThemeTab from '../components/admin/AdminThemeTab';

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
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

const Admin: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  // Incremented when a user is created from the Contacts tab (invite), so UsersTab re-fetches
  const [usersRefreshTrigger, setUsersRefreshTrigger] = useState(0);

  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchOnScrollable = useRef(false);

  const showSnackbar = (message: string, severity: 'success' | 'error') =>
    setSnackbar({ open: true, message, severity });

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  // Swipe left/right to switch tabs on touch devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    // If the gesture starts inside a horizontally-scrollable element (e.g. the wide
    // Users table), let it scroll natively instead of hijacking the drag as a tab swipe.
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
    // Only trigger if horizontal swipe is dominant (more X than Y) and long enough
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    setTabValue((prev) => {
      if (deltaX < 0) return Math.min(prev + 1, 6);
      return Math.max(prev - 1, 0);
    });
  };

  if (currentUser?.role !== 'admin') {
    return null;
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          Admin
        </Typography>

        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons={false}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { minWidth: { xs: 72, sm: 100 }, px: { xs: 1, sm: 2 } },
          }}
        >
          <Tab label="Users" id="admin-tab-0" aria-controls="admin-tabpanel-0" icon={<PersonAddIcon />} iconPosition="start" />
          <Tab label="Contacts" id="admin-tab-1" aria-controls="admin-tabpanel-1" icon={<ContactsIcon />} iconPosition="start" />
          <Tab label="Check-in Fields" id="admin-tab-2" aria-controls="admin-tabpanel-2" icon={<EditIcon />} iconPosition="start" />
          <Tab label="Frequencies" id="admin-tab-3" aria-controls="admin-tabpanel-3" icon={<RadioIcon />} iconPosition="start" />
          <Tab label="Security" id="admin-tab-4" aria-controls="admin-tabpanel-4" icon={<SecurityIcon />} iconPosition="start" />
          <Tab label="Maintenance" id="admin-tab-5" aria-controls="admin-tabpanel-5" icon={<BuildIcon />} iconPosition="start" />
          <Tab label="Themes" id="admin-tab-6" aria-controls="admin-tabpanel-6" icon={<PaletteIcon />} iconPosition="start" />
        </Tabs>

        {/* ========== TAB 0: USERS ========== */}
        <TabPanel value={tabValue} index={0}>
          <AdminUsersTab showSnackbar={showSnackbar} refreshTrigger={usersRefreshTrigger} />
        </TabPanel>

        {/* ========== TAB 1: CONTACTS ========== */}
        <TabPanel value={tabValue} index={1}>
          <AdminContactsTab
            showSnackbar={showSnackbar}
            onUserCreated={() => setUsersRefreshTrigger((t) => t + 1)}
          />
        </TabPanel>

        {/* ========== TAB 2: CHECK-IN FIELDS ========== */}
        <TabPanel value={tabValue} index={2}>
          <AdminFieldsTab showSnackbar={showSnackbar} />
        </TabPanel>

        {/* ========== TAB 3: FREQUENCIES ========== */}
        <TabPanel value={tabValue} index={3}>
          <AdminFrequenciesTab showSnackbar={showSnackbar} />
        </TabPanel>

        {/* ========== TAB 4: SECURITY ========== */}
        <TabPanel value={tabValue} index={4}>
          <AdminSecurityTab showSnackbar={showSnackbar} />
        </TabPanel>

        {/* ========== TAB 5: MAINTENANCE ========== */}
        <TabPanel value={tabValue} index={5}>
          <AdminMaintenanceTab showSnackbar={showSnackbar} />
        </TabPanel>

        {/* ========== TAB 6: THEMES ========== */}
        <TabPanel value={tabValue} index={6}>
          <AdminThemeTab showSnackbar={showSnackbar} />
        </TabPanel>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Container>
  );
};

export default Admin;

import React, { useState, useEffect } from 'react';
import { displayCallsign } from '../utils/userDisplay';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  useMediaQuery,
  useTheme,
  Tooltip,
  Menu,
  MenuItem,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeContext';
import { useLocation } from '../contexts/LocationContext';
import UserAvatar from './UserAvatar';
import LoginIcon from '@mui/icons-material/Login';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import MenuIcon from '@mui/icons-material/Menu';
import RadioIcon from '@mui/icons-material/Radio';
import EventIcon from '@mui/icons-material/Event';
import BarChartIcon from '@mui/icons-material/BarChart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GridOnIcon from '@mui/icons-material/GridOn';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface NavbarClockProps {
  compact?: boolean;
}

const NavbarClock: React.FC<NavbarClockProps> = ({ compact = false }) => {
  const [time, setTime] = useState(new Date());
  const { gridSquare, loading: locationLoading } = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const localTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const utcTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  const localTz = time.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || 'Local';

  const tooltipContent = gridSquare
    ? `${localTz}: ${localTime} | UTC: ${utcTime} | Grid: ${gridSquare}`
    : `${localTz}: ${localTime} | UTC: ${utcTime}`;

  if (compact) {
    return (
      <Tooltip title={tooltipContent}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: 'rgba(0,0,0,0.15)',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
          }}
        >
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
            {utcTime}z
          </Typography>
          {gridSquare && (
            <>
              <Box sx={{ width: '1px', height: 12, bgcolor: 'rgba(255,255,255,0.3)' }} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                {gridSquare}
              </Typography>
            </>
          )}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltipContent}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: 'rgba(0,0,0,0.15)',
          px: 1.5,
          py: 0.5,
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: '0.85rem',
        }}
      >
        <AccessTimeIcon sx={{ fontSize: 18 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.9 }}>
            {localTime} {localTz}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 'bold' }}>
            {utcTime} UTC
          </Typography>
        </Box>
        {gridSquare && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
            <GridOnIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 'bold' }}>
              {gridSquare}
            </Typography>
          </>
        )}
        {locationLoading && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', opacity: 0.7 }}>
              ...
            </Typography>
          </>
        )}
      </Box>
    </Tooltip>
  );
};

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const { mode, toggleColorMode } = useThemeMode();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setDrawerOpen(false);
    setUserMenuAnchor(null);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
    setUserMenuAnchor(null);
  };

  const navItems = [
    { label: 'Nets', path: '/dashboard', icon: <RadioIcon /> },
    { label: 'Schedule', path: '/scheduler', icon: <EventIcon /> },
    { label: 'Stats', path: '/statistics', icon: <BarChartIcon /> },
  ];

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ cursor: 'pointer', mr: 2 }}
          onClick={() => handleNavigate('/dashboard')}
        >
          📻 ECTLogger
        </Typography>

        <NavbarClock compact={isMobile} />

        <Box sx={{ flexGrow: 1 }} />

        {isMobile ? (
          <>
            <IconButton
              color="inherit"
              edge="end"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
            <Drawer
              anchor="right"
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            >
              <Box sx={{ width: { xs: 200, sm: 250 } }} role="presentation">
                <List>
                  {navItems.map((item) => (
                    <ListItem key={item.path} disablePadding>
                      <ListItemButton onClick={() => handleNavigate(item.path)}>
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                  <ListItem disablePadding>
                    <ListItemButton
                      component="a"
                      href="https://ectlogger.us"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setDrawerOpen(false)}
                    >
                      <ListItemIcon><HelpOutlineIcon /></ListItemIcon>
                      <ListItemText primary="Docs" />
                    </ListItemButton>
                  </ListItem>
                </List>
                <Divider />
                {isAuthenticated ? (
                  <List>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavigate('/profile')}>
                        <ListItemIcon><PersonIcon /></ListItemIcon>
                        <ListItemText primary="Profile" secondary={displayCallsign(user)} />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavigate('/profile?tab=1')}>
                        <ListItemIcon><SettingsIcon /></ListItemIcon>
                        <ListItemText primary="Settings" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavigate('/profile?tab=2')}>
                        <ListItemIcon><BarChartIcon /></ListItemIcon>
                        <ListItemText primary="Personal Stats" />
                      </ListItemButton>
                    </ListItem>
                    {user?.role === 'admin' && (
                      <ListItem disablePadding>
                        <ListItemButton onClick={() => handleNavigate('/admin/users')}>
                          <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
                          <ListItemText primary="Admin" />
                        </ListItemButton>
                      </ListItem>
                    )}
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => { toggleColorMode(); setDrawerOpen(false); }}>
                        <ListItemIcon>{mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}</ListItemIcon>
                        <ListItemText primary={mode === 'light' ? 'Switch to Dark' : 'Switch to Light'} />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={handleLogout}>
                        <ListItemIcon><LogoutIcon /></ListItemIcon>
                        <ListItemText primary="Logout" />
                      </ListItemButton>
                    </ListItem>
                  </List>
                ) : (
                  <List>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavigate('/login')}>
                        <ListItemIcon><LoginIcon /></ListItemIcon>
                        <ListItemText primary="Login" />
                      </ListItemButton>
                    </ListItem>
                  </List>
                )}
              </Box>
            </Drawer>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {navItems.map((item) => (
              <Button key={item.path} color="inherit" onClick={() => navigate(item.path)}>
                {item.label}
              </Button>
            ))}
            <Button
              color="inherit"
              href="https://ectlogger.us"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </Button>

            {isAuthenticated ? (
              <>
                {/* ===== USER AVATAR MENU ===== */}
                <Tooltip title={displayCallsign(user) || 'Account'}>
                  <IconButton
                    onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                    sx={{ p: 0.5 }}
                  >
                    <UserAvatar
                      avatarUrl={(user as any)?.avatar_url}
                      callsign={user?.callsign}
                      name={user?.name}
                      size={32}
                    />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={userMenuAnchor}
                  open={Boolean(userMenuAnchor)}
                  onClose={() => setUserMenuAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  slotProps={{ paper: { sx: { minWidth: 200, mt: 0.5 } } }}
                >
                  {/* Identity header */}
                  <Box sx={{ px: 2, py: 1, pointerEvents: 'none' }}>
                    <Typography variant="subtitle2">{displayCallsign(user)}</Typography>
                    <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                  </Box>
                  <Divider />

                  <MenuItem onClick={() => handleNavigate('/profile')}>
                    <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
                    Profile
                  </MenuItem>
                  <MenuItem onClick={() => handleNavigate('/profile?tab=1')}>
                    <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                    Settings
                  </MenuItem>
                  <MenuItem onClick={() => handleNavigate('/profile?tab=2')}>
                    <ListItemIcon><BarChartIcon fontSize="small" /></ListItemIcon>
                    Personal Stats
                  </MenuItem>
                  {user?.role === 'admin' && (
                    <MenuItem onClick={() => handleNavigate('/admin/users')}>
                      <ListItemIcon><AdminPanelSettingsIcon fontSize="small" /></ListItemIcon>
                      Admin
                    </MenuItem>
                  )}

                  <Divider />

                  <MenuItem onClick={() => { toggleColorMode(); setUserMenuAnchor(null); }}>
                    <ListItemIcon>
                      {mode === 'light' ? <Brightness4Icon fontSize="small" /> : <Brightness7Icon fontSize="small" />}
                    </ListItemIcon>
                    {mode === 'light' ? 'Switch to Dark' : 'Switch to Light'}
                  </MenuItem>

                  <Divider />

                  <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                    <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
                    Logout
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button color="inherit" startIcon={<LoginIcon />} onClick={() => navigate('/login')}>
                Login
              </Button>
            )}
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;

import React, { useState } from 'react';
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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeContext';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginIcon from '@mui/icons-material/Login';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import MenuIcon from '@mui/icons-material/Menu';
import RadioIcon from '@mui/icons-material/Radio';
import EventIcon from '@mui/icons-material/Event';
import BarChartIcon from '@mui/icons-material/BarChart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PersonIcon from '@mui/icons-material/Person';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const { mode, toggleColorMode } = useThemeMode();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setDrawerOpen(false);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const menuItems = [
    { label: 'Nets', path: '/dashboard', icon: <RadioIcon /> },
    { label: 'Schedule', path: '/scheduler', icon: <EventIcon /> },
    { label: 'Stats', path: '/statistics', icon: <BarChartIcon /> },
  ];

  if (isAuthenticated && user?.role === 'admin') {
    menuItems.push({ label: 'Admin', path: '/admin/users', icon: <AdminPanelSettingsIcon /> });
  }

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 1, cursor: 'pointer' }}
          onClick={() => handleNavigate('/dashboard')}
        >
          📻 ECTLogger
        </Typography>
        
        {isMobile ? (
          <>
            <IconButton color="inherit" onClick={toggleColorMode} title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
              {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
            </IconButton>
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
              <Box sx={{ width: 250 }} role="presentation">
                <List>
                  {menuItems.map((item) => (
                    <ListItem key={item.path} disablePadding>
                      <ListItemButton onClick={() => handleNavigate(item.path)}>
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
                <Divider />
                <List>
                  {isAuthenticated && (
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavigate('/profile')}>
                        <ListItemIcon><PersonIcon /></ListItemIcon>
                        <ListItemText primary={user?.callsign || user?.name || 'Profile'} />
                      </ListItemButton>
                    </ListItem>
                  )}
                  {isAuthenticated ? (
                    <ListItem disablePadding>
                      <ListItemButton onClick={handleLogout}>
                        <ListItemIcon><LogoutIcon /></ListItemIcon>
                        <ListItemText primary="Logout" />
                      </ListItemButton>
                    </ListItem>
                  ) : (
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavigate('/login')}>
                        <ListItemIcon><LoginIcon /></ListItemIcon>
                        <ListItemText primary="Login" />
                      </ListItemButton>
                    </ListItem>
                  )}
                </List>
              </Box>
            </Drawer>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button color="inherit" onClick={() => navigate('/dashboard')}>
              Nets
            </Button>
            <Button color="inherit" onClick={() => navigate('/scheduler')}>
              Schedule
            </Button>
            <Button color="inherit" onClick={() => navigate('/statistics')}>
              Stats
            </Button>
            {isAuthenticated && user?.role === 'admin' && (
              <Button color="inherit" onClick={() => navigate('/admin/users')}>
                Admin
              </Button>
            )}
            {isAuthenticated && (
              <Button 
                color="inherit" 
                onClick={() => navigate('/profile')}
                sx={{ textTransform: 'none' }}
              >
                {user?.callsign || user?.name || user?.email}
              </Button>
            )}
            <IconButton color="inherit" onClick={toggleColorMode} title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
              {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
            </IconButton>
            {isAuthenticated ? (
              <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
                Logout
              </Button>
            ) : (
              <Button color="inherit" onClick={() => navigate('/login')}>
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

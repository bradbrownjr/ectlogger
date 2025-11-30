import React, { useState, useMemo, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, PaletteMode } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeContext } from './contexts/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NetView from './pages/NetView';
import CreateNet from './pages/CreateNet';
import Scheduler from './pages/Scheduler';
import CreateSchedule from './pages/CreateSchedule';
import VerifyMagicLink from './pages/VerifyMagicLink';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import Statistics from './pages/Statistics';
import NetStatistics from './pages/NetStatistics';
import Navbar from './components/Navbar';
import ProfileSetupDialog from './components/ProfileSetupDialog';

const getDesignTokens = (mode: PaletteMode) => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          primary: {
            main: '#1976d2',
          },
          secondary: {
            main: '#dc004e',
          },
          background: {
            default: '#e8eef4',  // Light blue-gray background
            paper: '#ffffff',
          },
        }
      : {
          primary: {
            main: '#90caf9',
          },
          secondary: {
            main: '#f48fb1',
          },
          background: {
            default: '#121212',
            paper: '#1e1e1e',
          },
        }),
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
            borderRadius: 4,
          },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          },
        },
      },
    },
  },
});

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Navbar />
      {isAuthenticated && <ProfileSetupDialog />}
      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/verify" element={<VerifyMagicLink />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/nets/create"
            element={
              <PrivateRoute>
                <CreateNet />
              </PrivateRoute>
            }
          />
          <Route
            path="/nets/:netId/edit"
            element={
              <PrivateRoute>
                <CreateNet />
              </PrivateRoute>
            }
          />
          <Route path="/nets/:netId/info" element={<CreateNet />} />
          <Route path="/nets/:netId" element={<NetView />} />
          <Route
            path="/admin/users"
            element={
              <PrivateRoute>
                <Admin />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route path="/scheduler" element={<Scheduler />} />
          <Route
            path="/scheduler/create"
            element={
              <PrivateRoute>
                <CreateSchedule />
              </PrivateRoute>
            }
          />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/statistics/nets/:netId" element={<NetStatistics />} />
          <Route
            path="/scheduler/:scheduleId/edit"
            element={
              <PrivateRoute>
                <CreateSchedule />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Box>
    </Box>
  );
};

const App: React.FC = () => {
  const [mode, setMode] = useState<PaletteMode>(() => {
    const savedMode = localStorage.getItem('themeMode');
    return (savedMode as PaletteMode) || 'light';
  });

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleColorMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider maxSnack={3}>
          <Router>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </Router>
        </SnackbarProvider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

export default App;

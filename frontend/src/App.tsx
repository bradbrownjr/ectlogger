import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
type PaletteMode = 'light' | 'dark';
import { CssBaseline, Box } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeContext } from './contexts/ThemeContext';
import { LocationProvider } from './contexts/LocationContext';
import { THEMES, DEFAULT_THEME_KEY, ThemeDefinition } from './theme/themes';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NetView from './pages/NetView';
import NetPaneWindow from './pages/NetPaneWindow';
import CreateNet from './pages/CreateNet';
import Scheduler from './pages/Scheduler';
import CreateSchedule from './pages/CreateSchedule';
import VerifyMagicLink from './pages/VerifyMagicLink';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import Statistics from './pages/Statistics';
import NetStatistics from './pages/NetStatistics';
import NetReport from './pages/NetReport';
import ScheduleStatistics from './pages/ScheduleStatistics';
import Unsubscribe from './pages/Unsubscribe';
import Traffic from './pages/Traffic';
import Navbar from './components/Navbar';
import ProfileSetupDialog from './components/ProfileSetupDialog';
import ChangelogNotification from './components/ChangelogNotification';
import MaintenanceBanner from './components/MaintenanceBanner';
import UpdateAvailableBanner from './components/UpdateAvailableBanner';
import ErrorBoundary from './components/ErrorBoundary';

const getDesignTokens = (mode: PaletteMode, themeKey: string, customTheme: ThemeDefinition | null) => {
  const source = (themeKey === 'custom' && customTheme) ? customTheme : (THEMES[themeKey] ?? THEMES[DEFAULT_THEME_KEY]);
  const variant = source[mode];
  return {
  palette: {
    mode,
    primary: {
      main: variant.primary,
    },
    secondary: {
      main: variant.secondary,
    },
    background: {
      default: variant.background,
      paper: variant.paper,
    },
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
    // Applies everywhere (toolbars included) rather than per-instance, since
    // every tooltip in this app is a short instructional label with nothing
    // worth hovering into -- so there is no cost to the two changes below,
    // app-wide:
    //
    // 1. disableInteractive sets pointer-events:none on the tooltip popper
    //    (MUI's own mechanism -- see Tooltip.js's popperInteractive style).
    //    Without it, pointer-events default to 'auto', so a tooltip sitting
    //    over a neighboring element (dense toolbars pack icon buttons only
    //    26px tall, see DESIGN.md) intercepts the click: the cursor becomes
    //    a text I-beam over the tooltip's own text, and the button
    //    underneath never receives the click. With it, the popper is
    //    click-through no matter what it happens to be sitting on top of.
    // 2. `flip` disabled and `preventOverflow`'s altAxis enabled pins every
    //    tooltip below its anchor (never flipped above it, which would cover
    //    the toolbar row itself) and slides it left/right to stay inside the
    //    viewport instead of running off the left or right edge of the
    //    screen -- Popper's preventOverflow only guards the placement's own
    //    axis (vertical, for "bottom") unless altAxis is turned on.
    MuiTooltip: {
      defaultProps: {
        placement: 'bottom' as const,
        disableInteractive: true,
        PopperProps: {
          popperOptions: {
            modifiers: [
              { name: 'flip', enabled: false },
              // boundary must be the viewport, not Popper's own default of
              // "clippingParents": the toolbars this targets clip their own
              // overflow (NetViewHeader's collapse ladder, TrafficPanel's
              // icon row) to a container barely taller than the button row,
              // and a MUI Tooltip portals to document.body -- it already
              // renders outside that clipping visually, so constraining its
              // *position* to fit inside that sliver of a container instead
              // of the actual screen squeezed it back up over the anchor.
              { name: 'preventOverflow', options: { altAxis: true, padding: 8, boundary: 'viewport' } },
              // NetView.tsx applies a CSS `zoom` to <body> on short
              // viewports to fit the logging panel without scrolling.
              // getBoundingClientRect() on the anchor already reflects that
              // zoom (it reports real rendered/visual pixels), so Popper's
              // math -- entirely built on getBoundingClientRect -- computes
              // an offset in visual pixels. But the popper element is ALSO
              // a descendant of the zoomed <body> (Tooltip portals there),
              // so writing that visual-pixel offset straight into its
              // `top`/`left` gets scaled DOWN by zoom a second time when the
              // browser paints it -- Popper has no notion of `zoom` (only of
              // CSS `transform` scales, which it does compensate for) and
              // divides for exactly one context, not two. `top: 118px`
              // painted inside a zoom:0.8 body renders at 94.4px, landing
              // the tooltip almost on top of its own anchor. The
              // compensateZoom modifier below undoes that second scaling by
              // dividing the popper's own top/left back up before it's
              // written, so it lands where the (already-zoomed) anchor
              // measurement says it should.
              { name: 'computeStyles', options: { gpuAcceleration: false } },
              {
                name: 'compensateZoom',
                enabled: true,
                phase: 'beforeWrite',
                requires: ['computeStyles'],
                fn: ({ state }: any) => {
                  const zoom = parseFloat(document.body.style.zoom) || 1;
                  if (zoom === 1) return;
                  const styles = state.styles.popper;
                  (['top', 'left', 'right', 'bottom'] as const).forEach((prop) => {
                    if (typeof styles[prop] === 'string' && styles[prop].endsWith('px')) {
                      styles[prop] = `${parseFloat(styles[prop]) / zoom}px`;
                    }
                  });
                },
              },
            ],
          },
        },
      },
    },
  },
  };
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Hide changelog notification on net view pages
  const showChangelog = !location.pathname.startsWith('/nets/') || location.pathname === '/nets/create';

  // Popped-out pane windows (Chat / Activity Log opened in their own real
  // browser window via "Open in new window") render with no app chrome —
  // just the pane filling the window.
  const isPaneWindow = /^\/nets\/[^/]+\/pane\//.test(location.pathname);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'var(--ect-app-h, 100vh)', overflow: 'hidden' }}>
      {!isPaneWindow && <Navbar />}
      {!isPaneWindow && <MaintenanceBanner />}
      {!isPaneWindow && <UpdateAvailableBanner />}
      {isAuthenticated && !isPaneWindow && <ProfileSetupDialog />}
      {showChangelog && !isPaneWindow && <ChangelogNotification />}
      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/verify" element={<VerifyMagicLink />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
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
          <Route path="/nets/:netId/report" element={<NetReport />} />
          <Route path="/nets/:netId/pane/:paneType" element={<NetPaneWindow />} />
          <Route
            path="/nets/:netId"
            element={
              <ErrorBoundary message="Net View encountered a display error. Your session data is safe — reload to reconnect.">
                <NetView />
              </ErrorBoundary>
            }
          />
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
          <Route
            path="/traffic"
            element={
              <PrivateRoute>
                <Traffic />
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
          <Route path="/statistics/schedules/:templateId" element={<ScheduleStatistics />} />
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

// Resolves and applies the effective theme (mode + named color palette).
// Lives inside AuthProvider so it can read the current user's personal
// theme preference; falls back to the system default (fetched once from
// the public /settings/theme endpoint) for guests and users who haven't
// picked one.
const ThemedApp: React.FC = () => {
  const { user } = useAuth();
  // Captured once at construction time (before the persist-effect below ever
  // runs), so it reflects whether THIS BROWSER has ever set a preference -
  // unaffected by that same effect writing a value moments later. Used only
  // to gate the site's default light/dark (see isFirstEverVisit below).
  const isFirstEverVisitRef = useRef(localStorage.getItem('themeMode') === null);
  const [mode, setMode] = useState<PaletteMode>(() => {
    const savedMode = localStorage.getItem('themeMode');
    return (savedMode as PaletteMode) || 'light';
  });
  const [systemDefaultTheme, setSystemDefaultTheme] = useState<string>(
    () => localStorage.getItem('systemDefaultTheme') || DEFAULT_THEME_KEY
  );
  const [customTheme, setCustomTheme] = useState<ThemeDefinition | null>(null);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [previewThemeKey, setPreviewThemeKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

  useEffect(() => {
    api.get('/settings/theme')
      .then((res) => {
        const data = res.data ?? {};
        if (data.default_theme) {
          setSystemDefaultTheme(data.default_theme);
          localStorage.setItem('systemDefaultTheme', data.default_theme);
        }
        // Site-wide light/dark default only applies to a browser that has
        // never toggled before - once toggled, localStorage always wins.
        if (isFirstEverVisitRef.current && (data.default_color_mode === 'light' || data.default_color_mode === 'dark')) {
          setMode(data.default_color_mode);
        }
        if (data.custom_theme) {
          setCustomTheme(data.custom_theme);
        }
        setCustomLogoUrl(data.custom_logo_url ?? null);
      })
      .catch(() => {
        // Non-critical: keep whatever was cached in localStorage / the hardcoded fallback.
      });
  }, []);

  const toggleColorMode = () => {
    setMode((prevMode: PaletteMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const themeKey = previewThemeKey !== undefined ? (previewThemeKey || systemDefaultTheme) : (user?.theme || systemDefaultTheme);

  const theme = useMemo(() => createTheme(getDesignTokens(mode, themeKey, customTheme)), [mode, themeKey, customTheme]);

  return (
    <ThemeContext.Provider value={{ mode, toggleColorMode, systemDefaultTheme, setSystemDefaultTheme, customTheme, setCustomTheme, customLogoUrl, setCustomLogoUrl, previewThemeKey, setPreviewThemeKey }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider maxSnack={3} autoHideDuration={6000}>
          <LocationProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </LocationProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </Router>
  );
};

export default App;

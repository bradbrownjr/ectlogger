import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api, { authApi, userApi, ADMIN_MODE_EVENT, BACKGROUND_REQUEST_CONFIG, setAdminModePrompt } from '../services/api';

interface User {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
  gmrs_callsign?: string;
  callsigns?: string[];
  previous_callsigns?: string[];
  location?: string;
  skywarn_number?: string;
  website_url?: string;
  prefer_utc?: boolean;
  walkthrough_seen?: boolean;
  // Admin-granted early access past the account-age and net-count limits on
  // creating a net or schedule
  schedule_age_bypass?: boolean;
  show_activity_in_chat?: boolean;
  location_awareness?: boolean;
  live_location?: string;
  live_location_updated?: string;
  live_location_town?: string;
  email_notifications?: boolean;
  notify_net_start?: boolean;
  notify_net_close?: boolean;
  notify_net_reminder?: boolean;
  notify_traffic_reminder?: boolean;
  notify_ics309?: boolean;
  notify_whats_new?: boolean;
  timezone?: string;
  dashboard_sort_order?: 'status' | 'alpha';
  schedule_sort_order?: 'alpha' | 'date';
  theme?: string | null;
  role: string;
  has_password?: boolean;
  mfa_enabled?: boolean;
  // Admin-set padlocks (Admin Users "Edit User" dialog): profile fields the
  // user can't change themselves. See ProfileTab.tsx and
  // backend/app/models.py::LOCKABLE_USER_FIELDS.
  locked_fields?: string[];
  // Admin mode for this browser session (backend app/admin_mode.py).
  admin_mode_open?: boolean;
  admin_mode_closes_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  // The account holds the admin role, whether or not admin mode is open.
  isActualAdmin: boolean;
  // ========== ADMIN MODE ==========
  // `user.role` reads 'admin' only while admin mode is open, so every role
  // check in the app follows it. The server enforces the same rule.
  adminModeOpen: boolean;
  adminModeClosesAt: Date | null;
  // Ask for the code (AdminModeDialog). Resolves true once admin mode is open.
  requestAdminMode: () => Promise<boolean>;
  // Called by AdminModeDialog with the code; throws on a wrong one.
  switchToAdmin: (code: string) => Promise<void>;
  lockAdmin: () => Promise<void>;
  // AdminModeDialog's state: open, and how to finish the pending request.
  adminPromptOpen: boolean;
  finishAdminPrompt: (opened: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminModeClosesAt, setAdminModeClosesAt] = useState<Date | null>(null);
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  // Everyone waiting on one code prompt (several requests can be refused at once).
  const promptWaiters = useRef<((opened: boolean) => void)[]>([]);

  useEffect(() => {
    // Check for existing token on mount
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async (_authToken: string) => {
    try {
      const response = await authApi.getCurrentUser();
      // Normalize role to lowercase for consistent comparison
      const userData = {
        ...response.data,
        role: response.data.role?.toLowerCase() || 'user'
      };
      setActualUser(userData);
      setAdminModeClosesAt(userData.admin_mode_open && userData.admin_mode_closes_at
        ? new Date(userData.admin_mode_closes_at) : null);

      // Keep the account's timezone in sync with the browser so server-generated
      // output (net log emails, CSV/ICS-309 exports, What's New digest timing)
      // can display times in the user's actual zone instead of raw UTC.
      try {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (browserTz && browserTz !== userData.timezone) {
          await userApi.updateProfile({ timezone: browserTz });
        }
      } catch {
        // Non-critical: worst case the account keeps its previous/unset timezone.
      }
    } catch (error: any) {
      console.error('[AUTH] Failed to fetch user:', error.response?.status, error.response?.data);
      // Only clear the session on an explicit 401 (invalid/expired token).
      // Network errors and 5xx responses are transient (backend restarting
      // during a deploy) — the token is still valid, so leave it in place.
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (authToken: string) => {
    localStorage.setItem('token', authToken);
    setToken(authToken);
    await fetchUser(authToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    // Left behind by "View as Regular User", which admin mode replaced.
    localStorage.removeItem('admin_simulate_user');
    setToken(null);
    setActualUser(null);
    setAdminModeClosesAt(null);
  };

  const isActualAdmin = actualUser?.role === 'admin';
  const adminModeOpen = isActualAdmin && adminModeClosesAt !== null;

  // Every response to an admin says when admin mode closes (api.ts).
  useEffect(() => {
    const onAdminMode = (e: Event) => {
      const value = (e as CustomEvent<string | null>).detail;
      setAdminModeClosesAt(value ? new Date(value) : null);
    };
    window.addEventListener(ADMIN_MODE_EVENT, onAdminMode);
    return () => window.removeEventListener(ADMIN_MODE_EVENT, onAdminMode);
  }, []);

  // At the closing time, ask the server whether admin mode really closed:
  // a request since the last one we saw may have kept it open. Sent as a
  // background request, so asking does not itself keep it open.
  useEffect(() => {
    if (!adminModeClosesAt) return;
    // At least 5 s, so a browser clock running ahead of the server never polls in a tight loop.
    const wait = Math.max(5000, adminModeClosesAt.getTime() - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      api.get('/users/me', BACKGROUND_REQUEST_CONFIG).catch(() => setAdminModeClosesAt(null));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [adminModeClosesAt]);

  const requestAdminMode = useCallback(() => new Promise<boolean>((resolve) => {
    promptWaiters.current.push(resolve);
    setAdminPromptOpen(true);
  }), []);

  const finishAdminPrompt = useCallback((opened: boolean) => {
    setAdminPromptOpen(false);
    const waiters = promptWaiters.current;
    promptWaiters.current = [];
    waiters.forEach((resolve) => resolve(opened));
  }, []);

  // api.ts asks for the code when the server refuses an admin action.
  useEffect(() => {
    setAdminModePrompt(isActualAdmin ? requestAdminMode : null);
    return () => setAdminModePrompt(null);
  }, [isActualAdmin, requestAdminMode]);

  const switchToAdmin = async (code: string) => {
    const response = await authApi.openAdminMode(code);
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
      setToken(response.data.access_token);
    }
    setAdminModeClosesAt(response.data.admin_mode_closes_at ? new Date(response.data.admin_mode_closes_at) : null);
  };

  const lockAdmin = async () => {
    await authApi.lockAdminMode();
    setAdminModeClosesAt(null);
  };

  // Outside admin mode an admin is shown the app as a regular user, the same
  // answer the server gives them.
  const user = (isActualAdmin && !adminModeOpen && actualUser)
    ? { ...actualUser, role: 'user' }
    : actualUser;

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token && !!actualUser,
        isActualAdmin,
        adminModeOpen,
        adminModeClosesAt,
        requestAdminMode,
        switchToAdmin,
        lockAdmin,
        adminPromptOpen,
        finishAdminPrompt,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

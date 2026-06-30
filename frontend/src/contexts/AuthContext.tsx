import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

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
  prefer_utc?: boolean;
  walkthrough_seen?: boolean;
  show_activity_in_chat?: boolean;
  location_awareness?: boolean;
  live_location?: string;
  live_location_updated?: string;
  email_notifications?: boolean;
  notify_net_start?: boolean;
  notify_net_close?: boolean;
  notify_net_reminder?: boolean;
  notify_ics309?: boolean;
  notify_whats_new?: boolean;
  timezone?: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isActualAdmin: boolean;
  simulateRegularUser: boolean;
  toggleSimulateRegularUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulateRegularUser, setSimulateRegularUser] = useState<boolean>(
    () => localStorage.getItem('admin_simulate_user') === 'true'
  );

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
    localStorage.removeItem('admin_simulate_user');
    setToken(null);
    setActualUser(null);
    setSimulateRegularUser(false);
  };

  const toggleSimulateRegularUser = () => {
    setSimulateRegularUser(prev => {
      const next = !prev;
      localStorage.setItem('admin_simulate_user', String(next));
      return next;
    });
  };

  const isActualAdmin = actualUser?.role === 'admin';

  // When simulating regular user, expose role as 'user' so all existing
  // role checks in the UI automatically hide admin-only elements.
  const user = (simulateRegularUser && isActualAdmin && actualUser)
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
        simulateRegularUser,
        toggleSimulateRegularUser,
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

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

interface User {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
  gmrs_callsign?: string;
  callsigns?: string[];
  location?: string;
  prefer_utc?: boolean;
  show_activity_in_chat?: boolean;
  location_awareness?: boolean;
  email_notifications?: boolean;
  notify_net_start?: boolean;
  notify_net_close?: boolean;
  notify_net_reminder?: boolean;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const fetchUser = async (authToken: string) => {
    try {
      const response = await authApi.getCurrentUser();
      // Normalize role to lowercase for consistent comparison
      const userData = {
        ...response.data,
        role: response.data.role?.toLowerCase() || 'user'
      };
      setUser(userData);
    } catch (error: any) {
      console.error('[AUTH] Failed to fetch user:', error.response?.status, error.response?.data);
      logout();
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
    setToken(null);
    setUser(null);
  };

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
        isAuthenticated: !!token && !!user,
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

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

interface User {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
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
      console.log('[AUTH] Fetching user with token...');
      console.log('[AUTH] Token from localStorage:', localStorage.getItem('token')?.substring(0, 20) + '...');
      const response = await authApi.getCurrentUser();
      console.log('[AUTH] User fetched successfully:', response.data);
      setUser(response.data);
    } catch (error: any) {
      console.error('[AUTH] Failed to fetch user:', error);
      console.error('[AUTH] Error response:', error.response?.data);
      console.error('[AUTH] Error status:', error.response?.status);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (authToken: string) => {
    console.log('[AUTH] Login called with token:', authToken.substring(0, 20) + '...');
    localStorage.setItem('token', authToken);
    console.log('[AUTH] Token saved to localStorage');
    setToken(authToken);
    console.log('[AUTH] Token state updated');
    await fetchUser(authToken);
    console.log('[AUTH] Login complete');
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

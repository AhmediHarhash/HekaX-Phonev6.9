// ============================================================================
// HEKAX Phone - Auth Context
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { authApi, type LoginResponse } from '../utils/api';
import type { AuthUser, AuthOrg } from '../types';

interface AuthContextType {
  user: (AuthUser & { onboardingCompleted?: boolean }) | null;
  org: AuthOrg | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateOrg: (org: AuthOrg) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<(AuthUser & { onboardingCompleted?: boolean }) | null>(null);
  const [org, setOrg] = useState<AuthOrg | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check existing auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.me();
      setUser(response.user);
      setOrg(response.organization);
    } catch (error) {
      // Token invalid or expired
      console.error('Auth check failed:', error);
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  };

  const clearAuth = () => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.ORG);
    setUser(null);
    setOrg(null);
  };

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    
    // Store auth data
    localStorage.setItem(STORAGE_KEYS.TOKEN, response.token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.user));
    localStorage.setItem(STORAGE_KEYS.ORG, JSON.stringify(response.organization));
    
    setUser(response.user);
    setOrg(response.organization);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, []);

  const updateOrg = useCallback((updatedOrg: AuthOrg) => {
    localStorage.setItem(STORAGE_KEYS.ORG, JSON.stringify(updatedOrg));
    setOrg(updatedOrg);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.user);
      setOrg(response.organization);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.user));
      localStorage.setItem(STORAGE_KEYS.ORG, JSON.stringify(response.organization));
    } catch (error) {
      console.error('Refresh user failed:', error);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        isAuthenticated: !!user && !!org,
        isLoading,
        login,
        logout,
        updateOrg,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

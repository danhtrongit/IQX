import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@iqx/api-client';
import { register, restoreSession, signIn, signOut, type MobileUser } from './api';
import { registerForPushNotifications } from './notifications';

type AuthContextValue = {
  user: MobileUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; full_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Không thể hoàn tất yêu cầu';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void restoreSession().then((account) => { if (active) { setUser(account); setLoading(false); if (account) void registerForPushNotifications().catch(() => undefined); } });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    error,
    clearError: () => setError(null),
    login: async (email, password) => {
      setError(null); setLoading(true);
      try { const account = await signIn(email, password); setUser(account); void registerForPushNotifications().catch(() => undefined); } catch (cause) { setError(message(cause)); throw cause; } finally { setLoading(false); }
    },
    register: async (input) => {
      setError(null); setLoading(true);
      try { const account = await register(input); setUser(account); void registerForPushNotifications().catch(() => undefined); } catch (cause) { setError(message(cause)); throw cause; } finally { setLoading(false); }
    },
    logout: async () => { setLoading(true); try { await signOut(); } finally { setUser(null); setLoading(false); } },
  }), [error, isLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, apiRequest, onSessionExpired, unwrapData } from '../api';
import { clearTokens, getAccessToken, loadTokens, saveTokens, type TokenPair } from './token-store';
import type { AuthContextValue, AuthStatus, AuthUser, RegisterInput } from './types';

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchPremium(user: AuthUser, signal?: AbortSignal): Promise<boolean> {
  if (user.role === 'admin') return true;
  try {
    const res = unwrapData<{ is_premium?: boolean }>(
      await apiRequest('/premium/me', { signal }),
    );
    return res?.is_premium === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [premium, setPremium] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ensuredFor = useRef<string | null>(null);
  const startupAbort = useRef<AbortController | null>(null);

  const applySession = useCallback(async (account: AuthUser, signal?: AbortSignal) => {
    const isPremium = await fetchPremium(account, signal);
    if (signal?.aborted) return;
    setUser(account);
    setPremium(isPremium);
    setError(null);
    setSessionExpired(false);
    setStatus('authenticated');
  }, []);

  const resetToGuest = useCallback(
    (expired: boolean) => {
      startupAbort.current?.abort();
      ensuredFor.current = null;
      setUser(null);
      setPremium(false);
      setError(null);
      setSessionExpired(expired);
      setStatus('guest');
      queryClient.clear();
    },
    [queryClient],
  );

  // Startup: restore session.
  useEffect(() => {
    const controller = new AbortController();
    startupAbort.current = controller;
    (async () => {
      setStatus('loading');
      await loadTokens();
      if (controller.signal.aborted) return;
      if (!getAccessToken()) {
        setStatus('guest');
        return;
      }
      try {
        const account = unwrapData<AuthUser>(
          await apiRequest('/auth/me', { signal: controller.signal }),
        );
        await applySession(account, controller.signal);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) {
          await clearTokens();
          setUser(null);
          setStatus('guest');
        } else {
          setError(e instanceof Error ? e : new Error('Không xác minh được phiên đăng nhập'));
          setStatus('error');
        }
      }
    })();
    return () => controller.abort();
  }, [attempt, applySession]);

  // Forced sign-out from the API client.
  useEffect(() => onSessionExpired(() => resetToGuest(true)), [resetToGuest]);

  // Workspace bootstrap, once per signed-in user (404 is fine, other errors ignored).
  const userId = user ? String(user.id) : null;
  useEffect(() => {
    if (!userId || ensuredFor.current === userId) return;
    ensuredFor.current = userId;
    apiRequest('/workspace/ensure', { method: 'POST' }).catch(() => undefined);
  }, [userId]);

  const login = useCallback(
    async (email: string, password: string) => {
      startupAbort.current?.abort();
      const tokens = unwrapData<TokenPair>(
        await apiRequest('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
      );
      await saveTokens(tokens);
      try {
        const account = unwrapData<AuthUser>(await apiRequest('/auth/me'));
        await queryClient.cancelQueries();
        queryClient.clear();
        ensuredFor.current = null;
        await applySession(account);
      } catch (e) {
        await clearTokens();
        throw e;
      }
    },
    [applySession, queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await apiRequest('/auth/register', { method: 'POST', body: input, auth: false });
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // best effort
    }
    await clearTokens();
    await queryClient.cancelQueries();
    resetToGuest(false);
  }, [queryClient, resetToGuest]);

  const refreshUser = useCallback(async () => {
    const account = unwrapData<AuthUser>(await apiRequest('/auth/me'));
    await applySession(account);
  }, [applySession]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isPremium: user?.role === 'admin' || premium,
      sessionExpired,
      error,
      login,
      register,
      logout,
      refreshUser,
      retry,
      clearSessionExpired,
    }),
    [status, user, premium, sessionExpired, error, login, register, logout, refreshUser, retry, clearSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';

import { mockFetch, type Route } from '@/test-utils/fetch';
import { __resetTokenCache, getAccessToken, saveTokens } from '../token-store';
import { AuthProvider, useAuth } from '..';

const user = { id: 'u1', email: 'a@b.vn', full_name: 'An', role: 'user' };

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

const path = (url: string) => url.replace(/^.*\/api\/v2/, '');
const api = (handlers: Record<string, any>): Route => ({ url, init }) => {
  const key = `${init.method ?? 'GET'} ${path(url)}`;
  const h = handlers[key];
  return typeof h === 'function' ? h() : h;
};

beforeEach(() => {
  (SecureStore as any).__store.clear();
  __resetTokenCache();
});

describe('AuthProvider', () => {
  it('starts as guest without a token', async () => {
    mockFetch();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('guest'));
  });

  it('login -> authenticated, premium, workspace ensure once; logout -> guest', async () => {
    const { calls } = mockFetch(
      api({
        'POST /auth/login': { body: { access_token: 'a1', refresh_token: 'r1', token_type: 'bearer' } },
        'GET /auth/me': { body: user },
        'GET /premium/me': { body: { is_premium: true } },
        'POST /workspace/ensure': { status: 404, body: { detail: 'nf' } },
        'POST /auth/logout': { status: 204 },
      }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('guest'));
    await act(async () => { await result.current.login('a@b.vn', 'pw'); });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user?.email).toBe('a@b.vn');
    expect(result.current.isPremium).toBe(true);
    expect(getAccessToken()).toBe('a1');
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/workspace/ensure'))).toHaveLength(1));
    await act(async () => { await result.current.logout(); });
    expect(result.current.status).toBe('guest');
    expect(getAccessToken()).toBeNull();
    expect((SecureStore as any).__store.size).toBe(0);
  });

  it('restores the session from stored tokens', async () => {
    await saveTokens({ access_token: 'a1', refresh_token: 'r1' });
    __resetTokenCache(); // force reload from SecureStore
    mockFetch(api({ 'GET /auth/me': { body: { ...user, role: 'admin' } }, 'POST /workspace/ensure': { body: {} } }));
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.isPremium).toBe(true); // admin
  });

  it('401 on startup (refresh rejected) -> guest', async () => {
    await saveTokens({ access_token: 'a1', refresh_token: 'r1' });
    __resetTokenCache();
    mockFetch(() => ({ status: 401, body: { detail: 'x' } }));
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('guest'));
    expect(result.current.sessionExpired).toBe(true);
  });

  it('non-401 startup failure -> error state, retry recovers', async () => {
    await saveTokens({ access_token: 'a1', refresh_token: 'r1' });
    __resetTokenCache();
    let fail = true;
    mockFetch(api({
      'GET /auth/me': () => (fail ? { status: 500, body: { error: { message: 'boom' } } } : { body: user }),
      'GET /premium/me': { body: { is_premium: false } },
      'POST /workspace/ensure': { body: {} },
    }));
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('boom');
    fail = false;
    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.isPremium).toBe(false);
  });

  it('login failure surfaces ApiError and stays guest', async () => {
    mockFetch(api({ 'POST /auth/login': { status: 401, body: { error: { message: 'Sai email hoặc mật khẩu' } } } }));
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('guest'));
    await expect(act(async () => { await result.current.login('a@b.vn', 'bad'); })).rejects.toThrow('Sai email hoặc mật khẩu');
    expect(result.current.status).toBe('guest');
  });
});

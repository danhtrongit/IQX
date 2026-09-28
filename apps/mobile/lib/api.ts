import * as SecureStore from 'expo-secure-store';
import { ApiError, createApiClient, type RequestOptions, type TokenProvider } from '@iqx/api-client';

const ACCESS_KEY = 'iqx.mobile.access-token';
const REFRESH_KEY = 'iqx.mobile.refresh-token';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v2';

export type TokenPair = { access_token: string; refresh_token: string; token_type: string };
export type MobileUser = { id: string; email: string; full_name?: string | null; role?: string; [key: string]: unknown };

class MobileTokenProvider implements TokenProvider {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  async load() {
    this.refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    this.accessToken = null;
  }

  getAccessToken() {
    return this.accessToken;
  }

  getRefreshToken() {
    return this.refreshToken;
  }

  async save(tokens: TokenPair) {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    await SecureStore.deleteItemAsync(ACCESS_KEY);
  }

  async clear() {
    this.accessToken = null;
    this.refreshToken = null;
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}

export const tokenProvider = new MobileTokenProvider();
export const rawApi = createApiClient({ baseUrl: API_BASE_URL, tokenProvider });

export function createIdempotencyKey(scope: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${scope}:${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = tokenProvider.getRefreshToken();
  if (!refreshToken) return false;
  try {
    const tokens = await rawApi<TokenPair>('auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } });
    await tokenProvider.save(tokens);
    return true;
  } catch {
    await tokenProvider.clear();
    return false;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  try {
    return await rawApi<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !retry || path.replace(/^\/+/, '') === 'auth/refresh') throw error;
    refreshPromise ??= refreshSession().finally(() => { refreshPromise = null; });
    if (!(await refreshPromise)) throw error;
    return rawApi<T>(path, options);
  }
}

export async function signIn(email: string, password: string): Promise<MobileUser> {
  const tokens = await rawApi<TokenPair>('auth/login', { method: 'POST', body: { email, password } });
  await tokenProvider.save(tokens);
  return api<MobileUser>('auth/me');
}

export async function register(input: { email: string; password: string; full_name: string }): Promise<MobileUser> {
  await rawApi('auth/register', { method: 'POST', body: input });
  return signIn(input.email, input.password);
}

export async function signOut(): Promise<void> {
  try { await api('auth/logout', { method: 'POST' }); } finally { await tokenProvider.clear(); }
}

export async function restoreSession(): Promise<MobileUser | null> {
  await tokenProvider.load();
  if (!tokenProvider.getRefreshToken()) return null;
  try {
    // A cold launch has no access token in memory; rotate the refresh token
    // before calling an authenticated endpoint instead of relying on a 401.
    if (!(await refreshSession())) return null;
    return await api<MobileUser>('auth/me');
  } catch {
    await tokenProvider.clear();
    return null;
  }
}

export { API_BASE_URL };

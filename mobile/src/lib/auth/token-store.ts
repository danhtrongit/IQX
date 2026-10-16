import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'iqx.v2.access_token';
const REFRESH_KEY = 'iqx.v2.refresh_token';

export type TokenPair = { access_token: string; refresh_token: string; token_type?: string };

let access: string | null = null;
let refresh: string | null = null;
let loaded = false;
let loading: Promise<void> | null = null;

/** Load tokens from SecureStore into the in-memory cache (idempotent). */
export function loadTokens(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const [a, r] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
        ]);
        // Do not clobber tokens saved while loading.
        if (access === null && refresh === null) {
          access = a;
          refresh = r;
        }
      } catch {
        // Keychain unavailable: behave as signed out.
      } finally {
        loaded = true;
        loading = null;
      }
    })();
  }
  return loading;
}

export function getAccessToken(): string | null {
  return access;
}

export function getRefreshToken(): string | null {
  return refresh;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  access = tokens.access_token;
  refresh = tokens.refresh_token;
  loaded = true;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.access_token),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token),
  ]).catch(() => undefined);
}

export async function clearTokens(): Promise<void> {
  access = null;
  refresh = null;
  loaded = true;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]).catch(() => undefined);
}

/** Test helper: reset the in-memory cache. */
export function __resetTokenCache(): void {
  access = null;
  refresh = null;
  loaded = false;
  loading = null;
}

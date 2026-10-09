import { API_BASE } from '../config';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  type TokenPair,
} from '../auth/token-store';
import { ApiError } from './errors';
import { emitSessionExpired } from './events';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serialisable body. */
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  /** Default 20s. Use a larger value for slow endpoints (e.g. backtests: 120_000). */
  timeoutMs?: number;
  /** Set false to skip the Authorization header and refresh-on-401. */
  auth?: boolean;
};

export const DEFAULT_TIMEOUT_MS = 20_000;

const AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isAuthPath(path: string): boolean {
  return AUTH_PATHS.includes(path.split('?', 1)[0]);
}

function buildUrl(path: string, query?: QueryParams): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const parts: string[] = [];
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (item === undefined || item === null || item === '') continue;
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
    }
  }
  const qs = parts.length ? (suffix.includes('?') ? '&' : '?') + parts.join('&') : '';
  return `${API_BASE}${suffix}${qs}`;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function retryValue(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return str(value);
}

function detailMessage(detail: unknown): string | undefined {
  if (str(detail)) return detail as string;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === 'object' ? str((d as { msg?: unknown }).msg) : undefined))
      .filter((m): m is string => !!m);
    if (msgs.length) return msgs.join(' · ');
  }
  if (detail && typeof detail === 'object') {
    const d = detail as { msg?: unknown; message?: unknown };
    return str(d.msg) ?? str(d.message);
  }
  return undefined;
}

type Headersish = { get(name: string): string | null };
type ResponseLike = {
  ok: boolean;
  status: number;
  headers: Headersish;
  text(): Promise<string>;
};

/** Build an ApiError from an error response. Supports {error:{...}}, {detail}, {message,code}. */
export async function parseError(response: ResponseLike): Promise<ApiError> {
  const raw = await response.text().catch(() => '');
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
    } catch {
      // non-JSON body
    }
  }
  const env =
    payload.error && typeof payload.error === 'object'
      ? (payload.error as Record<string, unknown>)
      : undefined;
  const details = env?.details ?? payload.details ?? payload.detail;
  const message =
    str(env?.message) ??
    detailMessage(payload.detail) ??
    str(payload.message) ??
    detailMessage(details) ??
    (raw && raw.length < 200 && !raw.trimStart().startsWith('<') ? raw : undefined) ??
    `Yêu cầu thất bại (${response.status})`;
  return new ApiError(message, response.status, {
    code: str(env?.code) ?? str(payload.code),
    details,
    requestId:
      str(env?.request_id) ??
      str(env?.requestId) ??
      str(payload.request_id) ??
      str(payload.requestId) ??
      str(response.headers.get('X-Request-ID')),
    retryAfter:
      retryValue(env?.retry_after) ??
      retryValue(env?.retryAfter) ??
      retryValue(payload.retry_after) ??
      retryValue(payload.retryAfter) ??
      retryValue(response.headers.get('Retry-After')),
  });
}

/** Unwrap a `{data: ...}` envelope when present; otherwise return the body as is. */
export function unwrapData<T>(body: unknown): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

async function parseBody(response: ResponseLike): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('Phản hồi máy chủ không hợp lệ', 502, { code: 'INVALID_RESPONSE' });
  }
}

/** fetch with a timeout; maps network failures to ApiError(status 0). */
async function fetchWithTimeout(
  url: string,
  init: Record<string, unknown>,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<ResponseLike> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return (await fetch(url, { ...init, signal: controller.signal })) as unknown as ResponseLike;
  } catch (error) {
    if (timedOut) {
      throw new ApiError('Máy chủ phản hồi quá lâu. Vui lòng thử lại.', 0, { code: 'TIMEOUT' });
    }
    if (external?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      const abort = new Error('Aborted');
      abort.name = 'AbortError';
      throw abort;
    }
    throw new ApiError('Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.', 0, {
      code: 'NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

type RefreshOutcome = 'refreshed' | 'expired';
let refreshPromise: Promise<RefreshOutcome> | null = null;

/** Single-flight token refresh. A 401 from /auth/refresh clears the session. */
function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<RefreshOutcome> => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return 'expired';
      const response = await fetchWithTimeout(
        buildUrl('/auth/refresh'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        DEFAULT_TIMEOUT_MS,
      );
      if (response.status === 401) return 'expired';
      if (!response.ok) throw await parseError(response);
      const tokens = (await parseBody(response)) as Partial<TokenPair> | undefined;
      if (!tokens?.access_token || !tokens.refresh_token) {
        throw new ApiError('Phản hồi làm mới phiên không hợp lệ', 502, {
          code: 'INVALID_TOKEN_RESPONSE',
        });
      }
      await saveTokens(tokens as TokenPair);
      return 'refreshed';
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function expireSession(): Promise<void> {
  await clearTokens();
  emitSessionExpired();
}

/**
 * Perform a JSON API request. Returns the parsed body as is (use `unwrapData` / `apiData`
 * for `{data}` envelopes). 204/empty body resolves to undefined.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, signal, timeoutMs = DEFAULT_TIMEOUT_MS, auth = true } = options;
  const url = buildUrl(path, query);
  const serialized = body === undefined ? undefined : JSON.stringify(body);

  const send = (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (serialized !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return fetchWithTimeout(url, { method, headers, body: serialized }, timeoutMs, signal);
  };

  const usedToken = auth ? getAccessToken() : null;
  let response = await send(usedToken);

  if (response.status === 401 && auth && usedToken && !isAuthPath(path)) {
    const latest = getAccessToken();
    let retried = false;
    if (latest && latest !== usedToken) {
      // Another request already refreshed; reuse its token.
      response = await send(latest);
      retried = true;
    } else {
      const outcome = await refreshSession();
      const next = getAccessToken();
      if (outcome === 'refreshed' && next) {
        response = await send(next);
        retried = true;
      }
    }
    if (!retried || response.status === 401) {
      if (!signal?.aborted) await expireSession();
    }
  }

  if (!response.ok) throw await parseError(response);
  return (await parseBody(response)) as T;
}

/** Convenience: apiRequest + unwrapData. */
export async function apiData<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return unwrapData<T>(await apiRequest(path, options));
}

import { mockFetch } from '@/test-utils/fetch';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens, __resetTokenCache } from '@/lib/auth/token-store';
import { ApiError, apiRequest, onSessionExpired, unwrapData } from '..';

const pair = (n: number) => ({ access_token: `a${n}`, refresh_token: `r${n}`, token_type: 'bearer' });

beforeEach(async () => {
  __resetTokenCache();
  await clearTokens();
});

describe('envelope parsing', () => {
  it('parses {error:{...}} with all fields', async () => {
    mockFetch(() => ({
      status: 422,
      body: { error: { code: 'CONFIG_INVALID', message: 'Cấu hình sai', details: [{ path: 'x' }], request_id: 'req1', retry_after: 5 } },
    }));
    const err = await apiRequest('/x').catch((e: any) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'CONFIG_INVALID', message: 'Cấu hình sai', requestId: 'req1', retryAfter: 5 });
    expect((err as any).details).toEqual([{ path: 'x' }]);
  });

  it('tolerates {detail} string, {detail:[{msg}]} and {message,code}', async () => {
    mockFetch(({ url }) =>
      url.endsWith('/a') ? { status: 400, body: { detail: 'bad' } }
      : url.endsWith('/b') ? { status: 422, body: { detail: [{ msg: 'm1' }, { msg: 'm2' }] } }
      : { status: 409, body: { message: 'dup', code: 'DUP' } },
    );
    await expect(apiRequest('/a')).rejects.toMatchObject({ message: 'bad', status: 400 });
    await expect(apiRequest('/b')).rejects.toMatchObject({ message: 'm1 · m2' });
    await expect(apiRequest('/c')).rejects.toMatchObject({ message: 'dup', code: 'DUP' });
  });

  it('falls back to a Vietnamese message and reads headers', async () => {
    mockFetch(() => ({ status: 503, raw: '<html>oops</html>', headers: { 'X-Request-ID': 'h1', 'Retry-After': '7' } }));
    await expect(apiRequest('/x')).rejects.toMatchObject({ message: 'Yêu cầu thất bại (503)', requestId: 'h1', retryAfter: '7' });
  });

  it('returns undefined for 204/empty and unwraps {data}', async () => {
    mockFetch(({ url }) => (url.endsWith('/empty') ? { status: 204 } : { body: { data: { a: 1 } } }));
    await expect(apiRequest('/empty')).resolves.toBeUndefined();
    const raw = await apiRequest('/d');
    expect(raw).toEqual({ data: { a: 1 } });
    expect(unwrapData<{ a: number }>(raw)).toEqual({ a: 1 });
    expect(unwrapData({ a: 1 })).toEqual({ a: 1 });
    expect(unwrapData([1, 2])).toEqual([1, 2]);
  });

  it('builds query strings, JSON body and Bearer header', async () => {
    await saveTokens(pair(1));
    const { calls } = mockFetch(() => ({ body: {} }));
    await apiRequest('/p', { method: 'POST', body: { x: 1 }, query: { a: 1, b: undefined, c: 'x y', d: [1, 2] } });
    expect(calls[0].url).toMatch(/\/p\?a=1&c=x%20y&d=1&d=2$/);
    expect(calls[0].init.body).toBe('{"x":1}');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer a1', 'Content-Type': 'application/json' });
  });

  it('maps network failure to ApiError status 0', async () => {
    (globalThis as any).fetch = jest.fn(async () => { throw new TypeError('Network request failed'); });
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('times out via AbortController', async () => {
    (globalThis as any).fetch = jest.fn((_u: string, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => { const e = new Error('x'); e.name = 'AbortError'; rej(e); });
    }));
    await expect(apiRequest('/slow', { timeoutMs: 20 })).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
  });
});

describe('refresh on 401', () => {
  it('refreshes then retries with the new token', async () => {
    await saveTokens(pair(1));
    const { calls } = mockFetch(
      ({ url }) => (url.endsWith('/auth/refresh') ? { body: pair(2) } : undefined),
      ({ init }) => (init.headers.Authorization === 'Bearer a2' ? { body: { ok: true } } : { status: 401, body: { detail: 'expired' } }),
    );
    await expect(apiRequest('/me')).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url.split('/api')[0] && c.url.replace(/^.*\/api\/v2/, ''))).toEqual(['/me', '/auth/refresh', '/me']);
    expect(getAccessToken()).toBe('a2');
    expect(getRefreshToken()).toBe('r2');
  });

  it('clears tokens and emits session expired when refresh returns 401', async () => {
    await saveTokens(pair(1));
    const expired = jest.fn();
    const off = onSessionExpired(expired);
    mockFetch(({ url }) => (url.endsWith('/auth/refresh') ? { status: 401, body: { detail: 'bad' } } : { status: 401, body: { detail: 'expired' } }));
    await expect(apiRequest('/me')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    off();
  });

  it('single-flights concurrent 401s into one refresh', async () => {
    await saveTokens(pair(1));
    const { calls } = mockFetch(
      ({ url }) => (url.endsWith('/auth/refresh') ? { body: pair(2) } : undefined),
      ({ init }) => (init.headers.Authorization === 'Bearer a2' ? { body: { ok: true } } : { status: 401 }),
    );
    const [a, b] = await Promise.all([apiRequest('/one'), apiRequest('/two')]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('does not refresh for auth endpoints or when auth:false', async () => {
    await saveTokens(pair(1));
    const expired = jest.fn();
    const off = onSessionExpired(expired);
    const { calls } = mockFetch(() => ({ status: 401, body: { detail: 'Sai mật khẩu' } }));
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest('/x', { auth: false })).rejects.toMatchObject({ status: 401 });
    expect(calls.some((c) => c.url.endsWith('/auth/refresh'))).toBe(false);
    expect(expired).not.toHaveBeenCalled();
    off();
  });

  it('keeps the session when refresh fails with a non-401 error', async () => {
    await saveTokens(pair(1));
    mockFetch(({ url }) => (url.endsWith('/auth/refresh') ? { status: 503 } : { status: 401 }));
    await expect(apiRequest('/me')).rejects.toMatchObject({ status: 503 });
    expect(getRefreshToken()).toBe('r1');
  });
});

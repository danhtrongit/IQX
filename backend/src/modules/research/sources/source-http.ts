// Polite HTTP client for broker-report sources: https only, host allowlist, per-host rate limit,
// timeouts, bounded retries and a size-capped PDF download with a magic-bytes check.

export const SOURCE_HOST_ALLOWLIST: ReadonlySet<string> = new Set([
  'finance.vietstock.vn',
  'static1.vietstock.vn',
  'api-finfo.vndirect.com.vn',
  'www.vndirect.com.vn',
]);

export const SOURCE_USER_AGENT = 'Mozilla/5.0 IQX-backend-v2/1.0';

/** Vietstock asks for at most one request per 2 seconds; the other hosts are called gently too. */
const DEFAULT_MIN_INTERVAL_MS: Record<string, number> = {
  'finance.vietstock.vn': 2000,
  'static1.vietstock.vn': 2000,
  'api-finfo.vndirect.com.vn': 1000,
  'www.vndirect.com.vn': 1000,
};

export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'SourceHttpError';
  }
}

export interface SourceHttpOptions {
  fetchImpl?: typeof fetch;
  /** Overrides the per-host minimum interval (ms). `0` disables throttling (tests). */
  minIntervalMs?: number | Record<string, number>;
  timeoutMs?: number;
  downloadTimeoutMs?: number;
  /** Retries after the first attempt (429 / 5xx / network). */
  retries?: number;
  backoffMs?: number;
  /** Maximum PDF size in MB (MEDIA_MAX_PDF_MB). */
  maxPdfMb?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export interface SourceTextResponse {
  status: number;
  text: string;
  headers: Headers;
}

const MAX_REDIRECTS = 3;
const MAX_RETRY_AFTER_MS = 30_000;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceHttpError(`Invalid URL: ${raw.slice(0, 120)}`);
  }
  if (url.protocol !== 'https:') throw new SourceHttpError(`Only https is allowed: ${url.origin}`);
  if (url.username || url.password) throw new SourceHttpError('Credentials in URL are not allowed');
  if (!SOURCE_HOST_ALLOWLIST.has(url.hostname))
    throw new SourceHttpError(`Host not allowed: ${url.hostname}`);
  return url;
}

export class SourceHttp {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly downloadTimeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly maxPdfBytes: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly intervals: number | Record<string, number>;
  /** host → timestamp of the last reserved request slot. */
  private readonly lastSlot = new Map<string, number>();

  constructor(options: SourceHttpOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 120_000;
    this.retries = options.retries ?? 3;
    this.backoffMs = options.backoffMs ?? 1000;
    this.maxPdfBytes = Math.floor((options.maxPdfMb ?? 100) * 1024 * 1024);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.intervals = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  }

  async text(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<SourceTextResponse> {
    const response = await this.request(url, init, signal, this.timeoutMs);
    return { status: response.status, headers: response.headers, text: await response.text() };
  }

  /** Downloads a PDF into memory, enforcing the size cap and the `%PDF-` magic. */
  async binary(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await this.request(url, init, signal, this.downloadTimeoutMs);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > this.maxPdfBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new SourceHttpError(`File too large (${declared} bytes)`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new SourceHttpError('Empty response body');
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxPdfBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SourceHttpError(`File too large (> ${this.maxPdfBytes} bytes)`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
      throw new SourceHttpError('Response is not a PDF (missing %PDF- header)');
    }
    return bytes;
  }

  private intervalFor(host: string): number {
    if (typeof this.intervals === 'number') return this.intervals;
    return this.intervals[host] ?? 1000;
  }

  /** Reserves the next slot for the host synchronously, so concurrent callers are serialized. */
  private async throttle(host: string, signal?: AbortSignal): Promise<void> {
    const interval = this.intervalFor(host);
    if (interval <= 0) return;
    const now = this.now();
    const slot = Math.max(now, (this.lastSlot.get(host) ?? 0) + interval);
    this.lastSlot.set(host, slot);
    if (slot > now) await this.sleep(slot - now, signal);
  }

  private async request(
    rawUrl: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.once(rawUrl, init, signal, timeoutMs);
      } catch (error) {
        if (signal?.aborted) throw error;
        const retryable = error instanceof SourceHttpError ? error.retryable : true;
        if (!retryable || attempt >= this.retries) throw error;
        const retryAfter = error instanceof SourceHttpError ? this.retryAfterMs(error) : null;
        await this.sleep(retryAfter ?? this.backoffMs * 2 ** attempt, signal);
        attempt += 1;
      }
    }
  }

  private retryAfterMs(error: SourceHttpError): number | null {
    const match = /retry-after=(\d+)/.exec(error.message);
    if (!match) return null;
    return Math.min(MAX_RETRY_AFTER_MS, Number(match[1]) * 1000);
  }

  private async once(
    rawUrl: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    let url = assertAllowedUrl(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await this.throttle(url.hostname, signal);
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          redirect: 'manual',
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          headers: {
            'user-agent': SOURCE_USER_AGENT,
            accept: '*/*',
            ...(init.headers as Record<string, string>),
          },
        });
      } catch (error) {
        throw new SourceHttpError(
          `Network error for ${url.hostname}: ${(error as Error).message}`,
          null,
          true,
        );
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location)
          throw new SourceHttpError(
            `Redirect without location (${response.status})`,
            response.status,
          );
        url = assertAllowedUrl(new URL(location, url).toString());
        // A redirect is replayed as a GET (POST bodies are not forwarded).
        init = { ...init, method: 'GET', body: undefined };
        continue;
      }
      if (response.ok) return response;
      await response.body?.cancel().catch(() => undefined);
      const retryable = response.status === 429 || response.status >= 500;
      const retryAfter = response.headers.get('retry-after');
      const suffix = retryAfter && /^\d+$/.test(retryAfter) ? ` retry-after=${retryAfter}` : '';
      throw new SourceHttpError(
        `HTTP ${response.status} from ${url.hostname}${url.pathname}${suffix}`,
        response.status,
        retryable,
      );
    }
    throw new SourceHttpError('Too many redirects');
  }
}

import { Injectable } from '@nestjs/common';

export const MARKET_UPSTREAM_ORIGINS = new Set([
  'https://trading.vietcap.com.vn',
  'https://iq.vietcap.com.vn',
  'https://dchart-api.vndirect.com.vn',
  'https://api-finfo.vndirect.com.vn',
  'https://kbbuddywts.kbsec.com.vn',
  'https://data.maybanktrade.com.vn',
  'https://fmarket.vn',
  'https://api.fmarket.vn',
  'https://sjc.com.vn',
  'https://www.vietcombank.com.vn',
  'https://research.aseansc.com.vn',
  'https://assets.msn.com',
  'https://query1.finance.yahoo.com',
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
  'https://ai.vietcap.com.vn',
  'https://api.simplize.vn',
  'https://docs.google.com',
  'https://sheets.googleapis.com',
  'https://vnexpress.net',
  'https://tuoitre.vn',
  'https://cafebiz.vn',
  'https://vietstock.vn',
  'https://thanhnien.vn',
  'https://dantri.com.vn',
  'https://vietnamnet.vn',
]);

export interface MarketRequestOptions {
  timeoutMs?: number;
  cacheTtlMs?: number;
  cacheKey?: string;
  retries?: number;
}

export class MarketTransportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MarketTransportError';
  }
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

/** Shared bounded HTTP transport. It never accepts an origin outside the compile-time allowlist. */
@Injectable()
export class MarketHttpTransport {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  requestJson<T>(
    url: string,
    init: RequestInit = {},
    options: MarketRequestOptions = {},
  ): Promise<T> {
    return Promise.resolve().then(() =>
      this.request<T>(url, init, options, async (response) => {
        try {
          return (await response.json()) as T;
        } catch (error) {
          throw new MarketTransportError('Upstream returned invalid JSON', response.status, error);
        }
      }),
    );
  }

  requestText(
    url: string,
    init: RequestInit = {},
    options: MarketRequestOptions = {},
  ): Promise<string> {
    return Promise.resolve().then(() =>
      this.request<string>(url, init, options, (response) => response.text()),
    );
  }

  private request<T>(
    input: string,
    init: RequestInit,
    options: MarketRequestOptions,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    const url = this.validateUrl(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const cacheKey =
      options.cacheKey ?? (method === 'GET' ? `${method}:${url.toString()}` : undefined);
    const ttl = Math.max(0, options.cacheTtlMs ?? 0);
    if (cacheKey && ttl > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);
      if (cached) this.cache.delete(cacheKey);
      const pending = this.inFlight.get(cacheKey);
      if (pending) return pending as Promise<T>;
    }

    const promise = this.fetchWithBudget(url, init, options, parse);
    if (!cacheKey || ttl <= 0) return promise;
    this.inFlight.set(cacheKey, promise);
    void promise
      .then(
        (value) => this.cache.set(cacheKey, { expiresAt: Date.now() + ttl, value }),
        () => undefined,
      )
      .finally(() => this.inFlight.delete(cacheKey));
    return promise;
  }

  private async fetchWithBudget<T>(
    url: URL,
    init: RequestInit,
    options: MarketRequestOptions,
    parse: (response: Response) => Promise<T>,
  ): Promise<T> {
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 12_000, 100), 30_000);
    const retries = Math.min(Math.max(options.retries ?? 2, 0), 3);
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const response = await globalThis.fetch(url, {
          ...init,
          redirect: 'error',
          signal: AbortSignal.any([
            AbortSignal.timeout(remaining),
            ...(init.signal ? [init.signal] : []),
          ]),
        });
        if (response.ok) return await parse(response);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === retries) {
          throw new MarketTransportError(`Upstream HTTP ${response.status}`, response.status);
        }
        lastError = new MarketTransportError(`Upstream HTTP ${response.status}`, response.status);
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1_000, 1_000)
          : Math.min(100 * 2 ** attempt, 800);
        await this.delayWithinBudget(delay, deadline);
      } catch (error) {
        if (error instanceof MarketTransportError && error.status && error.status < 500)
          throw error;
        lastError = error;
        if (attempt === retries) break;
        await this.delayWithinBudget(Math.min(100 * 2 ** attempt, 800), deadline);
      }
    }
    throw lastError instanceof MarketTransportError
      ? lastError
      : new MarketTransportError('Upstream request failed or timed out', undefined, lastError);
  }

  private validateUrl(input: string): URL {
    let url: URL;
    try {
      url = new URL(input);
    } catch (error) {
      throw new MarketTransportError('Invalid upstream URL', undefined, error);
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !MARKET_UPSTREAM_ORIGINS.has(url.origin)
    ) {
      throw new MarketTransportError(`Upstream origin is not allowed: ${url.origin}`);
    }
    return url;
  }

  private async delayWithinBudget(delayMs: number, deadline: number): Promise<void> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, remaining)));
  }
}

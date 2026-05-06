/**
 * In-flight request deduplication for the market data API layer.
 *
 * Multiple React hooks calling the same API endpoint will share a single
 * in-flight Promise. This eliminates redundant fetch calls within a page load.
 *
 * Cache entries expire after a configurable TTL (default 10s) to allow refresh.
 */

import type { ApiResult } from "./api";

interface CacheEntry<T> {
  promise: Promise<ApiResult<T>>;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<unknown>>();

/** Default cache TTL in milliseconds */
const DEFAULT_TTL_MS = 10_000; // 10 seconds

/**
 * Deduplicate an API call by key.
 *
 * If a request with the same key is already in-flight (or cached and not expired),
 * returns the existing Promise. Otherwise, starts a new request.
 *
 * @param key - Unique string for this request (e.g. endpoint path + params)
 * @param fetcher - Function that returns the API result promise
 * @param ttlMs - Cache TTL in milliseconds (default 10s)
 */
export function dedupeRequest<T>(
  key: string,
  fetcher: () => Promise<ApiResult<T>>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<ApiResult<T>> {
  const now = Date.now();
  const existing = _cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = fetcher().finally(() => {
    // Allow gc after TTL even if resolved early
    setTimeout(() => {
      const entry = _cache.get(key);
      if (entry && entry.promise === promise) {
        _cache.delete(key);
      }
    }, ttlMs);
  });

  _cache.set(key, { promise: promise as Promise<ApiResult<unknown>>, expiresAt: now + ttlMs });
  return promise;
}

/**
 * Clear all cached/in-flight requests. Used for refresh actions.
 */
export function clearRequestCache(): void {
  _cache.clear();
}

/**
 * Clear a specific cache entry by key. Used for targeted refresh.
 */
export function clearRequestCacheKey(key: string): void {
  _cache.delete(key);
}

/**
 * Bounded TTL in-memory cache with single-flight promise deduplication and
 * optional stale-on-error fallback for market-overview widget aggregators.
 */
import { Injectable } from '@nestjs/common';

export interface CacheResult<T> {
  value: T;
  stale: boolean;
  cachedAt: number;
}

export interface CacheFetchOptions {
  /** Freshness window in milliseconds. */
  ttlMs: number;
  /** Additional window after expiry where stale data may be served on upstream errors. */
  maxStaleMs?: number;
  /** Whether to return stale cached data when a refresh throws (default: true). */
  allowStaleOnError?: boolean;
}

export interface MarketOverviewCacheConfig {
  maxEntries?: number;
  defaultMaxStaleMs?: number;
  now?: () => number;
}

interface CacheEntry {
  value: unknown;
  cachedAt: number;
  expiresAt: number;
  staleUntil: number;
}

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_STALE_MS = 15 * 60_000;

@Injectable()
export class MarketOverviewCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheResult<unknown>>>();
  private readonly maxEntries: number;
  private readonly defaultMaxStaleMs: number;
  private readonly now: () => number;

  constructor(config?: MarketOverviewCacheConfig) {
    this.maxEntries = Math.max(1, config?.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.defaultMaxStaleMs = Math.max(0, config?.defaultMaxStaleMs ?? DEFAULT_MAX_STALE_MS);
    this.now = config?.now ?? (() => Date.now());
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheFetchOptions,
  ): Promise<CacheResult<T>> {
    const now = this.now();
    const existing = this.entries.get(key);

    if (existing && now < existing.expiresAt) {
      // Refresh insertion order for LRU eviction.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return {
        value: existing.value as T,
        stale: false,
        cachedAt: existing.cachedAt,
      };
    }

    const active = this.inflight.get(key);
    if (active) {
      return (await active) as CacheResult<T>;
    }

    const ttlMs = Math.max(0, options.ttlMs);
    const maxStaleMs = Math.max(0, options.maxStaleMs ?? this.defaultMaxStaleMs);
    const allowStaleOnError = options.allowStaleOnError ?? true;

    const promise: Promise<CacheResult<unknown>> = (async () => {
      try {
        const value = await fetcher();
        const completedAt = this.now();
        this.writeEntry(key, value, completedAt, ttlMs, maxStaleMs);
        return {
          value,
          stale: false,
          cachedAt: completedAt,
        };
      } catch (error) {
        const failedAt = this.now();
        const fallback = this.entries.get(key);
        if (allowStaleOnError && fallback && failedAt <= fallback.staleUntil) {
          return {
            value: fallback.value,
            stale: true,
            cachedAt: fallback.cachedAt,
          };
        }
        throw error;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return (await promise) as CacheResult<T>;
  }

  peek<T>(key: string): CacheResult<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const now = this.now();
    if (now > entry.staleUntil) {
      this.entries.delete(key);
      return undefined;
    }
    return {
      value: entry.value as T,
      stale: now >= entry.expiresAt,
      cachedAt: entry.cachedAt,
    };
  }

  set<T>(key: string, value: T, ttlMs: number, maxStaleMs?: number): void {
    this.writeEntry(
      key,
      value,
      this.now(),
      Math.max(0, ttlMs),
      Math.max(0, maxStaleMs ?? this.defaultMaxStaleMs),
    );
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private writeEntry(
    key: string,
    value: unknown,
    cachedAt: number,
    ttlMs: number,
    maxStaleMs: number,
  ): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, {
      value,
      cachedAt,
      expiresAt: cachedAt + ttlMs,
      staleUntil: cachedAt + ttlMs + maxStaleMs,
    });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

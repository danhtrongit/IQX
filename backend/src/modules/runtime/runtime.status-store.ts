import { Injectable } from '@nestjs/common';

import { RedisService } from '../../platform/redis/redis.service.js';
import type { JobExecutionStatus } from './runtime.types.js';

const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const FALLBACK_CAPACITY = 1_000;
const MAX_DETAIL_BYTES = 32 * 1_024;
const MAX_DETAIL_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 100;
const MAX_STRING_LENGTH = 4_096;
const MAX_DETAIL_NODES = 1_000;

type FallbackEntry = { status: JobExecutionStatus; expiresAt: number };

type DetailLimits = {
  truncated: boolean;
  reasons: Set<string>;
  nodes: number;
  seen: WeakSet<object>;
};

function sanitizeValue(value: unknown, depth: number, limits: DetailLimits): unknown {
  limits.nodes += 1;
  if (limits.nodes > MAX_DETAIL_NODES) {
    limits.truncated = true;
    limits.reasons.add('node-count');
    return '[truncated]';
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length <= MAX_STRING_LENGTH) return value;
    limits.truncated = true;
    limits.reasons.add('string-length');
    return `${value.slice(0, MAX_STRING_LENGTH)}…`;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (limits.seen.has(value)) {
    limits.truncated = true;
    limits.reasons.add('circular-reference');
    return '[circular]';
  }
  if (depth >= MAX_DETAIL_DEPTH) {
    limits.truncated = true;
    limits.reasons.add('depth');
    return '[truncated]';
  }
  limits.seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS) {
      limits.truncated = true;
      limits.reasons.add('collection-size');
    }
    const result = value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, limits));
    limits.seen.delete(value);
    return result;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_COLLECTION_ITEMS) {
    limits.truncated = true;
    limits.reasons.add('collection-size');
  }
  for (const [key, item] of entries.slice(0, MAX_COLLECTION_ITEMS)) {
    result[key] = sanitizeValue(item, depth + 1, limits);
  }
  limits.seen.delete(value);
  return result;
}

/**
 * Bounds status snapshots before they reach Redis or the in-process fallback. Top-level scalar
 * fields (including counters, codes and diagnostic metadata) are retained when a detail exceeds
 * the byte budget; `_runtimeStatus` documents any truncation applied to the snapshot.
 */
function boundedDetail(
  detail: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const limits: DetailLimits = {
    truncated: false,
    reasons: new Set(),
    nodes: 0,
    seen: new WeakSet(),
  };
  const sanitized = sanitizeValue(detail, 0, limits) as Record<string, unknown>;
  const annotated = limits.truncated
    ? { ...sanitized, _runtimeStatus: { truncated: true, reasons: [...limits.reasons] } }
    : sanitized;
  if (Buffer.byteLength(JSON.stringify(annotated), 'utf8') <= MAX_DETAIL_BYTES) {
    return annotated;
  }

  const summary: Record<string, unknown> = {
    _runtimeStatus: {
      truncated: true,
      reasons: [...limits.reasons, 'byte-size'],
      maxBytes: MAX_DETAIL_BYTES,
    },
  };
  const priority = /(count|total|code|error|reason|status|diagnostic|metadata|meta)/i;
  const entries = Object.entries(sanitized).sort(([left], [right]) => {
    return Number(priority.test(right)) - Number(priority.test(left));
  });
  for (const [key, value] of entries) {
    const candidate = { ...summary, [key]: value };
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= MAX_DETAIL_BYTES) {
      summary[key] = value;
    }
  }
  return summary;
}

@Injectable()
export class RuntimeStatusStore {
  private readonly fallback = new Map<string, FallbackEntry>();

  constructor(private readonly redis: RedisService) {}

  async put(status: JobExecutionStatus): Promise<void> {
    const bounded = this.bound(status);
    this.cache(bounded, true);
    if (!this.redis.isEnabled()) return;
    const key = this.redis.key('runtime', 'job-status', status.jobId);
    try {
      await this.redis.execute(async (client) => {
        await client.set(key, JSON.stringify(bounded), 'EX', RETENTION_SECONDS);
      });
    } catch {
      // The in-process copy remains truthful while Redis is temporarily unavailable.
    }
  }

  async putIfAbsent(status: JobExecutionStatus): Promise<boolean> {
    const bounded = this.bound(status);
    const locallyInserted = this.cache(bounded, false);
    if (!this.redis.isEnabled()) return locallyInserted;
    if (!locallyInserted) return false;
    const key = this.redis.key('runtime', 'job-status', status.jobId);
    try {
      const result = await this.redis.execute(async (client) => {
        const inserted = await client.set(
          key,
          JSON.stringify(bounded),
          'EX',
          RETENTION_SECONDS,
          'NX',
        );
        return { inserted: inserted === 'OK', existing: inserted ? null : await client.get(key) };
      });
      if (!result.inserted && result.existing) {
        this.cache(this.bound(JSON.parse(result.existing) as JobExecutionStatus), true);
      }
      return result.inserted;
    } catch {
      return locallyInserted;
    }
  }

  async get(jobId: string): Promise<JobExecutionStatus | null> {
    if (this.redis.isEnabled()) {
      try {
        const raw = await this.redis.execute((client) =>
          client.get(this.redis.key('runtime', 'job-status', jobId)),
        );
        if (raw) {
          const status = this.bound(JSON.parse(raw) as JobExecutionStatus);
          this.cache(status, true);
          return status;
        }
      } catch {
        // Fall through to the local status cache.
      }
    }
    const entry = this.fallback.get(jobId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.fallback.delete(jobId);
      return null;
    }
    return entry.status;
  }

  private bound(status: JobExecutionStatus): JobExecutionStatus {
    const detail = boundedDetail(status.detail);
    return { ...status, ...(detail ? { detail } : { detail: undefined }) };
  }

  private cache(status: JobExecutionStatus, overwrite: boolean): boolean {
    this.pruneExpired();
    if (!overwrite && this.fallback.has(status.jobId)) return false;
    this.fallback.delete(status.jobId);
    this.fallback.set(status.jobId, {
      status,
      expiresAt: Date.now() + RETENTION_SECONDS * 1_000,
    });
    while (this.fallback.size > FALLBACK_CAPACITY) {
      const oldest = this.fallback.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.fallback.delete(oldest);
    }
    return true;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [jobId, entry] of this.fallback) {
      if (entry.expiresAt > now) break;
      this.fallback.delete(jobId);
    }
  }
}

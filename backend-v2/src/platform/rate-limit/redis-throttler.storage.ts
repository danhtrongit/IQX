import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';

import { RedisService } from '../redis/redis.service.js';
import type { InfrastructureHealth } from '../redis/redis.types.js';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const RATE_LIMIT_UNAVAILABLE = {
  code: 'RATE_LIMIT_UNAVAILABLE',
  message: 'Rate limit service is unavailable',
} as const;

// Fixed-window counter and block state are updated in one Redis operation.
// KEYS[1] is the hit counter and KEYS[2] is the independent block marker.
export const THROTTLE_INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local blockedHits = tonumber(redis.call('GET', KEYS[1])) or (tonumber(ARGV[2]) + 1)
  local counterTtl = redis.call('PTTL', KEYS[1])
  if counterTtl < 0 then counterTtl = blockTtl end
  return {blockedHits, counterTtl, 1, blockTtl}
end

local hits = redis.call('INCR', KEYS[1])
local counterTtl = redis.call('PTTL', KEYS[1])
if hits == 1 or counterTtl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  counterTtl = tonumber(ARGV[1])
end

if hits > tonumber(ARGV[2]) then
  local blockDuration = tonumber(ARGV[3])
  redis.call('SET', KEYS[2], '1', 'PX', blockDuration)
  redis.call('PEXPIRE', KEYS[1], blockDuration)
  return {hits, blockDuration, 1, blockDuration}
end

return {hits, counterTtl, 0, 0}
`;

export const THROTTLE_HEALTH_SCRIPT = `
redis.call('SET', KEYS[1], '0', 'PX', ARGV[1])
local initial = redis.call('GET', KEYS[1])
local incremented = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
local expirySet = redis.call('PEXPIRE', KEYS[1], ARGV[1])
local deleted = redis.call('DEL', KEYS[1])

if initial == '0' and incremented == 1 and ttl > 0 and expirySet == 1 and deleted == 1 then
  return 1
end
return 0
`;

const HEALTH_KEY_TTL_MS = 1_000;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async health(): Promise<InfrastructureHealth> {
    if (!this.redis.isEnabled()) {
      return { status: 'disabled' };
    }

    const key = this.redis.key('throttle', 'health', randomUUID());
    try {
      const result = await this.redis.execute((client) =>
        client.eval(THROTTLE_HEALTH_SCRIPT, 1, key, HEALTH_KEY_TTL_MS),
      );
      return { status: Number(result) === 1 ? 'up' : 'down' };
    } catch {
      return { status: 'down' };
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = this.redis.key('throttle', key);
    const blockKey = `${counterKey}:block`;
    const effectiveTtl = Math.max(1, ttl);
    const effectiveLimit = Math.max(0, limit);
    const effectiveBlockDuration = Math.max(1, blockDuration);

    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          THROTTLE_INCREMENT_SCRIPT,
          2,
          counterKey,
          blockKey,
          effectiveTtl,
          effectiveLimit,
          effectiveBlockDuration,
        ),
      );
      return this.toRecord(raw);
    } catch {
      // Never expose Redis connection details or fall back to per-process memory.
      throw new ServiceUnavailableException(RATE_LIMIT_UNAVAILABLE);
    }
  }

  private toRecord(raw: unknown): ThrottlerStorageRecord {
    if (!Array.isArray(raw) || raw.length !== 4) {
      throw new ServiceUnavailableException(RATE_LIMIT_UNAVAILABLE);
    }

    const values = raw.map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value))) {
      throw new ServiceUnavailableException(RATE_LIMIT_UNAVAILABLE);
    }

    const [totalHits = 0, ttlMs = 0, blocked = 0, blockTtlMs = 0] = values;
    return {
      totalHits,
      timeToExpire: this.toSeconds(ttlMs),
      isBlocked: blocked === 1,
      timeToBlockExpire: this.toSeconds(blockTtlMs),
    };
  }

  private toSeconds(milliseconds: number): number {
    return Math.max(0, Math.ceil(milliseconds / 1_000));
  }
}

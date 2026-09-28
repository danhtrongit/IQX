import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import { createRateLimitOptions } from '../../src/platform/rate-limit/rate-limit.options.js';
import {
  RedisThrottlerStorage,
  THROTTLE_HEALTH_SCRIPT,
  THROTTLE_INCREMENT_SCRIPT,
} from '../../src/platform/rate-limit/redis-throttler.storage.js';
import type { RedisService } from '../../src/platform/redis/redis.service.js';

const config = (overrides: Partial<Environment> = {}): ConfigService<Environment, true> => {
  const environment = {
    APP_ENV: 'test',
    REDIS_ENABLED: false,
    RATE_LIMIT_MAX: 60,
    RATE_LIMIT_TTL_MS: 60_000,
    ...overrides,
  } as Environment;

  return {
    get: vi.fn((key: keyof Environment) => environment[key]),
  } as unknown as ConfigService<Environment, true>;
};

const redisService = (result: unknown): RedisService =>
  ({
    isEnabled: vi.fn(() => true),
    key: vi.fn((...segments: string[]) => `iqx:test:v2:${segments.join(':')}`),
    execute: vi.fn(async (operation: (client: { eval: ReturnType<typeof vi.fn> }) => unknown) => {
      const client = { eval: vi.fn(async () => result) };
      return operation(client);
    }),
  }) as unknown as RedisService;

describe('RedisThrottlerStorage', () => {
  it('reports up only after exercising the Redis commands required by throttling', async () => {
    const redis = redisService(1);
    const storage = new RedisThrottlerStorage(redis);

    await expect(storage.health()).resolves.toEqual({ status: 'up' });
    expect(redis.key).toHaveBeenCalledWith('throttle', 'health', expect.any(String));
    expect(THROTTLE_HEALTH_SCRIPT).toContain("redis.call('SET', KEYS[1], '0', 'PX', ARGV[1])");
    expect(THROTTLE_HEALTH_SCRIPT).toContain("redis.call('GET', KEYS[1])");
    expect(THROTTLE_HEALTH_SCRIPT).toContain("redis.call('INCR', KEYS[1])");
    expect(THROTTLE_HEALTH_SCRIPT).toContain("redis.call('PTTL', KEYS[1])");
    expect(THROTTLE_HEALTH_SCRIPT).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
    expect(THROTTLE_HEALTH_SCRIPT).toContain("redis.call('DEL', KEYS[1])");

    const operation = vi.mocked(redis.execute).mock.calls[0]?.[0];
    const evalCommand = vi.fn(async () => 1);
    await operation?.({ eval: evalCommand } as never);
    expect(evalCommand).toHaveBeenCalledWith(
      THROTTLE_HEALTH_SCRIPT,
      1,
      expect.stringMatching(/^iqx:test:v2:throttle:health:/),
      1_000,
    );
  });

  it('reports disabled without touching Redis when Redis is disabled', async () => {
    const redis = redisService(1);
    vi.mocked(redis.isEnabled).mockReturnValue(false);
    const storage = new RedisThrottlerStorage(redis);

    await expect(storage.health()).resolves.toEqual({ status: 'disabled' });
    expect(redis.key).not.toHaveBeenCalled();
    expect(redis.execute).not.toHaveBeenCalled();
  });

  it('reports down without leaking credentials when ACL denies EVAL or writes', async () => {
    const secret = 'redis://user:acl-secret@redis:6379';
    const redis = redisService(1);
    vi.mocked(redis.execute).mockRejectedValueOnce(new Error(`NOPERM ${secret}`));
    const storage = new RedisThrottlerStorage(redis);

    const health = await storage.health();
    expect(health).toEqual({ status: 'down' });
    expect(JSON.stringify(health)).not.toContain(secret);
  });

  it('reports down when the write probe returns an unexpected result', async () => {
    const storage = new RedisThrottlerStorage(redisService(0));

    await expect(storage.health()).resolves.toEqual({ status: 'down' });
  });

  it('uses an atomic INCR/PTTL script and the environment-scoped key', async () => {
    const redis = redisService([1, 60_000, 0, 0]);
    const storage = new RedisThrottlerStorage(redis);

    await expect(
      storage.increment('framework-hash', 60_000, 120, 60_000, 'public'),
    ).resolves.toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    expect(redis.key).toHaveBeenCalledWith('throttle', 'framework-hash');
    expect(THROTTLE_INCREMENT_SCRIPT).toContain("redis.call('INCR', KEYS[1])");
    expect(THROTTLE_INCREMENT_SCRIPT).toContain("redis.call('PTTL', KEYS[2])");

    const operation = vi.mocked(redis.execute).mock.calls[0]?.[0];
    const evalCommand = vi.fn(async () => [1, 60_000, 0, 0]);
    await operation?.({ eval: evalCommand } as never);
    expect(evalCommand).toHaveBeenCalledWith(
      THROTTLE_INCREMENT_SCRIPT,
      2,
      'iqx:test:v2:throttle:framework-hash',
      'iqx:test:v2:throttle:framework-hash:block',
      60_000,
      120,
      60_000,
    );
  });

  it('returns block fields and rounds millisecond TTLs up to seconds', async () => {
    const storage = new RedisThrottlerStorage(redisService([121, 1_001, 1, 501]));

    await expect(storage.increment('hash', 60_000, 120, 10_000, 'public')).resolves.toEqual({
      totalHits: 121,
      timeToExpire: 2,
      isBlocked: true,
      timeToBlockExpire: 1,
    });
  });

  it('starts a fresh TTL window when Redis reports an expired counter', async () => {
    const storage = new RedisThrottlerStorage(redisService([1, 30_000, 0, 0]));

    const record = await storage.increment('hash', 30_000, 10, 30_000, 'public');
    expect(record).toMatchObject({ totalHits: 1, timeToExpire: 30, isBlocked: false });
  });

  it('fails closed with a sanitized 503 when Redis is unavailable', async () => {
    const secret = 'redis://user:do-not-leak@redis:6379';
    const redis = redisService([]);
    vi.mocked(redis.execute).mockRejectedValueOnce(new Error(secret));
    const storage = new RedisThrottlerStorage(redis);

    const error = await storage
      .increment('hash', 60_000, 120, 60_000, 'public')
      .catch((reason) => reason);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error).toMatchObject({
      response: {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Rate limit service is unavailable',
      },
    });
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it('fails closed on a malformed Lua response', async () => {
    const storage = new RedisThrottlerStorage(redisService(['bad-response']));

    await expect(storage.increment('hash', 60_000, 120, 60_000, 'public')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('createRateLimitOptions', () => {
  it('uses the library memory storage only when Redis is disabled', () => {
    const redis = redisService([1, 60_000, 0, 0]);
    const options = createRateLimitOptions(config(), redis);

    expect(Array.isArray(options)).toBe(false);
    if (Array.isArray(options)) throw new Error('Expected object options');
    expect(options.storage).toBeUndefined();
    expect(options.throttlers).toEqual([{ name: 'public', limit: 60, ttl: 60_000 }]);
  });

  it('selects Redis storage whenever Redis is enabled', () => {
    const options = createRateLimitOptions(
      config({ REDIS_ENABLED: true, RATE_LIMIT_MAX: 42, RATE_LIMIT_TTL_MS: 15_000 }),
      redisService([1, 15_000, 0, 0]),
    );

    expect(Array.isArray(options)).toBe(false);
    if (Array.isArray(options)) throw new Error('Expected object options');
    expect(options.storage).toBeInstanceOf(RedisThrottlerStorage);
    expect(options.throttlers).toEqual([{ name: 'public', limit: 42, ttl: 15_000 }]);
  });
});

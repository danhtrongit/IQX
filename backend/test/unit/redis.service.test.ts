import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import {
  RedisConfigurationError,
  RedisDisabledError,
  RedisService,
  RedisUnavailableError,
} from '../../src/platform/redis/index.js';

const redisMock = vi.hoisted(() => ({
  instances: [] as Array<{
    url: string;
    options: Record<string, unknown>;
    status: string;
    connect: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }>,
  connectError: undefined as Error | undefined,
  pingError: undefined as Error | undefined,
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    status = 'wait';
    readonly connect = vi.fn(async () => {
      if (redisMock.connectError) {
        throw redisMock.connectError;
      }
      this.status = 'ready';
    });
    readonly ping = vi.fn(async () => {
      if (redisMock.pingError) {
        throw redisMock.pingError;
      }
      return 'PONG';
    });
    readonly quit = vi.fn(async () => {
      this.status = 'end';
      return 'OK';
    });
    readonly disconnect = vi.fn(() => {
      this.status = 'end';
    });
    readonly on = vi.fn();

    constructor(
      readonly url: string,
      readonly options: Record<string, unknown>,
    ) {
      redisMock.instances.push(this);
    }
  },
}));

const config = (overrides: Partial<Environment> = {}): ConfigService<Environment, true> => {
  const values: Environment = {
    APP_ENV: 'test',
    REDIS_ENABLED: false,
    REDIS_URL: undefined,
    REDIS_CONNECT_TIMEOUT_MS: 2_000,
    QUEUE_ENABLED: false,
    ...overrides,
  } as Environment;

  return {
    get: vi.fn((key: keyof Environment) => values[key]),
  } as unknown as ConfigService<Environment, true>;
};

describe('RedisService', () => {
  beforeEach(() => {
    redisMock.instances.length = 0;
    redisMock.connectError = undefined;
    redisMock.pingError = undefined;
    vi.restoreAllMocks();
  });

  it('stays disconnected and reports disabled when Redis is disabled', async () => {
    const service = new RedisService(config());

    await expect(service.health()).resolves.toEqual({ status: 'disabled' });
    await expect(service.getClient()).rejects.toBeInstanceOf(RedisDisabledError);
    await service.close();

    expect(redisMock.instances).toHaveLength(0);
  });

  it('scopes keys by application, environment, and schema version', () => {
    const service = new RedisService(config({ APP_ENV: 'production' }));

    expect(service.key()).toBe('iqx:production:v2');
    expect(service.key('market', ' VNM ')).toBe('iqx:production:v2:market:VNM');
    expect(() => service.key(' ')).toThrow('Redis key segments must not be empty');
  });

  it('connects lazily once and reuses the shared client', async () => {
    const service = new RedisService(
      config({ REDIS_ENABLED: true, REDIS_URL: 'redis://user:secret@redis:6379/1' }),
    );

    expect(redisMock.instances).toHaveLength(0);
    await expect(service.health()).resolves.toEqual({ status: 'up' });
    const first = await service.getClient();
    const second = await service.getClient();

    expect(first).toBe(second);
    expect(redisMock.instances).toHaveLength(1);
    expect(redisMock.instances[0]?.options).toMatchObject({
      lazyConnect: true,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  });

  it('requires REDIS_URL only when Redis is enabled', async () => {
    const service = new RedisService(config({ REDIS_ENABLED: true }));

    await expect(service.getClient()).rejects.toBeInstanceOf(RedisConfigurationError);
    await expect(service.health()).resolves.toEqual({ status: 'down' });
    expect(redisMock.instances).toHaveLength(0);
  });

  it('does not leak Redis credentials through errors or logs', async () => {
    const secret = 'do-not-log-this';
    const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redisMock.connectError = new Error(`failed redis://user:${secret}@redis:6379`);
    const service = new RedisService(
      config({ REDIS_ENABLED: true, REDIS_URL: `redis://user:${secret}@redis:6379` }),
    );

    const error = await service.getClient().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RedisUnavailableError);
    expect(String(error)).not.toContain(secret);
    expect(logger.mock.calls.flat().join(' ')).not.toContain(secret);
  });

  it('closes an opened client and cannot reopen after shutdown', async () => {
    const service = new RedisService(
      config({ REDIS_ENABLED: true, REDIS_URL: 'redis://redis:6379' }),
    );
    await service.getClient();
    const client = redisMock.instances[0];

    await service.close();

    expect(client?.quit).toHaveBeenCalledOnce();
    expect(client?.disconnect).toHaveBeenCalledOnce();
    await expect(service.getClient()).rejects.toBeInstanceOf(RedisUnavailableError);
  });
});

import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import {
  QueueDisabledError,
  QueueService,
  QueueUnavailableError,
} from '../../src/platform/queue/index.js';
import type { RedisService } from '../../src/platform/redis/redis.service.js';

const bullMock = vi.hoisted(() => ({
  instances: [] as Array<{
    name: string;
    options: Record<string, unknown>;
    close: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    readonly close = vi.fn(async () => undefined);

    constructor(
      readonly name: string,
      readonly options: Record<string, unknown>,
    ) {
      bullMock.instances.push(this);
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

const redisService = (overrides: Partial<RedisService> = {}): RedisService =>
  ({
    isEnabled: vi.fn(() => true),
    getClient: vi.fn(async () => ({ status: 'ready' })),
    health: vi.fn(async () => ({ status: 'up' as const })),
    ...overrides,
  }) as unknown as RedisService;

describe('QueueService', () => {
  beforeEach(() => {
    bullMock.instances.length = 0;
  });

  it('stays disconnected and reports disabled when queues are disabled', async () => {
    const redis = redisService();
    const service = new QueueService(config(), redis);

    await expect(service.readiness()).resolves.toEqual({ status: 'disabled' });
    await expect(service.getConnection()).rejects.toBeInstanceOf(QueueDisabledError);
    await expect(service.createQueue('reports')).rejects.toBeInstanceOf(QueueDisabledError);

    expect(redis.getClient).not.toHaveBeenCalled();
    expect(bullMock.instances).toHaveLength(0);
  });

  it('uses an environment-scoped BullMQ prefix and one shared queue instance', async () => {
    const connection = { status: 'ready' };
    const redis = redisService({
      getClient: vi.fn(async () => connection),
    } as unknown as Partial<RedisService>);
    const service = new QueueService(
      config({ APP_ENV: 'production', QUEUE_ENABLED: true, REDIS_ENABLED: true }),
      redis,
    );

    const first = await service.createQueue('market-reports');
    const second = await service.createQueue('market-reports');

    expect(first).toBe(second);
    expect(service.prefix()).toBe('iqx:production:v2:bullmq');
    expect(bullMock.instances).toHaveLength(1);
    expect(bullMock.instances[0]?.options).toMatchObject({
      connection,
      prefix: 'iqx:production:v2:bullmq',
    });
  });

  it('deduplicates concurrent creation of the same queue', async () => {
    let releaseHealth: (() => void) | undefined;
    const healthGate = new Promise<void>((resolve) => {
      releaseHealth = resolve;
    });
    const redis = redisService({
      health: vi.fn(async () => {
        await healthGate;
        return { status: 'up' as const };
      }),
    } as Partial<RedisService>);
    const service = new QueueService(config({ QUEUE_ENABLED: true }), redis);

    const first = service.createQueue('reports');
    const second = service.createQueue('reports');
    releaseHealth?.();

    const [firstQueue, secondQueue] = await Promise.all([first, second]);
    expect(firstQueue).toBe(secondQueue);
    expect(bullMock.instances).toHaveLength(1);
  });

  it('reports down when Redis is disabled or unhealthy', async () => {
    const redisDisabled = redisService({ isEnabled: vi.fn(() => false) } as Partial<RedisService>);
    const disabledService = new QueueService(config({ QUEUE_ENABLED: true }), redisDisabled);
    await expect(disabledService.health()).resolves.toEqual({ status: 'down' });

    const redisDown = redisService({
      health: vi.fn(async () => ({ status: 'down' as const })),
    } as Partial<RedisService>);
    const downService = new QueueService(config({ QUEUE_ENABLED: true }), redisDown);
    await expect(downService.assertReady()).rejects.toBeInstanceOf(QueueUnavailableError);

    expect(redisDisabled.getClient).not.toHaveBeenCalled();
    expect(redisDown.getClient).not.toHaveBeenCalled();
  });

  it('rejects invalid names before opening a Redis connection', async () => {
    const redis = redisService();
    const service = new QueueService(config({ QUEUE_ENABLED: true }), redis);

    await expect(service.createQueue('Invalid:name')).rejects.toBeInstanceOf(TypeError);
    expect(redis.getClient).not.toHaveBeenCalled();
  });

  it('closes every queue it created without closing the shared Redis service', async () => {
    const redis = redisService();
    const service = new QueueService(config({ QUEUE_ENABLED: true }), redis);
    await service.createQueue('reports');
    await service.createQueue('analysis');

    await service.close();

    expect(bullMock.instances).toHaveLength(2);
    expect(bullMock.instances.every((queue) => queue.close.mock.calls.length === 1)).toBe(true);
    await expect(service.createQueue('another')).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});

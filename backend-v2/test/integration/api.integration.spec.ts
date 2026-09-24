import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp } from '../../src/app.js';
import { ConfigurationModule } from '../../src/platform/config/configuration.module.js';
import { QueueModule } from '../../src/platform/queue/queue.module.js';
import { QueueService } from '../../src/platform/queue/queue.service.js';
import { seedSymbols, startTestStack, type StartedTestStack } from '../helpers/test-stack.js';

const { Client } = pg;

describe('backend-v2 against isolated PostgreSQL and Redis', () => {
  let app: NestFastifyApplication;
  let stack: StartedTestStack;
  let redisClientsBeforeApp = 0;

  beforeAll(async () => {
    stack = await startTestStack({
      databaseUrl: process.env.TEST_DATABASE_URL,
      externalServicesEnabled: process.env.IQX_TEST_EXTERNAL_SERVICES,
      redisUrl: process.env.TEST_REDIS_URL,
    });

    await seedSymbols(stack.databaseAdminUrl, [
      {
        id: '20000000-0000-4000-8000-000000000001',
        symbol: 'VCB',
        name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
        shortName: 'Vietcombank',
        exchange: 'HOSE',
        currentPriceVnd: 9_007_199_254_740_993n,
        targetPriceVnd: 100_000n,
        upsidePct: 12.5,
        lastSyncedAt: '2026-09-23 01:02:03.654321+00',
        createdAt: '2026-09-23 01:02:03.123456',
        updatedAt: '2026-09-23 02:03:04.654321',
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        symbol: 'VCBS',
        name: 'VCB Securities',
        shortName: null,
        exchange: 'UPCOM',
        currentPriceVnd: null,
        targetPriceVnd: null,
      },
      {
        id: '20000000-0000-4000-8000-000000000003',
        symbol: 'ABC',
        name: 'A VCB Holding',
        exchange: 'HNX',
      },
      {
        id: '20000000-0000-4000-8000-000000000004',
        symbol: 'A%B',
        name: 'Literal Percent Company',
        exchange: 'HOSE',
      },
      {
        id: '20000000-0000-4000-8000-000000000005',
        symbol: 'A_B',
        name: 'Literal Underscore Company',
        exchange: 'HOSE',
      },
      {
        id: '20000000-0000-4000-8000-000000000006',
        symbol: 'VNINDEX',
        name: 'VN Index',
        exchange: 'HOSE',
        assetType: 'index',
        isIndex: true,
      },
      {
        id: '20000000-0000-4000-8000-000000000007',
        symbol: 'HIDDEN',
        name: 'Inactive instrument',
        exchange: 'HOSE',
        isActive: false,
      },
    ]);

    redisClientsBeforeApp = await redisClientCount(stack.redisUrl);
    app = await createApiApp({
      environment: {
        APP_ENV: 'test',
        API_DOCS_ENABLED: 'false',
        COMPATIBILITY_V1_ENABLED: 'true',
        DATABASE_URL: stack.databaseUrl,
        DB_CONNECT_TIMEOUT_MS: '2000',
        DB_STATEMENT_TIMEOUT_MS: '3000',
        REDIS_ENABLED: 'true',
        REDIS_URL: stack.redisUrl,
        REDIS_CONNECT_TIMEOUT_MS: '2000',
        RATE_LIMIT_MAX: '10000',
      },
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    try {
      await app?.close();

      const runtimeRole = decodeURIComponent(new URL(stack.databaseUrl).username);
      await waitForValue(() => activePostgresConnections(stack.databaseAdminUrl, runtimeRole), 0);
      await waitForValue(() => redisClientCount(stack.redisUrl), redisClientsBeforeApp);
    } finally {
      await stack?.stop();
    }
  });

  it('reports liveness and dependency-backed readiness', async () => {
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.headers['x-request-id']).toEqual(expect.any(String));
    expect(live.json()).toEqual({ status: 'ok' });

    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: 'ready',
      dependencies: { database: 'up', redis: 'up', rate_limit: 'up' },
    });
  });

  it('keeps liveness up while reporting database and Redis readiness outages', async () => {
    const databaseDown = await createApiApp({
      environment: {
        APP_ENV: 'test',
        API_DOCS_ENABLED: 'false',
        DATABASE_URL: 'postgresql://tester:secret@127.0.0.1:1/iqx_v2_test_unreachable',
        DB_CONNECT_TIMEOUT_MS: '100',
        DB_STATEMENT_TIMEOUT_MS: '100',
        REDIS_ENABLED: 'false',
      },
      logger: false,
    });
    await databaseDown.init();
    await databaseDown.getHttpAdapter().getInstance().ready();
    try {
      expect((await databaseDown.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(
        200,
      );
      const ready = await databaseDown.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({
        status: 'not_ready',
        dependencies: { database: 'down', redis: 'disabled', rate_limit: 'disabled' },
      });
      const data = await databaseDown.inject('/api/v2/instruments');
      expect(data.statusCode).toBe(503);
      expect(data.json().error.code).toBe('DATABASE_UNAVAILABLE');
    } finally {
      await databaseDown.close();
    }

    const redisDown = await createApiApp({
      environment: {
        APP_ENV: 'test',
        API_DOCS_ENABLED: 'false',
        DATABASE_URL: stack.databaseUrl,
        DB_CONNECT_TIMEOUT_MS: '2000',
        DB_STATEMENT_TIMEOUT_MS: '3000',
        REDIS_ENABLED: 'true',
        REDIS_URL: 'redis://127.0.0.1:1/15',
        REDIS_CONNECT_TIMEOUT_MS: '100',
      },
      logger: false,
    });
    await redisDown.init();
    await redisDown.getHttpAdapter().getInstance().ready();
    try {
      expect((await redisDown.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
      const ready = await redisDown.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({
        status: 'not_ready',
        dependencies: { database: 'up', redis: 'down', rate_limit: 'down' },
      });
      const data = await redisDown.inject('/api/v2/instruments');
      expect(data.statusCode).toBe(503);
      expect(data.json().error.code).toBe('RATE_LIMIT_UNAVAILABLE');
    } finally {
      await redisDown.close();
    }
  });

  it('uses deterministic exact/prefix/contains ranking and correct pagination counts', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=vcb&page=1&page_size=2',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ symbol: 'VCB' }, { symbol: 'VCBS' }],
      meta: {
        pagination: { page: 1, page_size: 2, total: 3, total_pages: 2 },
      },
    });

    const secondPage = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=vcb&page=2&page_size=2',
    });
    expect(secondPage.json()).toMatchObject({ data: [{ symbol: 'ABC' }] });
  });

  it('treats LIKE wildcards literally and applies exchange filters', async () => {
    const percent = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=%25',
    });
    expect(percent.statusCode).toBe(200);
    expect(percent.json().data.map(({ symbol }: { symbol: string }) => symbol)).toEqual(['A%B']);

    const underscore = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=_',
    });
    expect(underscore.json().data.map(({ symbol }: { symbol: string }) => symbol)).toEqual(['A_B']);

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=vcb&exchange=upcom',
    });
    expect(filtered.json().data.map(({ symbol }: { symbol: string }) => symbol)).toEqual(['VCBS']);

    const assetType = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?asset_type=index&include_indices=true',
    });
    expect(assetType.json().data.map(({ symbol }: { symbol: string }) => symbol)).toEqual([
      'VNINDEX',
    ]);
  });

  it('excludes indices by default and honors the literal false/true values', async () => {
    for (const query of ['', '?include_indices=false', '?include_indices=0']) {
      const response = await app.inject({ method: 'GET', url: `/api/v2/instruments${query}` });
      expect(response.json().data).not.toContainEqual(
        expect.objectContaining({ symbol: 'VNINDEX' }),
      );
    }

    const included = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?include_indices=true&page_size=100',
    });
    expect(included.json().data).toContainEqual(expect.objectContaining({ symbol: 'VNINDEX' }));
  });

  it('returns an empty page and hides inactive instruments from detail', async () => {
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=DOES_NOT_EXIST',
    });
    expect(empty.json()).toMatchObject({
      data: [],
      meta: { pagination: { total: 0, total_pages: 0 } },
    });

    const inactive = await app.inject({ method: 'GET', url: '/api/v2/instruments/hidden' });
    expect(inactive.statusCode).toBe(404);
    expect(inactive.json()).toMatchObject({
      error: { code: 'INSTRUMENT_NOT_FOUND' },
    });
  });

  it('serializes bigint safely in v2 and rejects unsafe legacy conversion', async () => {
    const v2 = await app.inject({ method: 'GET', url: '/api/v2/instruments/vcb' });
    expect(v2.statusCode).toBe(200);
    expect(v2.json().data.currentPriceVnd).toBe('9007199254740993');
    expect(v2.json().data).toMatchObject({
      lastSyncedAt: '2026-09-23T01:02:03.654321Z',
      createdAt: '2026-09-23T01:02:03.123456',
      updatedAt: '2026-09-23T02:03:04.654321',
    });

    const v1 = await app.inject({
      method: 'GET',
      url: '/api/v1/market-data/reference/symbols/vcb',
    });
    expect(v1.statusCode).toBe(500);
    expect(v1.json()).toEqual({
      detail: 'Đã xảy ra lỗi hệ thống',
      code: 'LEGACY_INTEGER_OUT_OF_RANGE',
    });
  });

  it('cannot mutate data or DDL through the runtime database role', async () => {
    const runtime = new Client({ connectionString: stack.databaseUrl });
    await runtime.connect();
    try {
      await expect(
        runtime.query(`INSERT INTO symbols (id, symbol) VALUES ($1, $2)`, [
          '20000000-0000-4000-8000-000000000099',
          'NOPE',
        ]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        runtime.query('CREATE TABLE runtime_must_not_create (id integer)'),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        runtime.query('CREATE TEMP TABLE runtime_must_not_create_temp (id integer)'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await runtime.end();
    }
  });

  it('performs a BullMQ 6 enqueue/read roundtrip through the isolated Redis', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigurationModule.forEnvironment({
          APP_ENV: 'test',
          QUEUE_ENABLED: 'true',
          REDIS_ENABLED: 'true',
          REDIS_URL: stack.redisUrl,
          REDIS_CONNECT_TIMEOUT_MS: '2000',
        }),
        QueueModule,
      ],
    }).compile();
    const queues = moduleRef.get(QueueService);
    const queue = await queues.createQueue(`smoke-${process.pid}-${Date.now()}`);

    try {
      const added = await queue.add('contract', { value: 42 });
      const loaded = await queue.getJob(added.id ?? '');
      expect(loaded?.name).toBe('contract');
      expect(loaded?.data).toEqual({ value: 42 });
    } finally {
      await queue.obliterate({ force: true });
      await moduleRef.close();
    }
  });

  it('shares a single Redis throttle budget across independent API instances', async () => {
    const environment = {
      APP_ENV: 'test',
      DATABASE_URL: stack.databaseUrl,
      REDIS_ENABLED: 'true',
      REDIS_URL: stack.redisUrl,
      RATE_LIMIT_MAX: '1',
      RATE_LIMIT_TTL_MS: '1000',
    };
    const first = await createApiApp({ environment, logger: false });
    const second = await createApiApp({ environment, logger: false });
    try {
      await first.init();
      await second.init();
      const options = {
        method: 'GET' as const,
        url: '/api/v2/instruments',
        remoteAddress: '192.0.2.123',
      };
      expect((await first.inject(options)).statusCode).toBe(200);
      const denied = await second.inject(options);
      expect(denied.statusCode).toBe(429);
      expect(denied.headers['retry-after']).toBeDefined();
      expect((await second.inject('/health/live')).statusCode).toBe(200);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it('rejects readiness when Redis ACL permits PING but denies Lua/write capabilities', async () => {
    const admin = new Redis(stack.redisUrl, { lazyConnect: true });
    const username = `iqx-v2-probe-${process.pid}-${Date.now()}`;
    const secret = 'ephemeral-probe-only';
    let limited: NestFastifyApplication | undefined;
    try {
      await admin.connect();
      await admin.acl(
        'SETUSER',
        username,
        'on',
        `>${secret}`,
        '~iqx:test:v2:*',
        '+ping',
        '+info',
        '+select',
        '+client',
      );
      const url = new URL(stack.redisUrl);
      url.username = username;
      url.password = secret;
      limited = await createApiApp({
        environment: {
          APP_ENV: 'test',
          DATABASE_URL: stack.databaseUrl,
          REDIS_ENABLED: 'true',
          REDIS_URL: url.toString(),
        },
        logger: false,
      });
      await limited.init();
      const ready = await limited.inject('/health/ready');
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({
        status: 'not_ready',
        dependencies: { database: 'up', redis: 'up', rate_limit: 'down' },
      });
      expect((await limited.inject('/health/live')).statusCode).toBe(200);
    } finally {
      await limited?.close();
      await admin.acl('DELUSER', username);
      admin.disconnect(false);
    }
  });
});

async function activePostgresConnections(adminUrl: string, username: string): Promise<number> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM pg_stat_activity WHERE usename = $1',
      [username],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function redisClientCount(url: string): Promise<number> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0 });
  try {
    await redis.connect();
    const clients = String(await redis.client('LIST'));
    return clients.split('\n').filter(Boolean).length - 1;
  } finally {
    redis.disconnect(false);
  }
}

async function waitForValue(
  read: () => Promise<number>,
  expected: number,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let actual = await read();

  while (actual !== expected && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    actual = await read();
  }

  expect(actual).toBe(expected);
}

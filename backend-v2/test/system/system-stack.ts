import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { vi } from 'vitest';
import { createApiModule, configureApiApp } from '../../src/app.js';
import { createHttpAdapter } from '../../src/platform/http/http-adapter.js';
import { MarketDataService } from '../../src/modules/market-data/market-data.service.js';
import {
  assertConnectedSystemTestDatabase,
  installIsolatedRuntimeEnvironment,
  requireSystemTestDatabaseName,
} from './service-safety.js';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export type SqlRow = Record<string, unknown>;

export interface SystemStack {
  databaseUrl: string;
  redisUrl: string;
  app: NestFastifyApplication;
  query<T extends SqlRow = SqlRow>(sql: string, values?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

const DEFAULT_ENV: Record<string, string> = {
  APP_ENV: 'test',
  CAP_MAX_ENABLED: '6',
  API_DOCS_ENABLED: 'false',
  COMPATIBILITY_V1_ENABLED: 'true',
  DB_CONNECT_TIMEOUT_MS: '2000',
  DB_STATEMENT_TIMEOUT_MS: '5000',
  DB_READ_ONLY: 'false',
  REDIS_ENABLED: 'true',
  QUEUE_ENABLED: 'false',
  MARKET_INGEST_ENABLED: 'false',
  LOG_LEVEL: 'silent',
  EMAIL_ENABLED: 'false',
  JWT_SECRET_KEY: 'system-test-jwt-secret-key-must-be-at-least-32-chars',
  JWT_REFRESH_SECRET_KEY: 'system-test-refresh-secret-key-at-least-32-chars',
  MEDIA_SIGNING_SECRET: 'system-test-media-signing-secret-at-least-32',
  ACCESS_TOKEN_EXPIRE_MINUTES: '30',
  REFRESH_TOKEN_EXPIRE_DAYS: '7',
  RATE_LIMIT_MAX: '100000',
  RATE_LIMIT_TTL_MS: '60000',
  SEPAY_MERCHANT_ID: 'system-test-merchant',
  SEPAY_SECRET_KEY: 'system-test-sepay-secret',
  SEPAY_CHECKOUT_URL: 'https://pay.invalid/checkout',
  APP_PUBLIC_URL: 'http://127.0.0.1:3001',
  TRADING_ENABLED: 'true',
};

function requireExternalUrl(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`System acceptance tests require ${name}`);
  const parsed = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`${name} must target a local isolated service`);
  }
  return value;
}

function requireIsolatedRedis(value: string): void {
  const parsed = new URL(value);
  const database = Number(parsed.pathname.slice(1));
  if (!parsed.port || parsed.port === '6379' || !Number.isInteger(database) || database < 1) {
    throw new Error('TEST_REDIS_URL must use a dedicated non-default port and Redis database');
  }
}

async function verifyDatabaseTarget(value: string): Promise<void> {
  const expectedDatabaseName = requireSystemTestDatabaseName(value);
  const client = new Client({ connectionString: value });
  await client.connect();
  try {
    const result = await client.query<{ database_name: string }>(
      'select current_database() as database_name',
    );
    assertConnectedSystemTestDatabase(expectedDatabaseName, result.rows[0]?.database_name ?? '');
  } finally {
    await client.end();
  }
}

function migrationEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    DATABASE_URL: databaseUrl,
    V2_MIGRATIONS_ALLOWED: 'true',
  };
  for (const key of ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'TZ', 'LANG', 'LC_ALL'] as const) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
}

async function migrate(databaseUrl: string): Promise<void> {
  // The caller verifies both the URL name and the connected database identity
  // before this subprocess can issue migration SQL.
  await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {
    cwd: ROOT,
    env: migrationEnvironment(databaseUrl),
    timeout: 120_000,
  });
}

async function sql<T extends SqlRow = SqlRow>(
  url: string,
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const expectedDatabaseName = requireSystemTestDatabaseName(url);
    const identity = await client.query<{ database_name: string }>(
      'select current_database() as database_name',
    );
    assertConnectedSystemTestDatabase(expectedDatabaseName, identity.rows[0]?.database_name ?? '');
    const result = await client.query<T>(text, values as unknown[]);
    return result.rows;
  } finally {
    await client.end();
  }
}

async function seed(databaseUrl: string): Promise<void> {
  // This is deliberately a tiny fixture. No user, subscription, order or
  // entitlement is seeded: those must be created through public APIs, while
  // the admin role is granted explicitly by a DB fixture in the auth test.
  await sql(
    databaseUrl,
    `
    TRUNCATE TABLE
      users, symbols, premium_plans
    RESTART IDENTITY CASCADE
  `,
  );
  await sql(
    databaseUrl,
    `
    INSERT INTO symbols (id, symbol, name, exchange, asset_type, is_index, current_price_vnd, last_synced_at, is_active)
    VALUES
      ('20000000-0000-4000-8000-000000000001', 'VCB', 'Vietcombank', 'HOSE', 'stock', false, 90000, now(), true),
      ('20000000-0000-4000-8000-000000000002', 'VNM', 'Vinamilk', 'HOSE', 'stock', false, 70000, now(), true)
    ON CONFLICT (symbol) DO NOTHING;
    INSERT INTO premium_plans (id, code, name, description, price_vnd, duration_days, is_active, sort_order)
    VALUES
      ('30000000-0000-4000-8000-000000000001', 'TRIAL_7D', 'Trial', 'System trial', 0, 7, true, 0),
      ('30000000-0000-4000-8000-000000000002', 'MONTHLY', 'Monthly', 'System monthly', 99000, 30, true, 1)
    ON CONFLICT (code) DO NOTHING;
  `,
  );
  // Each system file may reuse the same explicitly isolated external
  // database. Reset mutable global configuration so one acceptance file cannot
  // leak a trading-calendar holiday into the next file.
  await sql(
    databaseUrl,
    `update virtual_trading_configs
        set holidays = '[]', updated_at = now()
      where is_active = true`,
  );
  await sql(
    databaseUrl,
    `insert into virtual_trading_configs
       (initial_cash_vnd, buy_fee_rate_bps, sell_fee_rate_bps, sell_tax_rate_bps,
        settlement_mode, board_lot_size, trading_enabled, holidays, is_active)
     select 100000000, 15, 15, 10, 'T0', 100, true, '[]', true
      where not exists (select 1 from virtual_trading_configs where is_active = true)`,
  );
}

export async function startSystemStack(
  extraEnvironment: Record<string, string> = {},
): Promise<SystemStack> {
  const hasExternalDatabase = Boolean(process.env.TEST_DATABASE_URL);
  const hasExternalRedis = Boolean(process.env.TEST_REDIS_URL);
  if (hasExternalDatabase !== hasExternalRedis) {
    throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL must be provided together');
  }
  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedRedisContainer | undefined;
  let databaseUrl: string;
  let redisUrl: string;
  if (hasExternalDatabase && hasExternalRedis) {
    if (process.env.IQX_TEST_EXTERNAL_SERVICES !== '1') {
      throw new Error('External system services require IQX_TEST_EXTERNAL_SERVICES=1');
    }
    databaseUrl = requireExternalUrl('TEST_DATABASE_URL');
    redisUrl = requireExternalUrl('TEST_REDIS_URL');
  } else {
    postgres = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase(`iqx_v2_system_${process.pid}`)
      .start();
    redis = await new RedisContainer('redis:8-alpine').start();
    databaseUrl = postgres.getConnectionUri();
    const containerRedis = new URL(redis.getConnectionUrl());
    containerRedis.pathname = '/15';
    redisUrl = containerRedis.toString();
  }
  requireSystemTestDatabaseName(databaseUrl);
  requireIsolatedRedis(redisUrl);
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new TypeError('External network is disabled in system acceptance tests'));
  const mediaRoot = await mkdtemp(join(tmpdir(), 'iqx-v2-system-media-'));
  let restoreRuntimeEnvironment: (() => void) | undefined;
  try {
    await verifyDatabaseTarget(databaseUrl);
    // This URL has passed the localhost/non-default-port/non-zero-DB gates.
    // Reset only this isolated test DB so old BullMQ schedulers and request
    // caches cannot survive the SQL fixture reset between acceptance files.
    const isolatedRedis = new Redis(redisUrl, { connectTimeout: 2_000, maxRetriesPerRequest: 1 });
    try {
      await isolatedRedis.flushdb();
    } finally {
      await isolatedRedis.quit();
    }
    await migrate(databaseUrl);
    await seed(databaseUrl);
    const environment = {
      ...DEFAULT_ENV,
      ...extraEnvironment,
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      MEDIA_ROOT: mediaRoot,
    };
    restoreRuntimeEnvironment = installIsolatedRuntimeEnvironment(environment);
    const market: Record<string, unknown> = {};
    for (const method of Object.getOwnPropertyNames(MarketDataService.prototype)) {
      if (
        method !== 'constructor' &&
        typeof (MarketDataService.prototype as unknown as Record<string, unknown>)[method] ===
          'function'
      ) {
        market[method] = async () => {
          throw new ServiceUnavailableException(
            'External market provider is isolated for system tests',
          );
        };
      }
    }
    market.validateSymbol = async (symbol: string) =>
      (
        await sql(databaseUrl, 'select id from symbols where symbol=$1 and is_active=true', [
          symbol,
        ])
      ).length > 0;
    market.getQuote = async (symbol: string) => {
      const rows = await sql<{ current_price_vnd: string; last_synced_at: Date }>(
        databaseUrl,
        'select current_price_vnd,last_synced_at from symbols where symbol=$1 and is_active=true',
        [symbol],
      );
      if (!rows[0]) throw new ServiceUnavailableException('Test symbol is unavailable');
      return {
        symbol,
        priceVnd: Number(rows[0].current_price_vnd),
        timestamp: new Date(rows[0].last_synced_at),
        source: 'isolated-system-fixture',
      };
    };
    const module = await Test.createTestingModule({ imports: [createApiModule(environment)] })
      .overrideProvider(MarketDataService)
      .useValue(market)
      .compile();
    const app = module.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
      logger: false,
    });
    await configureApiApp(app, { logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return {
      databaseUrl,
      redisUrl,
      app,
      query: <T extends SqlRow = SqlRow>(text: string, values?: readonly unknown[]) =>
        sql<T>(databaseUrl, text, values),
      close: async () => {
        const errors: unknown[] = [];
        await app.close().catch((error: unknown) => errors.push(error));
        restoreRuntimeEnvironment?.();
        fetchSpy.mockRestore();
        await rm(mediaRoot, { recursive: true, force: true }).catch((error: unknown) =>
          errors.push(error),
        );
        await redis?.stop().catch((error: unknown) => errors.push(error));
        await postgres?.stop().catch((error: unknown) => errors.push(error));
        if (errors.length)
          throw new AggregateError(errors, 'Failed to stop isolated system stack cleanly');
      },
    };
  } catch (error) {
    restoreRuntimeEnvironment?.();
    fetchSpy.mockRestore();
    await rm(mediaRoot, { recursive: true, force: true });
    await redis?.stop().catch(() => undefined);
    await postgres?.stop().catch(() => undefined);
    throw error;
  }
}

export function authHeader(accessToken: string): { authorization: string } {
  return { authorization: `Bearer ${accessToken}` };
}

export async function registerAndLogin(
  app: NestFastifyApplication,
  suffix: string,
): Promise<{ id: string; accessToken: string; refreshToken: string; email: string }> {
  const email = `system-${suffix}-${Date.now()}@example.test`;
  const password = 'System!Passw0rd';
  const registered = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/register',
    payload: { email, password, full_name: `System ${suffix}` },
  });
  if (![200, 201].includes(registered.statusCode))
    throw new Error(`register failed: ${registered.statusCode} ${registered.body}`);
  const user = registered.json() as { id: string };
  const loggedIn = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/login',
    payload: { email, password },
  });
  if (loggedIn.statusCode !== 200)
    throw new Error(`login failed: ${loggedIn.statusCode} ${loggedIn.body}`);
  const tokens = loggedIn.json() as { access_token: string; refresh_token: string };
  return {
    id: user.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
  };
}

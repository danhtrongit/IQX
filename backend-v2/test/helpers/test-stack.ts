import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import pg from 'pg';
import { Redis } from 'ioredis';

const { Client } = pg;

const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const TEST_DATABASE_PREFIX = 'iqx_v2_test_';
const POSTGRES_IMAGE = 'postgres:17-alpine';
const REDIS_IMAGE = 'redis:7-alpine';
const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/symbols-schema.sql', import.meta.url));

export interface StartedTestStack {
  readonly databaseAdminUrl: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  stop(): Promise<void>;
}

interface TestStackOptions {
  readonly databaseUrl?: string;
  readonly externalServicesEnabled?: string;
  readonly redisUrl?: string;
}

export interface SymbolSeed {
  readonly id: string;
  readonly symbol: string;
  readonly name?: string | null;
  readonly shortName?: string | null;
  readonly exchange?: string | null;
  readonly assetType?: string | null;
  readonly isIndex?: boolean;
  readonly currentPriceVnd?: bigint | null;
  readonly targetPriceVnd?: bigint | null;
  readonly upsidePct?: number | null;
  readonly logoUrl?: string | null;
  readonly sourceUrl?: string | null;
  readonly lastSyncedAt?: string | null;
  readonly isActive?: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

function assertLocalHost(url: URL, variableName: string): void {
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${variableName} must target localhost; received ${url.hostname}`);
  }
}

export function assertIsolatedTestDatabaseUrl(value: string): URL {
  const url = new URL(value);
  assertLocalHost(url, 'TEST_DATABASE_URL');

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!databaseName.startsWith(TEST_DATABASE_PREFIX)) {
    throw new Error(
      `TEST_DATABASE_URL database name must start with ${TEST_DATABASE_PREFIX}; received ${databaseName || '<empty>'}`,
    );
  }

  return url;
}

export function assertIsolatedTestRedisUrl(value: string): URL {
  const url = new URL(value);
  assertLocalHost(url, 'TEST_REDIS_URL');

  if (url.port === '' || url.port === '6379') {
    throw new Error('TEST_REDIS_URL must use a dedicated non-default port');
  }

  const databaseNumber = Number(url.pathname.slice(1));
  if (!Number.isInteger(databaseNumber) || databaseNumber < 1) {
    throw new Error('TEST_REDIS_URL must select a non-default Redis database (for example /15)');
  }

  return url;
}

export async function seedSymbols(adminUrl: string, rows: readonly SymbolSeed[]): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const row of rows) {
      await admin.query(
        `INSERT INTO symbols (
          id, symbol, name, short_name, exchange, asset_type, is_index,
          current_price_vnd, target_price_vnd, upside_pct, logo_url,
          source_url, last_synced_at, is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          COALESCE($14::boolean, true), COALESCE($15::timestamp, now()),
          COALESCE($16::timestamp, now())
        )`,
        [
          row.id,
          row.symbol,
          row.name ?? null,
          row.shortName ?? null,
          row.exchange ?? null,
          row.assetType ?? 'stock',
          row.isIndex ?? false,
          row.currentPriceVnd?.toString() ?? null,
          row.targetPriceVnd?.toString() ?? null,
          row.upsidePct ?? null,
          row.logoUrl ?? null,
          row.sourceUrl ?? null,
          row.lastSyncedAt ?? null,
          row.isActive,
          row.createdAt,
          row.updatedAt,
        ],
      );
    }
  } finally {
    await admin.end();
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function clearTestThrottleKeys(url: string): Promise<void> {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });
  try {
    await client.connect();
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(
        cursor,
        'MATCH',
        'iqx:test:v2:throttle:*',
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length) await client.unlink(...keys);
    } while (cursor !== '0');
  } finally {
    client.disconnect(false);
  }
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function prepareDatabase(
  adminUrl: string,
  removeFixtureOnCleanup: boolean,
): Promise<{ runtimeUrl: string; cleanup: () => Promise<void> }> {
  const fixtureSql = await readFile(FIXTURE_PATH, 'utf8');
  const suffix = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const role = `iqx_v2_runtime_${suffix}`;
  const password = `iqx-v2-${suffix}`;
  const databaseName = decodeURIComponent(new URL(adminUrl).pathname.slice(1));
  const admin = new Client({ connectionString: adminUrl });
  let fixtureCreated = false;
  let roleCreated = false;

  await admin.connect();
  try {
    await admin.query(fixtureSql);
    fixtureCreated = true;
    await admin.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await admin.query(`REVOKE TEMPORARY ON DATABASE ${quoteIdentifier(databaseName)} FROM PUBLIC`);
    await admin.query(
      `CREATE ROLE ${quoteIdentifier(role)} LOGIN PASSWORD ${quoteLiteral(password)}`,
    );
    roleCreated = true;
    await admin.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(role)}`,
    );
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(role)}`);
    await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(role)}`);
  } catch (error) {
    if (roleCreated) {
      await admin.query(`DROP OWNED BY ${quoteIdentifier(role)}`).catch(() => undefined);
      await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`).catch(() => undefined);
    }
    if (fixtureCreated) {
      await admin.query(`DROP TABLE IF EXISTS symbols`).catch(() => undefined);
    }
    throw error;
  } finally {
    await admin.end();
  }

  const runtime = new URL(adminUrl);
  runtime.username = role;
  runtime.password = password;

  return {
    runtimeUrl: runtime.toString(),
    cleanup: async () => {
      const cleanupClient = new Client({ connectionString: adminUrl });
      await cleanupClient.connect();
      try {
        await cleanupClient.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1 AND pid <> pg_backend_pid()`,
          [role],
        );
        await cleanupClient.query(`DROP OWNED BY ${quoteIdentifier(role)}`);
        await cleanupClient.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
        if (removeFixtureOnCleanup) {
          await cleanupClient.query(`DROP TABLE IF EXISTS symbols`);
        }
      } finally {
        await cleanupClient.end();
      }
    },
  };
}

export async function startTestStack(options: TestStackOptions = {}): Promise<StartedTestStack> {
  const hasExternalDatabase = options.databaseUrl !== undefined;
  const hasExternalRedis = options.redisUrl !== undefined;

  if (hasExternalDatabase !== hasExternalRedis) {
    throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL must be provided together');
  }

  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedRedisContainer | undefined;
  let databaseAdminUrl: string;
  let redisUrl: string;

  if (options.databaseUrl && options.redisUrl) {
    if (options.externalServicesEnabled !== '1') {
      throw new Error(
        'Local service fallback requires IQX_TEST_EXTERNAL_SERVICES=1 in addition to TEST_DATABASE_URL and TEST_REDIS_URL',
      );
    }
    databaseAdminUrl = assertIsolatedTestDatabaseUrl(options.databaseUrl).toString();
    redisUrl = assertIsolatedTestRedisUrl(options.redisUrl).toString();
  } else {
    // A missing/unavailable Docker daemon is a hard integration-test failure. We
    // intentionally do not skip because that would make the database contract
    // look verified when it was never exercised.
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase(`${TEST_DATABASE_PREFIX}containers`)
      .start();
    redis = await new RedisContainer(REDIS_IMAGE).start();
    databaseAdminUrl = postgres.getConnectionUri();

    const containerRedisUrl = new URL(redis.getConnectionUrl());
    containerRedisUrl.pathname = '/15';
    redisUrl = containerRedisUrl.toString();
  }

  let database: Awaited<ReturnType<typeof prepareDatabase>>;
  try {
    database = await prepareDatabase(databaseAdminUrl, hasExternalDatabase);
    await clearTestThrottleKeys(redisUrl);
  } catch (error) {
    if (redis) await redis.stop().catch(() => undefined);
    if (postgres) await postgres.stop().catch(() => undefined);
    throw error;
  }

  let stopped = false;

  return {
    databaseAdminUrl,
    databaseUrl: database.runtimeUrl,
    redisUrl,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      const errors: unknown[] = [];
      await database.cleanup().catch((error: unknown) => errors.push(error));
      await clearTestThrottleKeys(redisUrl).catch((error: unknown) => errors.push(error));
      if (redis) await redis.stop().catch((error: unknown) => errors.push(error));
      if (postgres) await postgres.stop().catch((error: unknown) => errors.push(error));
      if (errors.length > 0)
        throw new AggregateError(errors, 'Failed to stop isolated integration stack cleanly');
    },
  };
}

import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';

const {
  clientQuery,
  clientRelease,
  poolConnect,
  poolConstructor,
  poolEnd,
  poolOn,
  poolQuery,
  execute,
  transaction,
} = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  poolConnect: vi.fn(),
  poolConstructor: vi.fn(),
  poolEnd: vi.fn(),
  poolOn: vi.fn(),
  poolQuery: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: class Pool {
    constructor(options: unknown) {
      poolConstructor(options);
    }

    on(...args: unknown[]) {
      return poolOn(...args);
    }

    query(...args: unknown[]) {
      return poolQuery(...args);
    }

    connect() {
      return poolConnect();
    }

    end() {
      return poolEnd();
    }
  },
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ execute, transaction })),
}));

function makeConfig(overrides: Partial<Environment> = {}): ConfigService<Environment, true> {
  const environment = {
    APP_ENV: 'test',
    DB_CONNECT_TIMEOUT_MS: 2_000,
    DB_POOL_MAX: 5,
    DB_STATEMENT_TIMEOUT_MS: 3_000,
    ...overrides,
  } as Environment;

  return {
    get: vi.fn((key: keyof Environment) => environment[key]),
  } as unknown as ConfigService<Environment, true>;
}

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolEnd.mockResolvedValue(undefined);
    poolQuery.mockResolvedValue({ rows: [] });
    clientQuery.mockResolvedValue({ rows: [] });
    poolConnect.mockResolvedValue({ query: clientQuery, release: clientRelease });
    execute.mockResolvedValue({ rows: [] });
    transaction.mockImplementation(async (operation: (database: unknown) => Promise<unknown>) =>
      operation({ kind: 'transaction' }),
    );
  });

  it('stays disabled and never creates a pool without DATABASE_URL', async () => {
    const service = new DatabaseService(makeConfig());

    await expect(service.health()).resolves.toEqual({ status: 'disabled' });
    expect(service.isConfigured()).toBe(false);
    expect(poolConstructor).not.toHaveBeenCalled();

    await expect(service.read(async () => 'unused')).rejects.toMatchObject({
      response: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable',
      },
    });
  });

  it('creates one lazy pool with bounded connection and query timeouts', async () => {
    const service = new DatabaseService(
      makeConfig({
        DATABASE_URL: 'postgresql://user:secret@localhost:5432/iqx_test',
        DB_CONNECT_TIMEOUT_MS: 1_234,
        DB_POOL_MAX: 7,
        DB_STATEMENT_TIMEOUT_MS: 4_567,
      }),
    );

    expect(poolConstructor).not.toHaveBeenCalled();
    await expect(service.health()).resolves.toEqual({ status: 'up' });
    await expect(service.health()).resolves.toEqual({ status: 'up' });

    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(poolConstructor).toHaveBeenCalledWith({
      application_name: 'iqx-backend-v2',
      connectionString: 'postgresql://user:secret@localhost:5432/iqx_test',
      connectionTimeoutMillis: 1_234,
      max: 7,
      options: '-c timezone=UTC',
      types: { getTypeParser: expect.any(Function) },
      query_timeout: 4_567,
      statement_timeout: 4_567,
    });
  });

  it('returns rows from parameterized SQL queries', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
    );
    poolQuery.mockResolvedValueOnce({ rows: [{ id: 'one' }] });

    await expect(
      service.query<{ id: string }>('select id from users where id = $1', ['one']),
    ).resolves.toEqual([{ id: 'one' }]);
    expect(poolQuery).toHaveBeenCalledWith('select id from users where id = $1', ['one']);
  });

  it('commits a successful write transaction exactly once', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test', DB_READ_ONLY: false }),
    );
    clientQuery.mockResolvedValueOnce({ rows: [] });
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'created' }] });
    clientQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.transaction((tx) => tx.query<{ id: string }>('insert into users values ($1)', [1])),
    ).resolves.toEqual([{ id: 'created' }]);
    expect(clientQuery.mock.calls).toEqual([
      ['BEGIN'],
      ['insert into users values ($1)', [1]],
      ['COMMIT'],
    ]);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls back a failed transaction and releases the client', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test', DB_READ_ONLY: false }),
    );
    const failure = new Error('write failed');
    clientQuery.mockResolvedValueOnce({ rows: [] });
    clientQuery.mockRejectedValueOnce(failure);
    clientQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.transaction((tx) => tx.query('insert into users values ($1)', [1])),
    ).rejects.toBe(failure);
    expect(clientQuery.mock.calls).toEqual([
      ['BEGIN'],
      ['insert into users values ($1)', [1]],
      ['ROLLBACK'],
    ]);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it('rejects write transactions before opening a connection when DB_READ_ONLY is true', async () => {
    const service = new DatabaseService(
      makeConfig({
        DATABASE_URL: 'postgresql://localhost/iqx_test',
        DB_READ_ONLY: true,
      }),
    );

    await expect(service.transaction(async () => 'unused')).rejects.toThrow(
      'Database writes are disabled by DB_READ_ONLY',
    );
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('uses a read-only repeatable-read transaction and returns its result', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
    );
    const operation = vi.fn(async () => ({ symbol: 'FPT' }));

    await expect(service.read(operation)).resolves.toEqual({ symbol: 'FPT' });
    expect(operation).toHaveBeenCalledWith({ kind: 'transaction' });
    expect(transaction).toHaveBeenCalledWith(operation, {
      accessMode: 'read only',
      isolationLevel: 'repeatable read',
    });
  });

  it('propagates unknown transaction failures so programming errors stay visible', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
    );
    const failure = new Error('query failed');
    transaction.mockRejectedValueOnce(failure);

    await expect(service.read(async () => 'unused')).rejects.toBe(failure);
  });

  it('does not disguise a PostgreSQL schema error as service unavailability', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
    );
    const failure = Object.assign(new Error('column does not exist'), { code: '42703' });
    transaction.mockRejectedValueOnce(failure);

    await expect(service.read(async () => 'unused')).rejects.toBe(failure);
  });

  it.each(['ECONNREFUSED', '57014', 'ENOTFOUND', 'EAI_AGAIN'])(
    'maps transient database error %s to a sanitized 503',
    async (code) => {
      const service = new DatabaseService(
        makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
      );
      const failure = Object.assign(new Error('driver failure with sensitive details'), {
        code,
      });
      transaction.mockRejectedValueOnce(
        code === '57014' ? failure : new Error('Drizzle query failed', { cause: failure }),
      );

      await expect(service.read(async () => 'unused')).rejects.toMatchObject({
        response: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database is unavailable',
        },
        status: 503,
      });
    },
  );

  it('maps a known pg pool timeout message to a sanitized 503', async () => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
    );
    transaction.mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'));

    await expect(service.read(async () => 'unused')).rejects.toMatchObject({
      response: { code: 'DATABASE_UNAVAILABLE' },
      status: 503,
    });
  });

  it.each([
    ['missing required columns', 'column "updated_at" does not exist'],
    ['missing SELECT privileges', 'permission denied for table symbols'],
  ])('reports a sanitized down status for %s', async (_case, driverMessage) => {
    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://user:secret@localhost/iqx_test' }),
    );
    execute.mockRejectedValueOnce(new Error(driverMessage));

    await expect(service.health()).resolves.toEqual({ status: 'down' });
  });

  it('closes the pool once and can be called safely before initialization', async () => {
    const disabled = new DatabaseService(makeConfig());
    await expect(disabled.close()).resolves.toBeUndefined();
    expect(poolEnd).not.toHaveBeenCalled();

    const service = new DatabaseService(
      makeConfig({ DATABASE_URL: 'postgresql://localhost/iqx_test' }),
    );
    await service.health();
    await service.onApplicationShutdown();
    await service.close();

    expect(poolEnd).toHaveBeenCalledTimes(1);
    await expect(service.health()).resolves.toEqual({ status: 'down' });
    await expect(service.read(async () => 'unused')).rejects.toMatchObject({
      response: { code: 'DATABASE_UNAVAILABLE' },
    });
    expect(poolConstructor).toHaveBeenCalledTimes(1);
  });
});

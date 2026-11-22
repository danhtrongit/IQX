import { randomUUID } from 'node:crypto';

import type { ModuleRef } from '@nestjs/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/modules/quant/v2/index.js';
import { StrategiesService } from '../../src/modules/strategies/strategies.service.js';
import { StrategyReaderService } from '../../src/modules/strategies/strategy-reader.service.js';
import {
  BOT_SCHEDULE_PORT,
  PRICE_STORE,
  strategyConfigHash,
  type PriceStorePort,
  type ScheduleApplyRequest,
  type StrategyContent,
} from '../../src/modules/strategy-rules/index.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

/**
 * The real SQL of the strategies module against PostgreSQL with migrations up to 0059 applied:
 * limit 20, case-insensitive names, soft delete, immutable versions, version conflicts, restore,
 * `from_run_id` proof, the STRATEGY_READER and the Bot schedule port hand-off. Skipped unless
 * STRATEGY_PG_URL points at a throw-away database, e.g.
 *   STRATEGY_PG_URL=postgresql://postgres:pg@127.0.0.1:55492/iqx_v2_w2 npx vitest run \
 *     test/unit/strategies-sql.pg.test.ts
 */
const URL = process.env.STRATEGY_PG_URL;

pg.types.setTypeParser(1082, (value: string) => value);

class PgDatabase {
  constructor(readonly pool: pg.Pool) {}
  async query<T>(text: string, values: readonly unknown[] = []): Promise<T[]> {
    return (await this.pool.query(text, [...values])).rows as T[];
  }
  async transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work({
        query: async (text, values) =>
          (await client.query(text, [...(values ?? [])])).rows as never,
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

const INDICATORS = {
  ...defaultConfig().indicators,
  ma_cross: {
    master_enabled: true,
    buy: {
      enabled: true,
      rules: [{ id: 'ma_cross.cross', enabled: true, fast: 20, op: 'cross_up', slow: 50 }],
    },
    sell: {
      enabled: true,
      rules: [{ id: 'ma_cross.cross', enabled: true, fast: 20, op: 'cross_down', slow: 50 }],
    },
  },
} as unknown as StrategyContent['indicators'];

const content = (patch: Partial<StrategyContent> = {}): StrategyContent => ({
  universe: { type: 'vn30' },
  indicators: INDICATORS,
  max_holding: 30,
  ...patch,
});

const prices: PriceStorePort = {
  meta: async () => ({
    data_store: 'flashback_vn100',
    data_as_of: '2026-11-20',
    earliest_start: '2014-01-02',
    price_unit: 'VND',
    adjusted: true,
    sessions: 3000,
  }),
  calendar: async () => [],
  eligibility: async () => ({
    vn30: ['ACB', 'FPT'],
    vn100: ['ACB', 'FPT', 'HPG'],
    membership_session: { vn30: '2026-11-20', vn100: '2026-11-20' },
  }),
  membersAt: async () => [],
  loadSeries: async () => {
    throw new Error('not used');
  },
};

type Usage = { last: boolean; next: boolean };

describe.skipIf(!URL)('strategies SQL (migration 0059)', () => {
  let pool: pg.Pool;
  let database: PgDatabase;
  let service: StrategiesService;
  let reader: StrategyReaderService;
  const usage = new Map<string, Usage>();
  const applied: Array<{ userId: string; request: ScheduleApplyRequest; inTx: boolean }> = [];
  let failApply: Error | null = null;
  const users: string[] = [];

  const schedulePort = {
    usage: async (_userId: string, _source: string, id: string) =>
      usage.get(id) ?? { last: false, next: false },
    applyNext: async (tx: SqlClient, userId: string, request: ScheduleApplyRequest) => {
      if (failApply) throw failApply;
      const [row] = await tx.query<{ n: number }>(`select 1 as n`);
      applied.push({ userId, request, inTx: row?.n === 1 });
      return { next: { session_date: request.expected_next_session } };
    },
    impact: async () => ({ next_session: '2026-11-23', n_current: 30, n_new: 30, positions: [] }),
    botCountsByIqx: async () => new Map<string, number>(),
  };
  const moduleRef = {
    get: (token: unknown) => {
      if (token === BOT_SCHEDULE_PORT) return schedulePort;
      if (token === PRICE_STORE) return prices;
      throw new Error('unknown token');
    },
  } as unknown as ModuleRef;

  async function user(): Promise<string> {
    const id = randomUUID();
    await database.query(
      `INSERT INTO users (id, email, username, hashed_password, full_name, role)
       VALUES ($1, $2, left('s' || replace($1::uuid::text, '-', ''), 30), 'x', 'Strategy test', 'user')`,
      [id, `strategies-${id}@example.test`],
    );
    users.push(id);
    return id;
  }

  /** A succeeded basket run of `userId` proving `value` (what Chạy stores). */
  async function run(userId: string, value: StrategyContent, kind = 'basket'): Promise<string> {
    const [row] = await database.query<{ id: string }>(
      `insert into backtest_runs
         (user_id, kind, shared_revision, strategy_source, request, request_hash, snapshot, result,
          config_hash, engine_version, calculation_version, rule_version, idempotency_key, status)
       values ($1, $2, null, 'draft', '{}'::jsonb, $3, '{}'::jsonb, '{}'::jsonb, $4, 'basket-1',
               'r', 'r', $5, 'succeeded')
       returning id`,
      [userId, kind, 'a'.repeat(64), strategyConfigHash(value), randomUUID()],
    );
    return row!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 6 });
    database = new PgDatabase(pool);
    service = new StrategiesService(database as unknown as DatabaseService, moduleRef);
    reader = new StrategyReaderService(database as unknown as DatabaseService);
  });

  afterAll(async () => {
    if (users.length) {
      await pool.query(
        `alter table user_strategy_versions disable trigger tr_user_strategy_versions_immutable`,
      );
      await pool.query(
        `delete from user_strategy_versions where strategy_id in
           (select id from user_strategies where user_id = any($1::uuid[]))`,
        [users],
      );
      await pool.query(
        `alter table user_strategy_versions enable trigger tr_user_strategy_versions_immutable`,
      );
      await pool.query(`delete from users where id = any($1::uuid[])`, [users]);
    }
    await pool?.end();
  });

  it('S06 refuses a save without a matching succeeded basket run (422 RUN_REQUIRED)', async () => {
    const owner = await user();
    const other = await user();
    const value = content();
    const foreign = await run(other, value);
    const otherContent = await run(owner, content({ max_holding: 31 }));
    for (const from of [foreign, otherContent, randomUUID()])
      await expect(
        service.create(owner, { name: 'RSI', content: value, from_run_id: from }),
      ).rejects.toMatchObject({ response: { code: 'RUN_REQUIRED' } });
    const created = await service.create(owner, {
      name: 'RSI',
      content: value,
      from_run_id: await run(owner, value),
    });
    expect(created.version).toMatchObject({ version: 1, note: null, content: value });
    expect(created.version.version_label).toMatch(/^bản \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(created.schedule).toBeNull();
  });

  it('S06 refuses invalid content (STRATEGY_INVALID) and a saved list emptied by VN100 (UNIVERSE_EMPTY)', async () => {
    const owner = await user();
    await expect(
      service.create(owner, {
        name: 'X',
        content: content({ max_holding: 2 }),
        from_run_id: randomUUID(),
      }),
    ).rejects.toMatchObject({ response: { code: 'STRATEGY_INVALID' } });
    await expect(
      service.create(owner, {
        name: 'X',
        content: content({
          universe: { type: 'saved_list', list_id: 'l1', list_name: 'L', symbols: ['VIX', 'SHS'] },
        }),
        from_run_id: randomUUID(),
      }),
    ).rejects.toMatchObject({ response: { code: 'UNIVERSE_EMPTY' } });
  });

  it('S09 a saved list keeps only VN100 symbols in the stored version', async () => {
    const owner = await user();
    const raw = content({
      universe: {
        type: 'saved_list',
        list_id: 'l1',
        list_name: 'ROE',
        symbols: ['hpg', 'VIX', 'ACB'],
      },
    });
    const stored = content({
      universe: { type: 'saved_list', list_id: 'l1', list_name: 'ROE', symbols: ['ACB', 'HPG'] },
    });
    const created = await service.create(owner, {
      name: 'Danh mục',
      content: raw,
      from_run_id: await run(owner, stored),
    });
    expect(created.version.content.universe).toEqual(stored.universe);
    const list = await service.list(owner);
    expect(list.items[0]).toMatchObject({ universe_label: 'ROE', universe_count: 2 });
  });

  it('S08 limit 20 and case-insensitive unique names among strategies not deleted', async () => {
    const owner = await user();
    const value = content();
    const from = await run(owner, value);
    for (let index = 0; index < 20; index += 1)
      await service.create(owner, {
        name: `Chiến lược ${index}`,
        content: value,
        from_run_id: from,
      });
    await expect(
      service.create(owner, { name: 'Một nữa', content: value, from_run_id: from }),
    ).rejects.toMatchObject({ response: { code: 'STRATEGY_LIMIT' } });
    const list = await service.list(owner);
    expect(list.items).toHaveLength(20);
    // Delete one: the limit frees a slot and the name is reusable (any case).
    const first = list.items.find((item) => item.name === 'Chiến lược 0')!;
    await service.remove(owner, first.id);
    await expect(
      service.create(owner, { name: 'chiến lược 1', content: value, from_run_id: from }),
    ).rejects.toMatchObject({ response: { code: 'STRATEGY_NAME_TAKEN' } });
    const reused = await service.create(owner, {
      name: 'CHIẾN LƯỢC 0',
      content: value,
      from_run_id: from,
    });
    expect(reused.strategy.name).toBe('CHIẾN LƯỢC 0');
    await expect(service.rename(owner, reused.strategy.id, 'chiến lược 5')).rejects.toMatchObject({
      response: { code: 'STRATEGY_NAME_TAKEN' },
    });
    // Deleted strategies are 404 for every read; the reader still resolves them (history).
    await expect(service.versions(owner, first.id)).rejects.toMatchObject({
      response: { code: 'STRATEGY_NOT_FOUND' },
    });
    const resolved = await reader.resolve(owner, { source: 'user', id: first.id });
    expect(resolved).toMatchObject({ name: 'Chiến lược 0', deleted: true, ref: { version: 1 } });
  });

  it('S05 delete is refused while the Bot uses the strategy (last or next)', async () => {
    const owner = await user();
    const value = content();
    const created = await service.create(owner, {
      name: 'Bot',
      content: value,
      from_run_id: await run(owner, value),
    });
    for (const state of [
      { last: true, next: false },
      { last: false, next: true },
    ]) {
      usage.set(created.strategy.id, state);
      await expect(service.remove(owner, created.strategy.id)).rejects.toMatchObject({
        response: { code: 'STRATEGY_IN_USE' },
      });
    }
    expect((await service.list(owner)).items[0]?.on_bot).toEqual({ last: false, next: true });
    usage.delete(created.strategy.id);
    await service.remove(owner, created.strategy.id);
    expect((await service.list(owner)).items).toHaveLength(0);
  });

  it('S08 two concurrent saves on the same latest version: exactly one 409 STRATEGY_VERSION_CONFLICT', async () => {
    const owner = await user();
    const v1 = content();
    const created = await service.create(owner, {
      name: 'Song song',
      content: v1,
      from_run_id: await run(owner, v1),
    });
    const a = content({ max_holding: 40 });
    const b = content({ max_holding: 50 });
    const [runA, runB] = [await run(owner, a), await run(owner, b)];
    const results = await Promise.allSettled([
      service.createVersion(owner, created.strategy.id, {
        content: a,
        from_run_id: runA,
        expected_latest_version: 1,
      }),
      service.createVersion(owner, created.strategy.id, {
        content: b,
        from_run_id: runB,
        expected_latest_version: 1,
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ response: { code: 'STRATEGY_VERSION_CONFLICT' } });
    const versions = await service.versions(owner, created.strategy.id);
    expect(versions.items.map((item) => item.version)).toEqual([2, 1]);
  });

  it('S14 restore creates a new version with the old content and a note; versions are immutable', async () => {
    const owner = await user();
    const v1 = content();
    const created = await service.create(owner, {
      name: 'Khôi phục',
      content: v1,
      from_run_id: await run(owner, v1),
    });
    const v2 = content({ max_holding: 10 });
    await service.createVersion(owner, created.strategy.id, {
      content: v2,
      from_run_id: await run(owner, v2),
      expected_latest_version: 1,
    });
    const restored = await service.restore(owner, created.strategy.id, 1, {
      expected_latest_version: 2,
    });
    expect(restored.version).toMatchObject({ version: 3, content: v1, from_run_id: null });
    expect(restored.version.note).toMatch(/^Khôi phục từ bản \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(restored.version.config_hash).toBe(strategyConfigHash(v1));
    const old = await service.version(owner, created.strategy.id, 1);
    expect(old.content).toEqual(v1);
    await expect(
      pool.query(`update user_strategy_versions set note = 'x' where strategy_id = $1`, [
        created.strategy.id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query(`delete from user_strategy_versions where strategy_id = $1`, [
        created.strategy.id,
      ]),
    ).rejects.toThrow(/immutable/);
    const latest = await reader.resolve(owner, { source: 'user', id: created.strategy.id });
    expect(latest).toMatchObject({
      ref: { version: 3 },
      content: v1,
      hidden: false,
      deleted: false,
    });
  });

  it('S07 apply_next goes to the Bot schedule port in the same transaction; its error rolls the save back', async () => {
    const owner = await user();
    const v1 = content();
    const created = await service.create(owner, {
      name: 'Áp dụng',
      content: v1,
      from_run_id: await run(owner, v1),
      apply_next: true,
      expected_next_session: '2026-11-23',
      confirm_due_positions: ['HDB'],
    });
    expect(created.schedule).toEqual({ next: { session_date: '2026-11-23' } });
    expect(applied.at(-1)).toEqual({
      userId: owner,
      inTx: true,
      request: {
        ref: { source: 'user', id: created.strategy.id, version: 1 },
        expected_next_session: '2026-11-23',
        confirm_due_positions: ['HDB'],
        follow_latest: true,
      },
    });
    const v2 = content({ max_holding: 5 });
    failApply = Object.assign(new Error('locked'), {
      response: { code: 'SCHEDULE_SESSION_LOCKED' },
    });
    await expect(
      service.createVersion(owner, created.strategy.id, {
        content: v2,
        from_run_id: await run(owner, v2),
        expected_latest_version: 1,
        apply_next: true,
        expected_next_session: '2026-11-23',
      }),
    ).rejects.toThrow('locked');
    failApply = null;
    expect((await service.versions(owner, created.strategy.id)).latest_version).toBe(1);
  });

  it('STRATEGY_READER resolves IQX templates by id or slug (current by default, hidden flagged)', async () => {
    const [template] = await database.query<{ id: string; current_version: number }>(
      `select id, current_version from iqx_templates where kind = 'strategy' and slug = 'phadinh'`,
    );
    const owner = await user();
    const current = await reader.resolve(owner, { source: 'iqx', id: 'phadinh' });
    expect(current).toMatchObject({
      ref: { source: 'iqx', id: template!.id, version: template!.current_version },
      name: 'Phá đỉnh',
      version_label: `v${template!.current_version}`,
      content: { universe: { type: 'vn30' }, max_holding: 30 },
      hidden: false,
    });
    // v1 (before the basket) reads as VN30 with its own Giữ tối đa.
    const v1 = await reader.resolve(owner, { source: 'iqx', id: template!.id, version: 1 });
    expect(v1?.content).toMatchObject({ universe: { type: 'vn30' }, max_holding: 30 });
    expect(
      await reader.resolve(owner, { source: 'iqx', id: template!.id, version: 99 }),
    ).toBeNull();
    expect(await reader.resolve(owner, { source: 'user', id: 'not-a-uuid' })).toBeNull();
  });

  it('universe options: VN30/VN100 of the store, saved lists split into kept and excluded', async () => {
    const owner = await user();
    await database.query(
      `insert into list_snapshots (user_id, name, tickers, as_of, data_source)
       values ($1, 'Danh sách A', array['HPG','VIX','acb'], '2026-11-20', 'test')`,
      [owner],
    );
    const options = await service.universeOptions(owner);
    expect(options.vn30.symbols).toEqual(['ACB', 'FPT']);
    expect(options.saved_lists).toEqual([
      expect.objectContaining({
        name: 'Danh sách A',
        symbols_total: 3,
        symbols_kept: ['ACB', 'HPG'],
        excluded: ['VIX'],
      }),
    ]);
  });

  it('backtest_runs: a basket run needs a strategy source; legacy kinds keep shared_revision', async () => {
    const owner = await user();
    await expect(
      database.query(
        `insert into backtest_runs (user_id, kind, shared_revision, request, request_hash,
           snapshot, result, config_hash, engine_version, calculation_version, rule_version,
           idempotency_key, status)
         values ($1, 'basket', null, '{}', $2, '{}', '{}', $2, 'e', 'c', 'r', 'k-basket-1', 'succeeded')`,
        [owner, 'b'.repeat(64)],
      ),
    ).rejects.toThrow(/ck_backtest_runs_basket_shape/);
  });
});

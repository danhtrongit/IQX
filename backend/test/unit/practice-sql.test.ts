import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
import { PracticeDataService } from '../../src/modules/practice/practice.data.js';
import { PracticeRepository } from '../../src/modules/practice/practice.repository.js';
import { PracticeService } from '../../src/modules/practice/practice.service.js';
import { loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import { FakeDataPort, newKey, walkRows } from './practice-fixtures.js';

/**
 * Real-PostgreSQL checks of the practice schema (migration 0017) and SQL store: unique keys,
 * row locks, immutability triggers, cursor guard and cascade. They run only when
 * PRACTICE_TEST_DATABASE_URL points to a LOCAL database named `iqx_v2_test_*` that already has
 * the migrations applied; otherwise the suite is skipped (the logic is covered by the in-memory
 * suites).
 */
const url = process.env.PRACTICE_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
    !name.startsWith('iqx_v2_test_')
  )
    throw new Error('PRACTICE_TEST_DATABASE_URL must target a local iqx_v2_test_* database');
}

const set = loadPracticeSet();

describe.skipIf(!url)('practice schema on PostgreSQL', () => {
  let database: DatabaseService;
  let service: PracticeService;
  let data: FakeDataPort;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const frozenSetVersion = `test-set-${randomUUID()}`;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const values: Record<string, unknown> = {
      DATABASE_URL: url,
      DB_POOL_MAX: 8,
      DB_STATEMENT_TIMEOUT_MS: 15_000,
      DB_CONNECT_TIMEOUT_MS: 5_000,
      DB_READ_ONLY: false,
    };
    database = new DatabaseService({ get: (key: string) => values[key] } as never);
    for (const id of [userId, otherUserId]) {
      await database.query(
        `insert into users (id, email, hashed_password, full_name) values ($1, $2, 'x', 'Practice Test')`,
        [id, `practice-${id}@example.test`],
      );
    }
    data = new FakeDataPort(set);
    const grants: AcademyGrantsPort = {
      grantedCapabilities: async () =>
        new Set(PRACTICE_INDICATOR_IDS.map((id) => `indicator:${id}`)),
    };
    service = new PracticeService(new PracticeRepository(database), grants, data, set);
  });

  afterAll(async () => {
    await database.query('delete from practice_symbol_data where set_version = $1', [
      frozenSetVersion,
    ]);
    await database.query('delete from users where id = any($1::uuid[])', [[userId, otherUserId]]);
    await database.close();
  });

  const count = async (table: string, where = 'true', values: unknown[] = []): Promise<number> =>
    Number(
      (
        await database.query<{ n: string }>(
          `select count(*) as n from ${table} where ${where}`,
          values,
        )
      )[0]?.n,
    );

  it('creates a single immutable 30-case permutation under concurrent first requests', async () => {
    const states = await Promise.all(Array.from({ length: 6 }, () => service.state(userId, 'rsi')));
    expect(new Set(states.map((state) => state.case.case_id)).size).toBe(1);
    const [progress] = await database.query<{ id: string }>(
      `select id from practice_progress where user_id = $1 and indicator_id = 'rsi'`,
      [userId],
    );
    const cases = await database.query<{ ordinal: number; symbol: string }>(
      `select ordinal, symbol from practice_cases where progress_id = $1 order by ordinal`,
      [progress!.id],
    );
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((row) => row.symbol))).toEqual(new Set(set.symbols));
    await expect(
      database.query(`update practice_cases set symbol = 'ACB' where progress_id = $1`, [
        progress!.id,
      ]),
    ).rejects.toThrow(/immutable/);
    // unique symbol per progress and unique ordinal
    await expect(
      database.query(
        `insert into practice_cases (progress_id, ordinal, case_id, symbol) values ($1, 1, $2, 'ZZZ')`,
        [progress!.id, randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it('rejects an indicator outside the 16 and draft revisions out of order', async () => {
    await expect(
      database.query(
        `insert into practice_progress (id, user_id, indicator_id, set_version, draft)
         values ($1, $2, 'adx', 'v', '{}'::jsonb)`,
        [randomUUID(), userId],
      ),
    ).rejects.toThrow();
    const state = await service.state(userId, 'rsi');
    const saved = await service.saveDraft(userId, 'rsi', {
      expected_revision: state.draft_revision,
      draft: { ...state.draft, hold_max_sessions: 33 },
    });
    expect(saved.draft_revision).toBe(state.draft_revision + 1);
    await expect(
      service.saveDraft(userId, 'rsi', {
        expected_revision: state.draft_revision,
        draft: state.draft,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('creates one run for concurrent starts and locks it against edits', async () => {
    const state = await service.state(userId, 'rsi');
    const request = (key: string) =>
      service.startRun(userId, 'rsi', {
        idempotency_key: key,
        ordinal: state.ordinal,
        case_id: state.case.case_id,
        config: state.draft,
      });
    const runs = await Promise.all([
      request('sql-tab-a-0001'),
      request('sql-tab-b-0002'),
      request('sql-tab-a-0001'),
    ]);
    expect(new Set(runs.map((run) => run.run_id)).size).toBe(1);
    expect(runs.every((run) => run.status === 'succeeded')).toBe(true);
    expect(await count('practice_runs', 'user_id = $1', [userId])).toBe(1);
    const runId = runs[0]!.run_id;

    // replay returns the stored immutable result
    const read = await service.getRun(userId, runId);
    expect(read.result).toEqual(runs[0]!.result);

    await expect(
      database.query(`update practice_runs set result = '{}'::jsonb where id = $1`, [runId]),
    ).rejects.toThrow(/immutable/);
    await expect(
      database.query(`update practice_runs set hold_max_sessions = 5 where id = $1`, [runId]),
    ).rejects.toThrow(/immutable/);
    // another owner cannot read the run
    await expect(service.getRun(otherUserId, runId)).rejects.toMatchObject({ status: 404 });
  });

  it('advances the cursor by exactly one for a double click and never skips', async () => {
    const [progress] = await database.query<{ id: string }>(
      `select id from practice_progress where user_id = $1 and indicator_id = 'rsi'`,
      [userId],
    );
    // the DB itself refuses to skip a case or to leave the range
    await expect(
      database.query(`update practice_progress set cursor_ordinal = 3 where id = $1`, [
        progress!.id,
      ]),
    ).rejects.toThrow(/exactly one/);
    const clicks = await Promise.all([
      service.next(userId, 'rsi', { expected_cursor: 1, idempotency_key: 'sql-click-0001' }),
      service.next(userId, 'rsi', { expected_cursor: 1, idempotency_key: 'sql-click-0002' }),
      service.next(userId, 'rsi', { expected_cursor: 1, idempotency_key: 'sql-click-0001' }),
    ]);
    expect(clicks.map((state) => state.ordinal)).toEqual([2, 2, 2]);
    expect(await count('practice_advances', 'progress_id = $1', [progress!.id])).toBe(1);
    // cursor 2 has no completed run: the guard refuses a direct advance
    await expect(
      database.query(`update practice_progress set cursor_ordinal = 3 where id = $1`, [
        progress!.id,
      ]),
    ).rejects.toThrow(/after the current run completed/);
    await expect(
      service.next(userId, 'rsi', { expected_cursor: 2, idempotency_key: newKey() }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it('keeps a failed run locked for retry and consumes nothing on a data failure', async () => {
    const state = await service.state(userId, 'macd');
    data.corruptOnce = true;
    const body = {
      idempotency_key: 'sql-retry-0001',
      ordinal: state.ordinal,
      case_id: state.case.case_id,
      config: state.draft,
    };
    await expect(service.startRun(userId, 'macd', body)).rejects.toMatchObject({ status: 500 });
    const failed = await database.query<{ status: string; attempts: number }>(
      `select r.status, r.attempts from practice_runs r join practice_progress p on p.id = r.progress_id
       where p.user_id = $1 and p.indicator_id = 'macd'`,
      [userId],
    );
    expect(failed).toEqual([{ status: 'failed', attempts: 1 }]);
    // the locked config cannot be edited while the run waits for its retry
    await expect(
      database.query(
        `update practice_runs set hold_max_sessions = 5
         where user_id = $1 and indicator_id = 'macd'`,
        [userId],
      ),
    ).rejects.toThrow(/locked practice run configuration/);
    const retried = await service.startRun(userId, 'macd', body);
    expect(retried.status).toBe('succeeded');
    expect(await count('practice_runs', `user_id = $1 and indicator_id = 'macd'`, [userId])).toBe(
      1,
    );
  });

  it('summarises progress and paginates the history from SQL', async () => {
    const list = await service.listIndicators(userId);
    const byId = new Map(list.indicators.map((item) => [item.indicator_id, item]));
    expect(byId.get('rsi')?.progress).toMatchObject({
      status: 'in_progress',
      cursor: 2,
      completed_count: 1,
      total: 30,
    });
    expect(byId.get('macd')?.progress).toMatchObject({ cursor: 1, completed_count: 1 });
    expect(byId.get('ema')?.progress).toMatchObject({ status: 'not_started', completed_count: 0 });
    const history = await service.history(userId, 'rsi', { page: 1, page_size: 5 });
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({ ordinal: 1, config: { hold_max_sessions: 33 } });
    expect(history.items[0]!.kpis).toMatchObject({ buy_count: expect.any(Number) });
    expect((await service.history(userId, 'rsi', { page: 2, page_size: 5 })).items).toEqual([]);
    expect((await service.history(otherUserId, 'rsi', { page: 1, page_size: 5 })).total).toBe(0);
  });

  it('freezes bars once per (set_version, symbol) and never rewrites them', async () => {
    const rows = walkRows('FPT');
    const market = {
      calls: 0,
      async getHistoricalOhlcv() {
        this.calls += 1;
        await Promise.resolve();
        const records = rows.map(([time, open, high, low, close, volume]) => ({
          time,
          open,
          high,
          low,
          close,
          volume,
        }));
        const startIndex = records.findIndex((record) => record.time >= set.observation.from);
        return { records, startIndex, source: 'TEST', sourcePriority: 1, adjusted: false };
      },
    };
    const custom = { ...set, set_version: frozenSetVersion };
    const frozen = new PracticeDataService(new PracticeRepository(database), custom, market);
    const [a, b] = await Promise.all([frozen.load('FPT'), frozen.load('FPT')]);
    expect(a.data_version).toBe(b.data_version);
    expect(market.calls).toBe(1);
    const second = new PracticeDataService(new PracticeRepository(database), custom, market);
    expect((await second.load('FPT')).data_version).toBe(a.data_version);
    expect(market.calls).toBe(1);
    const [row] = await database.query<{
      data_version: string;
      warmup_bars: number;
      observation_bars: number;
    }>(
      `select data_version, warmup_bars, observation_bars from practice_symbol_data
       where set_version = $1 and symbol = 'FPT'`,
      [frozenSetVersion],
    );
    expect(row).toMatchObject({ data_version: a.data_version });
    expect(row!.warmup_bars).toBeGreaterThanOrEqual(300);
    await expect(
      database.query(`update practice_symbol_data set price_scale = 1000 where set_version = $1`, [
        frozenSetVersion,
      ]),
    ).rejects.toThrow(/frozen/);
  });

  it('removes every practice row with the user (cascade) without touching other owners', async () => {
    await service.state(otherUserId, 'ma');
    await database.query('delete from users where id = $1', [userId]);
    expect(await count('practice_progress', 'user_id = $1', [userId])).toBe(0);
    expect(await count('practice_runs', 'user_id = $1', [userId])).toBe(0);
    expect(await count('practice_progress', 'user_id = $1', [otherUserId])).toBe(1);
  });
});

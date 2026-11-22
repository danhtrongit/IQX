/**
 * Daily price store (migration 0058, PLAN-bot-strategy D2–D4) on a real PostgreSQL.
 *
 * Database: `TEST_DATABASE_URL` (name starting `iqx_v2_test_`, local) with
 * `IQX_TEST_EXTERNAL_SERVICES=1`; otherwise a Postgres container. The test creates its own database,
 * runs every migration, and drops it at the end. The pool uses the production statement timeout
 * (3 s) so columnar loads are checked to stay well inside it.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { Environment } from '../../src/platform/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  PgPriceStoreRepository,
  PriceStoreService,
  type PriceStoreSourcePort,
} from '../../src/modules/price-store/index.js';
import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import { runBasketBacktest } from '../../src/modules/strategy-rules/index.js';
import { assertIsolatedTestDatabaseUrl } from '../helpers/test-stack.js';

const { Client } = pg;
const run = promisify(execFile);
const BACKEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VN = 7 * 3_600_000;

function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

const ts = (date: string) => (Date.parse(`${date}T00:00:00Z`) - VN) / 1000;
const row = (date: string, close: number, volume = 1_000_000) => ({
  time: ts(date),
  open: close,
  high: close + 0.2,
  low: close - 0.2,
  close,
  volume,
});

class FakeSource implements PriceStoreSourcePort {
  stocks = new Map<string, unknown[]>();
  index: unknown[] = [];
  async stockHistory(symbol: string) {
    return this.stocks.get(symbol) ?? [];
  }
  async indexHistory() {
    return this.index;
  }
}

function databaseService(url: string, statementTimeoutMs = 3_000): DatabaseService {
  const values: Partial<Environment> = {
    DATABASE_URL: url,
    DB_READ_ONLY: false,
    DB_POOL_MAX: 6,
    DB_CONNECT_TIMEOUT_MS: 5_000,
    DB_STATEMENT_TIMEOUT_MS: statementTimeoutMs,
  } as Partial<Environment>;
  const config = { get: (key: keyof Environment) => values[key] };
  return new DatabaseService(config as unknown as ConfigService<Environment, true>);
}

const DATES = weekdays('2024-01-01', 520);
const LAST = DATES.at(-1)!;
const at16 = (date: string) => new Date(Date.parse(`${date}T16:00:00Z`) - VN);
const SYMBOLS = ['AAA', 'BBB', 'CCC'];

describe('price store on PostgreSQL', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let adminUrl: string;
  let url: string;
  let databaseName: string;
  let database: DatabaseService;
  let repository: PgPriceStoreRepository;

  async function migrate(): Promise<void> {
    await run(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, DATABASE_URL: url, V2_MIGRATIONS_ALLOWED: 'true' },
    });
  }

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      if (process.env.IQX_TEST_EXTERNAL_SERVICES !== '1')
        throw new Error('TEST_DATABASE_URL requires IQX_TEST_EXTERNAL_SERVICES=1');
      adminUrl = assertIsolatedTestDatabaseUrl(process.env.TEST_DATABASE_URL).toString();
    } else {
      container = await new PostgreSqlContainer('postgres:17-alpine')
        .withDatabase('iqx_v2_test_containers')
        .start();
      adminUrl = container.getConnectionUri();
    }
    databaseName = `iqx_v2_test_pstore_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    await admin.end();
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    url = target.toString();
    await migrate();
    database = databaseService(url);
    repository = new PgPriceStoreRepository(database);
  });

  afterAll(async () => {
    await database?.onApplicationShutdown().catch(() => undefined);
    if (databaseName) {
      const admin = new Client({ connectionString: adminUrl });
      await admin.connect();
      await admin.query(`drop database if exists ${databaseName} with (force)`);
      await admin.end();
    }
    await container?.stop();
  });

  beforeEach(async () => {
    await database.query('delete from strategy_price_bars');
    await database.query('delete from strategy_price_symbols');
    await database.query(
      `delete from index_membership_snapshots where index_code in ('VN30', 'VN100')`,
    );
  });

  function sourceOf(dates = DATES): FakeSource {
    const source = new FakeSource();
    SYMBOLS.forEach((symbol, k) => {
      // CCC lists late (from session 100) and is suspended on sessions 300–302.
      const own = dates.filter((_, i) => symbol !== 'CCC' || (i >= 100 && (i < 300 || i > 302)));
      source.stocks.set(
        symbol,
        own.map((date, i) => row(date, 20 + k * 10 + Math.sin(i / 7) * 3, 500_000 + k * 100_000)),
      );
    });
    source.index = dates.map((date, i) => row(date, 1_200 + i * 0.37));
    return source;
  }

  async function membership(code: string, session: string, symbols: string[]): Promise<void> {
    await database.query(
      `insert into index_membership_snapshots (index_code, session_date, symbols, source, fetched_at, source_hash)
       values ($1, $2::date, $3::text[], 'test', now(), $4)`,
      [code, session, symbols, 'a'.repeat(64)],
    );
  }

  it('migration 0058: tables, keys and checks; re-running migrations is a no-op', async () => {
    const columns = await database.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_name in ('strategy_price_symbols', 'strategy_price_bars') order by 1, ordinal_position`,
    );
    expect(
      columns.filter((c) => c.table_name === 'strategy_price_bars').map((c) => c.column_name),
    ).toEqual([
      'symbol',
      'date',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'value_vnd',
      'close_idx',
    ]);
    expect(columns.some((c) => c.column_name === 'series_rev')).toBe(true);
    await expect(
      database.query(
        `insert into strategy_price_bars (symbol, date, open, high, low, close, volume) values ('ZZZ', '2024-01-01', 1, 1, 1, 1, 1)`,
      ),
    ).rejects.toThrow();
    await migrate();
  });

  it('refresh: first build, idempotent rerun, adjustment bumps series_rev, never deletes', async () => {
    await membership('VN100', DATES[0]!, SYMBOLS);
    await membership('VN30', DATES[0]!, ['AAA', 'BBB']);
    const source = sourceOf();
    const service = new PriceStoreService(repository, source);
    const first = await service.refresh({ now: at16(LAST) });
    expect(first).toMatchObject({ status: 'refreshed', data_as_of: LAST, set_size: 3 });
    const counts = await database.query<{ symbol: string; n: number }>(
      `select symbol, count(*)::int as n from strategy_price_bars group by symbol order by symbol`,
    );
    expect(counts).toEqual([
      { symbol: 'AAA', n: 520 },
      { symbol: 'BBB', n: 520 },
      { symbol: 'CCC', n: 417 },
      { symbol: 'VNINDEX', n: 520 },
    ]);
    const [aaa] = await database.query<{ close: string }>(
      `select close::text from strategy_price_bars where symbol = 'AAA' order by date limit 1`,
    );
    expect(aaa!.close).toBe('20000'); // R16: 20 (thousand VND) → 20.000 đ

    expect((await service.refresh({ now: at16(LAST) })).status).toBe('up_to_date');
    const forced = await service.refresh({ now: at16(LAST), force: true });
    expect(forced.outcomes.every((outcome) => outcome.status === 'unchanged')).toBe(true);
    const revs = await database.query<{ series_rev: number }>(
      `select series_rev from strategy_price_symbols`,
    );
    expect(revs.every((r) => r.series_rev === 1)).toBe(true);

    // Next session: AAA history re-adjusted (× 0.95), BBB appended; CCC dropped from the vendor.
    const next = weekdays(LAST, 2)[1]!;
    const more = [...DATES, next];
    const adjusted = sourceOf(more);
    adjusted.stocks.set(
      'AAA',
      more.map((date, i) =>
        row(date, Math.round((20 + Math.sin(i / 7) * 3) * 0.95 * 100) / 100, 500_000),
      ),
    );
    adjusted.stocks.set('CCC', []);
    const second = await new PriceStoreService(repository, adjusted).refresh({ now: at16(next) });
    expect(second).toMatchObject({ data_as_of: next, adjusted: ['AAA'] });
    const symbols = await repository.symbols();
    expect(symbols.find((s) => s.symbol === 'AAA')).toMatchObject({
      series_rev: 2,
      bars_count: 521,
      last_date: next,
    });
    expect(symbols.find((s) => s.symbol === 'BBB')).toMatchObject({
      series_rev: 1,
      bars_count: 521,
    });
    // CCC: vendor failure recorded, its 417 bars kept (never deleted).
    expect(symbols.find((s) => s.symbol === 'CCC')).toMatchObject({ bars_count: 417 });
    expect(symbols.find((s) => s.symbol === 'CCC')!.last_error).toContain('không trả nến');
  });

  it('reads: meta, eligibility, members at a session, columnar series aligned to the calendar', async () => {
    await membership('VN100', DATES[0]!, ['AAA', 'BBB', 'CCC', 'NOPE']);
    await membership('VN100', DATES[400]!, ['AAA', 'BBB']);
    await membership('VN30', DATES[400]!, ['AAA', 'CCC']);
    const service = new PriceStoreService(repository, sourceOf());
    await service.refresh({ now: at16(LAST), extraSymbols: ['CCC'] });

    expect(await service.meta()).toEqual({
      data_store: 'flashback_vn100',
      data_as_of: LAST,
      earliest_start: DATES[450],
      price_unit: 'VND',
      adjusted: true,
      sessions: 520,
    });
    const eligibility = await service.eligibility();
    expect(eligibility).toMatchObject({ vn100: ['AAA', 'BBB'], vn30: ['AAA'] });
    expect(await service.membersAt('VN100', DATES[10]!)).toEqual(['AAA', 'BBB', 'CCC']);
    expect(await service.membersAt('VN100', LAST)).toEqual(['AAA', 'BBB']);

    const started = Date.now();
    const bundle = await service.loadSeries(SYMBOLS);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(bundle.calendar).toHaveLength(520);
    expect(bundle.data_as_of).toBe(LAST);
    expect(bundle.market![519]).toBeCloseTo(1_200 + 519 * 0.37, 2);
    const ccc = bundle.symbols.CCC!;
    expect(ccc.close.length).toBe(417);
    expect(ccc.session_idx[0]).toBe(100);
    expect([...ccc.session_idx.slice(199, 202)]).toEqual([299, 303, 304]);
    expect(bundle.symbols.AAA!.close[0]).toBe(20_000);
    const until = await service.loadSeries(['AAA'], { until: DATES[300] });
    expect(until.calendar.at(-1)).toBe(DATES[300]);
    expect(until.symbols.AAA!.close.length).toBe(301);
    expect(until.data_hash).not.toBe(bundle.data_hash);

    // A basket Backtest on the loaded store: prices in VND end to end (R16).
    const indicators = structuredClone(defaultConfig().indicators);
    indicators.rsi!.master_enabled = true;
    indicators.rsi!.buy.enabled = true;
    const result = runBasketBacktest({
      content: { universe: { type: 'vn100' }, indicators, max_holding: 30 },
      universe: SYMBOLS,
      start: DATES[451]!,
      end: LAST,
      data: bundle,
    });
    expect(result.sessions).toBe(69);
    for (const trade of result.trades) expect(trade.entry_price_vnd).toBeGreaterThan(10_000n);
    expect(await repository.openPositionSymbols()).toEqual([]);
  });
});

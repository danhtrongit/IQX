import { randomUUID } from 'node:crypto';
import { HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import type { OhlcvRecord } from '../../src/modules/quant/indicators.js';
import type {
  HistoricalBars,
  QuantMarketDataProvider,
} from '../../src/modules/quant/quant.types.js';
import { dataHash } from '../../src/modules/quant/v2/advanced/index.js';
import {
  CALCULATION_VERSION,
  CLEAN_TECH_2_0,
  ENGINE_VERSION,
  FORMULA_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  configHash,
  defaultConfig,
  type Bar,
  type IndicatorConfig,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import { StrategyBacktestsEnabledGuard } from '../../src/modules/strategy-backtests/strategy-backtests-enabled.guard.js';
import {
  CAPABILITY_LESSONS,
  capabilityLockedException,
  findCapabilityLock,
} from '../../src/modules/strategy-backtests/strategy-backtests.capabilities.js';
import { StrategyBacktestExecutor } from '../../src/modules/strategy-backtests/strategy-backtests.executor.js';
import type {
  BacktestRunRecord,
  BacktestRunRow,
  BacktestRunSummaryRow,
  StrategyBacktestStore,
} from '../../src/modules/strategy-backtests/strategy-backtests.repository.js';
import { backtestRunBodySchema } from '../../src/modules/strategy-backtests/strategy-backtests.schemas.js';
import { StrategyBacktestsService } from '../../src/modules/strategy-backtests/strategy-backtests.service.js';
import type { SharedConfigReaderPort } from '../../src/modules/strategy-config/strategy-config.ports.js';
import { deepFreeze, reference } from '../fixtures/bot-v2/reference.js';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const SAVED_AT = '2025-06-02T03:00:00.000Z';

const synthetic = deepFreeze(reference.syntheticBars(950));
const START = synthetic[400]!.date;
const END = synthetic[949]!.date;

function indicator(config: SharedConfig, id: string): IndicatorConfig {
  const item = config.indicators[id];
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

/** MA master ON with buy period 20 / sell period 30 (same setup as the research parity tests). */
function maConfig(): SharedConfig {
  const config = defaultConfig();
  indicator(config, 'ma').master_enabled = true;
  indicator(config, 'ma').buy.enabled = true;
  indicator(config, 'ma').sell.enabled = true;
  indicator(config, 'ma').buy.params.period = 20;
  indicator(config, 'ma').sell.params.period = 30;
  return config;
}

/** Sell rules only: the saved revision has no usable Buy condition. */
function sellOnlyConfig(): SharedConfig {
  const config = maConfig();
  indicator(config, 'ma').buy.enabled = false;
  return config;
}

const toRecords = (bars: readonly Bar[], scale = 1): OhlcvRecord[] =>
  bars.map((bar) => ({
    time: bar.date,
    open: bar.open * scale,
    high: bar.high * scale,
    low: bar.low * scale,
    close: bar.close * scale,
    volume: bar.volume,
  }));

const vnindexRecords = (): OhlcvRecord[] =>
  synthetic.map((bar) => {
    const level = bar.market ?? 0;
    return { time: bar.date, open: level, high: level, low: level, close: level, volume: 0 };
  });

/** In-memory provider with the adapter's window semantics (warmup before `start`, rows ≤ `end`). */
class FakeMarketData implements QuantMarketDataProvider {
  readonly calls: string[] = [];
  readonly meta: Omit<HistoricalBars, 'records' | 'startIndex'>;

  constructor(
    private readonly series: Map<string, OhlcvRecord[]>,
    meta: Omit<HistoricalBars, 'records' | 'startIndex'> = {
      source: 'fake-feed',
      sourcePriority: 1,
      adjusted: true,
    },
  ) {
    this.meta = meta;
  }

  getHistoricalOhlcv(
    symbol: string,
    start: string,
    end: string,
    options: { warmupSessions?: number; maxBars?: number } = {},
  ): Promise<HistoricalBars> {
    this.calls.push(symbol);
    const rows = this.series.get(symbol);
    if (!rows)
      return Promise.reject(
        new NotFoundException({ code: 'MARKET_HISTORY_NOT_FOUND', message: 'missing' }),
      );
    const upToEnd = rows.filter((row) => row.time <= end);
    const first = upToEnd.findIndex((row) => row.time >= start);
    const startIndex = first < 0 ? upToEnd.length : first;
    const from = Math.max(0, startIndex - (options.warmupSessions ?? 0));
    return Promise.resolve({
      records: upToEnd.slice(from),
      startIndex: startIndex - from,
      ...this.meta,
    });
  }
}

/** Mirrors the SQL repository: owner-scoped reads, unique (user, idempotency_key). */
class InMemoryStore implements StrategyBacktestStore {
  readonly rows: BacktestRunRow[] = [];
  private clock = Date.parse('2025-07-01T00:00:00.000Z');

  findByIdempotencyKey(userId: string, key: string) {
    return Promise.resolve(
      this.rows.find((row) => row.user_id === userId && row.idempotency_key === key) ?? null,
    );
  }

  insert(record: BacktestRunRecord) {
    if (
      this.rows.some(
        (r) => r.user_id === record.user_id && r.idempotency_key === record.idempotency_key,
      )
    )
      return Promise.resolve(null);
    const row: BacktestRunRow = {
      ...structuredClone(record),
      id: randomUUID(),
      created_at: new Date((this.clock += 1000)),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findById(userId: string, id: string) {
    return Promise.resolve(
      this.rows.find((row) => row.user_id === userId && row.id === id) ?? null,
    );
  }

  list(userId: string, limit: number) {
    const items = this.rows
      .filter((row) => row.user_id === userId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit)
      .map((row): BacktestRunSummaryRow => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        shared_revision: row.shared_revision,
        symbol: String(row.request.symbol),
        start: String(row.request.start),
        end: String(row.request.end),
        created_at: row.created_at,
        config_hash: row.config_hash,
        kpis: ((row.system_result?.kpis ?? row.result?.kpis) as Record<string, unknown>) ?? null,
        error_code: row.error?.code ?? null,
      }));
    return Promise.resolve(items);
  }

  sectors() {
    return Promise.resolve(new Map<string, string | null>());
  }
}

type Revision = { config: SharedConfig; saved_at: string };

/**
 * Read-only reader. Every property access is recorded so a test can prove the
 * service never reaches for anything but `getRevision` (no shared-config write).
 */
function fakeReader(revisions: Map<string, Revision>) {
  const accessed = new Set<string>();
  const getRevision = vi.fn((userId: string, revision: number) => {
    const saved = revisions.get(`${userId}:${revision}`);
    return Promise.resolve(
      saved
        ? {
            revision,
            config: saved.config,
            config_hash: configHash(saved.config),
            saved_at: saved.saved_at,
          }
        : null,
    );
  });
  const target: SharedConfigReaderPort = {
    effectiveFor: vi.fn(() => Promise.resolve(null)),
    getRevision,
  };
  const reader = new Proxy(target, {
    get(object, key, receiver) {
      if (typeof key === 'string') accessed.add(key);
      return Reflect.get(object, key, receiver) as unknown;
    },
  });
  return { reader, accessed, getRevision };
}

const configService = (env: Partial<Record<keyof Environment, unknown>>) =>
  ({ get: (key: keyof Environment) => env[key] }) as unknown as ConfigService<Environment, true>;

const body = (overrides: Record<string, unknown> = {}) =>
  backtestRunBodySchema.parse({
    idempotency_key: 'run-key-0001',
    shared_revision: 3,
    symbol: 'aaa',
    start: START,
    end: END,
    ...overrides,
  });

async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof HttpException))
    throw new Error(`expected HttpException, got ${String(error)}`);
  return error;
}

describe('StrategyBacktestsService', () => {
  let store: InMemoryStore;
  let market: FakeMarketData;
  let reader: ReturnType<typeof fakeReader>;
  let grants: Set<string>;
  let allowlist: string[];
  let savedConfig: SharedConfig;

  const service = () =>
    new StrategyBacktestsService(
      store,
      reader.reader,
      { grantedCapabilities: () => Promise.resolve(grants) } satisfies AcademyGrantsPort,
      new StrategyBacktestExecutor(),
      configService({ STRATEGY_ADVANCED_CAPABILITIES: allowlist }),
      market,
    );

  beforeEach(() => {
    store = new InMemoryStore();
    market = new FakeMarketData(
      new Map([
        ['AAA', toRecords(synthetic)],
        ['BBB', toRecords(synthetic, 1.5)],
        ['VNINDEX', vnindexRecords()],
      ]),
    );
    savedConfig = deepFreeze(maConfig());
    reader = fakeReader(
      new Map([
        [`${OWNER}:3`, { config: savedConfig, saved_at: SAVED_AT }],
        [`${OWNER}:4`, { config: deepFreeze(sellOnlyConfig()), saved_at: SAVED_AT }],
      ]),
    );
    grants = new Set(['indicator:ma']);
    allowlist = [];
  });

  it('stores an immutable snapshot of the saved revision, data and assumptions', async () => {
    const run = await service().create(OWNER, body());

    // Bars the engine saw: 300 warmup sessions before START, VNINDEX attached as `market`.
    const expectedBars: Bar[] = synthetic.slice(100).map((bar) => ({
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      market: bar.market ?? null,
    }));
    const hash = dataHash(expectedBars);

    expect(run).toMatchObject({ status: 'succeeded', kind: 'single', shared_revision: 3 });
    expect(run.error).toBeNull();
    expect(run.research_result).toBeNull();
    expect(run.system_result).toBeNull();
    expect(run.data_warnings).toEqual([]);
    const snapshot = run.snapshot!;
    expect(snapshot.config).toEqual(savedConfig);
    expect(snapshot).toMatchObject({
      shared_revision: 3,
      revision_saved_at: SAVED_AT,
      config_hash: configHash(savedConfig),
      symbol: 'AAA',
      requested_start: START,
      requested_end: END,
      actual_start: START,
      actual_end: END,
      data_source: 'fake-feed',
      data_source_priority: 1,
      adjusted: true,
      skipped_rows: 0,
      data_hash: hash,
      benchmark: { symbol: 'VNINDEX', available: true, source: 'fake-feed' },
      warmup_sessions_requested: 300,
      warmup_bars: 300,
      fee_preset: 'standard',
      fees: { buy: 0.0015, sell: 0.0025 },
      lot_size: CLEAN_TECH_2_0.lot_size,
      execution: 'next_open',
      execution_profile: 'CLEAN_TECH_2.0',
      profile: CLEAN_TECH_2_0,
      slippage: 'not_modelled',
      open_position_policy: 'mark_to_market_last_close',
      versions: {
        schema_version: SCHEMA_VERSION,
        calculation_version: CALCULATION_VERSION,
        rule_version: RULE_VERSION,
        engine_version: ENGINE_VERSION,
        formula_version: FORMULA_VERSION,
      },
      research: null,
      system: null,
    });
    expect(snapshot.options).toMatchObject({
      fee_buy: 0.0015,
      fee_sell: 0.0025,
      lot: CLEAN_TECH_2_0.lot_size,
      execution: 'next_open',
      start: START,
      end: END,
    });
    expect(run.result?.snapshot).toEqual(snapshot);
    expect(run.result?.kpis).toBeDefined();

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      user_id: OWNER,
      status: 'succeeded',
      config_hash: configHash(savedConfig),
      data_hash: hash,
      engine_version: ENGINE_VERSION,
      calculation_version: CALCULATION_VERSION,
      rule_version: RULE_VERSION,
    });
    expect(store.rows[0]!.request).not.toHaveProperty('idempotency_key');
    expect(reader.getRevision).toHaveBeenCalledWith(OWNER, 3);
  });

  it('reports missing inputs as warnings and nulls instead of filling them', async () => {
    market = new FakeMarketData(new Map([['AAA', toRecords(synthetic)]]), { source: 'fake-feed' });
    const run = await service().create(
      OWNER,
      body({ assumptions: { fee_preset: 'none', execution: 'same_close' } }),
    );

    expect(run.data_warnings.map((warning) => warning.code)).toEqual([
      'MARKET_CONTEXT_UNAVAILABLE',
      'PRICES_NOT_ADJUSTED',
    ]);
    expect(run.snapshot).toMatchObject({
      benchmark: { symbol: 'VNINDEX', available: false, source: null },
      adjusted: false,
      fee_preset: 'none',
      fees: { buy: 0, sell: 0 },
      execution: 'same_close',
      options: { fee_buy: 0, fee_sell: 0, execution: 'same_close' },
    });
    // Without VNINDEX the bars carry no `market` value at all (nothing is fabricated).
    const expectedBars = toRecords(synthetic.slice(100)).map(({ time, ...rest }) => ({
      date: time,
      ...rest,
    }));
    expect(run.snapshot?.data_hash).toBe(dataHash(expectedBars));
  });

  it('replays the stored run for the same idempotency key and rejects a different body', async () => {
    const svc = service();
    const first = await svc.create(OWNER, body());
    const fetches = market.calls.length;

    const replay = await svc.create(OWNER, body());
    expect(replay.run_id).toBe(first.run_id);
    expect(replay).toEqual(first);
    expect(market.calls).toHaveLength(fetches);
    expect(store.rows).toHaveLength(1);

    const reused = await rejection(svc.create(OWNER, body({ symbol: 'BBB' })));
    expect(reused.getStatus()).toBe(409);
    expect(reused.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(store.rows).toHaveLength(1);
  });

  it('rejects a revision without Buy rules with 422 and stores the failed run', async () => {
    const svc = service();
    const error = await rejection(svc.create(OWNER, body({ shared_revision: 4 })));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'BUY_RULES_REQUIRED' });
    expect(market.calls).toEqual([]);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      status: 'failed',
      kind: 'single',
      snapshot: null,
      result: null,
      error: { status: 422, code: 'BUY_RULES_REQUIRED' },
    });

    // Replaying the key returns the same deterministic failure without re-running.
    const replay = await rejection(svc.create(OWNER, body({ shared_revision: 4 })));
    expect(replay.getStatus()).toBe(422);
    expect(replay.getResponse()).toMatchObject({ code: 'BUY_RULES_REQUIRED' });
    expect(store.rows).toHaveLength(1);
    const { items } = await svc.list(OWNER, 20);
    expect(items).toEqual([
      expect.objectContaining({ status: 'failed', error_code: 'BUY_RULES_REQUIRED', kpis: null }),
    ]);
  });

  it('returns 404 REVISION_NOT_FOUND for a revision the caller does not own', async () => {
    const svc = service();
    for (const [userId, revision] of [
      [OTHER, 3],
      [OWNER, 99],
    ] as const) {
      const error = await rejection(
        svc.create(
          userId,
          body({ shared_revision: revision, idempotency_key: `foreign-${userId}` }),
        ),
      );
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ code: 'REVISION_NOT_FOUND' });
    }
    expect(reader.getRevision).toHaveBeenCalledWith(OTHER, 3);
    expect(market.calls).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('locks a research capability that is not allowlisted (flag_off)', async () => {
    grants = new Set(['indicator:ma', 'lesson:ch02-l14']);
    const error = await rejection(
      service().create(
        OWNER,
        body({
          research: {
            kind: 'sensitivity',
            path: { indicator: 'ma', side: 'buy', key: 'period' },
            values: [10, 20],
          },
        }),
      ),
    );
    expect(error.getStatus()).toBe(403);
    const lock = { capability: 'sensitivity', reason: 'flag_off', lesson_id: 'ch02-l14' };
    expect(error.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      ...lock,
      details: [lock],
    });
    expect(market.calls).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('locks an allowlisted capability until its lesson is passed (not_learned)', async () => {
    allowlist = ['out_of_sample'];
    const error = await rejection(
      service().create(
        OWNER,
        body({ research: { kind: 'out_of_sample', split_date: synthetic[700]!.date } }),
      ),
    );
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'out_of_sample',
      reason: 'not_learned',
      lesson_id: 'ch02-l15',
    });
    expect(market.calls).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('returns every sensitivity candidate and never writes shared config', async () => {
    allowlist = ['sensitivity'];
    grants = new Set(['indicator:ma', 'lesson:ch02-l14']);
    const values = [10, 20, 30, 50];
    const path = { indicator: 'ma', side: 'buy', key: 'period' } as const;
    const run = await service().create(
      OWNER,
      body({ research: { kind: 'sensitivity', path, values } }),
    );

    expect(run.kind).toBe('sensitivity');
    const research = run.research_result;
    expect(research).toMatchObject({
      type: 'sensitivity',
      policy: 'whole_region_no_best_pick',
      values,
      base_config_hash: configHash(savedConfig),
      data_hash: run.snapshot?.data_hash,
    });
    if (research?.type !== 'sensitivity') throw new Error('expected a sensitivity result');
    expect(research.candidates).toHaveLength(values.length);
    expect(research.candidates.map((candidate) => candidate.value)).toEqual(values);
    expect(research.candidates.every((candidate) => candidate.ok)).toBe(true);
    expect(run.snapshot?.research).toEqual({ kind: 'sensitivity', path, values });
    // Baseline stays the saved revision; the saved config is untouched and only read.
    expect(indicator(run.snapshot!.config, 'ma').buy.params.period).toBe(20);
    expect(configHash(savedConfig)).toBe(run.snapshot?.config_hash);
    expect([...reader.accessed]).toEqual(['getRevision']);
  });

  it('F08 reads only the pinned shared revision and writes no bot/shared-config rows', async () => {
    const svc = service();
    const run = await svc.create(OWNER, body());

    // The run is pinned to the requested revision and reads only `getRevision`.
    expect(run.snapshot?.shared_revision).toBe(3);
    expect(reader.getRevision).toHaveBeenCalledWith(OWNER, 3);
    expect([...reader.accessed]).toEqual(['getRevision']);

    // The frozen CLEAN_TECH_2.0 profile (no stop, next-open) lives only in the snapshot.
    expect(run.snapshot?.profile).toEqual(CLEAN_TECH_2_0);
    expect(run.snapshot?.profile.stop_loss).toBe('none');
    expect(run.snapshot?.execution).toBe('next_open');

    // The only persistence surface is the backtest store; there is no bot/shared-config writer.
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    expect(surface.filter((name) => /bot|capital|shared|revision/i.test(name))).toEqual([]);
    expect(store.rows).toHaveLength(1);

    // A parameter sweep stays isolated too: it only reads the pinned revision.
    allowlist = ['sensitivity'];
    grants = new Set(['indicator:ma', 'lesson:ch02-l14']);
    const sweep = await service().create(
      OWNER,
      body({
        idempotency_key: 'run-key-0002',
        research: {
          kind: 'sensitivity',
          path: { indicator: 'ma', side: 'buy', key: 'period' },
          values: [10, 20],
        },
      }),
    );
    expect(sweep.research_result?.type).toBe('sensitivity');
    expect([...reader.accessed]).toEqual(['getRevision']);
    expect(store.rows).toHaveLength(2);
  });

  it('runs a portfolio system over the explicit symbols and reports missing ones', async () => {
    allowlist = ['portfolio', 'sizing_pct_nav', 'max_positions'];
    grants = new Set(['indicator:ma', 'lesson:ch18-l01', 'lesson:ch17-l01', 'lesson:ch17-l03']);
    const run = await service().create(
      OWNER,
      body({
        system: {
          symbols: ['AAA', 'BBB', 'CCC'],
          sizing: { mode: 'pct_nav', pct: 50 },
          max_positions: 2,
        },
      }),
    );

    expect(run.kind).toBe('portfolio');
    expect(run.system_result?.kpis).toBeDefined();
    expect(run.snapshot?.system).toMatchObject({
      symbols: ['AAA', 'BBB'],
      excluded_symbols: ['CCC'],
      universe: null,
      universe_policy: 'explicit_symbols',
    });
    expect(run.data_warnings).toContainEqual(
      expect.objectContaining({ code: 'SYMBOLS_EXCLUDED', symbols: ['CCC'] }),
    );
    expect(store.rows[0]?.data_hash).toBe(run.snapshot?.system?.data_hash);
  });

  it("refuses a universe run instead of back-filling the past with today's members", async () => {
    allowlist = ['universe', 'portfolio'];
    grants = new Set(['indicator:ma', 'lesson:ch16-l01', 'lesson:ch18-l01']);
    for (const universe of [{ market: 'HOSE' as const }, { list_id: randomUUID() }]) {
      const error = await rejection(
        service().create(OWNER, body({ system: { universe }, idempotency_key: randomUUID() })),
      );
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({ code: 'UNIVERSE_HISTORY_UNAVAILABLE' });
    }
    expect(market.calls).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('re-checks indicator grants at run time and stores nothing when one is missing', async () => {
    grants = new Set();
    const svc = service();
    const error = await rejection(svc.create(OWNER, body()));
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'indicator:ma',
      capabilities: ['indicator:ma'],
      reason: 'not_learned',
    });
    expect(market.calls).toEqual([]);
    expect(store.rows).toEqual([]);

    // The same saved revision runs once the grant exists (the revision itself is untouched).
    grants = new Set(['indicator:ma']);
    await expect(svc.create(OWNER, body())).resolves.toMatchObject({ status: 'succeeded' });
    // A grant that disappears later blocks the next run of that very revision.
    grants = new Set();
    const revoked = await rejection(svc.create(OWNER, body({ idempotency_key: 'run-key-0002' })));
    expect(revoked.getResponse()).toMatchObject({ code: 'CAPABILITY_LOCKED' });
    expect(store.rows).toHaveLength(1);
  });

  it('refuses a legacy_needs_review revision for a run (reader contract) and stores no run', async () => {
    const legacyReader: SharedConfigReaderPort = {
      effectiveFor: () => Promise.resolve(null),
      getRevision: () =>
        Promise.reject(
          new UnprocessableEntityException({
            code: 'LEGACY_CONFIG_NEEDS_REVIEW',
            message: 'Phiên bản cấu hình cũ dùng chỉ báo đã bỏ khỏi danh mục.',
          }),
        ),
    };
    const svc = new StrategyBacktestsService(
      store,
      legacyReader,
      { grantedCapabilities: () => Promise.resolve(grants) } satisfies AcademyGrantsPort,
      new StrategyBacktestExecutor(),
      configService({ STRATEGY_ADVANCED_CAPABILITIES: allowlist }),
      market,
    );
    const error = await rejection(svc.create(OWNER, body()));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'LEGACY_CONFIG_NEEDS_REVIEW' });
    expect(market.calls).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('exposes exactly the six KPIs, the counts, the chart contract and the full trade history', async () => {
    const svc = service();
    const run = await svc.create(OWNER, body({ assumptions: { execution: 'same_close' } }));
    const result = run.result!;

    expect(Object.keys(result.kpis).sort()).toEqual([
      'annualized_return_pct',
      'buy_hold_return_pct',
      'closed_trade_count',
      'max_drawdown_pct',
      'total_return_pct',
      'win_rate_pct',
    ]);
    expect(JSON.stringify(result)).not.toContain('n_trades');
    expect(result.contract).toBe('iqx-strategy-backtest-1.0');
    expect(result.counts.closed_trade_count).toBe(result.trades.length);
    expect(result.counts.buy_count).toBe(result.trades.length + result.counts.open_position_count);
    expect(result.trades.length).toBeGreaterThan(3);
    expect(result.kpis.closed_trade_count).toBe(result.trades.length);
    expect(result.kpis.total_return_pct).toBeCloseTo(
      result.curve[result.curve.length - 1]!.return_pct,
      9,
    );
    expect(result.chart.title).toBe('Lợi nhuận danh mục (%)');
    expect(result.chart.series.map((series) => series.label)).toEqual([
      'Danh mục chiến lược',
      'Mua và giữ AAA',
      'VN-Index',
    ]);
    expect(result.chart.series[2]).toMatchObject({ available: true, field: 'market_pct' });
    const trade = result.trades[0]!;
    expect(trade.entry_signal_date).toBe(trade.entry_date); // same_close
    expect(trade.entry_total).toBeCloseTo(trade.qty * trade.entry_price * 1.0015, 6);
    expect(trade.exit_net).toBeCloseTo(trade.qty * trade.exit_price * (1 - 0.0025), 6);
    expect(trade.pnl).toBeCloseTo(trade.exit_net - trade.entry_total, 6);
    expect(trade.entry_conditions?.rules[0]).toMatchObject({ indicator: 'ma', side: 'buy' });
    expect(trade.exit_conditions?.rules[0]).toMatchObject({ indicator: 'ma', side: 'sell' });
    expect(run.snapshot?.simulation).toMatchObject({
      contract: 'iqx-strategy-backtest-1.0',
      execution: 'same_close',
      execution_label: 'Đóng cửa cùng phiên',
      position_policy: 'single_symbol_long_only_one_position',
      exits: 'none: no stop, take-profit, trailing or max holding',
      min_held_bars: 2,
      min_held_bars_status: 'carried_over_from_reference_engine_pending_product_decision',
      settlement: 'not_modelled',
      slippage: 'not_modelled',
      annualization_sessions: 252,
    });

    // The stored record is the immutable engine record; the spec names are a read-time view.
    const stored = store.rows[0]!.result as { kpis: Record<string, unknown> };
    expect(stored.kpis).toHaveProperty('n_trades', result.trades.length);

    // List summaries use the same six-KPI naming.
    const { items } = await svc.list(OWNER, 5);
    expect(items[0]!.kpis).toEqual(result.kpis);

    // The paged history reports the whole run in `total`.
    const page = await svc.trades(OWNER, run.run_id, 1, 2);
    expect(page).toMatchObject({
      run_id: run.run_id,
      total: result.trades.length,
      offset: 1,
      limit: 2,
    });
    expect(page.items.map((item) => item.number)).toEqual(
      result.trades.slice(1, 3).map((item) => item.number),
    );
    const foreign = await rejection(svc.trades(OTHER, run.run_id, 0, 10));
    expect(foreign.getStatus()).toBe(404);
  });

  it('runs both execution profiles with different, correctly labelled fills', async () => {
    const svc = service();
    const sameClose = await svc.create(
      OWNER,
      body({ assumptions: { execution: 'same_close' }, idempotency_key: 'run-sc-0001' }),
    );
    const nextOpen = await svc.create(
      OWNER,
      body({ assumptions: { execution: 'next_open' }, idempotency_key: 'run-no-0001' }),
    );
    expect(sameClose.snapshot?.execution).toBe('same_close');
    expect(nextOpen.snapshot?.execution).toBe('next_open');
    expect(nextOpen.snapshot?.simulation).toMatchObject({
      execution_label: 'Mở cửa phiên kế tiếp',
      signal_after_open_fill: true,
    });
    for (const trade of sameClose.result!.trades)
      expect(trade.entry_signal_date).toBe(trade.entry_date);
    for (const trade of nextOpen.result!.trades) {
      expect(trade.entry_date > trade.entry_signal_date).toBe(true);
      expect(trade.exit_date > trade.exit_signal_date).toBe(true);
    }
    expect(sameClose.result!.trades.length).not.toBe(0);
    expect(nextOpen.result!.trades).not.toEqual(sameClose.result!.trades);
  });

  it('reads a run stored before the Strategy contract (no extras) without inventing evidence', async () => {
    const svc = service();
    const run = await svc.create(OWNER, body());
    const stored = store.rows[0]!;
    const legacy = structuredClone(stored.result!) as Record<string, unknown>;
    delete legacy.strategy_extras;
    stored.result = legacy;
    const reread = await svc.get(OWNER, run.run_id);
    expect(reread.result?.trades.length).toBe(run.result?.trades.length);
    expect(reread.result?.trades.every((trade) => trade.entry_conditions === null)).toBe(true);
    expect(reread.result?.kpis).toEqual(run.result?.kpis);
  });

  it('isolates list and get by owner', async () => {
    const svc = service();
    const run = await svc.create(OWNER, body());

    await expect(svc.get(OWNER, run.run_id)).resolves.toEqual(run);
    const foreign = await rejection(svc.get(OTHER, run.run_id));
    expect(foreign.getStatus()).toBe(404);
    expect(foreign.getResponse()).toMatchObject({ code: 'BACKTEST_RUN_NOT_FOUND' });

    await expect(svc.list(OTHER, 20)).resolves.toEqual({ items: [] });
    const { items } = await svc.list(OWNER, 20);
    expect(items).toEqual([
      {
        run_id: run.run_id,
        kind: 'single',
        status: 'succeeded',
        shared_revision: 3,
        symbol: 'AAA',
        start: START,
        end: END,
        created_at: run.created_at,
        config_hash: configHash(savedConfig),
        kpis: run.result?.kpis,
        error_code: null,
      },
    ]);
  });
});

describe('StrategyBacktestsEnabledGuard', () => {
  it('hides the routes with 404 FEATURE_DISABLED when STRATEGY_V2_ENABLED is off', () => {
    const guard = new StrategyBacktestsEnabledGuard(configService({ STRATEGY_V2_ENABLED: false }));
    let error: unknown;
    try {
      guard.canActivate();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(
      new StrategyBacktestsEnabledGuard(configService({ STRATEGY_V2_ENABLED: true })).canActivate(),
    ).toBe(true);
  });
});

describe('backtestRunBodySchema', () => {
  it('applies CLEAN_TECH_2.0 defaults and validates the range', () => {
    expect(body()).toMatchObject({
      symbol: 'AAA',
      assumptions: { fee_preset: 'standard', execution: 'next_open' },
    });
    expect(backtestRunBodySchema.safeParse({ ...body(), start: END, end: START }).success).toBe(
      false,
    );
    expect(
      backtestRunBodySchema.safeParse({
        ...body(),
        research: { kind: 'out_of_sample', split_date: '2000-01-03' },
      }).success,
    ).toBe(false);
  });
});

describe('advanced capabilities and the legacy lesson grants', () => {
  const allowlist = Object.keys(CAPABILITY_LESSONS);

  it('stay unlocked for legacy holders through lesson:<legacy id>', () => {
    const legacy = new Set(['lesson:ch02-l14', 'lesson:ch16-l01', 'lesson:ch18-l01']);
    expect(
      findCapabilityLock(['sensitivity', 'universe', 'portfolio'], allowlist, legacy),
    ).toBeNull();
  });

  it('cannot be earned from the current catalog: its completions grant indicator:/metric: only', () => {
    const current = new Set(['indicator:rsi', 'indicator:obv', 'metric:roe']);
    const lock = findCapabilityLock(['sensitivity'], allowlist, current);
    expect(lock).toEqual({
      capability: 'sensitivity',
      reason: 'not_learned',
      lesson_id: 'ch02-l14',
    });
    // A legacy ATR grant (lesson:ch07-l01) never unlocks anything here.
    expect(
      findCapabilityLock(['walk_forward'], allowlist, new Set(['lesson:ch07-l01'])),
    ).toMatchObject({
      reason: 'not_learned',
    });
    const response = capabilityLockedException(lock!).getResponse() as {
      message: string;
      code: string;
    };
    expect(response.code).toBe('CAPABILITY_LOCKED');
    expect(response.message).toContain('Học viện cũ');
  });
});

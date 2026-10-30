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
  type ConditionRow,
  type IndicatorConfig,
  type RowSideConfig,
  type SharedConfig,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import { StrategyBacktestsEnabledGuard } from '../../src/modules/strategy-backtests/strategy-backtests-enabled.guard.js';
import {
  CAPABILITY_LESSONS,
  capabilityLockedException,
  findCapabilityLock,
} from '../../src/modules/strategy-backtests/strategy-backtests.capabilities.js';
import { StrategyBacktestExecutor } from '../../src/modules/strategy-backtests/strategy-backtests.executor.js';
import type { StrategyRunExtras } from '../../src/modules/strategy-backtests/strategy-backtests.presenter.js';
import type {
  BacktestRunRecord,
  BacktestRunRow,
  BacktestRunSummaryRow,
  StrategyBacktestStore,
} from '../../src/modules/strategy-backtests/strategy-backtests.repository.js';
import {
  backtestRunBodySchema,
  backtestRunResponseSchema,
  backtestTradesResponseSchema,
  ruleEvidenceSchema,
} from '../../src/modules/strategy-backtests/strategy-backtests.schemas.js';
import { StrategyBacktestsService } from '../../src/modules/strategy-backtests/strategy-backtests.service.js';
import type { SharedConfigReaderPort } from '../../src/modules/strategy-config/strategy-config.ports.js';
import { SharedConfigService } from '../../src/modules/strategy-config/strategy-config.service.js';
import type {
  RevisionRow,
  SharedConfigStore,
  SharedConfigStoreProvider,
} from '../../src/modules/strategy-config/strategy-config.repository.js';
import { deepFreeze, reference } from '../fixtures/bot-v2/reference.js';
import { preV3Config, preV3EvidenceRule } from './helpers/strategy-pre-v3.js';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const SAVED_AT = '2025-06-02T03:00:00.000Z';

const synthetic = deepFreeze(reference.syntheticBars(1000));
const START = synthetic[450]!.date;
const END = synthetic[999]!.date;

function indicator(config: SharedConfig, id: string): IndicatorConfig {
  const item = config.indicators[id];
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

/** The condition rows of one tab of a row-based indicator, in registry order. */
const rowsOf = (config: SharedConfig, id: string, side: Side): ConditionRow[] =>
  (indicator(config, id)[side] as RowSideConfig).rules;
/** `ma.price_cross` of a tab (row 1: price crosses SMA N; Mua `cross_up`, Bán `cross_down`). */
const priceCross = (config: SharedConfig, side: Side): ConditionRow =>
  rowsOf(config, 'ma', side)[0]!;

/** `ma.price_cross` row path of the research sweeps (SPEC V3: the row id plus a numeric field). */
const PERIOD_PATH = {
  indicator: 'ma',
  side: 'buy',
  rule: 'ma.price_cross',
  key: 'period',
} as const;

/**
 * MA master ON, row 1 of each tab: Mua price crosses up SMA 20, Bán price crosses down SMA 50
 * (the SMA period is a preset: 5, 10, 20, 50, 100, 200).
 */
function maConfig(): SharedConfig {
  const config = defaultConfig();
  indicator(config, 'ma').master_enabled = true;
  indicator(config, 'ma').buy.enabled = true;
  indicator(config, 'ma').sell.enabled = true;
  priceCross(config, 'buy').period = 20;
  priceCross(config, 'sell').period = 50;
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

    // Bars the engine saw: 450 warmup sessions before START, VNINDEX attached as `market`.
    const expectedBars: Bar[] = synthetic.slice(0).map((bar) => ({
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
      warmup_sessions_requested: 450,
      warmup_bars: 450,
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
    const expectedBars = toRecords(synthetic.slice(0)).map(({ time, ...rest }) => ({
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
          research: { kind: 'sensitivity', path: PERIOD_PATH, values: [10, 20] },
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
        body({ research: { kind: 'out_of_sample', split_date: synthetic[750]!.date } }),
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
    const values = [10, 20, 50, 100];
    const path = PERIOD_PATH;
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
    expect(priceCross(run.snapshot!.config, 'buy').period).toBe(20);
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
        research: { kind: 'sensitivity', path: PERIOD_PATH, values: [10, 20] },
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

  describe('a revision in the pre-V3 format (SPEC V3 §6.1.5: never mapped, never run)', () => {
    const OUTDATED_MESSAGE =
      'Phiên bản cấu hình này dùng định dạng điều kiện cũ. Hãy lưu lại cấu hình theo mẫu điều kiện mới.';

    const serviceWith = (customReader: SharedConfigReaderPort) =>
      new StrategyBacktestsService(
        store,
        customReader,
        { grantedCapabilities: () => Promise.resolve(grants) } satisfies AcademyGrantsPort,
        new StrategyBacktestExecutor(),
        configService({ STRATEGY_ADVANCED_CAPABILITIES: allowlist }),
        market,
      );

    const expectRefused = async (error: HttpException, revision: number) => {
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'CONFIG_FORMAT_OUTDATED',
        message: OUTDATED_MESSAGE,
        revision,
        details: [{ field: 'revision', revision }],
      });
      // Nothing ran and nothing was stored (not even a failed run): the client re-saves and retries.
      expect(market.calls).toEqual([]);
      expect(store.rows).toEqual([]);
      await expect(serviceWith(reader.reader).list(OWNER, 20)).resolves.toEqual({ items: [] });
    };

    it('maps the reader refusal to 422 CONFIG_FORMAT_OUTDATED', async () => {
      const refusing: SharedConfigReaderPort = {
        effectiveFor: () => Promise.resolve(null),
        getRevision: () =>
          Promise.reject(
            new UnprocessableEntityException({
              code: 'CONFIG_FORMAT_OUTDATED',
              message: OUTDATED_MESSAGE,
              revision: 3,
              details: [{ field: 'revision', revision: 3 }],
            }),
          ),
      };
      await expectRefused(await rejection(serviceWith(refusing).create(OWNER, body())), 3);
    });

    it('does not run on the reset document of an outdated revision the reader hands back', async () => {
      // A reader asked to allow outdated revisions returns the SPEC V3 reset (defaults + switches).
      const handingBack: SharedConfigReaderPort = {
        effectiveFor: () => Promise.resolve(null),
        getRevision: (_userId, revision) =>
          Promise.resolve({
            revision,
            config: savedConfig,
            config_hash: 'f'.repeat(64),
            saved_at: SAVED_AT,
            outdated: true,
            legacy: null,
          }),
      };
      await expectRefused(await rejection(serviceWith(handingBack).create(OWNER, body())), 3);
    });

    it('end to end with the real shared-config reader: a pre-V3 revision is refused, a current one runs', async () => {
      const row = (revision: number, config: unknown): RevisionRow => ({
        user_id: OWNER,
        revision,
        config: config as SharedConfig,
        config_hash: configHash(config as SharedConfig),
        before_hash: null,
        patch: {},
        requested_at: new Date(SAVED_AT),
        saved_at: new Date(SAVED_AT),
        actor_id: OWNER,
        idempotency_key: `save-${revision}`,
        effective_session: '2025-06-03',
        session_status: 'effective',
      });
      const rows = [row(2, preV3Config(2)), row(3, maConfig())];
      const sqlStore = {
        revision: (userId: string, revision: number) =>
          Promise.resolve(
            rows.find((item) => item.user_id === userId && item.revision === revision) ?? null,
          ),
      } as unknown as SharedConfigStore;
      const provider: SharedConfigStoreProvider = {
        store: () => sqlStore,
        transaction: (operation) => operation(sqlStore),
      };
      const real = new SharedConfigService(provider, {
        grantedCapabilities: () => Promise.resolve(grants),
      } satisfies AcademyGrantsPort);

      const refused = await rejection(
        serviceWith(real).create(OWNER, body({ shared_revision: 2 })),
      );
      await expectRefused(refused, 2);

      const view = await serviceWith(real).create(OWNER, body({ shared_revision: 3 }));
      expect(view).toMatchObject({ status: 'succeeded', shared_revision: 3 });
      expect(view.snapshot?.versions.rule_version).toBe(RULE_VERSION);
      expect(store.rows).toHaveLength(1);
    });
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
    // One evidence entry per evaluated row: the stable row id, the op and the row's own values.
    expect(trade.entry_conditions?.rules[0]).toMatchObject({
      id: 'ma.price_cross',
      indicator: 'ma',
      side: 'buy',
      op: 'cross_up',
      result: true,
      missing: false,
      values: { op: 'cross_up', period: 20 },
    });
    expect(trade.exit_conditions?.rules[0]).toMatchObject({
      id: 'ma.price_cross',
      indicator: 'ma',
      side: 'sell',
      op: 'cross_down',
      result: true,
      values: { op: 'cross_down', period: 50 },
    });
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

  it('evidence lists every evaluated row of every active indicator with its own values', async () => {
    // Mua: RSI, two rows with their own periods (`RSI 14 < 50`, `RSI 9 xu hướng lên`);
    // Bán: MA row 1 only (`Giá cắt xuống SMA 50`), so a trade exits on a different indicator.
    const config = maConfig();
    indicator(config, 'ma').buy.enabled = false;
    const rsi = indicator(config, 'rsi');
    rsi.master_enabled = true;
    rsi.buy.enabled = true;
    rsi.sell.enabled = false;
    const [level, trend] = rowsOf(config, 'rsi', 'buy') as [ConditionRow, ConditionRow];
    Object.assign(level, { period: 14, op: '<', threshold: 50 });
    Object.assign(trend, { period: 9, dir: 'up' });
    reader = fakeReader(
      new Map([[`${OWNER}:3`, { config: deepFreeze(config), saved_at: SAVED_AT }]]),
    );
    grants = new Set(['indicator:ma', 'indicator:rsi']);

    const run = await service().create(OWNER, body({ assumptions: { execution: 'same_close' } }));
    const trade = run.result!.trades[0];
    expect(trade).toBeDefined();

    const entry = trade!.entry_conditions!;
    expect(entry.indicator_ids).toEqual(['rsi']);
    expect(entry.rules.map((rule) => rule.id)).toEqual(['rsi.level', 'rsi.trend']);
    expect(entry.rules[0]).toMatchObject({
      indicator: 'rsi',
      side: 'buy',
      op: '<',
      rhs: 50,
      result: true,
      missing: false,
      values: { period: 14, op: '<', threshold: 50 },
    });
    expect(entry.rules[1]).toMatchObject({
      id: 'rsi.trend',
      op: '>',
      result: true,
      values: { period: 9, dir: 'up' },
    });

    const exit = trade!.exit_conditions!;
    expect(exit.indicator_ids).toEqual(['ma']);
    expect(exit.rules.map((rule) => rule.id)).toEqual(['ma.price_cross']);
    expect(exit.rules[0]).toMatchObject({
      side: 'sell',
      op: 'cross_down',
      result: true,
      values: { op: 'cross_down', period: 50 },
    });
  });

  it('a sweep over a non-preset SMA period reports that candidate as invalid, in Vietnamese', async () => {
    allowlist = ['sensitivity'];
    grants = new Set(['indicator:ma', 'lesson:ch02-l14']);
    const run = await service().create(
      OWNER,
      body({ research: { kind: 'sensitivity', path: PERIOD_PATH, values: [10, 30, 50] } }),
    );
    const research = run.research_result;
    if (research?.type !== 'sensitivity') throw new Error('expected a sensitivity result');
    expect(research.path).toEqual(PERIOD_PATH);
    expect(research.candidates.map((candidate) => candidate.ok)).toEqual([true, false, true]);
    expect(research.candidates[1]).toMatchObject({
      value: 30,
      kpis: null,
      error: 'Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.',
      errors: [
        {
          path: 'indicators.ma.buy.rules.0.period',
          side: 'buy',
          row: 1,
          message: 'Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.',
        },
      ],
    });
    expect(run.status).toBe('succeeded');
  });

  it('walk-forward sweeps the same row field and stores the row path in the snapshot', async () => {
    allowlist = ['walk_forward'];
    grants = new Set(['indicator:ma', 'lesson:ch02-l16']);
    const research = {
      kind: 'walk_forward' as const,
      path: PERIOD_PATH,
      values: [10, 20, 50],
      train_bars: 250,
      test_bars: 100,
      step_bars: 100,
      criterion: 'net_return' as const,
      min_trades: 0,
    };
    const run = await service().create(OWNER, body({ research }));
    expect(run.kind).toBe('walk_forward');
    expect(run.snapshot?.research).toEqual(research);
    const result = run.research_result;
    if (result?.type !== 'walk_forward_windows') throw new Error('expected walk-forward windows');
    expect(result.path).toEqual(PERIOD_PATH);
    expect(result.windows.length).toBeGreaterThan(0);
    for (const window of result.windows)
      expect(window.train_candidates.map((candidate) => candidate.value)).toEqual([10, 20, 50]);
  });

  it('refuses a research path the config cannot resolve with 422, not a crash', async () => {
    allowlist = ['sensitivity'];
    grants = new Set(['indicator:ma', 'lesson:ch02-l14']);
    for (const path of [
      { indicator: 'ma', side: 'buy', key: 'period' }, // row-based indicator without a row id
      { indicator: 'ma', side: 'buy', rule: 'ma.price_cross', key: 'op' }, // not a numeric field
      { indicator: 'ma', side: 'buy', rule: 'rsi.level', key: 'period' }, // row of another indicator
    ]) {
      const error = await rejection(
        service().create(
          OWNER,
          body({
            idempotency_key: randomUUID(),
            research: { kind: 'sensitivity', path, values: [10] },
          }),
        ),
      );
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'PATH_INVALID',
        message: expect.stringContaining('Đường tham số không hợp lệ') as unknown,
      });
    }
    // Deterministic 422s are stored as failed runs (replaying a key returns the same failure).
    expect(store.rows.map((row) => [row.status, row.error?.code])).toEqual([
      ['failed', 'PATH_INVALID'],
      ['failed', 'PATH_INVALID'],
      ['failed', 'PATH_INVALID'],
    ]);
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

  it('shows a run stored before SPEC V3 as it was written: old config, old evidence, same schemas', async () => {
    const svc = service();
    const current = await svc.create(OWNER, body({ assumptions: { execution: 'same_close' } }));
    const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;
    // A run of the current format satisfies the response schemas (row evidence with `values`).
    expect(backtestRunResponseSchema.safeParse(asJson(current)).success).toBe(true);

    // Rewrite the stored record to what `iqx-rules-3.0` kept: side-level params in the pinned
    // config, and registry rule ids (`r1`) with `>` / `<` in the evidence, without `values`.
    const legacy = preV3Config(3);
    const legacyHash = configHash(legacy as unknown as SharedConfig);
    const pin = (snapshot: Record<string, unknown>) => ({
      ...snapshot,
      config: legacy,
      config_hash: legacyHash,
      versions: {
        ...(snapshot.versions as Record<string, unknown>),
        schema_version: '2.0',
        rule_version: 'iqx-rules-3.0',
      },
    });
    const stored = store.rows[0]!;
    const result = structuredClone(stored.result!) as {
      snapshot: Record<string, unknown>;
      strategy_extras: StrategyRunExtras;
    };
    result.snapshot = pin(result.snapshot);
    result.strategy_extras.trade_evidence = result.strategy_extras.trade_evidence.map((item) => ({
      number: item.number,
      entry: { indicator_ids: ['ma'], rules: [preV3EvidenceRule('buy')] },
      exit: { indicator_ids: ['ma'], rules: [preV3EvidenceRule('sell')] },
    }));
    stored.snapshot = pin(stored.snapshot!);
    stored.result = result;
    stored.config_hash = legacyHash;
    stored.rule_version = 'iqx-rules-3.0';

    const reread = await svc.get(OWNER, current.run_id);
    expect(reread.status).toBe('succeeded');
    expect(reread.snapshot?.config).toEqual(legacy);
    expect(reread.snapshot?.versions.rule_version).toBe('iqx-rules-3.0');
    expect(reread.result?.kpis).toEqual(current.result?.kpis);
    expect(reread.result?.trades.length).toBe(current.result?.trades.length);
    for (const trade of reread.result!.trades) {
      expect(trade.entry_conditions).toEqual({
        indicator_ids: ['ma'],
        rules: [preV3EvidenceRule('buy')],
      });
      expect(trade.exit_conditions).toEqual({
        indicator_ids: ['ma'],
        rules: [preV3EvidenceRule('sell')],
      });
      expect(trade.entry_conditions!.rules[0]).not.toHaveProperty('values');
    }
    expect(backtestRunResponseSchema.safeParse(asJson(reread)).success).toBe(true);

    const page = await svc.trades(OWNER, current.run_id, 0, 5);
    expect(page.total).toBe(current.result!.trades.length);
    expect(backtestTradesResponseSchema.safeParse(asJson(page)).success).toBe(true);

    const { items } = await svc.list(OWNER, 5);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ run_id: current.run_id, config_hash: legacyHash });

    // Replaying its idempotency key returns the stored run: it is never re-evaluated or migrated.
    const replay = await svc.create(OWNER, body({ assumptions: { execution: 'same_close' } }));
    expect(replay.run_id).toBe(current.run_id);
    expect(replay.snapshot?.config).toEqual(legacy);
    expect(store.rows).toHaveLength(1);
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

  describe('ParamPath (the swept field of a condition row)', () => {
    const sweep = (
      path: Record<string, unknown>,
      kind: 'sensitivity' | 'walk_forward' = 'sensitivity',
    ) =>
      backtestRunBodySchema.safeParse({
        idempotency_key: 'run-key-0001',
        shared_revision: 3,
        symbol: 'AAA',
        start: START,
        end: END,
        research:
          kind === 'sensitivity'
            ? { kind, path, values: [10, 20] }
            : {
                kind,
                path,
                values: [10, 20],
                train_bars: 250,
                test_bars: 100,
                step_bars: 100,
                criterion: 'net_return',
                min_trades: 0,
              },
      });

    it('takes the row id next to the indicator, the side and the numeric field', () => {
      for (const kind of ['sensitivity', 'walk_forward'] as const) {
        const parsed = sweep(
          { indicator: 'rsi', side: 'buy', rule: 'rsi.level', key: 'threshold' },
          kind,
        );
        expect(parsed.success).toBe(true);
        expect(parsed.data?.research).toMatchObject({
          path: { indicator: 'rsi', side: 'buy', rule: 'rsi.level', key: 'threshold' },
        });
      }
    });

    it('keeps Volume (side-level params) addressable without a row id', () => {
      const parsed = sweep({ indicator: 'volume', side: 'sell', key: 'period' });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.research).toMatchObject({
        path: { indicator: 'volume', side: 'sell', key: 'period' },
      });
    });

    it('rejects a malformed row id and any other path key', () => {
      for (const rule of ['level', 'RSI.level', 'rsi.level.extra', 'rsi.', '.level', '']) {
        expect(
          sweep({ indicator: 'rsi', side: 'buy', rule, key: 'threshold' }).success,
          JSON.stringify(rule),
        ).toBe(false);
      }
      expect(
        sweep({ indicator: 'rsi', side: 'buy', rule: 'rsi.level', key: 'threshold', row: 1 })
          .success,
      ).toBe(false);
      expect(sweep({ indicator: 'rsi', side: 'both', key: 'threshold' }).success).toBe(false);
    });
  });
});

describe('ruleEvidenceSchema', () => {
  const row = {
    id: 'bollinger.band_action',
    indicator: 'bollinger',
    side: 'buy',
    op: 'reenter_lower',
    lhs: 10.5,
    rhs: 10.8,
    result: true,
    missing: false,
    values: { period: 20, std: 2, action: 'reenter_lower' },
  };

  it('accepts every row operator of iqx-rules-4.0 with the row values', () => {
    for (const op of [
      '>',
      '<',
      'cross_up',
      'cross_down',
      'reenter_lower',
      'reenter_upper',
      'break_upper',
      'break_lower',
      'cross_up_middle',
      'cross_down_middle',
      'break_high',
      'break_low',
    ])
      expect(ruleEvidenceSchema.safeParse({ ...row, op }).success, op).toBe(true);
    expect(ruleEvidenceSchema.parse(row).values).toEqual(row.values);
  });

  it('still accepts evidence stored before SPEC V3 (r1…, membership ops, no values)', () => {
    expect(ruleEvidenceSchema.safeParse(preV3EvidenceRule('buy')).success).toBe(true);
    expect(ruleEvidenceSchema.safeParse(preV3EvidenceRule('sell')).success).toBe(true);
    for (const op of ['∈', '∉'])
      expect(
        ruleEvidenceSchema.safeParse({
          ...preV3EvidenceRule('buy'),
          op,
          rhs: null,
          rhs_lower: 1,
          rhs_upper: 2,
        }).success,
        op,
      ).toBe(true);
  });

  it('rejects an operator the engine does not report', () => {
    expect(ruleEvidenceSchema.safeParse({ ...row, op: 'between' }).success).toBe(false);
    expect(ruleEvidenceSchema.safeParse({ ...row, values: { period: [20] } }).success).toBe(false);
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

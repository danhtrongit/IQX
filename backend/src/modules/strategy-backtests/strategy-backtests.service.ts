import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import {
  QUANT_MARKET_DATA,
  type HistoricalBars,
  type QuantMarketDataProvider,
} from '../quant/quant.types.js';
import {
  AdvancedEngineError,
  dataHash,
  systemCapabilities,
  validateSystemOptions,
  type SystemOptions,
  type SystemProfile,
  type SystemSymbolData,
} from '../quant/v2/advanced/index.js';
import {
  CALCULATION_VERSION,
  CLEAN_TECH_2_0,
  DEFAULT_RUN_OPTIONS,
  ENGINE_VERSION,
  EngineRunError,
  FORMULA_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  canonicalJson,
  indicatorCapability,
  loadTechnicalRegistry,
  sha256Hex,
  type Bar,
  type EngineValidationError,
  type RunOptions,
  type RunResult,
  type SharedConfig,
} from '../quant/v2/index.js';
import { buildRunExtras, fillGapTrades } from './strategy-backtests.evidence.js';
import {
  ANNUALIZATION_SESSIONS,
  STRATEGY_BACKTEST_CONTRACT,
  presentRunResult,
  toStrategyKpis,
  type PresentedResult,
  type StrategyRunExtras,
} from './strategy-backtests.presenter.js';
import {
  SHARED_CONFIG_READER,
  type SharedConfigReaderPort,
} from '../strategy-config/strategy-config.ports.js';
import {
  capabilityLockedException,
  findCapabilityLock,
} from './strategy-backtests.capabilities.js';
import { BacktestExecutorError, StrategyBacktestExecutor } from './strategy-backtests.executor.js';
import type {
  BacktestJob,
  BacktestJobOutput,
  ResearchResult,
  SystemJob,
  SystemRunSummary,
} from './strategy-backtests.jobs.js';
import {
  StrategyBacktestRepository,
  type BacktestRunKind,
  type BacktestRunRow,
  type StoredRunError,
  type StrategyBacktestStore,
} from './strategy-backtests.repository.js';
import type { BacktestRunBody } from './strategy-backtests.schemas.js';

/** Sessions fetched before `start` so indicators are warm on the first traded bar. */
const WARMUP_SESSIONS = 300;
const MAX_BARS = 3_500;
const FETCH_CONCURRENCY = 4;
/** Upper bound of engine runs one research request may cost (baseline included). */
const RESEARCH_MAX_RUNS = 1_000;
const BENCHMARK_SYMBOL = 'VNINDEX';
const FEE_PRESETS = {
  standard: { buy: 0.0015, sell: 0.0025 },
  none: { buy: 0, sell: 0 },
} as const;
/** Indicators fed by the VNINDEX close attached as `bar.market`. */
const MARKET_CONTEXT_INDICATORS = new Set(['rs_market', 'index_ma']);

type RunRequest = Omit<BacktestRunBody, 'idempotency_key'>;
type SavedRevision = NonNullable<Awaited<ReturnType<SharedConfigReaderPort['getRevision']>>>;

export type DataWarning = {
  code: string;
  message: string;
  symbols?: string[];
  indicators?: string[];
};

export type RunSnapshot = RunResult['snapshot'] & {
  shared_revision: number;
  revision_saved_at: string;
  config_hash: string;
  symbol: string;
  requested_start: string;
  requested_end: string;
  data_source: string;
  data_source_priority: number | null;
  adjusted: boolean;
  skipped_rows: number;
  data_hash: string;
  benchmark: { symbol: typeof BENCHMARK_SYMBOL; available: boolean; source: string | null };
  warmup_sessions_requested: number;
  warmup_bars: number;
  fee_preset: 'standard' | 'none';
  fees: { buy: number; sell: number };
  lot_size: number;
  execution: RunOptions['execution'];
  capital: number;
  execution_profile: 'CLEAN_TECH_2.0';
  profile: typeof CLEAN_TECH_2_0;
  slippage: 'not_modelled';
  open_position_policy: 'mark_to_market_last_close';
  /** Strategy-spec execution profile; absent on runs stored before the Strategy contract. */
  simulation?: RunSimulation;
  versions: {
    schema_version: string;
    calculation_version: string;
    rule_version: string;
    engine_version: string;
    formula_version: string;
  };
  data_warnings: DataWarning[];
  research: Record<string, unknown> | null;
  system: {
    options: SystemOptions;
    symbols: string[];
    excluded_symbols: string[];
    universe: Record<string, unknown> | null;
    universe_policy: 'explicit_symbols';
    sectors: Record<string, string | null> | null;
    data_hash: string;
    profile: SystemProfile;
  } | null;
};

export type RunSimulation = {
  contract: typeof STRATEGY_BACKTEST_CONTRACT;
  execution: RunOptions['execution'];
  execution_label: string;
  fill_price: string;
  caveat: string;
  signal_after_open_fill: boolean;
  position_policy: 'single_symbol_long_only_one_position';
  sizing: 'all_available_cash_including_buy_fee_rounded_down_to_lot';
  exits: 'none: no stop, take-profit, trailing or max holding';
  min_held_bars: number;
  /**
   * The two-bar sell lock comes from the reference engine. The product owner has not decided
   * whether the new profile keeps it (Strategy spec §6.1), so it is carried over and flagged.
   */
  min_held_bars_status: 'carried_over_from_reference_engine_pending_product_decision';
  fee_model: 'buy_fee_on_value; sell_fee_and_tax_as_one_combined_rate';
  settlement: 'not_modelled';
  liquidity: 'not_modelled';
  slippage: 'not_modelled';
  price_adjustment: 'provider_adjusted' | 'not_confirmed';
  annualization_sessions: typeof ANNUALIZATION_SESSIONS;
  buy_hold_basis: 'close_ratio_before_fees_and_dividends';
};

const EXECUTION_PROFILES = {
  same_close: {
    label: 'Đóng cửa cùng phiên',
    fill_price: 'Giá đóng cửa của chính phiên có tín hiệu',
    caveat:
      'Quy ước mô phỏng: tín hiệu dùng close và volume đầy đủ của phiên T rồi khớp ở chính close T. Không chứng minh có thể biết đủ dữ liệu đó, đặt lệnh và được khớp đúng giá đóng cửa trong thực tế.',
  },
  next_open: {
    label: 'Mở cửa phiên kế tiếp',
    fill_price: 'Giá mở cửa của phiên kế tiếp có dữ liệu sau phiên có tín hiệu',
    caveat:
      'Tín hiệu sau đóng cửa phiên T tạo lệnh chờ khớp ở giá mở cửa của phiên kế tiếp có dữ liệu; tín hiệu ở phiên cuối khoảng chưa có phiên khớp nên không thành giao dịch.',
  },
} as const;

export type BacktestRunView = {
  run_id: string;
  status: 'succeeded' | 'failed';
  kind: BacktestRunKind;
  shared_revision: number;
  created_at: string;
  request: Record<string, unknown>;
  snapshot: RunSnapshot | null;
  result: PresentedResult | null;
  research_result: ResearchResult | null;
  system_result: SystemRunSummary | null;
  data_warnings: DataWarning[];
  error: StoredRunError | null;
};

type FetchedSeries = {
  symbol: string;
  history: HistoricalBars;
  bars: Bar[];
  /** Index of the first bar on/after `start` within `bars`. */
  startIndex: number;
};

type PreparedRun = {
  job: BacktestJob;
  main: FetchedSeries;
  mainHash: string;
  benchmark: { available: boolean; source: string | null };
  /** Benchmark session dates: the calendar proxy used to flag fills that skipped a session. */
  benchmarkDates: ReadonlySet<string> | null;
  warnings: DataWarning[];
  system: {
    symbols: string[];
    excluded: string[];
    sectors: Record<string, string | null> | null;
    dataHash: string;
  } | null;
};

const unprocessable = (code: string, message: string, errors: EngineValidationError[] = []) =>
  new UnprocessableEntityException({
    code,
    message,
    ...(errors.length ? { details: errors } : {}),
  });

const historyNotFound = (message: string) =>
  new NotFoundException({ code: 'MARKET_HISTORY_NOT_FOUND', message });

const marketDataUnavailable = () =>
  new ServiceUnavailableException({
    code: 'MARKET_DATA_UNAVAILABLE',
    message: 'Dịch vụ dữ liệu thị trường chưa sẵn sàng',
  });

const idempotencyKeyReused = () =>
  new ConflictException({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Khóa idempotency đã được dùng cho một yêu cầu khác.',
  });

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await operation(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * v2 backtest runs over a saved shared-config revision (CONTRACTS §4). Every
 * run is immutable: the saved config, bars hash, assumptions and versions are
 * frozen into the snapshot; research candidates are computed in-job and never
 * written to shared config.
 */
@Injectable()
export class StrategyBacktestsService {
  constructor(
    @Inject(StrategyBacktestRepository) private readonly store: StrategyBacktestStore,
    @Inject(SHARED_CONFIG_READER) private readonly reader: SharedConfigReaderPort,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    private readonly executor: StrategyBacktestExecutor,
    private readonly config: ConfigService<Environment, true>,
    @Optional()
    @Inject(QUANT_MARKET_DATA)
    private readonly market?: QuantMarketDataProvider,
  ) {}

  async create(userId: string, body: BacktestRunBody): Promise<BacktestRunView> {
    const { idempotency_key: idempotencyKey, ...request } = body;
    const requestHash = sha256Hex(canonicalJson(request));
    const existing = await this.store.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return this.replay(existing, requestHash);

    if (request.research && request.system)
      throw unprocessable(
        'RESEARCH_SYSTEM_CONFLICT',
        'Không thể chạy nghiên cứu tham số và hệ thống danh mục trong cùng một lần backtest.',
      );
    const systemErrors = validateSystemOptions(request.system);
    if (systemErrors.length)
      throw unprocessable(
        'SYSTEM_INVALID',
        systemErrors.map((error) => error.message).join('\n'),
        systemErrors,
      );
    // Gate "Universe lịch sử": there is no point-in-time membership source yet, and
    // today's members must never stand in for a past universe (survivorship bias).
    if (request.system?.universe)
      throw unprocessable(
        'UNIVERSE_HISTORY_UNAVAILABLE',
        'Chưa có dữ liệu thành phần rổ cổ phiếu theo thời điểm lịch sử; hãy nhập danh sách mã cụ thể.',
      );

    const revision = await this.reader.getRevision(userId, request.shared_revision);
    if (!revision)
      throw new NotFoundException({
        code: 'REVISION_NOT_FOUND',
        message: 'Không tìm thấy phiên bản cấu hình đã lưu.',
      });

    const grants = this.grantsLoader(userId);
    await this.assertCapabilities(this.requestedCapabilities(request, null), grants);
    // Grants are re-checked now, not when the revision was saved: a revoked or never-held
    // `indicator:<id>` stops the run (the saved revision itself is left untouched).
    await this.assertIndicatorGrants(revision.config, grants);

    const kind: BacktestRunKind = request.research
      ? request.research.kind
      : request.system
        ? 'portfolio'
        : 'single';
    const row = {
      user_id: userId,
      kind,
      shared_revision: revision.revision,
      request,
      request_hash: requestHash,
      config_hash: revision.config_hash,
      engine_version: ENGINE_VERSION,
      calculation_version: CALCULATION_VERSION,
      rule_version: RULE_VERSION,
      idempotency_key: idempotencyKey,
    };
    let prepared: PreparedRun;
    let output: BacktestJobOutput;
    try {
      prepared = await this.prepare(request, revision.config, grants);
      output = await this.execute(prepared.job);
    } catch (error) {
      const failure = persistableFailure(error);
      // Best effort: a storage outage must not mask the run's own error.
      if (failure)
        await this.store
          .insert({
            ...row,
            snapshot: null,
            result: null,
            research_result: null,
            system_result: null,
            data_hash: null,
            status: 'failed',
            error: failure,
          })
          .catch(() => null);
      throw error;
    }
    const extras = buildRunExtras(revision.config, prepared.job.bars, output.result);
    this.fillGapWarnings(prepared, output.result);
    const snapshot = this.snapshot(
      request,
      revision,
      prepared,
      output.result,
      output.system_profile,
    );
    const stored = await this.store.insert({
      ...row,
      snapshot,
      result: { ...output.result, snapshot, strategy_extras: extras },
      research_result: output.research_result,
      system_result: output.system_result,
      data_hash: prepared.system?.dataHash ?? prepared.mainHash,
      status: 'succeeded',
      error: null,
    });
    if (stored) return toView(stored);
    // A concurrent request with the same key stored first; answer with its run.
    const winner = await this.store.findByIdempotencyKey(userId, idempotencyKey);
    if (!winner) throw idempotencyKeyReused();
    return this.replay(winner, requestHash);
  }

  async get(userId: string, id: string): Promise<BacktestRunView> {
    const row = await this.store.findById(userId, id);
    if (!row)
      throw new NotFoundException({
        code: 'BACKTEST_RUN_NOT_FOUND',
        message: 'Không tìm thấy lần chạy backtest.',
      });
    return toView(row);
  }

  async list(userId: string, limit: number) {
    const rows = await this.store.list(userId, limit);
    return {
      items: rows.map((row) => ({
        run_id: row.id,
        kind: row.kind,
        status: row.status,
        shared_revision: row.shared_revision,
        symbol: row.symbol,
        start: row.start,
        end: row.end,
        created_at: row.created_at.toISOString(),
        config_hash: row.config_hash,
        kpis: toStrategyKpis(row.kpis),
        error_code: row.error_code,
      })),
    };
  }

  /** One page of the complete trade history; `total` always counts the whole run. */
  async trades(userId: string, id: string, offset: number, limit: number) {
    const view = await this.get(userId, id);
    if (!view.result)
      throw new NotFoundException({
        code: 'BACKTEST_RESULT_NOT_FOUND',
        message: 'Lần chạy này không có kết quả giao dịch.',
      });
    const { trades, counts, open_position: openPosition, pending_orders: pending } = view.result;
    return {
      run_id: view.run_id,
      total: trades.length,
      offset,
      limit,
      counts,
      items: trades.slice(offset, offset + limit),
      open_position: openPosition,
      pending_orders: pending,
    };
  }

  // ---------------------------------------------------------------------------

  /** Every indicator the run would evaluate (master ON with a side ON) needs `indicator:<id>` now. */
  private async assertIndicatorGrants(
    config: SharedConfig,
    grants: () => Promise<ReadonlySet<string>>,
  ): Promise<void> {
    const used = Object.entries(config.indicators)
      .filter(([, item]) => item.master_enabled === true && (item.buy.enabled || item.sell.enabled))
      .map(([id]) => id)
      .sort();
    if (!used.length) return;
    const granted = await grants();
    const locked = used.filter((id) => !granted.has(indicatorCapability(id)));
    if (!locked.length) return;
    throw new ForbiddenException({
      code: 'CAPABILITY_LOCKED',
      message: `Cần hoàn thành bài học của chỉ báo ${locked.join(', ')} (8/8) trước khi chạy backtest.`,
      capability: indicatorCapability(locked[0]!),
      capabilities: locked.map(indicatorCapability),
      reason: 'not_learned',
      details: locked.map((id) => ({
        capability: indicatorCapability(id),
        reason: 'not_learned',
      })),
    });
  }

  /** Next-open fills that skipped a benchmark session without a usable bar of the symbol. */
  private fillGapWarnings(prepared: PreparedRun, result: RunResult): void {
    const gaps = fillGapTrades(result, prepared.benchmarkDates);
    if (!gaps.length) return;
    const entries = gaps.map(
      (gap) =>
        `#${gap.number} ${gap.leg === 'entry' ? 'mua' : 'bán'} (tín hiệu ${gap.signal_date}, khớp ${gap.fill_date})`,
    );
    prepared.warnings.push({
      code: 'FILL_AFTER_MISSING_SESSION',
      message: `Mã thiếu dữ liệu ở phiên ngay sau tín hiệu nên lệnh được khớp ở phiên kế tiếp có dữ liệu, không dùng giá khác thay thế: ${entries.join('; ')}.`,
      symbols: [prepared.main.symbol],
    });
  }

  private replay(row: BacktestRunRow, requestHash: string): BacktestRunView {
    if (row.request_hash !== requestHash) throw idempotencyKeyReused();
    if (row.status === 'failed' && row.error) {
      const { status, code, message, details } = row.error;
      throw new HttpException({ code, message, ...(details ? { details } : {}) }, status);
    }
    return toView(row);
  }

  private grantsLoader(userId: string): () => Promise<ReadonlySet<string>> {
    let cached: Promise<ReadonlySet<string>> | null = null;
    return () => (cached ??= this.grants.grantedCapabilities(userId));
  }

  private requestedCapabilities(request: RunRequest, symbolCount: number | null): string[] {
    if (request.research) return [request.research.kind];
    if (!request.system) return [];
    return systemCapabilities(
      request.system as SystemOptions,
      symbolCount ?? request.system.symbols?.length ?? 1,
      request.system.universe !== undefined,
    );
  }

  private async assertCapabilities(
    required: readonly string[],
    grants: () => Promise<ReadonlySet<string>>,
  ): Promise<void> {
    if (!required.length) return;
    const allowlist = this.config.get('STRATEGY_ADVANCED_CAPABILITIES', { infer: true });
    const lock = findCapabilityLock(required, allowlist, await grants());
    if (lock) throw capabilityLockedException(lock);
  }

  private async prepare(
    request: RunRequest,
    config: SharedConfig,
    grants: () => Promise<ReadonlySet<string>>,
  ): Promise<PreparedRun> {
    const registry = loadTechnicalRegistry();
    const enabled = registry.filter(
      (entry) => config.indicators[entry.id]?.master_enabled === true,
    );
    if (!enabled.some((entry) => config.indicators[entry.id]?.buy.enabled === true))
      throw unprocessable('BUY_RULES_REQUIRED', 'Cần ít nhất một điều kiện Mua.');

    const warnings: DataWarning[] = [];
    const traded = request.system ? this.resolveSymbols(request) : null;
    if (traded)
      await this.assertCapabilities(this.requestedCapabilities(request, traded.length), grants);
    if (!this.market) throw marketDataUnavailable();

    const benchmark = await this.fetchBenchmark(request);
    const symbols = sortedUnique([request.symbol, ...(traded ?? [])]);
    const fetched = await mapLimit(symbols, FETCH_CONCURRENCY, (symbol) =>
      this.fetchSeries(symbol, request, benchmark.closes),
    );
    const bySymbol = new Map(
      fetched.flatMap((series) => (series ? [[series.symbol, series]] : [])),
    );
    const main = bySymbol.get(request.symbol);
    if (!main) throw historyNotFound(`Không có dữ liệu giá cho mã ${request.symbol}`);

    this.dataWarnings(
      warnings,
      request,
      enabled.map((entry) => entry.id),
      registry,
      [...bySymbol.values()],
      benchmark,
    );

    const capital = request.assumptions.capital ?? DEFAULT_RUN_OPTIONS.capital;
    const fees = FEE_PRESETS[request.assumptions.fee_preset];
    const options: RunOptions = {
      capital,
      fee_buy: fees.buy,
      fee_sell: fees.sell,
      lot: CLEAN_TECH_2_0.lot_size,
      execution: request.assumptions.execution,
      min_held_bars: CLEAN_TECH_2_0.min_held_bars,
      start: request.start,
      end: request.end,
    };

    if (request.research?.kind === 'walk_forward') {
      const { train_bars: train, test_bars: test, step_bars: step, values } = request.research;
      const inRange = main.bars.filter(
        (bar) => bar.date >= request.start && bar.date <= request.end,
      ).length;
      const windows = inRange >= train + test ? Math.floor((inRange - train - test) / step) + 1 : 0;
      const runs = windows * (values.length + 1) + 1;
      if (runs > RESEARCH_MAX_RUNS)
        throw unprocessable(
          'RESEARCH_TOO_LARGE',
          `Nghiên cứu cần ${runs} lượt chạy (tối đa ${RESEARCH_MAX_RUNS}); hãy giảm số giá trị hoặc số cửa sổ.`,
        );
    }

    let system: PreparedRun['system'] = null;
    let systemJob: SystemJob | null = null;
    if (request.system && traded) {
      const included = traded.filter((symbol) => bySymbol.has(symbol));
      const excluded = traded.filter((symbol) => !bySymbol.has(symbol));
      if (!included.length) throw historyNotFound('Không có dữ liệu giá cho các mã trong danh mục');
      if (excluded.length)
        warnings.push({
          code: 'SYMBOLS_EXCLUDED',
          message: 'Không có dữ liệu giá cho các mã này; đã loại khỏi danh mục.',
          symbols: excluded,
        });
      const sectors =
        request.system.max_sector_weight_pct !== undefined
          ? await this.sectors(included, warnings)
          : null;
      const symbolData: SystemSymbolData[] = included.map((symbol) => ({
        symbol,
        bars: bySymbol.get(symbol)!.bars,
        ...(sectors ? { sector: sectors[symbol] ?? null } : {}),
      }));
      const { symbols: _symbols, universe: _universe, ...systemOptions } = request.system;
      systemJob = {
        symbols: symbolData,
        options: systemOptions as SystemOptions,
        universe: null,
      };
      system = {
        symbols: included,
        excluded,
        sectors,
        dataHash: sha256Hex(
          canonicalJson(Object.fromEntries(symbolData.map((item) => [item.symbol, item.bars]))),
        ),
      };
    }

    return {
      job: {
        config,
        bars: main.bars,
        options,
        // Strategy spec §6.3: close-of-session signals are evaluated on the real post-fill state.
        engine: { signal_after_open_fill: true },
        research: request.research ?? null,
        system: systemJob,
      },
      main,
      mainHash: dataHash(main.bars),
      benchmark: { available: benchmark.available, source: benchmark.source },
      benchmarkDates: benchmark.closes ? new Set(benchmark.closes.keys()) : null,
      warnings,
      system,
    };
  }

  /** Traded symbols of a system run: the explicit symbols (universe runs are refused in `create`). */
  private resolveSymbols(request: RunRequest): string[] {
    const symbols = request.system!.symbols;
    return symbols ? sortedUnique(symbols) : [request.symbol];
  }

  private async sectors(
    symbols: readonly string[],
    warnings: DataWarning[],
  ): Promise<Record<string, string | null>> {
    const found = await this.store.sectors(symbols);
    const sectors = Object.fromEntries(
      symbols.map((symbol) => [symbol, found.get(symbol) ?? null]),
    );
    warnings.push({
      code: 'SECTOR_NOT_POINT_IN_TIME',
      message: 'Ngành lấy theo phân loại hiện tại, không theo thời điểm lịch sử.',
    });
    const missing = symbols.filter((symbol) => sectors[symbol] === null);
    if (missing.length)
      warnings.push({
        code: 'SECTOR_MISSING',
        message: 'Chưa có ngành cho các mã này; xếp vào nhóm chưa phân loại.',
        symbols: missing,
      });
    return sectors;
  }

  /** VNINDEX closes for `bar.market`; optional — an outage only blanks market context. */
  private async fetchBenchmark(request: RunRequest) {
    try {
      const history = await this.market!.getHistoricalOhlcv(
        BENCHMARK_SYMBOL,
        request.start,
        request.end,
        {
          warmupSessions: WARMUP_SESSIONS,
          maxBars: MAX_BARS,
        },
      );
      const closes = new Map(history.records.map((record) => [record.time, record.close]));
      return {
        available: closes.size > 0,
        source: history.source ?? null,
        closes: closes.size ? closes : null,
      };
    } catch {
      return { available: false, source: null, closes: null };
    }
  }

  /** null when the provider has no rows for the symbol; other provider failures are 503. */
  private async fetchSeries(
    symbol: string,
    request: RunRequest,
    market: ReadonlyMap<string, number> | null,
  ): Promise<FetchedSeries | null> {
    let history: HistoricalBars;
    try {
      history = await this.market!.getHistoricalOhlcv(symbol, request.start, request.end, {
        warmupSessions: WARMUP_SESSIONS,
        maxBars: MAX_BARS,
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) return null;
      throw marketDataUnavailable();
    }
    if (!history.records.length) return null;
    const from = Math.max(0, history.startIndex - WARMUP_SESSIONS);
    const bars = history.records.slice(from).map((record): Bar => ({
      date: record.time,
      open: record.open,
      high: record.high,
      low: record.low,
      close: record.close,
      volume: record.volume,
      ...(market ? { market: market.get(record.time) ?? null } : {}),
    }));
    return { symbol, history, bars, startIndex: history.startIndex - from };
  }

  /** Report every input gap instead of filling it; affected series stay null in the engine. */
  private dataWarnings(
    warnings: DataWarning[],
    request: RunRequest,
    enabledIds: readonly string[],
    registry: ReturnType<typeof loadTechnicalRegistry>,
    used: readonly FetchedSeries[],
    benchmark: { available: boolean; closes: ReadonlyMap<string, number> | null },
  ): void {
    const contextIds = new Set(
      registry
        .filter((entry) => entry.availability === 'needs_history_context')
        .map((entry) => entry.id),
    );
    const marketIds = enabledIds.filter((id) => MARKET_CONTEXT_INDICATORS.has(id));
    if (request.system?.ranking?.key === 'rs_market') marketIds.push('ranking:rs_market');
    if (!benchmark.available) {
      warnings.push({
        code: 'MARKET_CONTEXT_UNAVAILABLE',
        message:
          'Không có dữ liệu VNINDEX; lợi nhuận thị trường và các chỉ báo cần VNINDEX được để trống.',
        ...(marketIds.length ? { indicators: marketIds } : {}),
      });
    } else {
      const missing = used.filter((series) =>
        series.bars.some(
          (bar) => bar.date >= request.start && (bar.market === null || bar.market === undefined),
        ),
      );
      if (missing.length)
        warnings.push({
          code: 'MARKET_CONTEXT_PARTIAL',
          message:
            'Một số phiên thiếu dữ liệu VNINDEX; giá trị thị trường tương ứng được để trống.',
          symbols: missing.map((series) => series.symbol),
          ...(marketIds.length ? { indicators: marketIds } : {}),
        });
    }
    const unavailable = enabledIds.filter(
      (id) => contextIds.has(id) && !MARKET_CONTEXT_INDICATORS.has(id),
    );
    if (unavailable.length)
      warnings.push({
        code: 'CONTEXT_UNAVAILABLE',
        message:
          'Chưa có dữ liệu bối cảnh (chỉ số ngành, độ rộng thị trường) cho các chỉ báo này; tín hiệu của chúng được để trống.',
        indicators: unavailable,
      });
    const shortWarmup = used.filter((series) => series.startIndex < WARMUP_SESSIONS);
    if (shortWarmup.length)
      warnings.push({
        code: 'WARMUP_SHORT',
        message: `Có ít hơn ${WARMUP_SESSIONS} phiên dữ liệu trước ngày bắt đầu; chỉ báo dài hạn có thể để trống ở đầu kỳ.`,
        symbols: shortWarmup.map((series) => series.symbol),
      });
    const skipped = used.filter((series) => (series.history.skippedRows ?? 0) > 0);
    if (skipped.length)
      warnings.push({
        code: 'PRICE_ROWS_SKIPPED',
        message: 'Đã bỏ qua các dòng giá không hợp lệ (không tự điền dữ liệu).',
        symbols: skipped.map((series) => series.symbol),
      });
    const unadjusted = used.filter((series) => series.history.adjusted !== true);
    if (unadjusted.length)
      warnings.push({
        code: 'PRICES_NOT_ADJUSTED',
        message: 'Nguồn dữ liệu không xác nhận giá đã điều chỉnh theo sự kiện doanh nghiệp.',
        symbols: unadjusted.map((series) => series.symbol),
      });
  }

  private async execute(job: BacktestJob) {
    try {
      return await this.executor.run(job);
    } catch (error) {
      if (error instanceof EngineRunError || error instanceof AdvancedEngineError)
        throw unprocessable(error.code, error.message, error.errors);
      if (error instanceof BacktestExecutorError) {
        if (error.code === 'BACKTEST_QUEUE_FULL')
          throw new ConflictException({ code: error.code, message: error.message });
        throw new ServiceUnavailableException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  private snapshot(
    request: RunRequest,
    revision: SavedRevision,
    prepared: PreparedRun,
    result: RunResult,
    systemProfile: SystemProfile | null,
  ): RunSnapshot {
    const { main } = prepared;
    const fees = FEE_PRESETS[request.assumptions.fee_preset];
    return {
      ...result.snapshot,
      shared_revision: revision.revision,
      revision_saved_at: revision.saved_at,
      config_hash: revision.config_hash,
      symbol: request.symbol,
      requested_start: request.start,
      requested_end: request.end,
      data_source: main.history.source ?? 'unknown',
      data_source_priority: main.history.sourcePriority ?? null,
      adjusted: main.history.adjusted === true,
      skipped_rows: main.history.skippedRows ?? 0,
      data_hash: prepared.mainHash,
      benchmark: { symbol: BENCHMARK_SYMBOL, ...prepared.benchmark },
      warmup_sessions_requested: WARMUP_SESSIONS,
      warmup_bars: main.startIndex,
      fee_preset: request.assumptions.fee_preset,
      fees: { buy: fees.buy, sell: fees.sell },
      lot_size: CLEAN_TECH_2_0.lot_size,
      execution: request.assumptions.execution,
      capital: result.snapshot.options.capital,
      execution_profile: 'CLEAN_TECH_2.0',
      profile: CLEAN_TECH_2_0,
      slippage: 'not_modelled',
      open_position_policy: 'mark_to_market_last_close',
      simulation: {
        contract: STRATEGY_BACKTEST_CONTRACT,
        execution: request.assumptions.execution,
        execution_label: EXECUTION_PROFILES[request.assumptions.execution].label,
        fill_price: EXECUTION_PROFILES[request.assumptions.execution].fill_price,
        caveat: EXECUTION_PROFILES[request.assumptions.execution].caveat,
        signal_after_open_fill: prepared.job.engine?.signal_after_open_fill === true,
        position_policy: 'single_symbol_long_only_one_position',
        sizing: 'all_available_cash_including_buy_fee_rounded_down_to_lot',
        exits: 'none: no stop, take-profit, trailing or max holding',
        min_held_bars: CLEAN_TECH_2_0.min_held_bars,
        min_held_bars_status: 'carried_over_from_reference_engine_pending_product_decision',
        fee_model: 'buy_fee_on_value; sell_fee_and_tax_as_one_combined_rate',
        settlement: 'not_modelled',
        liquidity: 'not_modelled',
        slippage: 'not_modelled',
        price_adjustment: main.history.adjusted === true ? 'provider_adjusted' : 'not_confirmed',
        annualization_sessions: ANNUALIZATION_SESSIONS,
        buy_hold_basis: 'close_ratio_before_fees_and_dividends',
      },
      versions: {
        schema_version: SCHEMA_VERSION,
        calculation_version: CALCULATION_VERSION,
        rule_version: RULE_VERSION,
        engine_version: ENGINE_VERSION,
        formula_version: FORMULA_VERSION,
      },
      data_warnings: prepared.warnings,
      research: request.research ? { ...request.research } : null,
      system:
        request.system && prepared.system && systemProfile
          ? {
              options: prepared.job.system!.options,
              symbols: prepared.system.symbols,
              excluded_symbols: prepared.system.excluded,
              universe: null,
              universe_policy: 'explicit_symbols',
              sectors: prepared.system.sectors,
              data_hash: prepared.system.dataHash,
              profile: systemProfile,
            }
          : null,
    };
  }
}

/** Deterministic failures are stored with the run; transient ones (403/409/503) are not. */
function persistableFailure(error: unknown): StoredRunError | null {
  if (!(error instanceof HttpException)) return null;
  const status = error.getStatus();
  const body = error.getResponse();
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' ? record.code : null;
  if (!code || !(status === 422 || code === 'MARKET_HISTORY_NOT_FOUND')) return null;
  return {
    status,
    code,
    message: typeof record.message === 'string' ? record.message : error.message,
    ...(Array.isArray(record.details) ? { details: record.details as unknown[] } : {}),
  };
}

function presentStored(result: Record<string, unknown> | null): PresentedResult | null {
  if (!result) return null;
  const { strategy_extras: extras, ...engine } = result as RunResult & {
    strategy_extras?: StrategyRunExtras;
  };
  return presentRunResult(engine as RunResult, extras);
}

function toView(row: BacktestRunRow): BacktestRunView {
  const snapshot = (row.snapshot as RunSnapshot | null) ?? null;
  return {
    run_id: row.id,
    status: row.status,
    kind: row.kind,
    shared_revision: row.shared_revision,
    created_at: row.created_at.toISOString(),
    request: row.request,
    snapshot,
    result: presentStored(row.result),
    research_result: row.research_result as ResearchResult | null,
    system_result: row.system_result as SystemRunSummary | null,
    data_warnings: snapshot?.data_warnings ?? [],
    error: row.error,
  };
}

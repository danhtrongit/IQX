import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import { canonicalJson, indicatorCapability, sha256Hex } from '../quant/v2/index.js';
import {
  resolveBotSchedule,
  resolvePriceStore,
  type BotScheduleLike,
} from '../strategies/bot-schedule.port.js';
import { universeLabelOf } from '../strategies/strategies.labels.js';
import {
  StrategiesService,
  priceStoreUnavailable,
  strategyInvalid,
  strategyNotFound,
} from '../strategies/strategies.service.js';
import {
  DATA_STORE_NAME,
  DEFAULT_FEE_RULES,
  PRICE_STORE,
  PRICE_UNIT,
  RULES_VERSION,
  STRATEGY_READER,
  STRATEGY_RULES,
  checkDateRange,
  jsonSafe,
  resolveUniverse,
  resultSubtitle,
  type BacktestResult,
  type DataWarning,
  type PriceStorePort,
  type ResolvedStrategy,
  type StrategyContent,
  type StrategyReaderPort,
} from '../strategy-rules/index.js';
import { BacktestExecutorError, StrategyBacktestExecutor } from './strategy-backtests.executor.js';
import { toStrategyKpis } from './strategy-backtests.presenter.js';
import {
  StrategyBacktestRepository,
  type BacktestRunRecord,
  type BacktestRunRow,
  type BacktestRunSummaryRow,
  type StrategyBacktestStore,
} from './strategy-backtests.repository.js';
import {
  LEGACY_BACKTEST_FIELDS,
  type BacktestListQuery,
  type BacktestRunBody,
} from './strategy-backtests.schemas.js';

type RunStrategy = {
  source: 'iqx' | 'user' | 'draft';
  /** Template uuid, user strategy id, or the draft's base strategy id. */
  ref_id: string | null;
  version: number | null;
  content: StrategyContent;
  config_hash: string;
  strategy_label: string;
  version_label: string | null;
  result_label: string;
};

export type BasketSnapshot = {
  strategy_ref: { source: RunStrategy['source']; id: string | null; version: number | null };
  strategy_label: string;
  version_label: string | null;
  result_label: string;
  subtitle: string;
  content: StrategyContent;
  config_hash: string;
  universe_label: string;
  universe_resolved: string[];
  excluded_symbols: string[];
  requested_start: string;
  requested_end: string;
  data_store: typeof DATA_STORE_NAME;
  data_as_of: string | null;
  data_hash: string;
  price_unit: typeof PRICE_UNIT;
  adjusted: boolean;
  rules_version: string;
  fee_rules: typeof DEFAULT_FEE_RULES;
  initial_cash_vnd: string;
  warnings: DataWarning[];
};

/** `BacktestResult` as stored and served: bigint → decimal string, skipped items capped (§4.7). */
export type StoredBasketResult = Record<string, unknown> & {
  kpis: BacktestResult['kpis'];
  trades: Array<Record<string, unknown> & { exit_reason: string; exit_session: string }>;
  time_exits: number;
};

export type BacktestRunView = {
  run_id: string;
  status: 'succeeded' | 'failed';
  legacy: boolean;
  trial: boolean;
  created_at: string;
  snapshot: BasketSnapshot | null;
  result: StoredBasketResult | null;
  legacy_view: {
    kind: string;
    symbol: string | null;
    start: string | null;
    end: string | null;
    kpis: { total_return_pct: number; max_drawdown_pct: number; closed_trades: number } | null;
    note: string;
  } | null;
  error: BacktestRunRow['error'];
};

const LEGACY_NOTE = 'Chạy trên 1 mã theo cấu hình chung trước đây. Chỉ xem, không chạy lại.';
const ENGINE_VERSION = 'basket-1';

const unprocessable = (code: string, message: string, details?: unknown[]) =>
  new UnprocessableEntityException({ code, message, ...(details ? { details } : {}) });

const idempotencyKeyReused = () =>
  new ConflictException({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Khóa idempotency đã được dùng cho một yêu cầu khác.',
  });

const runNotFound = () =>
  new NotFoundException({
    code: 'BACKTEST_RUN_NOT_FOUND',
    message: 'Không tìm thấy lần chạy backtest.',
  });

/** Legacy engine KPIs → the three numbers a legacy run still shows (§4.9). */
function legacyKpis(raw: unknown) {
  const kpis = toStrategyKpis(raw);
  if (!kpis) return null;
  return {
    total_return_pct: kpis.total_return_pct,
    max_drawdown_pct: kpis.max_drawdown_pct,
    closed_trades: kpis.closed_trade_count,
  };
}

/**
 * Backtest theo rổ (spec Bot và Chiến lược v2.0 §4, §10.3): one strategy version over its basket,
 * fixed capital/fees/fill/T+2 from the shared rules, prices from the price store. Every stored run
 * is immutable and idempotent per (user, idempotency_key); a request carrying the pre-22-11 fields
 * is refused with 422 STRATEGY_INVALID.
 */
@Injectable()
export class StrategyBacktestsService {
  private readonly logger = new Logger(StrategyBacktestsService.name);

  constructor(
    @Inject(StrategyBacktestRepository) private readonly store: StrategyBacktestStore,
    @Inject(STRATEGY_READER) private readonly reader: StrategyReaderPort,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    private readonly strategies: StrategiesService,
    private readonly executor: StrategyBacktestExecutor,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() @Inject(PRICE_STORE) private readonly injectedPrices?: PriceStorePort,
  ) {}

  private get prices(): PriceStorePort {
    const store = this.injectedPrices ?? resolvePriceStore(this.moduleRef);
    if (!store) throw priceStoreUnavailable();
    return store;
  }

  private get schedule(): BotScheduleLike | null {
    return resolveBotSchedule(this.moduleRef);
  }

  async create(userId: string, body: BacktestRunBody): Promise<BacktestRunView> {
    const legacy = LEGACY_BACKTEST_FIELDS.filter((field) => field in body);
    if (legacy.length)
      throw strategyInvalid(
        'STRATEGY_INVALID',
        legacy.map((field) => ({
          path: field,
          message: `Trường ${field} không còn dùng: Backtest chạy theo rổ của một chiến lược.`,
        })),
      );
    const idempotencyKey = body.idempotency_key;
    const request = {
      strategy: body.strategy,
      start: body.start,
      end: body.end,
      ...(body.trial ? { trial: true } : {}),
    };
    const trial = body.trial === true;
    if (trial && body.strategy.source !== 'draft')
      throw strategyInvalid('STRATEGY_INVALID', [
        { path: 'trial', message: 'Chạy thử không lưu chỉ dùng cho bản nháp.' },
      ]);
    const requestHash = sha256Hex(canonicalJson(request));
    if (!trial) {
      const existing = await this.store.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return this.replay(existing, requestHash);
    }

    const strategy = await this.resolveStrategy(userId, body.strategy);
    if (strategy.source !== 'iqx') await this.assertIndicatorGrants(userId, strategy.content);

    const prices = this.prices;
    const calendar = await prices.calendar();
    const range = checkDateRange(calendar, body.start, body.end);
    if (!range.ok) throw unprocessable(range.code, range.message);
    const eligibility = await prices.eligibility();
    const universe = resolveUniverse(strategy.content.universe, eligibility);
    if (!universe.ok)
      throw strategyInvalid('UNIVERSE_EMPTY', [{ path: 'universe', message: universe.message }]);

    const [meta, data] = await Promise.all([prices.meta(), prices.loadSeries(universe.symbols)]);
    const fees = { ...DEFAULT_FEE_RULES };
    let result: BacktestResult;
    try {
      result = await this.executor.run({
        content: strategy.content,
        universe: universe.symbols,
        excluded_symbols: universe.excluded,
        start: range.start,
        end: range.end,
        data,
        fees,
      });
    } catch (error) {
      throw this.executionError(error);
    }

    const snapshot: BasketSnapshot = {
      strategy_ref: { source: strategy.source, id: strategy.ref_id, version: strategy.version },
      strategy_label: strategy.strategy_label,
      version_label: strategy.version_label,
      result_label: strategy.result_label,
      subtitle: resultSubtitle(
        universeLabelOf(strategy.content.universe),
        universe.symbols.length,
        result,
        strategy.content.max_holding,
      ),
      content: strategy.content,
      config_hash: strategy.config_hash,
      universe_label: universeLabelOf(strategy.content.universe),
      universe_resolved: universe.symbols,
      excluded_symbols: universe.excluded,
      requested_start: body.start,
      requested_end: body.end,
      data_store: DATA_STORE_NAME,
      data_as_of: data.data_as_of ?? meta.data_as_of,
      data_hash: data.data_hash,
      price_unit: PRICE_UNIT,
      adjusted: meta.adjusted,
      rules_version: result.rules_version ?? RULES_VERSION,
      fee_rules: fees,
      initial_cash_vnd: STRATEGY_RULES.initial_cash_vnd.toString(),
      warnings: result.warnings,
    };
    const stored = storedResult(result);
    const record: BacktestRunRecord = {
      user_id: userId,
      kind: 'basket',
      shared_revision: null,
      strategy_source: strategy.source,
      strategy_ref_id: strategy.ref_id,
      strategy_version: strategy.version,
      request,
      request_hash: requestHash,
      snapshot: snapshot as unknown as Record<string, unknown>,
      result: stored,
      config_hash: strategy.config_hash,
      data_hash: /^[a-f0-9]{64}$/.test(data.data_hash) ? data.data_hash : null,
      engine_version: ENGINE_VERSION,
      calculation_version: RULES_VERSION,
      rule_version: RULES_VERSION,
      idempotency_key: idempotencyKey,
      status: 'succeeded',
      error: null,
    };
    if (trial)
      return { ...toView({ ...record, id: randomUUID(), created_at: new Date() }), trial: true };
    const inserted = await this.store.insert(record);
    if (inserted) {
      if (strategy.source === 'iqx' && strategy.ref_id && strategy.version)
        await this.store
          .recordIqxEvent(strategy.ref_id, strategy.version, userId, 'strategy_run')
          .catch((error: unknown) => this.logger.warn(`iqx strategy_run event: ${String(error)}`));
      return toView(inserted);
    }
    // A concurrent request with the same key stored first; answer with its run.
    const winner = await this.store.findByIdempotencyKey(userId, idempotencyKey);
    if (!winner) throw idempotencyKeyReused();
    return this.replay(winner, requestHash);
  }

  async get(userId: string, id: string): Promise<BacktestRunView> {
    const row = await this.store.findById(userId, id);
    if (!row) throw runNotFound();
    return toView(row);
  }

  async list(userId: string, query: BacktestListQuery) {
    const rows = await this.store.list(userId, {
      strategy_source: query.strategy_source,
      strategy_id: query.strategy_id,
      limit: query.limit,
    });
    return { items: rows.map(listItem) };
  }

  /** One page of the trades, newest exit first (§4.7 "Giao dịch"); `total` = the whole run. */
  async trades(userId: string, id: string, offset: number, limit: number) {
    const view = await this.get(userId, id);
    if (view.legacy || !view.result)
      throw new NotFoundException({
        code: 'BACKTEST_RESULT_NOT_FOUND',
        message: 'Lần chạy này không có danh sách giao dịch theo rổ.',
      });
    const trades = [...view.result.trades].reverse();
    return {
      run_id: view.run_id,
      total: trades.length,
      offset,
      limit,
      time_exits: view.result.time_exits,
      items: trades.slice(offset, offset + limit),
    };
  }

  // ---------------------------------------------------------------------------

  private async resolveStrategy(
    userId: string,
    ref: BacktestRunBody['strategy'],
  ): Promise<RunStrategy> {
    if (ref.source === 'draft') {
      const checked = await this.strategies.validateContent(ref.content, 'user');
      let baseName: string | null = null;
      if (ref.base) {
        const base = await this.reader.resolve(userId, {
          source: 'user',
          id: ref.base.id,
          version: ref.base.version,
        });
        baseName = base?.name ?? null;
      }
      const label = baseName ? `Bản nháp · sửa từ ${baseName}` : 'Bản nháp';
      return {
        source: 'draft',
        ref_id: ref.base?.id ?? null,
        version: ref.base?.version ?? null,
        content: checked.content,
        config_hash: checked.config_hash,
        strategy_label: label,
        version_label: null,
        result_label: label,
      };
    }
    const resolved = await this.reader.resolve(userId, {
      source: ref.source,
      id: ref.id,
      ...(ref.version !== undefined ? { version: ref.version } : {}),
    });
    if (!resolved || resolved.deleted) {
      if (ref.source === 'iqx')
        throw new NotFoundException({
          code: 'IQX_TEMPLATE_NOT_FOUND',
          message: 'Không tìm thấy Chiến lược IQX.',
        });
      throw strategyNotFound();
    }
    if (ref.source === 'iqx' && resolved.hidden)
      await this.assertHiddenIqxAllowed(userId, resolved);
    return fromResolved(resolved);
  }

  /** A hidden IQX strategy runs only for a user whose Bot (last or next session) still uses it. */
  private async assertHiddenIqxAllowed(userId: string, resolved: ResolvedStrategy) {
    const usage = (await this.schedule?.usage(userId, 'iqx', resolved.ref.id)) ?? null;
    if (usage && (usage.last || usage.next)) return;
    throw new ConflictException({
      code: 'IQX_TEMPLATE_HIDDEN',
      message: 'IQX đã ngừng cung cấp chiến lược này.',
    });
  }

  /** Every indicator the strategy evaluates needs `indicator:<id>` now (Học viện lock). */
  private async assertIndicatorGrants(userId: string, content: StrategyContent) {
    const used = Object.entries(content.indicators)
      .filter(
        ([, item]) => item?.master_enabled === true && (item.buy?.enabled || item.sell?.enabled),
      )
      .map(([id]) => id)
      .sort();
    if (!used.length) return;
    const granted = await this.grants.grantedCapabilities(userId);
    const locked = used.filter((id) => !granted.has(indicatorCapability(id)));
    if (!locked.length) return;
    throw new ForbiddenException({
      code: 'CAPABILITY_LOCKED',
      message: `Cần đạt bài kiểm tra của bài học chỉ báo ${locked.join(', ')} trước khi chạy backtest.`,
      capability: indicatorCapability(locked[0]!),
      capabilities: locked.map(indicatorCapability),
      reason: 'not_learned',
      details: locked.map((id) => ({ capability: indicatorCapability(id), reason: 'not_learned' })),
    });
  }

  private executionError(error: unknown): Error {
    if (error instanceof BacktestExecutorError) {
      if (error.code === 'BACKTEST_QUEUE_FULL')
        return new ConflictException({ code: error.code, message: error.message });
      return new ServiceUnavailableException({ code: error.code, message: error.message });
    }
    const code =
      typeof error === 'object' &&
      error !== null &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;
    if (code === 'DATE_RANGE_INVALID' || code === 'UNIVERSE_EMPTY' || code === 'STRATEGY_INVALID')
      return unprocessable(code, error instanceof Error ? error.message : String(error));
    return error instanceof Error ? error : new Error(String(error));
  }

  private replay(row: BacktestRunRow, requestHash: string): BacktestRunView {
    if (row.request_hash !== requestHash) throw idempotencyKeyReused();
    if (row.status === 'failed' && row.error) {
      const { status, code, message, details } = row.error;
      throw new HttpException({ code, message, ...(details ? { details } : {}) }, status);
    }
    return toView(row);
  }
}

function fromResolved(resolved: ResolvedStrategy): RunStrategy {
  const iqx = resolved.ref.source === 'iqx';
  return {
    source: resolved.ref.source,
    ref_id: resolved.ref.id,
    version: resolved.ref.version,
    content: resolved.content,
    config_hash: resolved.config_hash,
    strategy_label: iqx ? `Chiến lược IQX · ${resolved.name}` : resolved.name,
    version_label: resolved.version_label,
    result_label: iqx
      ? `Chiến lược IQX · ${resolved.name} ${resolved.version_label}`
      : `${resolved.name} · ${resolved.version_label}`,
  };
}

/** JSON form of a result; skipped orders keep the 60 most recent items (§4.7). */
function storedResult(result: BacktestResult): StoredBasketResult {
  const safe = jsonSafe(result) as StoredBasketResult & {
    skipped_orders: { items: unknown[] };
  };
  const items = safe.skipped_orders.items;
  if (items.length > STRATEGY_RULES.skipped_items_limit)
    safe.skipped_orders.items = items.slice(-STRATEGY_RULES.skipped_items_limit);
  delete (safe as Record<string, unknown>).warnings;
  return safe;
}

function toView(row: BacktestRunRow): BacktestRunView {
  const legacy = row.kind !== 'basket';
  const request = row.request ?? {};
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    run_id: row.id,
    status: row.status,
    legacy,
    trial: false,
    created_at: row.created_at.toISOString(),
    snapshot: legacy ? null : (row.snapshot as unknown as BasketSnapshot | null),
    result: legacy ? null : (row.result as StoredBasketResult | null),
    legacy_view: legacy
      ? {
          kind: row.kind,
          symbol: text(request.symbol),
          start: text(request.start),
          end: text(request.end),
          kpis: legacyKpis(
            (row.system_result as Record<string, unknown> | null | undefined)?.kpis ??
              (row.result as Record<string, unknown> | null)?.kpis,
          ),
          note: LEGACY_NOTE,
        }
      : null,
    error: row.error,
  };
}

function listItem(row: BacktestRunSummaryRow) {
  const legacy = row.kind !== 'basket';
  const kpis = row.kpis as Record<string, unknown> | null;
  return {
    run_id: row.id,
    created_at: row.created_at.toISOString(),
    legacy,
    status: row.status,
    strategy_source: row.strategy_source,
    strategy_id: row.strategy_ref_id,
    strategy_version: row.strategy_version,
    strategy_label: legacy ? 'Cấu hình cũ' : (row.strategy_label ?? 'Bản nháp'),
    version_label: legacy ? null : row.version_label,
    universe_label: legacy ? (row.symbol ?? '') : (row.universe_label ?? ''),
    start: row.start,
    end: row.end,
    config_hash: row.config_hash,
    kpis: legacy
      ? legacyKpis(kpis)
      : kpis
        ? {
            total_return_pct: Number(kpis.total_return_pct),
            max_drawdown_pct: Number(kpis.max_drawdown_pct),
            closed_trades: Number(kpis.closed_trades),
          }
        : null,
  };
}

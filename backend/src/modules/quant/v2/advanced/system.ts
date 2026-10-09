import { DEFAULT_RUN_OPTIONS } from '../backtest.js';
import { validateConfig } from '../config.js';
import { EngineRunError } from '../errors.js';
import { calcLegacy, isFiniteNumber, validBar } from '../indicators.js';
import { indicatorSideSignals, sideSignals } from '../signals.js';
import { loadTechnicalRegistry } from '../technical-registry.js';
import {
  CALCULATION_VERSION,
  ENGINE_VERSION,
  FORMULA_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  type Bar,
  type CanceledOrder,
  type ClosedTrade,
  type CurvePoint,
  type EngineValidationError,
  type Kpis,
  type LogicNode,
  type OpenPosition,
  type RegistryEntry,
  type RunOptions,
  type SharedConfig,
  type Tri,
} from '../types.js';
import { AdvancedEngineError } from './errors.js';
import { logicIndicatorIds, logicSignals, validateLogicNode } from './logic.js';

/**
 * Multi-symbol, long-only portfolio ledger (Chapters 16–18,
 * ADVANCED-CAPABILITIES §4–§9). One shared cash book; per session the order of
 * operations is:
 *
 *   1. corporate actions (only when supplied; bars are otherwise treated as adjusted)
 *   2. tradability (a symbol trades on a session only when it has a bar that day)
 *   3. pending orders at the open (sells/trims first, then buys in ranking order)
 *   4. exits: intrabar stop/trailing/target with a fixed conservative order, then
 *      the portfolio drawdown stop, then close-based exits (max holding, Sell
 *      consensus), then the rebalancing trims
 *   5. universe & candidates (Buy signal, not held, no pending order, cooldown over)
 *   6. ranking (missing score excluded, tie-break symbol ascending)
 *   7. budget / per-symbol / sector / correlation / max-positions caps → new orders
 *   8. valuation at the close (cash + Σ qty × last available close)
 *
 * Every option is explicit; an absent option is OFF. With one symbol and no
 * option the result reproduces `runBacktest` (CLEAN_TECH_2.0) exactly.
 *
 * Conventions (documented in `profile`):
 * - Session index = position in the union calendar of all supplied bar dates
 *   (warmup included). Holding, cooldown and `min_held_bars` count sessions.
 * - Stop/trailing/target are resting price levels evaluated on the bar's OHLC:
 *   open gap first (fill at the open), then stop before target when both are
 *   inside the range (conservative), fill at the level otherwise.
 * - Trailing peak = highest close since the fill (entry price initially),
 *   updated at the close of T and effective from T+1.
 * - Max holding, Sell consensus and the drawdown stop decide at the close and
 *   fill per execution profile (same close, or next valid open).
 * - Universe membership only restricts new buys; held positions keep their exits.
 * - Caps apply to new-buy budgets measured at the decision NAV; price drift
 *   above a cap never forces a sale unless `rebalance` is set (trim only).
 * - Several exit conditions on one bar produce one full sale: the primary
 *   reason follows EXIT_PRIORITY and `concurrent_reasons` lists all of them.
 */

export const SYSTEM_MAX_SYMBOLS = 30;
/** Correlation window used when `max_correlation` is set without `correlation_lookback`. */
export const DEFAULT_CORRELATION_LOOKBACK = 60;

export type RankingKey = 'roc_20' | 'rs_market' | 'relative_volume' | 'distance_52w_high';
export const RANKING_KEYS: readonly RankingKey[] = [
  'roc_20',
  'rs_market',
  'relative_volume',
  'distance_52w_high',
];

/**
 * Series behind each ranking key (fixed published parameters). Three of them are retired
 * indicators (rs_market, relative_volume, distance_52w_high): the advanced portfolio engine keeps
 * computing them through `calcLegacy` for legacy holders; they are not offered as indicators.
 */
const RANKING_SOURCES: Record<RankingKey, { id: string; params: Record<string, number> }> = {
  roc_20: { id: 'roc', params: { period: 20, level: 5 } },
  rs_market: { id: 'rs_market', params: { lookback: 20, level: 0 } },
  relative_volume: { id: 'relative_volume', params: { lookback: 20, level: 1.5 } },
  distance_52w_high: { id: 'distance_52w_high', params: { level: -5 } },
};

export type ExitReason =
  | 'stop_loss'
  | 'trailing_stop'
  | 'take_profit'
  | 'portfolio_drawdown'
  | 'max_holding'
  | 'sell_consensus'
  | 'rebalance';

/** Published priority of the primary exit reason when several conditions hold on one bar. */
export const EXIT_PRIORITY: readonly ExitReason[] = [
  'stop_loss',
  'trailing_stop',
  'take_profit',
  'portfolio_drawdown',
  'max_holding',
  'sell_consensus',
];

export type SystemSizing =
  | { mode: 'all_cash' }
  | { mode: 'pct_nav'; pct: number }
  | { mode: 'fixed_amount'; amount_vnd: number };

export type SystemExits = {
  stop_loss_pct?: number;
  take_profit_pct?: number;
  trailing_pct?: number;
  max_holding?: number;
};

/** CONTRACTS §4.1 `system` options (symbols/universe are resolved by the caller into `SystemInput`). */
export type SystemOptions = {
  ranking?: { key: RankingKey; direction: 'desc' | 'asc' };
  logic?: LogicNode;
  priority?: 'exit_first';
  cooldown_bars?: number;
  sizing?: SystemSizing;
  max_positions?: number;
  exits?: SystemExits;
  max_symbol_weight_pct?: number;
  max_sector_weight_pct?: number;
  max_correlation?: number;
  correlation_lookback?: number;
  rebalance?: { every_bars: number };
  portfolio_drawdown_stop_pct?: number;
};

export type SystemSymbolData = { symbol: string; bars: readonly Bar[]; sector?: string | null };

/** Point-in-time membership: eligible for new buys on dates from..to (inclusive, to=null → open). */
export type UniverseMembership = { symbol: string; from: string; to: string | null };

export type CorporateAction =
  | { symbol: string; date: string; kind: 'cash_dividend'; cash_per_share: number }
  | { symbol: string; date: string; kind: 'stock_split'; ratio: number };

export type SystemInput = {
  config: SharedConfig;
  symbols: SystemSymbolData[];
  options?: Partial<RunOptions>;
  system?: SystemOptions;
  universe?: UniverseMembership[];
  corporate_actions?: CorporateAction[];
  registry?: readonly RegistryEntry[];
};

export type SystemTrade = ClosedTrade & { symbol: string; partial: boolean };
export type SystemOpenPosition = OpenPosition & {
  symbol: string;
  sector: string | null;
  peak_close: number;
};
export type SystemCanceledOrder = CanceledOrder & {
  symbol: string;
  order: 'buy' | 'sell' | 'trim';
};

export type LedgerEventKind =
  | 'corporate_action'
  | 'order_placed'
  | 'order_filled'
  | 'order_rejected'
  | 'order_canceled'
  | 'candidate_skipped'
  | 'halt';

export type LedgerEvent = {
  seq: number;
  date: string;
  session: number;
  symbol: string | null;
  kind: LedgerEventKind;
  side: 'buy' | 'sell' | null;
  qty: number | null;
  price: number | null;
  amount: number | null;
  fee: number | null;
  cash_after: number;
  reason: string | null;
  concurrent_reasons?: string[];
};

export type SystemProfile = {
  long_only: true;
  execution: RunOptions['execution'];
  lot_size: number;
  min_held_bars: number;
  position_size: SystemSizing['mode'];
  position_pct: number | null;
  position_amount_vnd: number | null;
  max_positions: number | null;
  cooldown_bars: number | null;
  priority: 'exit_first';
  exit_priority: readonly ExitReason[];
  intrabar_policy: 'open_gap_first_then_stop_before_target';
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  trailing_pct: number | null;
  trailing_source: 'close';
  max_holding: number | null;
  ranking: {
    key: RankingKey;
    direction: 'desc' | 'asc';
    tie_break: 'symbol_asc';
    missing: 'excluded';
  } | null;
  logic: LogicNode | null;
  max_symbol_weight_pct: number | null;
  max_sector_weight_pct: number | null;
  max_correlation: number | null;
  correlation_lookback: number | null;
  rebalance_every_bars: number | null;
  rebalance_target_pct: number | null;
  portfolio_drawdown_stop_pct: number | null;
  caps_apply_to: 'new_buys';
  universe_policy: 'restricts_new_buys_only';
  buy_hold_basis: 'equal_weight_price_return';
};

export type SystemResult = {
  schema_version: typeof SCHEMA_VERSION;
  engine_version: typeof ENGINE_VERSION;
  calculation_version: typeof CALCULATION_VERSION;
  rule_version: typeof RULE_VERSION;
  formula_version: typeof FORMULA_VERSION;
  profile: SystemProfile;
  snapshot: {
    config: SharedConfig;
    options: RunOptions;
    system: SystemOptions;
    symbols: Array<{ symbol: string; sector: string | null; bar_count: number }>;
    universe: UniverseMembership[] | null;
    corporate_actions: CorporateAction[];
    actual_start: string;
    actual_end: string;
    bar_count: number;
  };
  initial: CurvePoint;
  curve: CurvePoint[];
  trades: SystemTrade[];
  trades_by_symbol: Record<string, SystemTrade[]>;
  positions_open: SystemOpenPosition[];
  cash: number;
  canceled: SystemCanceledOrder[];
  ledger: LedgerEvent[];
  ledger_size: number;
  kpis: Kpis;
  /** Capability ids (CONTRACTS §2) exercised by this input. */
  applied: string[];
};

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sum = (values: readonly number[]): number => values.reduce((s, x) => s + x, 0);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNCLASSIFIED_SECTOR = 'unclassified';
/** Keys of the §4.1 payload resolved by the caller (accepted and ignored here). */
const CALLER_RESOLVED_KEYS = new Set(['symbols', 'universe']);
const SYSTEM_KEYS = new Set([
  'ranking',
  'logic',
  'priority',
  'cooldown_bars',
  'sizing',
  'max_positions',
  'exits',
  'max_symbol_weight_pct',
  'max_sector_weight_pct',
  'max_correlation',
  'correlation_lookback',
  'rebalance',
  'portfolio_drawdown_stop_pct',
]);
const EXIT_KEYS = new Set(['stop_loss_pct', 'take_profit_pct', 'trailing_pct', 'max_holding']);

function checkNumber(
  errors: EngineValidationError[],
  path: string,
  value: unknown,
  min: number,
  max: number,
  integer: boolean,
): void {
  if (value === undefined) return;
  if (
    !isFiniteNumber(value) ||
    (integer && !Number.isInteger(value)) ||
    value < min ||
    value > max
  ) {
    errors.push({
      path,
      message: `${path} phải là ${integer ? 'số nguyên' : 'số'} trong khoảng ${min}–${max}.`,
    });
  }
}

/** Validate untrusted §4.1 system options (ranges, enums, unknown keys). Returns [] when valid. */
export function validateSystemOptions(system: unknown): EngineValidationError[] {
  if (system === undefined) return [];
  if (!isRecord(system)) return [{ path: 'system', message: 'Tùy chọn hệ thống không hợp lệ.' }];
  const errors: EngineValidationError[] = [];
  for (const key of Object.keys(system)) {
    if (!SYSTEM_KEYS.has(key) && !CALLER_RESOLVED_KEYS.has(key))
      errors.push({ path: `system.${key}`, message: `Tùy chọn không hợp lệ: ${key}.` });
  }
  const ranking = system.ranking;
  if (ranking !== undefined) {
    if (
      !isRecord(ranking) ||
      !RANKING_KEYS.includes(ranking.key as RankingKey) ||
      (ranking.direction !== 'desc' && ranking.direction !== 'asc') ||
      Object.keys(ranking).some((k) => k !== 'key' && k !== 'direction')
    ) {
      errors.push({ path: 'system.ranking', message: 'Tiêu chí xếp hạng không hợp lệ.' });
    }
  }
  if (system.logic !== undefined)
    errors.push(...validateLogicNode(system.logic, undefined, 'system.logic'));
  if (system.priority !== undefined && system.priority !== 'exit_first')
    errors.push({ path: 'system.priority', message: 'Ưu tiên tín hiệu chỉ hỗ trợ exit_first.' });
  checkNumber(errors, 'system.cooldown_bars', system.cooldown_bars, 1, 60, true);
  const sizing = system.sizing;
  if (sizing !== undefined) {
    if (!isRecord(sizing)) {
      errors.push({ path: 'system.sizing', message: 'Cách phân bổ vốn không hợp lệ.' });
    } else if (sizing.mode === 'all_cash') {
      if (Object.keys(sizing).length !== 1)
        errors.push({ path: 'system.sizing', message: 'Cách phân bổ vốn không hợp lệ.' });
    } else if (sizing.mode === 'pct_nav') {
      if (sizing.pct === undefined)
        errors.push({ path: 'system.sizing.pct', message: 'Thiếu tỷ lệ NAV.' });
      checkNumber(errors, 'system.sizing.pct', sizing.pct, 1, 100, false);
      if (Object.keys(sizing).some((k) => k !== 'mode' && k !== 'pct'))
        errors.push({ path: 'system.sizing', message: 'Cách phân bổ vốn không hợp lệ.' });
    } else if (sizing.mode === 'fixed_amount') {
      if (sizing.amount_vnd === undefined)
        errors.push({ path: 'system.sizing.amount_vnd', message: 'Thiếu số tiền cố định.' });
      checkNumber(
        errors,
        'system.sizing.amount_vnd',
        sizing.amount_vnd,
        1_000_000,
        Number.MAX_SAFE_INTEGER,
        false,
      );
      if (Object.keys(sizing).some((k) => k !== 'mode' && k !== 'amount_vnd'))
        errors.push({ path: 'system.sizing', message: 'Cách phân bổ vốn không hợp lệ.' });
    } else {
      errors.push({ path: 'system.sizing.mode', message: 'Cách phân bổ vốn không hợp lệ.' });
    }
  }
  checkNumber(errors, 'system.max_positions', system.max_positions, 1, SYSTEM_MAX_SYMBOLS, true);
  const exits = system.exits;
  if (exits !== undefined) {
    if (!isRecord(exits)) {
      errors.push({ path: 'system.exits', message: 'Điều kiện thoát không hợp lệ.' });
    } else {
      for (const key of Object.keys(exits)) {
        if (!EXIT_KEYS.has(key))
          errors.push({
            path: `system.exits.${key}`,
            message: `Điều kiện thoát không hợp lệ: ${key}.`,
          });
      }
      checkNumber(errors, 'system.exits.stop_loss_pct', exits.stop_loss_pct, 0.5, 50, false);
      checkNumber(errors, 'system.exits.take_profit_pct', exits.take_profit_pct, 0.5, 200, false);
      checkNumber(errors, 'system.exits.trailing_pct', exits.trailing_pct, 0.5, 50, false);
      checkNumber(errors, 'system.exits.max_holding', exits.max_holding, 1, 250, true);
    }
  }
  checkNumber(errors, 'system.max_symbol_weight_pct', system.max_symbol_weight_pct, 1, 100, false);
  checkNumber(errors, 'system.max_sector_weight_pct', system.max_sector_weight_pct, 1, 100, false);
  checkNumber(errors, 'system.max_correlation', system.max_correlation, 0, 1, false);
  checkNumber(errors, 'system.correlation_lookback', system.correlation_lookback, 20, 250, true);
  if (system.correlation_lookback !== undefined && system.max_correlation === undefined)
    errors.push({ path: 'system.correlation_lookback', message: 'Thiếu ngưỡng tương quan.' });
  const rebalance = system.rebalance;
  if (rebalance !== undefined) {
    if (!isRecord(rebalance) || Object.keys(rebalance).some((k) => k !== 'every_bars')) {
      errors.push({ path: 'system.rebalance', message: 'Lịch tái cân bằng không hợp lệ.' });
    } else {
      if (rebalance.every_bars === undefined)
        errors.push({ path: 'system.rebalance.every_bars', message: 'Thiếu chu kỳ tái cân bằng.' });
      checkNumber(errors, 'system.rebalance.every_bars', rebalance.every_bars, 5, 250, true);
    }
    const pctNav = isRecord(sizing) && sizing.mode === 'pct_nav';
    if (system.max_symbol_weight_pct === undefined && !pctNav)
      errors.push({
        path: 'system.rebalance',
        message: 'Tái cân bằng cần trần tỷ trọng mã hoặc phân bổ theo % NAV làm mục tiêu.',
      });
  }
  checkNumber(
    errors,
    'system.portfolio_drawdown_stop_pct',
    system.portfolio_drawdown_stop_pct,
    1,
    90,
    false,
  );
  return errors;
}

/** Capability ids (CONTRACTS §2) a system run exercises — used for gating and `applied`. */
export function systemCapabilities(
  system: SystemOptions | undefined,
  symbolCount: number,
  hasUniverse: boolean,
): string[] {
  const out: string[] = [];
  if (symbolCount >= 2) out.push('portfolio');
  if (hasUniverse) out.push('universe');
  if (!system) return out;
  if (system.ranking) out.push('ranking');
  if (system.logic) out.push('logic_groups');
  if (system.priority) out.push('signal_priority');
  if (system.cooldown_bars !== undefined) out.push('reentry_cooldown');
  if (system.sizing?.mode === 'pct_nav') out.push('sizing_pct_nav');
  if (system.sizing?.mode === 'fixed_amount') out.push('sizing_fixed_amount');
  if (system.max_positions !== undefined) out.push('max_positions');
  if (system.exits?.stop_loss_pct !== undefined) out.push('stop_loss_pct');
  if (system.exits?.take_profit_pct !== undefined) out.push('take_profit_pct');
  if (system.exits?.trailing_pct !== undefined) out.push('trailing_pct');
  if (system.exits?.max_holding !== undefined) out.push('max_holding');
  if (system.max_correlation !== undefined) out.push('correlation');
  if (system.max_symbol_weight_pct !== undefined) out.push('concentration');
  if (system.max_sector_weight_pct !== undefined) out.push('sector_weights');
  if (system.rebalance) out.push('rebalancing');
  if (system.portfolio_drawdown_stop_pct !== undefined) out.push('portfolio_drawdown');
  return out;
}

function resolveOptions(
  symbols: readonly SystemSymbolData[],
  options: Partial<RunOptions>,
): RunOptions {
  const firsts = symbols.map((s) => s.bars[0]?.date).filter((d): d is string => d !== undefined);
  const lasts = symbols
    .map((s) => s.bars[s.bars.length - 1]?.date)
    .filter((d): d is string => d !== undefined);
  return {
    capital: options.capital ?? DEFAULT_RUN_OPTIONS.capital,
    fee_buy: options.fee_buy ?? DEFAULT_RUN_OPTIONS.fee_buy,
    fee_sell: options.fee_sell ?? DEFAULT_RUN_OPTIONS.fee_sell,
    lot: options.lot ?? DEFAULT_RUN_OPTIONS.lot,
    execution: options.execution ?? DEFAULT_RUN_OPTIONS.execution,
    min_held_bars: options.min_held_bars ?? DEFAULT_RUN_OPTIONS.min_held_bars,
    start: options.start ?? [...firsts].sort()[0] ?? '',
    end: options.end ?? [...lasts].sort().reverse()[0] ?? '',
  };
}

function optionsAreValid(opt: RunOptions): boolean {
  return (
    isFiniteNumber(opt.capital) &&
    opt.capital > 0 &&
    Number.isInteger(opt.lot) &&
    opt.lot >= 1 &&
    isFiniteNumber(opt.fee_buy) &&
    opt.fee_buy >= 0 &&
    opt.fee_buy < 1 &&
    isFiniteNumber(opt.fee_sell) &&
    opt.fee_sell >= 0 &&
    opt.fee_sell < 1 &&
    Number.isInteger(opt.min_held_bars) &&
    opt.min_held_bars >= 0 &&
    (opt.execution === 'next_open' || opt.execution === 'same_close') &&
    typeof opt.start === 'string' &&
    typeof opt.end === 'string'
  );
}

function validateInputShape(input: SystemInput): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  const symbols = input.symbols;
  if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > SYSTEM_MAX_SYMBOLS) {
    return [{ path: 'symbols', message: `Cần 1–${SYSTEM_MAX_SYMBOLS} mã.` }];
  }
  const seen = new Set<string>();
  symbols.forEach((item, i) => {
    if (!isRecord(item) || typeof item.symbol !== 'string' || item.symbol === '') {
      errors.push({ path: `symbols.${i}`, message: 'Mã không hợp lệ.' });
      return;
    }
    if (seen.has(item.symbol))
      errors.push({ path: `symbols.${i}`, message: `Mã bị trùng: ${item.symbol}.` });
    seen.add(item.symbol);
    if (item.sector !== undefined && item.sector !== null && typeof item.sector !== 'string')
      errors.push({ path: `symbols.${i}.sector`, message: 'Ngành không hợp lệ.' });
  });
  (input.universe ?? []).forEach((m, i) => {
    if (
      !isRecord(m) ||
      !seen.has(m.symbol) ||
      typeof m.from !== 'string' ||
      !DATE_RE.test(m.from) ||
      (m.to !== null && (typeof m.to !== 'string' || !DATE_RE.test(m.to) || m.to < m.from))
    ) {
      errors.push({ path: `universe.${i}`, message: 'Thành phần rổ không hợp lệ.' });
    }
  });
  (input.corporate_actions ?? []).forEach((a, i) => {
    const ok =
      isRecord(a) &&
      seen.has(a.symbol) &&
      typeof a.date === 'string' &&
      DATE_RE.test(a.date) &&
      ((a.kind === 'cash_dividend' && isFiniteNumber(a.cash_per_share) && a.cash_per_share > 0) ||
        (a.kind === 'stock_split' && isFiniteNumber(a.ratio) && a.ratio > 0));
    if (!ok)
      errors.push({
        path: `corporate_actions.${i}`,
        message: 'Sự kiện doanh nghiệp không hợp lệ.',
      });
  });
  return errors;
}

type SymbolState = {
  symbol: string;
  sector: string | null;
  sectorKey: string;
  bars: readonly Bar[];
  barAtSession: Map<number, number>;
  buy: Tri[];
  sell: Tri[];
  score: Array<number | null> | null;
};

type Holding = {
  symbol: string;
  qty: number;
  price: number;
  cost: number;
  index: number;
  date: string;
  signal_date: string;
  peak: number;
  last_price: number;
};

type PendingOrder =
  | { order: 'buy'; symbol: string; signal_session: number; budget: number }
  | {
      order: 'sell' | 'trim';
      symbol: string;
      signal_session: number;
      qty: number | null;
      reason: ExitReason;
      concurrent: ExitReason[];
    };

/** Pearson correlation; null when a series is constant or empty (undefined, never 0). */
function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length;
  if (n < 2 || b.length !== n) return null;
  const ma = sum(a) / n;
  const mb = sum(b) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let k = 0; k < n; k++) {
    const da = (a[k] ?? 0) - ma;
    const db = (b[k] ?? 0) - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

/**
 * Run the portfolio ledger. Inputs are never mutated; the result carries the
 * full ledger, per-symbol trades, the NAV curve and KPIs with the single-run
 * conventions (null, never Infinity).
 *
 * @throws EngineRunError CONFIG_INVALID | BUY_RULES_REQUIRED | INVALID_OPTIONS | INVALID_BARS | EMPTY_RANGE
 * @throws AdvancedEngineError SYSTEM_INVALID | LOGIC_INVALID
 */
export function runSystem(input: SystemInput): SystemResult {
  const registry = input.registry ?? loadTechnicalRegistry();
  const config = jsonCopy(input.config);
  const configErrors = validateConfig(config, registry);
  if (configErrors.length) {
    throw new EngineRunError(
      'CONFIG_INVALID',
      configErrors.map((e) => e.message).join('\n'),
      configErrors,
    );
  }
  const activeBuy = registry
    .filter((entry) => {
      const item = config.indicators[entry.id];
      return item?.master_enabled === true && item.buy.enabled;
    })
    .map((entry) => entry.id);
  if (!activeBuy.length)
    throw new EngineRunError('BUY_RULES_REQUIRED', 'Cần ít nhất một điều kiện Mua.');

  const shapeErrors = [...validateInputShape(input), ...validateSystemOptions(input.system)];
  if (shapeErrors.length) {
    throw new AdvancedEngineError(
      'SYSTEM_INVALID',
      shapeErrors.map((e) => e.message).join('\n'),
      shapeErrors,
    );
  }
  const system: SystemOptions = jsonCopy(input.system ?? {});
  const logic = system.logic ?? null;
  if (logic) {
    const logicErrors = validateLogicNode(logic, activeBuy, 'system.logic');
    if (logicErrors.length) {
      throw new AdvancedEngineError(
        'LOGIC_INVALID',
        logicErrors.map((e) => e.message).join('\n'),
        logicErrors,
      );
    }
  }

  const symbolsInput = [...input.symbols].sort((a, b) =>
    a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0,
  );
  const opt = resolveOptions(symbolsInput, input.options ?? {});
  if (!optionsAreValid(opt)) throw new EngineRunError('INVALID_OPTIONS', 'Giả định không hợp lệ.');
  for (const item of symbolsInput) {
    const ok =
      Array.isArray(item.bars) &&
      item.bars.length > 0 &&
      item.bars.every((bar, i) => {
        const previous = item.bars[i - 1];
        return validBar(bar) && (previous === undefined || bar.date > previous.date);
      });
    if (!ok) throw new EngineRunError('INVALID_BARS', 'Dữ liệu phải tăng dần, duy nhất và hợp lệ.');
  }

  // Union calendar (warmup included); sessions inside [start, end] are simulated.
  const dates = [...new Set(symbolsInput.flatMap((s) => s.bars.map((b) => b.date)))].sort();
  const sessionOf = new Map(dates.map((d, i) => [d, i]));
  const use: number[] = [];
  dates.forEach((d, i) => {
    if (d >= opt.start && d <= opt.end) use.push(i);
  });
  const firstSession = use[0];
  const lastSession = use[use.length - 1];
  if (firstSession === undefined || lastSession === undefined) {
    throw new EngineRunError('EMPTY_RANGE', 'Khoảng kiểm thử không có dữ liệu.');
  }
  const dateOf = (s: number): string => dates[s] ?? '';

  const ranking = system.ranking ?? null;
  const states: SymbolState[] = symbolsInput.map((item) => {
    const barAtSession = new Map<number, number>();
    item.bars.forEach((bar, j) => barAtSession.set(sessionOf.get(bar.date) ?? -1, j));
    let buy: Tri[];
    if (logic) {
      const byIndicator: Record<string, Tri[]> = {};
      for (const id of logicIndicatorIds(logic)) {
        const side = config.indicators[id]?.buy;
        if (side) byIndicator[id] = indicatorSideSignals(id, side, item.bars);
      }
      buy = logicSignals(logic, byIndicator, item.bars.length);
    } else {
      buy = sideSignals(config, item.bars, 'buy', registry);
    }
    const sector = typeof item.sector === 'string' && item.sector !== '' ? item.sector : null;
    const source = ranking ? RANKING_SOURCES[ranking.key] : null;
    return {
      symbol: item.symbol,
      sector,
      sectorKey: sector ?? UNCLASSIFIED_SECTOR,
      bars: item.bars,
      barAtSession,
      buy,
      sell: sideSignals(config, item.bars, 'sell', registry),
      score: source ? (calcLegacy(source.id, source.params, item.bars).value ?? null) : null,
    };
  });
  const stateOf = new Map(states.map((s) => [s.symbol, s]));
  const barOf = (state: SymbolState, s: number): { bar: Bar; j: number } | null => {
    const j = state.barAtSession.get(s);
    const bar = j === undefined ? undefined : state.bars[j];
    return j === undefined || bar === undefined ? null : { bar, j };
  };

  const universeBySymbol = input.universe ? new Map<string, UniverseMembership[]>() : null;
  for (const m of input.universe ?? []) {
    const list = universeBySymbol?.get(m.symbol) ?? [];
    list.push(m);
    universeBySymbol?.set(m.symbol, list);
  }
  const inUniverse = (symbol: string, date: string): boolean =>
    universeBySymbol === null ||
    (universeBySymbol.get(symbol) ?? []).some(
      (m) => m.from <= date && (m.to === null || date <= m.to),
    );

  const actionsByDate = new Map<string, CorporateAction[]>();
  for (const action of input.corporate_actions ?? []) {
    const list = actionsByDate.get(action.date) ?? [];
    list.push(action);
    actionsByDate.set(action.date, list);
  }

  const exits = system.exits ?? {};
  const stopPct = exits.stop_loss_pct ?? null;
  const takePct = exits.take_profit_pct ?? null;
  const trailPct = exits.trailing_pct ?? null;
  const maxHolding = exits.max_holding ?? null;
  const cooldown = system.cooldown_bars ?? null;
  const sizing: SystemSizing = system.sizing ?? { mode: 'all_cash' };
  const maxPositions = system.max_positions ?? null;
  const symbolCap = system.max_symbol_weight_pct ?? null;
  const sectorCap = system.max_sector_weight_pct ?? null;
  const maxCorrelation = system.max_correlation ?? null;
  const correlationLookback =
    maxCorrelation === null ? null : (system.correlation_lookback ?? DEFAULT_CORRELATION_LOOKBACK);
  const rebalanceEvery = system.rebalance?.every_bars ?? null;
  const rebalanceTarget =
    rebalanceEvery === null ? null : (symbolCap ?? (sizing.mode === 'pct_nav' ? sizing.pct : null));
  const drawdownStop = system.portfolio_drawdown_stop_pct ?? null;

  // ---- ledger state -------------------------------------------------------
  let cash = opt.capital;
  const holdings = new Map<string, Holding>();
  const pending = new Map<string, PendingOrder>();
  const lastExitSession = new Map<string, number>();
  const trades: SystemTrade[] = [];
  const ledger: LedgerEvent[] = [];
  const canceled: SystemCanceledOrder[] = [];
  const curve: CurvePoint[] = [];
  let peakNav = opt.capital;
  let maxDrawdown = 0;
  let halted = false;

  const reservedCash = (): number => {
    let total = 0;
    for (const order of pending.values()) if (order.order === 'buy') total += order.budget;
    return total;
  };
  const navNow = (): number => {
    let value = cash;
    for (const h of holdings.values()) value += h.qty * h.last_price;
    return value;
  };
  const log = (event: Omit<LedgerEvent, 'seq' | 'cash_after'>): void => {
    ledger.push({ seq: ledger.length + 1, ...event, cash_after: cash });
  };

  const fillBuy = (
    symbol: string,
    s: number,
    price: number,
    signalSession: number,
    budget: number,
  ): boolean => {
    const qty = Math.floor(budget / (price * (1 + opt.fee_buy) * opt.lot)) * opt.lot;
    if (qty < opt.lot) {
      log({
        date: dateOf(s),
        session: s,
        symbol,
        kind: 'order_rejected',
        side: 'buy',
        qty: null,
        price,
        amount: null,
        fee: null,
        reason: 'insufficient_budget',
      });
      return false;
    }
    const cost = qty * price * (1 + opt.fee_buy);
    cash -= cost;
    holdings.set(symbol, {
      symbol,
      qty,
      price,
      cost,
      index: s,
      date: dateOf(s),
      signal_date: dateOf(signalSession),
      peak: price,
      last_price: price,
    });
    log({
      date: dateOf(s),
      session: s,
      symbol,
      kind: 'order_filled',
      side: 'buy',
      qty,
      price,
      amount: qty * price,
      fee: cost - qty * price,
      reason: null,
    });
    return true;
  };

  const fillSell = (
    h: Holding,
    s: number,
    price: number,
    signalSession: number,
    reason: ExitReason,
    concurrent: readonly ExitReason[],
    qtyRequested: number | null,
  ): void => {
    const qty = Math.min(qtyRequested ?? h.qty, h.qty);
    const full = qty === h.qty;
    const proceeds = qty * price * (1 - opt.fee_sell);
    const costPart = full ? h.cost : (h.cost * qty) / h.qty;
    const pnl = proceeds - costPart;
    cash += proceeds;
    const trade: SystemTrade = {
      number: trades.length + 1,
      symbol: h.symbol,
      qty,
      entry_date: h.date,
      entry_signal_date: h.signal_date,
      entry_price: h.price,
      exit_date: dateOf(s),
      exit_signal_date: dateOf(signalSession),
      exit_price: price,
      hold: s - h.index,
      pnl,
      pnl_pct: (pnl / costPart) * 100,
      exit_reason: reason,
      partial: !full,
    };
    if (concurrent.length > 1) trade.concurrent_reasons = [...concurrent];
    trades.push(trade);
    if (full) {
      holdings.delete(h.symbol);
      lastExitSession.set(h.symbol, s);
    } else {
      h.qty -= qty;
      h.cost -= costPart;
    }
    log({
      date: dateOf(s),
      session: s,
      symbol: h.symbol,
      kind: 'order_filled',
      side: 'sell',
      qty,
      price,
      amount: qty * price,
      fee: qty * price - proceeds,
      reason,
      ...(concurrent.length > 1 ? { concurrent_reasons: [...concurrent] } : {}),
    });
  };

  const decideExit = (
    h: Holding,
    s: number,
    bar: Bar,
    signalSession: number,
    reason: ExitReason,
    concurrent: readonly ExitReason[],
    qty: number | null,
    tradedToday: Set<string>,
  ): void => {
    if (opt.execution === 'same_close') {
      fillSell(h, s, bar.close, signalSession, reason, concurrent, qty);
      tradedToday.add(h.symbol);
      return;
    }
    pending.set(h.symbol, {
      order: qty === null ? 'sell' : 'trim',
      symbol: h.symbol,
      signal_session: signalSession,
      qty,
      reason,
      concurrent: [...concurrent],
    });
    log({
      date: dateOf(s),
      session: s,
      symbol: h.symbol,
      kind: 'order_placed',
      side: 'sell',
      qty,
      price: null,
      amount: null,
      fee: null,
      reason,
      ...(concurrent.length > 1 ? { concurrent_reasons: [...concurrent] } : {}),
    });
  };

  const cancelPendingBuys = (s: number, reason: string): void => {
    for (const [symbol, order] of [...pending.entries()]) {
      if (order.order !== 'buy') continue;
      pending.delete(symbol);
      log({
        date: dateOf(s),
        session: s,
        symbol,
        kind: 'order_canceled',
        side: 'buy',
        qty: null,
        price: null,
        amount: order.budget,
        fee: null,
        reason,
      });
    }
  };

  const dailyReturns = (state: SymbolState, s: number, lookback: number): number[] | null => {
    const out: number[] = [];
    for (let k = s - lookback + 1; k <= s; k++) {
      const now = barOf(state, k);
      const before = barOf(state, k - 1);
      if (!now || !before) return null;
      out.push(now.bar.close / before.bar.close - 1);
    }
    return out;
  };
  const correlationOk = (candidate: SymbolState, s: number): boolean => {
    if (maxCorrelation === null || correlationLookback === null) return true;
    const others = [
      ...holdings.keys(),
      ...[...pending.values()].filter((o) => o.order === 'buy').map((o) => o.symbol),
    ];
    if (!others.length) return true;
    const mine = dailyReturns(candidate, s, correlationLookback);
    for (const symbol of others) {
      const other = stateOf.get(symbol);
      const theirs = other ? dailyReturns(other, s, correlationLookback) : null;
      const rho = mine && theirs ? pearson(mine, theirs) : null;
      // Unknown correlation (short sample / zero variance) does not pass the filter.
      if (rho === null || rho > maxCorrelation) return false;
    }
    return true;
  };

  const exitConditions = (h: Holding, state: SymbolState, s: number, bar: Bar, j: number) => {
    const stopLevel = stopPct === null ? null : h.price * (1 - stopPct / 100);
    const trailLevel = trailPct === null ? null : h.peak * (1 - trailPct / 100);
    const targetLevel = takePct === null ? null : h.price * (1 + takePct / 100);
    const hits: Record<ExitReason, boolean> = {
      stop_loss: stopLevel !== null && bar.low <= stopLevel,
      trailing_stop: trailLevel !== null && bar.low <= trailLevel,
      take_profit: targetLevel !== null && bar.high >= targetLevel,
      portfolio_drawdown: halted,
      max_holding: maxHolding !== null && s - h.index >= maxHolding,
      sell_consensus: state.sell[j] === true,
      rebalance: false,
    };
    return { stopLevel, trailLevel, targetLevel, hits };
  };
  const listHits = (hits: Record<ExitReason, boolean>): ExitReason[] =>
    EXIT_PRIORITY.filter((r) => hits[r]);

  const marketAt = (s: number): number | null => {
    for (const state of states) {
      const found = barOf(state, s);
      if (found && isFiniteNumber(found.bar.market)) return found.bar.market;
    }
    return null;
  };
  const marketBase = marketAt(firstSession);
  const firstCloses = new Map<string, number>();
  const lastCloses = new Map<string, number>();

  for (const [r, s] of use.entries()) {
    const date = dateOf(s);
    const tradedToday = new Set<string>();

    // 1. Corporate actions (supplied only for unadjusted series).
    for (const action of actionsByDate.get(date) ?? []) {
      const h = holdings.get(action.symbol);
      if (!h) continue;
      if (action.kind === 'cash_dividend') {
        const amount = h.qty * action.cash_per_share;
        cash += amount;
        log({
          date,
          session: s,
          symbol: h.symbol,
          kind: 'corporate_action',
          side: null,
          qty: h.qty,
          price: action.cash_per_share,
          amount,
          fee: null,
          reason: 'cash_dividend',
        });
      } else {
        const qty = Math.floor(h.qty * action.ratio);
        h.qty = qty;
        h.price /= action.ratio;
        h.peak /= action.ratio;
        h.last_price /= action.ratio;
        log({
          date,
          session: s,
          symbol: h.symbol,
          kind: 'corporate_action',
          side: null,
          qty,
          price: null,
          amount: null,
          fee: null,
          reason: 'stock_split',
        });
      }
    }

    // 2. Tradability: a symbol trades only on sessions where it has a bar.
    const today = new Map<string, { bar: Bar; j: number }>();
    for (const state of states) {
      const found = barOf(state, s);
      if (found) today.set(state.symbol, found);
    }

    // 3. Pending orders at the open: sells/trims first, then buys in ranking order.
    const pendingNow = [...pending.values()].filter((o) => today.has(o.symbol));
    const ordered = [
      ...pendingNow.filter((o) => o.order !== 'buy').sort((a, b) => (a.symbol < b.symbol ? -1 : 1)),
      ...pendingNow.filter((o) => o.order === 'buy'),
    ];
    for (const order of ordered) {
      const found = today.get(order.symbol);
      if (!found) continue;
      pending.delete(order.symbol);
      if (order.order === 'buy') {
        if (fillBuy(order.symbol, s, found.bar.open, order.signal_session, order.budget))
          tradedToday.add(order.symbol);
        continue;
      }
      const h = holdings.get(order.symbol);
      if (h && s - h.index >= opt.min_held_bars) {
        fillSell(
          h,
          s,
          found.bar.open,
          order.signal_session,
          order.reason,
          order.concurrent,
          order.qty,
        );
        tradedToday.add(order.symbol);
      }
    }

    // 4a. Intrabar protective exits on resting levels.
    const exitCandidates = (): Array<{ h: Holding; state: SymbolState; bar: Bar; j: number }> =>
      [...holdings.values()]
        .sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
        .flatMap((h) => {
          const found = today.get(h.symbol);
          const state = stateOf.get(h.symbol);
          if (!found || !state || tradedToday.has(h.symbol) || pending.has(h.symbol)) return [];
          if (s - h.index < opt.min_held_bars) return [];
          return [{ h, state, bar: found.bar, j: found.j }];
        });
    for (const { h, state, bar, j } of exitCandidates()) {
      const { stopLevel, trailLevel, targetLevel, hits } = exitConditions(h, state, s, bar, j);
      const protective =
        stopLevel === null
          ? trailLevel
          : trailLevel === null
            ? stopLevel
            : Math.max(stopLevel, trailLevel);
      const protectiveReason: ExitReason =
        stopLevel !== null && (trailLevel === null || stopLevel >= trailLevel)
          ? 'stop_loss'
          : 'trailing_stop';
      let fill: { price: number; reason: ExitReason } | null = null;
      if (protective !== null && bar.open <= protective)
        fill = { price: bar.open, reason: protectiveReason };
      else if (targetLevel !== null && bar.open >= targetLevel)
        fill = { price: bar.open, reason: 'take_profit' };
      else if (protective !== null && bar.low <= protective)
        fill = { price: protective, reason: protectiveReason };
      else if (targetLevel !== null && bar.high >= targetLevel)
        fill = { price: targetLevel, reason: 'take_profit' };
      if (fill) {
        fillSell(h, s, fill.price, s, fill.reason, listHits(hits), null);
        tradedToday.add(h.symbol);
      }
    }

    // 4b. Portfolio drawdown stop on the shared NAV at this close.
    for (const [symbol, found] of today) {
      const h = holdings.get(symbol);
      if (h) h.last_price = found.bar.close;
    }
    if (drawdownStop !== null && !halted) {
      const nav = navNow();
      const drawdown = nav / Math.max(peakNav, nav) - 1;
      if (drawdown * 100 <= -drawdownStop) {
        halted = true;
        log({
          date,
          session: s,
          symbol: null,
          kind: 'halt',
          side: null,
          qty: null,
          price: null,
          amount: nav,
          fee: null,
          reason: 'portfolio_drawdown',
        });
        cancelPendingBuys(s, 'portfolio_drawdown');
      }
    }

    // 4c. Close-based exits: drawdown liquidation, max holding, Sell consensus.
    for (const { h, state, bar, j } of exitCandidates()) {
      const { hits } = exitConditions(h, state, s, bar, j);
      const reasons = listHits(hits);
      const primary = reasons.find(
        (x) => x === 'portfolio_drawdown' || x === 'max_holding' || x === 'sell_consensus',
      );
      if (primary) decideExit(h, s, bar, s, primary, reasons, null, tradedToday);
    }

    // 4d. Rebalancing trims toward the target weight (trim only, lot-rounded).
    if (rebalanceEvery !== null && rebalanceTarget !== null && r > 0 && r % rebalanceEvery === 0) {
      for (const { h, bar } of exitCandidates()) {
        const nav = navNow();
        const value = h.qty * bar.close;
        const excess = value - (rebalanceTarget / 100) * nav;
        if (excess <= 0) continue;
        const lots = Math.ceil(excess / (bar.close * opt.lot) - 1e-9);
        const qty = Math.min(h.qty, lots * opt.lot);
        if (qty <= 0) continue;
        decideExit(
          h,
          s,
          bar,
          s,
          'rebalance',
          ['rebalance'],
          qty === h.qty ? null : qty,
          tradedToday,
        );
      }
    }

    // 5. Universe & candidates.
    const candidates = halted
      ? []
      : states.filter((state) => {
          const found = today.get(state.symbol);
          if (
            !found ||
            holdings.has(state.symbol) ||
            pending.has(state.symbol) ||
            tradedToday.has(state.symbol)
          )
            return false;
          if (!inUniverse(state.symbol, date)) return false;
          const exitedAt = lastExitSession.get(state.symbol);
          if (exitedAt !== undefined && s <= exitedAt + (cooldown ?? 0)) return false;
          return state.buy[found.j] === true;
        });

    // 6. Ranking: missing scores excluded; ties by symbol ascending (states are symbol-sorted).
    let ranked = candidates;
    if (ranking) {
      const scored = candidates.flatMap((state) => {
        const j = today.get(state.symbol)?.j;
        const score = j === undefined ? null : (state.score?.[j] ?? null);
        return isFiniteNumber(score) ? [{ state, score }] : [];
      });
      scored.sort((a, b) =>
        a.score === b.score
          ? a.state.symbol < b.state.symbol
            ? -1
            : 1
          : ranking.direction === 'desc'
            ? b.score - a.score
            : a.score - b.score,
      );
      ranked = scored.map((x) => x.state);
    }

    // 7. Budget and caps → new orders.
    const skip = (symbol: string, reason: string): void =>
      log({
        date,
        session: s,
        symbol,
        kind: 'candidate_skipped',
        side: 'buy',
        qty: null,
        price: null,
        amount: null,
        fee: null,
        reason,
      });
    for (const state of ranked) {
      const found = today.get(state.symbol);
      if (!found) continue;
      const pendingBuys = [...pending.values()].filter((o) => o.order === 'buy').length;
      if (maxPositions !== null && holdings.size + pendingBuys >= maxPositions) {
        skip(state.symbol, 'max_positions');
        continue;
      }
      if (!correlationOk(state, s)) {
        skip(state.symbol, 'correlation');
        continue;
      }
      const nav = navNow();
      const available = cash - reservedCash();
      let budget =
        sizing.mode === 'pct_nav'
          ? Math.min((sizing.pct / 100) * nav, available)
          : sizing.mode === 'fixed_amount'
            ? Math.min(sizing.amount_vnd, available)
            : available;
      if (budget <= 0) {
        skip(state.symbol, 'insufficient_cash');
        continue;
      }
      if (symbolCap !== null) budget = Math.min(budget, (symbolCap / 100) * nav);
      if (sectorCap !== null) {
        let used = 0;
        for (const h of holdings.values()) {
          if (stateOf.get(h.symbol)?.sectorKey === state.sectorKey) used += h.qty * h.last_price;
        }
        for (const o of pending.values()) {
          if (o.order === 'buy' && stateOf.get(o.symbol)?.sectorKey === state.sectorKey)
            used += o.budget;
        }
        const room = (sectorCap / 100) * nav - used;
        if (room <= 0) {
          skip(state.symbol, 'sector_cap');
          continue;
        }
        budget = Math.min(budget, room);
      }
      if (opt.execution === 'same_close') {
        if (fillBuy(state.symbol, s, found.bar.close, s, budget)) tradedToday.add(state.symbol);
      } else {
        pending.set(state.symbol, {
          order: 'buy',
          symbol: state.symbol,
          signal_session: s,
          budget,
        });
        log({
          date,
          session: s,
          symbol: state.symbol,
          kind: 'order_placed',
          side: 'buy',
          qty: null,
          price: null,
          amount: budget,
          fee: null,
          reason: null,
        });
      }
    }

    // 8. Valuation at the close.
    for (const [symbol, found] of today) {
      if (!firstCloses.has(symbol)) firstCloses.set(symbol, found.bar.close);
      lastCloses.set(symbol, found.bar.close);
      const h = holdings.get(symbol);
      if (h) {
        h.last_price = found.bar.close;
        h.peak = Math.max(h.peak, found.bar.close);
      }
    }
    const value = navNow();
    peakNav = Math.max(peakNav, value);
    maxDrawdown = Math.min(maxDrawdown, value / peakNav - 1);
    const buyHold =
      sum(
        states.map((state) => {
          const first = firstCloses.get(state.symbol);
          const last = lastCloses.get(state.symbol);
          return first !== undefined && last !== undefined ? (last / first - 1) * 100 : 0;
        }),
      ) / states.length;
    const market = marketAt(s);
    curve.push({
      date,
      value,
      return_pct: (value / opt.capital - 1) * 100,
      buy_hold_pct: buyHold,
      market_pct:
        isFiniteNumber(market) && isFiniteNumber(marketBase) && marketBase > 0
          ? (market / marketBase - 1) * 100
          : null,
    });
  }

  for (const order of pending.values()) {
    canceled.push({
      reason: 'end_of_range',
      action: order.order === 'buy' ? 'buy' : 'sell',
      signalIndex: order.signal_session,
      symbol: order.symbol,
      order: order.order,
    });
  }
  pending.clear();

  const terminal = curve[curve.length - 1];
  if (terminal === undefined)
    throw new EngineRunError('EMPTY_RANGE', 'Khoảng kiểm thử không có dữ liệu.');
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0);
  const tradesBySymbol: Record<string, SystemTrade[]> = {};
  for (const state of states)
    tradesBySymbol[state.symbol] = trades.filter((t) => t.symbol === state.symbol);

  const profile: SystemProfile = {
    long_only: true,
    execution: opt.execution,
    lot_size: opt.lot,
    min_held_bars: opt.min_held_bars,
    position_size: sizing.mode,
    position_pct: sizing.mode === 'pct_nav' ? sizing.pct : null,
    position_amount_vnd: sizing.mode === 'fixed_amount' ? sizing.amount_vnd : null,
    max_positions: maxPositions,
    cooldown_bars: cooldown,
    priority: 'exit_first',
    exit_priority: EXIT_PRIORITY,
    intrabar_policy: 'open_gap_first_then_stop_before_target',
    stop_loss_pct: stopPct,
    take_profit_pct: takePct,
    trailing_pct: trailPct,
    trailing_source: 'close',
    max_holding: maxHolding,
    ranking: ranking ? { ...ranking, tie_break: 'symbol_asc', missing: 'excluded' } : null,
    logic,
    max_symbol_weight_pct: symbolCap,
    max_sector_weight_pct: sectorCap,
    max_correlation: maxCorrelation,
    correlation_lookback: correlationLookback,
    rebalance_every_bars: rebalanceEvery,
    rebalance_target_pct: rebalanceTarget,
    portfolio_drawdown_stop_pct: drawdownStop,
    caps_apply_to: 'new_buys',
    universe_policy: 'restricts_new_buys_only',
    buy_hold_basis: 'equal_weight_price_return',
  };

  return {
    schema_version: SCHEMA_VERSION,
    engine_version: ENGINE_VERSION,
    calculation_version: CALCULATION_VERSION,
    rule_version: RULE_VERSION,
    formula_version: FORMULA_VERSION,
    profile,
    snapshot: {
      config,
      options: jsonCopy(opt),
      system,
      symbols: states.map((state) => ({
        symbol: state.symbol,
        sector: state.sector,
        bar_count: state.bars.length,
      })),
      universe: input.universe ? jsonCopy(input.universe) : null,
      corporate_actions: jsonCopy(input.corporate_actions ?? []),
      actual_start: dateOf(firstSession),
      actual_end: dateOf(lastSession),
      bar_count: use.length,
    },
    initial: {
      date: dateOf(firstSession),
      value: opt.capital,
      return_pct: 0,
      buy_hold_pct: 0,
      market_pct: isFiniteNumber(marketBase) ? 0 : null,
      phase: 'before_first_execution',
    },
    curve,
    trades,
    trades_by_symbol: tradesBySymbol,
    positions_open: [...holdings.values()]
      .sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
      .map((h) => ({
        symbol: h.symbol,
        sector: stateOf.get(h.symbol)?.sector ?? null,
        qty: h.qty,
        price: h.price,
        cost: h.cost,
        index: h.index,
        date: h.date,
        signal_date: h.signal_date,
        last_price: h.last_price,
        market_value: h.qty * h.last_price,
        unrealized_pnl: h.qty * h.last_price - h.cost,
        peak_close: h.peak,
      })),
    cash,
    canceled,
    ledger,
    ledger_size: ledger.length,
    kpis: {
      net_return: terminal.return_pct,
      cagr: (Math.pow(terminal.value / opt.capital, 252 / use.length) - 1) * 100,
      max_drawdown: maxDrawdown * 100,
      n_trades: trades.length,
      n_wins: wins,
      win_rate: trades.length ? (wins / trades.length) * 100 : null,
      buy_hold_return: terminal.buy_hold_pct,
      market_return: terminal.market_pct,
      profit_factor: losses.length
        ? sum(trades.filter((t) => t.pnl > 0).map((t) => t.pnl)) / -sum(losses.map((t) => t.pnl))
        : null,
    },
    applied: systemCapabilities(system, states.length, input.universe !== undefined),
  };
}

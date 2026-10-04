import { validateConfig } from './config.js';
import { EngineRunError } from './errors.js';
import { isFiniteNumber, validBar } from './indicators.js';
import { sideSignals } from './signals.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import {
  CALCULATION_VERSION,
  CLEAN_TECH_2_0,
  ENGINE_VERSION,
  FORMULA_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  type Bar,
  type CanceledOrder,
  type ClosedTrade,
  type CurvePoint,
  type RegistryEntry,
  type RunOptions,
  type RunResult,
  type SharedConfig,
  type Side,
} from './types.js';

export const DEFAULT_RUN_OPTIONS = Object.freeze({
  capital: 100_000_000,
  fee_buy: 0.0015,
  fee_sell: 0.0025,
  lot: 100,
  execution: 'next_open',
  min_held_bars: 2,
} as const);

type Position = {
  qty: number;
  price: number;
  cost: number;
  index: number;
  date: string;
  signal_date: string;
};

type PendingOrder = { action: Side; signalIndex: number };

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sum = (values: readonly number[]): number => values.reduce((s, x) => s + x, 0);

function resolveOptions(bars: readonly Bar[], options: Partial<RunOptions>): RunOptions {
  return {
    capital: options.capital ?? DEFAULT_RUN_OPTIONS.capital,
    fee_buy: options.fee_buy ?? DEFAULT_RUN_OPTIONS.fee_buy,
    fee_sell: options.fee_sell ?? DEFAULT_RUN_OPTIONS.fee_sell,
    lot: options.lot ?? DEFAULT_RUN_OPTIONS.lot,
    execution: options.execution ?? DEFAULT_RUN_OPTIONS.execution,
    min_held_bars: options.min_held_bars ?? DEFAULT_RUN_OPTIONS.min_held_bars,
    start: options.start ?? bars[0]?.date ?? '',
    end: options.end ?? bars[bars.length - 1]?.date ?? '',
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

/**
 * Single-symbol long-only backtest under the CLEAN_TECH_2.0 profile — a port
 * of the reference engine `run`. All-cash sizing rounded down to the lot, no
 * stop/take-profit/max-holding/trailing, sell only after `min_held_bars`, no
 * same-bar re-entry, no forced exit at the end (open position is reported),
 * pending next-open orders at the end are canceled. Full curve and trades.
 *
 * @throws EngineRunError (CONFIG_INVALID | BUY_RULES_REQUIRED | INVALID_OPTIONS | INVALID_BARS | EMPTY_RANGE)
 */
export function runBacktest(
  config: SharedConfig,
  bars: readonly Bar[],
  options: Partial<RunOptions> = {},
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): RunResult {
  const errors = validateConfig(config, registry);
  if (errors.length) {
    throw new EngineRunError('CONFIG_INVALID', errors.map((e) => e.message).join('\n'), errors);
  }
  const hasBuy = registry.some((entry) => {
    const item = config.indicators[entry.id];
    return item?.master_enabled === true && item.buy.enabled;
  });
  if (!hasBuy) throw new EngineRunError('BUY_RULES_REQUIRED', 'Cần ít nhất một điều kiện Mua.');

  const opt = resolveOptions(bars, options);
  if (!optionsAreValid(opt)) throw new EngineRunError('INVALID_OPTIONS', 'Giả định không hợp lệ.');
  const barsAreValid =
    bars.length > 0 &&
    bars.every((bar, i) => {
      const previous = bars[i - 1];
      return validBar(bar) && (previous === undefined || bar.date > previous.date);
    });
  if (!barsAreValid) {
    throw new EngineRunError('INVALID_BARS', 'Dữ liệu phải tăng dần, duy nhất và hợp lệ.');
  }
  const use: number[] = [];
  bars.forEach((bar, i) => {
    if (bar.date >= opt.start && bar.date <= opt.end) use.push(i);
  });
  const barAt = (i: number): Bar => {
    const bar = bars[i];
    if (bar === undefined)
      throw new EngineRunError('INVALID_BARS', 'Dữ liệu phải tăng dần, duy nhất và hợp lệ.');
    return bar;
  };
  const first = use[0];
  const last = use[use.length - 1];
  if (first === undefined || last === undefined) {
    throw new EngineRunError('EMPTY_RANGE', 'Khoảng kiểm thử không có dữ liệu.');
  }

  // Signals are computed on the full series so warmup before `start` is available.
  const buy = sideSignals(config, bars, 'buy', registry);
  const sell = sideSignals(config, bars, 'sell', registry);

  const ledger: { cash: number; pos: Position | null } = { cash: opt.capital, pos: null };
  const trades: ClosedTrade[] = [];
  const curve: CurvePoint[] = [];
  const canceled: CanceledOrder[] = [];
  let pending: PendingOrder | null = null;
  let peak = opt.capital;
  let maxDrawdown = 0;
  const firstBar = barAt(first);
  const lastBar = barAt(last);
  const base = firstBar.close;
  const marketBase = firstBar.market;

  const execute = (action: Side, i: number, price: number, signalIndex: number): boolean => {
    const pos = ledger.pos;
    if (action === 'buy' && !pos) {
      const qty = Math.floor(ledger.cash / (price * (1 + opt.fee_buy) * opt.lot)) * opt.lot;
      if (qty < opt.lot) return false;
      const cost = qty * price * (1 + opt.fee_buy);
      ledger.cash -= cost;
      ledger.pos = {
        qty,
        price,
        cost,
        index: i,
        date: barAt(i).date,
        signal_date: barAt(signalIndex).date,
      };
      return true;
    }
    if (action === 'sell' && pos && i - pos.index >= opt.min_held_bars) {
      const proceeds = pos.qty * price * (1 - opt.fee_sell);
      const pnl = proceeds - pos.cost;
      ledger.cash += proceeds;
      trades.push({
        number: trades.length + 1,
        qty: pos.qty,
        entry_date: pos.date,
        entry_signal_date: pos.signal_date,
        entry_price: pos.price,
        exit_date: barAt(i).date,
        exit_signal_date: barAt(signalIndex).date,
        exit_price: price,
        hold: i - pos.index,
        pnl,
        pnl_pct: (pnl / pos.cost) * 100,
        exit_reason: 'sell_consensus',
      });
      ledger.pos = null;
      return true;
    }
    return false;
  };

  for (const i of use) {
    const bar = barAt(i);
    let traded = false;
    if (pending) {
      traded = execute(pending.action, i, bar.open, pending.signalIndex);
      pending = null;
    }
    if (!traded) {
      const pos = ledger.pos;
      const action: Side | null = pos
        ? sell[i] === true && i - pos.index >= opt.min_held_bars
          ? 'sell'
          : null
        : buy[i] === true
          ? 'buy'
          : null;
      if (action) {
        if (opt.execution === 'same_close') execute(action, i, bar.close, i);
        else pending = { action, signalIndex: i };
      }
    }
    const value = ledger.cash + (ledger.pos ? ledger.pos.qty * bar.close : 0);
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    curve.push({
      date: bar.date,
      value,
      return_pct: (value / opt.capital - 1) * 100,
      buy_hold_pct: (bar.close / base - 1) * 100,
      market_pct:
        isFiniteNumber(bar.market) && isFiniteNumber(marketBase) && marketBase > 0
          ? (bar.market / marketBase - 1) * 100
          : null,
    });
  }
  if (pending) canceled.push({ reason: 'end_of_range', ...pending });

  const terminal = curve[curve.length - 1];
  if (terminal === undefined)
    throw new EngineRunError('EMPTY_RANGE', 'Khoảng kiểm thử không có dữ liệu.');
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0);
  const pos = ledger.pos;
  return {
    schema_version: SCHEMA_VERSION,
    engine_version: ENGINE_VERSION,
    calculation_version: CALCULATION_VERSION,
    rule_version: RULE_VERSION,
    formula_version: FORMULA_VERSION,
    profile: { ...CLEAN_TECH_2_0, lot_size: opt.lot, min_held_bars: opt.min_held_bars },
    snapshot: {
      config: jsonCopy(config),
      options: jsonCopy(opt),
      actual_start: firstBar.date,
      actual_end: lastBar.date,
      bar_count: use.length,
    },
    initial: {
      date: firstBar.date,
      value: opt.capital,
      return_pct: 0,
      buy_hold_pct: 0,
      market_pct: isFiniteNumber(marketBase) ? 0 : null,
      phase: 'before_first_execution',
    },
    curve,
    trades,
    open_position: pos
      ? {
          ...jsonCopy(pos),
          last_price: lastBar.close,
          market_value: pos.qty * lastBar.close,
          unrealized_pnl: pos.qty * lastBar.close - pos.cost,
        }
      : null,
    cash: ledger.cash,
    canceled,
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
  };
}

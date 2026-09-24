import { displayName } from './catalog.js';
import {
  evalConditionSeries,
  evaluateSeries,
  type Combination,
  type Condition,
} from './conditions.js';
import type { NumericFrame, Ohlcv } from './indicators.js';

export const LOT_SIZE = 100;
export const TRADING_DAYS = 252;
export type RiskConfig = {
  stop_loss: 'none' | 'atr' | 'fixed';
  stop_atr_mult: number;
  stop_fixed_pct: number;
  take_profit_pct: number | null;
  max_holding: number | null;
  position_size: 'all' | 'half' | 'quarter' | 'tenth' | 'fixed';
  position_fixed_amount: number;
  fee_buy: number;
  fee_sell: number;
};
export type BacktestKpis = {
  cagr: number | null;
  sharpe: number | null;
  sharpe_ci: [number | null, number | null];
  max_drawdown: number | null;
  dd_recovery_sessions: number | null;
  win_rate: number | null;
  n_trades: number;
  n_wins: number;
  avg_hold: number | null;
  net_return: number | null;
  buy_hold_return: number | null;
  n_sessions: number;
};
export type BacktestResult = {
  kpis: BacktestKpis;
  equity_curve: EquityPoint[];
  trades: TradeOutput[];
};
export type EquityPoint = { date: string; strategy: number; buy_hold: number; vnindex?: number };
export type TradeOutput = {
  idx: number;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  hold: number;
  pnl_pct: number;
  trigger: string;
  entry_trigger: string;
};
type Position = {
  entryIndex: number;
  entryPrice: number;
  shares: number;
  stop: number | null;
  take: number | null;
  entryTrigger: string;
};
type Trade = Omit<TradeOutput, 'idx' | 'entry_price' | 'exit_price' | 'pnl_pct'> & {
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
};

const POSITION_FRACTIONS: Record<Exclude<RiskConfig['position_size'], 'fixed'>, number> = {
  all: 1,
  half: 0.5,
  quarter: 0.25,
  tenth: 0.1,
};
const round = (value: number, decimals: number): number => Number(value.toFixed(decimals));

export function sharesFor(cash: number, price: number, risk: RiskConfig): number {
  if (price <= 0) return 0;
  const budget =
    risk.position_size === 'fixed'
      ? Math.min(risk.position_fixed_amount, cash)
      : cash * POSITION_FRACTIONS[risk.position_size];
  return Math.floor(budget / (price * (1 + risk.fee_buy) * LOT_SIZE)) * LOT_SIZE;
}

function formatConditions(conditions: readonly Condition[]): string {
  return conditions
    .map((condition) =>
      condition.op === 'is_true'
        ? displayName(condition.indicator)
        : `${displayName(condition.indicator)} ${condition.op} ${String(condition.value)}`,
    )
    .join(' + ');
}

function matchedConditions(
  frame: NumericFrame,
  combination: Combination,
  index: number,
): Condition[] {
  return combination.conditions.filter(
    (condition) => evalConditionSeries(frame, condition)[index] === 1,
  );
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function sampleStd(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
}

function percentile(values: readonly number[], percent: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (percent / 100) * (sorted.length - 1);
  const lower = Math.floor(position),
    fraction = position - lower;
  return (
    sorted[lower]! + (sorted[Math.min(lower + 1, sorted.length - 1)]! - sorted[lower]!) * fraction
  );
}

export function sharpeWithConfidence(
  dailyReturns: readonly number[],
): [number | null, number | null, number | null] {
  const returns = dailyReturns.filter(Number.isFinite);
  const standardDeviation = sampleStd(returns);
  if (returns.length < 5 || standardDeviation === 0 || Number.isNaN(standardDeviation))
    return [null, null, null];
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const sharpe = (mean / standardDeviation) * Math.sqrt(TRADING_DAYS);
  const random = seededRandom(42);
  const bootstrap: number[] = [];
  for (let run = 0; run < 500; run += 1) {
    const sample = Array.from(
      { length: returns.length },
      () => returns[Math.floor(random() * returns.length)]!,
    );
    const deviation = sampleStd(sample);
    if (deviation > 0)
      bootstrap.push(
        (sample.reduce((sum, value) => sum + value, 0) / sample.length / deviation) *
          Math.sqrt(TRADING_DAYS),
      );
  }
  return bootstrap.length
    ? [sharpe, percentile(bootstrap, 2.5), percentile(bootstrap, 97.5)]
    : [sharpe, null, null];
}

export function maxDrawdown(equity: readonly number[]): [number, number | null] {
  if (equity.length === 0) return [0, null];
  let peak = equity[0]!,
    max = 0,
    troughIndex = 0,
    peakAtTrough = peak;
  for (let index = 0; index < equity.length; index += 1) {
    if (equity[index]! > peak) peak = equity[index]!;
    const drawdown = equity[index]! / peak - 1;
    if (drawdown < max) {
      max = drawdown;
      troughIndex = index;
      peakAtTrough = peak;
    }
  }
  if (max === 0) return [0, null];
  for (let index = troughIndex + 1; index < equity.length; index += 1)
    if (equity[index]! >= peakAtTrough) return [max, index - troughIndex];
  return [max, equity.length - 1 - troughIndex];
}

export function emptyKpis(): BacktestKpis {
  return {
    cagr: null,
    sharpe: null,
    sharpe_ci: [null, null],
    max_drawdown: null,
    dd_recovery_sessions: null,
    win_rate: null,
    n_trades: 0,
    n_wins: 0,
    avg_hold: null,
    net_return: null,
    buy_hold_return: null,
    n_sessions: 0,
  };
}

function stopPrice(
  entry: number,
  frame: NumericFrame,
  index: number,
  risk: RiskConfig,
): number | null {
  if (risk.stop_loss === 'none') return null;
  if (risk.stop_loss === 'fixed') return entry * (1 - risk.stop_fixed_pct);
  const value = frame.atr_14?.[index];
  return value === undefined || Number.isNaN(value) ? null : entry - risk.stop_atr_mult * value;
}

function checkExit(
  position: Position,
  frame: NumericFrame,
  sell: Combination,
  sellSignal: Uint8Array,
  barOpen: number,
  barHigh: number,
  barLow: number,
  close: number,
  held: number,
  risk: RiskConfig,
  index: number,
): [string | null, number] {
  // Daily-bar execution contract: gaps execute at open; otherwise stop has
  // priority over target when both thresholds are touched in the same bar.
  if (position.stop != null && barOpen <= position.stop) return ['Cắt lỗ', barOpen];
  if (position.take != null && barOpen >= position.take) return ['Chốt lời', barOpen];
  if (position.stop != null && barLow <= position.stop) return ['Cắt lỗ', position.stop];
  if (position.take != null && barHigh >= position.take) return ['Chốt lời', position.take];
  if (risk.max_holding != null && held >= risk.max_holding) return ['Hết thời gian giữ', close];
  if (sell.conditions.length && sellSignal[index] === 1) {
    const matched = matchedConditions(frame, sell, index);
    return [matched.length ? formatConditions(matched) : 'Tín hiệu bán', close];
  }
  return [null, close];
}

function computeKpis(
  equity: readonly number[],
  capital: number,
  trades: readonly Trade[],
  close: Float64Array,
  startIndex: number,
): BacktestKpis {
  if (!equity.length) return emptyKpis();
  const final = equity[equity.length - 1]!,
    net = final / capital - 1;
  const years = Math.max(equity.length / TRADING_DAYS, 1e-9);
  const cagr = final > 0 ? (final / capital) ** (1 / years) - 1 : -1;
  const returns = equity.slice(1).map((value, index) => value / equity[index]! - 1);
  const [sharpe, low, high] = sharpeWithConfidence(returns);
  const [drawdown, recovery] = maxDrawdown(equity);
  const wins = trades.filter((trade) => trade.pnlPct > 0).length;
  const averageHold = trades.length
    ? trades.reduce((sum, trade) => sum + trade.hold, 0) / trades.length
    : null;
  return {
    cagr: round(cagr, 4),
    sharpe: sharpe == null ? null : round(sharpe, 3),
    sharpe_ci: [low == null ? null : round(low, 3), high == null ? null : round(high, 3)],
    max_drawdown: round(drawdown, 4),
    dd_recovery_sessions: recovery,
    win_rate: trades.length ? round(wins / trades.length, 4) : null,
    n_trades: trades.length,
    n_wins: wins,
    avg_hold: averageHold == null ? null : round(averageHold, 1),
    net_return: round(net, 4),
    buy_hold_return: round(close[close.length - 1]! / close[startIndex]! - 1, 4),
    n_sessions: equity.length,
  };
}

export function runBacktest(
  data: Ohlcv,
  frame: NumericFrame,
  buy: Combination,
  sell: Combination,
  risk: RiskConfig,
  capital: number,
  startIndex: number,
): BacktestResult {
  const firstIndex = Math.max(startIndex, 0);
  if (firstIndex >= data.close.length) return { kpis: emptyKpis(), equity_curve: [], trades: [] };
  const buySignal = evaluateSeries(frame, buy),
    sellSignal = sell.conditions.length
      ? evaluateSeries(frame, sell)
      : new Uint8Array(data.close.length);
  let cash = capital,
    position: Position | null = null;
  const trades: Trade[] = [],
    equity: number[] = [];
  const baseClose = data.close[firstIndex]!;
  for (let index = firstIndex; index < data.close.length; index += 1) {
    const price = data.close[index]!;
    if (!position && buySignal[index] === 1) {
      const shares = sharesFor(cash, price, risk);
      if (shares > 0) {
        cash -= shares * price * (1 + risk.fee_buy);
        position = {
          entryIndex: index,
          entryPrice: price,
          shares,
          stop: stopPrice(price, frame, index, risk),
          take: risk.take_profit_pct == null ? null : price * (1 + risk.take_profit_pct),
          entryTrigger: formatConditions(matchedConditions(frame, buy, index)),
        };
      }
    } else if (position) {
      const held = index - position.entryIndex;
      if (held >= 2) {
        const [trigger, exitPrice] = checkExit(
          position,
          frame,
          sell,
          sellSignal,
          data.open[index]!,
          data.high[index]!,
          data.low[index]!,
          price,
          held,
          risk,
          index,
        );
        if (trigger) {
          cash += position.shares * exitPrice * (1 - risk.fee_sell);
          // Trade PnL is net of both sides' fees/tax. This is intentionally
          // different from the raw price return shown by entry/exit prices.
          const entryCost = position.shares * position.entryPrice * (1 + risk.fee_buy);
          const exitProceeds = position.shares * exitPrice * (1 - risk.fee_sell);
          trades.push({
            entry_date: data.time[position.entryIndex]!,
            exit_date: data.time[index]!,
            entryPrice: position.entryPrice,
            exitPrice,
            hold: held,
            pnlPct: exitProceeds / entryCost - 1,
            trigger,
            entry_trigger: position.entryTrigger,
          });
          position = null;
        }
      }
    }
    equity.push(cash + (position ? position.shares * price : 0));
  }
  return {
    kpis: computeKpis(equity, capital, trades, data.close, firstIndex),
    equity_curve: equity.map((value, index) => ({
      date: data.time[firstIndex + index]!,
      strategy: round((value / capital) * 100, 4),
      buy_hold: round((data.close[firstIndex + index]! / baseClose) * 100, 4),
    })),
    trades: trades.map((trade, index) => ({
      idx: index + 1,
      entry_date: trade.entry_date,
      entry_price: round(trade.entryPrice, 2),
      exit_date: trade.exit_date,
      exit_price: round(trade.exitPrice, 2),
      hold: trade.hold,
      pnl_pct: round(trade.pnlPct, 4),
      trigger: trade.trigger,
      entry_trigger: trade.entry_trigger,
    })),
  };
}

export function attachVnIndex(
  curve: EquityPoint[],
  dates: readonly string[],
  closes: readonly number[],
): EquityPoint[] {
  if (!curve.length || !dates.length || !closes.length) return curve;
  const values = new Map<string, number>(
    dates
      .map((date, index) => [date, closes[index]!] as const)
      .filter((entry) => Number.isFinite(entry[1])),
  );
  const base = values.get(curve[0]!.date) ?? closes[0]!;
  let last = base;
  for (const point of curve) {
    last = values.get(point.date) ?? last;
    point.vnindex = round((last / base) * 100, 2);
  }
  return curve;
}

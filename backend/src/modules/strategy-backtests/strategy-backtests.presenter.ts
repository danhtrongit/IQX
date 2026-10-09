import type {
  ClosedTrade,
  Kpis,
  OpenPosition,
  RunResult,
  Side,
  TracedRuleEvaluation,
} from '../quant/v2/index.js';

/**
 * Presentation of a stored (immutable) backtest run for the Strategy page (spec §6.6-§6.8).
 *
 * The stored `result` keeps the engine's native shape (including `kpis.n_trades`) so a run is
 * byte-for-byte what the engine produced. Everything the page needs under the spec names is
 * derived here, at read time, from that frozen record:
 *   - `kpis`: exactly the six KPIs of §6.6 (percentage points, never ratios);
 *   - `counts`: `buy_count`, `closed_trade_count`, `open_position_count`, `pending_order_count`
 *     (never a vague `n_trades` / `trade_count`);
 *   - `chart`: the "Lợi nhuận danh mục (%)" series contract of §6.7;
 *   - `trades`: the full trade history of §6.8 with fees, net cash and condition evidence.
 * Extra engine figures (winning trades, profit factor, market return) are moved out of the KPI
 * block into `supplementary` / the chart series.
 */

export const STRATEGY_BACKTEST_CONTRACT = 'iqx-strategy-backtest-1.0' as const;
export const BACKTEST_CHART_TITLE = 'Lợi nhuận danh mục (%)' as const;
export const ANNUALIZATION_SESSIONS = 252 as const;

export type StrategyKpis = {
  /** NAV_end / capital_initial − 1, in percentage points (12.3 means +12.3%). */
  total_return_pct: number;
  /** (NAV_end / capital_initial)^(252 / n_sessions) − 1, in percentage points. */
  annualized_return_pct: number | null;
  /** Lowest NAV_t / peak_NAV_to_t − 1 (≤ 0), in percentage points; the peak starts at the capital. */
  max_drawdown_pct: number;
  /** Completed buy→sell round trips only (open position and unfilled orders excluded). */
  closed_trade_count: number;
  /** Net-profitable closed trades / closed trades; null while no trade is closed. */
  win_rate_pct: number | null;
  /** Last close / first close of the same range, before fees, dividends and adjustments. */
  buy_hold_return_pct: number;
};

export type ConditionEvidence = {
  indicator_ids: string[];
  rules: TracedRuleEvaluation[];
};

export type TradeEvidence = {
  number: number;
  entry: ConditionEvidence | null;
  exit: ConditionEvidence | null;
};

export type PendingOrderView = {
  action: Side;
  signal_date: string;
  reason: 'end_of_range';
  /** The order had no session left inside the requested range; it is neither filled nor counted. */
  note: string;
  evidence: ConditionEvidence | null;
};

/** Additive evidence computed once when the run is stored (needs the bars, which are not stored). */
export type StrategyRunExtras = {
  contract: typeof STRATEGY_BACKTEST_CONTRACT;
  trade_evidence: TradeEvidence[];
  /** Entry-signal evidence of the position still open at the end of the range. */
  open_position_evidence: ConditionEvidence | null;
  pending_orders: PendingOrderView[];
};

export type ClosedTradeView = ClosedTrade & {
  entry_fee: number;
  /** qty × entry_price + entry_fee (cash leaving the account). */
  entry_total: number;
  /** qty × exit_price. */
  exit_gross: number;
  /** Sell commission and tax as one combined rate (never taxed twice). */
  exit_fee_tax: number;
  /** exit_gross − exit_fee_tax (cash entering the account). */
  exit_net: number;
  outcome: 'win' | 'loss' | 'flat';
  entry_conditions: ConditionEvidence | null;
  exit_conditions: ConditionEvidence | null;
};

export type OpenPositionView = OpenPosition & {
  /** Provisional P/L: market value at the last close − entry_total; the sell fee/tax is not deducted. */
  unrealized_pnl_basis: 'market_value_at_last_close_minus_entry_total_before_sell_costs';
  entry_conditions: ConditionEvidence | null;
};

export type ChartSeriesMeta = {
  id: 'strategy' | 'buy_hold' | 'market';
  label: string;
  /** Property of each `curve` point that carries this series (percentage points). */
  field: 'return_pct' | 'buy_hold_pct' | 'market_pct';
  available: boolean;
  end_value_pct: number | null;
  unavailable_reason: string | null;
};

export type PresentedResult = Omit<RunResult, 'kpis' | 'trades' | 'open_position' | 'snapshot'> & {
  snapshot: RunResult['snapshot'];
  contract: typeof STRATEGY_BACKTEST_CONTRACT;
  kpis: StrategyKpis;
  kpi_basis: Record<string, unknown>;
  counts: {
    buy_count: number;
    closed_trade_count: number;
    open_position_count: number;
    pending_order_count: number;
  };
  supplementary: { winning_trade_count: number; profit_factor: number | null };
  chart: {
    title: typeof BACKTEST_CHART_TITLE;
    unit: 'percent_points';
    /** Chart start: the `initial` point (0% = capital before the first cost). */
    baseline_field: 'initial';
    series: ChartSeriesMeta[];
    point_count: number;
  };
  trades: ClosedTradeView[];
  open_position: OpenPositionView | null;
  pending_orders: PendingOrderView[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Six-KPI view of an engine KPI record. Accepts the stored engine shape (`n_trades`, `cagr`,
 * `net_return`, …) and returns null for anything unreadable instead of inventing zeros.
 */
export function toStrategyKpis(raw: unknown): StrategyKpis | null {
  if (!isRecord(raw)) return null;
  const totalReturn = finiteOrNull(raw.net_return);
  const drawdown = finiteOrNull(raw.max_drawdown);
  const buyHold = finiteOrNull(raw.buy_hold_return);
  const closed = finiteOrNull(raw.n_trades);
  if (totalReturn === null || drawdown === null || buyHold === null || closed === null) return null;
  return {
    total_return_pct: totalReturn,
    annualized_return_pct: finiteOrNull(raw.cagr),
    max_drawdown_pct: drawdown,
    closed_trade_count: closed,
    win_rate_pct: finiteOrNull(raw.win_rate),
    buy_hold_return_pct: buyHold,
  };
}

function tradeView(
  trade: ClosedTrade,
  fees: { buy: number; sell: number },
  evidence: TradeEvidence | undefined,
): ClosedTradeView {
  const entryFee = trade.qty * trade.entry_price * fees.buy;
  const exitGross = trade.qty * trade.exit_price;
  const exitFeeTax = exitGross * fees.sell;
  return {
    ...trade,
    entry_fee: entryFee,
    entry_total: trade.qty * trade.entry_price + entryFee,
    exit_gross: exitGross,
    exit_fee_tax: exitFeeTax,
    exit_net: exitGross - exitFeeTax,
    outcome: trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'flat',
    entry_conditions: evidence?.entry ?? null,
    exit_conditions: evidence?.exit ?? null,
  };
}

function seriesMeta(result: RunResult, symbol: string, benchmarkAvailable: boolean) {
  const last = result.curve[result.curve.length - 1];
  const marketAvailable =
    benchmarkAvailable &&
    result.initial.market_pct !== null &&
    result.curve.some((point) => point.market_pct !== null);
  const series: ChartSeriesMeta[] = [
    {
      id: 'strategy',
      label: 'Danh mục chiến lược',
      field: 'return_pct',
      available: true,
      end_value_pct: last?.return_pct ?? null,
      unavailable_reason: null,
    },
    {
      id: 'buy_hold',
      label: `Mua và giữ ${symbol}`,
      field: 'buy_hold_pct',
      available: true,
      end_value_pct: last?.buy_hold_pct ?? null,
      unavailable_reason: null,
    },
    {
      id: 'market',
      label: 'VN-Index',
      field: 'market_pct',
      available: marketAvailable,
      end_value_pct: marketAvailable ? (last?.market_pct ?? null) : null,
      unavailable_reason: marketAvailable ? null : 'Chưa đủ dữ liệu VN-Index cho khoảng kiểm thử',
    },
  ];
  return series;
}

/**
 * Presents a stored succeeded run. `extras` is absent for runs stored before the Strategy
 * contract (their trades then simply carry no condition evidence).
 */
export function presentRunResult(
  result: RunResult,
  extras: StrategyRunExtras | null | undefined,
): PresentedResult {
  const snapshot = result.snapshot as RunResult['snapshot'] & {
    symbol?: string;
    benchmark?: { available?: boolean };
    fees?: { buy: number; sell: number };
  };
  const fees = snapshot.fees ?? {
    buy: snapshot.options.fee_buy,
    sell: snapshot.options.fee_sell,
  };
  const symbol = snapshot.symbol ?? '';
  const evidenceByNumber = new Map(
    (extras?.trade_evidence ?? []).map((item) => [item.number, item]),
  );
  const trades = result.trades.map((trade) =>
    tradeView(trade, fees, evidenceByNumber.get(trade.number)),
  );
  const raw: Kpis = result.kpis;
  const kpis = toStrategyKpis(raw);
  if (!kpis) throw new Error('Stored backtest KPIs are unreadable');
  const pending = extras?.pending_orders ?? [];
  const openPosition: OpenPositionView | null = result.open_position
    ? {
        ...result.open_position,
        unrealized_pnl_basis: 'market_value_at_last_close_minus_entry_total_before_sell_costs',
        entry_conditions: extras?.open_position_evidence ?? null,
      }
    : null;
  const { kpis: _kpis, trades: _trades, open_position: _open, ...rest } = result;
  return {
    ...rest,
    contract: STRATEGY_BACKTEST_CONTRACT,
    kpis,
    kpi_basis: {
      units: 'percent_points',
      total_return:
        'NAV_cuối / vốn_ban_đầu − 1; NAV gồm tiền mặt và vị thế cuối kỳ theo giá đóng cửa',
      annualized_return: {
        formula: '(NAV_cuối / vốn_ban_đầu)^(252 / n_sessions) − 1',
        sessions_per_year: ANNUALIZATION_SESSIONS,
        n_sessions: snapshot.bar_count,
        note: '252 là tham số mô phỏng, không phải lịch giao dịch thật',
      },
      max_drawdown: 'min(NAV_t / đỉnh_NAV_đến_t − 1); đỉnh bắt đầu từ vốn ban đầu trước phí',
      closed_trade_count: 'Số vòng mua–bán đã đóng; không gồm vị thế mở và lệnh chưa khớp',
      win_rate: 'Số giao dịch lãi thuần > 0 / số giao dịch đã đóng; hòa vốn không tính thắng',
      buy_hold:
        'close cuối / close đầu của cùng khoảng kiểm thử; chưa trừ phí, chưa gồm cổ tức hay điều chỉnh',
    },
    counts: {
      buy_count: trades.length + (openPosition ? 1 : 0),
      closed_trade_count: trades.length,
      open_position_count: openPosition ? 1 : 0,
      pending_order_count: pending.length,
    },
    supplementary: {
      winning_trade_count: trades.filter((trade) => trade.outcome === 'win').length,
      profit_factor: finiteOrNull(raw.profit_factor),
    },
    chart: {
      title: BACKTEST_CHART_TITLE,
      unit: 'percent_points',
      baseline_field: 'initial',
      series: seriesMeta(result, symbol, snapshot.benchmark?.available !== false),
      point_count: result.curve.length,
    },
    trades,
    open_position: openPosition,
    pending_orders: pending,
  };
}

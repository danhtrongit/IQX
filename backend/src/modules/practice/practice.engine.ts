import {
  createSeriesCache,
  evaluateIndicatorSide,
  isParamsSide,
  isRowsEntry,
  validBar,
  type Bar,
  type RegistryEntry,
  type RowEvaluation,
  type SeriesCache,
  type Side,
  type SideConfig,
} from '../quant/v2/index.js';
import {
  HOLD_MAX_MAX,
  HOLD_MAX_MIN,
  MINI_ENGINE_PROFILE,
  type EngineProfile,
} from './practice.constants.js';
import { rowLabel, rowOperandLabels, ruleLabels } from './practice.labels.js';
import type {
  ChartEvent,
  DecisionEvidence,
  MissedBuy,
  PendingOrder,
  PracticeKpis,
  PracticeTrade,
  RuleEvidenceRow,
} from './practice.types.js';

/**
 * Mini-practice engine (Bot SPEC §11, profile `mini-profile-v1`). Pure and deterministic:
 *
 * - the signal is evaluated at the CLOSE of session i; the order fills at the OPEN of the next
 *   valid session; the first test session starts flat (no fill from the last observation signal);
 * - buys use 100% of available cash (fees included) rounded down to whole lots; one position max;
 * - a time exit is scheduled at the close where `i - entry + 1 >= N` and fills at the next open;
 *   when the sell indicator is met as well the single sell keeps the primary reason `indicator`
 *   and records the `time_due` flag;
 * - no forced liquidation: an open position is valued at the last valid close, and orders created
 *   at the last session stay pending (they are never filled outside the test window);
 * - missing indicator data never fills an order, and never disables the time exit.
 *
 * The indicator decision at a close is `evaluateIndicatorSide` of the shared engine (SPEC V3): the
 * same function Bot, Backtest and Strategy alerts call. It reads bars `<= i` only, so a decision
 * never depends on a later bar (SPEC V3 §5).
 */

export type PracticeEngineErrorCode =
  'INVALID_HOLD' | 'INVALID_RANGE' | 'NO_TEST_DATA' | 'INVARIANT';

export class PracticeEngineError extends Error {
  constructor(
    readonly code: PracticeEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PracticeEngineError';
  }
}

export type SimulationInput = {
  entry: RegistryEntry;
  /** Full chronological history (warmup + observation + test); indices are global. */
  bars: readonly Bar[];
  /** Global index of the first test session (Phiên 1). */
  firstTestIndex: number;
  /** Global index of the last test session. */
  lastTestIndex: number;
  buy: SideConfig;
  sell: SideConfig;
  holdMaxSessions: number;
  profile?: EngineProfile;
  /**
   * Memoised indicator series over exactly `bars`. The caller shares it with `buildChart` so a
   * series used by the engine and drawn on the chart is computed once; built here when absent.
   */
  cache?: SeriesCache;
};

export type SimulationOutput = {
  /** Closed trades in order, followed by the open position (if any). */
  trades: PracticeTrade[];
  events: ChartEvent[];
  pending_orders: PendingOrder[];
  missed_buys: MissedBuy[];
  /** Portfolio value at each test session close (index 0 = Phiên 1). */
  nav: number[];
  kpis: PracticeKpis;
};

const round6 = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 1e6) / 1e6;

const fee = (qty: number, price: number, rate: number): number => Math.round(qty * price * rate);

/** Largest whole-lot quantity whose cost (price x qty + fee) fits in `cash`; 0 when none fits. */
export function maxLotQty(cash: number, price: number, profile: EngineProfile): number {
  if (!(price > 0) || !(cash > 0)) return 0;
  const cost = (q: number): number => q * price + fee(q, price, profile.buy_fee_rate);
  let qty = Math.floor(cash / (price * (1 + profile.buy_fee_rate)) / profile.lot) * profile.lot;
  while (qty > 0 && cost(qty) > cash) qty -= profile.lot;
  while (cost(qty + profile.lot) <= cash) qty += profile.lot;
  return Math.max(0, qty);
}

/** Evidence row of one evaluated condition row (or Volume rule), numbers rounded like the rest. */
function evidenceRow(
  entry: RegistryEntry,
  config: SideConfig,
  row: RowEvaluation,
): RuleEvidenceRow {
  const numbers = {
    lhs: round6(row.lhs),
    rhs: round6(row.rhs),
    ...(row.rhs_lower !== undefined || row.rhs_upper !== undefined
      ? { rhs_lower: round6(row.rhs_lower), rhs_upper: round6(row.rhs_upper) }
      : {}),
    ...(row.previous_lhs !== undefined || row.previous_rhs !== undefined
      ? { previous_lhs: round6(row.previous_lhs), previous_rhs: round6(row.previous_rhs) }
      : {}),
    result: row.result,
    missing: row.missing,
  };
  if (isRowsEntry(entry)) {
    const definition = entry.rows.find((item) => item.id === row.id);
    const operands = rowOperandLabels(row.id, row.values);
    return {
      rule_id: row.id,
      kind: row.previous_lhs !== undefined || row.previous_rhs !== undefined ? 'cross' : 'compare',
      op: row.op,
      left_label: operands.left,
      right_label: operands.right,
      ...(definition ? { label: rowLabel(definition, row.values) } : {}),
      values: { ...row.values },
      ...numbers,
    };
  }
  const rule = isParamsSide(config) ? config.rules.find((item) => item.id === row.id) : undefined;
  if (!rule) throw new PracticeEngineError('INVARIANT', 'Điều kiện không có trong cấu hình.');
  const labels = ruleLabels(rule, entry, isParamsSide(config) ? config.params : {});
  return {
    rule_id: row.id,
    kind: rule.kind,
    op: rule.op,
    left_label: labels.left,
    right_label: labels.right,
    ...numbers,
  };
}

/**
 * Decision of one side at the close of bar `index`: the shared evaluator's verdict plus the
 * evidence rows it used (enabled rows only). A tab that is off, or on with no enabled row, is
 * `no_signal` (result `null`), which never opens or closes a position. Exported for the tests
 * that pin the evidence of every registry row.
 */
export function evaluateSide(
  entry: RegistryEntry,
  side: Side,
  config: SideConfig,
  cache: SeriesCache,
  index: number,
  signalSession: number,
): DecisionEvidence {
  const evaluation = evaluateIndicatorSide(entry.id, config, cache, index);
  return {
    side,
    signal_session: signalSession,
    enabled: config.enabled,
    result: evaluation.result,
    status: evaluation.status,
    reason: evaluation.reason,
    params: isParamsSide(config) ? { ...config.params } : {},
    rules: evaluation.rows.map((row) => evidenceRow(entry, config, row)),
  };
}

type OpenState = {
  ordinal: number;
  qty: number;
  entryIndex: number;
  price: number;
  fee: number;
  total: number;
  signalSession: number;
  evidence: DecisionEvidence;
};

type PendingState =
  | { side: 'buy'; signalIndex: number; evidence: DecisionEvidence }
  | {
      side: 'sell';
      signalIndex: number;
      evidence: DecisionEvidence;
      indicatorMet: boolean;
      timeDue: boolean;
      held: number;
    };

export function simulate(input: SimulationInput): SimulationOutput {
  const profile = input.profile ?? MINI_ENGINE_PROFILE;
  const { bars, entry, firstTestIndex: first, lastTestIndex: last } = input;
  const hold = input.holdMaxSessions;
  if (!Number.isInteger(hold) || hold < HOLD_MAX_MIN || hold > HOLD_MAX_MAX) {
    throw new PracticeEngineError(
      'INVALID_HOLD',
      'Thời gian giữ phải là số nguyên từ 1 đến 1.000 phiên.',
    );
  }
  if (!(first >= 1) || last < first || last >= bars.length) {
    throw new PracticeEngineError('INVALID_RANGE', 'Khoảng kiểm thử không hợp lệ.');
  }
  if (!bars.slice(first, last + 1).some((bar) => validBar(bar))) {
    throw new PracticeEngineError('NO_TEST_DATA', 'Không có phiên hợp lệ trong khoảng kiểm thử.');
  }

  for (const config of [input.buy, input.sell]) {
    if (isRowsEntry(entry) === isParamsSide(config)) {
      throw new PracticeEngineError(
        'INVARIANT',
        'Cấu hình không khớp mô hình điều kiện của chỉ báo.',
      );
    }
  }
  if (input.cache !== undefined && input.cache.bars !== bars) {
    throw new PracticeEngineError('INVARIANT', 'Bộ nhớ chỉ báo không khớp dữ liệu giá.');
  }
  const cache = input.cache ?? createSeriesCache(bars);
  const session = (index: number): number => index - first + 1;

  let cash = profile.capital;
  let position: OpenState | null = null;
  let pending: PendingState | null = null;
  let buyCount = 0;
  const trades: PracticeTrade[] = [];
  const events: ChartEvent[] = [];
  const missed: MissedBuy[] = [];
  const nav: number[] = [];
  let lastValidIndex = -1;

  for (let i = first; i <= last; i++) {
    const bar = bars[i];
    const usable = bar !== undefined && validBar(bar);

    // Open of session i: execute the order created at the previous close. A session without a
    // valid open keeps the order pending for the next valid session (nothing is invented).
    if (usable && pending) {
      const order: PendingState = pending;
      pending = null;
      if (order.side === 'buy' && !position) {
        const qty = maxLotQty(cash, bar.open, profile);
        if (qty > 0) {
          const buyFee = fee(qty, bar.open, profile.buy_fee_rate);
          const total = qty * bar.open + buyFee;
          cash -= total;
          buyCount += 1;
          position = {
            ordinal: buyCount,
            qty,
            entryIndex: i,
            price: bar.open,
            fee: buyFee,
            total,
            signalSession: session(order.signalIndex),
            evidence: order.evidence,
          };
          events.push({
            side: 'buy',
            session: session(i),
            price: bar.open,
            trade_ordinal: buyCount,
          });
        } else {
          missed.push({
            signal_session: session(order.signalIndex),
            fill_session: session(i),
            price: bar.open,
            cash,
          });
        }
      } else if (order.side === 'sell' && position) {
        const sellFee = fee(position.qty, bar.open, profile.sell_cost_rate);
        const net = position.qty * bar.open - sellFee;
        const pnl = net - position.total;
        cash += net;
        const reason = order.indicatorMet ? 'indicator' : 'max_holding';
        trades.push({
          ordinal: position.ordinal,
          status: 'closed',
          qty: position.qty,
          buy: {
            signal_session: position.signalSession,
            session: session(position.entryIndex),
            price: position.price,
            fee: position.fee,
            total_cost: position.total,
            evidence: position.evidence,
          },
          sell: {
            signal_session: session(order.signalIndex),
            session: session(i),
            price: bar.open,
            fee: sellFee,
            net_proceeds: net,
            reason,
            indicator_met: order.indicatorMet,
            time_due: order.timeDue,
            evidence: order.evidence,
            time_exit: {
              hold_max_sessions: hold,
              held_sessions_at_signal: order.held,
              due: order.timeDue,
            },
          },
          holding_sessions: i - position.entryIndex,
          pnl_kind: 'realized',
          pnl_vnd: pnl,
          pnl_ratio: pnl / position.total,
          mark: null,
        });
        events.push({
          side: 'sell',
          session: session(i),
          price: bar.open,
          trade_ordinal: position.ordinal,
          reason,
        });
        position = null;
      }
    }

    // Close of session i: value the portfolio and decide the order for the next valid open.
    if (usable) {
      lastValidIndex = i;
      if (position) {
        const sellEvidence = evaluateSide(entry, 'sell', input.sell, cache, i, session(i));
        const held: number = i - position.entryIndex + 1;
        const timeDue: boolean = held >= hold;
        const indicatorMet: boolean = sellEvidence.result === true;
        if (indicatorMet || timeDue) {
          pending = {
            side: 'sell',
            signalIndex: i,
            evidence: sellEvidence,
            indicatorMet,
            timeDue,
            held,
          };
        }
      } else {
        const buyEvidence = evaluateSide(entry, 'buy', input.buy, cache, i, session(i));
        if (buyEvidence.result === true) {
          pending = { side: 'buy', signalIndex: i, evidence: buyEvidence };
        }
      }
    }
    const markIndex = usable ? i : lastValidIndex;
    const markBar = markIndex >= 0 ? bars[markIndex] : undefined;
    nav.push(cash + (position && markBar ? position.qty * markBar.close : 0));
  }

  const pendingOrders: PendingOrder[] = [];
  if (pending) {
    const order: PendingState = pending;
    pendingOrders.push(
      order.side === 'buy'
        ? {
            side: 'buy',
            signal_session: session(order.signalIndex),
            reason: 'buy_signal',
            time_due: false,
            status: 'unfilled_end_of_window',
          }
        : {
            side: 'sell',
            signal_session: session(order.signalIndex),
            reason: order.indicatorMet ? 'indicator' : 'max_holding',
            time_due: order.timeDue,
            status: 'unfilled_end_of_window',
          },
    );
  }

  // Final valuation at the last valid close; a missing close never becomes a fake 0%.
  const finalOpen = position as OpenState | null;
  const markBar = lastValidIndex >= 0 ? bars[lastValidIndex] : undefined;
  let openValue: number | null = 0;
  if (finalOpen) {
    openValue = markBar ? finalOpen.qty * markBar.close : null;
    const mark =
      markBar && openValue !== null
        ? { session: session(lastValidIndex), price: markBar.close, market_value: openValue }
        : null;
    const pnl = openValue === null ? 0 : openValue - finalOpen.total;
    trades.push({
      ordinal: finalOpen.ordinal,
      status: 'open',
      qty: finalOpen.qty,
      buy: {
        signal_session: finalOpen.signalSession,
        session: session(finalOpen.entryIndex),
        price: finalOpen.price,
        fee: finalOpen.fee,
        total_cost: finalOpen.total,
        evidence: finalOpen.evidence,
      },
      sell: null,
      holding_sessions: lastValidIndex >= 0 ? lastValidIndex - finalOpen.entryIndex : 0,
      pnl_kind: 'unrealized',
      pnl_vnd: pnl,
      pnl_ratio: pnl / finalOpen.total,
      mark,
    });
  }
  const closedCount = trades.filter((trade) => trade.status === 'closed').length;
  if (buyCount !== closedCount + (finalOpen ? 1 : 0)) {
    throw new PracticeEngineError(
      'INVARIANT',
      'Số lần Mua không khớp số giao dịch đã đóng và vị thế mở.',
    );
  }
  if (cash < 0) throw new PracticeEngineError('INVARIANT', 'Tiền mặt không được âm.');

  const navEnd = openValue === null ? null : cash + openValue;
  return {
    trades,
    events,
    pending_orders: pendingOrders,
    missed_buys: missed,
    nav,
    kpis: {
      capital_initial: profile.capital,
      cash_end: cash,
      open_position_value: openValue,
      nav_end: navEnd,
      total_return: navEnd === null ? null : navEnd / profile.capital - 1,
      valuation: navEnd === null ? 'missing' : 'ok',
      buy_count: buyCount,
      closed_trade_count: closedCount,
      open_position: finalOpen !== null,
      insufficient_cash_buys: missed.length,
    },
  };
}

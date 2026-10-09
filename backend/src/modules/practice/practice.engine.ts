import {
  and3,
  calc,
  evaluateRuleWithEvidence,
  validBar,
  type Bar,
  type RegistryEntry,
  type SeriesMap,
  type Side,
  type SideConfig,
} from '../quant/v2/index.js';
import {
  HOLD_MAX_MAX,
  HOLD_MAX_MIN,
  MINI_ENGINE_PROFILE,
  type EngineProfile,
} from './practice.constants.js';
import { ruleLabels } from './practice.labels.js';
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
  entry: Pick<RegistryEntry, 'id' | 'name' | 'fields'>;
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
  /** Full-length (global index) indicator series of each side, from the locked params. */
  series: Record<Side, SeriesMap>;
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

function evaluateSide(
  entry: SimulationInput['entry'],
  side: Side,
  config: SideConfig,
  series: SeriesMap,
  index: number,
  signalSession: number,
): DecisionEvidence {
  if (!config.enabled) {
    return {
      side,
      signal_session: signalSession,
      enabled: false,
      result: false,
      params: { ...config.params },
      rules: [],
    };
  }
  const rules: RuleEvidenceRow[] = config.rules.map((rule) => {
    const evidence = evaluateRuleWithEvidence(rule, series, config.params, index);
    const labels = ruleLabels(rule, entry, config.params);
    return {
      rule_id: rule.id,
      kind: rule.kind,
      op: rule.op,
      left_label: labels.left,
      right_label: labels.right,
      lhs: round6(evidence.lhs),
      rhs: round6(evidence.rhs),
      ...(rule.kind === 'membership'
        ? { rhs_lower: round6(evidence.rhs_lower), rhs_upper: round6(evidence.rhs_upper) }
        : {}),
      ...(rule.kind === 'cross'
        ? {
            previous_lhs: round6(evidence.previous_lhs),
            previous_rhs: round6(evidence.previous_rhs),
          }
        : {}),
      result: evidence.result,
      missing: evidence.missing,
    };
  });
  return {
    side,
    signal_session: signalSession,
    enabled: true,
    result: and3(rules.map((row) => row.result)),
    params: { ...config.params },
    rules,
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

  const buySeries = calc(entry.id, input.buy.params, bars);
  const sellSeries =
    JSON.stringify(input.sell.params) === JSON.stringify(input.buy.params)
      ? buySeries
      : calc(entry.id, input.sell.params, bars);
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
        const sellEvidence = evaluateSide(entry, 'sell', input.sell, sellSeries, i, session(i));
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
        const buyEvidence = evaluateSide(entry, 'buy', input.buy, buySeries, i, session(i));
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
    series: { buy: buySeries, sell: sellSeries },
  };
}

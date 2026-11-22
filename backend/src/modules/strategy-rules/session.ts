/**
 * One session D of the shared rules (§3.3): sells over every position held at the start of D, NAV
 * after sells, candidate ranking (GTGD TB20 desc, symbol A→Z), up to two buys with 12% NAV budgets.
 * Pure and deterministic: the same state + input always gives the same result. Money is bigint VND.
 *
 *   1. SELL each position (symbol order):
 *      a. held(D) < 2 (T+2): never sold; a true Sell condition is journaled "chờ T+2" (not deferred).
 *      b. due = counted(D) >= N.   c. sell = the strategy's Sell side (true / false / null).
 *      d. sell == true or due → sell everything at close(D); exit_reason 'indicator' when the
 *         condition is true, else 'max_holding'; exit_reasons = every true reason.
 *      e. sell == null and not due → "chưa đánh giá được", hold.
 *      f. no valid close in D → not sold; "Đến hạn, chưa khớp" when due; retried every session.
 *      Net proceeds = gross − fee − tax, available at once (Q9).
 *   2. NAV = cash + Σ qty × close(D). A held symbol without close(D) → no buy (B14 v1.0).
 *   3. Candidates = universe ∩ (Buy == true) − held at start − sold in D.
 *   4. Buy in rank order: 2 successful buys max; budget = min(12% NAV, cash); qty = lots of 100
 *      with gross + fee <= budget; skips: session limit, cash < 1 lot, 12% NAV < 1 lot, > 30% NAV.
 *   5. End-of-session NAV.
 */

import { DEFAULT_FEE_RULES, RULES_VERSION, RULE_MESSAGES, STRATEGY_RULES } from './constants.js';
import type {
  BuySkipCode,
  ExitReason,
  FeeRules,
  JournalEntry,
  PortfolioState,
  PositionState,
  SessionBuy,
  SessionCalendarLike,
  SessionCounters,
  SessionInput,
  SessionParams,
  SessionResult,
  SessionSell,
  SessionSkip,
  Tri,
} from './contracts.js';

export class StrategyRulesError extends Error {
  constructor(
    readonly code:
      | 'SESSION_ORDER'
      | 'SESSION_NOT_IN_CALENDAR'
      | 'DATE_RANGE_INVALID'
      | 'UNIVERSE_EMPTY'
      | 'UNIVERSE_TOO_LARGE'
      | 'INVALID_STATE',
    message: string,
  ) {
    super(message);
    this.name = 'StrategyRulesError';
  }
}

/** Half-up rounding of `amount × bps / 10000` (the Bot ledger's rounding). */
export function roundBps(amountVnd: bigint, bps: number): bigint {
  if (amountVnd < 0n || !Number.isSafeInteger(bps) || bps < 0) {
    throw new StrategyRulesError('INVALID_STATE', 'amount and basis points must be non-negative');
  }
  return (amountVnd * BigInt(bps) + 5_000n) / 10_000n;
}

export type SellAmounts = { gross: bigint; fee: bigint; tax: bigint; net: bigint };

export function sellAmounts(qty: number, priceVnd: bigint, fees: FeeRules): SellAmounts {
  const gross = BigInt(qty) * priceVnd;
  const fee = roundBps(gross, fees.sell_fee_bps);
  const tax = roundBps(gross, fees.sell_tax_bps);
  return { gross, fee, tax, net: gross - fee - tax };
}

export type BuySizing =
  | { ok: true; qty: number; gross: bigint; fee: bigint; total: bigint; budget: bigint }
  | { ok: false; code: BuySkipCode; budget: bigint };

/**
 * §3.3 step 4 sizing. budget = min(12% × NAV, cash); qty = largest multiple of a lot with
 * gross + fee <= budget. No lot → `insufficient_cash` when cash < one lot with fee, else
 * `budget_below_lot`. Value > 30% NAV → `symbol_cap` (skipped, never shrunk).
 */
export function sizeBuy(
  navVnd: bigint,
  cashVnd: bigint,
  priceVnd: bigint,
  fees: FeeRules,
): BuySizing {
  const budgetNav = (navVnd * BigInt(STRATEGY_RULES.buy_budget_bps)) / 10_000n;
  const budget = budgetNav < cashVnd ? budgetNav : cashVnd;
  const lot = BigInt(fees.lot_size);
  const total = (lots: bigint): { gross: bigint; fee: bigint; total: bigint } => {
    const gross = lots * lot * priceVnd;
    const fee = roundBps(gross, fees.buy_fee_bps);
    return { gross, fee, total: gross + fee };
  };
  const oneLot = total(1n);
  let lots =
    budget > 0n && priceVnd > 0n
      ? (budget * 10_000n) / (priceVnd * lot * BigInt(10_000 + fees.buy_fee_bps))
      : 0n;
  while (lots > 0n && total(lots).total > budget) lots -= 1n;
  // Integer rounding of the fee can leave room for one more lot.
  while (budget > 0n && total(lots + 1n).total <= budget) lots += 1n;
  if (lots <= 0n) {
    return {
      ok: false,
      code: cashVnd < oneLot.total ? 'insufficient_cash' : 'budget_below_lot',
      budget,
    };
  }
  const chosen = total(lots);
  if (chosen.gross * 10_000n > navVnd * BigInt(STRATEGY_RULES.max_symbol_nav_bps)) {
    return { ok: false, code: 'symbol_cap', budget };
  }
  const qty = lots * lot;
  if (qty > BigInt(Number.MAX_SAFE_INTEGER))
    throw new StrategyRulesError('INVALID_STATE', 'qty overflow');
  return { ok: true, qty: Number(qty), ...chosen, budget };
}

const sortBySymbol = <T extends { symbol: string }>(rows: T[]): T[] =>
  rows.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));

/** Run session D. Throws `SESSION_ORDER` when D is not after the state's last session (R14). */
export function stepSession(
  state: PortfolioState,
  input: SessionInput,
  calendar: SessionCalendarLike,
  params: Partial<SessionParams> = {},
): SessionResult {
  const fees = params.fees ?? DEFAULT_FEE_RULES;
  const D = input.session;
  if (state.last_session !== null && D <= state.last_session) {
    throw new StrategyRulesError(
      'SESSION_ORDER',
      `Phiên ${D} đã được xử lý (phiên gần nhất ${state.last_session}).`,
    );
  }
  if (!calendar.has(D)) {
    throw new StrategyRulesError(
      'SESSION_NOT_IN_CALENDAR',
      `Phiên ${D} không có trong lịch phiên.`,
    );
  }
  const strategy = input.strategy;
  const N = strategy?.max_holding ?? STRATEGY_RULES.default_max_holding;
  const sellEnabled = strategy?.sell_enabled ?? false;
  const counters: SessionCounters = {
    sells: 0,
    buys: 0,
    time_exits: 0,
    t2_blocked: 0,
    due_unfilled: 0,
    universe_empty: false,
    skipped_buys: 0,
  };
  const sells: SessionSell[] = [];
  const buys: SessionBuy[] = [];
  const skips: SessionSkip[] = [];
  const journal: JournalEntry[] = [];
  const remaining: PositionState[] = [];
  const sold = new Set<string>();
  let cash = state.cash_vnd;

  // 1. SELL
  for (const position of sortBySymbol([...state.positions])) {
    const symbol = position.symbol;
    const data = input.symbols[symbol];
    const held = calendar.countSessions(position.entry_session, D);
    const counted = calendar.countSessions(position.anchor_session, D);
    const note = (code: JournalEntry['code'], message: string): void => {
      journal.push({
        symbol,
        code,
        message,
        counted_sessions: counted,
        holding_sessions: held,
        max_holding: N,
      });
    };
    const issue = data?.sell_issue ?? null;
    if (issue) note('sell_issue', `${RULE_MESSAGES.sell_issue}: ${issue}`);
    const signal: Tri =
      sellEnabled && !issue ? (data?.sell_signal ?? null) : sellEnabled ? null : false;
    if (held < STRATEGY_RULES.settlement_sessions) {
      if (signal === true) {
        counters.t2_blocked += 1;
        note('t2_wait', RULE_MESSAGES.t2_wait);
      }
      remaining.push(position);
      continue;
    }
    const due = counted >= N;
    const close = data?.close_vnd ?? null;
    if (close === null || close <= 0n) {
      if (due) {
        counters.due_unfilled += 1;
        note('due_unfilled', RULE_MESSAGES.due_unfilled);
      } else {
        note('no_price', RULE_MESSAGES.no_price);
      }
      remaining.push(position);
      continue;
    }
    if (signal === true || due) {
      const reasons: ExitReason[] = [];
      if (signal === true) reasons.push('indicator');
      if (due) reasons.push('max_holding');
      const amounts = sellAmounts(position.qty, close, fees);
      cash += amounts.net;
      sold.add(symbol);
      const exitReason: ExitReason = signal === true ? 'indicator' : 'max_holding';
      if (exitReason === 'max_holding') counters.time_exits += 1;
      sells.push({
        symbol,
        qty: position.qty,
        price_vnd: close,
        gross_vnd: amounts.gross,
        fee_vnd: amounts.fee,
        tax_vnd: amounts.tax,
        net_vnd: amounts.net,
        entry_session: position.entry_session,
        entry_price_vnd: position.entry_price_vnd,
        entry_cost_vnd: position.entry_cost_vnd,
        anchor_session: position.anchor_session,
        anchor_reason: position.anchor_reason,
        pnl_vnd: amounts.net - position.entry_cost_vnd,
        exit_reason: exitReason,
        exit_reasons: reasons,
        holding_sessions: held,
        counted_sessions: counted,
        max_holding_at_exit: N,
        sell_issue: issue,
      });
      continue;
    }
    if (signal === null) note('sell_unknown', RULE_MESSAGES.sell_unknown);
    else if (sellEnabled) note('sell_not_met', RULE_MESSAGES.sell_not_met);
    else note('no_sell_condition', RULE_MESSAGES.no_sell_condition);
    remaining.push(position);
  }
  counters.sells = sells.length;

  // 2. NAV after sells
  const cashAfterSells = cash;
  let complete = true;
  let sizingMarketValue = 0n;
  for (const position of remaining) {
    const close = input.symbols[position.symbol]?.close_vnd ?? null;
    if (close === null || close <= 0n) complete = false;
    else sizingMarketValue += BigInt(position.qty) * close;
  }
  const sizingNav = complete ? cashAfterSells + sizingMarketValue : null;

  // 3–4. BUY
  const heldAtStart = new Set(state.positions.map((position) => position.symbol));
  const bought: PositionState[] = [];
  if (!strategy) {
    journal.push({ symbol: null, code: 'no_strategy', message: RULE_MESSAGES.no_strategy });
  } else if (!strategy.buy_enabled) {
    journal.push({ symbol: null, code: 'sell_only', message: RULE_MESSAGES.sell_only });
  } else if (input.universe.length === 0) {
    counters.universe_empty = true;
    journal.push({ symbol: null, code: 'universe_empty', message: RULE_MESSAGES.universe_empty });
  } else if (sizingNav === null) {
    journal.push({ symbol: null, code: 'nav_incomplete', message: RULE_MESSAGES.nav_incomplete });
  } else {
    type Candidate = { symbol: string; close: bigint; gtgd20: bigint };
    const candidates: Candidate[] = [];
    for (const raw of new Set(input.universe)) {
      const symbol = raw.trim().toUpperCase();
      if (heldAtStart.has(symbol) || sold.has(symbol)) continue;
      const data = input.symbols[symbol];
      if (!data || data.buy_signal !== true) continue;
      if (data.close_vnd === null || data.close_vnd <= 0n || data.gtgd20_vnd === null) continue;
      candidates.push({ symbol, close: data.close_vnd, gtgd20: data.gtgd20_vnd });
    }
    candidates.sort((a, b) =>
      a.gtgd20 !== b.gtgd20
        ? a.gtgd20 > b.gtgd20
          ? -1
          : 1
        : a.symbol < b.symbol
          ? -1
          : a.symbol > b.symbol
            ? 1
            : 0,
    );
    candidates.forEach((candidate, index) => {
      const rank = index + 1;
      const skip = (code: BuySkipCode): void => {
        skips.push({
          symbol: candidate.symbol,
          code,
          message: RULE_MESSAGES[code],
          rank,
          gtgd20_vnd: candidate.gtgd20,
        });
      };
      if (buys.length >= STRATEGY_RULES.max_buys_per_session) {
        skip('session_buy_limit');
        return;
      }
      const sizing = sizeBuy(sizingNav, cash, candidate.close, fees);
      if (!sizing.ok) {
        skip(sizing.code);
        return;
      }
      cash -= sizing.total;
      buys.push({
        symbol: candidate.symbol,
        qty: sizing.qty,
        price_vnd: candidate.close,
        gross_vnd: sizing.gross,
        fee_vnd: sizing.fee,
        total_vnd: sizing.total,
        gtgd20_vnd: candidate.gtgd20,
        rank,
        budget_vnd: sizing.budget,
        sellable_from: calendar.addSessions(D, STRATEGY_RULES.settlement_sessions),
      });
      bought.push({
        symbol: candidate.symbol,
        qty: sizing.qty,
        entry_session: D,
        entry_price_vnd: candidate.close,
        entry_cost_vnd: sizing.total,
        anchor_session: D,
        anchor_reason: 'entry',
      });
    });
  }
  counters.buys = buys.length;
  counters.skipped_buys = skips.length;

  // 5. End of session
  const positions = sortBySymbol([...remaining, ...bought]);
  let marketValue = 0n;
  for (const position of positions) {
    const data = input.symbols[position.symbol];
    const price =
      data?.close_vnd && data.close_vnd > 0n
        ? data.close_vnd
        : data?.last_close_vnd && data.last_close_vnd > 0n
          ? data.last_close_vnd
          : position.entry_price_vnd;
    marketValue += BigInt(position.qty) * price;
  }
  if (cash < 0n) throw new StrategyRulesError('INVALID_STATE', 'Tiền mặt âm sau phiên.');
  return {
    session: D,
    rules_version: RULES_VERSION,
    sells,
    buys,
    skips,
    journal,
    nav: {
      cash_after_sells_vnd: cashAfterSells,
      sizing_nav_vnd: sizingNav,
      cash_vnd: cash,
      market_value_vnd: marketValue,
      nav_vnd: cash + marketValue,
      complete,
    },
    counters,
    next_state: { cash_vnd: cash, positions, last_session: D },
  };
}

/** Initial state of a Bot or a Backtest (100.000.000 đ, no position). */
export function initialPortfolio(): PortfolioState {
  return { cash_vnd: STRATEGY_RULES.initial_cash_vnd, positions: [], last_session: null };
}

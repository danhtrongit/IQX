/**
 * Basket Backtest (§4, §4.7, §4.8): `stepSession` for every store session in [start, end] with a
 * fixed capital of 100.000.000 đ. No forced sell at the end (§3.5): open positions are valued at the
 * last close, before the sell fee.
 */

import { loadTechnicalRegistry } from '../quant/v2/technical-registry.js';
import { SessionCalendar } from './calendar.js';
import { DEFAULT_FEE_RULES, RULES_VERSION, STRATEGY_RULES } from './constants.js';
import { normalizeSymbols, sessionStrategyOf, strategyConfigHash } from './content.js';
import type {
  BacktestCurvePoint,
  BacktestKpis,
  BacktestOpenPosition,
  BacktestPerSymbol,
  BacktestResult,
  BacktestSkippedOrder,
  BacktestTrade,
  BasketBacktestInput,
  BuySkipCode,
  DataWarning,
  PortfolioState,
} from './contracts.js';
import { initialPortfolio, StrategyRulesError, stepSession } from './session.js';
import { buildSessionInput, createSignalProvider } from './session-input.js';
import { barIndexAt, barIndexAtOrBefore, validClose } from './signals.js';

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/** a / b as a float for KPIs (both bigint VND). */
const ratio = (a: bigint, b: bigint): number => Number(a) / Number(b);

const displayDate = (iso: string): string =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const WARNING_MESSAGES = Object.freeze({
  UNIVERSE_CURRENT_MEMBERS:
    'Rổ dùng thành phần hiện tại cho cả quá khứ (chưa có dữ liệu thành phần rổ theo thời điểm). Kết quả có thể đẹp hơn thực tế.',
  UNIVERSE_SNAPSHOT:
    'Danh mục đã lưu: danh sách mã được chép vào chiến lược khi lưu và dùng cho cả quá khứ.',
  MARKET_CONTEXT_UNAVAILABLE: 'Không có dữ liệu VN-Index trong kho; không vẽ được đường VN-Index.',
});

/** Max drawdown % of a NAV series, peak initialised at the capital (§4.7). */
export function maxDrawdownPct(navs: readonly bigint[], capital: bigint): number {
  let peak = capital;
  let worst = 0;
  for (const nav of navs) {
    if (nav > peak) peak = nav;
    const dd = ratio(nav, peak) - 1;
    if (dd < worst) worst = dd;
  }
  return worst * 100;
}

/** `((V_end / V_0)^(252/N) − 1) × 100`, null below 60 sessions. */
export function annualizedReturnPct(
  finalNav: bigint,
  capital: bigint,
  sessions: number,
): number | null {
  if (sessions < STRATEGY_RULES.annualise_min_sessions) return null;
  return (
    (Math.pow(ratio(finalNav, capital), STRATEGY_RULES.sessions_per_year / sessions) - 1) * 100
  );
}

export function runBasketBacktest(input: BasketBacktestInput): BacktestResult {
  const fees = input.fees ?? DEFAULT_FEE_RULES;
  const registry = loadTechnicalRegistry();
  const bundle = input.data;
  const calendar = new SessionCalendar(bundle.calendar);
  const universe = normalizeSymbols(input.universe);
  if (universe.length === 0) throw new StrategyRulesError('UNIVERSE_EMPTY', 'Rổ không có mã.');
  if (universe.length > STRATEGY_RULES.max_basket_symbols) {
    throw new StrategyRulesError(
      'UNIVERSE_TOO_LARGE',
      `Rổ tối đa ${STRATEGY_RULES.max_basket_symbols} mã.`,
    );
  }
  const first = calendar.indexAtOrAfter(input.start);
  const last = calendar.indexAtOrBefore(input.end);
  if (first >= calendar.length || last < first) {
    throw new StrategyRulesError(
      'DATE_RANGE_INVALID',
      'Không có phiên nào trong khoảng thời gian.',
    );
  }
  const content = input.content;
  const capital = STRATEGY_RULES.initial_cash_vnd;
  const strategy = sessionStrategyOf(content, registry);
  const signals =
    input.signals ??
    createSignalProvider(content, bundle, {
      registry,
      cache: input.signal_cache,
      config_hash: strategyConfigHash(content),
      from_session_idx: first,
    });

  // Basket buy-and-hold: equal weights at the first session, fractional, buy fee, never sold.
  const startDate = bundle.calendar[first]!;
  const bhBase = new Map<string, number>();
  for (const symbol of universe) {
    const series = bundle.symbols[symbol];
    if (!series) continue;
    const at = barIndexAt(series, first);
    const close = at >= 0 ? series.close[at] : undefined;
    if (validClose(close)) bhBase.set(symbol, close);
  }
  const marketBase = bundle.market?.[first];
  const marketOk =
    bundle.market !== null &&
    marketBase !== undefined &&
    Number.isFinite(marketBase) &&
    marketBase > 0;
  const buyFeeFactor = 1 + fees.buy_fee_bps / 10_000;

  let state: PortfolioState = initialPortfolio();
  const curve: BacktestCurvePoint[] = [];
  const navs: bigint[] = [];
  const trades: BacktestTrade[] = [];
  const skippedCounts: Partial<Record<BuySkipCode, number>> = {};
  let skippedTotal = 0;
  const skippedItems: BacktestSkippedOrder[] = [];
  let timeExits = 0;

  for (let idx = first; idx <= last; idx += 1) {
    const sessionInput = buildSessionInput({
      bundle,
      session_idx: idx,
      content,
      universe,
      held: state.positions.map((position) => position.symbol),
      signals,
      registry,
      strategy,
      buy_candidates_only: true,
    });
    const result = stepSession(state, sessionInput, calendar, { fees });
    const date = result.session;
    for (const sell of result.sells) {
      trades.push({
        ...sell,
        exit_session: date,
        pnl_pct: round4(ratio(sell.pnl_vnd, sell.entry_cost_vnd) * 100),
      });
    }
    timeExits += result.counters.time_exits;
    for (const skip of result.skips) {
      skippedCounts[skip.code] = (skippedCounts[skip.code] ?? 0) + 1;
      skippedTotal += 1;
      skippedItems.push({ date, symbol: skip.symbol, code: skip.code, message: skip.message });
      if (skippedItems.length > STRATEGY_RULES.skipped_items_limit) skippedItems.shift();
    }
    navs.push(result.nav.nav_vnd);
    let bh = 0;
    if (bhBase.size > 0) {
      let sum = 0;
      for (const [symbol, base] of bhBase) {
        const series = bundle.symbols[symbol]!;
        const at = barIndexAtOrBefore(series, idx);
        const close = at >= 0 ? series.close[at] : undefined;
        sum += validClose(close) ? close / base : 1;
      }
      bh = (sum / bhBase.size / buyFeeFactor - 1) * 100;
    }
    const marketValue = bundle.market?.[idx];
    curve.push({
      date,
      nav_vnd: result.nav.nav_vnd,
      strategy: round4((ratio(result.nav.nav_vnd, capital) - 1) * 100),
      basket: round4(bh),
      vnindex:
        marketOk && marketValue !== undefined && Number.isFinite(marketValue)
          ? round4((marketValue / marketBase - 1) * 100)
          : null,
    });
    state = result.next_state;
  }

  const sessions = curve.length;
  const endIdx = last;
  const finalNav = navs.at(-1) ?? capital;

  // Open positions at the end (valued at the last close, before the sell fee).
  const openPositions: BacktestOpenPosition[] = state.positions.map((position) => {
    const series = bundle.symbols[position.symbol];
    const at = series ? barIndexAtOrBefore(series, endIdx) : -1;
    const close = series && at >= 0 ? series.close[at] : undefined;
    const lastClose = validClose(close) ? BigInt(Math.round(close)) : position.entry_price_vnd;
    const unrealized = BigInt(position.qty) * lastClose - position.entry_cost_vnd;
    const endDate = bundle.calendar[endIdx]!;
    return {
      symbol: position.symbol,
      entry_session: position.entry_session,
      entry_price_vnd: position.entry_price_vnd,
      qty: position.qty,
      last_close_vnd: lastClose,
      holding_sessions: calendar.countSessions(position.entry_session, endDate),
      counted_sessions: calendar.countSessions(position.anchor_session, endDate),
      max_holding: content.max_holding,
      unrealized_pnl_vnd: unrealized,
      unrealized_pct: round4(ratio(unrealized, position.entry_cost_vnd) * 100),
    };
  });

  // Per symbol.
  const perSymbolMap = new Map<string, BacktestPerSymbol>();
  const row = (symbol: string): BacktestPerSymbol => {
    let value = perSymbolMap.get(symbol);
    if (!value) {
      value = {
        symbol,
        closed_trades: 0,
        wins: 0,
        realized_pnl_vnd: 0n,
        unrealized_pnl_vnd: 0n,
        contribution_pct: 0,
      };
      perSymbolMap.set(symbol, value);
    }
    return value;
  };
  for (const trade of trades) {
    const value = row(trade.symbol);
    value.closed_trades += 1;
    if (trade.pnl_vnd > 0n) value.wins += 1;
    value.realized_pnl_vnd += trade.pnl_vnd;
  }
  for (const position of openPositions)
    row(position.symbol).unrealized_pnl_vnd += position.unrealized_pnl_vnd;
  const perSymbol = [...perSymbolMap.values()]
    .map((value) => ({
      ...value,
      contribution_pct: round4(
        ratio(value.realized_pnl_vnd + value.unrealized_pnl_vnd, capital) * 100,
      ),
    }))
    .sort((a, b) => (a.symbol < b.symbol ? -1 : 1));

  const wins = trades.filter((trade) => trade.pnl_vnd > 0n).length;
  const kpis: BacktestKpis = {
    total_return_pct: round4((ratio(finalNav, capital) - 1) * 100),
    annualized_return_pct: (() => {
      const value = annualizedReturnPct(finalNav, capital, sessions);
      return value === null ? null : round4(value);
    })(),
    max_drawdown_pct: round4(maxDrawdownPct(navs, capital)),
    closed_trades: trades.length,
    win_rate_pct: trades.length ? round4((wins / trades.length) * 100) : null,
    basket_buy_hold_pct: curve.at(-1)?.basket ?? 0,
    vnindex_pct: curve.at(-1)?.vnindex ?? null,
  };

  // Data warnings (§4.8).
  const warnings: DataWarning[] = [];
  if (content.universe.type === 'saved_list') {
    warnings.push({ code: 'UNIVERSE_SNAPSHOT', message: WARNING_MESSAGES.UNIVERSE_SNAPSHOT });
  } else {
    warnings.push({
      code: 'UNIVERSE_CURRENT_MEMBERS',
      message: WARNING_MESSAGES.UNIVERSE_CURRENT_MEMBERS,
    });
  }
  const excluded = normalizeSymbols(input.excluded_symbols ?? []);
  if (excluded.length > 0) {
    warnings.push({
      code: 'SYMBOLS_EXCLUDED',
      message: `Bỏ ${excluded.length} mã ngoài VN100: ${excluded.join(', ')}`,
      symbols: excluded,
    });
  }
  for (const symbol of universe) {
    const series = bundle.symbols[symbol];
    const firstIdx = series?.session_idx[0];
    if (firstIdx === undefined) {
      warnings.push({
        code: 'SYMBOL_SHORT_HISTORY',
        message: `${symbol}: không có dữ liệu trong kho`,
        symbols: [symbol],
      });
    } else if (firstIdx > first) {
      warnings.push({
        code: 'SYMBOL_SHORT_HISTORY',
        message: `${symbol}: chỉ có dữ liệu từ ${displayDate(bundle.calendar[firstIdx]!)}`,
        symbols: [symbol],
      });
    }
  }
  if (!marketOk) {
    warnings.push({
      code: 'MARKET_CONTEXT_UNAVAILABLE',
      message: WARNING_MESSAGES.MARKET_CONTEXT_UNAVAILABLE,
    });
  }

  return {
    rules_version: RULES_VERSION,
    sessions,
    start_session: startDate,
    end_session: bundle.calendar[endIdx] ?? null,
    initial_cash_vnd: capital,
    final_nav_vnd: finalNav,
    cash_end_vnd: state.cash_vnd,
    kpis,
    curve,
    trades,
    per_symbol: perSymbol,
    open_positions: openPositions,
    skipped_orders: { counts: skippedCounts, total: skippedTotal, items: skippedItems },
    basket_buy_hold: { symbols: [...bhBase.keys()], return_pct: kpis.basket_buy_hold_pct },
    warnings,
    time_exits: timeExits,
  };
}

/** Strategy label helper of a run: `{max_holding}` sentence of the result header (§4.7). */
export function resultSubtitle(
  basketLabel: string,
  basketCount: number,
  result: Pick<BacktestResult, 'start_session' | 'end_session' | 'sessions'>,
  maxHolding: number,
): string {
  const from = result.start_session ? displayDate(result.start_session) : '—';
  const to = result.end_session ? displayDate(result.end_session) : '—';
  return `Rổ ${basketLabel} (${basketCount} mã) · ${from} – ${to} · ${result.sessions} phiên · giữ tối đa ${maxHolding} phiên · khớp giá đóng cửa cùng phiên`;
}

/** Deep copy with every bigint as a decimal string (JSON views, jsonb snapshots). */
export function jsonSafe<T>(value: T): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

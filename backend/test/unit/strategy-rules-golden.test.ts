/**
 * Golden cases of the shared rules (IQX-Bot-Chien-Luoc-SPEC v2.0 §16.1: R01–R14, R16, R17).
 *
 * Every scenario runs through BOTH paths and their orders/NAV must be identical:
 *   - Backtest: `runBasketBacktest` over the whole range;
 *   - Bot: one `stepSession` per session on a bundle truncated to that session (the store as the
 *     Bot sees it at D), built with `buildSessionInput`.
 * Signals are injected (per symbol, per session) so each case controls exactly when Buy/Sell is
 * true; prices are integer VND.
 */

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import {
  barIndexAt,
  buildSessionInput,
  initialPortfolio,
  runBasketBacktest,
  SessionCalendar,
  sessionStrategyOf,
  sizeBuy,
  stepSession,
  StrategyRulesError,
  DEFAULT_FEE_RULES,
  RULE_MESSAGES,
  type PortfolioState,
  type PriceSeriesBundle,
  type SessionBuy,
  type SessionResult,
  type SessionSell,
  type SignalProvider,
  type StrategyContent,
  type SymbolSeries,
  type SymbolSignals,
} from '../../src/modules/strategy-rules/index.js';

// ------------------------------------------------------------------------------------------------
// World builder
// ------------------------------------------------------------------------------------------------

function weekdays(start: string, count: number, skip: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const date = new Date(t).toISOString().slice(0, 10);
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6 && !skip.has(date)) out.push(date);
    t += 86_400_000;
  }
  return out;
}

type SymSpec = { price?: number | ((idx: number) => number); volume?: number; missing?: number[] };

function makeBundle(
  calendar: string[],
  specs: Record<string, SymSpec>,
  market = true,
): PriceSeriesBundle {
  const symbols: Record<string, SymbolSeries> = {};
  for (const [symbol, spec] of Object.entries(specs)) {
    const missing = new Set(spec.missing ?? []);
    const idx: number[] = [];
    for (let i = 0; i < calendar.length; i += 1) if (!missing.has(i)) idx.push(i);
    const price = (i: number) =>
      typeof spec.price === 'function' ? spec.price(i) : (spec.price ?? 20_000);
    const close = Float64Array.from(idx, price);
    symbols[symbol] = {
      symbol,
      session_idx: Int32Array.from(idx),
      open: close.slice(),
      high: close.slice(),
      low: close.slice(),
      close,
      volume: Float64Array.from(idx, () => spec.volume ?? 1_000_000),
      series_rev: 1,
    };
  }
  return {
    calendar,
    data_as_of: calendar.at(-1) ?? null,
    symbols,
    market: market ? Float64Array.from(calendar, (_, i) => 1_000 + i) : null,
    data_hash: 'test',
  };
}

/** Signals by calendar index: buy/sell true at the listed sessions, unknown (null) where listed. */
type SignalSpec = {
  buy?: Record<string, number[]>;
  sell?: Record<string, number[]>;
  sellUnknown?: Record<string, number[]>;
};

function signalProvider(bundle: PriceSeriesBundle, spec: SignalSpec): SignalProvider {
  return (symbol) => {
    const series = bundle.symbols[symbol];
    if (!series) return null;
    const n = series.close.length;
    const out: SymbolSignals = { buy: new Int8Array(n), sell: new Int8Array(n) };
    const mark = (array: Int8Array, sessions: number[] | undefined, value: number) => {
      for (const session of sessions ?? []) {
        const at = barIndexAt(series, session);
        if (at >= 0) array[at] = value;
      }
    };
    mark(out.buy, spec.buy?.[symbol], 1);
    mark(out.sell, spec.sell?.[symbol], 1);
    mark(out.sell, spec.sellUnknown?.[symbol], -1);
    return out;
  };
}

/** RSI Buy row on (and Sell row on when `sell`), so the content has the right active sides. */
function content(options: { maxHolding?: number; sell?: boolean } = {}): StrategyContent {
  const indicators = structuredClone(defaultConfig().indicators);
  const rsi = indicators.rsi!;
  rsi.master_enabled = true;
  rsi.buy.enabled = true;
  rsi.sell.enabled = options.sell ?? false;
  return {
    universe: { type: 'vn30' },
    indicators,
    max_holding: options.maxHolding ?? 30,
  };
}

function truncate(bundle: PriceSeriesBundle, idx: number): PriceSeriesBundle {
  const symbols: Record<string, SymbolSeries> = {};
  for (const [symbol, series] of Object.entries(bundle.symbols)) {
    let n = 0;
    while (n < series.session_idx.length && series.session_idx[n]! <= idx) n += 1;
    symbols[symbol] = {
      ...series,
      session_idx: series.session_idx.slice(0, n),
      open: series.open.slice(0, n),
      high: series.high.slice(0, n),
      low: series.low.slice(0, n),
      close: series.close.slice(0, n),
      volume: series.volume.slice(0, n),
    };
  }
  return {
    ...bundle,
    calendar: bundle.calendar.slice(0, idx + 1),
    data_as_of: bundle.calendar[idx]!,
    symbols,
    market: bundle.market ? bundle.market.slice(0, idx + 1) : null,
  };
}

type RunOptions = {
  bundle: PriceSeriesBundle;
  content: StrategyContent;
  universe: string[];
  signals: SignalSpec;
  first?: number;
  last?: number;
  /** Bot path only: universe per session (R17). */
  universeAt?: (idx: number) => string[];
  holidays?: string[];
};

type Path = {
  sessions: SessionResult[];
  sells: Array<SessionSell & { date: string }>;
  buys: Array<SessionBuy & { date: string }>;
};

/** Bot path: one stepSession per session on the store truncated to that session. */
function botReplay(options: RunOptions): Path {
  const first = options.first ?? 0;
  const last = options.last ?? options.bundle.calendar.length - 1;
  let state: PortfolioState = initialPortfolio();
  const sessions: SessionResult[] = [];
  for (let idx = first; idx <= last; idx += 1) {
    const store = truncate(options.bundle, idx);
    const calendar = new SessionCalendar(store.calendar, { holidays: options.holidays ?? [] });
    const input = buildSessionInput({
      bundle: store,
      session_idx: idx,
      content: options.content,
      universe: options.universeAt ? options.universeAt(idx) : options.universe,
      held: state.positions.map((p) => p.symbol),
      signals: signalProvider(store, options.signals),
    });
    const result = stepSession(state, input, calendar);
    sessions.push(result);
    state = result.next_state;
  }
  return flatten(sessions);
}

function flatten(sessions: SessionResult[]): Path {
  return {
    sessions,
    sells: sessions.flatMap((s) => s.sells.map((sell) => ({ ...sell, date: s.session }))),
    buys: sessions.flatMap((s) => s.buys.map((buy) => ({ ...buy, date: s.session }))),
  };
}

function backtest(options: RunOptions) {
  const cal = options.bundle.calendar;
  return runBasketBacktest({
    content: options.content,
    universe: options.universe,
    start: cal[options.first ?? 0]!,
    end: cal[options.last ?? cal.length - 1]!,
    data: options.bundle,
    signals: signalProvider(options.bundle, options.signals),
  });
}

/** Runs both paths, asserts they are identical, returns the Bot path + backtest result. */
function both(options: RunOptions) {
  const bot = botReplay(options);
  const bt = backtest(options);
  const strip = ({ sellable_from: _s, ...rest }: SessionBuy & { date: string }) => rest;
  expect(
    bt.trades.map(({ exit_session, pnl_pct: _p, ...sell }) => ({ ...sell, date: exit_session })),
  ).toEqual(bot.sells);
  expect(bt.curve.map((point) => point.nav_vnd)).toEqual(bot.sessions.map((s) => s.nav.nav_vnd));
  expect(bt.open_positions.map((p) => p.symbol)).toEqual(
    bot.sessions.at(-1)!.next_state.positions.map((p) => p.symbol),
  );
  // Buys: the backtest also exposes them through the NAV; compare the Bot path to a direct replay
  // on the full bundle (same calendar as the backtest).
  const full = flatten(fullReplay(options));
  expect(full.buys.map(strip)).toEqual(bot.buys.map(strip));
  return { bot, bt };
}

function fullReplay(options: RunOptions): SessionResult[] {
  const calendar = new SessionCalendar(options.bundle.calendar);
  const signals = signalProvider(options.bundle, options.signals);
  let state = initialPortfolio();
  const out: SessionResult[] = [];
  for (
    let idx = options.first ?? 0;
    idx <= (options.last ?? options.bundle.calendar.length - 1);
    idx += 1
  ) {
    const result = stepSession(
      state,
      buildSessionInput({
        bundle: options.bundle,
        session_idx: idx,
        content: options.content,
        universe: options.universe,
        held: state.positions.map((p) => p.symbol),
        signals,
      }),
      calendar,
    );
    out.push(result);
    state = result.next_state;
  }
  return out;
}

const CAL = weekdays('2025-01-06', 80);
const at = (idx: number) => CAL[idx]!;

// ------------------------------------------------------------------------------------------------
// Cases
// ------------------------------------------------------------------------------------------------

describe('shared rules · golden cases §16.1', () => {
  it('R01: bought in session 10, N = 30, no Sell → sold at the close of session 40, held 30', () => {
    const bundle = makeBundle(CAL, { AAA: { price: (i) => 20_000 + i * 10 } });
    const { bot, bt } = both({
      bundle,
      content: content(),
      universe: ['AAA'],
      signals: { buy: { AAA: [10] } },
    });
    expect(bot.buys).toHaveLength(1);
    expect(bot.buys[0]).toMatchObject({
      symbol: 'AAA',
      date: at(10),
      qty: 500,
      price_vnd: 20_100n,
    });
    expect(bot.sells).toHaveLength(1);
    expect(bot.sells[0]).toMatchObject({
      symbol: 'AAA',
      date: at(40),
      price_vnd: 20_400n,
      holding_sessions: 30,
      counted_sessions: 30,
      exit_reason: 'max_holding',
      exit_reasons: ['max_holding'],
      max_holding_at_exit: 30,
    });
    // Session 39: still held, journaled as waiting for the limit.
    const s39 = bot.sessions[39]!;
    expect(s39.sells).toHaveLength(0);
    expect(s39.journal.find((row) => row.symbol === 'AAA')).toMatchObject({
      code: 'no_sell_condition',
      counted_sessions: 29,
    });
    expect(bt.kpis.closed_trades).toBe(1);
    expect(bt.time_exits).toBe(1);
  });

  it('R02: Sell condition true in session 25 → sold there by indicator, never sold twice', () => {
    const bundle = makeBundle(CAL, { AAA: {} });
    const { bot } = both({
      bundle,
      content: content({ sell: true }),
      universe: ['AAA'],
      signals: { buy: { AAA: [10] }, sell: { AAA: [25, 40] } },
    });
    expect(bot.sells).toHaveLength(1);
    expect(bot.sells[0]).toMatchObject({
      date: at(25),
      exit_reason: 'indicator',
      exit_reasons: ['indicator'],
      holding_sessions: 15,
    });
  });

  it('R03: Sell and limit on the same session → one trade, reason indicator, both reasons, one fee', () => {
    const bundle = makeBundle(CAL, { AAA: { price: 20_000 } });
    const { bot } = both({
      bundle,
      content: content({ sell: true }),
      universe: ['AAA'],
      signals: { buy: { AAA: [10] }, sell: { AAA: [40] } },
    });
    expect(bot.sells).toHaveLength(1);
    const sell = bot.sells[0]!;
    expect(sell).toMatchObject({
      date: at(40),
      exit_reason: 'indicator',
      exit_reasons: ['indicator', 'max_holding'],
    });
    // 500 × 20.000 = 10.000.000; fee 0,15% = 15.000; tax 0,10% = 10.000 (charged once).
    expect(sell).toMatchObject({
      gross_vnd: 10_000_000n,
      fee_vnd: 15_000n,
      tax_vnd: 10_000n,
      net_vnd: 9_975_000n,
    });
  });

  it('R04: due with an unknown Sell condition → still sold by the limit', () => {
    const bundle = makeBundle(CAL, { AAA: {} });
    const { bot } = both({
      bundle,
      content: content({ sell: true }),
      universe: ['AAA'],
      signals: { buy: { AAA: [10] }, sellUnknown: { AAA: [38, 39, 40] } },
    });
    expect(bot.sessions[38]!.journal.find((r) => r.symbol === 'AAA')?.code).toBe('sell_unknown');
    expect(bot.sells[0]).toMatchObject({ date: at(40), exit_reason: 'max_holding' });
  });

  it('R05: due while the Sell side has a grant error → sold by the limit, error journaled', () => {
    const calendar = new SessionCalendar(CAL);
    const state: PortfolioState = {
      cash_vnd: 0n,
      positions: [
        {
          symbol: 'AAA',
          qty: 500,
          entry_session: at(10),
          entry_price_vnd: 20_000n,
          entry_cost_vnd: 10_015_000n,
          anchor_session: at(10),
          anchor_reason: 'entry',
        },
      ],
      last_session: at(39),
    };
    const result = stepSession(
      state,
      {
        session: at(40),
        strategy: { max_holding: 30, buy_enabled: true, sell_enabled: true },
        universe: [],
        symbols: {
          AAA: {
            close_vnd: 20_000n,
            gtgd20_vnd: 1n,
            buy_signal: null,
            sell_signal: true,
            sell_issue: 'Chỉ báo chưa mở: rsi',
          },
        },
      },
      calendar,
    );
    expect(result.sells).toHaveLength(1);
    // The signal is not trusted while the side errors: the exit is by the limit only.
    expect(result.sells[0]).toMatchObject({
      exit_reason: 'max_holding',
      sell_issue: 'Chỉ báo chưa mở: rsi',
    });
    expect(result.journal.find((r) => r.code === 'sell_issue')?.message).toContain(
      'Chỉ báo chưa mở: rsi',
    );
  });

  it('R06: due while suspended 3 sessions → no fill, "Đến hạn, chưa khớp", sold at the first priced session', () => {
    const bundle = makeBundle(CAL, { AAA: { missing: [40, 41, 42] } });
    const { bot } = both({
      bundle,
      content: content(),
      universe: ['AAA'],
      signals: { buy: { AAA: [10] } },
    });
    for (const idx of [40, 41, 42]) {
      const session = bot.sessions[idx]!;
      expect(session.sells).toHaveLength(0);
      expect(session.counters.due_unfilled).toBe(1);
      expect(session.journal.find((r) => r.symbol === 'AAA')).toMatchObject({
        code: 'due_unfilled',
        message: RULE_MESSAGES.due_unfilled,
        counted_sessions: 30 + (idx - 40),
      });
      // NAV keeps the last close (no invented price) and buys are blocked.
      expect(session.nav.complete).toBe(false);
    }
    expect(bot.sells).toHaveLength(1);
    expect(bot.sells[0]).toMatchObject({
      date: at(43),
      holding_sessions: 33,
      exit_reason: 'max_holding',
      price_vnd: 20_000n,
    });
  });

  it('R07: two buys and three due positions in one session → all three sold, both buy slots used', () => {
    // A,B bought at 0; C,D at 1 (two buys per session); A suspended at 30 → A, C, D due at 31.
    const bundle = makeBundle(CAL, {
      A: { volume: 9e6, missing: [30] },
      B: { volume: 8e6 },
      C: { volume: 7e6 },
      D: { volume: 6e6 },
      E: { volume: 5e6 },
      F: { volume: 4e6 },
    });
    const { bot } = both({
      bundle,
      content: content(),
      universe: ['A', 'B', 'C', 'D', 'E', 'F'],
      signals: { buy: { A: [0], B: [0], C: [1], D: [1], E: [31], F: [31] } },
    });
    const s31 = bot.sessions[31]!;
    expect(s31.sells.map((s) => s.symbol)).toEqual(['A', 'C', 'D']);
    expect(s31.sells.every((s) => s.exit_reason === 'max_holding')).toBe(true);
    expect(s31.buys.map((b) => b.symbol)).toEqual(['E', 'F']);
    expect(s31.counters).toMatchObject({ sells: 3, buys: 2, time_exits: 3 });
  });

  it('R08: Sell true at T+1 → not sold, journaled "chờ T+2"; T+2 re-evaluated with T+2 data', () => {
    const bundle = makeBundle(CAL, { AAA: {}, BBB: { volume: 5e5 } });
    const { bot } = both({
      bundle,
      content: content({ sell: true }),
      universe: ['AAA', 'BBB'],
      // AAA: Sell true at T+1 only → never sold early; BBB: Sell true at T+1 and T+2 → sold at T+2.
      signals: { buy: { AAA: [10], BBB: [10] }, sell: { AAA: [11], BBB: [11, 12] } },
    });
    const s11 = bot.sessions[11]!;
    expect(s11.sells).toHaveLength(0);
    expect(s11.counters.t2_blocked).toBe(2);
    expect(s11.journal.filter((r) => r.code === 't2_wait').map((r) => r.symbol)).toEqual([
      'AAA',
      'BBB',
    ]);
    expect(bot.sells.map((s) => [s.symbol, s.date])).toEqual([
      ['BBB', at(12)],
      ['AAA', at(40)],
    ]);
  });

  it('R09: bought Thursday, Friday and Monday closed → sellable from Wednesday', () => {
    // 2025-04-17 Thu; 2025-04-18 Fri and 2025-04-21 Mon are holidays → T+1 Tue 22, T+2 Wed 23.
    const holidays = new Set(['2025-04-18', '2025-04-21']);
    const cal = weekdays('2025-04-01', 30, holidays);
    const thu = cal.indexOf('2025-04-17');
    const calendar = new SessionCalendar(cal);
    expect(calendar.addSessions('2025-04-17', 2)).toBe('2025-04-23');
    // Predicted (Bot at Thursday's cutoff: Friday/Monday not yet in the store).
    const predicted = new SessionCalendar(cal.slice(0, thu + 1), { holidays });
    expect(predicted.addSessions('2025-04-17', 2)).toBe('2025-04-23');
    const bundle = makeBundle(cal, { AAA: {} });
    const { bot } = both({
      bundle,
      content: content({ sell: true }),
      universe: ['AAA'],
      signals: { buy: { AAA: [thu] }, sell: { AAA: [thu + 1, thu + 2] } },
      holidays: [...holidays],
    });
    expect(bot.buys[0]).toMatchObject({ date: '2025-04-17', sellable_from: '2025-04-23' });
    expect(bot.sessions[thu + 1]!.journal[0]).toMatchObject({ code: 't2_wait', symbol: 'AAA' });
    expect(bot.sells[0]).toMatchObject({ date: '2025-04-23', holding_sessions: 2 });
  });

  it('R10 + R13: cash from a sell is usable at once; the three skip reasons are recorded', () => {
    const specs: Record<string, SymSpec> = {};
    const buy: Record<string, number[]> = {};
    for (let k = 1; k <= 10; k += 1) {
      const symbol = `S${String(k).padStart(2, '0')}`;
      specs[symbol] = { price: 10_000, volume: 1e7 - k * 1e5 };
    }
    // Sessions 0–3 fill eight positions, 4 a ninth (cash then 851.500 đ).
    buy.S01 = [0];
    buy.S02 = [0];
    buy.S03 = [1];
    buy.S04 = [1];
    buy.S05 = [2];
    buy.S06 = [2];
    buy.S07 = [3];
    buy.S08 = [3];
    buy.S09 = [4];
    buy.S10 = [5, 6];
    specs.HIGH = { price: 150_000, volume: 1 };
    buy.HIGH = [0];
    const bundle = makeBundle(CAL, specs);
    const { bot, bt } = both({
      bundle,
      content: content({ sell: true }),
      universe: Object.keys(specs),
      signals: { buy, sell: { S01: [6] } },
      last: 10,
    });
    // R13: session 0 — S01, S02 bought, HIGH skipped by the two-buy limit.
    expect(bot.sessions[0]!.skips).toEqual([
      expect.objectContaining({
        symbol: 'HIGH',
        code: 'session_buy_limit',
        message: 'Đã đủ 2 lệnh mua trong phiên',
      }),
    ]);
    // Session 5: S10 needs a lot (1.001.500 đ) with 851.500 đ cash → insufficient cash.
    expect(bot.sessions[5]!.nav.cash_after_sells_vnd).toBe(851_500n);
    expect(bot.sessions[5]!.skips).toEqual([
      expect.objectContaining({
        symbol: 'S10',
        code: 'insufficient_cash',
        message: 'Không đủ tiền mặt cho 1 lô',
      }),
    ]);
    // R10: session 6 sells S01 (net 10.972.500 đ) and buys S10 with that cash, same session.
    const s6 = bot.sessions[6]!;
    expect(s6.sells.map((s) => s.symbol)).toEqual(['S01']);
    expect(s6.nav.cash_after_sells_vnd).toBe(851_500n + 10_972_500n);
    expect(s6.buys).toEqual([expect.objectContaining({ symbol: 'S10', qty: 1_100 })]);
    // 12% NAV below one lot of a high-priced symbol while cash is enough → budget_below_lot.
    const sizing = sizeBuy(100_000_000n, 100_000_000n, 150_000n, DEFAULT_FEE_RULES);
    expect(sizing).toMatchObject({ ok: false, code: 'budget_below_lot' });
    expect(bt.skipped_orders.counts).toEqual({ session_buy_limit: 1, insufficient_cash: 1 });
  });

  it('R11: five candidates, different GTGD TB20 and a tie → the two highest, tie A→Z', () => {
    const bundle = makeBundle(CAL, {
      AAA: { volume: 1e6 },
      BBB: { volume: 3e6 },
      CCC: { volume: 3e6 },
      DDD: { volume: 2e6 },
      EEE: { volume: 4e6 },
    });
    const { bot } = both({
      bundle,
      content: content(),
      universe: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'],
      signals: { buy: { AAA: [25], BBB: [25], CCC: [25], DDD: [25], EEE: [25] } },
    });
    const s = bot.sessions[25]!;
    expect(s.buys.map((b) => [b.symbol, b.rank])).toEqual([
      ['EEE', 1],
      ['BBB', 2],
    ]);
    expect(s.skips.map((k) => [k.symbol, k.rank, k.code])).toEqual([
      ['CCC', 3, 'session_buy_limit'],
      ['DDD', 4, 'session_buy_limit'],
      ['AAA', 5, 'session_buy_limit'],
    ]);
    // GTGD TB20 = close × volume mean (20.000 × 4.000.000).
    expect(s.buys[0]!.gtgd20_vnd).toBe(80_000_000_000n);
  });

  it('R12: a symbol sold in the session is not bought back in that session', () => {
    const bundle = makeBundle(CAL, { AAA: {} });
    const { bot } = both({
      bundle,
      content: content({ sell: true }),
      universe: ['AAA'],
      signals: { buy: { AAA: [10, 20, 21] }, sell: { AAA: [20] } },
      last: 30,
    });
    expect(bot.sells.map((s) => s.date)).toEqual([at(20)]);
    expect(bot.sessions[20]!.buys).toHaveLength(0);
    expect(bot.sessions[20]!.skips).toHaveLength(0);
    expect(bot.buys.map((b) => b.date)).toEqual([at(10), at(21)]);
  });

  it('R14: retrying the same session neither resells nor duplicates; same input → same result', () => {
    const bundle = makeBundle(CAL, { AAA: {} });
    const options: RunOptions = {
      bundle,
      content: content(),
      universe: ['AAA'],
      signals: { buy: { AAA: [10] } },
    };
    const path = botReplay({ ...options, last: 39 });
    const before = path.sessions.at(-1)!.next_state;
    const calendar = new SessionCalendar(bundle.calendar);
    const input = buildSessionInput({
      bundle,
      session_idx: 40,
      content: options.content,
      universe: ['AAA'],
      held: before.positions.map((p) => p.symbol),
      signals: signalProvider(bundle, options.signals),
    });
    const first = stepSession(before, input, calendar);
    const retry = stepSession(before, input, calendar);
    expect(retry).toEqual(first);
    expect(first.sells).toHaveLength(1);
    expect(() => stepSession(first.next_state, input, calendar)).toThrow(StrategyRulesError);
    expect(() => stepSession(first.next_state, input, calendar)).toThrow(/đã được xử lý/);
    // Backtest twice → identical.
    expect(backtest(options)).toEqual(backtest(options));
  });

  it('R16: prices stay in VND end to end (FPT-like close in tens of thousands)', () => {
    const bundle = makeBundle(CAL, { FPT: { price: 118_500 } });
    const { bot, bt } = both({
      bundle,
      content: content(),
      universe: ['FPT'],
      signals: { buy: { FPT: [5] } },
      last: 20,
    });
    expect(bot.buys[0]!.price_vnd).toBe(118_500n);
    // 12.000.000 / (118.500 × 1,0015) → 1 lot.
    expect(bot.buys[0]!.qty).toBe(100);
    expect(bt.open_positions[0]!.entry_price_vnd).toBe(118_500n);
    expect(bt.open_positions[0]!.entry_price_vnd).toBeGreaterThanOrEqual(10_000n);
  });

  it('R17: a held symbol outside the current universe is still sold by Sell/limit', () => {
    const bundle = makeBundle(CAL, { AAA: {}, BBB: {} });
    const path = botReplay({
      bundle,
      content: content({ sell: true }),
      universe: [],
      universeAt: (idx) => (idx < 15 ? ['AAA'] : ['BBB']),
      signals: { buy: { AAA: [10] }, sell: { AAA: [20] } },
    });
    expect(path.sells).toEqual([
      expect.objectContaining({ symbol: 'AAA', date: at(20), exit_reason: 'indicator' }),
    ]);
    // And by the limit when no Sell fires.
    const limit = botReplay({
      bundle,
      content: content(),
      universe: [],
      universeAt: (idx) => (idx < 15 ? ['AAA'] : []),
      signals: { buy: { AAA: [10] } },
    });
    expect(limit.sells).toEqual([
      expect.objectContaining({ symbol: 'AAA', date: at(40), exit_reason: 'max_holding' }),
    ]);
    expect(limit.sessions[20]!.journal.find((r) => r.code === 'universe_empty')?.message).toBe(
      'Rổ mua không có mã',
    );
  });
});

describe('shared rules · Bot behaviour table §3.6 and NAV after sells', () => {
  const calendar = new SessionCalendar(CAL);
  const position = (symbol: string, entry: number) => ({
    symbol,
    qty: 500,
    entry_session: at(entry),
    entry_price_vnd: 20_000n,
    entry_cost_vnd: 10_015_000n,
    anchor_session: at(entry),
    anchor_reason: 'entry' as const,
  });

  it('no strategy chosen: no buy, held positions sold at N = 30', () => {
    const result = stepSession(
      { cash_vnd: 1_000_000_000n, positions: [position('AAA', 0)], last_session: at(29) },
      {
        session: at(30),
        strategy: null,
        universe: ['BBB'],
        symbols: {
          AAA: { close_vnd: 20_000n, gtgd20_vnd: 1n, buy_signal: null, sell_signal: true },
          BBB: { close_vnd: 20_000n, gtgd20_vnd: 1n, buy_signal: true, sell_signal: null },
        },
      },
      calendar,
    );
    expect(result.sells).toEqual([
      expect.objectContaining({
        symbol: 'AAA',
        exit_reason: 'max_holding',
        max_holding_at_exit: 30,
      }),
    ]);
    expect(result.buys).toHaveLength(0);
    expect(result.journal.at(-1)).toMatchObject({
      code: 'no_strategy',
      message: 'Chưa chọn chiến lược · không mua mới',
    });
  });

  it('sell-only strategy: no buy; sells by condition', () => {
    const c = { ...content({ sell: true }), sell_only: true };
    c.indicators.rsi!.buy.enabled = false;
    const strategy = sessionStrategyOf(c);
    expect(strategy).toEqual({ max_holding: 30, buy_enabled: false, sell_enabled: true });
    const result = stepSession(
      { cash_vnd: 0n, positions: [position('AAA', 0)], last_session: at(4) },
      {
        session: at(5),
        strategy,
        universe: ['BBB'],
        symbols: {
          AAA: { close_vnd: 20_000n, gtgd20_vnd: 1n, buy_signal: null, sell_signal: true },
          BBB: { close_vnd: 20_000n, gtgd20_vnd: 1n, buy_signal: true, sell_signal: null },
        },
      },
      calendar,
    );
    expect(result.sells.map((s) => s.exit_reason)).toEqual(['indicator']);
    expect(result.buys).toHaveLength(0);
    expect(result.journal.at(-1)?.code).toBe('sell_only');
  });

  it('sizing NAV is computed after the sells (D5b) and a converted anchor counts from P (Q20)', () => {
    const converted = {
      ...position('OLD', 0),
      anchor_session: at(50),
      anchor_reason: 'policy_cutover' as const,
    };
    const result = stepSession(
      { cash_vnd: 0n, positions: [position('AAA', 0), converted], last_session: at(59) },
      {
        session: at(60),
        strategy: { max_holding: 30, buy_enabled: true, sell_enabled: false },
        universe: ['BBB'],
        symbols: {
          AAA: { close_vnd: 30_000n, gtgd20_vnd: 1n, buy_signal: null, sell_signal: null },
          OLD: { close_vnd: 30_000n, gtgd20_vnd: 1n, buy_signal: null, sell_signal: null },
          BBB: { close_vnd: 10_000n, gtgd20_vnd: 1n, buy_signal: true, sell_signal: null },
        },
      },
      calendar,
    );
    // AAA held 60 ≥ 30 → sold; OLD held 60 but counted 10 from P → kept, "Thực giữ" 60.
    expect(result.sells.map((s) => s.symbol)).toEqual(['AAA']);
    expect(result.journal.find((r) => r.symbol === 'OLD')).toMatchObject({
      counted_sessions: 10,
      holding_sessions: 60,
    });
    // Cash after sells 14.962.500; NAV = 14.962.500 + 500 × 30.000 = 29.962.500 → 12% = 3.595.500.
    expect(result.nav.sizing_nav_vnd).toBe(29_962_500n);
    expect(result.buys[0]).toMatchObject({ symbol: 'BBB', qty: 300, budget_vnd: 3_595_500n });
  });

  it('a held symbol without a close blocks new buys (no NAV with an invented price)', () => {
    const result = stepSession(
      { cash_vnd: 50_000_000n, positions: [position('AAA', 0)], last_session: at(4) },
      {
        session: at(5),
        strategy: { max_holding: 30, buy_enabled: true, sell_enabled: true },
        universe: ['BBB'],
        symbols: {
          AAA: {
            close_vnd: null,
            last_close_vnd: 19_000n,
            gtgd20_vnd: null,
            buy_signal: null,
            sell_signal: null,
          },
          BBB: { close_vnd: 10_000n, gtgd20_vnd: 1n, buy_signal: true, sell_signal: null },
        },
      },
      calendar,
    );
    expect(result.buys).toHaveLength(0);
    expect(result.nav).toMatchObject({
      complete: false,
      sizing_nav_vnd: null,
      nav_vnd: 50_000_000n + 500n * 19_000n,
    });
    expect(result.journal.map((r) => r.code)).toEqual(['no_price', 'nav_incomplete']);
  });
});

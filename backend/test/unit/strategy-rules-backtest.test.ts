/**
 * Basket Backtest with real indicator signals (§4.7, §4.8, §16.2 S11/S12) and Bot parity on the
 * same store (R15 at module level): content, calendar, universe and date-range helpers.
 */

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import {
  annualizedReturnPct,
  buildSessionInput,
  checkDateRange,
  computeSymbolSignals,
  createSignalProvider,
  defaultRange,
  earliestStart,
  excludedSymbolsNotice,
  initialPortfolio,
  jsonSafe,
  maxDrawdownPct,
  resolveUniverse,
  runBasketBacktest,
  SessionCalendar,
  stepSession,
  strategyConfigHash,
  validateStrategyContent,
  type PortfolioState,
  type PriceSeriesBundle,
  type StrategyContent,
  type SymbolSeries,
} from '../../src/modules/strategy-rules/index.js';

function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Random-walk OHLCV per symbol, integer VND; `startAt` delays a symbol's first bar. */
function randomBundle(
  calendar: string[],
  symbols: string[],
  options: { startAt?: Record<string, number>; market?: boolean } = {},
): PriceSeriesBundle {
  const out: Record<string, SymbolSeries> = {};
  symbols.forEach((symbol, k) => {
    const rand = lcg(1_000 + k * 7_919);
    const from = options.startAt?.[symbol] ?? 0;
    const n = calendar.length - from;
    const close = new Float64Array(n);
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const volume = new Float64Array(n);
    let price = 10_000 + k * 1_000;
    for (let i = 0; i < n; i += 1) {
      const o = price;
      price = Math.max(1_000, Math.round(price * (1 + (rand() - 0.5) * 0.06)));
      open[i] = o;
      close[i] = price;
      high[i] = Math.max(o, price) + 50;
      low[i] = Math.min(o, price) - 50;
      volume[i] = Math.round(100_000 + rand() * 900_000);
    }
    out[symbol] = {
      symbol,
      session_idx: Int32Array.from({ length: n }, (_, i) => from + i),
      open,
      high,
      low,
      close,
      volume,
      series_rev: 1,
    };
  });
  return {
    calendar,
    data_as_of: calendar.at(-1)!,
    symbols: out,
    market:
      options.market === false
        ? null
        : Float64Array.from(calendar, (_, i) => 1_200 + Math.sin(i / 10) * 50),
    data_hash: 'random',
  };
}

/** RSI < 45 buys, RSI > 55 sells (one row each): trades often on a random walk. */
function rsiContent(
  maxHolding: number,
  universe: StrategyContent['universe'] = { type: 'vn30' },
): StrategyContent {
  const indicators = structuredClone(defaultConfig().indicators);
  const rsi = indicators.rsi!;
  rsi.master_enabled = true;
  rsi.buy.enabled = true;
  rsi.sell.enabled = true;
  const rows = (side: 'buy' | 'sell') => rsi[side].rules as Array<Record<string, unknown>>;
  rows('buy')[0] = { ...rows('buy')[0], op: '<', threshold: 45 };
  rows('buy')[1] = { ...rows('buy')[1], enabled: false };
  rows('sell')[0] = { ...rows('sell')[0], op: '>', threshold: 55 };
  rows('sell')[1] = { ...rows('sell')[1], enabled: false };
  return { universe, indicators, max_holding: maxHolding };
}

const CAL = weekdays('2023-01-02', 700);
const SYMBOLS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH'];

describe('strategy content', () => {
  it('validates, normalises and hashes canonically', () => {
    const content = rsiContent(30, {
      type: 'saved_list',
      list_id: 'l1',
      list_name: ' Ds ',
      symbols: ['ccc', 'AAA', 'CCC'],
    });
    const result = validateStrategyContent(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.universe).toEqual({
      type: 'saved_list',
      list_id: 'l1',
      list_name: 'Ds',
      symbols: ['AAA', 'CCC'],
    });
    expect(result.config_hash).toMatch(/^[a-f0-9]{64}$/);
    // Key order does not change the hash; sell_only=false is dropped.
    const reordered = {
      max_holding: 30,
      indicators: content.indicators,
      universe: content.universe,
      sell_only: false,
    };
    expect(strategyConfigHash(reordered)).toBe(result.config_hash);
  });

  it('rejects: max_holding out of range, no Buy row, IQX without Sell row / with a saved list', () => {
    const bad = (input: unknown, kind?: 'user' | 'iqx') => validateStrategyContent(input, { kind });
    expect(bad({ ...rsiContent(2) })).toMatchObject({ ok: false, code: 'STRATEGY_INVALID' });
    expect(bad({ ...rsiContent(30.5) })).toMatchObject({ ok: false, code: 'STRATEGY_INVALID' });
    expect(bad({ ...rsiContent(251) })).toMatchObject({ ok: false, code: 'STRATEGY_INVALID' });
    const noBuy = rsiContent(30);
    noBuy.indicators.rsi!.buy.enabled = false;
    const noBuyResult = bad(noBuy);
    expect(noBuyResult).toMatchObject({ ok: false, code: 'STRATEGY_INVALID' });
    if (!noBuyResult.ok)
      expect(noBuyResult.issues[0]!.message).toBe('Cần ít nhất một dòng Mua đang bật.');
    // Sell side may be empty for users, not for IQX.
    const noSell = rsiContent(30);
    noSell.indicators.rsi!.sell.enabled = false;
    expect(bad(noSell).ok).toBe(true);
    expect(bad(noSell, 'iqx')).toMatchObject({ ok: false, code: 'STRATEGY_INVALID' });
    expect(
      bad(
        rsiContent(30, { type: 'saved_list', list_id: 'x', list_name: 'x', symbols: ['AAA'] }),
        'iqx',
      ),
    ).toMatchObject({ ok: false });
    // sell_only only for converted strategies.
    const sellOnly = { ...noBuy, sell_only: true };
    expect(bad(sellOnly).ok).toBe(false);
    expect(validateStrategyContent(sellOnly, { kind: 'converted' }).ok).toBe(true);
    expect(
      bad({ universe: { type: 'vn30' }, indicators: {}, max_holding: 30, extra: 1 }),
    ).toMatchObject({ ok: false });
  });

  it('saved list filtered to the store; nothing left → UNIVERSE_EMPTY', () => {
    const content = rsiContent(30, {
      type: 'saved_list',
      list_id: 'l',
      list_name: 'L',
      symbols: ['AAA', 'ZZZ'],
    });
    const kept = validateStrategyContent(content, { eligibleSymbols: new Set(['AAA']) });
    expect(kept.ok && kept.content.universe).toMatchObject({ symbols: ['AAA'] });
    const empty = validateStrategyContent(content, { eligibleSymbols: new Set(['BBB']) });
    expect(empty).toMatchObject({ ok: false, code: 'UNIVERSE_EMPTY' });
    if (!empty.ok)
      expect(empty.issues[0]!.message).toBe('Danh mục này không có mã nào thuộc VN100.');
  });
});

describe('universe and date range', () => {
  it('resolves VN30/VN100 to store members and filters a saved list', () => {
    const eligibility = { vn30: ['BBB', 'AAA'], vn100: ['AAA', 'BBB', 'CCC'] };
    expect(resolveUniverse({ type: 'vn30' }, eligibility)).toEqual({
      ok: true,
      symbols: ['AAA', 'BBB'],
      excluded: [],
    });
    expect(
      resolveUniverse(
        { type: 'saved_list', list_id: 'l', list_name: 'L', symbols: ['CCC', 'XYZ', 'ABC'] },
        eligibility,
      ),
    ).toEqual({ ok: true, symbols: ['CCC'], excluded: ['ABC', 'XYZ'] });
    expect(
      resolveUniverse(
        { type: 'saved_list', list_id: 'l', list_name: 'L', symbols: ['XYZ'] },
        eligibility,
      ),
    ).toMatchObject({
      ok: false,
      code: 'UNIVERSE_EMPTY',
    });
    expect(excludedSymbolsNotice(['ABC', 'XYZ'], 1)).toBe(
      'Bỏ 2 mã ngoài VN100 (không có trong kho dữ liệu): ABC, XYZ. Backtest và Bot chỉ dùng 1 mã còn lại.',
    );
  });

  it('§2.3: earliest = session #451, latest = data_as_of, end > start, ≤ 3653 days', () => {
    const cal = weekdays('2012-03-01', 3_800);
    const earliest = earliestStart(cal)!;
    expect(earliest).toBe(cal[450]);
    expect(checkDateRange(cal, earliest, cal.at(-1)!)).toMatchObject({ ok: false }); // > 3653 days
    expect(checkDateRange(cal, cal[449]!, cal[600]!)).toMatchObject({
      ok: false,
      code: 'DATE_RANGE_INVALID',
    });
    expect(checkDateRange(cal, cal[600]!, cal[600]!)).toMatchObject({ ok: false });
    expect(checkDateRange(cal, cal[600]!, '2099-01-01')).toMatchObject({ ok: false });
    expect(checkDateRange(cal, '2020-02-30', cal.at(-1)!)).toMatchObject({ ok: false });
    expect(checkDateRange(cal, cal[1_500]!, cal.at(-1)!)).toMatchObject({ ok: true });
    const range = defaultRange(cal)!;
    expect(range.end).toBe(cal.at(-1));
    expect(Number(range.end.slice(0, 4)) - Number(range.start.slice(0, 4))).toBe(2);
  });

  it('calendar: holding count, predicted sessions, sessions between', () => {
    const calendar = new SessionCalendar(['2025-01-02', '2025-01-03', '2025-01-06'], {
      holidays: ['2025-01-08'],
    });
    expect(calendar.countSessions('2025-01-02', '2025-01-06')).toBe(2);
    expect(calendar.countSessions('2025-01-06', '2025-01-02')).toBe(0);
    // Predicted: 07 (Tue), 08 holiday, 09 (Thu).
    expect(calendar.addSessions('2025-01-06', 2)).toBe('2025-01-09');
    expect(calendar.countSessions('2025-01-02', '2025-01-09')).toBe(4);
    expect(calendar.predictFuture(2)).toEqual(['2025-01-07', '2025-01-09']);
    expect(calendar.sessionsBetween('2025-01-03', '2025-01-31')).toEqual([
      '2025-01-03',
      '2025-01-06',
    ]);
    expect(new SessionCalendar(['2025-01-02']).addSessions('2025-01-02', 1)).toBeNull();
  });
});

describe('KPIs §4.7', () => {
  it('annualised is — below 60 sessions; drawdown from the capital peak', () => {
    expect(annualizedReturnPct(110_000_000n, 100_000_000n, 59)).toBeNull();
    expect(annualizedReturnPct(110_000_000n, 100_000_000n, 252)).toBeCloseTo(10, 6);
    expect(annualizedReturnPct(110_000_000n, 100_000_000n, 60)).toBeCloseTo(
      (1.1 ** (252 / 60) - 1) * 100,
      6,
    );
    expect(
      maxDrawdownPct([90_000_000n, 120_000_000n, 96_000_000n, 130_000_000n], 100_000_000n),
    ).toBeCloseTo(-20, 9);
    expect(maxDrawdownPct([100_000_000n, 101_000_000n], 100_000_000n)).toBe(0);
  });

  it('short run: annualised null, win rate null without trades, buy&hold and VN-Index lines', () => {
    const cal = CAL.slice(0, 520);
    const bundle = randomBundle(cal, ['AAA', 'BBB']);
    const result = runBasketBacktest({
      content: rsiContent(30),
      universe: ['AAA', 'BBB'],
      start: cal[480]!,
      end: cal[519]!,
      data: bundle,
      signals: () => null,
    });
    expect(result.sessions).toBe(40);
    expect(result.kpis).toMatchObject({
      annualized_return_pct: null,
      win_rate_pct: null,
      closed_trades: 0,
      total_return_pct: 0,
    });
    // B&H: mean(p_t / p_0) / (1 + 0,15%) − 1.
    const p = (s: string, i: number) => bundle.symbols[s]!.close[i]!;
    const expected =
      ((p('AAA', 519) / p('AAA', 480) + p('BBB', 519) / p('BBB', 480)) / 2 / 1.0015 - 1) * 100;
    expect(result.kpis.basket_buy_hold_pct).toBeCloseTo(expected, 3);
    const m = bundle.market!;
    expect(result.kpis.vnindex_pct).toBeCloseTo((m[519]! / m[480]! - 1) * 100, 3);
    expect(result.curve[0]).toMatchObject({ date: cal[480], strategy: 0 });
  });
});

describe('basket Backtest with real signals', () => {
  it('S11: N = 5 → every closed trade held 2..5 sessions; nothing sold before entry + 2', () => {
    const bundle = randomBundle(CAL, SYMBOLS);
    const result = runBasketBacktest({
      content: rsiContent(5),
      universe: SYMBOLS,
      start: CAL[460]!,
      end: CAL.at(-1)!,
      data: bundle,
    });
    expect(result.trades.length).toBeGreaterThan(20);
    expect(result.trades.some((t) => t.exit_reason === 'max_holding')).toBe(true);
    expect(result.trades.some((t) => t.exit_reason === 'indicator')).toBe(true);
    for (const trade of result.trades) {
      expect(trade.holding_sessions).toBeGreaterThanOrEqual(2);
      expect(trade.holding_sessions).toBeLessThanOrEqual(5);
    }
    expect(result.kpis.annualized_return_pct).not.toBeNull();
    expect(result.kpis.win_rate_pct).not.toBeNull();
    const sumPnl = result.per_symbol.reduce(
      (t, r) => t + r.realized_pnl_vnd + r.unrealized_pnl_vnd,
      0n,
    );
    // Realised + unrealised (before sell fee) = final NAV − capital.
    expect(sumPnl).toBe(result.final_nav_vnd - 100_000_000n);
    expect(result.skipped_orders.items.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(jsonSafe(result))).toContain('"rules_version":"iqx-strategy-rules-2.0"');
  });

  it('warnings §4.8: current members, excluded symbols, short history, no VN-Index', () => {
    const bundle = randomBundle(CAL, ['AAA', 'BBB'], { startAt: { BBB: 600 }, market: false });
    const result = runBasketBacktest({
      content: rsiContent(30),
      universe: ['AAA', 'BBB'],
      excluded_symbols: ['XYZ'],
      start: CAL[460]!,
      end: CAL.at(-1)!,
      data: bundle,
    });
    expect(result.warnings.map((w) => w.code)).toEqual([
      'UNIVERSE_CURRENT_MEMBERS',
      'SYMBOLS_EXCLUDED',
      'SYMBOL_SHORT_HISTORY',
      'MARKET_CONTEXT_UNAVAILABLE',
    ]);
    expect(result.warnings[2]!.message).toMatch(/^BBB: chỉ có dữ liệu từ \d{2}\/\d{2}\/\d{4}$/);
    expect(result.kpis.vnindex_pct).toBeNull();
    expect(result.basket_buy_hold.symbols).toEqual(['AAA']);
    const saved = runBasketBacktest({
      content: rsiContent(30, {
        type: 'saved_list',
        list_id: 'l',
        list_name: 'L',
        symbols: ['AAA'],
      }),
      universe: ['AAA'],
      start: CAL[460]!,
      end: CAL.at(-1)!,
      data: bundle,
    });
    expect(saved.warnings[0]!.code).toBe('UNIVERSE_SNAPSHOT');
  });

  it('signals are causal: computed on the store up to D equal the full-series value at D (D7)', () => {
    const bundle = randomBundle(CAL, ['AAA']);
    const content = rsiContent(30);
    const full = computeSymbolSignals(content, bundle.symbols.AAA!, CAL);
    for (const d of [30, 200, 455, 699]) {
      const series = bundle.symbols.AAA!;
      const cut: SymbolSeries = {
        ...series,
        session_idx: series.session_idx.slice(0, d + 1),
        open: series.open.slice(0, d + 1),
        high: series.high.slice(0, d + 1),
        low: series.low.slice(0, d + 1),
        close: series.close.slice(0, d + 1),
        volume: series.volume.slice(0, d + 1),
      };
      const partial = computeSymbolSignals(content, cut, CAL.slice(0, d + 1));
      expect([partial.buy[d], partial.sell[d]]).toEqual([full.buy[d], full.sell[d]]);
    }
  });

  it('R15 (module level): a Bot replay of 60 sessions on the store-as-of-D equals the Backtest', () => {
    const bundle = randomBundle(CAL, SYMBOLS);
    const content = rsiContent(10);
    const first = 600;
    const last = 659;
    const bt = runBasketBacktest({
      content,
      universe: SYMBOLS,
      start: CAL[first]!,
      end: CAL[last]!,
      data: bundle,
    });
    let state: PortfolioState = initialPortfolio();
    const navs: bigint[] = [];
    const sells: string[] = [];
    for (let idx = first; idx <= last; idx += 1) {
      // The store the Bot sees at D: every series cut at D, signals recomputed from the first bar.
      const cut = (series: SymbolSeries): SymbolSeries => {
        const n = series.session_idx.findIndex((value) => value > idx);
        const end = n < 0 ? series.session_idx.length : n;
        return {
          ...series,
          session_idx: series.session_idx.slice(0, end),
          open: series.open.slice(0, end),
          high: series.high.slice(0, end),
          low: series.low.slice(0, end),
          close: series.close.slice(0, end),
          volume: series.volume.slice(0, end),
        };
      };
      const store: PriceSeriesBundle = {
        ...bundle,
        calendar: CAL.slice(0, idx + 1),
        symbols: Object.fromEntries(
          Object.entries(bundle.symbols).map(([s, series]) => [s, cut(series)]),
        ),
        market: bundle.market!.slice(0, idx + 1),
      };
      const result = stepSession(
        state,
        buildSessionInput({
          bundle: store,
          session_idx: idx,
          content,
          universe: SYMBOLS,
          held: state.positions.map((p) => p.symbol),
          signals: createSignalProvider(content, store),
        }),
        new SessionCalendar(store.calendar),
      );
      navs.push(result.nav.nav_vnd);
      sells.push(
        ...result.sells.map((s) => `${result.session}:${s.symbol}:${s.qty}:${s.exit_reason}`),
      );
      state = result.next_state;
    }
    expect(bt.trades.length).toBeGreaterThan(0);
    expect(navs).toEqual(bt.curve.map((p) => p.nav_vnd));
    expect(sells).toEqual(
      bt.trades.map((t) => `${t.exit_session}:${t.symbol}:${t.qty}:${t.exit_reason}`),
    );
  });

  it('signal cache: a second run reuses the per-symbol series (same result)', () => {
    const bundle = randomBundle(CAL, SYMBOLS);
    const cache = new Map();
    const input = {
      content: rsiContent(20),
      universe: SYMBOLS,
      start: CAL[460]!,
      end: CAL.at(-1)!,
      data: bundle,
      signal_cache: cache,
    };
    const a = runBasketBacktest(input);
    expect(cache.size).toBe(SYMBOLS.length);
    const b = runBasketBacktest(input);
    expect(b).toEqual(a);
  });
});

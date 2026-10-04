import { describe, expect, it } from 'vitest';
import {
  AdvancedEngineError,
  EXIT_PRIORITY,
  runSystem,
  systemCapabilities,
  validateSystemOptions,
  type SystemInput,
  type SystemOptions,
  type SystemResult,
  type SystemSymbolData,
} from '../../src/modules/quant/v2/advanced/index.js';
import {
  EngineRunError,
  defaultConfig,
  runBacktest,
  type Bar,
  type IndicatorConfig,
  type RunOptions,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import { deepFreeze, expectDeepClose, reference } from '../fixtures/bot-v2/reference.js';

/*
 * Hand-made scenarios. Unless stated otherwise: capital 100,000, fees 0, lot
 * 100, min_held_bars 2, execution same_close, MA(5) Buy = close > MA5 and the
 * Sell side switched OFF, so only the advanced exits close positions.
 * Bars 0–4 close at 90 (MA5 at bar 4 = 90, close not > MA → no signal) and bar
 * 5 closes at 100 (MA5 = (4×90+100)/5 = 92 → Buy) → all-cash fill of
 * floor(100,000 / (100×100))×100 = 1,000 shares at 100, cash 0.
 */

type Ohlc = [open: number, high: number, low: number, close: number];

const DAY = 86_400_000;
const dateAt = (i: number): string =>
  new Date(Date.UTC(2024, 0, 1) + i * DAY).toISOString().slice(0, 10);
const toBars = (rows: readonly Ohlc[]): Bar[] =>
  rows.map(([open, high, low, close], i) => ({
    date: dateAt(i),
    open,
    high,
    low,
    close,
    volume: 1000,
  }));
/** Flat OHLC bar at `c`. */
const flat = (c: number): Ohlc => [c, c, c, c];
/** Bars 0–4 flat at 90, bar 5 closes at 100 → Buy signal on bar 5. */
const ENTRY: Ohlc[] = [flat(90), flat(90), flat(90), flat(90), flat(90), [90, 100, 90, 100]];

const HAND: Partial<RunOptions> = {
  capital: 100_000,
  fee_buy: 0,
  fee_sell: 0,
  lot: 100,
  execution: 'same_close',
  min_held_bars: 2,
};

function indicator(config: SharedConfig, id: string): IndicatorConfig {
  const item = config.indicators[id];
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

/** MA(5) Buy; Sell OFF unless `sell` is true (then Sell = close < MA5). */
function maConfig(sell = false): SharedConfig {
  const c = defaultConfig();
  const ma = indicator(c, 'ma');
  ma.master_enabled = true;
  ma.buy.params.period = 5;
  ma.sell.params.period = 5;
  ma.sell.enabled = sell;
  return c;
}

function run(
  symbols: SystemSymbolData[],
  system: SystemOptions = {},
  extra: Partial<SystemInput> = {},
  options: Partial<RunOptions> = HAND,
  config: SharedConfig = maConfig(),
): SystemResult {
  return runSystem({ config, symbols, options, system, ...extra });
}
const one = (rows: Ohlc[], symbol = 'AAA', sector?: string): SystemSymbolData => ({
  symbol,
  bars: toBars(rows),
  ...(sector ? { sector } : {}),
});

describe('quant v2 advanced — runSystem parity with the single run', () => {
  const bars = deepFreeze(reference.syntheticBars(950));
  const config = (): SharedConfig => {
    const c = defaultConfig();
    indicator(c, 'ma').master_enabled = true;
    indicator(c, 'ma').sell.params.period = 30;
    return c;
  };

  for (const execution of ['next_open', 'same_close'] as const) {
    it(`one symbol with no option reproduces runBacktest (${execution})`, () => {
      const options = { start: bars[220]?.date ?? '', execution };
      const single = runBacktest(config(), bars, options);
      const system = runSystem({ config: config(), symbols: [{ symbol: 'SYN', bars }], options });
      expect(single.trades.length).toBeGreaterThan(3);
      expectDeepClose(
        {
          curve: system.curve,
          initial: system.initial,
          trades: system.trades.map(({ symbol: _s, partial: _p, ...t }) => t),
          cash: system.cash,
          kpis: system.kpis,
          canceled: system.canceled.map(({ symbol: _s, order: _o, ...c }) => c),
        },
        {
          curve: single.curve,
          initial: single.initial,
          trades: single.trades,
          cash: single.cash,
          kpis: single.kpis,
          canceled: single.canceled,
        },
      );
      const open = single.open_position;
      const sysOpen = system.positions_open[0];
      if (open) expect(sysOpen).toMatchObject({ ...open, symbol: 'SYN' });
      else expect(sysOpen).toBeUndefined();
      expect(system.applied).toEqual([]);
      expect(system.ledger_size).toBe(system.ledger.length);
      expect(system.trades_by_symbol.SYN).toEqual(system.trades);
    });
  }
});

describe('quant v2 advanced — exits (Chapter 17)', () => {
  it('ch17-l04 stop loss 5%: entry 100 → level 95, filled at the level inside the range', () => {
    // bar6 held 1 < 2 (not sellable); bar7 open 98 > 95, low 94 ≤ 95 → sell 1,000 @ 95.
    // pnl = 95,000 − 100,000 = −5,000 (−5%); cash 95,000. bars 8–9 close < MA5 → no re-entry.
    const r = run([one([...ENTRY, [100, 101, 99, 100], [98, 99, 94, 96], flat(94), flat(93)])], {
      exits: { stop_loss_pct: 5 },
    });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({
      symbol: 'AAA',
      qty: 1000,
      entry_price: 100,
      exit_price: 95,
      exit_date: dateAt(7),
      pnl: -5000,
      pnl_pct: -5,
      hold: 2,
      exit_reason: 'stop_loss',
    });
    expect(r.trades[0]?.concurrent_reasons).toBeUndefined();
    expect(r.cash).toBe(95_000);
    expect(r.kpis.net_return).toBeCloseTo(-5, 10);
    expect(r.applied).toEqual(['stop_loss_pct']);
  });

  it('a gap below the stop fills at the open, not at the level', () => {
    // bar7 open 92 ≤ 95 → sell @ 92: pnl −8,000.
    const r = run([one([...ENTRY, flat(100), [92, 93, 91, 92], flat(90), flat(89)])], {
      exits: { stop_loss_pct: 5 },
    });
    expect(r.trades[0]).toMatchObject({ exit_price: 92, pnl: -8000, exit_reason: 'stop_loss' });
  });

  it('ch17-l05 take profit 15%: entry 100 → target 115', () => {
    // bar7 open 110 < 115, high 116 ≥ 115 → sell @ 115: pnl +15,000.
    // bar8 close 100 < MA5 (90,100,100,112,100 → 100.4), bar9 99 < 102.2 → no re-entry.
    const r = run([one([...ENTRY, flat(100), [110, 116, 109, 112], flat(100), flat(99)])], {
      exits: { take_profit_pct: 15 },
    });
    expect(r.trades[0]?.exit_reason).toBe('take_profit');
    expect(r.trades[0]?.exit_price).toBeCloseTo(115, 10);
    expect(r.trades[0]?.pnl).toBeCloseTo(15_000, 6);
    expect(r.cash).toBeCloseTo(115_000, 6);
  });

  it('a gap above the target is a take profit at the open, never an earlier stop', () => {
    // bar7 open 120 ≥ 115 → take profit @ 120 although low 94 also crosses the 95 stop.
    const r = run([one([...ENTRY, flat(100), [120, 121, 94, 100], flat(90), flat(89)])], {
      exits: { stop_loss_pct: 5, take_profit_pct: 15 },
    });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ exit_price: 120, pnl: 20_000, exit_reason: 'take_profit' });
    expect(r.trades[0]?.concurrent_reasons).toEqual(['stop_loss', 'take_profit']);
  });

  it('stop and target inside one daily range → conservative stop first', () => {
    // bar7 open 100, high 116, low 94: order unknown → stop @ 95.
    const r = run([one([...ENTRY, flat(100), [100, 116, 94, 100], flat(90), flat(89)])], {
      exits: { stop_loss_pct: 5, take_profit_pct: 15 },
    });
    expect(r.trades[0]).toMatchObject({ exit_price: 95, exit_reason: 'stop_loss' });
    expect(r.trades[0]?.concurrent_reasons).toEqual(['stop_loss', 'take_profit']);
  });

  it('ch17-l06 trailing 8%: known peak 120 → level 110.4, peak from closes effective next bar', () => {
    // peak = entry 100 → close6 110 → close7 120 (bar7 high 121 is not used).
    // bar7: level = 110×0.92 = 101.2, low 111 → hold. bar8: level = 120×0.92 = 110.4,
    // open 118, low 110 → sell @ 110.4: pnl = 110,400 − 100,000 = 10,400.
    // bar9 close 100 < MA5 (100,110,120,112,100 → 108.4) → no re-entry.
    const r = run(
      [
        one([
          ...ENTRY,
          [105, 111, 105, 110],
          [112, 121, 111, 120],
          [118, 119, 110, 112],
          flat(100),
        ]),
      ],
      { exits: { trailing_pct: 8 } },
    );
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]?.exit_price).toBeCloseTo(110.4, 10);
    expect(r.trades[0]?.pnl).toBeCloseTo(10_400, 6);
    expect(r.trades[0]).toMatchObject({ exit_date: dateAt(8), exit_reason: 'trailing_stop' });
  });

  it('ch17-l07 max holding 20: bought at session 5, exit decision at session 25 (held 20)', () => {
    const rows: Ohlc[] = [...ENTRY, ...Array.from({ length: 20 }, () => flat(100)), flat(100)];
    const r = run([one(rows)], { exits: { max_holding: 20 } });
    expect(r.trades[0]).toMatchObject({
      entry_date: dateAt(5),
      exit_date: dateAt(25),
      exit_signal_date: dateAt(25),
      hold: 20,
      exit_reason: 'max_holding',
      exit_price: 100,
    });
    // next_open: decision at the close of session 25, fill at the open of 26.
    const next = run(
      [one([...rows, [98, 99, 97, 98]])],
      { exits: { max_holding: 20 } },
      {},
      {
        ...HAND,
        execution: 'next_open',
      },
    );
    // next_open entry fills at the open of bar 6 → index 6, decision at 26, fill at 27 @ 98.
    expect(next.trades[0]).toMatchObject({
      entry_date: dateAt(6),
      exit_signal_date: dateAt(26),
      exit_date: dateAt(27),
      exit_price: 98,
      hold: 21,
    });
  });

  it('ch16-l05: stop and Sell consensus on one bar → a single full sale with concurrent reasons', () => {
    // Sell = close < MA5. bar7: low 90 crosses the 95 stop; close 91 < MA5 (90,90,100,100,91 →
    // 94.2). One sale of all 1,000 shares @ 95; primary reason = stop_loss (EXIT_PRIORITY).
    const r = run(
      [one([...ENTRY, [100, 101, 99, 100], [97, 98, 90, 91], flat(85), flat(84)])],
      { exits: { stop_loss_pct: 5 } },
      {},
      HAND,
      maConfig(true),
    );
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ qty: 1000, exit_price: 95, exit_reason: 'stop_loss' });
    expect(r.trades[0]?.concurrent_reasons).toEqual(['stop_loss', 'sell_consensus']);
    expect(r.ledger.filter((e) => e.kind === 'order_filled' && e.side === 'sell')).toHaveLength(1);
    expect(EXIT_PRIORITY[0]).toBe('stop_loss');
  });
});

describe('quant v2 advanced — cooldown and sizing (Chapters 16–17)', () => {
  // Closes 100..108 on bars 5..13 keep close > MA5 (Buy true on every bar).
  const rising: Ohlc[] = [
    ...ENTRY,
    ...Array.from({ length: 8 }, (_, k): Ohlc => flat(101 + k)),
    flat(109),
  ];

  it('ch16-l06: sold at session 10 with cooldown 2 → earliest re-buy at session 13', () => {
    // max_holding 5: bought @100 at session 5, sold @105 at the close of session 10 → cash 105,000.
    const without = run([one(rising)], { exits: { max_holding: 5 } });
    expect(without.trades[0]?.exit_date).toBe(dateAt(10));
    expect(
      without.ledger.filter((e) => e.kind === 'order_filled' && e.side === 'buy')[1]?.date,
    ).toBe(dateAt(11));
    const cooled = run([one(rising)], { exits: { max_holding: 5 }, cooldown_bars: 2 });
    const rebuy = cooled.ledger.filter((e) => e.kind === 'order_filled' && e.side === 'buy')[1];
    // Re-buy @108: floor(105,000 / 10,800) = 9 lots = 900 shares, cash 7,800.
    expect(rebuy).toMatchObject({ date: dateAt(13), qty: 900, price: 108 });
    expect(cooled.positions_open[0]).toMatchObject({ qty: 900, price: 108, index: 13 });
    expect(cooled.cash).toBe(7_800);
    expect(cooled.applied).toEqual(['reentry_cooldown', 'max_holding']);
  });

  it('ch17-l01 pct_nav: budget = min(pct × NAV, available cash)', () => {
    // NAV 100,000, 30% → 30,000 each for AAA, BBB, CCC (300 shares @100); DDD gets the
    // remaining 10,000 → 100 shares. Cash 0.
    const symbols = ['AAA', 'BBB', 'CCC', 'DDD'].map((s) => one(ENTRY, s));
    const r = run(symbols, { sizing: { mode: 'pct_nav', pct: 30 } });
    expect(r.positions_open.map((p) => [p.symbol, p.qty])).toEqual([
      ['AAA', 300],
      ['BBB', 300],
      ['CCC', 300],
      ['DDD', 100],
    ]);
    expect(r.cash).toBe(0);
    expect(r.applied).toEqual(['portfolio', 'sizing_pct_nav']);
  });

  it('ch17-l02 fixed amount: 10,000,000 at 30,000 with lot 100 → 300 shares', () => {
    const scaled = ENTRY.map((row) => row.map((x) => x * 300) as Ohlc);
    const r = run(
      [one(scaled)],
      { sizing: { mode: 'fixed_amount', amount_vnd: 10_000_000 } },
      {},
      { ...HAND, capital: 100_000_000 },
    );
    expect(r.positions_open[0]).toMatchObject({ qty: 300, price: 30_000, cost: 9_000_000 });
    expect(r.cash).toBe(91_000_000);
  });

  it('all_cash across symbols shares one budget (never funded per symbol)', () => {
    const r = run([one(ENTRY, 'AAA'), one(ENTRY, 'BBB')]);
    expect(r.positions_open.map((p) => p.symbol)).toEqual(['AAA']);
    expect(r.ledger.find((e) => e.kind === 'candidate_skipped')).toMatchObject({
      symbol: 'BBB',
      reason: 'insufficient_cash',
    });
  });
});

describe('quant v2 advanced — universe, ranking, max positions (Chapters 16–17)', () => {
  // 24 flat bars at 100 then a jump on bar 24 → Buy on bar 24, ROC20 = close24/close4 − 1.
  const jump = (to: number): Ohlc[] => [
    ...Array.from({ length: 24 }, () => flat(100)),
    [100, to, 100, to],
  ];
  const four = (): SystemSymbolData[] => [
    one(jump(105), 'AAA'),
    one(jump(110), 'BBB'),
    one(jump(110), 'CCC'),
    one(jump(120), 'DDD'),
  ];

  it('ch16-l02 + ch17-l03: rank, then fill at most max_positions; ties by symbol', () => {
    // ROC20: AAA 5, BBB 10, CCC 10, DDD 20 → desc: DDD, BBB (tie with CCC → BBB), cap 2.
    // pct_nav 40: DDD floor(40,000/12,000) = 3 lots, BBB floor(40,000/11,000) = 3 lots.
    const desc = run(four(), {
      ranking: { key: 'roc_20', direction: 'desc' },
      max_positions: 2,
      sizing: { mode: 'pct_nav', pct: 40 },
    });
    expect(desc.positions_open.map((p) => [p.symbol, p.qty])).toEqual([
      ['BBB', 300],
      ['DDD', 300],
    ]);
    expect(desc.ledger.filter((e) => e.kind === 'order_filled').map((e) => e.symbol)).toEqual([
      'DDD',
      'BBB',
    ]);
    expect(desc.ledger.filter((e) => e.reason === 'max_positions').map((e) => e.symbol)).toEqual([
      'CCC',
      'AAA',
    ]);
    const asc = run(four(), {
      ranking: { key: 'roc_20', direction: 'asc' },
      max_positions: 2,
      sizing: { mode: 'pct_nav', pct: 40 },
    });
    expect(asc.positions_open.map((p) => p.symbol)).toEqual(['AAA', 'BBB']);
    // Without ranking the order is symbol ascending.
    const plain = run(four(), { max_positions: 2, sizing: { mode: 'pct_nav', pct: 40 } });
    expect(plain.positions_open.map((p) => p.symbol)).toEqual(['AAA', 'BBB']);
  });

  it('missing ranking scores are excluded (rs_market without market data)', () => {
    const r = run(four(), { ranking: { key: 'rs_market', direction: 'desc' } });
    expect(r.positions_open).toEqual([]);
    expect(r.trades).toEqual([]);
  });

  it('max positions counts pending next-open buys too', () => {
    const r = run(
      four(),
      { max_positions: 1, sizing: { mode: 'pct_nav', pct: 10 } },
      {},
      { ...HAND, execution: 'next_open' },
    );
    expect(r.ledger.filter((e) => e.kind === 'order_placed').map((e) => e.symbol)).toEqual(['AAA']);
    expect(r.canceled).toEqual([
      { reason: 'end_of_range', action: 'buy', signalIndex: 24, symbol: 'AAA', order: 'buy' },
    ]);
  });

  it('ch16-l01: candidates = universe(T) ∩ Buy(T); leaving the list never sells', () => {
    const symbols = ['AAA', 'BBB', 'CCC'].map((s) => one([...ENTRY, flat(101), flat(102)], s));
    const r = run(
      symbols,
      { sizing: { mode: 'pct_nav', pct: 30 } },
      {
        universe: [
          { symbol: 'AAA', from: dateAt(0), to: dateAt(5) },
          { symbol: 'CCC', from: dateAt(0), to: null },
        ],
      },
    );
    expect(r.positions_open.map((p) => p.symbol)).toEqual(['AAA', 'CCC']);
    expect(r.trades).toEqual([]);
    expect(r.applied).toEqual(['portfolio', 'universe', 'sizing_pct_nav']);
  });
});

describe('quant v2 advanced — portfolio caps and controls (Chapter 18)', () => {
  it('ch18-l04 sector cap 40%: two banks share one sector budget', () => {
    // pct_nav 30, NAV 100,000: AAA bank 30,000 (300 sh); BBB bank room 40,000 − 30,000 =
    // 10,000 (100 sh); CCC tech 30,000 (300 sh). Cash 30,000.
    const r = run(
      [one(ENTRY, 'AAA', 'bank'), one(ENTRY, 'BBB', 'bank'), one(ENTRY, 'CCC', 'tech')],
      { sizing: { mode: 'pct_nav', pct: 30 }, max_sector_weight_pct: 40 },
    );
    expect(r.positions_open.map((p) => [p.symbol, p.qty, p.sector])).toEqual([
      ['AAA', 300, 'bank'],
      ['BBB', 100, 'bank'],
      ['CCC', 300, 'tech'],
    ]);
    expect(r.cash).toBe(30_000);
  });

  it('ch18-l03 symbol cap 25%: each new buy ≤ 25% of NAV', () => {
    // all_cash capped at 25,000 → floor(25,000/10,000) = 2 lots = 200 sh per symbol; cash 40,000.
    const r = run(
      ['AAA', 'BBB', 'CCC'].map((s) => one(ENTRY, s)),
      { max_symbol_weight_pct: 25 },
    );
    expect(r.positions_open.map((p) => p.qty)).toEqual([200, 200, 200]);
    expect(r.cash).toBe(40_000);
    expect(r.applied).toEqual(['portfolio', 'concentration']);
  });

  it('ch18-l05 rebalancing trims an overweight position toward its target', () => {
    // Cap 20%: 200 sh @100 (20,000), cash 80,000. Session 10 (5 bars after start 0 → r=10):
    // close 180 → value 36,000, NAV 116,000, target 23,200, excess 12,800 →
    // ceil(12,800 / 18,000) = 1 lot → sell 100 @180: proceeds 18,000, cost part 10,000, pnl 8,000.
    const rows: Ohlc[] = [
      ...ENTRY,
      flat(100),
      flat(120),
      flat(150),
      flat(170),
      flat(180),
      flat(180),
    ];
    const r = run([one(rows)], { max_symbol_weight_pct: 20, rebalance: { every_bars: 5 } });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({
      qty: 100,
      exit_price: 180,
      pnl: 8000,
      partial: true,
      exit_reason: 'rebalance',
      exit_date: dateAt(10),
    });
    expect(r.positions_open[0]).toMatchObject({ qty: 100, cost: 10_000 });
    expect(r.cash).toBe(98_000);
    // Without the rebalance option the drift never forces a sale.
    expect(run([one(rows)], { max_symbol_weight_pct: 20 }).trades).toEqual([]);
  });

  it('ch18-l06: NAV 100,125,100,130 → max drawdown −20% on the shared NAV', () => {
    const rows: Ohlc[] = [...ENTRY, flat(125), flat(100), flat(130)];
    const r = run([one(rows)]);
    expect(r.curve.slice(5).map((p) => p.value)).toEqual([100_000, 125_000, 100_000, 130_000]);
    expect(r.kpis.max_drawdown).toBeCloseTo(-20, 10);
    expect(r.kpis.win_rate).toBeNull();
    expect(r.kpis.profit_factor).toBeNull();
  });

  it('portfolio drawdown stop 15% liquidates and halts new buys', () => {
    // bar7 NAV 100,000 vs peak 125,000 = −20% ≤ −15% → halt, sell 1,000 @100 at the close.
    const rows: Ohlc[] = [...ENTRY, flat(125), flat(100), flat(130), flat(140)];
    const r = run([one(rows)], { portfolio_drawdown_stop_pct: 15 });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ exit_reason: 'portfolio_drawdown', exit_price: 100 });
    expect(r.ledger.some((e) => e.kind === 'halt' && e.date === dateAt(7))).toBe(true);
    expect(r.positions_open).toEqual([]);
    expect(r.cash).toBe(100_000);
  });

  it('ch18-l02 correlation: r_B = 2 × r_A → ρ = 1 > 0.9 → the second buy is skipped', () => {
    const returns = Array.from({ length: 25 }, (_, i) => 0.01 * Math.sin(i + 1));
    const series = (scale: number, last: number): Ohlc[] => {
      let price = 100;
      const out: Ohlc[] = [flat(price)];
      for (const x of returns) {
        price *= 1 + scale * x;
        out.push(flat(price));
      }
      price *= 1 + scale * last;
      out.push(flat(price));
      return out;
    };
    const a = { symbol: 'AAA', bars: toBars(series(1, 0.1)) };
    const b = { symbol: 'BBB', bars: toBars(series(2, 0.2)) };
    // Universe from the last bar only, where both jump above their MA5.
    const universe = [
      { symbol: 'AAA', from: dateAt(26), to: null },
      { symbol: 'BBB', from: dateAt(26), to: null },
    ];
    const sizing = { mode: 'pct_nav', pct: 40 } as const;
    const free = run([a, b], { sizing }, { universe });
    expect(free.positions_open.map((p) => p.symbol)).toEqual(['AAA', 'BBB']);
    const filtered = run(
      [a, b],
      { sizing, max_correlation: 0.9, correlation_lookback: 20 },
      { universe },
    );
    expect(filtered.positions_open.map((p) => p.symbol)).toEqual(['AAA']);
    expect(filtered.ledger.find((e) => e.kind === 'candidate_skipped')).toMatchObject({
      symbol: 'BBB',
      reason: 'correlation',
    });
  });

  it('ch18-l01: two 50/50 positions returning +10% and −4% → portfolio +3%', () => {
    // pct_nav 50: 500 sh of each @100. AAA closes 110, BBB 96 → NAV 103,000.
    const r = run([one([...ENTRY, flat(110)], 'AAA'), one([...ENTRY, flat(96)], 'BBB')], {
      sizing: { mode: 'pct_nav', pct: 50 },
    });
    expect(r.kpis.net_return).toBeCloseTo(3, 10);
    // Equal-weight buy & hold of the price ratios over the actual range.
    expect(r.kpis.buy_hold_return).toBeCloseTo(
      ((110 / 90 - 1) * 100 + (96 / 90 - 1) * 100) / 2,
      10,
    );
  });

  it('applies a supplied cash dividend to the cash book', () => {
    const r = run(
      [one([...ENTRY, flat(100), flat(100)])],
      {},
      {
        corporate_actions: [
          { symbol: 'AAA', date: dateAt(6), kind: 'cash_dividend', cash_per_share: 2 },
        ],
      },
    );
    expect(r.cash).toBe(2_000);
    expect(r.ledger.find((e) => e.kind === 'corporate_action')).toMatchObject({
      amount: 2_000,
      reason: 'cash_dividend',
    });
  });
});

describe('quant v2 advanced — logic groups in a system run', () => {
  it('a logic tree over active Buy indicators replaces the default AND', () => {
    const both = maConfig();
    const roc = indicator(both, 'roc');
    roc.master_enabled = true;
    roc.sell.enabled = false;
    roc.buy.params.period = 2;
    roc.buy.params.level = 50; // never reached → AND blocks every buy
    const rows: Ohlc[] = [...ENTRY, flat(101), flat(102)];
    expect(run([one(rows)], {}, {}, HAND, both).positions_open).toEqual([]);
    const viaOr = run(
      [one(rows)],
      {
        logic: {
          type: 'or',
          children: [
            { type: 'indicator', indicator_id: 'ma' },
            { type: 'indicator', indicator_id: 'roc' },
          ],
        },
      },
      {},
      HAND,
      both,
    );
    expect(viaOr.positions_open[0]).toMatchObject({ qty: 1000, price: 100 });
    expect(viaOr.applied).toEqual(['logic_groups']);
    expect(() =>
      run([one(rows)], { logic: { type: 'indicator', indicator_id: 'rsi' } }, {}, HAND, both),
    ).toThrow(AdvancedEngineError);
  });
});

describe('quant v2 advanced — validation, determinism, immutability', () => {
  it('validates §4.1 option ranges and unknown keys', () => {
    expect(validateSystemOptions(undefined)).toEqual([]);
    expect(
      validateSystemOptions({
        symbols: ['AAA', 'BBB'],
        universe: { market: 'HOSE' },
        priority: 'exit_first',
        cooldown_bars: 2,
        sizing: { mode: 'pct_nav', pct: 20 },
        exits: { stop_loss_pct: 5, take_profit_pct: 15, trailing_pct: 8, max_holding: 20 },
        rebalance: { every_bars: 5 },
        max_correlation: 0.8,
        correlation_lookback: 60,
        portfolio_drawdown_stop_pct: 20,
      }),
    ).toEqual([]);
    const bad = validateSystemOptions({
      cooldown_bars: 0,
      sizing: { mode: 'fixed_amount', amount_vnd: 10 },
      max_positions: 31,
      exits: { stop_loss_pct: 60, atr: 2 },
      ranking: { key: 'pe', direction: 'desc' },
      priority: 'buy_first',
      foo: 1,
    }).map((e) => e.path);
    expect(bad).toEqual(
      expect.arrayContaining([
        'system.cooldown_bars',
        'system.sizing.amount_vnd',
        'system.max_positions',
        'system.exits.stop_loss_pct',
        'system.exits.atr',
        'system.ranking',
        'system.priority',
        'system.foo',
      ]),
    );
    expect(() => run([one(ENTRY)], { cooldown_bars: 0 })).toThrow(AdvancedEngineError);
  });

  it('maps options to capability ids', () => {
    expect(
      systemCapabilities(
        {
          ranking: { key: 'roc_20', direction: 'desc' },
          priority: 'exit_first',
          sizing: { mode: 'fixed_amount', amount_vnd: 1e6 },
          max_positions: 3,
          exits: { take_profit_pct: 10, trailing_pct: 5 },
          max_sector_weight_pct: 30,
          max_correlation: 0.7,
          rebalance: { every_bars: 20 },
          portfolio_drawdown_stop_pct: 25,
        },
        3,
        true,
      ),
    ).toEqual([
      'portfolio',
      'universe',
      'ranking',
      'signal_priority',
      'sizing_fixed_amount',
      'max_positions',
      'take_profit_pct',
      'trailing_pct',
      'correlation',
      'sector_weights',
      'rebalancing',
      'portfolio_drawdown',
    ]);
  });

  it('rejects empty buy sets, duplicate symbols and invalid bars', () => {
    const noBuy = maConfig();
    indicator(noBuy, 'ma').master_enabled = false;
    expect(() => run([one(ENTRY)], {}, {}, HAND, noBuy)).toThrow(EngineRunError);
    expect(() => run([one(ENTRY), one(ENTRY)])).toThrow(/Mã bị trùng/);
    expect(() => run([one([flat(100), [100, 90, 95, 100]])])).toThrow(EngineRunError);
  });

  it('is deterministic, input-order independent and never mutates its input', () => {
    const symbols = deepFreeze([
      one([...ENTRY, flat(105), [104, 106, 94, 95], flat(96)], 'CCC', 'bank'),
      one([...ENTRY, flat(103), flat(104), flat(106)], 'AAA', 'tech'),
    ]);
    const config = deepFreeze(maConfig(true));
    const system = deepFreeze<SystemOptions>({
      sizing: { mode: 'pct_nav', pct: 50 },
      exits: { stop_loss_pct: 5 },
      max_positions: 2,
    });
    const input = deepFreeze<SystemInput>({ config, symbols, options: HAND, system });
    const a = runSystem(input);
    const b = runSystem({ ...input, symbols: [...symbols].reverse() });
    expect(b).toEqual(a);
    expect(a.trades_by_symbol.CCC?.[0]?.exit_reason).toBe('stop_loss');
    expect(a.snapshot.symbols.map((s) => s.symbol)).toEqual(['AAA', 'CCC']);
  });
});

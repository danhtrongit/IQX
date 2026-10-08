import { describe, expect, it } from 'vitest';

import {
  buildRunExtras,
  fillGapTrades,
} from '../../src/modules/strategy-backtests/strategy-backtests.evidence.js';
import { presentRunResult } from '../../src/modules/strategy-backtests/strategy-backtests.presenter.js';
import {
  defaultConfig,
  runBacktest,
  type Bar,
  type IndicatorConfig,
  type RunOptions,
  type RunResult,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';

/**
 * Strategy spec §6 acceptance fixtures (B04-B18) against the real engine, plus the §6.3
 * "evaluate the close signal after an open fill" switch. Inputs, expected values and the spec
 * case id are stated next to every assertion.
 */

const day = (i: number): string => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);

function bars(closes: readonly number[], opens?: readonly number[]): Bar[] {
  return closes.map((close, i) => {
    const open = opens?.[i] ?? close;
    return {
      date: day(i),
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000,
    };
  });
}

function maConfig(buyPeriod: number, sellPeriod: number, sell = true): SharedConfig {
  const config = defaultConfig();
  const ma = config.indicators.ma as IndicatorConfig;
  ma.master_enabled = true;
  ma.buy.enabled = true;
  ma.sell.enabled = sell;
  ma.buy.params.period = buyPeriod;
  ma.sell.params.period = sellPeriod;
  return config;
}

const NO_FEE: Partial<RunOptions> = { fee_buy: 0, fee_sell: 0, lot: 1 };

describe('same-session close and next-session open profiles (B04-B09)', () => {
  // MA(5): close > SMA5 buys; bar 5 closes at 100 over a flat 90 base => signal at bar 5.
  const closes = [90, 90, 90, 90, 90, 100, 101, 102, 103, 104];
  const opens = [90, 90, 90, 90, 90, 95, 97, 102, 103, 104];
  const config = maConfig(5, 5, false);

  it('B04 same_close fills at the close of the signal session and records both dates', () => {
    const result = runBacktest(config, bars(closes, opens), {
      ...NO_FEE,
      execution: 'same_close',
      capital: 10_000,
    });
    expect(result.open_position).toMatchObject({
      signal_date: day(5),
      date: day(5),
      price: 100,
      qty: 100,
    });
  });

  it('B05 next_open fills at the open of the NEXT session, never the open of the signal session', () => {
    const result = runBacktest(config, bars(closes, opens), {
      ...NO_FEE,
      execution: 'next_open',
      capital: 10_000,
    });
    // The open of the signal bar (95) must not be used; the order fills at the next open (97).
    expect(result.open_position).toMatchObject({
      signal_date: day(5),
      date: day(6),
      price: 97,
    });
    // Quantity is checked at the FILL price (97), not at the signal close (100).
    expect(result.open_position?.qty).toBe(Math.floor(10_000 / 97));
  });

  it('B06 a signal on the last session of the range stays unfilled and creates no trade', () => {
    const lastOnly = bars([90, 90, 90, 90, 90, 100], [90, 90, 90, 90, 90, 95]);
    const result = runBacktest(config, lastOnly, { ...NO_FEE, execution: 'next_open' });
    expect(result.trades).toEqual([]);
    expect(result.open_position).toBeNull();
    expect(result.canceled).toEqual([{ reason: 'end_of_range', action: 'buy', signalIndex: 5 }]);
    const view = presentRunResult(
      { ...result, snapshot: { ...result.snapshot, symbol: 'AAA' } } as RunResult,
      buildRunExtras(config, lastOnly, result),
    );
    expect(view.pending_orders).toHaveLength(1);
    expect(view.pending_orders[0]).toMatchObject({
      action: 'buy',
      signal_date: day(5),
      reason: 'end_of_range',
    });
    // An unfilled order is not a closed trade and is not a buy.
    expect(view.counts).toEqual({
      buy_count: 0,
      closed_trade_count: 0,
      open_position_count: 0,
      pending_order_count: 1,
    });
  });

  it('B06 the range is the only source of fills: bars after `end` are never used', () => {
    const data = bars(closes, opens);
    const result = runBacktest(config, data, {
      ...NO_FEE,
      execution: 'next_open',
      start: day(0),
      end: day(5),
    });
    expect(result.open_position).toBeNull();
    expect(result.canceled).toHaveLength(1);
  });

  it('B08 both sides true while flat: only the buy is considered, no short and no instant exit', () => {
    const both = maConfig(5, 5);
    // Same condition on both sides so buy and sell are true on the same bar.
    const ma = both.indicators.ma as IndicatorConfig;
    ma.sell = structuredClone(ma.buy);
    const result = runBacktest(both, bars(closes, opens), {
      ...NO_FEE,
      execution: 'same_close',
      capital: 10_000,
    });
    // A position opened at bar 5 is not sold in the same step and respects the two-bar lock.
    expect(result.trades.every((trade) => trade.entry_date < trade.exit_date)).toBe(true);
    expect(result.trades.every((trade) => trade.hold >= 2)).toBe(true);
  });

  it('B09 both sides true while holding: sell only, never a second buy and no same-bar re-entry', () => {
    const both = maConfig(5, 5);
    const ma = both.indicators.ma as IndicatorConfig;
    ma.sell = structuredClone(ma.buy);
    const data = bars(
      [90, 90, 90, 90, 90, 100, 101, 102, 103, 104, 105, 106],
      [90, 90, 90, 90, 90, 100, 101, 102, 103, 104, 105, 106],
    );
    const result = runBacktest(both, data, { ...NO_FEE, execution: 'same_close', capital: 10_000 });
    for (const trade of result.trades) expect(trade.exit_date >= trade.entry_date).toBe(true);
    for (let i = 1; i < result.trades.length; i += 1)
      expect(result.trades[i]!.entry_date > result.trades[i - 1]!.exit_date).toBe(true);
  });

  describe('close signal after an open fill (spec §6.3)', () => {
    // Found by exhaustive search; see the expected dates below.
    const fixtureCloses = [
      94, 88, 89, 91, 96, 91, 91, 92, 93, 96, 90, 93, 99, 94, 96, 96, 95, 101, 100, 105, 111, 113,
      112, 112, 109, 108, 110, 106, 101, 105,
    ];
    const fixtureBars = bars(
      fixtureCloses,
      fixtureCloses.map((close, i) => close + (i % 2 === 0 ? 2 : -2)),
    );
    const fixtureConfig = maConfig(5, 5);
    const options: Partial<RunOptions> = {
      ...NO_FEE,
      execution: 'next_open',
      capital: 100_000,
    };
    const dates = (result: RunResult) =>
      result.trades.map((trade) => [
        trade.entry_signal_date,
        trade.entry_date,
        trade.exit_signal_date,
        trade.exit_date,
      ]);

    it('default (reference parity) skips the signal of a session that already filled an order', () => {
      expect(dates(runBacktest(fixtureConfig, fixtureBars, options))).toEqual([
        ['2020-01-05', '2020-01-06', '2020-01-08', '2020-01-09'],
        ['2020-01-10', '2020-01-11', '2020-01-14', '2020-01-15'],
        ['2020-01-16', '2020-01-17', '2020-01-25', '2020-01-26'],
      ]);
    });

    it('with the switch, a buy signal at the close of the session of an open sell fill orders for the next session', () => {
      const result = runBacktest(fixtureConfig, fixtureBars, {
        ...options,
        signal_after_open_fill: true,
      });
      expect(dates(result)).toEqual([
        ['2020-01-05', '2020-01-06', '2020-01-08', '2020-01-09'],
        // Sold at the open of 01-09; the 01-09 close signal creates the order for 01-10 (never
        // a fill "back" at the 01-09 open that has already passed).
        ['2020-01-09', '2020-01-10', '2020-01-14', '2020-01-15'],
        ['2020-01-15', '2020-01-16', '2020-01-25', '2020-01-26'],
      ]);
      for (const trade of result.trades)
        expect(trade.entry_date > trade.entry_signal_date).toBe(true);
      expect(result.trades[1]!.entry_signal_date).toBe(result.trades[0]!.exit_date);
      expect(result.trades[1]!.entry_date > result.trades[0]!.exit_date).toBe(true);
    });

    it('same_close ignores the switch (there is no pending order)', () => {
      const a = runBacktest(fixtureConfig, fixtureBars, { ...options, execution: 'same_close' });
      const b = runBacktest(fixtureConfig, fixtureBars, {
        ...options,
        execution: 'same_close',
        signal_after_open_fill: true,
      });
      expect(b).toEqual(a);
    });
  });
});

describe('B02 / B03 explicit profile', () => {
  it('B02 buy-only config runs to the end with an open position and no forced exit', () => {
    const data = bars([90, 90, 90, 90, 90, ...Array.from({ length: 120 }, (_, i) => 100 + i)]);
    const result = runBacktest(maConfig(5, 5, false), data, {
      ...NO_FEE,
      execution: 'same_close',
    });
    expect(result.trades).toEqual([]);
    expect(result.open_position).not.toBeNull();
    expect(data.length - (result.open_position?.index ?? 0)).toBeGreaterThan(60);
  });

  it('B03 the profile states stop/target/trailing/max-holding as none, independent of any default', () => {
    const result = runBacktest(
      maConfig(5, 5, false),
      bars([90, 90, 90, 90, 90, 100, 101, 102, 103]),
    );
    expect(result.profile).toMatchObject({
      stop_loss: 'none',
      take_profit_pct: null,
      max_holding: null,
      trailing: 'none',
      position_size: 'all_cash',
    });
  });
});

describe('B11-B18 ledger, KPIs and chart contract', () => {
  it('B11 sizes by available cash including the buy fee and never rounds up', () => {
    const result = runBacktest(
      maConfig(5, 5, false),
      bars([19_000, 19_000, 19_000, 19_000, 19_000, 20_000]),
      { execution: 'same_close', capital: 12_000_000, fee_buy: 0.0015, lot: 100 },
    );
    // 500 sh x 20,000 x 1.0015 = 10,015,000; 600 sh would need 12,018,000 > 12,000,000.
    expect(result.open_position?.qty).toBe(500);
    expect(result.open_position?.cost).toBeCloseTo(10_015_000, 4);
    expect(result.cash).toBeCloseTo(1_985_000, 4);
    expect(600 * 20_000 * 1.0015).toBeGreaterThan(12_000_000);
  });

  it('B12 net P/L uses a combined sell cost exactly once', () => {
    const closes = [9000, 9000, 9000, 9000, 9000, 10_000, 13_000, 13_000, 11_000];
    const config = maConfig(5, 5);
    const data = bars(closes);
    const result = runBacktest(config, data, {
      execution: 'same_close',
      capital: 1_100_000,
      fee_buy: 0.0015,
      fee_sell: 0.0025,
      lot: 100,
    });
    expect(result.trades).toHaveLength(1);
    const view = presentRunResult(
      { ...result, snapshot: { ...result.snapshot, symbol: 'AAA' } } as RunResult,
      buildRunExtras(config, data, result),
    );
    const trade = view.trades[0]!;
    expect(trade).toMatchObject({ qty: 100, entry_price: 10_000, exit_price: 11_000 });
    expect(trade.entry_total).toBeCloseTo(1_001_500, 4);
    expect(trade.exit_gross).toBe(1_100_000);
    expect(trade.exit_fee_tax).toBeCloseTo(2_750, 6);
    expect(trade.exit_net).toBeCloseTo(1_097_250, 4);
    expect(trade.pnl).toBeCloseTo(95_750, 4);
    expect(trade.outcome).toBe('win');
    expect(view.kpis.closed_trade_count).toBe(1);
    expect(view.kpis.win_rate_pct).toBe(100);
  });

  it('B13 total return is NAV_end / capital - 1 including cash and the unrealised position', () => {
    const data = bars([100, 100, 100, 100, 100, 110, 120, 130]);
    const result = runBacktest(maConfig(5, 5, false), data, {
      ...NO_FEE,
      execution: 'same_close',
      capital: 10_000,
    });
    const nav = result.cash + (result.open_position?.qty ?? 0) * 130;
    expect(result.kpis.net_return).toBeCloseTo((nav / 10_000 - 1) * 100, 9);
    expect(result.kpis.net_return).toBeGreaterThan(0);
    expect(result.kpis.n_trades).toBe(0);
  });

  it('B14 no closed trade: win rate is null, closed_trade_count 0, the open position is counted apart', () => {
    const data = bars([100, 100, 100, 100, 100, 110, 120, 130]);
    const config = maConfig(5, 5, false);
    const result = runBacktest(config, data, { ...NO_FEE, execution: 'same_close' });
    const view = presentRunResult(
      { ...result, snapshot: { ...result.snapshot, symbol: 'AAA' } } as RunResult,
      buildRunExtras(config, data, result),
    );
    expect(view.kpis.win_rate_pct).toBeNull();
    expect(view.kpis.closed_trade_count).toBe(0);
    expect(view.counts).toMatchObject({
      buy_count: 1,
      closed_trade_count: 0,
      open_position_count: 1,
    });
    expect(Object.keys(view.kpis).sort()).toEqual([
      'annualized_return_pct',
      'buy_hold_return_pct',
      'closed_trade_count',
      'max_drawdown_pct',
      'total_return_pct',
      'win_rate_pct',
    ]);
    expect(JSON.stringify(view)).not.toContain('n_trades');
  });

  it('B15 the drawdown peak starts at the initial capital (fee on the first session counts)', () => {
    const data = bars([90, 90, 90, 90, 90, 100, 100, 100]);
    const result = runBacktest(maConfig(5, 5, false), data, {
      execution: 'same_close',
      capital: 10_000,
      fee_buy: 0.0015,
      lot: 1,
    });
    // 99 sh x 100 x 1.0015 = 9,914.85 paid; NAV 9,985.15 on a flat price.
    expect(result.kpis.max_drawdown).toBeCloseTo((9_985.15 / 10_000 - 1) * 100, 6);
    expect(result.kpis.max_drawdown).toBeLessThan(0);
  });

  it('B15 drawdown of the 100 -> 120 -> 90 -> 110 NAV path is -25%', () => {
    const data = bars([90, 90, 90, 90, 90, 100, 120, 90, 110]);
    const result = runBacktest(maConfig(5, 5, false), data, {
      ...NO_FEE,
      execution: 'same_close',
      capital: 10_000,
    });
    expect(result.kpis.max_drawdown).toBeCloseTo(-25, 9);
  });

  it('B16 annualised return uses 252 sessions: 100 -> 121 over 504 sessions is 10%', () => {
    const lead = [90, 90, 90, 90, 90];
    const path = Array.from({ length: 504 }, (_, i) => 100 + (21 * i) / 503);
    const closes = [...lead, ...path.slice(0, 503), 121];
    const data = bars(closes);
    const result = runBacktest(maConfig(5, 5, false), data, {
      ...NO_FEE,
      execution: 'same_close',
      capital: 10_000,
      start: day(5),
      end: day(5 + 503),
    });
    expect(result.snapshot.bar_count).toBe(504);
    expect(result.kpis.net_return).toBeCloseTo(21, 9);
    expect(result.kpis.cagr).toBeCloseTo(10, 9);
  });

  it('B17 buy & hold is the last close over the first close of the range, not the high', () => {
    const data = bars([100, 150, 200, 160, 130]);
    const result = runBacktest(maConfig(5, 5, false), data, { execution: 'same_close' });
    expect(result.kpis.buy_hold_return).toBeCloseTo(30, 9);
    expect(result.curve[result.curve.length - 1]!.buy_hold_pct).toBeCloseTo(30, 9);
  });

  it('B18 the chart starts at 0% before the first cost and ends on the total-return KPI', () => {
    const data = bars([90, 90, 90, 90, 90, 100, 101, 102, 103]);
    const config = maConfig(5, 5, false);
    const result = runBacktest(config, data, {
      execution: 'same_close',
      capital: 10_000,
      fee_buy: 0.0015,
      lot: 1,
    });
    expect(result.initial).toMatchObject({ return_pct: 0, phase: 'before_first_execution' });
    // The first session's buy fee is not rebased away: the first point is below 0%.
    expect(result.curve[5]!.return_pct).toBeLessThan(0);
    expect(result.curve[result.curve.length - 1]!.return_pct).toBeCloseTo(
      result.kpis.net_return,
      9,
    );
    const view = presentRunResult(
      { ...result, snapshot: { ...result.snapshot, symbol: 'AAA' } } as RunResult,
      buildRunExtras(config, data, result),
    );
    expect(view.chart.title).toBe('Lợi nhuận danh mục (%)');
    expect(view.chart.series.map((series) => series.id)).toEqual([
      'strategy',
      'buy_hold',
      'market',
    ]);
    expect(view.chart.series[0]).toMatchObject({ end_value_pct: view.kpis.total_return_pct });
    expect(view.chart.series[1]).toMatchObject({
      label: 'Mua và giữ AAA',
      end_value_pct: view.kpis.buy_hold_return_pct,
    });
    // No benchmark values in the bars: the third series is unavailable, not a flat 0%.
    expect(view.chart.series[2]).toMatchObject({ available: false, end_value_pct: null });
    expect(view.chart.point_count).toBe(result.curve.length);
  });
});

describe('B20 / B07 history and missing sessions', () => {
  it('B20 the view and the evidence cover every closed trade, not a page of them', () => {
    const closes = Array.from({ length: 800 }, (_, i) => 100 + 20 * Math.sin(i / 3));
    const config = maConfig(5, 8);
    const data = bars(closes);
    const result = runBacktest(config, data, { ...NO_FEE, execution: 'same_close', capital: 1e9 });
    expect(result.trades.length).toBeGreaterThan(30);
    const view = presentRunResult(
      { ...result, snapshot: { ...result.snapshot, symbol: 'AAA' } } as RunResult,
      buildRunExtras(config, data, result),
    );
    expect(view.trades).toHaveLength(result.trades.length);
    expect(view.counts.closed_trade_count).toBe(result.trades.length);
    // Every trade carries the condition values and operators at its signal bars.
    for (const trade of view.trades) {
      expect(trade.entry_conditions?.rules[0]).toMatchObject({ indicator: 'ma', side: 'buy' });
      expect(typeof trade.entry_conditions?.rules[0]?.lhs).toBe('number');
      expect(trade.exit_conditions?.rules[0]).toMatchObject({ indicator: 'ma', side: 'sell' });
      expect(trade.exit_conditions?.indicator_ids).toEqual(['ma']);
    }
  });

  it('B07 flags a next-open fill that skipped a benchmark session without substituting a price', () => {
    const data = bars([90, 90, 90, 90, 90, 100, 101, 102, 103, 104]);
    const result = runBacktest(maConfig(5, 5, false), data, {
      ...NO_FEE,
      execution: 'next_open',
    });
    expect(result.open_position?.date).toBe(day(6));
    const all = new Set(data.map((bar) => bar.date));
    expect(fillGapTrades(result, all)).toEqual([]);
    // The benchmark traded on day(6) too, but the symbol's own day(6) bar is missing in data:
    const sparse = data.filter((bar) => bar.date !== day(6));
    const gapped = runBacktest(maConfig(5, 5, false), sparse, {
      ...NO_FEE,
      execution: 'next_open',
    });
    expect(gapped.open_position?.date).toBe(day(7));
    expect(gapped.open_position?.price).toBe(102);
    expect(fillGapTrades(gapped, all)).toEqual([
      { number: 1, leg: 'entry', signal_date: day(5), fill_date: day(7) },
    ]);
    expect(fillGapTrades(gapped, null)).toEqual([]);
    expect(
      fillGapTrades(
        {
          ...gapped,
          snapshot: {
            ...gapped.snapshot,
            options: { ...gapped.snapshot.options, execution: 'same_close' },
          },
        },
        all,
      ),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import type { Bar } from '../../src/modules/quant/v2/index.js';
import { buyAndHold } from '../../src/modules/strategy-backtests/strategy-backtests.buy-hold.js';

/**
 * Update 19-11, spec Tab IQX §3.5 / §7.3 item 16: "Mua và giữ" computed by hand on two fixed runs,
 * compared with the server function stored in the run snapshot (strategy-backtests.jobs.ts).
 * Every expected number below is written out by hand, not recomputed with the server formula.
 */
const bar = (date: string, open: number, close: number): Bar => ({
  date,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
  volume: 1_000_000,
});

describe('Mua và giữ: hand calculation vs server (Tab IQX §7.3 item 16)', () => {
  it('run 1: next_open fill, lot 100, fee 0.15%, left-over cash kept, no sell fee', () => {
    const bars = [
      bar('2026-01-02', 9_900, 9_900), // before the range: ignored
      bar('2026-01-05', 10_000, 10_100), // first session: decision at close, no fill on its open
      bar('2026-01-06', 10_200, 10_300), // fill at this open: 10 200
      bar('2026-01-07', 10_000, 9_800),
      bar('2026-01-08', 9_900, 10_500),
      bar('2026-01-12', 11_000, 11_000), // after the range: ignored
    ];
    const hold = buyAndHold(bars, {
      capital: 10_000_000,
      fee_buy: 0.0015,
      lot: 100,
      execution: 'next_open',
      start: '2026-01-05',
      end: '2026-01-08',
    });
    // 10 000 000 / (10 200 × 1.0015 × 100) = 9.789 → 9 lots = 900 shares.
    // gross 9 180 000, fee 13 770, cash left 10 000 000 − 9 193 770 = 806 230.
    expect(hold.entry_date).toBe('2026-01-06');
    expect(hold.entry_price).toBe(10_200);
    expect(hold.qty).toBe(900);
    expect(hold.buy_fee).toBeCloseTo(13_770, 6);
    expect(hold.cash_left).toBeCloseTo(806_230, 6);
    expect(hold.curve.map((point) => point.date)).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
    ]);
    // Value = cash + 900 × close; before the fill the value is the capital.
    const values = [10_000_000, 10_076_230, 9_626_230, 10_256_230];
    hold.curve.forEach((point, index) => expect(point.value).toBeCloseTo(values[index]!, 6));
    expect(hold.end_value).toBeCloseTo(10_256_230, 6); // no sell fee or tax deducted
    expect(hold.return_pct).toBeCloseTo(2.5623, 9);
  });

  it('run 2: same_close fill on a provider-adjusted series (2:1 split already halved), fee 0.1%', () => {
    // Raw prices were 40 000 / 42 000 before a 2:1 split on 2026-03-04; the provider-adjusted
    // series (the one the strategy uses, price_adjustment = provider_adjusted) is continuous.
    const adjusted = [
      bar('2026-03-02', 19_800, 20_000), // fill at this close: 20 000
      bar('2026-03-03', 20_100, 21_000),
      bar('2026-03-04', 20_500, 19_500), // split day, already adjusted
      bar('2026-03-05', 19_600, 22_000),
    ];
    const hold = buyAndHold(adjusted, {
      capital: 50_000_000,
      fee_buy: 0.001,
      lot: 100,
      execution: 'same_close',
      start: '2026-03-01',
      end: '2026-03-31',
    });
    // 50 000 000 / (20 000 × 1.001 × 100) = 24.975 → 24 lots = 2 400 shares.
    // gross 48 000 000, fee 48 000, cash left 1 952 000.
    expect(hold.entry_date).toBe('2026-03-02');
    expect(hold.entry_price).toBe(20_000);
    expect(hold.qty).toBe(2_400);
    expect(hold.buy_fee).toBeCloseTo(48_000, 6);
    expect(hold.cash_left).toBeCloseTo(1_952_000, 6);
    const values = [49_952_000, 52_352_000, 48_752_000, 54_752_000];
    hold.curve.forEach((point, index) => expect(point.value).toBeCloseTo(values[index]!, 6));
    expect(hold.end_value).toBeCloseTo(54_752_000, 6);
    expect(hold.return_pct).toBeCloseTo(9.504, 9);
    // The same run on the unadjusted series would show a fake −50% drop: the function uses
    // exactly the series it is given (the strategy's), so the caller decides the price type.
    const raw = adjusted.map((item, index) =>
      index < 2 ? { ...item, open: item.open * 2, close: item.close * 2 } : item,
    );
    const rawHold = buyAndHold(raw, {
      capital: 50_000_000,
      fee_buy: 0.001,
      lot: 100,
      execution: 'same_close',
      start: '2026-03-01',
      end: '2026-03-31',
    });
    // 50 000 000 / (40 000 × 1.001 × 100) = 12.487 → 1 200 shares, cash 50 000 000 − 48 048 000.
    expect(rawHold.qty).toBe(1_200);
    expect(rawHold.cash_left).toBeCloseTo(1_952_000, 6);
    expect(rawHold.end_value).toBeCloseTo(1_952_000 + 1_200 * 22_000, 6);
  });

  it('keeps the capital flat when not even one lot is affordable', () => {
    const hold = buyAndHold([bar('2026-01-05', 500_000, 500_000), bar('2026-01-06', 1, 1)], {
      capital: 10_000_000,
      fee_buy: 0.0015,
      lot: 100,
      execution: 'same_close',
      start: '2026-01-05',
      end: '2026-01-06',
    });
    expect(hold).toMatchObject({ qty: 0, entry_date: null, end_value: 10_000_000, return_pct: 0 });
  });
});

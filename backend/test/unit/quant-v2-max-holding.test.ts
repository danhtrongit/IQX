import { describe, expect, it } from 'vitest';
import {
  EngineRunError,
  configHash,
  defaultConfig,
  runBacktest,
  sideSignals,
  validateConfig,
  type Bar,
  type IndicatorConfig,
  type RunOptions,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import { deepFreeze, reference } from '../fixtures/bot-v2/reference.js';

/** Giữ tối đa on the single-symbol strategy backtest engine (Bot spec §11.2, P13–P16). */
const bars = deepFreeze(reference.syntheticBars(950));
const indexOf = new Map(bars.map((bar, index) => [bar.date, index] as const));
const idx = (date: string): number => indexOf.get(date)!;

function maConfig(sell: 'off' | 'on' | 'mirror', maxHolding?: number | null): SharedConfig {
  const config = defaultConfig();
  const ma = config.indicators.ma as IndicatorConfig;
  ma.master_enabled = true;
  ma.buy.enabled = true;
  ma.sell.enabled = sell !== 'off';
  if (sell === 'mirror') ma.sell = structuredClone(ma.buy);
  return maxHolding === undefined ? config : { ...config, max_holding: maxHolding };
}

const OPTIONS: Partial<RunOptions>[] = [{ execution: 'next_open' }, { execution: 'same_close' }];

describe('quant v2 runBacktest — Giữ tối đa', () => {
  for (const options of OPTIONS) {
    const offset = options.execution === 'next_open' ? 1 : 0;

    it(`P13/P14 Sell OFF: exits after exactly N bars, reason max_holding (${options.execution})`, () => {
      const result = runBacktest(maConfig('off', 10), bars, options);
      expect(result.trades.length).toBeGreaterThan(3);
      for (const trade of result.trades) {
        expect(trade.exit_reason).toBe('max_holding');
        expect(trade.concurrent_reasons).toEqual(['max_holding']);
        expect(trade.hold).toBe(10);
        expect(idx(trade.exit_date) - idx(trade.entry_date)).toBe(10);
        // The sell is created at the close before the fill (next_open) or at the fill close.
        expect(idx(trade.exit_date) - idx(trade.exit_signal_date)).toBe(offset);
      }
      expect(result.profile.max_holding).toBe(10);
    });
  }

  it('P13 a Sell condition met earlier sells earlier with its own reason', () => {
    const result = runBacktest(maConfig('on', 250), bars);
    const sell = sideSignals(maConfig('on'), bars, 'sell');
    expect(result.trades.length).toBeGreaterThan(0);
    for (const trade of result.trades) {
      expect(trade.hold).toBeLessThanOrEqual(250);
      if (trade.exit_reason === 'sell_consensus')
        expect(sell[idx(trade.exit_signal_date)]).toBe(true);
    }
  });

  it('P15 both due on one bar: one sell, primary reason sell_consensus, both flags, one fee', () => {
    const mirror = maConfig('mirror');
    const sell = sideSignals(mirror, bars, 'sell');
    let found = false;
    for (let n = 3; n <= 40 && !found; n += 1) {
      const result = runBacktest({ ...mirror, max_holding: n }, bars);
      for (const trade of result.trades) {
        const signal = idx(trade.exit_signal_date);
        const time = signal + 1 - idx(trade.entry_date) >= n;
        const indicator = sell[signal] === true && signal - idx(trade.entry_date) >= 2;
        expect(trade.exit_reason).toBe(indicator ? 'sell_consensus' : 'max_holding');
        expect(trade.concurrent_reasons).toEqual([
          ...(indicator ? ['sell_consensus'] : []),
          ...(time ? ['max_holding'] : []),
        ]);
        if (indicator && time) found = true;
      }
      // One fee per sell: the ledger closes on exactly the realized trades.
      const realized = result.trades.reduce((sum, trade) => sum + trade.pnl, 0);
      const open = result.open_position;
      expect(result.cash + (open ? open.cost : 0)).toBeCloseTo(100_000_000 + realized, 4);
    }
    expect(found).toBe(true);
  });

  it('P16 time due at the last bar: no forced sell, pending sell canceled with its reason', () => {
    const full = runBacktest(maConfig('off', 10), bars);
    const trade = full.trades[1]!;
    const end = trade.exit_signal_date;
    const cut = runBacktest(maConfig('off', 10), bars, { end });
    expect(cut.trades.map((item) => item.number)).toEqual([1]);
    expect(cut.open_position?.date).toBe(trade.entry_date);
    expect(cut.canceled).toEqual([
      {
        reason: 'end_of_range',
        action: 'sell',
        signalIndex: idx(end),
        exit_reason: 'max_holding',
        concurrent_reasons: ['max_holding'],
      },
    ]);
  });

  it('null / absent Giữ tối đa behaves exactly as before (no time exit, no extra fields)', () => {
    for (const sell of ['off', 'on'] as const) {
      const before = runBacktest(maConfig(sell), bars);
      const withNull = runBacktest(maConfig(sell, null), bars);
      expect(withNull.trades).toEqual(before.trades);
      expect(withNull.curve).toEqual(before.curve);
      expect(withNull.kpis).toEqual(before.kpis);
      expect(withNull.canceled).toEqual(before.canceled);
      expect(before.profile.max_holding).toBeNull();
      for (const trade of before.trades) {
        expect(trade.exit_reason).toBe('sell_consensus');
        expect(trade).not.toHaveProperty('concurrent_reasons');
      }
    }
    // A config without the key keeps its hash.
    expect(configHash(maConfig('on'))).toBe(configHash(structuredClone(maConfig('on'))));
    expect('max_holding' in maConfig('on')).toBe(false);
  });

  it('validates Giữ tối đa as an integer 3–250', () => {
    for (const bad of [2, 251, 10.5, '10'])
      expect(
        validateConfig({ ...maConfig('on'), max_holding: bad as number }).map((e) => e.path),
      ).toEqual(['max_holding']);
    for (const good of [3, 250, null]) expect(validateConfig({ ...maConfig('on'), max_holding: good })).toEqual([]);
    expect(() => runBacktest(maConfig('on', 1), bars as Bar[])).toThrow(EngineRunError);
  });
});

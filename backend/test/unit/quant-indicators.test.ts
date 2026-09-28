import { describe, expect, it } from 'vitest';
import {
  buildFrame,
  computeIndicators,
  ohlcvFromRecords,
} from '../../src/modules/quant/indicators.js';
import {
  evalConditionSeries,
  evaluateSeries,
  validateCombination,
} from '../../src/modules/quant/conditions.js';

function synthetic(length = 320) {
  return ohlcvFromRecords(
    Array.from({ length }, (_, index) => {
      const close = 100 + 0.08 * index + 4 * Math.sin(index / 8) + 1.5 * Math.cos(index / 21);
      const open = close + 0.7 * Math.sin(index / 3);
      return {
        time: String(index),
        open,
        high: Math.max(open, close) + 1.2 + (index % 5) * 0.05,
        low: Math.min(open, close) - 1.1 - (index % 7) * 0.03,
        close,
        volume: 1_000_000 + 150_000 * Math.sin(index / 5) + (index % 13) * 12_000,
      };
    }),
  );
}

describe('quant indicators — Python golden parity', () => {
  it('computes all 38 fields with matching warmup and latest values', () => {
    const result = computeIndicators(synthetic());
    expect(Object.keys(result)).toHaveLength(38);
    const golden: Record<string, number> = {
      ma_5: 127.8277713577,
      ma_20: 126.4812668623,
      ma_50: 123.6758846848,
      ma_200: 117.7068616887,
      ma_stack_bull: 1,
      uptrend: 1,
      death_cross: 0,
      ma_20_slope: 0.0283497667,
      dist_ma_20: 0.008103453,
      dist_ma_200: 0.0832520725,
      rsi_14: 82.7415782367,
      macd_hist: -0.0369431159,
      macd_bull_cross: 0,
      macd_bear_cross: 1,
      roc_20d: 0.0409094702,
      atr_14: 2.9779379812,
      atr_pct: 0.0233552403,
      bb_width: 0.0527756359,
      bb_squeeze: 0,
      bb_breakout_down: 0,
      vol_ma_20: 1008764.8755266189,
      vol_zscore: 2.2655282392,
      obv: 40039499.46628893,
      obv_ma_20: 38156161.61540957,
      high_20: 129.4273988075,
      high_52w: 129.4273988075,
      dist_52w_high: -0.0148438194,
      breakout_20d: 0,
      breakout_52w: 0,
      low_20: 121.3523464052,
      low_52w: 100.4619242647,
      dist_52w_low: 0.2691992793,
      breakdown_20d: 0,
      breakdown_52w: 0,
      hammer: 0,
      shooting_star: 0,
      bull_engulfing: 0,
      bear_engulfing: 0,
    };
    for (const [name, value] of Object.entries(golden))
      expect(result[name as keyof typeof result][319]).toBeCloseTo(value, 6);
    expect(Number.isNaN(result.ma_200[198]!)).toBe(true);
    expect(Number.isFinite(result.ma_200[199]!)).toBe(true);
    expect(Number.isNaN(result.high_52w[250]!)).toBe(true);
    expect(Number.isFinite(result.high_52w[251]!)).toBe(true);
  });

  it('validates and evaluates crosses plus mixed AND-before-OR logic', () => {
    const frame = buildFrame(synthetic());
    const cross = { indicator: 'rsi_14', op: 'cross_above', value: 50 };
    expect(evalConditionSeries(frame, cross).some((value) => value === 1)).toBe(true);
    const combination = {
      logic: 'AND' as const,
      conditions: [
        { indicator: 'uptrend', op: 'is_true' },
        { indicator: 'rsi_14', op: '>', value: 70, join: 'OR' as const },
        { indicator: 'vol_zscore', op: '>', value: 2, join: 'AND' as const },
      ],
    };
    validateCombination(combination);
    expect(evaluateSeries(frame, combination)).toHaveLength(320);
  });
});

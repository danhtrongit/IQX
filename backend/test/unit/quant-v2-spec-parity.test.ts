import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_INDICATOR_IDS,
  calc,
  canonicalJson,
  createSeriesCache,
  defaultConfig,
  defaultRows,
  evaluateRow,
  indicatorSideSignals,
  isRowsEntry,
  loadTechnicalRegistry,
  type Bar,
  type ConditionRow,
  type ParamsSideConfig,
  type RegistryEntry,
  type RowSideConfig,
  type SeriesCache,
  type SeriesMap,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import { academyV3Fixture } from './academy-v3-fixture.js';

/**
 * Bot SPEC §9.1 (calculation variants) and the registry against the IQX engine.
 * Cases I01..I16 are the acceptance fixtures of Bot SPEC §16-I; the registry is compared with
 * the approved v4 golden (`iqx-rules-4.0`: SPEC V3 rows for 15 indicators, Volume unchanged).
 */
const registry = loadTechnicalRegistry();
const here = dirname(fileURLToPath(import.meta.url));

type GoldenEntry = {
  id: string;
  name: string;
  chapter: number;
  lesson_id: string | null;
  legacy_chapter: number;
  legacy_lesson_id: string;
  family: string;
  model: string;
  [key: string]: unknown;
};
const golden = JSON.parse(
  readFileSync(join(here, 'fixtures/registry-v4.golden.json'), 'utf8'),
) as GoldenEntry[];

function entry(id: string): RegistryEntry {
  const found = registry.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
}

/** Default row of a tab (SPEC V3 §3) with overrides. */
function rowOf(rowId: string, side: Side = 'buy', overrides: Record<string, unknown> = {}): ConditionRow {
  const owner = entry(rowId.slice(0, rowId.indexOf('.')));
  if (!isRowsEntry(owner)) throw new Error(rowId);
  const found = defaultRows(owner, side).find((r) => r.id === rowId);
  if (!found) throw new Error(rowId);
  return { ...found, ...overrides } as ConditionRow;
}

/** Series cache serving fixed series for any params (formula-independent operator checks). */
const fixedCache = (series: SeriesMap, close: Array<number | null> = []): SeriesCache => ({
  bars: [],
  series: () => series,
  close: () => close,
});

/** Valid OHLCV bar; `open` defaults to the close. */
const ohlc = (
  i: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
  open = close,
): Bar => ({
  date: `2024-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  open,
  high,
  low,
  close,
  volume,
});
const closes = (values: number[], volume = 100): Bar[] =>
  values.map((c, i) => ohlc(i, c + 1, c - 1, c, volume));
const flat = (values: number[], volumes?: number[]): Bar[] =>
  values.map((c, i) => ohlc(i, c, c, c, volumes?.[i] ?? 100));

const near = (actual: number | null | undefined, expected: number, tolerance = 1e-9) => {
  expect(typeof actual).toBe('number');
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance);
};

describe('registry matches the approved v4 golden (iqx-rules-4.0)', () => {
  it('has the same ids and order', () => {
    expect(golden.map((item) => item.id)).toEqual([...CURRENT_INDICATOR_IDS]);
    expect(registry.map((item) => item.id)).toEqual(golden.map((item) => item.id));
  });

  for (const goldenEntry of golden) {
    it(`${goldenEntry.id}: rows (or Volume params, rules and fields) equal the golden`, () => {
      const actual = entry(goldenEntry.id) as unknown as Record<string, unknown>;
      for (const key of ['model', 'rows', 'buy', 'sell', 'fields', 'validation'])
        expect(canonicalJson(actual[key]), key).toBe(canonicalJson(goldenEntry[key]));
      expect(actual.name).toBe(goldenEntry.name);
      expect(actual.family).toBe(goldenEntry.family);
    });

    it(`${goldenEntry.id}: lesson_id/chapter are the NEW ones; legacy position kept apart`, () => {
      const actual = entry(goldenEntry.id);
      expect(actual.chapter).toBe(goldenEntry.chapter);
      expect(actual.lesson_id).toBe(goldenEntry.lesson_id);
      expect(actual.legacy_chapter).toBe(goldenEntry.legacy_chapter);
      expect(actual.legacy_lesson_id).toBe(goldenEntry.legacy_lesson_id);
      // Per-indicator metadata of the repo is kept for the 16.
      expect(typeof actual.formula).toBe('string');
      expect(typeof actual.seed_and_missing).toBe('string');
      expect(actual.worked_fixture).toBeTruthy();
      expect(actual.calculation_version).toBe('iqx-ta-2.0');
      expect(actual.rule_version).toBe('iqx-rules-4.0');
    });
  }

  it('Học viện v3.3: 5 indicators live in chapter 4, 4 in chapter 6 and 7 in chapter 7', () => {
    const placement = Object.fromEntries(
      registry.map((item) => [item.id, [item.chapter, item.lesson_id]]),
    );
    expect(placement).toEqual({
      volume: [4, 'ch04-l04'],
      ma: [4, 'ch04-l05'],
      rsi: [4, 'ch04-l06'],
      macd: [4, 'ch04-l07'],
      bollinger: [4, 'ch04-l08'],
      ema: [6, 'ch06-l01'],
      ma_cross: [6, 'ch06-l02'],
      dmi: [6, 'ch06-l03'],
      donchian: [6, 'ch06-l04'],
      stochastic: [7, 'ch07-l01'],
      cci: [7, 'ch07-l02'],
      roc: [7, 'ch07-l03'],
      williams_r: [7, 'ch07-l04'],
      obv: [7, 'ch07-l05'],
      mfi: [7, 'ch07-l06'],
      cmf: [7, 'ch07-l07'],
    });
  });

  it('Học viện v3.3: each published indicator lesson is the catalog item that unlocks it', () => {
    const content = academyV3Fixture();
    for (const item of registry) {
      if (item.lesson_id === null) continue;
      const lesson = content.items.get(item.lesson_id);
      expect(lesson?.lesson_key, item.id).toBe(`technical:${item.id}`);
      expect(lesson?.capabilities, item.id).toEqual([`indicator:${item.id}`]);
    }
  });

  it('the default config offers exactly the 16 with master and both sides OFF', () => {
    const config = defaultConfig();
    expect(Object.keys(config.indicators)).toEqual([...CURRENT_INDICATOR_IDS]);
    for (const item of Object.values(config.indicators))
      expect([item.master_enabled, item.buy.enabled, item.sell.enabled]).toEqual([
        false,
        false,
        false,
      ]);
  });
});

describe('Bot SPEC §9.1 / §16-I calculation parity', () => {
  it('SMA includes T and needs N valid closes (I03)', () => {
    const series = calc('ma', { period: 5 }, closes([1, 2, 3, 4, 5, 6, 7])).value!;
    expect(series.slice(0, 4)).toEqual([null, null, null, null]);
    expect(series.slice(4)).toEqual([3, 4, 5]);
    const gap = closes([1, 2, 3, 4, 5, 6, 7]);
    gap[3] = { ...gap[3]!, close: Number.NaN };
    const withGap = calc('ma', { period: 3 }, gap).value!;
    expect(withGap.slice(2, 6)).toEqual([2, null, null, null]);
  });

  it('EMA seeds with the SMA of the first N consecutive closes and resets on a missing close (I06)', () => {
    const series = calc('ema', { period: 5 }, closes([1, 2, 3, 4, 5, 6, 7])).value!;
    expect(series.slice(0, 4)).toEqual([null, null, null, null]);
    expect(series.slice(4)).toEqual([3, 4, 5]); // not seeded by the first close
    const data = closes([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    data[4] = { ...data[4]!, close: Number.NaN };
    const reset = calc('ema', { period: 3 }, data).value!;
    expect(reset.slice(0, 4)).toEqual([null, null, 2, 3]);
    expect(reset.slice(4, 7)).toEqual([null, null, null]);
    expect(reset[7]).toBe(7); // new SMA seed of 6, 7, 8
    near(reset[8], 8);
  });

  it('RSI is Wilder with 100·G/(G+D); the first value needs N changes; 0/0 is null (I01)', () => {
    const series = calc('rsi', { period: 5 }, closes([100, 102, 101, 103, 102, 104])).value!;
    expect(series.slice(0, 5)).toEqual([null, null, null, null, null]);
    near(series[5], 75);
    const next = calc('rsi', { period: 5 }, closes([100, 102, 101, 103, 102, 104, 103])).value!;
    // Wilder smoothing 1/N after the SMA seed: G = (1.2·4 + 0)/5, D = (0.4·4 + 1)/5.
    near(next[6], (100 * 0.96) / (0.96 + 0.52));
    expect(calc('rsi', { period: 5 }, closes([10, 10, 10, 10, 10, 10, 10])).value![5]).toBeNull();
    near(calc('rsi', { period: 5 }, closes([10, 11, 12, 13, 14, 15, 16])).value![5], 100);
    near(calc('rsi', { period: 5 }, closes([16, 15, 14, 13, 12, 11, 10])).value![5], 0);
  });

  it('MACD = EMA fast − EMA slow, Signal = EMA of MACD, Histogram = MACD − Signal (I02)', () => {
    const series = calc('macd', { fast: 2, slow: 5, signal: 2 }, closes([1, 2, 3, 4, 5, 6, 7]));
    near(series.value![4], 1.5);
    near(series.signal![5], 1.5);
    near(series.histogram![5], 0);
    const cache = createSeriesCache(closes([1, 2, 3, 4, 5, 6, 7]));
    const buy = rowOf('macd.signal', 'buy', { fast: 2, slow: 5, signal: 2 });
    expect(buy.op).toBe('cross_up');
    expect(evaluateRow(buy, cache, 5).result).toBeNull(); // signal[4] is null
    expect(evaluateRow(buy, cache, 6).result).toBe(false);
    expect(evaluateRow({ ...buy, op: '>' }, cache, 5).result).toBe(false); // 1.5 > 1.5
  });

  it('Bollinger uses the population deviation (/N) and the 6 band actions, including T (I04, C12)', () => {
    const data = closes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const series = calc('bollinger', { period: 10, k: 2 }, data);
    near(series.middle![9], 5.5);
    near(series.std![9], Math.sqrt(8.25));
    near(series.upper![9], 5.5 + 2 * Math.sqrt(8.25));
    near(series.lower![9], 5.5 - 2 * Math.sqrt(8.25));
    expect(series.upper![8]).toBeNull();
    expect(evaluateRow(rowOf('bollinger.price_dir'), createSeriesCache(data), 9).result).toBe(true);
    // Reenter from below on synthetic band series:
    const band: SeriesMap = { lower: [10, 10], middle: [15, 15], upper: [20, 20] };
    const r1 = rowOf('bollinger.price_action');
    expect(evaluateRow(r1, fixedCache(band, [9, 12]), 1).result).toBe(true);
    expect(evaluateRow({ ...r1, action: 'reenter_upper' }, fixedCache(band, [9, 12]), 1).result).toBe(false);
    const missing: SeriesMap = { ...band, lower: [null, 10] };
    expect(evaluateRow(r1, fixedCache(missing, [9, 12]), 1).result).toBeNull();
  });

  it('Volume threshold = mult × mean of the N sessions BEFORE T, T excluded (I05)', () => {
    const data = closes([10, 11, 12, 13, 14, 15]).map((bar, i) => ({
      ...bar,
      volume: [100, 200, 300, 400, 500, 1000][i]!,
    }));
    const series = calc('volume', { lookback: 5, mult: 1 }, data);
    expect(series.threshold![5]).toBe(300); // not 416.67
    expect(series.threshold![4]).toBeNull();
    const config = defaultConfig().indicators.volume!;
    const buy: ParamsSideConfig = {
      ...(config.buy as ParamsSideConfig),
      enabled: true,
      params: { lookback: 5, mult: 1 },
    };
    expect(indicatorSideSignals('volume', buy, data)[5]).toBe(true); // V 1000 > 300 and price up
    // A volume spike on T never raises its own threshold.
    const spike = data.map((bar, i) => (i === 5 ? { ...bar, volume: 1_000_000 } : bar));
    expect(calc('volume', { lookback: 5, mult: 1 }, spike).threshold![5]).toBe(300);
  });

  it('MA Cross is an event between T-1 and T, with a missing prior value unknown (I07)', () => {
    const buy = rowOf('ma_cross.cross');
    const sell = rowOf('ma_cross.cross', 'sell');
    expect([buy.op, sell.op]).toEqual(['cross_up', 'cross_down']);
    const up = fixedCache({ fast: [2, 2, 3, 4], slow: [2, 2, 2, 2] });
    expect([1, 2, 3].map((i) => evaluateRow(buy, up, i).result)).toEqual([false, true, false]);
    const down = fixedCache({ fast: [2, 2, 1, 0], slow: [2, 2, 2, 2] });
    expect([1, 2, 3].map((i) => evaluateRow(sell, down, i).result)).toEqual([false, true, false]);
    expect(evaluateRow(buy, up, 0).result).toBeNull();
    expect(evaluateRow(buy, fixedCache({ fast: [null, 3], slow: [2, 2] }), 1).result).toBeNull();
    // Equal before then above is a cross-up (≤ then >); calc feeds two independent SMAs.
    const sma = calc(
      'ma_cross',
      { fast: 5, slow: 10 },
      closes(Array.from({ length: 30 }, (_, i) => 100 + i)),
    );
    expect(sma.fast![12]).not.toBeNull();
    expect(sma.slow![8]).toBeNull();
  });

  it('DMI: Wilder 1/N on +DM, −DM, TR and DX/ADX (I08)', () => {
    const data = [0, 1, 2, 3, 4, 5].map((i) => ohlc(i, 11 + i, 9 + i, 10 + i));
    const series = calc('dmi', { period: 5 }, data);
    near(series.plus![5], 50);
    near(series.minus![5], 0);
    expect(series.plus![4]).toBeNull();
    expect(series).toHaveProperty('dx');
    expect(series).toHaveProperty('adx');
    expect(series.value).toEqual(series.plus);
    const down = calc(
      'dmi',
      { period: 5 },
      [0, 1, 2, 3, 4, 5].map((i) => ohlc(i, 16 - i, 14 - i, 15 - i)),
    );
    near(down.plus![5], 0);
    near(down.minus![5], 50);
  });

  it('Stochastic: raw %K over N incl. T, %K = SMA(smooth), %D = SMA(d); equal bounds are null (I09)', () => {
    const data = Array.from({ length: 9 }, (_, i) => ohlc(i, 110, 90, 100));
    const series = calc('stochastic', { k: 5, d: 3, smooth: 3 }, data);
    expect(series.raw!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(series.raw![4]).toBe(50);
    expect(series.value![5]).toBeNull();
    expect(series.value![6]).toBe(50); // first %K
    expect(series.signal![7]).toBeNull();
    expect(series.signal![8]).toBe(50); // first %D
    const equal = calc('stochastic', { k: 5, d: 3, smooth: 3 }, flat(Array(9).fill(100)));
    expect(equal.raw!.every((value) => value === null)).toBe(true);
    expect(equal.value!.every((value) => value === null)).toBe(true);
  });

  it('CCI uses the typical price, 0.015 × the MEAN absolute deviation, T included (I10)', () => {
    const series = calc('cci', { period: 5 }, flat([10, 11, 12, 13, 14])).value!;
    near(series[4], 2 / (0.015 * 1.2)); // 111.111…, not the standard-deviation variant
    expect(series.slice(0, 4)).toEqual([null, null, null, null]);
    expect(calc('cci', { period: 5 }, flat([10, 10, 10, 10, 10])).value![4]).toBeNull();
  });

  it('OBV starts at 0, adds/subtracts V on close up/down, keeps on equal; baseline = SMA of OBV incl. T (I11)', () => {
    const data = closes([10, 11, 11, 9, 12]).map((bar, i) => ({
      ...bar,
      volume: [100, 200, 300, 400, 500][i]!,
    }));
    const series = calc('obv', { baseline: 5 }, data);
    expect(series.value).toEqual([0, 200, 200, -200, 300]);
    near(series.baseline![4], 100);
    expect(series.baseline![3]).toBeNull();
  });

  it('MFI: TP×V flows by TP direction, 100·P/(P+N), zero total is null (I12)', () => {
    const data = flat([10, 11, 12, 11, 10, 12]);
    const series = calc('mfi', { period: 5 }, data).value!;
    near(series[5], 62.5); // positive 3500, negative 2100
    expect(series[4]).toBeNull();
    expect(calc('mfi', { period: 5 }, flat([10, 10, 10, 10, 10, 10])).value![5]).toBeNull();
    near(calc('mfi', { period: 5 }, flat([10, 11, 12, 13, 14, 15])).value![5], 100);
  });

  it('CMF: Σ[(2C−H−L)/(H−L)·V] / ΣV over N sessions incl. T, ratio in −1..1 (I13)', () => {
    const data = Array.from({ length: 5 }, (_, i) => ohlc(i, 12, 8, 11, 100));
    near(calc('cmf', { period: 5 }, data).value![4], 0.5);
    // Zero total volume is missing, never 0.
    expect(
      calc(
        'cmf',
        { period: 5 },
        data.map((bar) => ({ ...bar, volume: 0 })),
      ).value![4],
    ).toBeNull();
  });

  it('Donchian: upper/lower of the N sessions BEFORE T, T excluded, so a breakout is reachable (I14)', () => {
    const data = [0, 1, 2, 3, 4].map((i) => ohlc(i, 10 + i, 6 + i, 8 + i));
    data.push(ohlc(5, 16, 11, 15, 100, 13));
    const series = calc('donchian', { period: 5 }, data);
    expect(series.upper![5]).toBe(14);
    expect(series.lower![5]).toBe(6);
    expect(series.upper![4]).toBeNull();
    const cache = createSeriesCache(data);
    expect(evaluateRow(rowOf('donchian.break', 'buy', { period: 5 }), cache, 5).result).toBe(true);
    expect(evaluateRow(rowOf('donchian.break', 'sell', { period: 5 }), cache, 5).result).toBe(false);
  });

  it('ROC is a percentage (20, not 0.2 or 2000); a non-positive base is missing (I15)', () => {
    near(calc('roc', { period: 2 }, closes([100, 110, 120])).value![2], 20);
    const zeroBase = closes([0, 5, 10]);
    expect(calc('roc', { period: 2 }, zeroBase).value![2]).toBeNull();
    expect(calc('roc', { period: 2 }, closes([100, 110, 120])).value![1]).toBeNull();
  });

  it('Williams %R: −100·(High_N − C)/(High_N − Low_N) incl. T on a −100..0 scale; equal bounds are null (I16)', () => {
    const data = Array.from({ length: 5 }, (_, i) => ohlc(i, 110, 90, 105));
    near(calc('williams_r', { period: 5 }, data).value![4], -25);
    expect(calc('williams_r', { period: 5 }, flat([5, 5, 5, 5, 5])).value![4]).toBeNull();
    const rising = calc('williams_r', { period: 5 }, closes([1, 2, 3, 4, 5, 6, 7, 8])).value!;
    for (const value of rising.filter((x): x is number => x !== null)) {
      expect(value).toBeGreaterThanOrEqual(-100);
      expect(value).toBeLessThanOrEqual(0);
    }
  });
});

describe('documented differences between the engine and the Bot SPEC §9.1 reference variants', () => {
  it('CMF treats High = Low as a zero multiplier (contribution 0), not as a missing value', () => {
    // SPEC §9.1: "H=L -> null; a window with a null does not pass". The engine (and the approved
    // chapter-7 lesson, registry.seed_and_missing) sets Multiplier = 0 when OHLC is valid.
    const data = Array.from({ length: 5 }, (_, i) => ohlc(i, 12, 8, 11, 100));
    data[2] = ohlc(2, 10, 10, 10, 100);
    const value = calc('cmf', { period: 5 }, data).value![4];
    near(value, (4 * 0.5 * 100) / 500); // the flat bar contributes 0 to the numerator, 100 to ΣV
    expect(entry('cmf').seed_and_missing).toMatch(/High=Low đặt Multiplier=0/);
  });

  it('Volume with a zero baseline has no threshold (unknown); SPEC leaves it unspecified', () => {
    const data = closes([10, 11, 12, 13, 14, 15], 0).map((bar, i) => ({
      ...bar,
      volume: i === 5 ? 10 : 0,
    }));
    expect(calc('volume', { lookback: 5, mult: 1 }, data).threshold![5]).toBeNull();
  });

  it('Bollinger `value` is the band width in percent (middle line is `middle`)', () => {
    const series = calc('bollinger', { period: 5, k: 2 }, closes([10, 11, 12, 13, 14]));
    expect(series.middle![4]).toBe(12);
    expect(series.value![4]).not.toBe(series.middle![4]);
  });
});

describe('SPEC V3 rule filtering (details in indicator-conditions-v3.test.ts)', () => {
  it('returns false through indicatorSideSignals when an enabled side has all rows disabled', () => {
    const data = closes(Array.from({ length: 30 }, (_, i) => 100 + i));
    const ma = defaultConfig().indicators.ma!.buy as RowSideConfig;
    const sideAllOff: RowSideConfig = {
      enabled: true,
      rules: ma.rules.map((r) => ({ ...r, enabled: false })),
    };
    expect(indicatorSideSignals('ma', sideAllOff, data).every((v) => v === false)).toBe(true);
  });

  it('evaluates SMA trend at t vs t - N with N the row period', () => {
    const r3 = rowOf('ma.trend', 'buy', { period: 3, enabled: true });
    const trend = fixedCache({ value: [10, 11, 12, 13, 14, 15] });
    expect(evaluateRow(r3, trend, 4).result).toBe(true); // 14 > 11
    expect(evaluateRow({ ...r3, period: 5 }, trend, 4).result).toBeNull(); // 4 - 5 < 0
    expect(evaluateRow({ ...r3, dir: 'down' }, trend, 4).result).toBe(false);
  });

  it('evaluates OBV breakout over t-N..t-1 on real series', () => {
    const data = closes([10, 11, 12, 13, 14, 15, 16]).map((bar, i) => ({
      ...bar,
      volume: [100, 100, 100, 100, 100, 100, 500][i]!,
    }));
    const series = calc('obv', { baseline: 5, breakout_period: 5 }, data);
    expect(series.upper![6]).toBe(500); // max of OBV[1..5] = [100, 200, 300, 400, 500]
    expect(series.value![6]).toBe(1000);
    const cache = createSeriesCache(data);
    expect(evaluateRow(rowOf('obv.breakout', 'buy', { period: 5 }), cache, 6).result).toBe(true);
    expect(evaluateRow(rowOf('obv.breakout', 'sell', { period: 5 }), cache, 6).result).toBe(false);
  });
});

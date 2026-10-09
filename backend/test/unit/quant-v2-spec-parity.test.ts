import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_INDICATOR_IDS,
  calc,
  canonicalJson,
  defaultConfig,
  evaluateRule,
  indicatorSideSignals,
  loadTechnicalRegistry,
  type Bar,
  type RegistryEntry,
  type Rule,
  type SeriesMap,
} from '../../src/modules/quant/v2/index.js';

/**
 * Bot SPEC §9.1 (calculation variants) and Appendix B (registry) against the IQX engine.
 * Cases I01..I16 are the acceptance fixtures of Bot SPEC §16-I; the registry is compared with
 * the approved `registryData` (16 indicators).
 */
const registry = loadTechnicalRegistry();
const here = dirname(fileURLToPath(import.meta.url));

type SpecEntry = {
  id: string;
  name: string;
  chapter: number;
  lesson_id: string;
  new_chapter: number;
  new_lesson_id: string;
  family: string;
  buy: unknown;
  sell: unknown;
  fields: unknown;
  validation: unknown;
};
const spec = JSON.parse(
  readFileSync(join(here, 'fixtures/bot-registry-spec-16.json'), 'utf8'),
) as SpecEntry[];

function entry(id: string): RegistryEntry {
  const found = registry.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
}

const ruleOf = (id: string, side: 'buy' | 'sell', ruleId: string): Rule => {
  const rule = entry(id)[side].rules.find((item) => item.id === ruleId);
  if (!rule) throw new Error(`${id}.${side}.${ruleId}`);
  return rule;
};

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

describe('registry matches the approved 16-indicator registryData', () => {
  it('has the same ids and order', () => {
    expect(spec.map((item) => item.id)).toEqual([...CURRENT_INDICATOR_IDS]);
    expect(registry.map((item) => item.id)).toEqual(spec.map((item) => item.id));
  });

  for (const specEntry of spec) {
    it(`${specEntry.id}: params, domains, steps, rules, allowed_ops, overrides and validation equal the spec`, () => {
      const actual = entry(specEntry.id);
      expect(canonicalJson(actual.buy)).toBe(canonicalJson(specEntry.buy));
      expect(canonicalJson(actual.sell)).toBe(canonicalJson(specEntry.sell));
      expect(canonicalJson(actual.fields)).toBe(canonicalJson(specEntry.fields));
      expect(canonicalJson(actual.validation)).toBe(canonicalJson(specEntry.validation));
      expect(actual.name).toBe(specEntry.name);
      expect(actual.family).toBe(specEntry.family);
    });

    it(`${specEntry.id}: lesson_id/chapter are the NEW ones; legacy position kept apart; both sides default OFF`, () => {
      const actual = entry(specEntry.id);
      expect(actual.chapter).toBe(specEntry.new_chapter);
      expect(actual.lesson_id).toBe(specEntry.new_lesson_id);
      expect(actual.legacy_chapter).toBe(specEntry.chapter);
      expect(actual.legacy_lesson_id).toBe(specEntry.lesson_id);
      expect(actual.buy.enabled).toBe(false);
      expect(actual.sell.enabled).toBe(false);
      // Per-indicator metadata of the repo is kept for the 16.
      expect(typeof actual.formula).toBe('string');
      expect(typeof actual.seed_and_missing).toBe('string');
      expect(actual.worked_fixture).toBeTruthy();
      expect(actual.calculation_version).toBe('iqx-ta-2.0');
      expect(actual.rule_version).toBe('iqx-rules-3.0');
    });
  }

  it('maps stochastic/cci/obv/mfi/cmf/donchian/roc/williams_r to their new lesson numbers', () => {
    const lessons = Object.fromEntries(registry.map((item) => [item.id, item.lesson_id]));
    expect(lessons).toMatchObject({
      stochastic: 'ch05-l04',
      cci: 'ch05-l05',
      obv: 'ch07-l01',
      mfi: 'ch07-l02',
      cmf: 'ch07-l03',
      donchian: 'ch10-l01',
      roc: 'ch10-l02',
      williams_r: 'ch10-l03',
    });
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

describe('shared-config.schema.json follows the 16-indicator registry', () => {
  type Obj = { [key: string]: unknown };
  const obj = (value: unknown): Obj => value as Obj;
  const schema = obj(
    JSON.parse(
      readFileSync(
        join(here, '../../src/modules/quant/v2/registry/shared-config.schema.json'),
        'utf8',
      ),
    ),
  );
  const rootProperties = obj(schema.properties);
  const indicators = obj(rootProperties.indicators);
  const indicatorProperties = obj(indicators.properties);

  it('requires exactly the 16 indicators, additionalProperties false, current rule version', () => {
    expect(Object.keys(indicatorProperties)).toEqual([...CURRENT_INDICATOR_IDS]);
    expect(indicators.required).toEqual([...CURRENT_INDICATOR_IDS]);
    expect(indicators.additionalProperties).toBe(false);
    expect(rootProperties.rule_version).toEqual({ const: 'iqx-rules-3.0' });
    expect(rootProperties.schema_version).toEqual({ const: '2.0' });
  });

  for (const item of registry) {
    it(`${item.id}: param domains, steps and rule operators per side equal the registry`, () => {
      for (const side of ['buy', 'sell'] as const) {
        const node = obj(obj(obj(indicatorProperties[item.id]).properties)[side]);
        const nodeProperties = obj(node.properties);
        const params = obj(obj(nodeProperties.params).properties);
        expect(Object.keys(params).sort()).toEqual(item.fields.map((f) => f.key).sort());
        for (const field of item.fields) {
          const effective = { ...field, ...item[side].field_overrides?.[field.key] };
          expect(params[field.key], `${side}.${field.key}`).toMatchObject({
            type: field.type,
            minimum: effective.min,
            maximum: effective.max,
            multipleOf: effective.step,
          });
        }
        const rules = obj(nodeProperties.rules).prefixItems as Obj[];
        expect(rules).toHaveLength(item[side].rules.length);
        item[side].rules.forEach((rule, index) => {
          const ruleProperties = obj(rules[index]!.properties);
          expect(obj(ruleProperties.id).const).toBe(rule.id);
          expect(obj(ruleProperties.allowed_ops).const).toEqual(rule.allowed_ops);
          expect(obj(ruleProperties.op).enum).toEqual(rule.allowed_ops);
        });
      }
    });
  }
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

  it('MACD = EMA fast − EMA slow, Signal = EMA of MACD, Histogram = MACD − Signal; a state, not a cross (I02)', () => {
    const series = calc('macd', { fast: 2, slow: 5, signal: 2 }, closes([1, 2, 3, 4, 5, 6, 7]));
    near(series.value![4], 1.5);
    near(series.signal![5], 1.5);
    near(series.histogram![5], 0);
    const buy = ruleOf('macd', 'buy', 'r1');
    expect(buy.kind).toBe('compare');
    expect(evaluateRule(buy, series, { fast: 2, slow: 5, signal: 2 }, 5)).toBe(false); // 1.5 > 1.5
  });

  it('Bollinger uses the population deviation (/N) and the open interval, including T (I04, C12)', () => {
    const data = closes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const series = calc('bollinger', { period: 10, k: 2 }, data);
    near(series.middle![9], 5.5);
    near(series.std![9], Math.sqrt(8.25));
    near(series.upper![9], 5.5 + 2 * Math.sqrt(8.25));
    near(series.lower![9], 5.5 - 2 * Math.sqrt(8.25));
    expect(series.upper![8]).toBeNull();
    const inside = ruleOf('bollinger', 'buy', 'r2');
    expect(evaluateRule(inside, series, {}, 9)).toBe(true);
    expect(evaluateRule({ ...inside, op: '∉' } as Rule, series, {}, 9)).toBe(false);
    // C12: lower=10, upper=20, close=10 -> ∈ false, ∉ true; a missing band leaves both unknown.
    const band: SeriesMap = { close: [10], lower: [10], upper: [20] };
    expect(evaluateRule(inside, band, {}, 0)).toBe(false);
    expect(evaluateRule({ ...inside, op: '∉' } as Rule, band, {}, 0)).toBe(true);
    const missing: SeriesMap = { close: [10], lower: [null], upper: [20] };
    expect(evaluateRule(inside, missing, {}, 0)).toBeNull();
    expect(evaluateRule({ ...inside, op: '∉' } as Rule, missing, {}, 0)).toBeNull();
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
    const buy = { ...config.buy, enabled: true, params: { lookback: 5, mult: 1 } };
    expect(indicatorSideSignals('volume', buy, data)[5]).toBe(true); // V 1000 > 300 and price up
    // A volume spike on T never raises its own threshold.
    const spike = data.map((bar, i) => (i === 5 ? { ...bar, volume: 1_000_000 } : bar));
    expect(calc('volume', { lookback: 5, mult: 1 }, spike).threshold![5]).toBe(300);
  });

  it('MA Cross is an event between T-1 and T, with a missing prior value unknown (I07)', () => {
    const buy = ruleOf('ma_cross', 'buy', 'r1');
    const sell = ruleOf('ma_cross', 'sell', 'r1');
    expect(buy.kind).toBe('cross');
    const series: SeriesMap = { fast: [2, 2, 3, 4], slow: [2, 2, 2, 2] };
    expect([1, 2, 3].map((i) => evaluateRule(buy, series, {}, i))).toEqual([false, true, false]);
    const down: SeriesMap = { fast: [2, 2, 1, 0], slow: [2, 2, 2, 2] };
    expect([1, 2, 3].map((i) => evaluateRule(sell, down, {}, i))).toEqual([false, true, false]);
    expect(evaluateRule(buy, series, {}, 0)).toBeNull();
    expect(evaluateRule(buy, { fast: [null, 3], slow: [2, 2] }, {}, 1)).toBeNull();
    // Equal before then above is a cross-up (≤ then >); calc feeds two independent SMAs.
    const sma = calc(
      'ma_cross',
      { fast: 5, slow: 10 },
      closes(Array.from({ length: 30 }, (_, i) => 100 + i)),
    );
    expect(sma.fast![12]).not.toBeNull();
    expect(sma.slow![8]).toBeNull();
  });

  it('DMI: Wilder 1/N on +DM, −DM and TR; only +DI/−DI, no ADX (I08)', () => {
    const data = [0, 1, 2, 3, 4, 5].map((i) => ohlc(i, 11 + i, 9 + i, 10 + i));
    const series = calc('dmi', { period: 5 }, data);
    near(series.plus![5], 50);
    near(series.minus![5], 0);
    expect(series.plus![4]).toBeNull();
    expect(series).not.toHaveProperty('dx');
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
    expect(evaluateRule(ruleOf('donchian', 'buy', 'r1'), series, { period: 5 }, 5)).toBe(true);
    expect(evaluateRule(ruleOf('donchian', 'sell', 'r1'), series, { period: 5 }, 5)).toBe(false);
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

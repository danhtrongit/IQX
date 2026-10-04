import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  and3,
  calc,
  canonicalJson,
  defaultConfig,
  evalTree,
  evaluateRule,
  indicatorSideSignals,
  loadTechnicalRegistry,
  parseTechnicalRegistry,
  sideSignals,
  type Bar,
  type CompareRule,
  type MembershipRule,
  type SeriesMap,
  type SharedConfig,
  type Side,
  type Tri,
  type TriTreeNode,
} from '../../src/modules/quant/v2/index.js';
import {
  deepFreeze,
  expectDeepClose,
  rawRegistry,
  reference,
  withDefects,
  withoutContext,
} from '../fixtures/bot-v2/reference.js';

const registry = loadTechnicalRegistry();
const bars = deepFreeze(reference.syntheticBars(950));
const contextless = deepFreeze(withoutContext(bars));
const defective = deepFreeze(withDefects(bars));
const SIDES: Side[] = ['buy', 'sell'];
const CONTEXT_IDS = [
  'rs_market',
  'rs_sector',
  'ad_line',
  'breadth_ma50',
  'new_high_low',
  'index_ma',
];

const bar = (close: number, i: number, extra: Partial<Bar> = {}): Bar => ({
  date: `2020-01-${String(i + 1).padStart(2, '0')}`,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
  ...extra,
});

describe('quant v2 technical registry', () => {
  it('loads 35 validated, frozen entries identical to the raw JSON', () => {
    expect(registry).toHaveLength(35);
    expect(loadTechnicalRegistry()).toBe(registry);
    expect(Object.isFrozen(registry[0])).toBe(true);
    expect(canonicalJson(registry)).toBe(canonicalJson(rawRegistry));
    expect(new Set(registry.map((r) => r.id)).size).toBe(35);
  });

  it('carries the fast<slow and step<max cross-field constraints', () => {
    const cross = Object.fromEntries(registry.map((r) => [r.id, r.validation?.cross_fields ?? []]));
    expect(cross.macd).toEqual([{ left: 'fast', op: '<', right: 'slow' }]);
    expect(cross.ma_cross).toEqual([{ left: 'fast', op: '<', right: 'slow' }]);
    expect(cross.psar).toEqual([{ left: 'step', op: '<', right: 'max' }]);
  });

  it('rejects malformed registries (look-ahead offset, duplicate id, unknown op)', () => {
    const clone = (): unknown[] => JSON.parse(JSON.stringify(rawRegistry)) as unknown[];
    const lookAhead = clone() as Array<{ buy: { rules: Array<{ lhs: { offset?: number } }> } }>;
    const firstRule = lookAhead[0]?.buy.rules[0];
    if (firstRule) firstRule.lhs.offset = 1;
    expect(() => parseTechnicalRegistry(lookAhead)).toThrow();
    const duplicated = clone();
    duplicated.push(duplicated[0]);
    expect(() => parseTechnicalRegistry(duplicated)).toThrow();
    const badOp = clone() as Array<{ sell: { rules: Array<{ op: string }> } }>;
    const sellRule = badOp[1]?.sell.rules[0];
    if (sellRule) sellRule.op = '>=';
    expect(() => parseTechnicalRegistry(badOp)).toThrow();
  });
});

describe('quant v2 calc — golden parity with the reference engine', () => {
  const datasets: Array<[string, readonly Bar[]]> = [
    ['synthetic', bars],
    ['without context', contextless],
    ['with defects', defective],
    ['short (30 bars)', bars.slice(0, 30)],
    ['empty', []],
  ];
  for (const [label, data] of datasets) {
    it(`matches every registry id and side on ${label} bars`, () => {
      for (const entry of registry) {
        for (const side of SIDES) {
          const params = entry[side].params;
          const actual = calc(entry.id, params, data);
          const expected = reference.calc(
            entry.id,
            { ...params },
            data.map((x) => ({ ...x })),
          );
          expectDeepClose(actual, expected, `${entry.id}.${side}`);
        }
      }
    });
  }

  it('matches non-default params (boundaries of the registry ranges)', () => {
    for (const entry of registry) {
      for (const bound of ['min', 'max'] as const) {
        const params: Record<string, number> = {};
        for (const field of entry.fields) params[field.key] = field[bound];
        expectDeepClose(
          calc(entry.id, params, bars),
          reference.calc(entry.id, params, [...bars]),
          `${entry.id}.${bound}`,
        );
      }
    }
  });

  it('context indicators are null (never 0) when context fields are missing', () => {
    for (const id of CONTEXT_IDS) {
      const entry = registry.find((r) => r.id === id);
      if (!entry) throw new Error(id);
      const series = calc(id, entry.buy.params, contextless);
      expect(
        series.value?.every((v) => v === null),
        id,
      ).toBe(true);
    }
  });

  it('is prefix-invariant and produces values for every indicator (no look-ahead)', () => {
    for (const entry of registry) {
      for (const side of SIDES) {
        const full = calc(entry.id, entry[side].params, bars);
        const prefix = calc(entry.id, entry[side].params, bars.slice(0, 800));
        expect(
          Object.values(full).some((s) => s.slice(400).some(Number.isFinite)),
          entry.id,
        ).toBe(true);
        for (const key of Object.keys(prefix)) {
          expect(full[key]?.slice(0, 800), `${entry.id} ${key}`).toEqual(prefix[key]);
        }
      }
    }
  });

  it('pivots are confirmed only from the confirmation bar', () => {
    // Low pivot at j=2 (100) with pivot=2 is known at t=4, not before.
    const lows = [104, 103, 100, 103, 101, 105];
    const data = lows.map((low, i) => ({ ...bar(low + 1, i), low, high: low + 3 }));
    const series = calc('distance_support', { pivot: 2, level: 0 }, data);
    expect(series.support?.slice(0, 4)).toEqual([null, null, null, null]);
    expect(series.support?.[4]).toBe(100);
    expect(series.support?.[5]).toBe(100);
  });

  it('throws on an unknown indicator id', () => {
    expect(() => calc('nope', {}, bars)).toThrow(/nope/);
  });
});

describe('quant v2 calc — reference worked examples (04-TESTS/test_engine.js)', () => {
  const near = (actual: number | null | undefined, expected: number, tol = 1e-8) => {
    expect(typeof actual).toBe('number');
    expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tol);
  };

  it('RSI Wilder worked example + next update', () => {
    const data = [100, 101, 100, 102, 101, 104, 103].map((p, i) => bar(p, i));
    const s = calc('rsi', { period: 5 }, data);
    near(s.value?.[5], 75);
    near(s.value?.[6], 100 - 100 / (1 + 0.96 / 0.52));
    expect(s.value?.[0]).toBeNull();
  });

  it('RSI zero-gain/loss cases', () => {
    const up = [10, 11, 12, 13, 14, 15, 16].map((p, i) => bar(p, i));
    const flat = up.map((x) => ({ ...x, close: 10 }));
    near(calc('rsi', { period: 5 }, up).value?.[5], 100);
    expect(calc('rsi', { period: 5 }, flat).value?.[5]).toBeNull();
  });

  it('SMA / EMA seed and recurrence', () => {
    const data = [10, 11, 12, 13, 14, 15].map((p, i) => bar(p, i));
    near(calc('ma', { period: 5 }, data).value?.[4], 12);
    near(calc('ema', { period: 5 }, data).value?.[5], 13);
  });

  it('Bollinger population deviation; volume baseline excludes the current bar', () => {
    const data = [10, 11, 12, 13, 14, 15].map((p, i) =>
      bar(p, i, { volume: i === 5 ? 1000 : 100 }),
    );
    near(calc('bollinger', { period: 5, k: 2 }, data).upper?.[4], 12 + 2 * Math.sqrt(2));
    near(calc('volume', { lookback: 5, mult: 1.5 }, data).threshold?.[5], 150);
  });
});

type WorkedFixture = { lesson_id: string; label: string; expected: number; tolerance: number };

/** Bars + read-out reproducing each indicator's worked fixture prompt through `calc`. */
const ohlc = (
  o: number,
  h: number,
  l: number,
  c: number,
  i: number,
  extra: Partial<Bar> = {},
): Bar => ({
  date: `2021-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 100,
  ...extra,
});
const flat = (price: number, i: number, extra: Partial<Bar> = {}): Bar =>
  ohlc(price, price, price, price, i, extra);
const closes = (values: number[]): Bar[] => values.map((c, i) => ohlc(c, c + 1, c - 1, c, i));
const lastOf = (series: Array<number | null> | undefined): number | null =>
  series?.[series.length - 1] ?? null;

const WORKED: Record<string, () => number | null> = {
  // G=1.2, D=0.4 → 75 (period 5, changes +3,+3,-1,-1,0).
  rsi: () => lastOf(calc('rsi', { period: 5 }, closes([100, 103, 106, 105, 104, 104])).value),
  // EMA fast(1)=103, EMA slow(2)=100, signal(2)=2 → histogram 1.
  macd: () =>
    lastOf(calc('macd', { fast: 1, slow: 2, signal: 2 }, closes([93, 95, 103])).histogram),
  ma: () => lastOf(calc('ma', { period: 5 }, closes([10, 12, 11, 13, 14])).value),
  bollinger: () => lastOf(calc('bollinger', { period: 2, k: 2 }, closes([97, 103])).upper),
  volume: () =>
    lastOf(
      calc(
        'volume',
        { lookback: 20, mult: 1.5 },
        closes(Array.from({ length: 21 }, () => 50)).map((x) => ({ ...x, volume: 1_000_000 })),
      ).threshold,
    ),
  ema: () =>
    lastOf(
      calc('ema', { period: 9 }, closes([...Array.from({ length: 9 }, () => 100), 110])).value,
    ),
  ma_cross: () => {
    const template = registry.find((r) => r.id === 'ma_cross')?.buy.rules[0];
    if (!template) return null;
    const series: SeriesMap = { fast: [-2, 1, 3, -1], slow: [0, 0, 0, 0] };
    return [0, 1, 2, 3].filter((i) => evaluateRule(template, series, {}, i) === true).length;
  },
  dmi: () =>
    lastOf(
      calc('dmi', { period: 1 }, [ohlc(97, 100, 94, 97, 0), ohlc(100, 102.4, 96.4, 100, 1)]).plus,
    ),
  adx: () =>
    lastOf(
      calc('adx', { period: 2 }, [
        ohlc(105, 110, 100, 105, 0),
        ohlc(108, 113, 103, 108, 1),
        ohlc(107, 112, 102, 107, 2),
      ]).dx,
    ),
  atr: () =>
    lastOf(
      calc('atr', { period: 1 }, [ohlc(99, 100, 98, 99, 0), ohlc(103, 105, 101, 103, 1)]).value,
    ),
  atr_percent: () =>
    lastOf(
      calc('atr_percent', { period: 1 }, [ohlc(50, 51, 49, 50, 0), ohlc(50, 51, 49, 50, 1)]).value,
    ),
  relative_volume: () =>
    lastOf(
      calc(
        'relative_volume',
        { lookback: 2 },
        [1_200_000, 1_200_000, 1_800_000].map((volume, i) => flat(10, i, { volume })),
      ).value,
    ),
  obv: () =>
    lastOf(
      calc('obv', { baseline: 2 }, [
        flat(10, 0, { volume: 5 }),
        flat(11, 1, { volume: 1000 }),
        flat(10, 2, { volume: 200 }),
      ]).value,
    ),
  mfi: () =>
    lastOf(
      calc('mfi', { period: 2 }, [
        flat(10, 0, { volume: 1 }),
        flat(15, 1, { volume: 20 }),
        flat(10, 2, { volume: 10 }),
      ]).value,
    ),
  cmf: () => lastOf(calc('cmf', { period: 1 }, [ohlc(105, 110, 100, 108, 0)]).value),
  n_day_high: () =>
    lastOf(
      calc(
        'n_day_high',
        { period: 3 },
        [100, 103, 102, 90].map((h, i) => ohlc(h - 1, h, h - 2, h - 1, i)),
      ).value,
    ),
  n_day_low: () =>
    lastOf(
      calc(
        'n_day_low',
        { period: 3 },
        [95, 92, 94, 99].map((l, i) => ohlc(l + 1, l + 2, l, l + 1, i)),
      ).value,
    ),
  distance_52w_high: () => {
    const data = Array.from({ length: 252 }, (_, i) =>
      i === 100 ? ohlc(95, 100, 94, 95, i) : ohlc(90, 95, 89, 90, i),
    );
    return lastOf(calc('distance_52w_high', { level: 0 }, data).value);
  },
  gap: () =>
    lastOf(
      calc('gap', { level: 0 }, [ohlc(100, 101, 99, 100, 0), ohlc(103, 104, 102, 103, 1)]).value,
    ),
  distance_support: () =>
    lastOf(
      calc(
        'distance_support',
        { pivot: 2, level: 0 },
        [104, 103, 100, 103, 101].map((l, i) => ohlc(l + 1, l + 2, l, i === 4 ? 102 : l + 1, i)),
      ).value,
    ),
  distance_resistance: () =>
    lastOf(
      calc(
        'distance_resistance',
        { pivot: 2, level: 0 },
        [105, 106, 110, 107, 101].map((h, i) => ohlc(h - 1, h, h - 2, i === 4 ? 100 : h - 1, i)),
      ).value,
    ),
  donchian: () =>
    lastOf(
      calc('donchian', { period: 2 }, [
        ohlc(100, 110, 95, 100, 0),
        ohlc(100, 105, 90, 100, 1),
        ohlc(100, 101, 99, 100, 2),
      ]).middle,
    ),
  keltner: () =>
    lastOf(
      calc('keltner', { ema: 1, atr: 1, k: 2 }, [
        ohlc(100, 101, 99, 100, 0),
        ohlc(100, 101.5, 98.5, 100, 1),
      ]).upper,
    ),
  bb_width: () => lastOf(calc('bb_width', { period: 2, k: 2, level: 0 }, closes([95, 105])).value),
  roc: () =>
    lastOf(
      calc('roc', { period: 20 }, closes([100, ...Array.from({ length: 19 }, () => 105), 110]))
        .value,
    ),
  williams_r: () =>
    lastOf(
      calc('williams_r', { period: 2 }, [ohlc(105, 110, 100, 105, 0), ohlc(94, 100, 90, 94, 1)])
        .value,
    ),
  rs_market: () =>
    lastOf(
      calc('rs_market', { lookback: 1 }, [
        flat(100, 0, { market: 100 }),
        flat(112, 1, { market: 105 }),
      ]).value,
    ),
  rs_sector: () =>
    lastOf(
      calc('rs_sector', { lookback: 1 }, [
        flat(100, 0, { sector: 100 }),
        flat(98, 1, { sector: 94 }),
      ]).value,
    ),
  ad_line: () =>
    lastOf(
      calc('ad_line', { baseline: 2 }, [
        flat(10, 0, { advances: 1000, declines: 0, coverage: 1 }),
        flat(10, 1, { advances: 180, declines: 120, coverage: 1 }),
      ]).value,
    ),
  breadth_ma50: () =>
    lastOf(
      calc('breadth_ma50', {}, [flat(10, 0, { above50: 120, eligible: 200, coverage: 1 })]).value,
    ),
  new_high_low: () =>
    lastOf(calc('new_high_low', {}, [flat(10, 0, { newHigh: 40, newLow: 15, coverage: 1 })]).value),
  index_ma: () => {
    const x = (240_000 - 1250) / 199;
    const data = Array.from({ length: 200 }, (_, i) =>
      flat(10, i, { market: i === 199 ? 1250 : x }),
    );
    const s = calc('index_ma', { period: 200 }, data);
    const index = lastOf(s.index);
    const value = lastOf(s.value);
    return index === null || value === null ? null : index - value;
  },
  stochastic: () =>
    lastOf(
      calc('stochastic', { k: 2, d: 2, smooth: 1 }, [
        ohlc(105, 110, 100, 105, 0),
        ohlc(94, 100, 90, 94, 1),
      ]).raw,
    ),
  cci: () =>
    lastOf(
      calc(
        'cci',
        { period: 4 },
        [96, 100.5, 100.5, 103].map((tp, i) => flat(tp, i)),
      ).value,
    ),
};
/** PSAR's fixture is the pre-clamp step `SAR + AF × (EP − SAR)`, which `calc` never exposes un-clamped. */
const WORKED_NOT_OBSERVABLE = new Set(['psar']);

describe('quant v2 calc — technical worked fixtures (chapters fixtures.json)', () => {
  const chaptersDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../src/modules/academy/content/chapters',
  );
  const chapterFixtures = new Map<string, WorkedFixture>();
  for (const chapter of readdirSync(chaptersDir)) {
    const file = join(chaptersDir, chapter, 'fixtures.json');
    for (const fixture of JSON.parse(readFileSync(file, 'utf8')) as WorkedFixture[]) {
      chapterFixtures.set(fixture.lesson_id, fixture);
    }
  }

  it('covers every indicator except the documented non-observable one', () => {
    for (const entry of registry) {
      expect(entry.id in WORKED || WORKED_NOT_OBSERVABLE.has(entry.id), entry.id).toBe(true);
    }
  });

  for (const entry of registry) {
    if (WORKED_NOT_OBSERVABLE.has(entry.id)) continue;
    it(`${entry.id} (${entry.lesson_id}) reproduces the lesson fixture`, () => {
      const fixture = chapterFixtures.get(entry.lesson_id);
      if (!fixture) throw new Error(`missing chapter fixture for ${entry.lesson_id}`);
      const worked = entry.worked_fixture as { expected: number };
      expect(worked.expected).toBe(fixture.expected);
      const compute = WORKED[entry.id];
      if (!compute) throw new Error(entry.id);
      const actual = compute();
      expect(typeof actual).toBe('number');
      expect(Math.abs((actual as number) - fixture.expected)).toBeLessThanOrEqual(
        fixture.tolerance,
      );
    });
  }
});

describe('quant v2 rules — three-valued logic', () => {
  const compare = (op: '>' | '<', kind: 'compare' | 'cross' = 'compare'): CompareRule => ({
    id: 'r',
    kind,
    lhs: { kind: 'series', key: 'v', offset: 0 },
    op,
    rhs: { kind: 'constant', value: 5 },
    allowed_ops: ['>', '<'],
  });

  it('strict comparisons and unknown on missing', () => {
    const s = { v: [5, 6, null] };
    expect(evaluateRule(compare('>'), s, {}, 0)).toBe(false);
    expect(evaluateRule(compare('>'), s, {}, 1)).toBe(true);
    expect(evaluateRule(compare('>'), s, {}, 2)).toBeNull();
    expect(evaluateRule(compare('>'), s, {}, 3)).toBeNull();
  });

  it('membership is an open interval and its complement only on valid inputs', () => {
    const m: MembershipRule = {
      id: 'm',
      kind: 'membership',
      lhs: { kind: 'series', key: 'v', offset: 0 },
      op: '∉',
      rhs: {
        kind: 'interval',
        lower: { kind: 'constant', value: 0 },
        upper: { kind: 'constant', value: 5 },
        bounds: 'open',
      },
      allowed_ops: ['∈', '∉'],
    };
    expect(evaluateRule(m, { v: [5, null, 3] }, {}, 0)).toBe(true);
    expect(evaluateRule(m, { v: [5, null, 3] }, {}, 1)).toBeNull();
    expect(evaluateRule({ ...m, op: '∈' }, { v: [5, null, 3] }, {}, 2)).toBe(true);
    const inverted = {
      ...m,
      rhs: { lower: { kind: 'constant', value: 9 }, upper: { kind: 'constant', value: 1 } },
    } as MembershipRule;
    expect(evaluateRule(inverted, { v: [5] }, {}, 0)).toBeNull();
  });

  it('cross differs from state and needs the previous value', () => {
    const rule: CompareRule = {
      ...compare('>', 'cross'),
      lhs: { kind: 'series', key: 'a' },
      rhs: { kind: 'series', key: 'b' },
    };
    const s = { a: [1, 3, 4], b: [2, 2, 2] };
    expect(evaluateRule(rule, s, {}, 1)).toBe(true);
    expect(evaluateRule(rule, s, {}, 2)).toBe(false);
    expect(evaluateRule(rule, s, {}, 0)).toBeNull();
    expect(evaluateRule(rule, { a: [null, 1], b: [2, 2] }, {}, 1)).toBeNull();
  });

  it('nested NOT unknown; AND/OR Kleene semantics; empty group throws', () => {
    expect(evalTree({ type: 'not', child: { type: 'rule', id: 'a' } }, () => null)).toBeNull();
    expect(and3([true, null])).toBeNull();
    expect(and3([false, null])).toBe(false);
    expect(and3([])).toBe(true);
    expect(() => evalTree({ type: 'and', children: [] }, () => true)).toThrow();
    const values: Record<string, Tri> = { a: true, b: null, c: false };
    const lookup = (id: string): Tri => values[id] ?? null;
    expect(
      evalTree(
        {
          type: 'or',
          children: [
            { type: 'rule', id: 'b' },
            { type: 'rule', id: 'a' },
          ],
        },
        lookup,
      ),
    ).toBe(true);
    expect(
      evalTree(
        {
          type: 'or',
          children: [
            { type: 'rule', id: 'b' },
            { type: 'rule', id: 'c' },
          ],
        },
        lookup,
      ),
    ).toBeNull();
    expect(
      evalTree(
        {
          type: 'and',
          children: [
            { type: 'indicator', indicator_id: 'a' },
            { type: 'not', child: { type: 'indicator', indicator_id: 'c' } },
          ],
        },
        lookup,
      ),
    ).toBe(true);
  });

  it('matches the reference evaluateRule/and3/evalTree on every registry rule and bar', () => {
    for (const entry of registry) {
      for (const side of SIDES) {
        const params = entry[side].params;
        const series = calc(entry.id, params, defective);
        for (const rule of entry[side].rules) {
          const ops: string[] = rule.allowed_ops;
          for (const op of ops) {
            const variant = { ...rule, op } as typeof rule;
            const actual = defective.map((_, i) => evaluateRule(variant, series, params, i));
            const expected = defective.map((_, i) =>
              reference.evaluateRule(variant, series, params, i),
            );
            expect(actual, `${entry.id}.${side}.${rule.id}.${op}`).toEqual(expected);
          }
        }
      }
    }
    const triples: Tri[][] = [
      [],
      [true],
      [false],
      [null],
      [true, null],
      [false, null],
      [true, true],
      [null, null, false],
    ];
    for (const values of triples) expect(and3(values)).toBe(reference.and3(values));
    const tree: TriTreeNode = {
      type: 'or',
      children: [
        {
          type: 'and',
          children: [
            { type: 'rule', id: 'a' },
            { type: 'rule', id: 'b' },
          ],
        },
        { type: 'not', child: { type: 'rule', id: 'c' } },
      ],
    };
    const combos: Tri[] = [true, false, null];
    for (const a of combos)
      for (const b of combos)
        for (const c of combos) {
          const lookup = (id: string): Tri => ({ a, b, c })[id] ?? null;
          expect(evalTree(tree, lookup)).toBe(reference.evalTree(tree, lookup));
        }
  });
});

describe('quant v2 sideSignals — parity and independence', () => {
  const configWith = (ids: string[], mutate?: (c: SharedConfig) => void): SharedConfig => {
    const c = defaultConfig();
    for (const id of ids) {
      const item = c.indicators[id];
      if (item) item.master_enabled = true;
    }
    mutate?.(c);
    return c;
  };

  it('matches the reference for every single indicator and for multi-indicator AND', () => {
    const cases: string[][] = [
      ...registry.map((r) => [r.id]),
      ['ma', 'rsi'],
      ['macd', 'volume', 'adx'],
      ['rs_market', 'index_ma', 'obv'],
    ];
    for (const ids of cases) {
      const c = deepFreeze(configWith(ids));
      for (const side of SIDES) {
        for (const data of [bars, contextless, defective]) {
          expect(sideSignals(c, data, side), `${ids.join('+')}.${side}`).toEqual(
            reference.sideSignals(c, rawRegistry, [...data], side),
          );
        }
      }
    }
  });

  it('no active indicator → all false; sides use their own params', () => {
    const c = configWith(['ma'], (x) => {
      const ma = x.indicators.ma;
      if (ma) ma.sell.params.period = 30;
    });
    const sell = sideSignals(c, bars, 'sell');
    const changed = configWith(['ma'], (x) => {
      const ma = x.indicators.ma;
      if (ma) {
        ma.sell.params.period = 30;
        ma.buy.params.period = 50;
      }
    });
    expect(sideSignals(changed, bars, 'sell')).toEqual(sell);
    const off = configWith([]);
    expect(sideSignals(off, bars, 'buy').every((v) => v === false)).toBe(true);
    expect(sideSignals(off, bars, 'sell').every((v) => v === false)).toBe(true);
    const sellOff = configWith(['ma'], (x) => {
      const ma = x.indicators.ma;
      if (ma) ma.sell.enabled = false;
    });
    expect(sideSignals(sellOff, bars, 'sell').every((v) => v === false)).toBe(true);
    const ma = c.indicators.ma;
    if (!ma) throw new Error('ma');
    expect(indicatorSideSignals('ma', ma.sell, bars)).toEqual(sell);
  });
});

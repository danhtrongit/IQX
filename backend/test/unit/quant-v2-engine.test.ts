import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_INDICATOR_IDS,
  LEGACY_REMOVED_INDICATOR_IDS,
  and3,
  calc,
  calcLegacy,
  canonicalJson,
  createSeriesCache,
  defaultConfig,
  defaultRows,
  evalTree,
  evaluateIndicatorSideSeries,
  evaluateRow,
  evaluateRule,
  indicatorSideSignals,
  isRowsEntry,
  loadLegacyTechnicalRegistry,
  loadTechnicalRegistry,
  parseLegacyTechnicalRegistry,
  parseTechnicalRegistry,
  sideSignals,
  type Bar,
  type CompareRule,
  type ConditionRow,
  type MembershipRule,
  type ParamsSideConfig,
  type RegistryEntry,
  type RowSideConfig,
  type SeriesCache,
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
const legacyRegistry = loadLegacyTechnicalRegistry();
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

/**
 * The calc requests (indicator id + full params) of one side: every row of a row-based indicator
 * asks for its own params (SPEC V3 §1.2); Volume asks for its side params.
 */
function calcRequests(
  entry: RegistryEntry,
  side: Side,
  rows?: ConditionRow[],
): Array<{ id: string; params: Record<string, number> }> {
  if (!isRowsEntry(entry)) return [{ id: entry.id, params: { ...entry[side].params } }];
  const seen = new Map<string, { id: string; params: Record<string, number> }>();
  const recorder: SeriesCache = {
    bars: [],
    series(id, params) {
      seen.set(`${id}:${canonicalJson(params)}`, { id, params: { ...params } });
      return {};
    },
    close: () => [],
  };
  for (const row of rows ?? defaultRows(entry, side)) evaluateRow(row, recorder, 0);
  return [...seen.values()];
}

/** Rows of one side with every numeric field at its domain bound (presets: first/last option). */
function boundRows(entry: RegistryEntry, side: Side, bound: 'min' | 'max'): ConditionRow[] {
  if (!isRowsEntry(entry)) return [];
  return defaultRows(entry, side).map((row) => {
    const definition = entry.rows.find((d) => d.id === row.id)!;
    const next: ConditionRow = { ...row };
    for (const field of definition.fields) {
      if (field.type === 'enum') continue;
      const options = field.options;
      next[field.key] = options ? options[bound === 'min' ? 0 : options.length - 1]! : field[bound];
    }
    return next;
  });
}

describe('quant v2 technical registry', () => {
  it('loads exactly the 16 validated, frozen entries identical to the raw JSON', () => {
    expect(registry).toHaveLength(16);
    expect(registry.map((r) => r.id)).toEqual([...CURRENT_INDICATOR_IDS]);
    expect(loadTechnicalRegistry()).toBe(registry);
    expect(Object.isFrozen(registry[0])).toBe(true);
    expect(canonicalJson(registry)).toBe(canonicalJson(rawRegistry));
    expect(new Set(registry.map((r) => r.id)).size).toBe(16);
  });

  it('keeps the legacy-only registry to the 19 removed indicators, never mixed with the current 16', () => {
    expect(legacyRegistry).toHaveLength(19);
    expect(legacyRegistry.map((r) => r.id).sort()).toEqual(
      [...LEGACY_REMOVED_INDICATOR_IDS].sort(),
    );
    expect(loadLegacyTechnicalRegistry()).toBe(legacyRegistry);
    expect(legacyRegistry.every((r) => r.rule_version === 'iqx-rules-2.0')).toBe(true);
    expect(registry.every((r) => r.rule_version === 'iqx-rules-4.0')).toBe(true);
    const current = new Set(registry.map((r) => r.id));
    expect(legacyRegistry.some((r) => current.has(r.id))).toBe(false);
    // A legacy document is not accepted as the current registry, nor the reverse.
    expect(() => parseTechnicalRegistry(legacyRegistry)).toThrow();
    expect(() => parseLegacyTechnicalRegistry(registry)).toThrow();
    expect(() => parseTechnicalRegistry([...registry, legacyRegistry[0]])).toThrow();
  });

  it('carries the fast<slow constraints on the SPEC V3 rows', () => {
    const constrained = registry.flatMap((r) =>
      isRowsEntry(r) ? r.rows.filter((row) => row.constraints.length) : [],
    );
    expect(constrained.map((row) => [row.id, row.constraints])).toEqual(
      [
        'macd.signal',
        'macd.zero',
        'macd.hist',
        'ma.ma_cross',
        'ema.ma_cross',
        'ma_cross.cross',
      ].map((id) => [id, [{ left: 'fast', op: '<', right: 'slow' }]]),
    );
    const volume = registry.find((r) => r.id === 'volume');
    expect(volume?.model === 'legacy_params' && volume.validation?.cross_fields).toEqual([]);
    // step<max belonged to the removed PSAR.
    expect(legacyRegistry.find((r) => r.id === 'psar')?.validation?.cross_fields).toEqual([
      { left: 'step', op: '<', right: 'max' },
    ]);
  });

  it('rejects malformed registries (look-ahead offset, duplicate id, unknown op, wrong rows, wrong id set)', () => {
    type Raw = Record<string, unknown> & {
      id: string;
      buy: { rules: Array<{ lhs: { offset?: number }; op: string }> };
      sell: { rules: Array<{ op: string }> };
      rows: Array<Record<string, unknown> & { buy: Record<string, unknown> }>;
    };
    const clone = (): Raw[] => JSON.parse(JSON.stringify(rawRegistry)) as Raw[];
    const find = (raw: Raw[], id: string): Raw => raw.find((e) => e.id === id)!;
    const lookAhead = clone();
    find(lookAhead, 'volume').buy.rules[0]!.lhs.offset = 1;
    expect(() => parseTechnicalRegistry(lookAhead)).toThrow();
    const duplicated = clone();
    duplicated.push(duplicated[0]!);
    expect(() => parseTechnicalRegistry(duplicated)).toThrow();
    const badOp = clone();
    find(badOp, 'volume').sell.rules[0]!.op = '>=';
    expect(() => parseTechnicalRegistry(badOp)).toThrow();
    expect(() => parseTechnicalRegistry(clone().slice(1))).toThrow(/exactly 16/);
    const badRowId = clone();
    find(badRowId, 'rsi').rows[1]!.id = 'rsi.previous';
    expect(() => parseTechnicalRegistry(badRowId)).toThrow(/rows must be exactly/);
    const badDefault = clone();
    find(badDefault, 'ma').rows[0]!.buy.period = 30;
    expect(() => parseTechnicalRegistry(badDefault)).toThrow(/default outside/);
    const badSentence = clone();
    find(badSentence, 'cci').rows[0]!.sentence = 'CCI {period} {op}';
    expect(() => parseTechnicalRegistry(badSentence)).toThrow(/placeholders/);
    const badModel = clone();
    find(badModel, 'volume').model = 'rows';
    expect(() => parseTechnicalRegistry(badModel)).toThrow();
  });
});

/**
 * Reference series for an id of the current registry. The reference DMI also emits `dx` and an
 * ADX `value`; the 16-indicator contract exposes only +DI/−DI (Bot spec §9.1: no ADX), with
 * `value` mirroring +DI.
 */
function referenceCalc(id: string, params: Record<string, number>, data: readonly Bar[]) {
  return reference.calc(
    id,
    { ...params },
    data.map((x) => ({ ...x })),
  );
}

describe('quant v2 calc — golden parity with the reference engine', () => {
  const datasets: Array<[string, readonly Bar[]]> = [
    ['synthetic', bars],
    ['without context', contextless],
    ['with defects', defective],
    ['short (30 bars)', bars.slice(0, 30)],
    ['empty', []],
  ];
  for (const [label, data] of datasets) {
    it(`matches every registry id and every row's params on ${label} bars`, () => {
      for (const entry of registry) {
        for (const side of SIDES) {
          for (const { id, params } of calcRequests(entry, side)) {
            expectDeepClose(
              calc(id, params, data),
              referenceCalc(id, params, data),
              `${entry.id}.${side}.${canonicalJson(params)}`,
            );
          }
        }
      }
    });

    it(`legacy engine keeps the 19 removed indicators verifiable on ${label} bars`, () => {
      for (const entry of legacyRegistry) {
        for (const side of SIDES) {
          const params = entry[side].params;
          const actual = calcLegacy(entry.id, params, data);
          const expected = reference.calc(
            entry.id,
            { ...params },
            data.map((x) => ({ ...x })),
          );
          expectDeepClose(actual, expected, `legacy ${entry.id}.${side}`);
        }
      }
    });
  }

  it('matches non-default params (boundaries of the row and Volume ranges)', () => {
    for (const entry of registry) {
      for (const bound of ['min', 'max'] as const) {
        const requests = isRowsEntry(entry)
          ? calcRequests(entry, 'buy', boundRows(entry, 'buy', bound))
          : [
              {
                id: entry.id,
                params: Object.fromEntries(entry.fields.map((f) => [f.key, f[bound]])),
              },
            ];
        for (const { id, params } of requests) {
          expectDeepClose(
            calc(id, params, bars),
            referenceCalc(id, params, bars),
            `${entry.id}.${bound}.${canonicalJson(params)}`,
          );
        }
      }
    }
  });

  it('calc serves only the 16 current indicators; removed ones are legacy-only', () => {
    for (const id of LEGACY_REMOVED_INDICATOR_IDS) {
      expect(() => calc(id, {}, bars), id).toThrow(/không được hỗ trợ/);
    }
    expect(calcLegacy('adx', { period: 14 }, bars).value?.some(Number.isFinite)).toBe(true);
    expect(calcLegacy('rsi', { period: 14, level: 30 }, bars)).toEqual(
      calc('rsi', { period: 14, level: 30 }, bars),
    );
  });

  it('DMI exposes +DI/−DI and ADX/DX series', () => {
    const series = calc('dmi', { period: 14 }, bars);
    expect(Object.keys(series).sort()).toEqual(
      ['adx', 'close', 'dx', 'high', 'index', 'low', 'minus', 'plus', 'value', 'volume'].sort(),
    );
    expect(series.value).toEqual(series.plus);
  });

  it('context indicators are legacy-only and null (never 0) when context fields are missing', () => {
    for (const id of CONTEXT_IDS) {
      const entry = legacyRegistry.find((r) => r.id === id);
      if (!entry) throw new Error(id);
      const series = calcLegacy(id, entry.buy.params, contextless);
      expect(
        series.value?.every((v) => v === null),
        id,
      ).toBe(true);
    }
  });

  it('is prefix-invariant and produces values for every indicator (no look-ahead)', () => {
    for (const entry of registry) {
      for (const side of SIDES) {
        for (const { id, params } of calcRequests(entry, side)) {
          const full = calc(id, params, bars);
          const prefix = calc(id, params, bars.slice(0, 800));
          expect(
            Object.values(full).some((s) => s.slice(400).some(Number.isFinite)),
            entry.id,
          ).toBe(true);
          for (const key of Object.keys(prefix)) {
            expect(full[key]?.slice(0, 800), `${entry.id} ${key}`).toEqual(prefix[key]);
          }
        }
      }
    }
  });

  it('every series a row reads is produced by calc (defaults resolve on warmed-up bars)', () => {
    const cache = createSeriesCache(bars);
    for (const entry of registry) {
      if (!isRowsEntry(entry)) continue;
      for (const side of SIDES) {
        for (const row of defaultRows(entry, side)) {
          const evaluation = evaluateRow(row, cache, 900);
          expect(evaluation.missing, `${row.id}.${side}`).toBe(false);
          expect(typeof evaluation.result, `${row.id}.${side}`).toBe('boolean');
        }
      }
    }
  });

  it('every series a Volume rule reads is produced by calc', () => {
    for (const entry of registry) {
      if (isRowsEntry(entry)) continue;
      for (const side of SIDES) {
        const series = calc(entry.id, entry[side].params, bars);
        for (const rule of entry[side].rules) {
          const operands =
            rule.kind === 'membership'
              ? [rule.lhs, rule.rhs.lower, rule.rhs.upper]
              : [rule.lhs, rule.rhs];
          for (const operand of operands) {
            if (operand.kind === 'series')
              expect(
                series[operand.key],
                `${entry.id}.${side}.${rule.id}.${operand.key}`,
              ).toBeDefined();
          }
        }
      }
    }
  });

  it('pivots are confirmed only from the confirmation bar (legacy distance_support)', () => {
    // Low pivot at j=2 (100) with pivot=2 is known at t=4, not before.
    const lows = [104, 103, 100, 103, 101, 105];
    const data = lows.map((low, i) => ({ ...bar(low + 1, i), low, high: low + 3 }));
    const series = calcLegacy('distance_support', { pivot: 2, level: 0 }, data);
    expect(series.support?.slice(0, 4)).toEqual([null, null, null, null]);
    expect(series.support?.[4]).toBe(100);
    expect(series.support?.[5]).toBe(100);
  });

  it('throws on an unknown indicator id', () => {
    expect(() => calc('nope', {}, bars)).toThrow(/nope/);
    expect(() => calcLegacy('nope', {}, bars)).toThrow(/nope/);
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

const calcAny = (id: string, params: Record<string, number>, data: readonly Bar[]) =>
  (CURRENT_INDICATOR_IDS as readonly string[]).includes(id)
    ? calc(id, params, data)
    : calcLegacy(id, params, data);

const WORKED: Record<string, () => number | null> = {
  // G=1.2, D=0.4 → 75 (period 5, changes +3,+3,-1,-1,0).
  rsi: () => lastOf(calcAny('rsi', { period: 5 }, closes([100, 103, 106, 105, 104, 104])).value),
  // EMA fast(1)=103, EMA slow(2)=100, signal(2)=2 → histogram 1.
  macd: () =>
    lastOf(calcAny('macd', { fast: 1, slow: 2, signal: 2 }, closes([93, 95, 103])).histogram),
  ma: () => lastOf(calcAny('ma', { period: 5 }, closes([10, 12, 11, 13, 14])).value),
  bollinger: () => lastOf(calcAny('bollinger', { period: 2, k: 2 }, closes([97, 103])).upper),
  volume: () =>
    lastOf(
      calcAny(
        'volume',
        { lookback: 20, mult: 1.5 },
        closes(Array.from({ length: 21 }, () => 50)).map((x) => ({ ...x, volume: 1_000_000 })),
      ).threshold,
    ),
  ema: () =>
    lastOf(
      calcAny('ema', { period: 9 }, closes([...Array.from({ length: 9 }, () => 100), 110])).value,
    ),
  ma_cross: () => {
    const entry = registry.find((r) => r.id === 'ma_cross');
    if (!entry || !isRowsEntry(entry)) return null;
    const row = defaultRows(entry, 'buy')[0]!;
    const series: SeriesMap = { fast: [-2, 1, 3, -1], slow: [0, 0, 0, 0] };
    const cache: SeriesCache = { bars: [], series: () => series, close: () => [] };
    return [0, 1, 2, 3].filter((i) => evaluateRow(row, cache, i).result === true).length;
  },
  dmi: () =>
    lastOf(
      calcAny('dmi', { period: 1 }, [ohlc(97, 100, 94, 97, 0), ohlc(100, 102.4, 96.4, 100, 1)])
        .plus,
    ),
  adx: () =>
    lastOf(
      calcAny('adx', { period: 2 }, [
        ohlc(105, 110, 100, 105, 0),
        ohlc(108, 113, 103, 108, 1),
        ohlc(107, 112, 102, 107, 2),
      ]).dx,
    ),
  atr: () =>
    lastOf(
      calcAny('atr', { period: 1 }, [ohlc(99, 100, 98, 99, 0), ohlc(103, 105, 101, 103, 1)]).value,
    ),
  atr_percent: () =>
    lastOf(
      calcAny('atr_percent', { period: 1 }, [ohlc(50, 51, 49, 50, 0), ohlc(50, 51, 49, 50, 1)])
        .value,
    ),
  relative_volume: () =>
    lastOf(
      calcAny(
        'relative_volume',
        { lookback: 2 },
        [1_200_000, 1_200_000, 1_800_000].map((volume, i) => flat(10, i, { volume })),
      ).value,
    ),
  obv: () =>
    lastOf(
      calcAny('obv', { baseline: 2 }, [
        flat(10, 0, { volume: 5 }),
        flat(11, 1, { volume: 1000 }),
        flat(10, 2, { volume: 200 }),
      ]).value,
    ),
  mfi: () =>
    lastOf(
      calcAny('mfi', { period: 2 }, [
        flat(10, 0, { volume: 1 }),
        flat(15, 1, { volume: 20 }),
        flat(10, 2, { volume: 10 }),
      ]).value,
    ),
  cmf: () => lastOf(calcAny('cmf', { period: 1 }, [ohlc(105, 110, 100, 108, 0)]).value),
  n_day_high: () =>
    lastOf(
      calcAny(
        'n_day_high',
        { period: 3 },
        [100, 103, 102, 90].map((h, i) => ohlc(h - 1, h, h - 2, h - 1, i)),
      ).value,
    ),
  n_day_low: () =>
    lastOf(
      calcAny(
        'n_day_low',
        { period: 3 },
        [95, 92, 94, 99].map((l, i) => ohlc(l + 1, l + 2, l, l + 1, i)),
      ).value,
    ),
  distance_52w_high: () => {
    const data = Array.from({ length: 252 }, (_, i) =>
      i === 100 ? ohlc(95, 100, 94, 95, i) : ohlc(90, 95, 89, 90, i),
    );
    return lastOf(calcAny('distance_52w_high', { level: 0 }, data).value);
  },
  gap: () =>
    lastOf(
      calcAny('gap', { level: 0 }, [ohlc(100, 101, 99, 100, 0), ohlc(103, 104, 102, 103, 1)]).value,
    ),
  distance_support: () =>
    lastOf(
      calcAny(
        'distance_support',
        { pivot: 2, level: 0 },
        [104, 103, 100, 103, 101].map((l, i) => ohlc(l + 1, l + 2, l, i === 4 ? 102 : l + 1, i)),
      ).value,
    ),
  distance_resistance: () =>
    lastOf(
      calcAny(
        'distance_resistance',
        { pivot: 2, level: 0 },
        [105, 106, 110, 107, 101].map((h, i) => ohlc(h - 1, h, h - 2, i === 4 ? 100 : h - 1, i)),
      ).value,
    ),
  donchian: () =>
    lastOf(
      calcAny('donchian', { period: 2 }, [
        ohlc(100, 110, 95, 100, 0),
        ohlc(100, 105, 90, 100, 1),
        ohlc(100, 101, 99, 100, 2),
      ]).middle,
    ),
  keltner: () =>
    lastOf(
      calcAny('keltner', { ema: 1, atr: 1, k: 2 }, [
        ohlc(100, 101, 99, 100, 0),
        ohlc(100, 101.5, 98.5, 100, 1),
      ]).upper,
    ),
  bb_width: () =>
    lastOf(calcAny('bb_width', { period: 2, k: 2, level: 0 }, closes([95, 105])).value),
  roc: () =>
    lastOf(
      calcAny('roc', { period: 20 }, closes([100, ...Array.from({ length: 19 }, () => 105), 110]))
        .value,
    ),
  williams_r: () =>
    lastOf(
      calcAny('williams_r', { period: 2 }, [ohlc(105, 110, 100, 105, 0), ohlc(94, 100, 90, 94, 1)])
        .value,
    ),
  rs_market: () =>
    lastOf(
      calcAny('rs_market', { lookback: 1 }, [
        flat(100, 0, { market: 100 }),
        flat(112, 1, { market: 105 }),
      ]).value,
    ),
  rs_sector: () =>
    lastOf(
      calcAny('rs_sector', { lookback: 1 }, [
        flat(100, 0, { sector: 100 }),
        flat(98, 1, { sector: 94 }),
      ]).value,
    ),
  ad_line: () =>
    lastOf(
      calcAny('ad_line', { baseline: 2 }, [
        flat(10, 0, { advances: 1000, declines: 0, coverage: 1 }),
        flat(10, 1, { advances: 180, declines: 120, coverage: 1 }),
      ]).value,
    ),
  breadth_ma50: () =>
    lastOf(
      calcAny('breadth_ma50', {}, [flat(10, 0, { above50: 120, eligible: 200, coverage: 1 })])
        .value,
    ),
  new_high_low: () =>
    lastOf(
      calcAny('new_high_low', {}, [flat(10, 0, { newHigh: 40, newLow: 15, coverage: 1 })]).value,
    ),
  index_ma: () => {
    const x = (240_000 - 1250) / 199;
    const data = Array.from({ length: 200 }, (_, i) =>
      flat(10, i, { market: i === 199 ? 1250 : x }),
    );
    const s = calcAny('index_ma', { period: 200 }, data);
    const index = lastOf(s.index);
    const value = lastOf(s.value);
    return index === null || value === null ? null : index - value;
  },
  stochastic: () =>
    lastOf(
      calcAny('stochastic', { k: 2, d: 2, smooth: 1 }, [
        ohlc(105, 110, 100, 105, 0),
        ohlc(94, 100, 90, 94, 1),
      ]).raw,
    ),
  cci: () =>
    lastOf(
      calcAny(
        'cci',
        { period: 4 },
        [96, 100.5, 100.5, 103].map((tp, i) => flat(tp, i)),
      ).value,
    ),
};
/** PSAR's fixture is the pre-clamp step `SAR + AF × (EP − SAR)`, which `calc` never exposes un-clamped. */
const WORKED_NOT_OBSERVABLE = new Set(['psar']);

describe('quant v2 calc — technical worked fixtures (lesson files)', () => {
  /**
   * Worked fixtures of the retired 13-chapter lesson files, moved to test fixtures and keyed by
   * indicator id (the registries' lesson ids follow the academy catalog, the fixtures do not).
   */
  const fixtureDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../fixtures/quant/lesson-fixtures',
  );
  const workedFixtures = new Map<string, WorkedFixture & { legacy: boolean }>();
  for (const name of readdirSync(fixtureDir)) {
    const fixture = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as {
      indicator_id: string;
      legacy: boolean;
      source_lesson_id: string;
      label: string;
      expected: number;
      tolerance: number;
    };
    workedFixtures.set(fixture.indicator_id, {
      lesson_id: fixture.source_lesson_id,
      label: fixture.label,
      expected: fixture.expected,
      tolerance: fixture.tolerance,
      legacy: fixture.legacy,
    });
  }

  it('covers every indicator except the documented non-observable one', () => {
    for (const entry of [...registry, ...legacyRegistry]) {
      expect(entry.id in WORKED || WORKED_NOT_OBSERVABLE.has(entry.id), entry.id).toBe(true);
    }
  });

  const cases = [
    ...registry.map((entry) => ({ entry, legacy: false })),
    ...legacyRegistry.map((entry) => ({ entry, legacy: true })),
  ];
  for (const { entry, legacy } of cases) {
    if (WORKED_NOT_OBSERVABLE.has(entry.id)) continue;
    it(`${legacy ? 'legacy ' : ''}${entry.id} reproduces the lesson fixture`, () => {
      const fixture = workedFixtures.get(entry.id);
      if (!fixture) throw new Error(`missing fixture for ${entry.id}`);
      expect(fixture.legacy).toBe(legacy);
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

  it('B13 membership ∉ with a missing price or missing band is null, never true', () => {
    const m: MembershipRule = {
      id: 'm',
      kind: 'membership',
      lhs: { kind: 'series', key: 'v' },
      op: '∉',
      rhs: {
        kind: 'interval',
        lower: { kind: 'series', key: 'lo' },
        upper: { kind: 'series', key: 'hi' },
        bounds: 'open',
      },
      allowed_ops: ['∈', '∉'],
    };
    expect(evaluateRule(m, { v: [null], lo: [0], hi: [5] }, {}, 0)).toBeNull();
    expect(evaluateRule(m, { v: [3], lo: [null], hi: [5] }, {}, 0)).toBeNull();
    expect(evaluateRule(m, { v: [3], lo: [0] }, {}, 0)).toBeNull();
    expect(evaluateRule({ ...m, op: '∈' }, { v: [3], lo: [null], hi: [5] }, {}, 0)).toBeNull();
  });

  it('B14 a rule op changed from > to < within allowed_ops is evaluated with <', () => {
    const base: CompareRule = {
      id: 'r',
      kind: 'compare',
      lhs: { kind: 'series', key: 'v' },
      op: '>',
      rhs: { kind: 'constant', value: 5 },
      allowed_ops: ['>', '<'],
    };
    expect(evaluateRule(base, { v: [6] }, {}, 0)).toBe(true);
    expect(evaluateRule({ ...base, op: '<' }, { v: [6] }, {}, 0)).toBe(false);
    expect(evaluateRule({ ...base, op: '<' }, { v: [4] }, {}, 0)).toBe(true);
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

  it('matches the reference evaluateRule/and3/evalTree on every Volume rule and bar', () => {
    for (const entry of registry) {
      if (isRowsEntry(entry)) continue;
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

describe('quant v2 sideSignals — shared evaluator and independence', () => {
  const configWith = (ids: string[], mutate?: (c: SharedConfig) => void): SharedConfig => {
    const c = defaultConfig();
    for (const id of ids) {
      const item = c.indicators[id];
      if (item) {
        // Registry defaults are OFF on both sides; the test turns the whole indicator on.
        item.master_enabled = true;
        item.buy.enabled = true;
        item.sell.enabled = true;
      }
    }
    mutate?.(c);
    return c;
  };
  const rowOf = (c: SharedConfig, id: string, side: Side, index = 0): ConditionRow =>
    (c.indicators[id]![side] as RowSideConfig).rules[index]!;

  it('ANDs the per-indicator evaluations for every single indicator and for multi-indicator configs', () => {
    const cases: string[][] = [
      ...registry.map((r) => [r.id]),
      ['ma', 'rsi'],
      ['macd', 'volume', 'dmi'],
      ['obv', 'cmf', 'mfi'],
      [...CURRENT_INDICATOR_IDS],
    ];
    for (const ids of cases) {
      const c = deepFreeze(configWith(ids));
      for (const side of SIDES) {
        for (const data of [bars, contextless, defective]) {
          const perIndicator = ids.map((id) =>
            evaluateIndicatorSideSeries(id, c.indicators[id]![side], data).map((e) =>
              e.status === 'no_signal' ? false : e.result,
            ),
          );
          const expected = data.map((_, i) => and3(perIndicator.map((s) => s[i] ?? null)));
          expect(sideSignals(c, data, side), `${ids.join('+')}.${side}`).toEqual(expected);
        }
      }
    }
  });

  it('Volume (params + rules) still matches the reference sideSignals', () => {
    const volumeRegistry = rawRegistry.filter((e) => e.id === 'volume');
    const c = deepFreeze(configWith(['volume']));
    const volumeOnly = { ...c, indicators: { volume: c.indicators.volume! } };
    for (const side of SIDES)
      for (const data of [bars, defective])
        expect(sideSignals(c, data, side)).toEqual(
          reference.sideSignals(volumeOnly, volumeRegistry, [...data], side),
        );
  });

  it('no active indicator → all false; sides use their own rows', () => {
    const c = configWith(['ma'], (x) => (rowOf(x, 'ma', 'sell').period = 50));
    const sell = sideSignals(c, bars, 'sell');
    const changed = configWith(['ma'], (x) => {
      rowOf(x, 'ma', 'sell').period = 50;
      rowOf(x, 'ma', 'buy').period = 100;
    });
    expect(sideSignals(changed, bars, 'sell')).toEqual(sell);
    const off = configWith([]);
    expect(sideSignals(off, bars, 'buy').every((v) => v === false)).toBe(true);
    expect(sideSignals(off, bars, 'sell').every((v) => v === false)).toBe(true);
    const sellOff = configWith(['ma'], (x) => (x.indicators.ma!.sell.enabled = false));
    expect(sideSignals(sellOff, bars, 'sell').every((v) => v === false)).toBe(true);
    expect(indicatorSideSignals('ma', c.indicators.ma!.sell, bars)).toEqual(sell);
  });

  it('B05 the same indicator with different per-side rows yields independent series', () => {
    const c = configWith(['rsi'], (x) => {
      Object.assign(rowOf(x, 'rsi', 'buy'), { period: 12, threshold: 30 });
      Object.assign(rowOf(x, 'rsi', 'sell'), { period: 10, threshold: 75 });
    });
    const buy = indicatorSideSignals('rsi', c.indicators.rsi!.buy, bars);
    const sell = indicatorSideSignals('rsi', c.indicators.rsi!.sell, bars);
    expect(buy).not.toEqual(sell);
    // Changing one side's rows never alters the other side's series.
    const edited = structuredClone(c);
    rowOf(edited, 'rsi', 'sell').period = 21;
    expect(indicatorSideSignals('rsi', edited.indicators.rsi!.buy, bars)).toEqual(buy);
    expect(indicatorSideSignals('rsi', edited.indicators.rsi!.sell, bars)).not.toEqual(sell);
  });

  it('B06 sideSignals ANDs every active indicator: one false dominates, no majority vote', () => {
    const c = deepFreeze(configWith(['ma', 'rsi', 'macd']));
    const perIndicator = ['ma', 'rsi', 'macd'].map((id) =>
      indicatorSideSignals(id, c.indicators[id]!.buy, bars),
    );
    const expected = bars.map((_, i) => and3(perIndicator.map((signals) => signals[i] ?? null)));
    expect(sideSignals(c, bars, 'buy')).toEqual(expected);
    expect(and3([true, true, false])).toBe(false);
    expect(and3([true, false])).toBe(false);
    expect(and3([true])).toBe(true);

    // Per-indicator: a false rule dominates an otherwise-true rule at every bar.
    const trueRule: CompareRule = {
      id: 't',
      kind: 'compare',
      lhs: { kind: 'constant', value: 2 },
      op: '>',
      rhs: { kind: 'constant', value: 1 },
      allowed_ops: ['>', '<'],
    };
    const falseRule: CompareRule = {
      id: 'f',
      kind: 'compare',
      lhs: { kind: 'constant', value: 1 },
      op: '>',
      rhs: { kind: 'constant', value: 2 },
      allowed_ops: ['>', '<'],
    };
    const side: ParamsSideConfig = {
      enabled: true,
      params: { lookback: 20, mult: 1 },
      rules: [trueRule, falseRule],
    };
    expect(indicatorSideSignals('volume', side, bars).every((value) => value === false)).toBe(true);
  });

  it('B09 missing data on one Buy indicator makes Buy not-true while an unaffected Sell side is independent', () => {
    // Buy needs a 200-session SMA but only 120 sessions exist; Sell uses its own 20-session SMA.
    const c = configWith(['ma'], (x) => {
      rowOf(x, 'ma', 'buy').period = 200;
      rowOf(x, 'ma', 'sell').period = 20;
    });
    const short = bars.slice(0, 120);
    const buy = sideSignals(c, short, 'buy');
    expect(buy.every((value) => value !== true)).toBe(true);
    expect(buy.every((value) => value === null)).toBe(true);
    const sell = sideSignals(c, short, 'sell');
    expect(sell.some((value) => value === true || value === false)).toBe(true);
  });

  it('B10 signals are per-bar and never memo a prior bar', () => {
    const rule: CompareRule = {
      id: 'r',
      kind: 'compare',
      lhs: { kind: 'series', key: 'v' },
      op: '>',
      rhs: { kind: 'constant', value: 5 },
      allowed_ops: ['>', '<'],
    };
    const series = { v: [5, 6, 4] };
    expect(evaluateRule(rule, series, {}, 0)).toBe(false);
    expect(evaluateRule(rule, series, {}, 1)).toBe(true);
    expect(evaluateRule(rule, series, {}, 2)).toBe(false);

    const c = configWith(['ma']);
    const full = indicatorSideSignals('ma', c.indicators.ma!.buy, bars);
    const prefix = indicatorSideSignals('ma', c.indicators.ma!.buy, bars.slice(0, 700));
    expect(full.slice(0, 700)).toEqual(prefix);
  });
});

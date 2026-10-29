import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

// The Practice engine must decide through the shared evaluator of Bot / Backtest / Alerts.
vi.mock('../../src/modules/quant/v2/conditions/evaluate.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/modules/quant/v2/conditions/evaluate.js')>();
  return { ...actual, evaluateIndicatorSide: vi.fn(actual.evaluateIndicatorSide) };
});

import {
  defaultPracticeConfig,
  practiceEntry,
  toSideConfig,
} from '../../src/modules/practice/practice.config.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
import {
  PracticeEngineError,
  evaluateSide,
  simulate,
  type SimulationInput,
} from '../../src/modules/practice/practice.engine.js';
import { rowLabel, rowOperandLabels } from '../../src/modules/practice/practice.labels.js';
import type { PracticeRowsConfig } from '../../src/modules/practice/practice.types.js';
import {
  calc,
  createSeriesCache,
  evaluateIndicatorSide,
  isRowsEntry,
  type Bar,
  type RegistryEntry,
  type RowsRegistryEntry,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import { makeBars } from './practice-fixtures.js';

const SIDES: readonly Side[] = ['buy', 'sell'];
const ROW_INDICATORS = PRACTICE_INDICATOR_IDS.filter((id) => id !== 'volume');

const rowsEntry = (id: string): RowsRegistryEntry => {
  const entry = practiceEntry(id);
  if (!entry || !isRowsEntry(entry)) throw new Error(`${id} is not row-based`);
  return entry;
};

const random = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function walkBars(seed: number, length = 700): Bar[] {
  const next = random(seed * 7919);
  const closes: number[] = [];
  let price = 15_000 + Math.floor(next() * 50_000);
  for (let i = 0; i < length; i++) {
    price = Math.max(1_000, Math.round((price * (1 + (next() - 0.5) * 0.05)) / 10) * 10);
    closes.push(price);
  }
  return makeBars(closes).map((bar, i) => ({ ...bar, volume: 50_000 + ((i * 7919) % 90_000) }));
}

function defaultsInput(
  entry: RegistryEntry,
  bars: Bar[],
  extra: Partial<SimulationInput> = {},
): SimulationInput {
  const defaults = defaultPracticeConfig(entry);
  return {
    entry,
    bars,
    firstTestIndex: 300,
    lastTestIndex: bars.length - 1,
    buy: toSideConfig(entry, 'buy', defaults.buy),
    sell: toSideConfig(entry, 'sell', defaults.sell),
    holdMaxSessions: 15,
    ...extra,
  };
}

describe('practice engine decides through the shared evaluator (SPEC V3 §1)', () => {
  it('calls evaluateIndicatorSide once per evaluated close with the engine cache', () => {
    const entry = rowsEntry('rsi');
    const bars = walkBars(3);
    const cache = createSeriesCache(bars);
    const input = defaultsInput(entry, bars, { cache });
    const spy = vi.mocked(evaluateIndicatorSide);
    spy.mockClear();
    const out = simulate(input);
    const closes = input.lastTestIndex - input.firstTestIndex + 1;
    expect(spy).toHaveBeenCalledTimes(closes);
    // exactly one tab is evaluated per close: Mua while flat, Bán while holding
    spy.mock.calls.forEach((call, offset) => {
      const [indicatorId, side, usedCache, index] = call;
      expect(indicatorId).toBe('rsi');
      expect(usedCache).toBe(cache);
      expect(index).toBe(input.firstTestIndex + offset);
      expect([input.buy, input.sell]).toContain(side);
    });
    const flatCloses = spy.mock.calls.filter((call) => call[1] === input.buy).length;
    const holdingCloses = spy.mock.calls.filter((call) => call[1] === input.sell).length;
    expect(flatCloses + holdingCloses).toBe(closes);
    expect(out.nav).toHaveLength(closes);
  });

  it('has no private rule loop any more (no and3, no per-rule evaluation in the engine or service)', () => {
    const read = (name: string) =>
      readFileSync(new URL(`../../src/modules/practice/${name}`, import.meta.url), 'utf8');
    const engine = read('practice.engine.ts');
    expect(engine).not.toMatch(/\band3\b/);
    expect(engine).not.toMatch(/evaluateRuleWithEvidence/);
    expect(engine).not.toMatch(/\bcalc\(/);
    expect(read('practice.service.ts')).not.toMatch(/\bcalc\(/);
    expect(read('practice.chart.ts')).not.toMatch(/\bcalc\(/);
  });
});

describe('practice engine: NO_SIGNAL is not a signal', () => {
  const entry = rowsEntry('ma');
  const closes = (() => {
    const values: number[] = new Array(130).fill(100);
    for (let s = 9; s <= 100; s++) values[29 + s] = 110 + (s - 9);
    return values;
  })();

  function maSides(mutate: (config: PracticeRowsConfig) => void) {
    const config = structuredClone(defaultPracticeConfig(entry) as PracticeRowsConfig);
    for (const side of SIDES) {
      config[side].rules.forEach((row) => {
        row.enabled = row.id === 'ma.trend';
        if (row.id === 'ma.trend') {
          row.period = 5;
          row.dir = side === 'buy' ? 'up' : 'down';
        }
      });
    }
    mutate(config);
    return {
      buy: toSideConfig(entry, 'buy', config.buy),
      sell: toSideConfig(entry, 'sell', config.sell),
    };
  }
  const run = (mutate: (config: PracticeRowsConfig) => void, hold = 10) =>
    simulate({
      entry,
      bars: makeBars(closes),
      firstTestIndex: 30,
      lastTestIndex: closes.length - 1,
      ...maSides(mutate),
      holdMaxSessions: hold,
    });

  it('is the reference run: the trend row buys and the holding limit sells', () => {
    const out = run(() => undefined);
    expect(out.trades.length).toBeGreaterThan(0);
    expect(out.trades[0]!.buy.evidence).toMatchObject({ status: 'ok', reason: null, result: true });
  });

  it('never buys when the Mua tab is off, and never when it has no enabled row', () => {
    const off = run((config) => (config.buy.enabled = false));
    expect(off.trades).toHaveLength(0);
    expect(off.kpis.buy_count).toBe(0);
    const noRows = run((config) => config.buy.rules.forEach((row) => (row.enabled = false)));
    expect(noRows.trades).toHaveLength(0);
    expect(noRows.pending_orders).toHaveLength(0);
  });

  it('records NO_SIGNAL evidence when the holding limit sells with the Bán tab off', () => {
    const out = run((config) => (config.sell.enabled = false));
    const sell = out.trades[0]!.sell!;
    expect(sell.reason).toBe('max_holding');
    expect(sell.indicator_met).toBe(false);
    expect(sell.evidence).toMatchObject({
      side: 'sell',
      enabled: false,
      result: null,
      status: 'no_signal',
      reason: 'side_off',
      rules: [],
    });
  });

  it('records NO_SIGNAL evidence when the Bán tab is on but no row is enabled', () => {
    const out = run((config) => config.sell.rules.forEach((row) => (row.enabled = false)));
    const sell = out.trades[0]!.sell!;
    expect(sell.reason).toBe('max_holding');
    expect(sell.evidence).toMatchObject({
      enabled: true,
      result: null,
      status: 'no_signal',
      reason: 'no_rows',
      rules: [],
    });
  });

  it('refuses a config whose model does not match the indicator, and a foreign cache', () => {
    const volume = practiceEntry('volume')!;
    const volumeSide = toSideConfig(volume, 'buy', defaultPracticeConfig(volume).buy);
    const rowsSide = toSideConfig(entry, 'buy', defaultPracticeConfig(entry).buy);
    const base = defaultsInput(entry, makeBars(closes), { firstTestIndex: 30 });
    expect(() => simulate({ ...base, buy: volumeSide })).toThrow(PracticeEngineError);
    expect(() =>
      simulate({
        ...defaultsInput(volume, makeBars(closes), { firstTestIndex: 30 }),
        sell: rowsSide,
      }),
    ).toThrow(PracticeEngineError);
    expect(() => simulate({ ...base, cache: createSeriesCache(makeBars(closes)) })).toThrow(
      /Bộ nhớ chỉ báo/,
    );
  });
});

describe('practice engine: evidence of every registry row', () => {
  const round6 = (value: number | null | undefined): number | null =>
    value === null || value === undefined || !Number.isFinite(value)
      ? null
      : Math.round(value * 1e6) / 1e6;

  it('stores sentence, own values, operands, numbers and result for all 27 rows on both tabs', () => {
    const bars = walkBars(5);
    const index = 640;
    let rows = 0;
    let withValues = 0;
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      const config = structuredClone(defaultPracticeConfig(entry) as PracticeRowsConfig);
      for (const side of SIDES) for (const row of config[side].rules) row.enabled = true;
      const cache = createSeriesCache(bars);
      for (const side of SIDES) {
        const sideConfig = toSideConfig(entry, side, config[side]);
        const evidence = evaluateSide(entry, side, sideConfig, cache, index, 7);
        const shared = evaluateIndicatorSide(id, sideConfig, cache, index);
        expect(evidence).toMatchObject({
          side,
          signal_session: 7,
          enabled: true,
          status: 'ok',
          reason: null,
          params: {},
          result: shared.result,
        });
        expect(
          evidence.rules.map((rule) => rule.rule_id),
          `${id}.${side}`,
        ).toEqual(entry.rows.map((definition) => definition.id));
        evidence.rules.forEach((rule, position) => {
          const definition = entry.rows[position]!;
          const values = { ...definition[side] };
          const label = `${id}.${side}.${definition.id}`;
          expect(rule.label, label).toBe(rowLabel(definition, values));
          expect(rule.values, label).toEqual(values);
          expect({ left: rule.left_label, right: rule.right_label }, label).toEqual(
            rowOperandLabels(definition.id, values),
          );
          expect(['compare', 'cross'], label).toContain(rule.kind);
          // a row is unknown exactly when a value it needs is missing
          expect(rule.result === null, label).toBe(rule.missing);
          // the numbers are the shared evaluator's, rounded like the rest of the payload
          const row = shared.rows[position]!;
          expect(rule.lhs, label).toBe(round6(row.lhs));
          expect(rule.rhs, label).toBe(round6(row.rhs));
          expect(rule.op, label).toBe(row.op);
          expect(rule.result, label).toBe(row.result);
          rows += 1;
          withValues += rule.lhs !== null ? 1 : 0;
        });
      }
    }
    expect(rows).toBe(54); // 27 rows x 2 tabs
    expect(withValues).toBeGreaterThan(40); // real numbers on real data, not 54 missing rows
  });

  it('carries the row numbers: RSI level compares the RSI of the row with its own threshold', () => {
    const bars = walkBars(11);
    const entry = rowsEntry('rsi');
    const config = structuredClone(defaultPracticeConfig(entry) as PracticeRowsConfig);
    Object.assign(config.buy.rules[0]!, { period: 9, op: '>', threshold: 55 });
    Object.assign(config.buy.rules[1]!, { period: 21, dir: 'down' });
    const evidence = evaluateSide(
      entry,
      'buy',
      toSideConfig(entry, 'buy', config.buy),
      createSeriesCache(bars),
      500,
      1,
    );
    const rsi9 = calc('rsi', { period: 9 }, bars).value!;
    const rsi21 = calc('rsi', { period: 21 }, bars).value!;
    expect(evidence.rules[0]).toMatchObject({
      rule_id: 'rsi.level',
      label: 'RSI 9 > 55',
      values: { period: 9, op: '>', threshold: 55 },
      lhs: round6(rsi9[500]),
      rhs: 55,
      result: rsi9[500]! > 55,
    });
    expect(evidence.rules[1]).toMatchObject({
      rule_id: 'rsi.trend',
      label: 'RSI 21 xu hướng xuống',
      lhs: round6(rsi21[500]),
      rhs: round6(rsi21[500 - 21]),
      result: rsi21[500]! < rsi21[500 - 21]!,
    });
  });
});

describe('practice engine: no look-ahead (SPEC V3 §5)', () => {
  it('gives the same result whether later bars are loaded, missing or garbage', () => {
    let trades = 0;
    for (const id of PRACTICE_INDICATOR_IDS) {
      const entry = practiceEntry(id)!;
      for (const seed of [1, 2, 3]) {
        const bars = walkBars(seed * 13 + id.length);
        for (const horizon of [360, 450, 560]) {
          const run = (source: Bar[]) =>
            simulate({ ...defaultsInput(entry, source), lastTestIndex: horizon });
          const prefix = run(bars.slice(0, horizon + 1));
          const full = run(bars);
          const poisoned = run(
            bars.map((bar, i) =>
              i > horizon ? { ...bar, open: 1, high: 1e9, low: 1, close: 5e8, volume: 9 } : bar,
            ),
          );
          expect(full, `${id}#${seed}@${horizon} loaded`).toEqual(prefix);
          expect(poisoned, `${id}#${seed}@${horizon} garbage`).toEqual(prefix);
          trades += prefix.trades.length;
        }
      }
    }
    expect(trades).toBeGreaterThan(20); // the comparison saw real trades, not empty runs
  });

  it('keeps every trade completed by T identical when the window is extended past T', () => {
    let compared = 0;
    for (const id of PRACTICE_INDICATOR_IDS) {
      const entry = practiceEntry(id)!;
      for (const seed of [1, 2, 3, 4]) {
        const bars = walkBars(seed * 31 + id.length);
        const base = defaultsInput(entry, bars);
        const short = simulate({ ...base, lastTestIndex: 450 });
        const long = simulate({ ...base, lastTestIndex: 690 });
        const firstTest = base.firstTestIndex;
        const done = short.trades.filter(
          (trade) => trade.status === 'closed' && trade.sell!.session <= 450 - firstTest + 1,
        );
        done.forEach((trade, position) => {
          expect(long.trades[position], `${id}#${seed} trade ${position + 1}`).toEqual(trade);
        });
        // sessions up to T have the same NAV path
        expect(long.nav.slice(0, short.nav.length - 1), `${id}#${seed} nav`).toEqual(
          short.nav.slice(0, short.nav.length - 1),
        );
        compared += done.length;
      }
    }
    expect(compared).toBeGreaterThan(10);
  });
});

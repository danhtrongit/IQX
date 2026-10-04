import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  AdvancedEngineError,
  SENSITIVITY_MAX_CANDIDATES,
  dataHash,
  outOfSample,
  sensitivity,
  walkForward,
} from '../../src/modules/quant/v2/advanced/index.js';
import {
  configHash,
  defaultConfig,
  runBacktest,
  type Bar,
  type IndicatorConfig,
  type Kpis,
  type OpenPosition,
  type ParamPath,
  type RunOptions,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import {
  deepFreeze,
  expectDeepClose,
  rawRegistry,
  reference,
  type ReferenceRunResult,
} from '../fixtures/bot-v2/reference.js';

/**
 * Parity with the spec reference `assets/research.js` (copied verbatim to
 * test/fixtures/bot-v2/research.reference.cjs). The reference resolves its
 * core engine through `globalThis.IQXEngine`, which engine.reference.cjs sets.
 */
type ReferenceGrid = { indicator: string; side: 'buy' | 'sell'; key: string; values: number[] };
type ReferenceSnapshot = ReferenceRunResult['snapshot'];
type ReferenceResearch = {
  sensitivity(
    config: SharedConfig,
    registry: unknown,
    bars: Bar[],
    options: Partial<RunOptions>,
    grid: ReferenceGrid,
  ): { type: string; rows: Array<{ value: number; kpis: Kpis; snapshot: ReferenceSnapshot }> };
  outsideSample(
    config: SharedConfig,
    registry: unknown,
    bars: Bar[],
    options: Partial<RunOptions>,
    splitDate: string,
  ): { type: string; splitDate: string; train: ReferenceRunResult; test: ReferenceRunResult };
  walkForward(
    config: SharedConfig,
    registry: unknown,
    bars: Bar[],
    options: Partial<RunOptions>,
    grid: ReferenceGrid,
    windows: { trainBars: number; testBars: number; minTrades: number },
  ): {
    type: string;
    policy: string;
    windows: Array<{
      train_start: string;
      train_end: string;
      test_start: string;
      test_end: string;
      status: string;
      selected?: number;
      train_return?: number;
      test_return?: number;
      test_max_drawdown?: number;
      n_trades?: number;
      open_position?: OpenPosition | null;
      test_snapshot?: ReferenceSnapshot;
    }>;
  };
};

(globalThis as { IQXEngine?: unknown }).IQXEngine = reference;
const research = createRequire(import.meta.url)(
  '../fixtures/bot-v2/research.reference.cjs',
) as ReferenceResearch;

const bars = deepFreeze(reference.syntheticBars(950));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function indicator(config: SharedConfig, id: string): IndicatorConfig {
  const item = config.indicators[id];
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

/** Research UI reference setup: MA master ON, buy period = first grid value, sell period 30. */
function maConfig(buyPeriod = 20, sellPeriod = 30): SharedConfig {
  const c = defaultConfig();
  indicator(c, 'ma').master_enabled = true;
  indicator(c, 'ma').buy.params.period = buyPeriod;
  indicator(c, 'ma').sell.params.period = sellPeriod;
  return c;
}

const path: ParamPath = { indicator: 'ma', side: 'buy', key: 'period' };
const options = (): Partial<RunOptions> => ({
  start: bars[220]?.date ?? '',
  end: bars[bars.length - 1]?.date ?? '',
  execution: 'next_open',
});
const comparable = (r: { [k: string]: unknown }) => ({
  snapshot: r.snapshot,
  initial: r.initial,
  curve: r.curve,
  trades: r.trades,
  open_position: r.open_position,
  cash: r.cash,
  canceled: r.canceled,
  kpis: r.kpis,
});

describe('quant v2 advanced — sensitivity', () => {
  it('matches the reference sweep KPIs and snapshots for every value', () => {
    const config = deepFreeze(maConfig(10));
    const values = [10, 20, 30, 50];
    const ours = sensitivity(config, bars, options(), { path, values });
    const ref = research.sensitivity(clone(config), rawRegistry, clone(bars), options(), {
      indicator: 'ma',
      side: 'buy',
      key: 'period',
      values,
    });
    expect(ours.type).toBe('sensitivity');
    expect(ours.policy).toBe('whole_region_no_best_pick');
    expect(ours.candidates).toHaveLength(values.length);
    ours.candidates.forEach((candidate, i) => {
      const row = ref.rows[i];
      expect(candidate.ok).toBe(true);
      expect(candidate.error).toBeNull();
      expect(candidate.index).toBe(i);
      expect(candidate.value).toBe(row?.value);
      expectDeepClose(candidate.kpis, row?.kpis, `kpis[${i}]`);
      expect(candidate.n_trades).toBe(row?.kpis.n_trades);
      expect(candidate.actual_start).toBe(row?.snapshot.actual_start);
      expect(candidate.actual_end).toBe(row?.snapshot.actual_end);
      expect(candidate.data_hash).toBe(dataHash(bars));
    });
    // Each candidate hash is the hash of the base config with only that value replaced.
    const expected = maConfig(10);
    indicator(expected, 'ma').buy.params.period = 30;
    expect(ours.candidates[2]?.config_hash).toBe(configHash(expected));
    expect(ours.base_config_hash).toBe(configHash(maConfig(10)));
    // The KPIs equal an ordinary single run of the candidate.
    const single = runBacktest(expected, bars, options());
    expect(ours.candidates[2]?.kpis).toEqual(single.kpis);
  });

  it('reports invalid candidates (type, domain, step, cross-field) without aborting the sweep', () => {
    const config = deepFreeze(maConfig());
    // MA period: integer 5..200 step 1 → 4 (domain), 20.5 (type/step) and 201 are rejected.
    const out = sensitivity(config, bars, options(), { path, values: [4, 20.5, 201, 25] });
    expect(out.candidates.map((c) => c.ok)).toEqual([false, false, false, true]);
    for (const c of out.candidates.slice(0, 3)) {
      expect(c.kpis).toBeNull();
      expect(c.n_trades).toBeNull();
      expect(typeof c.error).toBe('string');
      expect(c.errors.length).toBeGreaterThan(0);
      expect(c.config_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(out.candidates[3]?.n_trades).toBeGreaterThanOrEqual(0);

    // ma_cross requires fast < slow: sweeping fast past slow is rejected per candidate.
    const cross = defaultConfig();
    indicator(cross, 'ma_cross').master_enabled = true;
    const slow = indicator(cross, 'ma_cross').buy.params.slow ?? 0;
    const crossOut = sensitivity(cross, bars, options(), {
      path: { indicator: 'ma_cross', side: 'buy', key: 'fast' },
      values: [5, slow],
    });
    expect(crossOut.candidates.map((c) => c.ok)).toEqual([true, false]);
  });

  it('never mutates the base revision and rejects bad grids/paths', () => {
    const config = deepFreeze(maConfig());
    const before = JSON.stringify(config);
    sensitivity(config, bars, options(), { path, values: [10, 40] });
    expect(JSON.stringify(config)).toBe(before);

    const tooMany = Array.from({ length: SENSITIVITY_MAX_CANDIDATES + 1 }, (_, i) => 5 + i);
    expect(() => sensitivity(config, bars, options(), { path, values: tooMany })).toThrow(
      AdvancedEngineError,
    );
    expect(() => sensitivity(config, bars, options(), { path, values: [] })).toThrow(
      /Lưới cần 1–100 giá trị/,
    );
    expect(() =>
      sensitivity(config, bars, options(), {
        path: { indicator: 'ma', side: 'buy', key: 'nope' },
        values: [10],
      }),
    ).toThrow(/Đường tham số không hợp lệ/);
    expect(() =>
      sensitivity(config, bars, options(), {
        path: { indicator: 'unknown', side: 'buy', key: 'period' },
        values: [10],
      }),
    ).toThrow(AdvancedEngineError);
  });
});

describe('quant v2 advanced — out of sample', () => {
  it('matches the reference two fixed-config reports exactly', () => {
    const config = deepFreeze(maConfig(20));
    const split = bars[650]?.date ?? '';
    const ours = outOfSample(config, bars, options(), { split_date: split });
    const ref = research.outsideSample(clone(config), rawRegistry, clone(bars), options(), split);
    expect(ours.type).toBe(ref.type);
    expectDeepClose(comparable(ours.train), comparable(ref.train), 'train');
    expectDeepClose(comparable(ours.test), comparable(ref.test), 'test');
  });

  it('keeps segments non-overlapping, trades inside their segment, and records the attempt', () => {
    const config = deepFreeze(maConfig(20));
    const split = bars[650]?.date ?? '';
    const out = outOfSample(config, bars, options(), { split_date: split });
    expect(out.train.snapshot.actual_end < split).toBe(true);
    expect(out.train.snapshot.actual_end).toBe(bars[649]?.date);
    expect(out.test.snapshot.actual_start).toBe(split);
    for (const t of out.test.trades) expect(t.entry_date >= split).toBe(true);
    for (const t of out.train.trades) expect(t.exit_date < split).toBe(true);
    expect(out.test.curve[0]?.date).toBe(split);
    expect(out.attempt).toMatchObject({
      kind: 'out_of_sample',
      split_date: split,
      selection: 'fixed_config',
      config_hash: configHash(maConfig(20)),
      data_hash: dataHash(bars),
      train: { start: bars[220]?.date, end: bars[649]?.date },
      test: { start: split, end: bars[949]?.date },
    });
    // Both reports use the same frozen config.
    expect(out.train.snapshot.config).toEqual(out.test.snapshot.config);
  });

  it('rejects a split outside the range', () => {
    const config = maConfig();
    expect(() =>
      outOfSample(config, bars, options(), { split_date: bars[220]?.date ?? '' }),
    ).toThrow(/Mốc chia phải ở trong kỳ/);
    expect(() => outOfSample(config, bars, options(), { split_date: '2099-01-01' })).toThrow(
      AdvancedEngineError,
    );
    expect(() => outOfSample(config, bars, options(), { split_date: 'x' })).toThrow(
      AdvancedEngineError,
    );
  });
});

describe('quant v2 advanced — walk forward', () => {
  const values = [10, 20, 30, 50];
  const spec = {
    path,
    values,
    train_bars: 250,
    test_bars: 100,
    step_bars: 100,
    criterion: 'net_return' as const,
    min_trades: 1,
  };

  it('matches the reference windows (selection, test run, open position, snapshot)', () => {
    const config = deepFreeze(maConfig(10));
    const ours = walkForward(config, bars, options(), spec);
    const ref = research.walkForward(
      clone(config),
      rawRegistry,
      clone(bars),
      options(),
      { indicator: 'ma', side: 'buy', key: 'period', values },
      { trainBars: 250, testBars: 100, minTrades: 1 },
    );
    expect(ours.policy).toBe(ref.policy);
    expect(ours.windows.length).toBe(ref.windows.length);
    expect(ours.windows.length).toBeGreaterThan(1);
    ours.windows.forEach((w, i) => {
      const r = ref.windows[i];
      if (!r) throw new Error('missing reference window');
      expect([w.train_start, w.train_end, w.test_start, w.test_end]).toEqual([
        r.train_start,
        r.train_end,
        r.test_start,
        r.test_end,
      ]);
      expect(w.status).toBe(r.status);
      if (r.status !== 'tested') return;
      expect(w.selected).toBe(r.selected);
      expectDeepClose(
        {
          train_return: w.train_return,
          test_return: w.test_return,
          test_max_drawdown: w.test_max_drawdown,
          n_trades: w.n_trades,
          open_position: w.open_position,
          test_snapshot: w.test_snapshot,
        },
        {
          train_return: r.train_return,
          test_return: r.test_return,
          test_max_drawdown: r.test_max_drawdown,
          n_trades: r.n_trades,
          open_position: r.open_position,
          test_snapshot: r.test_snapshot,
        },
        `window[${i}]`,
      );
    });
  });

  it('selects only from the train window: later bars cannot change earlier windows', () => {
    const config = maConfig(10);
    const full = walkForward(config, bars, options(), spec);
    // Distort everything after the first test window; window 0 must not move.
    const firstTestEnd = full.windows[0]?.test_end ?? '';
    const distorted = bars.map((b) =>
      b.date > firstTestEnd
        ? { ...b, open: b.open * 3, high: b.high * 3, low: b.low * 3, close: b.close * 3 }
        : { ...b },
    );
    const again = walkForward(config, distorted, options(), spec);
    const strip = (w: (typeof full.windows)[number] | undefined) => ({ ...w, test_snapshot: null });
    expect(strip(again.windows[0])).toEqual(strip(full.windows[0]));
    // Train candidates are evaluated on bars ending at the train window.
    for (const w of full.windows) expect(w.train_end < w.test_start).toBe(true);
  });

  it('breaks criterion ties by the lowest candidate index and honours min_trades', () => {
    const config = maConfig(10);
    // Identical values → identical KPIs → the first index wins.
    const tie = walkForward(config, bars, options(), { ...spec, values: [20, 20, 20] });
    for (const w of tie.windows) if (w.status === 'tested') expect(w.selected_index).toBe(0);
    // Impossible min_trades → no eligible candidate, no test run.
    const none = walkForward(config, bars, options(), { ...spec, min_trades: 10_000 });
    for (const w of none.windows) {
      expect(w.status).toBe('no_eligible_candidate');
      expect(w.test_return).toBeNull();
      expect(w.train_candidates.every((c) => !c.eligible)).toBe(true);
    }
  });

  it('supports step ≥ test windows, other criteria and never aggregates windows', () => {
    const config = maConfig(10);
    const out = walkForward(config, bars, options(), {
      ...spec,
      step_bars: 150,
      criterion: 'max_drawdown',
    });
    for (let i = 1; i < out.windows.length; i++) {
      expect((out.windows[i]?.test_start ?? '') > (out.windows[i - 1]?.test_end ?? '')).toBe(true);
    }
    expect(out).not.toHaveProperty('aggregate_return');
    expect(out.policy).toContain('no_aggregate_portfolio_return');
    for (const w of out.windows) {
      if (w.status !== 'tested') continue;
      const best = Math.max(
        ...w.train_candidates.filter((c) => c.eligible).map((c) => c.criterion_value ?? -Infinity),
      );
      expect(w.train_criterion).toBe(best);
      // Independently funded: each test curve starts from the full capital.
      expect(w.test_snapshot?.options.capital).toBe(100_000_000);
    }
  });

  it('rejects an invalid specification', () => {
    const config = maConfig(10);
    expect(() => walkForward(config, bars, options(), { ...spec, step_bars: 50 })).toThrow(
      AdvancedEngineError,
    );
    expect(() =>
      walkForward(config, bars, options(), { ...spec, criterion: 'sharpe' as never }),
    ).toThrow(/Tiêu chí chọn không hợp lệ/);
    expect(() => walkForward(config, bars, options(), { ...spec, train_bars: 900 })).toThrow(
      /Chưa đủ dữ liệu/,
    );
  });
});

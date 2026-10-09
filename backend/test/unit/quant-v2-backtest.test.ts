import { describe, expect, it } from 'vitest';
import {
  CALCULATION_VERSION,
  CLEAN_TECH_2_0,
  ENGINE_VERSION,
  EngineRunError,
  FORMULA_VERSION,
  RULE_VERSION,
  defaultConfig,
  loadTechnicalRegistry,
  runBacktest,
  type Bar,
  type IndicatorConfig,
  type RunOptions,
  type RunResult,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import {
  deepFreeze,
  expectDeepClose,
  rawRegistry,
  reference,
  type ReferenceRunResult,
} from '../fixtures/bot-v2/reference.js';

const registry = loadTechnicalRegistry();
const bars = deepFreeze(reference.syntheticBars(950));
const near = (a: number, b: number, tol = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function indicator(config: SharedConfig, id: string): IndicatorConfig {
  const item = config.indicators[id];
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

/** Registry defaults are OFF on both sides; the test turns the listed indicators fully on. */
function configWith(ids: string[], mutate?: (c: SharedConfig) => void): SharedConfig {
  const c = defaultConfig();
  for (const id of ids) {
    const item = indicator(c, id);
    item.master_enabled = true;
    item.buy.enabled = true;
    item.sell.enabled = true;
  }
  mutate?.(c);
  return c;
}

/** Reference test helper `ma()`: MA master ON, sell period 30. */
const maConfig = (): SharedConfig =>
  configWith(['ma'], (c) => (indicator(c, 'ma').sell.params.period = 30));

const comparable = (r: RunResult | ReferenceRunResult) => ({
  snapshot: r.snapshot,
  initial: r.initial,
  curve: r.curve,
  trades: r.trades,
  open_position: r.open_position,
  cash: r.cash,
  canceled: r.canceled,
  kpis: r.kpis,
});

function expectParity(
  config: SharedConfig,
  data: readonly Bar[],
  options: Partial<RunOptions> = {},
  label = 'run',
) {
  const frozenConfig = deepFreeze(clone(config));
  const ours = runBacktest(frozenConfig, data, options);
  const theirs = reference.run(clone(config), rawRegistry, [...data], { ...options });
  expectDeepClose(comparable(ours), comparable(theirs), label);
  return ours;
}

const bar = (close: number, i: number, extra: Partial<Bar> = {}): Bar => ({
  date: `2020-01-${String(i + 1).padStart(2, '0')}`,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
  ...extra,
});

describe('quant v2 runBacktest — golden parity with reference run', () => {
  it('comparator detects real differences', () => {
    expect(() => expectDeepClose({ a: [1, null] }, { a: [1, 0] })).toThrow();
    expect(() => expectDeepClose({ a: 1 + 1e-6 }, { a: 1 })).toThrow();
    expect(() => expectDeepClose({ a: 1, b: 2 }, { a: 1 })).toThrow();
  });

  it('default config (no buy) is rejected by both engines with the same message', () => {
    expect(() => runBacktest(defaultConfig(), bars)).toThrow('Cần ít nhất một điều kiện Mua.');
    expect(() => reference.run(defaultConfig(), rawRegistry, [...bars])).toThrow(
      'Cần ít nhất một điều kiện Mua.',
    );
    try {
      runBacktest(defaultConfig(), bars);
    } catch (error) {
      expect(error).toBeInstanceOf(EngineRunError);
      expect((error as EngineRunError).code).toBe('BUY_RULES_REQUIRED');
    }
  });

  for (const execution of ['next_open', 'same_close'] as const) {
    it(`every single-indicator default config matches (${execution})`, () => {
      let withTrades = 0;
      for (const entry of registry) {
        const result = expectParity(
          configWith([entry.id]),
          bars,
          { execution },
          `${entry.id}.${execution}`,
        );
        if (result.trades.length) withTrades++;
      }
      expect(withTrades).toBeGreaterThan(12);
    });
  }

  it('multi-indicator AND configs match', () => {
    const combos = [
      ['ma', 'rsi'],
      ['macd', 'volume', 'dmi'],
      ['ema', 'obv'],
      ['donchian', 'roc', 'bollinger'],
      ['stochastic', 'cci', 'williams_r'],
      ['ma_cross', 'mfi', 'cmf'],
    ];
    for (const ids of combos) {
      for (const execution of ['next_open', 'same_close'] as const) {
        expectParity(configWith(ids), bars, { execution }, `${ids.join('+')}.${execution}`);
      }
    }
  });

  it('non-default params, edited operators and buy-only/sell-only sides match', () => {
    const configs: SharedConfig[] = [
      maConfig(),
      configWith(['rsi'], (c) => {
        const rsi = indicator(c, 'rsi');
        rsi.buy.params.level = 45;
        rsi.sell.params.level = 55;
        rsi.buy.rules[1]!.op = '<';
      }),
      configWith(['bollinger', 'ma'], (c) => {
        indicator(c, 'bollinger').sell.enabled = false;
        indicator(c, 'ma').buy.enabled = false;
        indicator(c, 'bollinger').buy.rules[1]!.op = '∉';
      }),
      configWith(['macd'], (c) => {
        const macd = indicator(c, 'macd');
        macd.buy.params = { fast: 5, slow: 35, signal: 5 };
        macd.sell.params = { fast: 8, slow: 21, signal: 3 };
      }),
    ];
    configs.forEach((c, i) => {
      expectParity(c, bars, {}, `config ${i} next_open`);
      expectParity(c, bars, { execution: 'same_close' }, `config ${i} same_close`);
    });
  });

  it('fee none, custom capital/lot/min_held and short ranges match', () => {
    const c = maConfig();
    const optionSets: Array<Partial<RunOptions>> = [
      { fee_buy: 0, fee_sell: 0 },
      { fee_buy: 0, fee_sell: 0, execution: 'same_close' },
      { capital: 50_000_000, lot: 10 },
      { min_held_bars: 0, execution: 'same_close' },
      { min_held_bars: 7 },
      { start: bars[220]!.date, end: bars[949]!.date },
      { start: bars[500]!.date, end: bars[540]!.date },
      { start: bars[100]!.date, end: bars[100]!.date },
      { start: bars[948]!.date },
      { end: bars[30]!.date, execution: 'same_close' },
      { start: '2000-01-01', end: '2100-01-01' },
    ];
    optionSets.forEach((options, i) => expectParity(c, bars, options, `options ${i}`));
  });

  it('edge cases: no sell, same-bar gates, not enough cash, pending at end', () => {
    expectParity(
      configWith(['ma'], (c) => (indicator(c, 'ma').sell.enabled = false)),
      bars,
      {},
      'no sell',
    );
    const sameGate = configWith(['ma'], (c) => {
      const ma = indicator(c, 'ma');
      ma.sell = clone(ma.buy);
    });
    expectParity(sameGate, bars, { execution: 'same_close' }, 'buy+sell same bar same_close');
    expectParity(sameGate, bars, { execution: 'next_open' }, 'buy+sell same bar next_open');
    const poor = expectParity(maConfig(), bars, { capital: 1_000_000 }, 'not enough cash');
    expect(poor.trades).toEqual([]);
    expect(poor.open_position).toBeNull();
    const small = Array.from({ length: 10 }, (_, i) => bar(100 + i, i));
    const pendingConfig = configWith(['ma'], (c) => (indicator(c, 'ma').buy.params.period = 5));
    const last = small[small.length - 1]!.date;
    const pending = expectParity(
      pendingConfig,
      small,
      { start: last, end: last },
      'pending at end',
    );
    expect(pending.canceled).toEqual([{ reason: 'end_of_range', action: 'buy', signalIndex: 9 }]);
  });

  it('bars without market context produce null market benchmark in both engines', () => {
    const plain = bars.map(({ date, open, high, low, close, volume }) => ({
      date,
      open,
      high,
      low,
      close,
      volume,
    }));
    const result = expectParity(maConfig(), plain, {}, 'no market');
    expect(result.initial.market_pct).toBeNull();
    expect(result.kpis.market_return).toBeNull();
  });
});

describe('quant v2 runBacktest — reference behaviour (04-TESTS/test_engine.js)', () => {
  it('snapshot and chart-KPI parity; deterministic full history; versions and profile', () => {
    const c = maConfig();
    const options = { start: bars[220]!.date, end: bars[949]!.date };
    const x = runBacktest(c, bars, options);
    expect(x.trades.length).toBeGreaterThan(12);
    expect(x.kpis.n_trades).toBe(x.trades.length);
    expect(x.curve).toHaveLength(730);
    near(x.curve[x.curve.length - 1]!.return_pct, x.kpis.net_return);
    near(x.curve[x.curve.length - 1]!.buy_hold_pct, x.kpis.buy_hold_return);
    expect(x.initial).toMatchObject({
      return_pct: 0,
      buy_hold_pct: 0,
      value: 100_000_000,
      phase: 'before_first_execution',
    });
    indicator(c, 'ma').buy.params.period = 50;
    expect(indicator(x.snapshot.config, 'ma').buy.params.period).toBe(20);
    expect(runBacktest(maConfig(), bars, options)).toEqual(x);
    expect(x).toMatchObject({
      schema_version: '2.0',
      engine_version: ENGINE_VERSION,
      calculation_version: CALCULATION_VERSION,
      rule_version: RULE_VERSION,
      formula_version: FORMULA_VERSION,
      profile: CLEAN_TECH_2_0,
    });
    expect(x.snapshot.options).toEqual({
      capital: 100_000_000,
      fee_buy: 0.0015,
      fee_sell: 0.0025,
      lot: 100,
      execution: 'next_open',
      min_held_bars: 2,
      ...options,
    });
    for (const value of Object.values(x.kpis))
      expect(value === null || Number.isFinite(value)).toBe(true);
  });

  it('no sell signals means no forced exit or 60-bar sell', () => {
    const x = runBacktest(
      configWith(['ma'], (c) => (indicator(c, 'ma').sell.enabled = false)),
      bars,
    );
    expect(x.trades).toHaveLength(0);
    expect(x.open_position).not.toBeNull();
    expect(x.kpis.win_rate).toBeNull();
    expect(x.kpis.profit_factor).toBeNull();
    expect(bars.length - x.open_position!.index).toBeGreaterThan(60);
    expect(x.kpis.net_return).not.toBe(0);
  });

  it('both gates true uses position state; no same-bar re-entry; hold ≥ min_held_bars', () => {
    const c = configWith(['ma'], (cfg) => {
      const ma = indicator(cfg, 'ma');
      ma.sell = clone(ma.buy);
    });
    const x = runBacktest(c, bars, { execution: 'same_close' });
    expect(x.trades.length).toBeGreaterThan(0);
    for (let i = 1; i < x.trades.length; i++)
      expect(x.trades[i]!.entry_date > x.trades[i - 1]!.exit_date).toBe(true);
    for (const t of x.trades) expect(t.hold).toBeGreaterThanOrEqual(2);
  });

  it('rejects empty buy, invalid data, invalid options, empty range and invalid config', () => {
    const c = configWith(['ma'], (cfg) => (indicator(cfg, 'ma').buy.params.period = 5));
    const small = Array.from({ length: 10 }, (_, i) => bar(100 + i, i));
    const code = (fn: () => unknown): string | undefined => {
      try {
        fn();
      } catch (error) {
        return error instanceof EngineRunError ? error.code : 'OTHER';
      }
      return undefined;
    };
    expect(code(() => runBacktest(c, [small[1]!, small[0]!]))).toBe('INVALID_BARS');
    expect(code(() => runBacktest(c, [small[0]!, small[0]!]))).toBe('INVALID_BARS');
    expect(code(() => runBacktest(c, []))).toBe('INVALID_BARS');
    expect(code(() => runBacktest(c, [{ ...small[0]!, low: 0 }]))).toBe('INVALID_BARS');
    expect(code(() => runBacktest(c, small, { start: '2030-01-01' }))).toBe('EMPTY_RANGE');
    expect(code(() => runBacktest(c, small, { lot: 0 }))).toBe('INVALID_OPTIONS');
    expect(code(() => runBacktest(c, small, { fee_sell: 1 }))).toBe('INVALID_OPTIONS');
    expect(code(() => runBacktest(c, small, { capital: -1 }))).toBe('INVALID_OPTIONS');
    expect(code(() => runBacktest(c, small, { min_held_bars: 1.5 }))).toBe('INVALID_OPTIONS');
    expect(
      code(() => runBacktest(c, small, { execution: 'close' as RunOptions['execution'] })),
    ).toBe('INVALID_OPTIONS');
    const invalid = clone(c);
    indicator(invalid, 'ma').buy.params.period = 1;
    expect(code(() => runBacktest(invalid, small))).toBe('CONFIG_INVALID');
    expect(() => reference.run(clone(c), rawRegistry, [small[1]!, small[0]!])).toThrow();
  });

  it('buy & hold uses the last close of the range, not the maximum', () => {
    const x = runBacktest(maConfig(), bars);
    near(x.kpis.buy_hold_return, (bars[bars.length - 1]!.close / bars[0]!.close - 1) * 100);
  });

  it('never mutates its inputs (deep-frozen config, bars and options)', () => {
    const options = deepFreeze({ execution: 'same_close' as const, fee_buy: 0 });
    expect(() => runBacktest(deepFreeze(maConfig()), bars, options)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  configHash,
  defaultConfig,
  indicatorCapability,
  loadLegacyTechnicalRegistry,
  loadTechnicalRegistry,
  sha256Hex,
  validateConfig,
  type ConditionRow,
  type IndicatorConfig,
  type ParamsSideConfig,
  type RowSideConfig,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import { deepFreeze, rawRegistry, reference } from '../fixtures/bot-v2/reference.js';

const registry = loadTechnicalRegistry();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Same JSON value with every object's keys in reverse insertion order. */
function reverseKeys<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const record = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .reverse()
          .map((k) => [k, walk(record[k])]),
      );
    }
    return v;
  };
  return walk(value) as T;
}

function indicator(config: SharedConfig, id: string): IndicatorConfig {
  const item = config.indicators[id];
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

/** Row `index` of one tab of a row-based indicator. */
const rowOf = (c: SharedConfig, id: string, side: 'buy' | 'sell', index = 0): ConditionRow =>
  (indicator(c, id)[side] as RowSideConfig).rules[index]!;

/** Volume tab (params + rule templates, unchanged by SPEC V3). */
const volumeSide = (c: SharedConfig, side: 'buy' | 'sell'): ParamsSideConfig =>
  indicator(c, 'volume')[side] as ParamsSideConfig;

/** Reference test helper `ma()`: MA master ON with both sides ON, sell period 50. */
function maConfig(): SharedConfig {
  const c = defaultConfig();
  const ma = indicator(c, 'ma');
  ma.master_enabled = true;
  ma.buy.enabled = true;
  ma.sell.enabled = true;
  rowOf(c, 'ma', 'sell').period = 50;
  return c;
}

const paths = (config: unknown, grants?: string[] | ReadonlySet<string>) =>
  validateConfig(config, registry, grants).map((e) => e.path);

describe('quant v2 defaultConfig', () => {
  it('is the SPEC V3 default document (schema 3.0, iqx-rules-4.0, 16 indicators)', () => {
    const c = defaultConfig();
    expect(Object.keys(c.indicators)).toHaveLength(16);
    expect(c).toMatchObject({ schema_version: '3.0', revision: 1, rule_version: 'iqx-rules-4.0' });
    // Volume keeps the reference default (params + rule templates).
    const reference16 = reference.defaultConfig(rawRegistry.filter((e) => e.id === 'volume'));
    expect(c.indicators.volume).toEqual(reference16.indicators.volume);
  });

  it('is valid, master and both sides OFF everywhere, and independent copies of the registry', () => {
    const c = defaultConfig();
    expect(validateConfig(c)).toEqual([]);
    expect(Object.values(c.indicators).every((x) => !x.master_enabled)).toBe(true);
    expect(Object.values(c.indicators).every((x) => !x.buy.enabled && !x.sell.enabled)).toBe(true);
    rowOf(c, 'rsi', 'buy').period = 50;
    volumeSide(c, 'buy').params.lookback = 50;
    const rsiEntry = registry.find((r) => r.id === 'rsi');
    expect(rsiEntry?.model === 'rows' && rsiEntry.rows[0]!.buy.period).toBe(14);
    expect(rowOf(defaultConfig(), 'rsi', 'buy').period).toBe(14);
    expect(volumeSide(defaultConfig(), 'buy').params.lookback).toBe(20);
  });
});

describe('quant v2 validateConfig', () => {
  it('validates row values, ops and grants', () => {
    let c = maConfig();
    expect(validateConfig(c)).toEqual([]);
    expect(validateConfig(c, registry, []).length).toBeGreaterThan(0);
    rowOf(c, 'ma', 'buy').period = 12.5;
    expect(validateConfig(c).length).toBeGreaterThan(0);
    c = maConfig();
    rowOf(c, 'ma', 'buy').op = 'evil';
    expect(paths(c)).toEqual(['indicators.ma.buy.rules.0.op']);
    c = defaultConfig();
    rowOf(c, 'rsi', 'sell').threshold = 101;
    expect(paths(c)).toEqual(['indicators.rsi.sell.rules.0.threshold']);
  });

  it('Volume accepts and rejects exactly like the reference on shared cases', () => {
    const volumeRegistry = rawRegistry.filter((e) => e.id === 'volume');
    const cases: Array<(c: SharedConfig) => void> = [
      () => undefined,
      (c) => (volumeSide(c, 'buy').params.lookback = 4),
      (c) => (volumeSide(c, 'buy').params.mult = 2.05),
      (c) => (volumeSide(c, 'buy').params.mult = 2.3),
      (c) => (volumeSide(c, 'sell').rules[0]!.op = '<'),
      (c) => ((volumeSide(c, 'sell').rules[0] as { op: string }).op = '∈'),
      (c) => volumeSide(c, 'buy').rules.pop(),
      (c) => (volumeSide(c, 'buy').params.extra = 1),
      (c) => delete volumeSide(c, 'sell').params.mult,
      (c) => {
        const item = indicator(c, 'volume');
        item.master_enabled = true;
        item.buy.enabled = false;
        item.sell.enabled = false;
      },
    ];
    for (const [i, mutate] of cases.entries()) {
      const c = defaultConfig();
      mutate(c);
      const ours = validateConfig(c).length === 0;
      const volumeOnly = { ...c, indicators: { volume: c.indicators.volume! } };
      const theirs = reference.validateConfig(volumeOnly, volumeRegistry).length === 0;
      expect(ours, `case ${i}`).toBe(theirs);
    }
  });

  it('checks schema/rule versions, revision and unknown top-level keys', () => {
    const c = clone(defaultConfig()) as unknown as Record<string, unknown>;
    c.schema_version = '1.0';
    c.rule_version = 'iqx-rules-1.0';
    c.revision = 0;
    c.owner_id = 'x';
    c.saved_at = 'not a date';
    expect(paths(c).sort()).toEqual([
      'owner_id',
      'revision',
      'rule_version',
      'saved_at',
      'schema_version',
    ]);
    expect(validateConfig(null)).toEqual([{ path: '', message: 'Thiếu cấu hình.' }]);
    expect(paths({ ...defaultConfig(), indicators: [] })).toEqual(['indicators']);
    expect(validateConfig({ ...defaultConfig(), saved_at: '2026-01-02T03:04:05Z' })).toEqual([]);
    expect(paths({ ...defaultConfig(), rule_version: 'iqx-rules-3.0' })).toEqual(['rule_version']);
    expect(paths({ ...defaultConfig(), schema_version: '2.0' })).toEqual(['schema_version']);
  });

  it('requires exactly the 16 current indicators: a historical 35-indicator config is not valid', () => {
    const c = clone(defaultConfig()) as Omit<SharedConfig, 'rule_version'> & {
      rule_version: string;
    };
    for (const entry of loadLegacyTechnicalRegistry()) {
      c.indicators[entry.id] = {
        master_enabled: false,
        buy: { enabled: false, params: entry.buy.params, rules: entry.buy.rules },
        sell: { enabled: false, params: entry.sell.params, rules: entry.sell.rules },
      };
    }
    c.rule_version = 'iqx-rules-2.0';
    const errorPaths = paths(c);
    expect(errorPaths).toContain('rule_version');
    expect(errorPaths.filter((p) => p.startsWith('indicators.'))).toHaveLength(19);
    // Removed indicators are not valid as current even when OFF, with or without grants.
    expect(
      validateConfig(c, registry, ['indicator:adx']).some((e) => e.path === 'indicators.adx'),
    ).toBe(true);
  });

  it('rejects a V2 (iqx-rules-3.0) indicator shape: side params and template rules', () => {
    const c = clone(defaultConfig());
    (c.indicators as Record<string, unknown>).rsi = {
      master_enabled: false,
      buy: { enabled: false, params: { period: 14, level: 30 }, rules: [{ id: 'r1', op: '<' }, { id: 'r2', op: '>' }] },
      sell: { enabled: false, params: { period: 14, level: 70 }, rules: [{ id: 'r1', op: '>' }, { id: 'r2', op: '<' }] },
    };
    const errorPaths = paths(c);
    expect(errorPaths).toContain('indicators.rsi.buy.params');
    expect(errorPaths).toContain('indicators.rsi.sell.params');
    expect(errorPaths).toContain('indicators.rsi.buy.rules.0.id');
  });

  it('rejects unknown and missing indicators and unknown nested keys', () => {
    const c = defaultConfig();
    const rsi = indicator(c, 'rsi');
    c.indicators.supertrend = clone(rsi);
    delete c.indicators.cci;
    expect(paths(c).sort()).toEqual(['indicators.cci', 'indicators.supertrend']);
    const nested = clone(defaultConfig()) as unknown as {
      indicators: Record<string, Record<string, unknown> & { buy: Record<string, unknown> }>;
    };
    const ma = nested.indicators.ma;
    if (!ma) throw new Error('ma');
    ma.priority = 1;
    ma.buy.weight = 2;
    expect(paths(nested).sort()).toEqual(['indicators.ma.buy.weight', 'indicators.ma.priority']);
  });

  it('enforces row type, range, presets, step and fast < slow; Volume params keep their checks', () => {
    const cases: Array<[string, (c: SharedConfig) => void]> = [
      ['indicators.ma.buy.rules.0.period', (c) => (rowOf(c, 'ma', 'buy').period = 4)],
      ['indicators.ma.buy.rules.0.period', (c) => (rowOf(c, 'ma', 'buy').period = 30)],
      ['indicators.ma.buy.rules.0.period', (c) => (rowOf(c, 'ma', 'buy').period = Number.NaN)],
      ['indicators.ma.buy.rules.0.period', (c) => delete rowOf(c, 'ma', 'buy').period],
      ['indicators.ma.buy.rules.0.foo', (c) => (rowOf(c, 'ma', 'buy').foo = 1)],
      ['indicators.bollinger.sell.rules.0.mult', (c) => (rowOf(c, 'bollinger', 'sell').mult = 2.05)],
      ['indicators.roc.buy.rules.0.threshold', (c) => (rowOf(c, 'roc', 'buy').threshold = 5.55)],
      ['indicators.macd.buy.rules.0.fast', (c) => (rowOf(c, 'macd', 'buy').fast = 26)],
      ['indicators.macd.buy.rules.2.fast', (c) => (rowOf(c, 'macd', 'buy', 2).fast = 30)],
      ['indicators.ma_cross.sell.rules.0.fast', (c) => (rowOf(c, 'ma_cross', 'sell').fast = 100)],
      ['indicators.volume.buy.params.lookback', (c) => (volumeSide(c, 'buy').params.lookback = 4)],
      ['indicators.volume.sell.params.mult', (c) => (volumeSide(c, 'sell').params.mult = 1.05)],
    ];
    for (const [path, mutate] of cases) {
      const c = defaultConfig();
      mutate(c);
      expect(paths(c), path).toEqual([path]);
    }
    // Float steps are accepted within tolerance (0.1 + 0.2 style noise).
    const ok = defaultConfig();
    rowOf(ok, 'bollinger', 'buy').mult = 0.1 + 0.2 + 2;
    rowOf(ok, 'roc', 'buy').threshold = 0.1 + 0.2 + 5;
    rowOf(ok, 'cmf', 'buy').threshold = -0.37;
    rowOf(ok, 'cmf', 'sell').threshold = -0.05;
    volumeSide(ok, 'buy').params.mult = 0.1 + 0.2 + 1;
    expect(validateConfig(ok)).toEqual([]);
  });

  it('allows row values, ops and switches within their domains; row ids and count are frozen', () => {
    const allowed = defaultConfig();
    rowOf(allowed, 'macd', 'buy').op = '>';
    rowOf(allowed, 'ma', 'buy', 1).enabled = true;
    rowOf(allowed, 'bollinger', 'sell').action = 'break_upper';
    rowOf(allowed, 'donchian', 'buy').band = 'lower';
    rowOf(allowed, 'rsi', 'buy', 1).period = 9;
    expect(validateConfig(allowed)).toEqual([]);
    const reordered = defaultConfig();
    (indicator(reordered, 'ma').buy as RowSideConfig).rules[0] = reverseKeys(rowOf(reordered, 'ma', 'buy'));
    expect(validateConfig(reordered)).toEqual([]);
    const cases: Array<[string, (c: SharedConfig) => void]> = [
      ['indicators.cci.buy.rules.0.op', (c) => (rowOf(c, 'cci', 'buy').op = '>')],
      ['indicators.rsi.buy.rules.0.op', (c) => (rowOf(c, 'rsi', 'buy').op = 'cross_up')],
      ['indicators.ma.buy.rules.0.id', (c) => (rowOf(c, 'ma', 'buy').id = 'ma.trend')],
      [
        'indicators.ma.buy.rules',
        (c) => (indicator(c, 'ma').buy as RowSideConfig).rules.push(clone(rowOf(c, 'ma', 'buy'))),
      ],
      ['indicators.ma.buy.rules', (c) => ((indicator(c, 'ma').buy as { rules: unknown }).rules = {})],
      ['indicators.volume.buy.rules.0', (c) => (volumeSide(c, 'buy').rules[0]!.rhs = { kind: 'constant', value: 1 })],
      ['indicators.volume.buy.rules.0.op', (c) => ((volumeSide(c, 'buy').rules[0] as { op: string }).op = '>=')],
    ];
    for (const [path, mutate] of cases) {
      const c = defaultConfig();
      mutate(c);
      expect(paths(c), path).toContain(path);
    }
  });

  it('master ON needs a side and, with grants, the learned capability', () => {
    const c = defaultConfig();
    const ema = indicator(c, 'ema');
    ema.master_enabled = true;
    ema.buy.enabled = false;
    ema.sell.enabled = false;
    expect(paths(c)).toEqual(['indicators.ema.master_enabled']);
    ema.sell.enabled = true;
    expect(validateConfig(c)).toEqual([]);
    expect(paths(c, [])).toEqual(['indicators.ema.master_enabled']);
    expect(paths(c, ['ema'])).toEqual(['indicators.ema.master_enabled']);
    expect(validateConfig(c, registry, [indicatorCapability('ema')])).toEqual([]);
    expect(validateConfig(c, registry, new Set(['indicator:ema', 'lesson:ch05-l01']))).toEqual([]);
    // Master OFF never needs a grant; non-boolean master is rejected.
    expect(validateConfig(defaultConfig(), registry, [])).toEqual([]);
    (ema as { master_enabled: unknown }).master_enabled = 'yes';
    expect(paths(c)).toEqual(['indicators.ema.master_enabled']);
  });

  it('does not mutate its input', () => {
    const c = deepFreeze(maConfig());
    expect(() => validateConfig(c, registry, ['indicator:ma'])).not.toThrow();
  });
});

describe('quant v2 hashing', () => {
  it('canonical JSON sorts keys recursively and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
    expect(canonicalJson({ a: undefined, b: new Date('2026-01-01T00:00:00Z') })).toBe(
      '{"b":"2026-01-01T00:00:00.000Z"}',
    );
  });

  it('sha256 and config hash are stable and key-order independent', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const c = defaultConfig();
    const reordered = reverseKeys(c);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(c));
    expect(configHash(reordered)).toBe(configHash(c));
    expect(configHash(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(configHash(maConfig())).not.toBe(configHash(c));
  });
});

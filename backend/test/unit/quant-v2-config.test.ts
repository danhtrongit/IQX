import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  configHash,
  defaultConfig,
  indicatorCapability,
  loadTechnicalRegistry,
  sha256Hex,
  validateConfig,
  type IndicatorConfig,
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

/** Reference test helper `ma()`: MA master ON, sell period 30. */
function maConfig(): SharedConfig {
  const c = defaultConfig();
  const ma = indicator(c, 'ma');
  ma.master_enabled = true;
  ma.sell.params.period = 30;
  return c;
}

const paths = (config: unknown, grants?: string[] | ReadonlySet<string>) =>
  validateConfig(config, registry, grants).map((e) => e.path);

describe('quant v2 defaultConfig', () => {
  it('equals the reference defaultConfig (same JSON, same key order)', () => {
    expect(JSON.stringify(defaultConfig())).toBe(
      JSON.stringify(reference.defaultConfig(rawRegistry)),
    );
    expect(Object.keys(defaultConfig().indicators)).toHaveLength(35);
  });

  it('is valid, master OFF everywhere, and independent copies of the registry', () => {
    const c = defaultConfig();
    expect(validateConfig(c)).toEqual([]);
    expect(Object.values(c.indicators).every((x) => !x.master_enabled)).toBe(true);
    indicator(c, 'rsi').buy.params.period = 50;
    expect(registry.find((r) => r.id === 'rsi')?.buy.params.period).toBe(14);
    expect(indicator(defaultConfig(), 'rsi').buy.params.period).toBe(14);
  });
});

describe('quant v2 validateConfig', () => {
  it('ports the reference validation assertions', () => {
    let c = maConfig();
    expect(validateConfig(c)).toEqual([]);
    expect(reference.validateConfig(c, rawRegistry)).toEqual([]);
    expect(validateConfig(c, registry, []).length).toBeGreaterThan(0);
    indicator(c, 'ma').buy.params.period = 12.5;
    expect(validateConfig(c).length).toBeGreaterThan(0);
    c = maConfig();
    (indicator(c, 'ma').buy.rules[0] as { op: string }).op = 'evil';
    expect(validateConfig(c).length).toBeGreaterThan(0);
    c = maConfig();
    const lhs = indicator(c, 'ma').buy.rules[0]?.lhs;
    if (lhs?.kind === 'series') lhs.offset = 1;
    expect(validateConfig(c).length).toBeGreaterThan(0);
    c = defaultConfig();
    indicator(c, 'rsi').sell.params.level = 30;
    expect(paths(c)).toEqual(['indicators.rsi.sell.params.level']);
  });

  it('accepts and rejects exactly like the reference on shared cases', () => {
    const cases: Array<(c: SharedConfig) => void> = [
      () => undefined,
      (c) => (indicator(c, 'macd').buy.params.fast = 30),
      (c) => (indicator(c, 'psar').sell.params.step = 0.2),
      (c) => (indicator(c, 'bollinger').buy.params.k = 2.05),
      (c) => (indicator(c, 'bollinger').buy.params.k = 2.3),
      (c) => (indicator(c, 'cmf').sell.params.level = -0.37),
      (c) => (indicator(c, 'rsi').buy.params.level = 49),
      (c) => (indicator(c, 'rsi').buy.params.level = 50),
      (c) => {
        const item = indicator(c, 'ema');
        item.master_enabled = true;
        item.buy.enabled = false;
        item.sell.enabled = false;
      },
      (c) => (indicator(c, 'bollinger').buy.rules[1]!.op = '∉'),
      (c) => (indicator(c, 'bollinger').buy.rules[1]!.op = '>'),
      (c) => indicator(c, 'stochastic').buy.rules.pop(),
      (c) => (indicator(c, 'atr').buy.params.extra = 1),
      (c) => delete indicator(c, 'atr').sell.params.baseline,
    ];
    for (const [i, mutate] of cases.entries()) {
      const c = defaultConfig();
      mutate(c);
      const ours = validateConfig(c).length === 0;
      const theirs = reference.validateConfig(c, rawRegistry).length === 0;
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

  it('enforces param type, range, step and cross-field constraints', () => {
    const cases: Array<[string, (c: SharedConfig) => void]> = [
      ['indicators.ma.buy.params.period', (c) => (indicator(c, 'ma').buy.params.period = 4)],
      ['indicators.ma.buy.params.period', (c) => (indicator(c, 'ma').buy.params.period = 201)],
      [
        'indicators.ma.buy.params.period',
        (c) => (indicator(c, 'ma').buy.params.period = Number.NaN),
      ],
      ['indicators.ma.buy.params.period', (c) => delete indicator(c, 'ma').buy.params.period],
      ['indicators.ma.buy.params.foo', (c) => (indicator(c, 'ma').buy.params.foo = 1)],
      [
        'indicators.bollinger.sell.params.k',
        (c) => (indicator(c, 'bollinger').sell.params.k = 2.05),
      ],
      [
        'indicators.atr_percent.buy.params.level',
        (c) => (indicator(c, 'atr_percent').buy.params.level = 5.55),
      ],
      ['indicators.macd.buy.params.fast', (c) => (indicator(c, 'macd').buy.params.fast = 26)],
      [
        'indicators.ma_cross.sell.params.fast',
        (c) => (indicator(c, 'ma_cross').sell.params.fast = 60),
      ],
      [
        'indicators.psar.buy.params.step',
        (c) => {
          indicator(c, 'psar').buy.params.step = 0.1;
          indicator(c, 'psar').buy.params.max = 0.1;
        },
      ],
    ];
    for (const [path, mutate] of cases) {
      const c = defaultConfig();
      mutate(c);
      expect(paths(c), path).toEqual([path]);
    }
    // Float steps are accepted within tolerance (0.1 + 0.2 style noise).
    const ok = defaultConfig();
    indicator(ok, 'bollinger').buy.params.k = 0.1 + 0.2 + 2;
    indicator(ok, 'psar').buy.params.step = 0.07;
    indicator(ok, 'cmf').buy.params.level = -0.37;
    expect(validateConfig(ok)).toEqual([]);
  });

  it('allows only op changes within allowed_ops; operands and rule count are frozen', () => {
    const allowed = defaultConfig();
    indicator(allowed, 'ma').buy.rules[0]!.op = '<';
    indicator(allowed, 'bollinger').sell.rules[1]!.op = '∉';
    expect(validateConfig(allowed)).toEqual([]);
    const reordered = defaultConfig();
    const rule = indicator(reordered, 'ma').buy.rules[0]!;
    indicator(reordered, 'ma').buy.rules[0] = reverseKeys(rule);
    expect(validateConfig(reordered)).toEqual([]);
    const cases: Array<[string, (c: SharedConfig) => void]> = [
      [
        'indicators.ma.buy.rules.0.op',
        (c) => ((indicator(c, 'ma').buy.rules[0] as { op: string }).op = '∈'),
      ],
      [
        'indicators.ma.buy.rules.0',
        (c) => (indicator(c, 'ma').buy.rules[0]!.rhs = { kind: 'constant', value: 1 }),
      ],
      ['indicators.ma.buy.rules.0', (c) => (indicator(c, 'ma').buy.rules[0]!.id = 'r9')],
      [
        'indicators.ma.buy.rules.0',
        (c) =>
          ((indicator(c, 'ma').buy.rules[0] as { allowed_ops: string[] }).allowed_ops = [
            '>',
            '<',
            '∈',
          ]),
      ],
      [
        'indicators.ma.buy.rules',
        (c) => indicator(c, 'ma').buy.rules.push(clone(indicator(c, 'ma').buy.rules[0]!)),
      ],
      [
        'indicators.ma.buy.rules',
        (c) => ((indicator(c, 'ma').buy as { rules: unknown }).rules = {}),
      ],
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

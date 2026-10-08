import { describe, expect, it } from 'vitest';

import {
  CALCULATION_VERSION,
  canonicalJson,
  effectiveField,
  loadTechnicalRegistry,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import {
  defaultPracticeConfig,
  normalizePracticeConfig,
  practiceEntry,
  practiceForm,
  validatePracticeConfig,
} from '../../src/modules/practice/practice.config.js';
import {
  HOLD_MAX_DEFAULT,
  MINI_PROFILE_V1,
  PRACTICE_INDICATOR_IDS,
} from '../../src/modules/practice/practice.constants.js';
import { shuffle, generateCases } from '../../src/modules/practice/practice.permutation.js';
import { practiceSetSchema, loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import { readFileSync } from 'node:fs';

const SIDES: readonly Side[] = ['buy', 'sell'];

describe('practice indicator whitelist and registry contract', () => {
  it('has exactly the 16 Appendix B indicators', () => {
    expect([...PRACTICE_INDICATOR_IDS].sort()).toEqual(
      [
        'bollinger',
        'cci',
        'cmf',
        'donchian',
        'ema',
        'ma',
        'ma_cross',
        'macd',
        'mfi',
        'obv',
        'roc',
        'rsi',
        'stochastic',
        'volume',
        'williams_r',
        'dmi',
      ].sort(),
    );
    for (const id of PRACTICE_INDICATOR_IDS) expect(practiceEntry(id)?.id).toBe(id);
    for (const id of ['adx', 'atr', 'keltner', 'psar', 'gap', 'rs_market', 'ad_line', 'x'])
      expect(practiceEntry(id)).toBeNull();
    // the registry may carry more entries, but the practice only ever sees these 16
    expect(loadTechnicalRegistry().length).toBeGreaterThanOrEqual(16);
  });

  it('starts from the registry templates with both sides on and hold 60', () => {
    for (const id of PRACTICE_INDICATOR_IDS) {
      const entry = practiceEntry(id)!;
      const config = defaultPracticeConfig(entry);
      expect(config.hold_max_sessions).toBe(HOLD_MAX_DEFAULT);
      expect(config.buy.enabled).toBe(true);
      expect(config.sell.enabled).toBe(true);
      expect(Object.keys(config.buy.ops)).toEqual(entry.buy.rules.map((rule) => rule.id));
      expect(validatePracticeConfig(entry, config, { requireBuy: true }), id).toEqual([]);
    }
  });
});

describe('practice config validation against the registry', () => {
  it('enforces every field domain and step on each side', () => {
    for (const id of PRACTICE_INDICATOR_IDS) {
      const entry = practiceEntry(id)!;
      for (const side of SIDES) {
        for (const raw of entry.fields) {
          const field = effectiveField(entry, side, raw);
          const check = (value: number) => {
            const config = defaultPracticeConfig(entry);
            config[side].params[field.key] = value;
            // cross-field relations (fast < slow) are covered separately
            return validatePracticeConfig(entry, config, { requireBuy: false }).filter(
              (error) =>
                error.path.startsWith(`${side}.params.${field.key}`) &&
                !/nhỏ hơn|lớn hơn/.test(error.message),
            );
          };
          expect(check(field.min), `${id}.${side}.${field.key} min`).toEqual([]);
          expect(check(field.max), `${id}.${side}.${field.key} max`).toEqual([]);
          expect(check(field.min - field.step), `${id}.${side}.${field.key} below`).not.toEqual([]);
          expect(check(field.max + field.step), `${id}.${side}.${field.key} above`).not.toEqual([]);
          if (field.type === 'integer') {
            expect(check(field.min + 0.5), `${id}.${side}.${field.key} fraction`).not.toEqual([]);
          } else if (field.step < 1) {
            expect(
              check(field.min + field.step / 2),
              `${id}.${side}.${field.key} step`,
            ).not.toEqual([]);
          }
        }
      }
    }
  });

  it('keeps the Appendix B domains of the sample forms', () => {
    const errors = (id: string, mutate: (c: ReturnType<typeof defaultPracticeConfig>) => void) => {
      const entry = practiceEntry(id)!;
      const config = defaultPracticeConfig(entry);
      mutate(config);
      return validatePracticeConfig(entry, config, { requireBuy: true });
    };
    // RSI: Buy level 10-49 and Sell level 51-90 (different domains per side)
    expect(errors('rsi', (c) => (c.buy.params.level = 50))).not.toEqual([]);
    expect(errors('rsi', (c) => (c.buy.params.level = 49))).toEqual([]);
    expect(errors('rsi', (c) => (c.sell.params.level = 50))).not.toEqual([]);
    expect(errors('rsi', (c) => (c.sell.params.level = 51))).toEqual([]);
    // fast < slow for MACD and MA Cross
    expect(errors('macd', (c) => (c.buy.params.fast = 30))).not.toEqual([]);
    expect(errors('ma_cross', (c) => (c.sell.params.fast = 60))).not.toEqual([]);
    expect(errors('ma_cross', (c) => (c.sell.params.fast = 40))).toEqual([]);
    // Donchian / ROC reach 252 sessions, CMF level -1..1 step 0.01, ROC level step 0.1
    expect(errors('donchian', (c) => (c.buy.params.period = 252))).toEqual([]);
    expect(errors('donchian', (c) => (c.buy.params.period = 253))).not.toEqual([]);
    expect(errors('roc', (c) => (c.buy.params.period = 252))).toEqual([]);
    expect(errors('cmf', (c) => (c.sell.params.level = -0.25))).toEqual([]);
    expect(errors('cmf', (c) => (c.sell.params.level = 1.01))).not.toEqual([]);
    expect(errors('roc', (c) => (c.buy.params.level = 5.1))).toEqual([]);
    expect(errors('stochastic', (c) => (c.sell.params.level = 100))).toEqual([]);
    expect(errors('bollinger', (c) => (c.buy.params.k = 3.5))).toEqual([]);
    expect(errors('bollinger', (c) => (c.buy.params.k = 3.6))).not.toEqual([]);
  });

  it('validates operators per stable rule id', () => {
    const entry = practiceEntry('bollinger')!;
    const config = defaultPracticeConfig(entry);
    expect(config.buy.ops).toEqual({ r1: '<', r2: '∈', r3: '>' });
    config.buy.ops = { r1: '>', r2: '∉', r3: '<' };
    expect(validatePracticeConfig(entry, config, { requireBuy: true })).toEqual([]);
    for (const bad of [
      { r1: '∈', r2: '∈', r3: '>' },
      { r1: '<', r2: '>', r3: '>' },
      { r1: '<', r2: '∈' },
      { r1: '<', r2: '∈', r3: '>', r4: '>' },
    ]) {
      config.buy.ops = bad as never;
      expect(validatePracticeConfig(entry, config, { requireBuy: true })).not.toEqual([]);
    }
  });

  it('requires an enabled Buy side and a hold of 1..1000 whole sessions', () => {
    const entry = practiceEntry('rsi')!;
    const base = defaultPracticeConfig(entry);
    expect(
      validatePracticeConfig(
        entry,
        { ...base, buy: { ...base.buy, enabled: false } },
        { requireBuy: true },
      ),
    ).toEqual([{ path: 'buy.enabled', message: 'Bật điều kiện Mua để bắt đầu.' }]);
    for (const hold of [1, 60, 1000]) {
      expect(
        validatePracticeConfig(entry, { ...base, hold_max_sessions: hold }, { requireBuy: true }),
      ).toEqual([]);
    }
    for (const hold of [0, -3, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        validatePracticeConfig(entry, { ...base, hold_max_sessions: hold }, { requireBuy: true }),
        String(hold),
      ).not.toEqual([]);
    }
  });

  it('normalises to a canonical config so equal intents hash equally', () => {
    const entry = practiceEntry('stochastic')!;
    const config = defaultPracticeConfig(entry);
    const shuffled = {
      hold_max_sessions: config.hold_max_sessions,
      sell: {
        ops: { r2: config.sell.ops.r2, r1: config.sell.ops.r1 },
        params: Object.fromEntries(Object.entries(config.sell.params).reverse()),
        enabled: config.sell.enabled,
      },
      buy: {
        params: Object.fromEntries(Object.entries(config.buy.params).reverse()),
        ops: { r2: config.buy.ops.r2, r1: config.buy.ops.r1 },
        enabled: config.buy.enabled,
      },
    };
    expect(canonicalJson(normalizePracticeConfig(entry, shuffled as never))).toBe(
      canonicalJson(normalizePracticeConfig(entry, config)),
    );
  });
});

describe('practice form descriptor (no Premium registry call needed)', () => {
  it('exposes effective per-side domains, rule templates and the registry defaults', () => {
    const rsi = practiceForm(practiceEntry('rsi')!);
    const level = (side: 'buy' | 'sell') => rsi[side].fields.find((f) => f.key === 'level')!;
    expect([level('buy').min, level('buy').max]).toEqual([10, 49]);
    expect([level('sell').min, level('sell').max]).toEqual([51, 90]);
    expect(rsi.buy.rules.map((r) => [r.rule_id, r.default_op, r.allowed_ops])).toEqual([
      ['r1', '<', ['>', '<']],
      ['r2', '>', ['>', '<']],
    ]);
    expect(rsi.defaults).toEqual(defaultPracticeConfig(practiceEntry('rsi')!));
    expect(practiceForm(practiceEntry('ma_cross')!).cross_fields).toEqual([
      { left: 'fast', op: '<', right: 'slow' },
    ]);
    const bollinger = practiceForm(practiceEntry('bollinger')!);
    expect(bollinger.buy.rules[1]).toMatchObject({ kind: 'membership', allowed_ops: ['∈', '∉'] });
    for (const id of PRACTICE_INDICATOR_IDS) {
      const form = practiceForm(practiceEntry(id)!);
      expect(form.buy.fields.length).toBeGreaterThan(0);
      expect(form.sell.rules.length).toBeGreaterThan(0);
    }
  });
});

describe('practice set definition', () => {
  const set = loadPracticeSet();

  it('is the owner-pending vn30-practice-2024h1-v1 set of 30 distinct symbols', () => {
    expect(set.set_version).toBe('vn30-practice-2024h1-v1');
    expect(set.owner_confirmation).toBe('pending');
    expect(set.symbols).toHaveLength(30);
    expect(new Set(set.symbols).size).toBe(30);
    expect([...set.symbols]).toEqual(
      'ACB BCM BID BVH CTG FPT GAS GVR HDB HPG MBB MSN MWG PLX POW SAB SHB SSB SSI STB TCB TPB VCB VHM VIB VIC VJC VNM VPB VRE'.split(
        ' ',
      ),
    );
    expect(set.observation).toEqual({ from: '2024-01-01', to: '2024-06-30' });
    expect(set.test).toEqual({ from: '2024-07-01', to: '2026-06-30', months: 24 });
    expect(set.window_bars).toBe(130);
  });

  it('pins the data, calculation, execution, comment and profile versions', () => {
    expect(set.versions.calculation).toBe(CALCULATION_VERSION);
    expect(set.versions.profile).toBe(MINI_PROFILE_V1.profile_version);
    expect(set.versions.data).toBeTruthy();
    expect(set.versions.execution).toBeTruthy();
    expect(set.versions.comment).toBeTruthy();
    expect(set.warmup.sessions_required).toBeGreaterThanOrEqual(253);
  });

  it('rejects malformed definitions', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL('../../src/modules/practice/practice-set.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(practiceSetSchema.safeParse(raw).success).toBe(true);
    const symbols = raw.symbols as string[];
    expect(
      practiceSetSchema.safeParse({ ...raw, symbols: [...symbols.slice(0, 29), 'ACB'] }).success,
    ).toBe(false);
    expect(practiceSetSchema.safeParse({ ...raw, symbols: symbols.slice(0, 29) }).success).toBe(
      false,
    );
    expect(
      practiceSetSchema.safeParse({
        ...raw,
        test: { from: '2024-01-01', to: '2026-06-30', months: 24 },
      }).success,
    ).toBe(false);
    expect(
      practiceSetSchema.safeParse({
        ...raw,
        test: { from: '2024-07-01', to: '2026-06-30', months: 12 },
      }).success,
    ).toBe(false);
    expect(practiceSetSchema.safeParse({ ...raw, owner_confirmation: 'maybe' }).success).toBe(
      false,
    );
  });
});

describe('practice permutation helper', () => {
  it('returns a permutation of the input (no loss, no repeat) with a seeded source', () => {
    let state = 12345;
    const random = (bound: number): number => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state % bound;
    };
    const input = Array.from({ length: 30 }, (_, i) => `S${i}`);
    const out = shuffle(input, random);
    expect([...out].sort()).toEqual([...input].sort());
    expect(out).not.toEqual(input);
    expect(input).toEqual(Array.from({ length: 30 }, (_, i) => `S${i}`));
  });

  it('uses the cryptographic source by default and gives distinct opaque ids', () => {
    const symbols = loadPracticeSet().symbols;
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const cases = generateCases(symbols);
      expect(cases.map((c) => c.ordinal)).toEqual(Array.from({ length: 30 }, (_, k) => k + 1));
      expect(new Set(cases.map((c) => c.symbol)).size).toBe(30);
      expect(new Set(cases.map((c) => c.case_id)).size).toBe(30);
      expect(cases.every((c) => !symbols.includes(c.case_id))).toBe(true);
      orders.add(cases.map((c) => c.symbol).join());
    }
    expect(orders.size).toBeGreaterThan(35);
  });
});

describe('practice migration 0017', () => {
  const sql = readFileSync(new URL('../../migrations/0017_practice.sql', import.meta.url), 'utf8');

  it('is additive and idempotent (no destructive statements on existing tables)', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    for (const table of [
      'practice_symbol_data',
      'practice_progress',
      'practice_cases',
      'practice_runs',
      'practice_advances',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    for (const match of sql.matchAll(/CREATE TRIGGER (\w+)/g)) {
      expect(sql).toContain(`DROP TRIGGER IF EXISTS ${match[1]}`);
    }
  });

  it('declares the uniqueness that makes starts and the permutation idempotent', () => {
    expect(sql).toMatch(/UNIQUE \(user_id, indicator_id, set_version\)/);
    expect(sql).toMatch(/UNIQUE \(user_id, indicator_id, set_version, ordinal\)/);
    expect(sql).toMatch(/UNIQUE \(user_id, idempotency_key\)/);
    expect(sql).toMatch(/UNIQUE \(progress_id, symbol\)/);
    expect(sql).toMatch(
      /cursor_ordinal smallint NOT NULL DEFAULT 1 CHECK \(cursor_ordinal BETWEEN 1 AND 30\)/,
    );
  });
});

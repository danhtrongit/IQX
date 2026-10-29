import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  OUTDATED_FORMAT_MESSAGE,
  OUTDATED_RUN_ERROR,
  currentDraft,
  defaultPracticeConfig,
  isCurrentPracticeConfig,
  isOutdatedUnfinishedRun,
  normalizePracticeConfig,
  outdatedFormatErrors,
  practiceEntry,
  practiceForm,
  previewCandidate,
  toSideConfig,
  validatePracticeConfig,
} from '../../src/modules/practice/practice.config.js';
import {
  HOLD_MAX_DEFAULT,
  MINI_PROFILE_V1,
  PRACTICE_INDICATOR_IDS,
} from '../../src/modules/practice/practice.constants.js';
import { shuffle, generateCases } from '../../src/modules/practice/practice.permutation.js';
import { practiceSetSchema, loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import type {
  PracticeParamsConfig,
  PracticeRowsConfig,
} from '../../src/modules/practice/practice.types.js';
import {
  CALCULATION_VERSION,
  canonicalJson,
  effectiveField,
  isRowsEntry,
  loadTechnicalRegistry,
  type ParamsRegistryEntry,
  type RowsRegistryEntry,
  type Side,
} from '../../src/modules/quant/v2/index.js';

const SIDES: readonly Side[] = ['buy', 'sell'];
const SIDE_NAME: Record<Side, string> = { buy: 'Mua', sell: 'Bán' };
const ROW_INDICATORS = PRACTICE_INDICATOR_IDS.filter((id) => id !== 'volume');

const rowsEntry = (id: string): RowsRegistryEntry => {
  const entry = practiceEntry(id);
  if (!entry || !isRowsEntry(entry)) throw new Error(`${id} is not row-based`);
  return entry;
};
const volumeEntry = (): ParamsRegistryEntry => {
  const entry = practiceEntry('volume');
  if (!entry || isRowsEntry(entry)) throw new Error('volume must be params-based');
  return entry;
};
const rowsConfig = (id: string): PracticeRowsConfig =>
  structuredClone(defaultPracticeConfig(rowsEntry(id)) as PracticeRowsConfig);
const volumeConfig = (): PracticeParamsConfig =>
  structuredClone(defaultPracticeConfig(volumeEntry()) as PracticeParamsConfig);

describe('practice indicator whitelist and registry contract', () => {
  it('has exactly the 16 Appendix B indicators: 15 with condition rows and Volume with params', () => {
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
    expect(ROW_INDICATORS).toHaveLength(15);
    for (const id of ROW_INDICATORS) expect(practiceEntry(id)!.model, id).toBe('rows');
    expect(practiceEntry('volume')!.model).toBe('legacy_params');
    // SPEC V3: 27 rows per tab
    expect(ROW_INDICATORS.reduce((sum, id) => sum + rowsEntry(id).rows.length, 0)).toBe(27);
  });

  it('starts from the registry rows with both tabs on and hold 60', () => {
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      const config = defaultPracticeConfig(entry) as PracticeRowsConfig;
      expect(config.hold_max_sessions).toBe(HOLD_MAX_DEFAULT);
      for (const side of SIDES) {
        // a new practice draft starts with both tabs ON (the registry tab switch is not copied)
        expect(config[side].enabled, `${id}.${side}`).toBe(true);
        expect(config[side]).not.toHaveProperty('params');
        expect(config[side]).not.toHaveProperty('ops');
        expect(config[side].rules, `${id}.${side}`).toEqual(
          entry.rows.map((row) => ({ id: row.id, enabled: row.default_enabled, ...row[side] })),
        );
      }
      expect(isCurrentPracticeConfig(entry, config), id).toBe(true);
      expect(validatePracticeConfig(entry, config, { requireBuy: true }), id).toEqual([]);
    }
  });

  it('starts Volume from the registry template params and operators', () => {
    const entry = volumeEntry();
    const config = defaultPracticeConfig(entry) as PracticeParamsConfig;
    expect(config.hold_max_sessions).toBe(HOLD_MAX_DEFAULT);
    expect(config.buy).toEqual({
      enabled: true,
      params: { lookback: 20, mult: 1 },
      ops: { r1: '>', r2: '>' },
    });
    expect(config.sell).toEqual({
      enabled: true,
      params: { lookback: 20, mult: 1 },
      ops: { r1: '<', r2: '>' },
    });
    expect(isCurrentPracticeConfig(entry, config)).toBe(true);
    expect(validatePracticeConfig(entry, config, { requireBuy: true })).toEqual([]);
  });

  it('hands out a fresh copy of the defaults every time', () => {
    const entry = rowsEntry('rsi');
    const a = defaultPracticeConfig(entry) as PracticeRowsConfig;
    a.buy.rules[0]!.period = 99;
    expect((defaultPracticeConfig(entry) as PracticeRowsConfig).buy.rules[0]!.period).toBe(14);
    expect(entry.rows[0]!.buy.period).toBe(14);
  });
});

describe('practice config validation: condition rows (SPEC V3 §4)', () => {
  it('enforces every field domain, preset, step and enum code of every row on both tabs', () => {
    let checked = 0;
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      entry.rows.forEach((definition, rowIndex) => {
        for (const side of SIDES) {
          for (const field of definition.fields) {
            const path = `${side}.rules.${rowIndex}.${field.key}`;
            const label = `${id}.${side}.${definition.id}.${field.key}`;
            const check = (value: unknown) => {
              const config = rowsConfig(id);
              config[side].rules[rowIndex]![field.key] = value as number;
              // fast < slow is covered separately
              return validatePracticeConfig(entry, config, { requireBuy: false }).filter(
                (error) => error.path === path && !/nhỏ hơn/.test(error.message),
              );
            };
            if (field.type === 'enum') {
              for (const option of field.options) expect(check(option.value), label).toEqual([]);
              expect(check('not-a-code'), `${label} unknown code`).toHaveLength(1);
              expect(check(1), `${label} number instead of code`).toHaveLength(1);
            } else if (field.options) {
              for (const value of field.options)
                expect(check(value), `${label} ${value}`).toEqual([]);
              expect(check(7), `${label} off preset`).toHaveLength(1);
            } else {
              expect(check(field.min), `${label} min`).toEqual([]);
              expect(check(field.max), `${label} max`).toEqual([]);
              expect(check(field.min - field.step), `${label} below`).toHaveLength(1);
              expect(check(field.max + field.step), `${label} above`).toHaveLength(1);
              expect(check(Number.NaN), `${label} NaN`).toHaveLength(1);
              expect(check('14'), `${label} string`).toHaveLength(1);
              if (field.type === 'integer') {
                expect(check(field.min + 0.5), `${label} fraction`).toHaveLength(1);
              } else {
                expect(check(field.min + field.step / 2), `${label} step`).toHaveLength(1);
              }
            }
            checked += 1;
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('reports the row message with the tab and the 1-based row number', () => {
    const rsi = rowsEntry('rsi');
    const config = rowsConfig('rsi');
    config.buy.rules[0]!.threshold = 101;
    config.sell.rules[1]!.period = 1;
    expect(validatePracticeConfig(rsi, config, { requireBuy: true })).toEqual([
      {
        path: 'buy.rules.0.threshold',
        message: 'Mua · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên.',
        side: 'buy',
        row: 1,
      },
      {
        path: 'sell.rules.1.period',
        message: 'Bán · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
        side: 'sell',
        row: 2,
      },
    ]);
    const ma = rowsConfig('ma');
    ma.buy.rules[0]!.period = 7;
    expect(validatePracticeConfig(rowsEntry('ma'), ma, { requireBuy: true })).toEqual([
      {
        path: 'buy.rules.0.period',
        message: 'Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.',
        side: 'buy',
        row: 1,
      },
    ]);
  });

  it('keeps fast < slow on MACD, SMA/EMA row 2 and MA Cross', () => {
    const cases: Array<[string, number, string, number]> = [
      ['macd', 0, 'fast', 30],
      ['macd', 1, 'fast', 26],
      ['macd', 2, 'fast', 40],
      ['ma', 1, 'fast', 20],
      ['ema', 1, 'slow', 5],
      ['ma_cross', 0, 'fast', 100],
    ];
    for (const [id, rowIndex, key, value] of cases) {
      for (const side of SIDES) {
        const entry = rowsEntry(id);
        const config = rowsConfig(id);
        config[side].rules[rowIndex]![key] = value;
        const errors = validatePracticeConfig(entry, config, { requireBuy: true });
        expect(errors, `${id}.${side}.${rowIndex}`).toHaveLength(1);
        expect(errors[0]!.message).toBe(
          `${SIDE_NAME[side]} · dòng ${rowIndex + 1}: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.`,
        );
        expect(errors[0]).toMatchObject({ side, row: rowIndex + 1 });
      }
    }
    // a valid pair passes
    const ok = rowsConfig('ma_cross');
    ok.sell.rules[0]!.fast = 5;
    expect(validatePracticeConfig(rowsEntry('ma_cross'), ok, { requireBuy: true })).toEqual([]);
  });

  it('keeps the SPEC V3 domains of the sample forms', () => {
    const errors = (id: string, mutate: (config: PracticeRowsConfig) => void) => {
      const config = rowsConfig(id);
      mutate(config);
      return validatePracticeConfig(rowsEntry(id), config, { requireBuy: true });
    };
    const row = (config: PracticeRowsConfig, side: Side, index: number) =>
      config[side].rules[index]!;
    // RSI level 0-100 on both tabs
    expect(errors('rsi', (c) => (row(c, 'buy', 0).threshold = -1))).not.toEqual([]);
    expect(errors('rsi', (c) => (row(c, 'buy', 0).threshold = 50))).toEqual([]);
    expect(errors('rsi', (c) => (row(c, 'sell', 0).threshold = 101))).not.toEqual([]);
    // Donchian / ROC / OBV breakout reach 252 sessions
    expect(errors('donchian', (c) => (row(c, 'buy', 0).period = 252))).toEqual([]);
    expect(errors('donchian', (c) => (row(c, 'buy', 0).period = 253))).not.toEqual([]);
    expect(errors('roc', (c) => (row(c, 'buy', 0).period = 252))).toEqual([]);
    expect(errors('obv', (c) => (row(c, 'buy', 1).period = 252))).toEqual([]);
    expect(errors('obv', (c) => (row(c, 'buy', 1).period = 253))).not.toEqual([]);
    // CMF threshold -1..1 step 0.01, ROC threshold in percent step 0.1, ADX 0..100 step 0.1
    expect(errors('cmf', (c) => (row(c, 'sell', 0).threshold = -0.25))).toEqual([]);
    expect(errors('cmf', (c) => (row(c, 'sell', 0).threshold = 1.01))).not.toEqual([]);
    expect(errors('roc', (c) => (row(c, 'buy', 0).threshold = 5.1))).toEqual([]);
    expect(errors('roc', (c) => (row(c, 'buy', 0).threshold = 5.15))).not.toEqual([]);
    expect(errors('dmi', (c) => (row(c, 'buy', 1).threshold = 25.5))).toEqual([]);
    // Bollinger multiplier 1..3.5 step 0.1
    expect(errors('bollinger', (c) => (row(c, 'buy', 0).mult = 3.5))).toEqual([]);
    expect(errors('bollinger', (c) => (row(c, 'buy', 0).mult = 3.6))).not.toEqual([]);
    // Williams %R threshold -100..0, CCI -300..300
    expect(errors('williams_r', (c) => (row(c, 'buy', 0).threshold = 1))).not.toEqual([]);
    expect(errors('cci', (c) => (row(c, 'buy', 0).threshold = -300))).toEqual([]);
  });

  it('validates both tabs, disabled rows and a disabled tab included, without repairing values', () => {
    const macd = rowsEntry('macd');
    const config = rowsConfig('macd');
    expect(config.buy.rules[1]!.enabled).toBe(false); // macd.zero is off by default
    config.buy.rules[1]!.fast = 1;
    config.sell.enabled = false;
    config.sell.rules[0]!.period = 'x' as never; // unknown key: refused, not dropped
    const errors = validatePracticeConfig(macd, config, { requireBuy: true });
    expect(errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['buy.rules.1.fast', 'sell.rules.0.period']),
    );
    expect(errors.find((e) => e.path === 'buy.rules.1.fast')).toMatchObject({
      side: 'buy',
      row: 2,
      message: 'Mua · dòng 2: Chu kỳ EMA nhanh phải từ 2 đến 200, số nguyên.',
    });
    // the config object itself was not touched
    expect(config.buy.rules[1]!.fast).toBe(1);
  });

  it('rejects unknown row keys, wrong row ids/count and a non-boolean row switch', () => {
    const rsi = rowsEntry('rsi');
    const messages = (mutate: (config: PracticeRowsConfig) => void) => {
      const config = rowsConfig('rsi');
      mutate(config);
      return validatePracticeConfig(rsi, config, { requireBuy: true });
    };
    expect(messages((c) => ((c.buy.rules[0] as Record<string, unknown>).level = 30))).not.toEqual(
      [],
    );
    expect(messages((c) => (c.buy.rules[0]!.enabled = 'yes' as never))).not.toEqual([]);
    // a missing, extra or reordered row is the pre-V3 / foreign format
    expect(messages((c) => c.buy.rules.pop())).toEqual(outdatedFormatErrors());
    expect(messages((c) => c.sell.rules.reverse())).toEqual(outdatedFormatErrors());
    expect(
      messages((c) => c.buy.rules.push({ id: 'rsi.extra', enabled: true, period: 14 })),
    ).toEqual(outdatedFormatErrors());
  });
});

describe('practice config validation: Volume (params + operators)', () => {
  it('enforces every field domain and step on each side', () => {
    const entry = volumeEntry();
    for (const side of SIDES) {
      for (const raw of entry.fields) {
        const field = effectiveField(entry, side, raw);
        const check = (value: number) => {
          const config = volumeConfig();
          config[side].params[field.key] = value;
          return validatePracticeConfig(entry, config, { requireBuy: false }).filter((error) =>
            error.path.startsWith(`${side}.params.${field.key}`),
          );
        };
        expect(check(field.min), `${side}.${field.key} min`).toEqual([]);
        expect(check(field.max), `${side}.${field.key} max`).toEqual([]);
        expect(check(field.min - field.step), `${side}.${field.key} below`).not.toEqual([]);
        expect(check(field.max + field.step), `${side}.${field.key} above`).not.toEqual([]);
        if (field.type === 'integer') {
          expect(check(field.min + 0.5), `${side}.${field.key} fraction`).not.toEqual([]);
        } else {
          expect(check(field.min + field.step / 2), `${side}.${field.key} step`).not.toEqual([]);
        }
      }
    }
  });

  it('validates operators and rule switches per stable rule id', () => {
    const entry = volumeEntry();
    const config = volumeConfig();
    config.buy.ops = { r1: '<', r2: '<' };
    expect(validatePracticeConfig(entry, config, { requireBuy: true })).toEqual([]);
    for (const bad of [
      { r1: '∈', r2: '>' },
      { r1: '>' },
      { r1: '>', r2: '>', r9: '>' },
      { r1: 'cross_up', r2: '>' },
    ]) {
      config.buy.ops = bad as never;
      expect(
        validatePracticeConfig(entry, config, { requireBuy: true }),
        JSON.stringify(bad),
      ).not.toEqual([]);
    }
    const switches = volumeConfig();
    switches.sell.rules_enabled = { r1: false, r2: true };
    expect(validatePracticeConfig(entry, switches, { requireBuy: true })).toEqual([]);
    switches.sell.rules_enabled = { r9: true };
    expect(validatePracticeConfig(entry, switches, { requireBuy: true })).not.toEqual([]);
    switches.sell.rules_enabled = { r1: 'no' as never };
    expect(validatePracticeConfig(entry, switches, { requireBuy: true })).not.toEqual([]);
  });
});

describe('practice config validation: Buy tab, hold and the pre-V3 shape', () => {
  it('requires an enabled Buy tab and a hold of 1..1000 whole sessions', () => {
    const entry = rowsEntry('rsi');
    const base = rowsConfig('rsi');
    expect(
      validatePracticeConfig(
        entry,
        { ...base, buy: { ...base.buy, enabled: false } },
        { requireBuy: true },
      ),
    ).toEqual([{ path: 'buy.enabled', message: 'Bật điều kiện Mua để bắt đầu.' }]);
    // a draft save does not require Buy
    expect(
      validatePracticeConfig(
        entry,
        { ...base, buy: { ...base.buy, enabled: false } },
        { requireBuy: false },
      ),
    ).toEqual([]);
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

  it('refuses the pre-V3 shape of a row-based indicator, one error per tab, never mapped', () => {
    const oldSide = (op: string) => ({
      enabled: true,
      params: { period: 14, level: 30 },
      ops: { r1: op, r2: '>' },
    });
    const old = { buy: oldSide('<'), sell: oldSide('>'), hold_max_sessions: 60 };
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      expect(isCurrentPracticeConfig(entry, old), id).toBe(false);
      expect(validatePracticeConfig(entry, old as never, { requireBuy: true }), id).toEqual([
        { path: 'buy', message: OUTDATED_FORMAT_MESSAGE, side: 'buy' },
        { path: 'sell', message: OUTDATED_FORMAT_MESSAGE, side: 'sell' },
      ]);
    }
    expect(OUTDATED_FORMAT_MESSAGE).toBe(
      'Định dạng điều kiện cũ không còn được hỗ trợ. Tải lại để dùng mẫu điều kiện mới.',
    );
    // and Volume refuses the rows shape
    expect(
      validatePracticeConfig(volumeEntry(), rowsConfig('rsi') as never, { requireBuy: true }),
    ).toEqual(outdatedFormatErrors());
  });

  it('recognises only the current shape of each model', () => {
    for (const id of ROW_INDICATORS) {
      expect(isCurrentPracticeConfig(rowsEntry(id), rowsConfig(id)), id).toBe(true);
      expect(isCurrentPracticeConfig(volumeEntry(), rowsConfig(id)), id).toBe(false);
    }
    expect(isCurrentPracticeConfig(volumeEntry(), volumeConfig())).toBe(true);
    for (const junk of [null, undefined, 3, 'x', [], {}, { buy: {}, sell: {} }]) {
      expect(isCurrentPracticeConfig(rowsEntry('rsi'), junk), JSON.stringify(junk)).toBe(false);
      expect(isCurrentPracticeConfig(volumeEntry(), junk), JSON.stringify(junk)).toBe(false);
    }
    // a params key next to the rows makes the tab pre-V3
    const hybrid = rowsConfig('rsi') as unknown as Record<string, Record<string, unknown>>;
    hybrid.buy!.params = { period: 14 };
    expect(isCurrentPracticeConfig(rowsEntry('rsi'), hybrid)).toBe(false);
  });
});

describe('practice draft: a pre-V3 draft is the default V4 (SPEC V3 §6.1)', () => {
  const oldDraft = (buyOn: boolean, sellOn: boolean, hold: unknown) => ({
    buy: { enabled: buyOn, params: { period: 10, level: 25 }, ops: { r1: '<', r2: '>' } },
    sell: { enabled: sellOn, params: { period: 10, level: 75 }, ops: { r1: '>', r2: '<' } },
    hold_max_sessions: hold,
  });

  it('keeps only the Mua/Bán switches and the holding time of an old-shape draft', () => {
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      const defaults = defaultPracticeConfig(entry) as PracticeRowsConfig;
      const draft = currentDraft(entry, oldDraft(false, true, 33)) as PracticeRowsConfig;
      expect(draft.buy.enabled, id).toBe(false);
      expect(draft.sell.enabled, id).toBe(true);
      expect(draft.hold_max_sessions, id).toBe(33);
      expect(draft.buy.rules, id).toEqual(defaults.buy.rules);
      expect(draft.sell.rules, id).toEqual(defaults.sell.rules);
      expect(isCurrentPracticeConfig(entry, draft), id).toBe(true);
      expect(validatePracticeConfig(entry, draft, { requireBuy: false }), id).toEqual([]);
    }
  });

  it('falls back to the defaults for what it cannot keep', () => {
    const entry = rowsEntry('rsi');
    const defaults = defaultPracticeConfig(entry) as PracticeRowsConfig;
    for (const hold of [0, -1, 1.5, 1001, '60', null, undefined, Number.NaN]) {
      expect(currentDraft(entry, oldDraft(true, true, hold)).hold_max_sessions, String(hold)).toBe(
        HOLD_MAX_DEFAULT,
      );
    }
    for (const junk of [null, undefined, 7, 'x', [], {}, { buy: 3, sell: 'x' }]) {
      expect(currentDraft(entry, junk), JSON.stringify(junk)).toEqual(defaults);
    }
    // a Volume draft stored in the rows shape is the Volume defaults
    const volume = volumeEntry();
    const fromRows = currentDraft(volume, rowsConfig('rsi'));
    expect(fromRows).toEqual({ ...defaultPracticeConfig(volume) });
    expect(isCurrentPracticeConfig(volume, fromRows)).toBe(true);
  });

  it('returns a current draft unchanged, edits included', () => {
    const entry = rowsEntry('rsi');
    const config = rowsConfig('rsi');
    config.buy.rules[0]!.period = 9;
    config.sell.enabled = false;
    expect(currentDraft(entry, config)).toEqual(config);
    const volume = volumeConfig();
    volume.buy.params.mult = 2;
    expect(currentDraft(volumeEntry(), volume)).toEqual(volume);
  });
});

describe('practice config: canonical form and engine input', () => {
  it('normalises rows to registry order so equal intents hash equally', () => {
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      const config = rowsConfig(id);
      const scrambled = {
        hold_max_sessions: config.hold_max_sessions,
        sell: {
          rules: config.sell.rules.map((row) => Object.fromEntries(Object.entries(row).reverse())),
          enabled: config.sell.enabled,
        },
        buy: {
          rules: config.buy.rules.map((row) => Object.fromEntries(Object.entries(row).reverse())),
          enabled: config.buy.enabled,
        },
      };
      expect(canonicalJson(normalizePracticeConfig(entry, scrambled as never)), id).toBe(
        canonicalJson(normalizePracticeConfig(entry, config)),
      );
      const normalized = normalizePracticeConfig(entry, config) as PracticeRowsConfig;
      expect(
        normalized.buy.rules.map((row) => Object.keys(row)[0]),
        id,
      ).toEqual(entry.rows.map(() => 'id'));
      expect(normalized.buy.rules.map((row) => row.id)).toEqual(entry.rows.map((row) => row.id));
    }
  });

  it('normalises Volume params and operators to registry order; rules_enabled only when customised', () => {
    const entry = volumeEntry();
    const config = volumeConfig();
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
    const plain = normalizePracticeConfig(entry, config) as PracticeParamsConfig;
    expect(plain.buy).not.toHaveProperty('rules_enabled');
    // the registry defaults spelled out are not a customisation
    config.buy.rules_enabled = { r1: true, r2: true };
    expect(normalizePracticeConfig(entry, config)).toEqual(plain);
    // a real switch is kept (and so changes the request hash)
    config.buy.rules_enabled = { r1: false };
    const custom = normalizePracticeConfig(entry, config) as PracticeParamsConfig;
    expect(custom.buy.rules_enabled).toEqual({ r1: false, r2: true });
    expect(canonicalJson(custom)).not.toBe(canonicalJson(plain));
  });

  it('hands rows to the engine as copies and applies Volume operators and switches', () => {
    const rsi = rowsEntry('rsi');
    const config = rowsConfig('rsi');
    const side = toSideConfig(rsi, 'buy', config.buy);
    expect(side).toEqual({ enabled: true, rules: config.buy.rules });
    expect(side).not.toHaveProperty('params');
    (side as { rules: Array<Record<string, unknown>> }).rules[0]!.period = 99;
    expect(config.buy.rules[0]!.period).toBe(14);

    const volume = volumeEntry();
    const vc = volumeConfig();
    vc.buy.ops = { r1: '<', r2: '>' };
    vc.buy.rules_enabled = { r1: false };
    const volumeSide = toSideConfig(volume, 'buy', vc.buy) as {
      params: Record<string, number>;
      rules: Array<{ id: string; op: string; enabled?: boolean }>;
    };
    expect(volumeSide.params).toEqual({ lookback: 20, mult: 1 });
    expect(volumeSide.rules.map((rule) => [rule.id, rule.op, rule.enabled])).toEqual([
      ['r1', '<', false],
      ['r2', '>', undefined],
    ]);

    // a side in the other model's shape is a programming error, never silently mapped
    expect(() => toSideConfig(rsi, 'buy', vc.buy)).toThrow();
    expect(() => toSideConfig(volume, 'buy', config.buy)).toThrow();
  });
});

describe('practice preview candidate', () => {
  const rsi = rowsEntry('rsi');

  it('applies the sent rows over the draft and keeps the draft tab switches', () => {
    const draft = rowsConfig('rsi');
    draft.sell.enabled = false;
    const rows = structuredClone(draft.buy.rules);
    rows[0]!.period = 9;
    const { candidate, errors } = previewCandidate(rsi, draft, { buy_rows: rows });
    expect(errors).toEqual([]);
    expect((candidate as PracticeRowsConfig).buy.rules[0]!.period).toBe(9);
    expect((candidate as PracticeRowsConfig).sell).toEqual(draft.sell);
    expect(candidate.hold_max_sessions).toBe(draft.hold_max_sessions);
    // the input rows were copied
    rows[0]!.period = 50;
    expect((candidate as PracticeRowsConfig).buy.rules[0]!.period).toBe(9);
  });

  it('reports errors of the sent tab for enabled rows only', () => {
    const draft = rowsConfig('macd');
    const macd = rowsEntry('macd');
    const rows = structuredClone(draft.buy.rules);
    rows[1]!.fast = 1; // macd.zero is disabled: a half-edited disabled row does not block the chart
    expect(previewCandidate(macd, draft, { buy_rows: rows }).errors).toEqual([]);
    rows[0]!.fast = 1; // macd.signal is enabled
    const { errors } = previewCandidate(macd, draft, { buy_rows: rows });
    expect(errors).toEqual([
      {
        path: 'buy.rules.0.fast',
        message: 'Mua · dòng 1: Chu kỳ EMA nhanh phải từ 2 đến 200, số nguyên.',
        side: 'buy',
        row: 1,
      },
    ]);
    // enabling that row makes its error count
    rows[0]!.fast = 12;
    rows[1]!.enabled = true;
    expect(previewCandidate(macd, draft, { buy_rows: rows }).errors).toHaveLength(1);
  });

  it('refuses rows of the wrong shape and params for a row-based indicator', () => {
    const draft = rowsConfig('rsi');
    expect(previewCandidate(rsi, draft, { buy_rows: [] }).errors).toEqual([
      expect.objectContaining({ path: 'buy.rules', side: 'buy' }),
    ]);
    const swapped = structuredClone(draft.buy.rules).reverse();
    expect(previewCandidate(rsi, draft, { sell_rows: swapped }).errors.length).toBeGreaterThan(0);
    expect(previewCandidate(rsi, draft, { buy_params: { period: 14 } }).errors).toEqual([
      expect.objectContaining({ path: 'buy_params', side: 'buy' }),
    ]);
  });

  it('keeps the params preview of Volume and refuses rows there', () => {
    const volume = volumeEntry();
    const draft = volumeConfig();
    const ok = previewCandidate(volume, draft, { buy_params: { lookback: 30, mult: 1.5 } });
    expect(ok.errors).toEqual([]);
    expect((ok.candidate as PracticeParamsConfig).buy.params).toEqual({ lookback: 30, mult: 1.5 });
    expect((ok.candidate as PracticeParamsConfig).sell.params).toEqual({ lookback: 20, mult: 1 });
    const bad = previewCandidate(volume, draft, { sell_params: { lookback: 3, mult: 1 } });
    expect(bad.errors.map((error) => error.path)).toEqual(['sell.params.lookback']);
    expect(
      previewCandidate(volume, draft, { buy_rows: rowsConfig('rsi').buy.rules }).errors,
    ).toEqual([expect.objectContaining({ path: 'buy_rows', side: 'buy' })]);
  });
});

describe('outdated unfinished runs', () => {
  it('flags only a run that never finished and is not in the current shape', () => {
    const rsi = rowsEntry('rsi');
    const old = { buy: { enabled: true, params: {}, ops: {} }, sell: {}, hold_max_sessions: 1 };
    expect(isOutdatedUnfinishedRun(rsi, { status: 'computing', config: old })).toBe(true);
    expect(isOutdatedUnfinishedRun(rsi, { status: 'failed', config: old })).toBe(true);
    // a finished run keeps its stored result, whatever shape it has
    expect(isOutdatedUnfinishedRun(rsi, { status: 'succeeded', config: old })).toBe(false);
    for (const status of ['computing', 'failed']) {
      expect(isOutdatedUnfinishedRun(rsi, { status, config: rowsConfig('rsi') })).toBe(false);
    }
    expect(OUTDATED_RUN_ERROR.code).toBe('PRACTICE_CONFIG_OUTDATED');
    expect(OUTDATED_RUN_ERROR.message).toMatch(/định dạng điều kiện cũ/);
  });
});

describe('practice form descriptor (no Premium registry call needed)', () => {
  it('embeds the registry rows and the V3 defaults for the 15 row-based indicators', () => {
    for (const id of ROW_INDICATORS) {
      const entry = rowsEntry(id);
      const form = practiceForm(entry);
      expect(form.model, id).toBe('rows');
      if (form.model !== 'rows') throw new Error('unreachable');
      expect(form.indicator_id).toBe(id);
      expect(form.rows, id).toEqual(entry.rows);
      expect(form.defaults, id).toEqual(defaultPracticeConfig(entry));
      // a copy: editing the descriptor never touches the shared (frozen) registry
      expect(form.rows).not.toBe(entry.rows);
      form.rows[0]!.sentence = 'changed';
      expect(entry.rows[0]!.sentence).not.toBe('changed');
    }
    const rsi = practiceForm(rowsEntry('rsi'));
    if (rsi.model !== 'rows') throw new Error('unreachable');
    expect(rsi.rows.map((row) => [row.id, row.sentence])).toEqual([
      ['rsi.level', 'RSI {period} {op} {threshold}'],
      ['rsi.trend', 'RSI {period} xu hướng {dir}'],
    ]);
    expect(rsi.rows[0]!.fields.map((field) => field.key)).toEqual(['period', 'op', 'threshold']);
    expect(rsi.defaults.buy.rules[0]).toEqual({
      id: 'rsi.level',
      enabled: true,
      period: 14,
      op: '<',
      threshold: 30,
    });
  });

  it('exposes Volume with effective per-side domains, rule templates and the registry defaults', () => {
    const volume = practiceForm(volumeEntry());
    expect(volume.model).toBe('legacy_params');
    if (volume.model !== 'legacy_params') throw new Error('unreachable');
    const field = (side: Side, key: string) =>
      volume[side].fields.find((item) => item.key === key)!;
    expect([field('buy', 'lookback').min, field('buy', 'lookback').max]).toEqual([5, 100]);
    expect([field('sell', 'mult').min, field('sell', 'mult').max]).toEqual([0.5, 3]);
    expect(volume.buy.rules.map((r) => [r.rule_id, r.default_op, r.allowed_ops])).toEqual([
      ['r1', '>', ['>', '<']],
      ['r2', '>', ['>', '<']],
    ]);
    expect(volume.sell.rules[0]).toMatchObject({ default_op: '<', kind: 'compare' });
    expect(volume.cross_fields).toEqual([]);
    expect(volume.defaults).toEqual(defaultPracticeConfig(volumeEntry()));
    for (const side of SIDES) {
      expect(volume[side].fields.length).toBeGreaterThan(0);
      expect(volume[side].rules.length).toBeGreaterThan(0);
    }
  });
});

describe('practice set definition', () => {
  const set = loadPracticeSet();

  it('is the owner-pending opaque mini-set-01 set of 30 distinct symbols', () => {
    expect(set.set_version).toBe('mini-set-01');
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

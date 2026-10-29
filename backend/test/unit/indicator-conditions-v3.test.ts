import { describe, expect, it } from 'vitest';
import {
  CONDITION_INDICATOR_IDS,
  CONDITION_ROW_IDS,
  RULE_VERSION,
  SCHEMA_VERSION,
  calc,
  canonicalJson,
  createSeriesCache,
  defaultConfig,
  defaultConfigV4,
  defaultRows,
  evaluateIndicatorSide,
  evaluateRow,
  evaluateRuleWithEvidence,
  isCurrentFormat,
  isRowsEntry,
  loadTechnicalRegistry,
  renderRowSentence,
  resetToCurrentFormat,
  sideSignals,
  sideSignalsWithEvidence,
  validateConfig,
  validateSideRows,
  type Bar,
  type ConditionRow,
  type RowSideConfig,
  type RowsRegistryEntry,
  type SeriesCache,
  type SeriesMap,
  type SharedConfig,
  type Side,
  type Tri,
} from '../../src/modules/quant/v2/index.js';
import { deepFreeze, reference } from '../fixtures/bot-v2/reference.js';

/**
 * SPEC V3 (IQX_CHI_BAO_SPEC.md) acceptance for the shared definitions, evaluator and validator:
 * §3 rows and defaults (content of IQX_CHI_BAO_MAU.html), §2 operators, §4 messages, §7.2 cases,
 * one true / false / NO_SIGNAL case per row of the 15 indicators and no look-ahead.
 */

const registry = loadTechnicalRegistry();
const rowsEntry = (id: string): RowsRegistryEntry => {
  const entry = registry.find((item) => item.id === id);
  if (!entry || !isRowsEntry(entry)) throw new Error(id);
  return entry;
};
const indicatorOfRow = (rowId: string): string => rowId.slice(0, rowId.indexOf('.'));

type Series = Array<number | null>;

/** A cache that serves fixed series per indicator + params, failing on any other request. */
function stubCache(
  table: Record<string, SeriesMap>,
  close: Series = [],
): SeriesCache & {
  requested: string[];
} {
  const requested: string[] = [];
  return {
    bars: [],
    requested,
    series(id, params) {
      const key = `${id}:${canonicalJson(params)}`;
      requested.push(key);
      const found = table[key];
      if (!found) throw new Error(`unexpected series ${key}`);
      return found;
    },
    close: () => close,
  };
}
const key = (id: string, params: Record<string, number>) => `${id}:${canonicalJson(params)}`;

/** Default row of a tab with overrides (registry defaults are the SPEC V3 §3 defaults). */
function row(
  rowId: string,
  side: Side = 'buy',
  overrides: Record<string, unknown> = {},
): ConditionRow {
  const found = defaultRows(rowsEntry(indicatorOfRow(rowId)), side).find((r) => r.id === rowId);
  if (!found) throw new Error(rowId);
  return { ...found, ...overrides } as ConditionRow;
}

const result = (r: ConditionRow, cache: SeriesCache, i: number): Tri =>
  evaluateRow(r, cache, i).result;

/** Valid OHLCV bar with a date that increases with `i`. */
const ohlc = (i: number, high: number, low: number, close: number, volume = 100): Bar => ({
  date: `2024-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  open: close,
  high,
  low,
  close,
  volume,
});
const closes = (values: number[]): Bar[] => values.map((c, i) => ohlc(i, c + 1, c - 1, c));

const synthetic = deepFreeze(reference.syntheticBars(320));

describe('SPEC V3 §3 definitions (registry v4 = IQX_CHI_BAO_MAU.html)', () => {
  const SPEC_ORDER = [
    'ma',
    'ema',
    'ma_cross',
    'rsi',
    'macd',
    'stochastic',
    'cci',
    'mfi',
    'roc',
    'williams_r',
    'bollinger',
    'donchian',
    'dmi',
    'obv',
    'cmf',
  ];

  it('has 15 row-based indicators with 3·3·1·2·3·2·1·1·1·1·3·1·2·2·1 rows (27) and stable ids', () => {
    expect([...CONDITION_INDICATOR_IDS].sort()).toEqual([...SPEC_ORDER].sort());
    expect(SPEC_ORDER.map((id) => rowsEntry(id).rows.length)).toEqual([
      3, 3, 1, 2, 3, 2, 1, 1, 1, 1, 3, 1, 2, 2, 1,
    ]);
    const ids = SPEC_ORDER.flatMap((id) => rowsEntry(id).rows.map((r) => r.id));
    expect(ids).toHaveLength(27);
    expect(ids).toEqual(
      SPEC_ORDER.flatMap((id) => [...CONDITION_ROW_IDS[id as keyof typeof CONDITION_ROW_IDS]]),
    );
    expect(registry.find((e) => e.id === 'volume')?.model).toBe('legacy_params');
    for (const entry of registry) expect(entry.rule_version).toBe(RULE_VERSION);
    expect(RULE_VERSION).toBe('iqx-rules-4.0');
    expect(SCHEMA_VERSION).toBe('3.0');
  });

  it('renders every default row exactly like the sample HTML (Mua / Bán) with its default switch', () => {
    const golden: Record<string, [string, string, boolean]> = {
      'ma.price_cross': ['Giá cắt lên SMA 20', 'Giá cắt xuống SMA 20', true],
      'ma.ma_cross': ['SMA 10 cắt lên SMA 20', 'SMA 10 cắt xuống SMA 20', false],
      'ma.trend': ['SMA 20 xu hướng lên', 'SMA 20 xu hướng xuống', false],
      'ema.price_cross': ['Giá cắt lên EMA 20', 'Giá cắt xuống EMA 20', true],
      'ema.ma_cross': ['EMA 10 cắt lên EMA 20', 'EMA 10 cắt xuống EMA 20', false],
      'ema.trend': ['EMA 20 xu hướng lên', 'EMA 20 xu hướng xuống', false],
      'ma_cross.cross': ['SMA 20 cắt lên SMA 50', 'SMA 20 cắt xuống SMA 50', true],
      'rsi.level': ['RSI 14 < 30', 'RSI 14 > 70', true],
      'rsi.trend': ['RSI 14 xu hướng lên', 'RSI 14 xu hướng xuống', true],
      'macd.signal': ['MACD 12 / 26 cắt lên Signal 9', 'MACD 12 / 26 cắt xuống Signal 9', true],
      'macd.zero': ['MACD 12 / 26 > 0', 'MACD 12 / 26 < 0', false],
      'macd.hist': [
        'Histogram MACD 12 / 26 / 9 tăng so với phiên trước',
        'Histogram MACD 12 / 26 / 9 giảm so với phiên trước',
        false,
      ],
      'stochastic.level': ['%K 14 làm mượt 3 < 20', '%K 14 làm mượt 3 > 80', true],
      'stochastic.kd_cross': [
        '%K 14 làm mượt 3 cắt lên %D 3',
        '%K 14 làm mượt 3 cắt xuống %D 3',
        true,
      ],
      'cci.cross': ['CCI 20 cắt lên -100', 'CCI 20 cắt xuống 100', true],
      'mfi.cross': ['MFI 14 cắt lên 20', 'MFI 14 cắt xuống 80', true],
      'roc.cross': ['ROC 20 cắt lên 5 %', 'ROC 20 cắt xuống -5 %', true],
      'williams_r.cross': ['Williams %R 14 cắt lên -80', 'Williams %R 14 cắt xuống -20', true],
      'bollinger.price_action': [
        'Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2',
        'Giá đóng cửa quay vào dải từ trên Bollinger 20 hệ số 2',
        true,
      ],
      'bollinger.price_dir': [
        'Giá đóng cửa tăng so với phiên trước',
        'Giá đóng cửa giảm so với phiên trước',
        true,
      ],
      'bollinger.width': [
        'Độ rộng Bollinger 20 hệ số 2 thu hẹp',
        'Độ rộng Bollinger 20 hệ số 2 mở rộng',
        true,
      ],
      'donchian.break': [
        'Giá đóng cửa > dải trên Donchian 20',
        'Giá đóng cửa < dải dưới Donchian 20',
        true,
      ],
      'dmi.di': ['DMI 14 : +DI cắt lên −DI', 'DMI 14 : +DI cắt xuống −DI', true],
      'dmi.adx': ['ADX 14 > 25', 'ADX 14 > 25', false],
      'obv.sma': ['OBV cắt lên SMA 20 của OBV', 'OBV cắt xuống SMA 20 của OBV', true],
      'obv.breakout': ['OBV vượt đỉnh 20 phiên', 'OBV phá đáy 20 phiên', false],
      'cmf.cross': ['CMF 20 cắt lên 0', 'CMF 20 cắt xuống 0', true],
    };
    const seen: string[] = [];
    for (const entry of registry) {
      if (!isRowsEntry(entry)) continue;
      for (const definition of entry.rows) {
        const [buy, sell, on] = golden[definition.id]!;
        expect(renderRowSentence(definition, definition.buy), definition.id).toBe(buy);
        expect(renderRowSentence(definition, definition.sell), definition.id).toBe(sell);
        expect(definition.default_enabled, definition.id).toBe(on);
        seen.push(definition.id);
      }
    }
    expect(seen.sort()).toEqual(Object.keys(golden).sort());
    expect(Object.values(golden).filter(([, , on]) => on)).toHaveLength(19);
  });

  it('offers exactly the SPEC V3 §7.1.4 operator sets', () => {
    const ops = (rowId: string, fieldKey = 'op') => {
      const definition = rowsEntry(indicatorOfRow(rowId)).rows.find((r) => r.id === rowId)!;
      const field = definition.fields.find((f) => f.key === fieldKey)!;
      if (field.type !== 'enum') throw new Error(rowId);
      return field.options.map((o) => [o.value, o.label]);
    };
    const updown = [
      ['cross_up', 'lên'],
      ['cross_down', 'xuống'],
    ];
    const cross = [
      ['cross_up', 'cắt lên'],
      ['cross_down', 'cắt xuống'],
    ];
    const compare = [
      ['>', '>'],
      ['<', '<'],
    ];
    const all = [...cross, ...compare];
    for (const id of [
      'ma.price_cross',
      'ma.ma_cross',
      'ema.price_cross',
      'ema.ma_cross',
      'ma_cross.cross',
    ])
      expect(ops(id), id).toEqual(updown);
    for (const id of ['rsi.level', 'stochastic.level', 'macd.zero', 'donchian.break', 'dmi.adx'])
      expect(ops(id), id).toEqual(compare);
    for (const id of [
      'stochastic.kd_cross',
      'cci.cross',
      'mfi.cross',
      'roc.cross',
      'williams_r.cross',
      'cmf.cross',
    ])
      expect(ops(id), id).toEqual(cross);
    for (const id of ['macd.signal', 'dmi.di', 'obv.sma']) expect(ops(id), id).toEqual(all);
    expect(ops('rsi.trend', 'dir')).toEqual([
      ['up', 'lên'],
      ['down', 'xuống'],
    ]);
    expect(ops('ma.trend', 'dir')).toEqual([
      ['up', 'lên'],
      ['down', 'xuống'],
    ]);
    expect(ops('macd.hist', 'dir')).toEqual([
      ['up', 'tăng'],
      ['down', 'giảm'],
    ]);
    expect(ops('bollinger.price_dir', 'dir')).toEqual([
      ['up', 'tăng'],
      ['down', 'giảm'],
    ]);
    expect(ops('bollinger.width', 'dir')).toEqual([
      ['widen', 'mở rộng'],
      ['narrow', 'thu hẹp'],
    ]);
    expect(ops('donchian.break', 'band')).toEqual([
      ['upper', 'trên'],
      ['lower', 'dưới'],
    ]);
    expect(ops('obv.breakout', 'action')).toEqual([
      ['break_high', 'vượt đỉnh'],
      ['break_low', 'phá đáy'],
    ]);
    expect(ops('bollinger.price_action', 'action').map(([, label]) => label)).toEqual([
      'quay vào dải từ dưới',
      'quay vào dải từ trên',
      'vượt dải trên',
      'phá dải dưới',
      'cắt lên dải giữa',
      'cắt xuống dải giữa',
    ]);
    // RSI row 2 is the trend row; the old "RSI vs previous session" row is gone.
    expect(rowsEntry('rsi').rows.map((r) => r.id)).toEqual(['rsi.level', 'rsi.trend']);
    expect(rowsEntry('dmi').rows.some((r) => r.sentence.includes('xu hướng'))).toBe(false);
  });

  it('puts every period and threshold inside its row (no side-level params) with the spec domains', () => {
    const config = defaultConfigV4();
    for (const id of CONDITION_INDICATOR_IDS) {
      for (const side of ['buy', 'sell'] as const) {
        expect(Object.keys(config.indicators[id]![side]).sort(), `${id}.${side}`).toEqual([
          'enabled',
          'rules',
        ]);
      }
    }
    const field = (rowId: string, fieldKey: string) =>
      rowsEntry(indicatorOfRow(rowId))
        .rows.find((r) => r.id === rowId)!
        .fields.find((f) => f.key === fieldKey)!;
    const PRESETS = [5, 10, 20, 50, 100, 200];
    for (const [rowId, keys] of [
      ['ma.price_cross', ['period']],
      ['ma.ma_cross', ['fast', 'slow']],
      ['ma.trend', ['period']],
      ['ma_cross.cross', ['fast', 'slow']],
    ] as const)
      for (const k of keys)
        expect(field(rowId, k)).toMatchObject({ type: 'integer', options: PRESETS });
    expect(field('ema.price_cross', 'period')).toMatchObject({
      type: 'integer',
      min: 2,
      max: 200,
      step: 1,
    });
    expect(field('ema.price_cross', 'period')).not.toHaveProperty('options');
    expect(field('rsi.level', 'threshold')).toMatchObject({ type: 'integer', min: 0, max: 100 });
    expect(field('stochastic.level', 'smooth')).toMatchObject({ type: 'integer', min: 1, max: 10 });
    expect(field('stochastic.kd_cross', 'd')).toMatchObject({ type: 'integer', min: 1, max: 20 });
    expect(field('cci.cross', 'threshold')).toMatchObject({ type: 'integer', min: -300, max: 300 });
    expect(field('roc.cross', 'period')).toMatchObject({ type: 'integer', min: 2, max: 252 });
    expect(field('roc.cross', 'threshold')).toMatchObject({
      type: 'number',
      min: -100,
      max: 10000,
      step: 0.1,
    });
    expect(field('williams_r.cross', 'threshold')).toMatchObject({
      type: 'integer',
      min: -100,
      max: 0,
    });
    expect(field('bollinger.price_action', 'mult')).toMatchObject({
      type: 'number',
      min: 1,
      max: 3.5,
      step: 0.1,
    });
    expect(field('donchian.break', 'period')).toMatchObject({ type: 'integer', min: 2, max: 252 });
    expect(field('dmi.adx', 'threshold')).toMatchObject({
      type: 'number',
      min: 0,
      max: 100,
      step: 0.1,
    });
    expect(field('obv.breakout', 'period')).toMatchObject({ type: 'integer', min: 2, max: 252 });
    expect(field('cmf.cross', 'threshold')).toMatchObject({
      type: 'number',
      min: -1,
      max: 1,
      step: 0.01,
    });
    const fastSlow = registry
      .flatMap((e) => (isRowsEntry(e) ? e.rows : []))
      .filter((r) => r.constraints.length);
    expect(fastSlow.map((r) => r.id)).toEqual([
      'macd.signal',
      'macd.zero',
      'macd.hist',
      'ma.ma_cross',
      'ema.ma_cross',
      'ma_cross.cross',
    ]);
  });

  it('defaults: master and both tabs OFF, rows at the §3 defaults, valid, and a fresh copy each time', () => {
    const config = defaultConfig();
    expect(config).toEqual(defaultConfigV4());
    expect(validateConfig(config)).toEqual([]);
    expect(isCurrentFormat(config)).toBe(true);
    for (const item of Object.values(config.indicators)) {
      expect([item.master_enabled, item.buy.enabled, item.sell.enabled]).toEqual([
        false,
        false,
        false,
      ]);
    }
    expect(config.indicators.rsi!.buy.rules).toEqual([
      { id: 'rsi.level', enabled: true, period: 14, op: '<', threshold: 30 },
      { id: 'rsi.trend', enabled: true, period: 14, dir: 'up' },
    ]);
    expect(config.indicators.dmi!.sell.rules).toEqual([
      { id: 'dmi.di', enabled: true, period: 14, op: 'cross_down' },
      { id: 'dmi.adx', enabled: false, period: 14, op: '>', threshold: 25 },
    ]);
    (config.indicators.rsi!.buy as RowSideConfig).rules[0]!.period = 9;
    expect((defaultConfig().indicators.rsi!.buy as RowSideConfig).rules[0]!.period).toBe(14);
  });
});

describe('SPEC V3 §2 operators and §7.2 cases', () => {
  it('cross up a threshold: -130 → -85 over -100 is true; -90 → -70 is false', () => {
    const cci = key('cci', { period: 20 });
    expect(result(row('cci.cross'), stubCache({ [cci]: { value: [-130, -85] } }), 1)).toBe(true);
    expect(result(row('cci.cross'), stubCache({ [cci]: { value: [-90, -70] } }), 1)).toBe(false);
  });

  it('equality: prev 0 / Y 0 then 1 / Y 0 crosses up; 0 / 0 then 0 / 0 does not', () => {
    const macd = key('macd', { fast: 12, slow: 26, signal: 9 });
    const r = row('macd.signal');
    expect(result(r, stubCache({ [macd]: { value: [0, 1], signal: [0, 0] } }), 1)).toBe(true);
    expect(result(r, stubCache({ [macd]: { value: [0, 0], signal: [0, 0] } }), 1)).toBe(false);
    // A threshold equal at T is not a cross either (CMF 0).
    const cmf = key('cmf', { period: 20 });
    expect(result(row('cmf.cross'), stubCache({ [cmf]: { value: [-0.03, 0] } }), 1)).toBe(false);
  });

  it('dynamic lines use their own value on each bar (never Y[t] against X[t-1])', () => {
    // X: 10 → 12; Y: 11 → 13. X[t-1] <= Y[t-1] but X[t] < Y[t]: no cross. With Y[t] against X[t-1]
    // (12 vs 11) a wrong engine would see one.
    const macd = key('macd', { fast: 12, slow: 26, signal: 9 });
    expect(
      result(row('macd.signal'), stubCache({ [macd]: { value: [10, 12], signal: [11, 13] } }), 1),
    ).toBe(false);
    // X: 10 → 12; Y: 9 → 11.5: X was already above, so no cross up even though X[t] > Y[t].
    expect(
      result(row('macd.signal'), stubCache({ [macd]: { value: [10, 12], signal: [9, 11.5] } }), 1),
    ).toBe(false);
    const evidence = evaluateRow(
      row('macd.signal'),
      stubCache({ [macd]: { value: [10, 12], signal: [11, 11.5] } }),
      1,
    );
    expect(evidence).toMatchObject({
      result: true,
      lhs: 12,
      rhs: 11.5,
      previous_lhs: 10,
      previous_rhs: 11,
      op: 'cross_up',
    });
  });

  it('MFI cross up 20: 15 → 23 true, 23 → 25 false', () => {
    const mfi = key('mfi', { period: 14 });
    expect(result(row('mfi.cross'), stubCache({ [mfi]: { value: [15, 23] } }), 1)).toBe(true);
    expect(result(row('mfi.cross'), stubCache({ [mfi]: { value: [23, 25] } }), 1)).toBe(false);
  });

  it('CMF cross up 0: -0.03 → +0.02 true, +0.01 → +0.06 false', () => {
    const cmf = key('cmf', { period: 20 });
    expect(result(row('cmf.cross'), stubCache({ [cmf]: { value: [-0.03, 0.02] } }), 1)).toBe(true);
    expect(result(row('cmf.cross'), stubCache({ [cmf]: { value: [0.01, 0.06] } }), 1)).toBe(false);
  });

  it('ROC cross down -5 (percent): -3 → -6 true', () => {
    const roc = key('roc', { period: 20 });
    expect(result(row('roc.cross', 'sell'), stubCache({ [roc]: { value: [-3, -6] } }), 1)).toBe(
      true,
    );
  });

  it('Williams %R cross up -80: -85 → -75 true', () => {
    const w = key('williams_r', { period: 14 });
    expect(result(row('williams_r.cross'), stubCache({ [w]: { value: [-85, -75] } }), 1)).toBe(
      true,
    );
  });

  it('RSI trend N=14: RSI14[t]=48 vs RSI14[t-14]=41 is up; without RSI14[t-14] it is NO_SIGNAL', () => {
    const value: Series = new Array(15).fill(45);
    value[0] = 41;
    value[14] = 48;
    const rsi = key('rsi', { period: 14 });
    const evidence = evaluateRow(row('rsi.trend'), stubCache({ [rsi]: { value } }), 14);
    expect(evidence).toMatchObject({ result: true, lhs: 48, rhs: 41, op: '>', missing: false });
    expect(result(row('rsi.trend', 'sell'), stubCache({ [rsi]: { value } }), 14)).toBe(false);
    const missing = [...value];
    missing[0] = null;
    const noSignal = evaluateRow(row('rsi.trend'), stubCache({ [rsi]: { value: missing } }), 14);
    expect(noSignal).toMatchObject({ result: null, missing: true });
    // Fewer than N earlier bars: X[t-N] does not exist.
    expect(result(row('rsi.trend'), stubCache({ [rsi]: { value } }), 13)).toBeNull();
  });

  it('two RSI rows with different periods compute independently and are AND-combined', () => {
    const rsi14 = key('rsi', { period: 14 });
    const rsi9 = key('rsi', { period: 9 });
    const v14: Series = new Array(10).fill(25);
    const v9: Series = new Array(10).fill(50);
    v9[0] = 40;
    const cache = stubCache({ [rsi14]: { value: v14 }, [rsi9]: { value: v9 } });
    const side: RowSideConfig = {
      enabled: true,
      rules: [row('rsi.level'), row('rsi.trend', 'buy', { period: 9 })],
    };
    const evaluation = evaluateIndicatorSide('rsi', side, cache, 9);
    expect(evaluation).toMatchObject({ status: 'ok', result: true });
    expect(evaluation.rows.map((r) => [r.id, r.lhs, r.rhs])).toEqual([
      ['rsi.level', 25, 30],
      ['rsi.trend', 50, 40],
    ]);
    expect(new Set(cache.requested)).toEqual(new Set([rsi14, rsi9]));
    // Real series: row 2's RSI 9 is not row 1's RSI 14.
    const real = createSeriesCache(synthetic);
    const at = 200;
    const rows = evaluateIndicatorSide('rsi', side, real, at).rows;
    expect(rows[0]!.lhs).toBe(calc('rsi', { period: 14 }, synthetic).value![at]);
    expect(rows[1]!.lhs).toBe(calc('rsi', { period: 9 }, synthetic).value![at]);
    expect(rows[1]!.rhs).toBe(calc('rsi', { period: 9 }, synthetic).value![at - 9]);
  });

  it('SMA trend N=50 compares SMA50[t] with SMA50[t-50]', () => {
    const sma50 = calc('ma', { period: 50 }, synthetic).value!;
    const cache = createSeriesCache(synthetic);
    const r = row('ma.trend', 'buy', { period: 50 });
    for (const t of [99, 150, 260]) {
      const evidence = evaluateRow(r, cache, t);
      expect(evidence.lhs).toBe(sma50[t]);
      expect(evidence.rhs).toBe(sma50[t - 50]);
      expect(evidence.result).toBe(sma50[t]! > sma50[t - 50]!);
    }
    expect(evaluateRow(r, cache, 98).result).toBeNull(); // SMA50 first exists at 49; 98 - 50 = 48
  });

  it('Stochastic Mua (both rows on): Kprev 15, Dprev 17, K 19, D 18 → true; K 23 → false (row 1)', () => {
    const level = key('stochastic', { k: 14, smooth: 3, d: 3 });
    const side: RowSideConfig = {
      enabled: true,
      rules: [row('stochastic.level'), row('stochastic.kd_cross')],
    };
    const yes = evaluateIndicatorSide(
      'stochastic',
      side,
      stubCache({ [level]: { value: [15, 19], signal: [17, 18] } }),
      1,
    );
    expect(yes).toMatchObject({ status: 'ok', result: true });
    const no = evaluateIndicatorSide(
      'stochastic',
      side,
      stubCache({ [level]: { value: [15, 23], signal: [17, 18] } }),
      1,
    );
    expect(no.result).toBe(false);
    expect(no.rows.map((r) => r.result)).toEqual([false, true]);
  });

  it('DMI Mua: +DI 18 → 26, −DI 24 → 22, ADX 21: true with the ADX row off, false with it on', () => {
    const dmi = key('dmi', { period: 14 });
    const cache = stubCache({ [dmi]: { plus: [18, 26], minus: [24, 22], adx: [20, 21] } });
    const off: RowSideConfig = { enabled: true, rules: [row('dmi.di'), row('dmi.adx')] };
    expect(evaluateIndicatorSide('dmi', off, cache, 1)).toMatchObject({
      status: 'ok',
      result: true,
    });
    const on: RowSideConfig = {
      enabled: true,
      rules: [row('dmi.di'), row('dmi.adx', 'buy', { enabled: true })],
    };
    expect(evaluateIndicatorSide('dmi', on, cache, 1).result).toBe(false);
  });

  it('Bollinger width: 0.10 → 0.09 narrows, 0.08 → 0.09 widens; Middle 0 is NO_SIGNAL', () => {
    const bb = key('bollinger', { period: 20, k: 2 });
    const bands = (widths: number[], middle = 1): SeriesMap => ({
      middle: widths.map(() => middle),
      upper: widths.map((w) => middle + w / 2),
      lower: widths.map((w) => middle - w / 2),
    });
    const narrow = row('bollinger.width'); // Mua default: thu hẹp
    const widen = row('bollinger.width', 'sell'); // Bán default: mở rộng
    expect(result(narrow, stubCache({ [bb]: bands([0.1, 0.09]) }), 1)).toBe(true);
    expect(result(widen, stubCache({ [bb]: bands([0.1, 0.09]) }), 1)).toBe(false);
    expect(result(widen, stubCache({ [bb]: bands([0.08, 0.09]) }), 1)).toBe(true);
    expect(result(narrow, stubCache({ [bb]: bands([0.08, 0.09]) }), 1)).toBe(false);
    const widened = evaluateRow(widen, stubCache({ [bb]: bands([0.08, 0.09]) }), 1);
    expect(widened.lhs).toBeCloseTo(0.09, 12);
    expect(widened.rhs).toBeCloseTo(0.08, 12);
    expect(evaluateRow(widen, stubCache({ [bb]: bands([0.08, 0.09], 0) }), 1)).toMatchObject({
      result: null,
      missing: true,
    });
  });

  it('Donchian 20: max High of the 20 previous sessions 100, Close[T] 103, High[T] 105 → true', () => {
    const data: Bar[] = Array.from({ length: 20 }, (_, i) => ohlc(i, i === 7 ? 100 : 99, 95, 97));
    data.push(ohlc(20, 105, 101, 103));
    const evidence = evaluateRow(row('donchian.break'), createSeriesCache(data), 20);
    expect(evidence).toMatchObject({ result: true, lhs: 103, rhs: 100 });
    // Bar T is excluded from the extreme: High[T] = 105 never becomes the band.
    expect(
      evaluateRow(row('donchian.break', 'buy', { period: 21 }), createSeriesCache(data), 20).result,
    ).toBeNull();
  });

  it('no enabled row / tab off / indicator off → NO_SIGNAL (result null)', () => {
    const cache = createSeriesCache(synthetic);
    const side = defaultConfigV4().indicators.rsi!.buy as RowSideConfig;
    const on = { ...side, enabled: true };
    expect(evaluateIndicatorSide('rsi', on, cache, 100).status).toBe('ok');
    expect(
      evaluateIndicatorSide(
        'rsi',
        { ...on, rules: on.rules.map((r) => ({ ...r, enabled: false })) },
        cache,
        100,
      ),
    ).toEqual({
      indicator: 'rsi',
      status: 'no_signal',
      reason: 'no_rows',
      result: null,
      rows: [],
    });
    expect(evaluateIndicatorSide('rsi', { ...on, enabled: false }, cache, 100)).toMatchObject({
      status: 'no_signal',
      reason: 'side_off',
      result: null,
    });
    expect(evaluateIndicatorSide('rsi', on, cache, 100, false)).toMatchObject({
      status: 'no_signal',
      reason: 'indicator_off',
      result: null,
    });
    expect(evaluateIndicatorSide('rsi', undefined, cache, 100)).toMatchObject({
      status: 'no_signal',
      reason: 'side_off',
    });
  });

  it('Kleene AND of the enabled rows: any false → false, else any unknown → unknown', () => {
    const rsi = key('rsi', { period: 14 });
    const value: Series = new Array(15).fill(20);
    value[0] = null; // trend row unknown at 14
    const side: RowSideConfig = { enabled: true, rules: [row('rsi.level'), row('rsi.trend')] };
    expect(
      evaluateIndicatorSide('rsi', side, stubCache({ [rsi]: { value } }), 14).result,
    ).toBeNull();
    value[14] = 35; // level row false (35 < 30 is false)
    expect(evaluateIndicatorSide('rsi', side, stubCache({ [rsi]: { value } }), 14).result).toBe(
      false,
    );
  });
});

/** One true / false / NO_SIGNAL case for every row of the 15 indicators (buy defaults unless noted). */
describe('SPEC V3 §3 every row: true, false and NO_SIGNAL', () => {
  type Case = {
    row: ConditionRow;
    table: Record<string, SeriesMap>;
    close?: Series;
    i: number;
  };
  const cases: Record<string, { yes: Case; no: Case; missing: Case }> = {};
  const add = (id: string, yes: Case, no: Case, missing: Case) =>
    (cases[id] = { yes, no, missing });
  const ma20 = key('ma', { period: 20 });
  const ma10 = key('ma', { period: 10 });
  const ema20 = key('ema', { period: 20 });
  const ema10 = key('ema', { period: 10 });

  add(
    'ma.price_cross',
    {
      row: row('ma.price_cross'),
      table: { [ma20]: { value: [100, 100] } },
      close: [99, 101],
      i: 1,
    },
    {
      row: row('ma.price_cross'),
      table: { [ma20]: { value: [100, 100] } },
      close: [101, 102],
      i: 1,
    },
    {
      row: row('ma.price_cross'),
      table: { [ma20]: { value: [null, 100] } },
      close: [99, 101],
      i: 1,
    },
  );
  add(
    'ma.ma_cross',
    {
      row: row('ma.ma_cross'),
      table: { [ma10]: { value: [99, 101] }, [ma20]: { value: [100, 100] } },
      i: 1,
    },
    {
      row: row('ma.ma_cross', 'sell'),
      table: { [ma10]: { value: [99, 101] }, [ma20]: { value: [100, 100] } },
      i: 1,
    },
    {
      row: row('ma.ma_cross'),
      table: { [ma10]: { value: [99, 101] }, [ma20]: { value: [null, 100] } },
      i: 1,
    },
  );
  add(
    'ma.trend',
    {
      row: row('ma.trend'),
      table: { [ma20]: { value: [...new Array(20).fill(100), 101] } },
      i: 20,
    },
    {
      row: row('ma.trend', 'sell'),
      table: { [ma20]: { value: [...new Array(20).fill(100), 101] } },
      i: 20,
    },
    {
      row: row('ma.trend'),
      table: { [ma20]: { value: [...new Array(20).fill(100), 101] } },
      i: 19,
    },
  );
  add(
    'ema.price_cross',
    {
      row: row('ema.price_cross', 'sell'),
      table: { [ema20]: { value: [100, 100] } },
      close: [100, 99],
      i: 1,
    },
    {
      row: row('ema.price_cross', 'sell'),
      table: { [ema20]: { value: [100, 100] } },
      close: [99, 98],
      i: 1,
    },
    {
      row: row('ema.price_cross'),
      table: { [ema20]: { value: [100, 100] } },
      close: [null, 101],
      i: 1,
    },
  );
  add(
    'ema.ma_cross',
    {
      row: row('ema.ma_cross'),
      table: { [ema10]: { value: [100, 101] }, [ema20]: { value: [100, 100.5] } },
      i: 1,
    },
    {
      row: row('ema.ma_cross'),
      table: { [ema10]: { value: [100, 100] }, [ema20]: { value: [100, 100] } },
      i: 1,
    },
    {
      row: row('ema.ma_cross'),
      table: { [ema10]: { value: [100, 101] }, [ema20]: { value: [100, 100.5] } },
      i: 0,
    },
  );
  add(
    'ema.trend',
    {
      row: row('ema.trend', 'buy', { period: 2 }),
      table: { [key('ema', { period: 2 })]: { value: [5, 9, 6] } },
      i: 2,
    },
    {
      row: row('ema.trend', 'buy', { period: 2 }),
      table: { [key('ema', { period: 2 })]: { value: [6, 9, 6] } },
      i: 2,
    },
    {
      row: row('ema.trend', 'buy', { period: 2 }),
      table: { [key('ema', { period: 2 })]: { value: [null, 9, 6] } },
      i: 2,
    },
  );
  const mc = key('ma_cross', { fast: 20, slow: 50 });
  add(
    'ma_cross.cross',
    { row: row('ma_cross.cross'), table: { [mc]: { fast: [10, 12], slow: [10, 11] } }, i: 1 },
    { row: row('ma_cross.cross'), table: { [mc]: { fast: [12, 13], slow: [10, 11] } }, i: 1 },
    { row: row('ma_cross.cross'), table: { [mc]: { fast: [10, 12], slow: [10, null] } }, i: 1 },
  );
  const rsi = key('rsi', { period: 14 });
  add(
    'rsi.level',
    { row: row('rsi.level'), table: { [rsi]: { value: [29.9] } }, i: 0 },
    { row: row('rsi.level'), table: { [rsi]: { value: [30] } }, i: 0 },
    { row: row('rsi.level'), table: { [rsi]: { value: [null] } }, i: 0 },
  );
  const trendSeries = [...new Array(14).fill(50), 40];
  add(
    'rsi.trend',
    { row: row('rsi.trend', 'sell'), table: { [rsi]: { value: trendSeries } }, i: 14 },
    { row: row('rsi.trend'), table: { [rsi]: { value: trendSeries } }, i: 14 },
    { row: row('rsi.trend'), table: { [rsi]: { value: trendSeries } }, i: 13 },
  );
  const macd = key('macd', { fast: 12, slow: 26, signal: 9 });
  add(
    'macd.signal',
    {
      row: row('macd.signal', 'buy', { op: '>' }),
      table: { [macd]: { value: [0, 2], signal: [1, 1] } },
      i: 1,
    },
    {
      row: row('macd.signal', 'buy', { op: '<' }),
      table: { [macd]: { value: [0, 2], signal: [1, 1] } },
      i: 1,
    },
    { row: row('macd.signal'), table: { [macd]: { value: [0, 2], signal: [null, 1] } }, i: 1 },
  );
  add(
    'macd.zero',
    { row: row('macd.zero'), table: { [macd]: { value: [0.5] } }, i: 0 },
    { row: row('macd.zero'), table: { [macd]: { value: [0] } }, i: 0 },
    { row: row('macd.zero'), table: { [macd]: { value: [null] } }, i: 0 },
  );
  add(
    'macd.hist',
    { row: row('macd.hist'), table: { [macd]: { histogram: [-1, -0.5] } }, i: 1 },
    { row: row('macd.hist', 'sell'), table: { [macd]: { histogram: [-1, -0.5] } }, i: 1 },
    { row: row('macd.hist'), table: { [macd]: { histogram: [null, -0.5] } }, i: 1 },
  );
  const stoch = key('stochastic', { k: 14, smooth: 3, d: 3 });
  add(
    'stochastic.level',
    { row: row('stochastic.level', 'sell'), table: { [stoch]: { value: [85] } }, i: 0 },
    { row: row('stochastic.level', 'sell'), table: { [stoch]: { value: [80] } }, i: 0 },
    { row: row('stochastic.level'), table: { [stoch]: { value: [null] } }, i: 0 },
  );
  add(
    'stochastic.kd_cross',
    {
      row: row('stochastic.kd_cross', 'sell'),
      table: { [stoch]: { value: [50, 40], signal: [45, 45] } },
      i: 1,
    },
    {
      row: row('stochastic.kd_cross', 'sell'),
      table: { [stoch]: { value: [44, 40], signal: [45, 45] } },
      i: 1,
    },
    {
      row: row('stochastic.kd_cross'),
      table: { [stoch]: { value: [50, 40], signal: [45, 45] } },
      i: 0,
    },
  );
  for (const [id, period, yes, no, side] of [
    ['cci.cross', 20, [-101, -99], [-99, -98], 'buy'],
    ['mfi.cross', 14, [81, 79], [79, 75], 'sell'],
    ['roc.cross', 20, [4.9, 5.1], [5, 5], 'buy'],
    ['williams_r.cross', 14, [-19, -21], [-21, -25], 'sell'],
    ['cmf.cross', 20, [0.01, -0.02], [-0.01, -0.02], 'sell'],
  ] as const) {
    const k = key(indicatorOfRow(id), { period });
    add(
      id,
      { row: row(id, side), table: { [k]: { value: [...yes] } }, i: 1 },
      { row: row(id, side), table: { [k]: { value: [...no] } }, i: 1 },
      { row: row(id, side), table: { [k]: { value: [null, yes[1]] } }, i: 1 },
    );
  }
  const bb = key('bollinger', { period: 20, k: 2 });
  const band = { lower: [95, 95], middle: [100, 100], upper: [105, 105] };
  add(
    'bollinger.price_action',
    { row: row('bollinger.price_action'), table: { [bb]: band }, close: [94, 96], i: 1 },
    { row: row('bollinger.price_action'), table: { [bb]: band }, close: [96, 97], i: 1 },
    {
      row: row('bollinger.price_action'),
      table: { [bb]: { ...band, lower: [null, 95] } },
      close: [94, 96],
      i: 1,
    },
  );
  add(
    'bollinger.price_dir',
    { row: row('bollinger.price_dir'), table: {}, close: [10, 11], i: 1 },
    { row: row('bollinger.price_dir'), table: {}, close: [10, 10], i: 1 },
    { row: row('bollinger.price_dir'), table: {}, close: [10, 11], i: 0 },
  );
  add(
    'bollinger.width',
    {
      row: row('bollinger.width'),
      table: { [bb]: { lower: [90, 95], middle: [100, 100], upper: [110, 105] } },
      i: 1,
    },
    {
      row: row('bollinger.width'),
      table: { [bb]: { lower: [95, 90], middle: [100, 100], upper: [105, 110] } },
      i: 1,
    },
    {
      row: row('bollinger.width'),
      table: { [bb]: { lower: [90, 95], middle: [null, 100], upper: [110, 105] } },
      i: 1,
    },
  );
  const don = key('donchian', { period: 20 });
  add(
    'donchian.break',
    {
      row: row('donchian.break', 'buy', { op: '<', band: 'lower' }),
      table: { [don]: { upper: [110], lower: [90] } },
      close: [89],
      i: 0,
    },
    {
      row: row('donchian.break', 'buy', { op: '<', band: 'upper' }),
      table: { [don]: { upper: [110], lower: [90] } },
      close: [111],
      i: 0,
    },
    {
      row: row('donchian.break'),
      table: { [don]: { upper: [null], lower: [90] } },
      close: [111],
      i: 0,
    },
  );
  const dmi = key('dmi', { period: 14 });
  add(
    'dmi.di',
    {
      row: row('dmi.di', 'sell', { op: '<' }),
      table: { [dmi]: { plus: [20], minus: [25] } },
      i: 0,
    },
    { row: row('dmi.di', 'sell'), table: { [dmi]: { plus: [20, 20], minus: [25, 26] } }, i: 1 },
    { row: row('dmi.di'), table: { [dmi]: { plus: [null, 26], minus: [24, 22] } }, i: 1 },
  );
  add(
    'dmi.adx',
    { row: row('dmi.adx', 'buy', { enabled: true }), table: { [dmi]: { adx: [25.1] } }, i: 0 },
    { row: row('dmi.adx', 'buy', { enabled: true }), table: { [dmi]: { adx: [25] } }, i: 0 },
    { row: row('dmi.adx', 'buy', { enabled: true }), table: { [dmi]: { adx: [null] } }, i: 0 },
  );
  const obv = key('obv', { baseline: 20 });
  add(
    'obv.sma',
    { row: row('obv.sma'), table: { [obv]: { value: [100, 300], baseline: [200, 200] } }, i: 1 },
    {
      row: row('obv.sma', 'buy', { op: '<' }),
      table: { [obv]: { value: [100, 300], baseline: [200, 200] } },
      i: 1,
    },
    { row: row('obv.sma'), table: { [obv]: { value: [100, 300], baseline: [200, null] } }, i: 1 },
  );
  const breakoutKey = key('obv', { baseline: 20, breakout_period: 20 });
  add(
    'obv.breakout',
    {
      row: row('obv.breakout', 'sell'),
      table: { [breakoutKey]: { value: [-501], upper: [800], lower: [-500] } },
      i: 0,
    },
    {
      row: row('obv.breakout'),
      table: { [breakoutKey]: { value: [800], upper: [800], lower: [-500] } },
      i: 0,
    },
    {
      row: row('obv.breakout'),
      table: { [breakoutKey]: { value: [900], upper: [null], lower: [-500] } },
      i: 0,
    },
  );

  it('covers all 27 rows', () => {
    expect(Object.keys(cases).sort()).toEqual(Object.values(CONDITION_ROW_IDS).flat().sort());
  });

  for (const rowId of Object.values(CONDITION_ROW_IDS).flat()) {
    it(`${rowId}: true / false / NO_SIGNAL`, () => {
      const { yes, no, missing } = cases[rowId]!;
      const run = (c: Case) => evaluateRow(c.row, stubCache(c.table, c.close), c.i);
      expect(run(yes).result, 'true case').toBe(true);
      expect(run(no).result, 'false case').toBe(false);
      const unknown = run(missing);
      expect(unknown.result, 'missing case').toBeNull();
      expect(unknown.missing).toBe(true);
      expect(run(yes).values).toEqual(
        Object.fromEntries(Object.entries(yes.row).filter(([k]) => k !== 'id' && k !== 'enabled')),
      );
    });
  }

  it('Bollinger: the 6 price actions of §3.11', () => {
    const at = (action: string, close: Series, b: SeriesMap = band) =>
      result(row('bollinger.price_action', 'buy', { action }), stubCache({ [bb]: b }, close), 1);
    expect(at('reenter_lower', [94, 95])).toBe(true); // Lower[t] <= Close[t]
    expect(at('reenter_lower', [95, 96])).toBe(false); // was not below
    expect(at('reenter_upper', [106, 105])).toBe(true);
    expect(at('reenter_upper', [106, 106])).toBe(false); // still outside
    expect(at('break_upper', [105, 106])).toBe(true); // Close[t-1] <= Upper[t-1]
    expect(at('break_upper', [106, 107])).toBe(false);
    expect(at('break_lower', [95, 94])).toBe(true);
    expect(at('break_lower', [96, 95])).toBe(false); // equal to the band is not below
    expect(at('cross_up_middle', [100, 101])).toBe(true);
    expect(at('cross_up_middle', [101, 102])).toBe(false);
    expect(at('cross_down_middle', [100, 99])).toBe(true);
    expect(at('cross_down_middle', [100, 100])).toBe(false);
  });

  it('Donchian: the band choice is independent of the operator', () => {
    const table = { [don]: { upper: [110], lower: [90] } };
    const at = (op: string, b: string, c: number) =>
      result(row('donchian.break', 'buy', { op, band: b }), stubCache(table, [c]), 0);
    expect(at('>', 'upper', 111)).toBe(true);
    expect(at('>', 'lower', 95)).toBe(true);
    expect(at('<', 'upper', 105)).toBe(true);
    expect(at('<', 'lower', 89)).toBe(true);
    expect(at('>', 'upper', 110)).toBe(false);
  });

  it('OBV breakout excludes bar T from the extreme (real series)', () => {
    // OBV rises every bar: the new high is above the max of the N previous OBV values.
    const data = closes([10, 11, 12, 13, 14, 15]);
    const r = row('obv.breakout', 'buy', { period: 3, enabled: true });
    const cache = createSeriesCache(data);
    expect(evaluateRow(r, cache, 2).result).toBeNull();
    expect(evaluateRow(r, cache, 3)).toMatchObject({ result: true, lhs: 300, rhs: 200 });
  });

  it('ROC threshold is in percent (5 means 5%)', () => {
    const data = closes([...new Array(20).fill(100), 104, 106]);
    const r = row('roc.cross', 'buy', { period: 20 });
    const evidence = evaluateRow(r, createSeriesCache(data), 21);
    expect(evidence.lhs).toBeCloseTo(6, 9);
    expect(evidence.previous_lhs).toBeCloseTo(4, 9);
    expect(evidence.result).toBe(true);
  });
});

describe('SPEC V3 §4 validation (server re-checks the form rules)', () => {
  const sideOf = (id: string, side: Side = 'buy'): RowSideConfig =>
    structuredClone(defaultConfigV4().indicators[id]![side]) as RowSideConfig;
  const messages = (id: string, side: Side, value: unknown) =>
    validateSideRows(rowsEntry(id), side, value).map((e) => [e.path, e.message]);

  it('accepts every default tab and the spec round-trip values (-0.05, -100, -80, 5)', () => {
    for (const id of CONDITION_INDICATOR_IDS)
      for (const side of ['buy', 'sell'] as const)
        expect(messages(id, side, sideOf(id, side))).toEqual([]);
    const cmf = sideOf('cmf');
    cmf.rules[0]!.threshold = -0.05;
    expect(messages('cmf', 'buy', cmf)).toEqual([]);
    const roc = sideOf('roc');
    roc.rules[0]!.threshold = 5.1;
    expect(messages('roc', 'buy', roc)).toEqual([]);
  });

  it('range messages: "{Mua|Bán} · dòng {i}: {label} phải từ {min} đến {max}{, số nguyên}."', () => {
    const rsi = sideOf('rsi');
    rsi.rules[1]!.period = 1;
    expect(messages('rsi', 'buy', rsi)).toEqual([
      [
        'indicators.rsi.buy.rules.1.period',
        'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
      ],
    ]);
    rsi.rules[1]!.period = 14.5;
    expect(messages('rsi', 'buy', rsi)[0]![1]).toBe(
      'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
    );
    rsi.rules[1]!.period = '14' as unknown as number;
    expect(messages('rsi', 'buy', rsi)[0]![1]).toBe(
      'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
    );
    delete (rsi.rules[1] as Record<string, unknown>).period;
    expect(messages('rsi', 'buy', rsi)[0]![1]).toBe(
      'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
    );
    const cases: Array<[string, number, string, number, string]> = [
      ['bollinger', 0, 'mult', 4, 'Bán · dòng 1: Hệ số độ lệch chuẩn phải từ 1 đến 3.5.'],
      ['roc', 0, 'threshold', -101, 'Bán · dòng 1: Ngưỡng ROC (%) phải từ -100 đến 10000.'],
      ['cmf', 0, 'threshold', 2, 'Bán · dòng 1: Ngưỡng CMF phải từ -1 đến 1.'],
      ['dmi', 1, 'threshold', 101, 'Bán · dòng 2: Ngưỡng ADX phải từ 0 đến 100.'],
      [
        'williams_r',
        0,
        'threshold',
        1,
        'Bán · dòng 1: Ngưỡng Williams %R phải từ -100 đến 0, số nguyên.',
      ],
      ['cci', 0, 'threshold', -100.5, 'Bán · dòng 1: Ngưỡng CCI phải từ -300 đến 300, số nguyên.'],
      ['stochastic', 1, 'd', 21, 'Bán · dòng 2: Chu kỳ %D phải từ 1 đến 20, số nguyên.'],
      ['stochastic', 0, 'smooth', 0, 'Bán · dòng 1: Làm mượt %K phải từ 1 đến 10, số nguyên.'],
      ['donchian', 0, 'period', 253, 'Bán · dòng 1: Chu kỳ Donchian phải từ 2 đến 252, số nguyên.'],
      ['obv', 1, 'period', 1, 'Bán · dòng 2: Số phiên OBV phải từ 2 đến 252, số nguyên.'],
      ['ema', 0, 'period', 201, 'Bán · dòng 1: Chu kỳ EMA phải từ 2 đến 200, số nguyên.'],
      ['mfi', 0, 'threshold', 101, 'Bán · dòng 1: Ngưỡng MFI phải từ 0 đến 100, số nguyên.'],
    ];
    for (const [id, index, field, value, message] of cases) {
      const side = sideOf(id, 'sell');
      side.rules[index]![field] = value;
      expect(messages(id, 'sell', side), `${id}.${field}`).toEqual([
        [`indicators.${id}.sell.rules.${index}.${field}`, message],
      ]);
    }
  });

  it('preset message for SMA and MA Cross: "… chỉ chọn 5, 10, 20, 50, 100, 200."', () => {
    const ma = sideOf('ma');
    ma.rules[0]!.period = 7;
    expect(messages('ma', 'buy', ma)).toEqual([
      [
        'indicators.ma.buy.rules.0.period',
        'Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.',
      ],
    ]);
    const cross = sideOf('ma_cross', 'sell');
    cross.rules[0]!.slow = 60;
    expect(messages('ma_cross', 'sell', cross)).toEqual([
      [
        'indicators.ma_cross.sell.rules.0.slow',
        'Bán · dòng 1: Chu kỳ SMA chậm chỉ chọn 5, 10, 20, 50, 100, 200.',
      ],
    ]);
    // EMA is a free integer input, not a preset.
    const ema = sideOf('ema');
    ema.rules[0]!.period = 7;
    expect(messages('ema', 'buy', ema)).toEqual([]);
  });

  it('fast < slow on SMA row 2, EMA row 2, MA Cross and every MACD row', () => {
    const fastSlow = 'chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.';
    const ma = sideOf('ma');
    ma.rules[1]!.fast = 20;
    expect(messages('ma', 'buy', ma)).toEqual([
      ['indicators.ma.buy.rules.1.fast', `Mua · dòng 2: ${fastSlow}`],
    ]);
    const ema = sideOf('ema', 'sell');
    ema.rules[1]!.fast = 30;
    expect(messages('ema', 'sell', ema)).toEqual([
      ['indicators.ema.sell.rules.1.fast', `Bán · dòng 2: ${fastSlow}`],
    ]);
    const cross = sideOf('ma_cross');
    cross.rules[0]!.fast = 50;
    expect(messages('ma_cross', 'buy', cross)).toEqual([
      ['indicators.ma_cross.buy.rules.0.fast', `Mua · dòng 1: ${fastSlow}`],
    ]);
    for (const index of [0, 1, 2]) {
      const macd = sideOf('macd');
      macd.rules[index]!.fast = 26;
      expect(messages('macd', 'buy', macd)).toEqual([
        [`indicators.macd.buy.rules.${index}.fast`, `Mua · dòng ${index + 1}: ${fastSlow}`],
      ]);
    }
  });

  it('decimal fields keep enforcing their step (owner decision 5)', () => {
    const bb = sideOf('bollinger');
    bb.rules[0]!.mult = 2.35;
    expect(messages('bollinger', 'buy', bb)).toEqual([
      [
        'indicators.bollinger.buy.rules.0.mult',
        'Mua · dòng 1: Hệ số độ lệch chuẩn phải theo bước 0.1.',
      ],
    ]);
  });

  it('validates both tabs, disabled rows and a disabled tab included, without repairing values', () => {
    const config = defaultConfigV4();
    const rsi = config.indicators.rsi!;
    (rsi.sell as RowSideConfig).rules[1]!.enabled = false;
    (rsi.sell as RowSideConfig).rules[1]!.period = 500;
    (rsi.buy as RowSideConfig).rules[0]!.threshold = 101;
    const frozen = deepFreeze(structuredClone(config));
    expect(validateConfig(frozen).map((e) => [e.path, e.message, e.side, e.row])).toEqual([
      [
        'indicators.rsi.buy.rules.0.threshold',
        'Mua · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên.',
        'buy',
        1,
      ],
      [
        'indicators.rsi.sell.rules.1.period',
        'Bán · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
        'sell',
        2,
      ],
    ]);
  });

  it('rejects unknown keys, unknown enum codes, wrong row ids/count and the old side-level format', () => {
    const cci = sideOf('cci');
    cci.rules[0]!.op = '>';
    expect(messages('cci', 'buy', cci)).toEqual([
      ['indicators.cci.buy.rules.0.op', 'Mua · dòng 1: Hướng giao cắt CCI không hợp lệ.'],
    ]);
    cci.rules[0]!.op = 'cắt lên';
    expect(messages('cci', 'buy', cci)).toHaveLength(1);
    const rsi = sideOf('rsi');
    rsi.rules[0]!.extra = 1;
    expect(messages('rsi', 'buy', rsi)).toEqual([
      ['indicators.rsi.buy.rules.0.extra', 'Mua · dòng 1: trường không hợp lệ extra.'],
    ]);
    const swapped = sideOf('rsi');
    swapped.rules.reverse();
    expect(messages('rsi', 'buy', swapped).map(([path]) => path)).toEqual([
      'indicators.rsi.buy.rules.0.id',
      'indicators.rsi.buy.rules.1.id',
    ]);
    const short = sideOf('rsi');
    short.rules.pop();
    expect(messages('rsi', 'buy', short)).toEqual([
      ['indicators.rsi.buy.rules', 'RSI Mua: sai số dòng điều kiện.'],
    ]);
    const enabled = sideOf('rsi');
    enabled.rules[0]!.enabled = 'yes' as unknown as boolean;
    expect(messages('rsi', 'buy', enabled)).toEqual([
      ['indicators.rsi.buy.rules.0.enabled', 'Mua · dòng 1: trạng thái điều kiện không hợp lệ.'],
    ]);
    // V2 shape: side-level params + r1/r2 rules.
    const v2 = {
      enabled: true,
      params: { period: 14, level: 30 },
      rules: [
        { id: 'r1', op: '<' },
        { id: 'r2', op: '>' },
      ],
    };
    const errors = messages('rsi', 'buy', v2);
    expect(errors[0]).toEqual([
      'indicators.rsi.buy.params',
      'RSI Mua: trường không hợp lệ params.',
    ]);
    expect(errors.length).toBeGreaterThan(1);
  });

  it('validateConfig rejects outdated documents (versions, V2 sides) and keeps the master rule', () => {
    const config = defaultConfigV4();
    expect(validateConfig({ ...config, rule_version: 'iqx-rules-3.0' }).map((e) => e.path)).toEqual(
      ['rule_version'],
    );
    expect(validateConfig({ ...config, schema_version: '2.0' }).map((e) => e.path)).toEqual([
      'schema_version',
    ]);
    const on = structuredClone(config);
    on.indicators.rsi!.master_enabled = true;
    expect(validateConfig(on).map((e) => e.message)).toEqual(['rsi: chưa chọn Mua hoặc Bán.']);
    on.indicators.rsi!.buy.enabled = true;
    expect(validateConfig(on)).toEqual([]);
    expect(validateConfig(on, registry, [])).toEqual([
      { path: 'indicators.rsi.master_enabled', message: 'Chỉ báo chưa mở: rsi.' },
    ]);
  });
});

describe('format detection and the SPEC V3 §6 reset', () => {
  /** A stored V2 (`iqx-rules-3.0`) document: side-level params and r1/r2 rules. */
  const v2Document = () => ({
    schema_version: '2.0',
    revision: 12,
    rule_version: 'iqx-rules-3.0',
    indicators: {
      ...Object.fromEntries(
        CONDITION_INDICATOR_IDS.map((id) => [
          id,
          {
            master_enabled: false,
            buy: {
              enabled: false,
              params: { period: 9 },
              rules: [{ id: 'r1', kind: 'compare', op: '>' }],
            },
            sell: {
              enabled: false,
              params: { period: 9 },
              rules: [{ id: 'r1', kind: 'compare', op: '<' }],
            },
          },
        ]),
      ),
      rsi: {
        master_enabled: true,
        buy: { enabled: true, params: { period: 9, level: 45 }, rules: [] },
        sell: { enabled: false, params: { period: 9, level: 55 }, rules: [] },
      },
      cci: {
        master_enabled: true,
        buy: { enabled: false, params: { period: 9, level: 0 }, rules: [] },
        sell: { enabled: false, params: { period: 9, level: 0 }, rules: [] },
      },
      volume: structuredClone(defaultConfigV4().indicators.volume!),
    },
  });

  it('isCurrentFormat: current documents only (versions + row structure)', () => {
    expect(isCurrentFormat(defaultConfigV4())).toBe(true);
    expect(isCurrentFormat(v2Document())).toBe(false);
    const relabelled = {
      ...v2Document(),
      schema_version: SCHEMA_VERSION,
      rule_version: RULE_VERSION,
    };
    expect(isCurrentFormat(relabelled)).toBe(false);
    expect(isCurrentFormat(null)).toBe(false);
  });

  it('resetToCurrentFormat keeps only the switches, never the old conditions', () => {
    const doc = v2Document();
    doc.indicators.volume.master_enabled = true;
    doc.indicators.volume.buy.enabled = true;
    (doc.indicators.volume.buy as { params: Record<string, number> }).params.lookback = 30;
    const reset = resetToCurrentFormat(deepFreeze(doc));
    expect(isCurrentFormat(reset)).toBe(true);
    expect(validateConfig(reset)).toEqual([]);
    expect(reset.revision).toBe(12);
    const defaults = defaultConfigV4();
    expect(reset.indicators.rsi).toEqual({
      master_enabled: true,
      buy: { ...defaults.indicators.rsi!.buy, enabled: true },
      sell: defaults.indicators.rsi!.sell,
    });
    // Master ON with both tabs OFF becomes master OFF.
    expect(reset.indicators.cci!.master_enabled).toBe(false);
    // Volume is unchanged by V3 and copied verbatim.
    expect(reset.indicators.volume).toEqual(doc.indicators.volume);
    const twice = resetToCurrentFormat(reset);
    expect(canonicalJson(twice)).toBe(canonicalJson(reset));
  });
});

describe('products share one evaluator: combinations unchanged, no look-ahead', () => {
  const enable = (config: SharedConfig, ids: string[]) => {
    for (const id of ids) {
      const item = config.indicators[id]!;
      item.master_enabled = true;
      item.buy.enabled = true;
      item.sell.enabled = true;
    }
    return config;
  };

  it('prefix invariance: evaluating at T with bars[0..T] equals evaluating at T with all bars', () => {
    const config = defaultConfigV4();
    const variants: Array<{ id: string; side: RowSideConfig }> = [];
    for (const id of CONDITION_INDICATOR_IDS) {
      for (const sideName of ['buy', 'sell'] as const) {
        const side = structuredClone(config.indicators[id]![sideName]) as RowSideConfig;
        side.enabled = true;
        side.rules.forEach((r) => (r.enabled = true));
        variants.push({ id, side });
        const fast = structuredClone(side);
        for (const r of fast.rules) {
          if (
            typeof r.period === 'number' &&
            !rowsEntry(id)
              .rows.find((d) => d.id === r.id)!
              .fields.find((f) => f.key === 'period' && f.type !== 'enum' && f.options)
          )
            r.period = 5;
        }
        variants.push({ id, side: fast });
      }
    }
    const full = createSeriesCache(synthetic);
    for (const t of [0, 1, 4, 30, 61, 140, 233, 319]) {
      const prefix = createSeriesCache(synthetic.slice(0, t + 1));
      for (const { id, side } of variants) {
        expect(evaluateIndicatorSide(id, side, prefix, t), `${id} @${t}`).toEqual(
          evaluateIndicatorSide(id, side, full, t),
        );
      }
    }
  });

  it('a cross that happens at T+1 is false at T in every product path', () => {
    const data = closes([...new Array(10).fill(100), 110, 111]);
    const config = enable(defaultConfigV4(), ['ma']);
    const ma = config.indicators.ma!.buy as RowSideConfig;
    ma.rules[0]!.period = 5;
    ma.rules[0]!.enabled = true;
    const T = 9;
    const shared = sideSignals(config, data, 'buy');
    expect(shared[T]).toBe(false);
    expect(shared[T + 1]).toBe(true);
    expect(sideSignals(config, data.slice(0, T + 1), 'buy')[T]).toBe(false);
    expect(sideSignalsWithEvidence(config, data, 'buy')[T]!.result).toBe(false);
    expect(sideSignalsWithEvidence(config, data, 'buy')[T + 1]!.result).toBe(true);
    expect(evaluateIndicatorSide('ma', ma, createSeriesCache(data.slice(0, T + 1)), T).result).toBe(
      false,
    );
  });

  it('sideSignals: AND across active indicators; an active indicator without enabled rows keeps the side false', () => {
    const config = enable(defaultConfigV4(), ['ma', 'rsi']);
    const cache = createSeriesCache(synthetic);
    const expected = synthetic.map((_, i) => {
      const values = ['ma', 'rsi'].map(
        (id) => evaluateIndicatorSide(id, config.indicators[id]!.buy, cache, i).result,
      );
      return values.includes(false) ? false : values.includes(null) ? null : true;
    });
    expect(sideSignals(config, synthetic, 'buy')).toEqual(expected);
    const empty = structuredClone(config);
    (empty.indicators.rsi!.buy as RowSideConfig).rules.forEach((r) => (r.enabled = false));
    expect(sideSignals(empty, synthetic, 'buy').every((v) => v === false)).toBe(true);
    const evidence = sideSignalsWithEvidence(empty, synthetic, 'buy')[200]!;
    expect(evidence.result).toBe(false);
    // Registry order: rsi before ma.
    expect(evidence.indicators).toEqual([
      { indicator: 'rsi', status: 'no_signal', reason: 'no_rows', result: null },
      expect.objectContaining({ indicator: 'ma', status: 'ok' }),
    ]);
    expect(sideSignals(defaultConfigV4(), synthetic, 'buy').every((v) => v === false)).toBe(true);
  });

  it('evidence carries every enabled row with its own values', () => {
    const config = enable(defaultConfigV4(), ['rsi']);
    (config.indicators.rsi!.buy as RowSideConfig).rules[1]!.period = 9;
    const evidence = sideSignalsWithEvidence(config, synthetic, 'buy')[250]!;
    expect(evidence.rules.map((r) => [r.id, r.indicator, r.side, r.op, r.values])).toEqual([
      ['rsi.level', 'rsi', 'buy', '<', { period: 14, op: '<', threshold: 30 }],
      ['rsi.trend', 'rsi', 'buy', '>', { period: 9, dir: 'up' }],
    ]);
  });

  it('Volume keeps its params + rules model through the same side evaluator', () => {
    const config = enable(defaultConfigV4(), ['volume']);
    const side = config.indicators.volume!.buy;
    if (!('params' in side)) throw new Error('volume');
    const series = calc('volume', side.params, synthetic);
    const evaluation = evaluateIndicatorSide('volume', side, createSeriesCache(synthetic), 120);
    expect(evaluation.rows.map((r) => r.result)).toEqual(
      side.rules.map((rule) => evaluateRuleWithEvidence(rule, series, side.params, 120).result),
    );
    expect(evaluation.rows[0]!.values).toEqual(side.params);
  });
});

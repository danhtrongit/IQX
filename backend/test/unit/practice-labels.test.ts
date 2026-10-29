import { describe, expect, it } from 'vitest';

import {
  defaultPracticeConfig,
  practiceEntry,
} from '../../src/modules/practice/practice.config.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
import {
  operandLabel,
  rowLabel,
  rowOperandLabels,
  ruleLabels,
} from '../../src/modules/practice/practice.labels.js';
import type { PracticeRowsConfig } from '../../src/modules/practice/practice.types.js';
import {
  isRowsEntry,
  renderRowSentence,
  type ParamsRegistryEntry,
  type RowsRegistryEntry,
  type RowValues,
  type Side,
} from '../../src/modules/quant/v2/index.js';

const SIDES: readonly Side[] = ['buy', 'sell'];
const ROW_INDICATORS = PRACTICE_INDICATOR_IDS.filter((id) => id !== 'volume');

const rowsEntry = (id: string): RowsRegistryEntry => {
  const entry = practiceEntry(id);
  if (!entry || !isRowsEntry(entry)) throw new Error(`${id} is not row-based`);
  return entry;
};

/** Default sentences of the sample HTML (HTML-EXTRACT.md, "Default sentences as rendered"), Mua / Bán. */
const GOLDEN_SENTENCES: Record<string, [string, string]> = {
  'ma.price_cross': ['Giá cắt lên SMA 20', 'Giá cắt xuống SMA 20'],
  'ma.ma_cross': ['SMA 10 cắt lên SMA 20', 'SMA 10 cắt xuống SMA 20'],
  'ma.trend': ['SMA 20 xu hướng lên', 'SMA 20 xu hướng xuống'],
  'ema.price_cross': ['Giá cắt lên EMA 20', 'Giá cắt xuống EMA 20'],
  'ema.ma_cross': ['EMA 10 cắt lên EMA 20', 'EMA 10 cắt xuống EMA 20'],
  'ema.trend': ['EMA 20 xu hướng lên', 'EMA 20 xu hướng xuống'],
  'ma_cross.cross': ['SMA 20 cắt lên SMA 50', 'SMA 20 cắt xuống SMA 50'],
  'rsi.level': ['RSI 14 < 30', 'RSI 14 > 70'],
  'rsi.trend': ['RSI 14 xu hướng lên', 'RSI 14 xu hướng xuống'],
  'macd.signal': ['MACD 12 / 26 cắt lên Signal 9', 'MACD 12 / 26 cắt xuống Signal 9'],
  'macd.zero': ['MACD 12 / 26 > 0', 'MACD 12 / 26 < 0'],
  'macd.hist': [
    'Histogram MACD 12 / 26 / 9 tăng so với phiên trước',
    'Histogram MACD 12 / 26 / 9 giảm so với phiên trước',
  ],
  'stochastic.level': ['%K 14 làm mượt 3 < 20', '%K 14 làm mượt 3 > 80'],
  'stochastic.kd_cross': ['%K 14 làm mượt 3 cắt lên %D 3', '%K 14 làm mượt 3 cắt xuống %D 3'],
  'cci.cross': ['CCI 20 cắt lên -100', 'CCI 20 cắt xuống 100'],
  'mfi.cross': ['MFI 14 cắt lên 20', 'MFI 14 cắt xuống 80'],
  'roc.cross': ['ROC 20 cắt lên 5 %', 'ROC 20 cắt xuống -5 %'],
  'williams_r.cross': ['Williams %R 14 cắt lên -80', 'Williams %R 14 cắt xuống -20'],
  'bollinger.price_action': [
    'Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2',
    'Giá đóng cửa quay vào dải từ trên Bollinger 20 hệ số 2',
  ],
  'bollinger.price_dir': [
    'Giá đóng cửa tăng so với phiên trước',
    'Giá đóng cửa giảm so với phiên trước',
  ],
  'bollinger.width': [
    'Độ rộng Bollinger 20 hệ số 2 thu hẹp',
    'Độ rộng Bollinger 20 hệ số 2 mở rộng',
  ],
  'donchian.break': ['Giá đóng cửa > dải trên Donchian 20', 'Giá đóng cửa < dải dưới Donchian 20'],
  'dmi.di': ['DMI 14 : +DI cắt lên −DI', 'DMI 14 : +DI cắt xuống −DI'],
  'dmi.adx': ['ADX 14 > 25', 'ADX 14 > 25'],
  'obv.sma': ['OBV cắt lên SMA 20 của OBV', 'OBV cắt xuống SMA 20 của OBV'],
  'obv.breakout': ['OBV vượt đỉnh 20 phiên', 'OBV phá đáy 20 phiên'],
  'cmf.cross': ['CMF 20 cắt lên 0', 'CMF 20 cắt xuống 0'],
};

type Operands = { left: string; right: string };
/** What the two evidence numbers of every row are, at the registry defaults (Mua, Bán). */
const GOLDEN_OPERANDS: Record<string, [Operands, Operands]> = {
  'ma.price_cross': [
    { left: 'Giá đóng cửa', right: 'SMA 20' },
    { left: 'Giá đóng cửa', right: 'SMA 20' },
  ],
  'ma.ma_cross': [
    { left: 'SMA 10', right: 'SMA 20' },
    { left: 'SMA 10', right: 'SMA 20' },
  ],
  'ma.trend': [
    { left: 'SMA 20', right: 'SMA 20 cách 20 phiên' },
    { left: 'SMA 20', right: 'SMA 20 cách 20 phiên' },
  ],
  'ema.price_cross': [
    { left: 'Giá đóng cửa', right: 'EMA 20' },
    { left: 'Giá đóng cửa', right: 'EMA 20' },
  ],
  'ema.ma_cross': [
    { left: 'EMA 10', right: 'EMA 20' },
    { left: 'EMA 10', right: 'EMA 20' },
  ],
  'ema.trend': [
    { left: 'EMA 20', right: 'EMA 20 cách 20 phiên' },
    { left: 'EMA 20', right: 'EMA 20 cách 20 phiên' },
  ],
  'ma_cross.cross': [
    { left: 'SMA 20', right: 'SMA 50' },
    { left: 'SMA 20', right: 'SMA 50' },
  ],
  'rsi.level': [
    { left: 'RSI 14', right: '30' },
    { left: 'RSI 14', right: '70' },
  ],
  'rsi.trend': [
    { left: 'RSI 14', right: 'RSI 14 cách 14 phiên' },
    { left: 'RSI 14', right: 'RSI 14 cách 14 phiên' },
  ],
  'macd.signal': [
    { left: 'MACD 12/26', right: 'Signal 9' },
    { left: 'MACD 12/26', right: 'Signal 9' },
  ],
  'macd.zero': [
    { left: 'MACD 12/26', right: '0' },
    { left: 'MACD 12/26', right: '0' },
  ],
  'macd.hist': [
    { left: 'Histogram 12/26/9', right: 'Histogram phiên trước' },
    { left: 'Histogram 12/26/9', right: 'Histogram phiên trước' },
  ],
  'stochastic.level': [
    { left: '%K 14', right: '20' },
    { left: '%K 14', right: '80' },
  ],
  'stochastic.kd_cross': [
    { left: '%K 14', right: '%D 3' },
    { left: '%K 14', right: '%D 3' },
  ],
  'cci.cross': [
    { left: 'CCI 20', right: '-100' },
    { left: 'CCI 20', right: '100' },
  ],
  'mfi.cross': [
    { left: 'MFI 14', right: '20' },
    { left: 'MFI 14', right: '80' },
  ],
  'roc.cross': [
    { left: 'ROC 20 (%)', right: '5' },
    { left: 'ROC 20 (%)', right: '-5' },
  ],
  'williams_r.cross': [
    { left: 'Williams %R 14', right: '-80' },
    { left: 'Williams %R 14', right: '-20' },
  ],
  'bollinger.price_action': [
    { left: 'Giá đóng cửa', right: 'Dải dưới' },
    { left: 'Giá đóng cửa', right: 'Dải trên' },
  ],
  'bollinger.price_dir': [
    { left: 'Giá đóng cửa', right: 'Giá đóng cửa phiên trước' },
    { left: 'Giá đóng cửa', right: 'Giá đóng cửa phiên trước' },
  ],
  'bollinger.width': [
    { left: 'Độ rộng Bollinger 20', right: 'Độ rộng Bollinger 20 phiên trước' },
    { left: 'Độ rộng Bollinger 20', right: 'Độ rộng Bollinger 20 phiên trước' },
  ],
  'donchian.break': [
    { left: 'Giá đóng cửa', right: 'Dải trên Donchian 20' },
    { left: 'Giá đóng cửa', right: 'Dải dưới Donchian 20' },
  ],
  'dmi.di': [
    { left: '+DI', right: '−DI' },
    { left: '+DI', right: '−DI' },
  ],
  'dmi.adx': [
    { left: 'ADX 14', right: '25' },
    { left: 'ADX 14', right: '25' },
  ],
  'obv.sma': [
    { left: 'OBV', right: 'SMA 20 của OBV' },
    { left: 'OBV', right: 'SMA 20 của OBV' },
  ],
  'obv.breakout': [
    { left: 'OBV', right: 'Đỉnh 20 phiên' },
    { left: 'OBV', right: 'Đáy 20 phiên' },
  ],
  'cmf.cross': [
    { left: 'CMF 20', right: '0' },
    { left: 'CMF 20', right: '0' },
  ],
};

const allRows = () =>
  ROW_INDICATORS.flatMap((id) => rowsEntry(id).rows.map((definition) => ({ id, definition })));

describe('practice labels: condition rows come from the registry sentences', () => {
  it('covers all 27 rows with golden sentences', () => {
    expect(
      allRows()
        .map((row) => row.definition.id)
        .sort(),
    ).toEqual(Object.keys(GOLDEN_SENTENCES).sort());
    expect(Object.keys(GOLDEN_SENTENCES)).toHaveLength(27);
    expect(Object.keys(GOLDEN_OPERANDS).sort()).toEqual(Object.keys(GOLDEN_SENTENCES).sort());
  });

  it('renders every default row exactly like the sample HTML, Mua and Bán', () => {
    for (const { id, definition } of allRows()) {
      const golden = GOLDEN_SENTENCES[definition.id]!;
      SIDES.forEach((side, index) => {
        expect(rowLabel(definition, definition[side]), `${id} ${definition.id} ${side}`).toBe(
          golden[index],
        );
      });
    }
  });

  it('is the shared renderer: the same sentence the forms show', () => {
    for (const { definition } of allRows()) {
      for (const side of SIDES) {
        expect(rowLabel(definition, definition[side])).toBe(
          renderRowSentence(definition, definition[side]),
        );
      }
    }
  });

  it('labels the values the row actually ran with, not the registry defaults', () => {
    const rsi = rowsEntry('rsi').rows[0]!;
    expect(rowLabel(rsi, { period: 9, op: '>', threshold: 65 })).toBe('RSI 9 > 65');
    const roc = rowsEntry('roc').rows[0]!;
    expect(rowLabel(roc, { period: 12, op: 'cross_down', threshold: -7.5 })).toBe(
      'ROC 12 cắt xuống -7.5 %',
    );
    const bollinger = rowsEntry('bollinger').rows[0]!;
    expect(rowLabel(bollinger, { action: 'break_upper', period: 50, mult: 2.5 })).toBe(
      'Giá đóng cửa vượt dải trên Bollinger 50 hệ số 2.5',
    );
    // a value the row does not carry renders as "?", never as the default
    expect(rowLabel(rsi, { period: 9, op: '>' })).toBe('RSI 9 > ?');
  });

  it('labels the evidence operands of every row from its own values', () => {
    for (const { definition } of allRows()) {
      const golden = GOLDEN_OPERANDS[definition.id]!;
      SIDES.forEach((side, index) => {
        expect(
          rowOperandLabels(definition.id, definition[side]),
          `${definition.id} ${side}`,
        ).toEqual(golden[index]);
      });
    }
  });

  it('follows the periods of each row (two RSI rows with different periods)', () => {
    const config = defaultPracticeConfig(rowsEntry('rsi')) as PracticeRowsConfig;
    const [level, trend] = config.buy.rules;
    // a row of the config is its values plus `id` and `enabled`; the labels read the values only
    const { id: _levelId, enabled: _levelOn, ...levelValues } = level!;
    const { id: _trendId, enabled: _trendOn, ...trendValues } = trend!;
    expect(
      rowOperandLabels('rsi.level', { ...(levelValues as RowValues), period: 7, threshold: 35 }),
    ).toEqual({
      left: 'RSI 7',
      right: '35',
    });
    expect(rowOperandLabels('rsi.trend', { ...(trendValues as RowValues), period: 21 })).toEqual({
      left: 'RSI 21',
      right: 'RSI 21 cách 21 phiên',
    });
    expect(rowOperandLabels('obv.breakout', { action: 'break_low', period: 50 })).toEqual({
      left: 'OBV',
      right: 'Đáy 50 phiên',
    });
    expect(
      rowOperandLabels('bollinger.price_action', {
        action: 'cross_up_middle',
        period: 20,
        mult: 2,
      }),
    ).toEqual({ left: 'Giá đóng cửa', right: 'Đường giữa' });
  });

  it('never falls back for a registry row (an unknown row id is shown as-is)', () => {
    for (const { definition } of allRows()) {
      expect(rowOperandLabels(definition.id, definition.buy).left).not.toBe(definition.id);
    }
    expect(rowOperandLabels('r1', {})).toEqual({ left: 'r1', right: '—' });
  });
});

describe('practice labels: Volume keeps its rule templates', () => {
  const volume = practiceEntry('volume') as ParamsRegistryEntry;

  it('labels close, volume and the average-volume threshold with the side params', () => {
    const params = { lookback: 30, mult: 1.5 };
    const [r1, r2] = volume.buy.rules;
    expect(ruleLabels(r1!, volume, params)).toEqual({
      left: 'Giá đóng cửa',
      right: 'Giá đóng cửa phiên trước',
    });
    expect(ruleLabels(r2!, volume, params)).toEqual({
      left: 'Khối lượng',
      right: '1.5 × TB 30 phiên',
    });
  });

  it('labels params and constants of a rule operand', () => {
    expect(operandLabel({ kind: 'constant', value: 7 }, volume, {})).toBe('7');
    expect(operandLabel({ kind: 'param', key: 'lookback' }, volume, { lookback: 20 })).toBe(
      '20 phiên',
    );
    expect(operandLabel({ kind: 'param', key: 'mult' }, volume, {})).toBe('mult lần');
  });
});

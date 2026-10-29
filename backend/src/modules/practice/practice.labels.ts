import {
  renderRowSentence,
  type Operand,
  type ParamsRegistryEntry,
  type RowDefinition,
  type RowValues,
  type Rule,
} from '../quant/v2/index.js';

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);

// ------------------------------------------------------------------ condition rows (SPEC V3)

/**
 * Sentence of a registry row with the values it ran with, e.g. `RSI 14 < 30` or
 * `Giá cắt lên SMA 20`. The text comes from the registry row definition (the same sentence the
 * forms render), so a locked run keeps the wording of the registry it was started with.
 */
export const rowLabel = (definition: RowDefinition, values: Readonly<RowValues>): string =>
  renderRowSentence(definition, values);

type OperandLabels = { left: string; right: string };

const num = (values: Readonly<RowValues>, key: string): string => {
  const value = values[key];
  return typeof value === 'number' ? formatNumber(value) : '?';
};

const CLOSE = 'Giá đóng cửa';

const BOLLINGER_RIGHT: Record<string, string> = {
  reenter_lower: 'Dải dưới',
  break_lower: 'Dải dưới',
  reenter_upper: 'Dải trên',
  break_upper: 'Dải trên',
  cross_up_middle: 'Đường giữa',
  cross_down_middle: 'Đường giữa',
};

/** Left (`lhs`) and right (`rhs`) operand of every row, labelled with the row's own values. */
const ROW_OPERANDS: Record<string, (values: Readonly<RowValues>) => OperandLabels> = {
  'ma.price_cross': (v) => ({ left: CLOSE, right: `SMA ${num(v, 'period')}` }),
  'ma.ma_cross': (v) => ({ left: `SMA ${num(v, 'fast')}`, right: `SMA ${num(v, 'slow')}` }),
  'ma.trend': (v) => ({
    left: `SMA ${num(v, 'period')}`,
    right: `SMA ${num(v, 'period')} cách ${num(v, 'period')} phiên`,
  }),
  'ema.price_cross': (v) => ({ left: CLOSE, right: `EMA ${num(v, 'period')}` }),
  'ema.ma_cross': (v) => ({ left: `EMA ${num(v, 'fast')}`, right: `EMA ${num(v, 'slow')}` }),
  'ema.trend': (v) => ({
    left: `EMA ${num(v, 'period')}`,
    right: `EMA ${num(v, 'period')} cách ${num(v, 'period')} phiên`,
  }),
  'ma_cross.cross': (v) => ({ left: `SMA ${num(v, 'fast')}`, right: `SMA ${num(v, 'slow')}` }),
  'rsi.level': (v) => ({ left: `RSI ${num(v, 'period')}`, right: num(v, 'threshold') }),
  'rsi.trend': (v) => ({
    left: `RSI ${num(v, 'period')}`,
    right: `RSI ${num(v, 'period')} cách ${num(v, 'period')} phiên`,
  }),
  'macd.signal': (v) => ({
    left: `MACD ${num(v, 'fast')}/${num(v, 'slow')}`,
    right: `Signal ${num(v, 'signal')}`,
  }),
  'macd.zero': (v) => ({ left: `MACD ${num(v, 'fast')}/${num(v, 'slow')}`, right: '0' }),
  'macd.hist': (v) => ({
    left: `Histogram ${num(v, 'fast')}/${num(v, 'slow')}/${num(v, 'signal')}`,
    right: 'Histogram phiên trước',
  }),
  'stochastic.level': (v) => ({ left: `%K ${num(v, 'k')}`, right: num(v, 'threshold') }),
  'stochastic.kd_cross': (v) => ({ left: `%K ${num(v, 'k')}`, right: `%D ${num(v, 'd')}` }),
  'cci.cross': (v) => ({ left: `CCI ${num(v, 'period')}`, right: num(v, 'threshold') }),
  'mfi.cross': (v) => ({ left: `MFI ${num(v, 'period')}`, right: num(v, 'threshold') }),
  'roc.cross': (v) => ({ left: `ROC ${num(v, 'period')} (%)`, right: num(v, 'threshold') }),
  'williams_r.cross': (v) => ({
    left: `Williams %R ${num(v, 'period')}`,
    right: num(v, 'threshold'),
  }),
  'cmf.cross': (v) => ({ left: `CMF ${num(v, 'period')}`, right: num(v, 'threshold') }),
  'bollinger.price_action': (v) => ({
    left: CLOSE,
    right: BOLLINGER_RIGHT[String(v.action)] ?? 'Dải Bollinger',
  }),
  'bollinger.price_dir': () => ({ left: CLOSE, right: `${CLOSE} phiên trước` }),
  'bollinger.width': (v) => ({
    left: `Độ rộng Bollinger ${num(v, 'period')}`,
    right: `Độ rộng Bollinger ${num(v, 'period')} phiên trước`,
  }),
  'donchian.break': (v) => ({
    left: CLOSE,
    right: `${v.band === 'lower' ? 'Dải dưới' : 'Dải trên'} Donchian ${num(v, 'period')}`,
  }),
  'dmi.di': () => ({ left: '+DI', right: '−DI' }),
  'dmi.adx': (v) => ({ left: `ADX ${num(v, 'period')}`, right: num(v, 'threshold') }),
  'obv.sma': (v) => ({ left: 'OBV', right: `SMA ${num(v, 'period')} của OBV` }),
  'obv.breakout': (v) => ({
    left: 'OBV',
    right:
      v.action === 'break_low' ? `Đáy ${num(v, 'period')} phiên` : `Đỉnh ${num(v, 'period')} phiên`,
  }),
};

/** What the two numbers of a row's evidence are (`lhs` / `rhs`), using the row's own values. */
export function rowOperandLabels(rowId: string, values: Readonly<RowValues>): OperandLabels {
  return ROW_OPERANDS[rowId]?.(values) ?? { left: rowId, right: '—' };
}

// ------------------------------------------------------------------ Volume (params + rules)

/**
 * Vietnamese label of one rule operand of a params-based indicator (Volume) using the params of
 * the side being evaluated. Labels contain only indicator/period/threshold text, never a symbol,
 * company or date.
 */
export function operandLabel(
  operand: Operand,
  entry: Pick<ParamsRegistryEntry, 'id' | 'name' | 'fields'>,
  params: Record<string, number>,
): string {
  if (operand.kind === 'param') {
    const value = params[operand.key];
    const unit = entry.fields.find((field) => field.key === operand.key)?.unit;
    return `${value === undefined ? operand.key : formatNumber(value)}${unit ? ` ${unit}` : ''}`;
  }
  if (operand.kind === 'constant') return String(operand.value);
  const p = (key: string): string => formatNumber(params[key] ?? Number.NaN);
  const labels: Record<string, string> = {
    close: CLOSE,
    volume: 'Khối lượng',
    value: entry.name,
    threshold: `${p('mult')} × TB ${p('lookback')} phiên`,
  };
  return `${labels[operand.key] ?? operand.key}${operand.offset === -1 ? ' phiên trước' : ''}`;
}

/** Left/right labels of a Volume rule (membership right side is the open interval of the band). */
export function ruleLabels(
  rule: Rule,
  entry: Pick<ParamsRegistryEntry, 'id' | 'name' | 'fields'>,
  params: Record<string, number>,
): { left: string; right: string } {
  const left = operandLabel(rule.lhs, entry, params);
  if (rule.kind === 'membership') {
    return {
      left,
      right: `(${operandLabel(rule.rhs.lower, entry, params)}; ${operandLabel(rule.rhs.upper, entry, params)})`,
    };
  }
  return { left, right: operandLabel(rule.rhs, entry, params) };
}

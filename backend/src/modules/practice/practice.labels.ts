import type { Operand, RegistryEntry, Rule } from '../quant/v2/index.js';

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);

/** Display name of the main (`value`) series of an indicator, as the approved HTML labels it. */
function valueLabel(indicatorId: string, params: Record<string, number>, fallback: string): string {
  switch (indicatorId) {
    case 'ma':
      return `SMA ${formatNumber(params.period ?? Number.NaN)}`;
    case 'ema':
      return `EMA ${formatNumber(params.period ?? Number.NaN)}`;
    case 'bollinger':
      return 'Độ rộng Bollinger';
    case 'stochastic':
      return '%K';
    case 'cmf':
      return 'CMF';
    case 'williams_r':
      return 'Williams %R';
    case 'volume':
      return 'Khối lượng';
    default:
      return fallback;
  }
}

/**
 * Vietnamese label of one rule operand using the params of the side being evaluated
 * (port of the reference `operandLabel`). Labels contain only indicator/period/threshold text —
 * never a symbol, company or date.
 */
export function operandLabel(
  operand: Operand,
  entry: Pick<RegistryEntry, 'id' | 'name' | 'fields'>,
  params: Record<string, number>,
): string {
  if (operand.kind === 'param') {
    const value = params[operand.key];
    const unit = entry.fields.find((field) => field.key === operand.key)?.unit;
    return `${value === undefined ? operand.key : formatNumber(value)}${unit ? ` ${unit}` : ''}`;
  }
  if (operand.kind === 'constant') return String(operand.value);
  const p = (key: string): string => formatNumber(params[key] ?? Number.NaN);
  const suffix =
    operand.offset === -1
      ? ' phiên trước'
      : operand.offset_param
        ? ` cách ${p(operand.offset_param)} phiên`
        : '';
  const labels: Record<string, string> = {
    close: 'Giá đóng cửa',
    volume: 'Khối lượng',
    value: valueLabel(entry.id, params, entry.name),
    signal: entry.id === 'stochastic' ? '%D' : 'Đường tín hiệu',
    histogram: 'Histogram',
    plus: '+DI',
    minus: '−DI',
    adx: 'ADX',
    fast: entry.id === 'ema' ? `EMA ${p('fast')}` : `SMA ${p('fast')}`,
    slow: entry.id === 'ema' ? `EMA ${p('slow')}` : `SMA ${p('slow')}`,
    trend: entry.id === 'ema' ? `EMA ${p('trend_period')}` : `SMA ${p('trend_period')}`,
    upper: entry.id === 'obv' ? `Đỉnh ${p('breakout_period')} phiên` : 'Dải trên',
    middle: 'Đường giữa',
    lower: entry.id === 'obv' ? `Đáy ${p('breakout_period')} phiên` : 'Dải dưới',
    baseline: `SMA ${p('baseline')} của OBV`,
    threshold: `${p('mult')} × TB ${p('lookback')} phiên`,
  };
  return `${labels[operand.key] ?? operand.key}${suffix}`;
}

/** Left/right labels of a rule (membership right side is the open interval of the band). */
export function ruleLabels(
  rule: Rule,
  entry: Pick<RegistryEntry, 'id' | 'name' | 'fields'>,
  params: Record<string, number>,
): { left: string; right: string } {
  const left = operandLabel(rule.lhs, entry, params);
  if (rule.kind === 'membership') {
    return {
      left,
      right: `(${operandLabel(rule.rhs.lower, entry, params)}; ${operandLabel(rule.rhs.upper, entry, params)})`,
    };
  }
  if (entry.id === 'bollinger' && rule.id === 'r1') {
    const rightByOp: Record<string, string> = {
      reenter_lower: 'Dải dưới',
      break_lower: 'Dải dưới',
      reenter_upper: 'Dải trên',
      break_upper: 'Dải trên',
      cross_up_middle: 'Đường giữa',
      cross_down_middle: 'Đường giữa',
    };
    return { left, right: rightByOp[rule.op] ?? 'Dải Bollinger' };
  }
  if (entry.id === 'obv' && rule.id === 'r2') {
    const n = formatNumber(params.breakout_period ?? 20);
    return { left, right: rule.op === 'break_low' ? `Đáy ${n} phiên` : `Đỉnh ${n} phiên` };
  }
  return { left, right: operandLabel(rule.rhs, entry, params) };
}

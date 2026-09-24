import { CombinationError, type Condition } from './conditions.js';

export const INDICATOR_DISPLAY: Readonly<Record<string, string>> = {
  ma_5: 'MA5',
  ma_20: 'MA20',
  ma_50: 'MA50',
  ma_200: 'MA200',
  ma_stack_bull: 'MA5 > MA20 > MA50 > MA200',
  uptrend: 'MA50 > MA200',
  death_cross: 'MA20 cắt xuống MA50',
  ma_20_slope: 'Độ dốc MA20',
  dist_ma_20: 'Khoảng cách giá tới MA20',
  dist_ma_200: 'Khoảng cách giá tới MA200',
  rsi_14: 'RSI 14',
  macd_hist: 'Histogram MACD',
  macd_bull_cross: 'MACD cắt lên Signal',
  macd_bear_cross: 'MACD cắt xuống Signal',
  roc_20d: 'ROC 20 phiên',
  atr_14: 'ATR 14',
  atr_pct: 'ATR theo % giá',
  bb_width: 'Độ rộng dải Bollinger',
  bb_squeeze: 'Bollinger thắt hẹp',
  bb_breakout_down: 'Giá phá xuống Bollinger dưới',
  vol_ma_20: 'MA20 của khối lượng',
  vol_zscore: 'Độ bất thường khối lượng',
  obv: 'OBV',
  obv_ma_20: 'MA20 của OBV',
  high_20: 'Đỉnh 20 phiên',
  high_52w: 'Đỉnh 52 tuần',
  dist_52w_high: 'Khoảng cách tới đỉnh 52 tuần',
  breakout_20d: 'Phá đỉnh 20 phiên',
  breakout_52w: 'Phá đỉnh 52 tuần',
  low_20: 'Đáy 20 phiên',
  low_52w: 'Đáy 52 tuần',
  dist_52w_low: 'Khoảng cách tới đáy 52 tuần',
  breakdown_20d: 'Thủng đáy 20 phiên',
  breakdown_52w: 'Thủng đáy 52 tuần',
  hammer: 'Nến búa',
  bull_engulfing: 'Nến nhấn chìm tăng',
  bear_engulfing: 'Nến nhấn chìm giảm',
  shooting_star: 'Nến sao băng',
};

export function displayName(indicator: string): string {
  return INDICATOR_DISPLAY[indicator] ?? indicator;
}

export type Factor = {
  id: string;
  label: string;
  side: 'buy' | 'sell';
  group: string;
  group_label: string;
  kind: 'bin' | 'num';
  indicator: string;
  op: string;
  default: number | string | null;
  editable: boolean;
  min: number | null;
  max: number | null;
  step: number | null;
  unit: string;
  is_percent: boolean;
  desc: string;
};

type FactorOptions = Partial<
  Pick<
    Factor,
    'op' | 'default' | 'editable' | 'min' | 'max' | 'step' | 'unit' | 'is_percent' | 'desc'
  >
>;
const factor = (
  id: string,
  side: 'buy' | 'sell',
  group: string,
  groupLabel: string,
  kind: 'bin' | 'num',
  indicator: string,
  options: FactorOptions = {},
): Factor => ({
  id,
  label: displayName(indicator),
  side,
  group,
  group_label: groupLabel,
  kind,
  indicator,
  op: options.op ?? (kind === 'bin' ? 'is_true' : '>'),
  default: options.default ?? null,
  editable: options.editable ?? kind === 'num',
  min: options.min ?? null,
  max: options.max ?? null,
  step: options.step ?? null,
  unit: options.unit ?? '',
  is_percent: options.is_percent ?? false,
  desc: options.desc ?? '',
});

export const FACTORS: readonly Factor[] = [
  factor('ma_stack_bull', 'buy', 'B1', 'Xu hướng tăng', 'bin', 'ma_stack_bull', {
    desc: '4 MA xếp chồng tăng',
  }),
  factor('uptrend', 'buy', 'B1', 'Xu hướng tăng', 'bin', 'uptrend', { desc: 'MA50 > MA200' }),
  factor('close_above_ma50', 'buy', 'B1', 'Xu hướng tăng', 'bin', 'close', {
    op: '>',
    default: 'ma_50',
    desc: 'Giá vượt MA50',
  }),
  factor('ma_20_slope', 'buy', 'B1', 'Xu hướng tăng', 'num', 'ma_20_slope', {
    op: '>',
    default: 0.02,
    min: 0,
    max: 0.05,
    step: 0.005,
    desc: 'Độ dốc MA20 dương',
  }),
  factor('rsi_14_buy_mom', 'buy', 'B2', 'Động lượng tăng', 'num', 'rsi_14', {
    op: 'cross_above',
    default: 50,
    editable: false,
    desc: 'RSI cắt lên 50',
  }),
  factor('macd_hist_buy', 'buy', 'B2', 'Động lượng tăng', 'num', 'macd_hist', {
    op: '>',
    default: 0,
    min: -0.5,
    max: 0.5,
    step: 0.05,
    desc: 'MACD histogram dương',
  }),
  factor('macd_bull_cross', 'buy', 'B2', 'Động lượng tăng', 'bin', 'macd_bull_cross', {
    desc: 'MACD cắt lên signal',
  }),
  factor('roc_20d_buy', 'buy', 'B2', 'Động lượng tăng', 'num', 'roc_20d', {
    op: '>',
    default: 0.05,
    min: 0,
    max: 0.2,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Đà tăng 20 phiên',
  }),
  factor('rsi_14_oversold', 'buy', 'B3', 'Quá bán / Mua đáy', 'num', 'rsi_14', {
    op: '<',
    default: 30,
    min: 20,
    max: 40,
    step: 1,
    desc: 'RSI quá bán',
  }),
  factor('dist_ma_20_buy', 'buy', 'B3', 'Quá bán / Mua đáy', 'num', 'dist_ma_20', {
    op: '<',
    default: -0.05,
    min: -0.15,
    max: 0,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Giá dưới MA20',
  }),
  factor('dist_52w_low_buy', 'buy', 'B3', 'Quá bán / Mua đáy', 'num', 'dist_52w_low', {
    op: '<',
    default: 0.05,
    min: 0,
    max: 1,
    step: 0.05,
    unit: '%',
    is_percent: true,
    desc: 'Gần đáy năm',
  }),
  factor('dist_ma_200_buy', 'buy', 'B3', 'Quá bán / Mua đáy', 'num', 'dist_ma_200', {
    op: '>',
    default: 0,
    min: -0.2,
    max: 0.2,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Khoảng cách giá tới MA200',
  }),
  factor('breakout_20d', 'buy', 'B4', 'Phá đỉnh / Bứt phá', 'bin', 'breakout_20d', {
    desc: 'Phá đỉnh 20 phiên',
  }),
  factor('breakout_52w', 'buy', 'B4', 'Phá đỉnh / Bứt phá', 'bin', 'breakout_52w', {
    desc: 'Phá đỉnh 52 tuần',
  }),
  factor('dist_52w_high_buy', 'buy', 'B4', 'Phá đỉnh / Bứt phá', 'num', 'dist_52w_high', {
    op: '>',
    default: -0.05,
    min: -0.3,
    max: 0,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Sát đỉnh năm',
  }),
  factor('vol_zscore_buy', 'buy', 'B5', 'Xác nhận khối lượng', 'num', 'vol_zscore', {
    op: '>',
    default: 1.5,
    min: 1,
    max: 3,
    step: 0.1,
    unit: 'σ',
    desc: 'Khối lượng bùng nổ',
  }),
  factor('obv_cross_buy', 'buy', 'B5', 'Xác nhận khối lượng', 'bin', 'obv', {
    op: 'cross_above',
    default: 'obv_ma_20',
    desc: 'OBV vượt MA20',
  }),
  factor('bb_squeeze_buy', 'buy', 'B6', 'Bối cảnh biến động', 'bin', 'bb_squeeze', {
    desc: 'BB co hẹp (sắp bung)',
  }),
  factor('bb_width_buy', 'buy', 'B6', 'Bối cảnh biến động', 'num', 'bb_width', {
    op: '<',
    default: 0.05,
    min: 0.01,
    max: 0.2,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Độ rộng dải Bollinger',
  }),
  factor('atr_pct_low', 'buy', 'B6', 'Bối cảnh biến động', 'num', 'atr_pct', {
    op: '<',
    default: 0.05,
    min: 0.01,
    max: 0.15,
    step: 0.005,
    unit: '%',
    is_percent: true,
    desc: 'Biến động thấp',
  }),
  factor('hammer_buy', 'buy', 'B7', 'Mẫu hình nến', 'bin', 'hammer', {
    desc: 'Nến hammer (đảo chiều tăng)',
  }),
  factor('bull_engulfing_buy', 'buy', 'B7', 'Mẫu hình nến', 'bin', 'bull_engulfing', {
    desc: 'Nến nhấn chìm tăng',
  }),
  factor('death_cross', 'sell', 'S1', 'Xu hướng đảo', 'bin', 'death_cross', {
    desc: 'MA20 cắt xuống MA50',
  }),
  factor('close_below_ma50', 'sell', 'S1', 'Xu hướng đảo', 'bin', 'close', {
    op: '<',
    default: 'ma_50',
    desc: 'Giá thủng MA50',
  }),
  factor('uptrend_off', 'sell', 'S1', 'Xu hướng đảo', 'bin', 'uptrend', {
    op: '==',
    default: 0,
    desc: 'Không còn xu hướng tăng',
  }),
  factor('rsi_14_sell_mom', 'sell', 'S2', 'Mất động lượng', 'num', 'rsi_14', {
    op: 'cross_below',
    default: 50,
    editable: false,
    desc: 'RSI cắt xuống 50',
  }),
  factor('macd_bear_cross', 'sell', 'S2', 'Mất động lượng', 'bin', 'macd_bear_cross', {
    desc: 'MACD cắt xuống signal',
  }),
  factor('roc_20d_sell', 'sell', 'S2', 'Mất động lượng', 'num', 'roc_20d', {
    op: '<',
    default: -0.05,
    min: -0.2,
    max: 0,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Đà giảm 20 phiên',
  }),
  factor('rsi_14_overbought', 'sell', 'S3', 'Quá mua / Bán đỉnh', 'num', 'rsi_14', {
    op: '>',
    default: 70,
    min: 60,
    max: 80,
    step: 1,
    desc: 'RSI quá mua',
  }),
  factor('dist_ma_20_sell', 'sell', 'S3', 'Quá mua / Bán đỉnh', 'num', 'dist_ma_20', {
    op: '>',
    default: 0.1,
    min: 0,
    max: 0.2,
    step: 0.01,
    unit: '%',
    is_percent: true,
    desc: 'Giá vượt xa MA20',
  }),
  factor('breakdown_20d', 'sell', 'S4', 'Phá đáy', 'bin', 'breakdown_20d', {
    desc: 'Phá đáy 20 phiên',
  }),
  factor('breakdown_52w', 'sell', 'S4', 'Phá đáy', 'bin', 'breakdown_52w', {
    desc: 'Phá đáy 52 tuần',
  }),
  factor('bb_breakout_down', 'sell', 'S4', 'Phá đáy', 'bin', 'bb_breakout_down', {
    desc: 'Giá phá BB dưới',
  }),
  factor('vol_zscore_sell', 'sell', 'S5', 'Xác nhận khối lượng', 'num', 'vol_zscore', {
    op: '>',
    default: 1.5,
    min: 1,
    max: 3,
    step: 0.1,
    unit: 'σ',
    desc: 'Khối lượng bán tháo',
  }),
  factor('obv_cross_sell', 'sell', 'S5', 'Xác nhận khối lượng', 'bin', 'obv', {
    op: 'cross_below',
    default: 'obv_ma_20',
    desc: 'OBV xuyên xuống MA',
  }),
  factor('atr_pct_high', 'sell', 'S6', 'Bối cảnh biến động', 'num', 'atr_pct', {
    op: '>',
    default: 0.08,
    min: 0.05,
    max: 0.15,
    step: 0.005,
    unit: '%',
    is_percent: true,
    desc: 'Biến động cao',
  }),
  factor('shooting_star_sell', 'sell', 'S7', 'Mẫu hình nến', 'bin', 'shooting_star', {
    desc: 'Nến shooting star (đảo chiều giảm)',
  }),
  factor('bear_engulfing_sell', 'sell', 'S7', 'Mẫu hình nến', 'bin', 'bear_engulfing', {
    desc: 'Nến nhấn chìm giảm',
  }),
];

const FACTORS_BY_ID = new Map(FACTORS.map((item) => [item.id, item]));
export function resolveFactor(id: string, value?: number | null): Condition {
  const selected = FACTORS_BY_ID.get(id);
  if (!selected) throw new CombinationError(`Không có factor: '${id}'`);
  return {
    indicator: selected.indicator,
    op: selected.op,
    value: selected.editable && value != null ? value : selected.default,
  };
}

export function factorLibraryPayload(): { buy: unknown[]; sell: unknown[]; count: number } {
  const sides: Record<
    'buy' | 'sell',
    Map<string, { group: string; group_label: string; factors: Factor[] }>
  > = { buy: new Map(), sell: new Map() };
  for (const item of FACTORS) {
    const groups = sides[item.side];
    const group = groups.get(item.group) ?? {
      group: item.group,
      group_label: item.group_label,
      factors: [],
    };
    group.factors.push(item);
    groups.set(item.group, group);
  }
  return { buy: [...sides.buy.values()], sell: [...sides.sell.values()], count: FACTORS.length };
}

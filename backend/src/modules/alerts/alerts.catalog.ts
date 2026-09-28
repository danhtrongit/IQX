import type { AlertSignalCreateInput } from './alerts.schemas.js';

const c = (indicator: string, op: string, value: number | string | null = null) => ({
  indicator,
  op,
  value,
});

export const DEFAULT_ALERT_SIGNALS: readonly AlertSignalCreateInput[] = [
  {
    key: 'pullback',
    side: 'buy',
    ta_name: 'Pullback',
    message_title: 'Mua khi giá điều chỉnh nhẹ',
    combination: {
      logic: 'AND',
      conditions: [c('uptrend', 'is_true'), c('dist_ma_20', '<', -0.03), c('rsi_14', '<', 45)],
    },
    is_enabled: true,
    sort_order: 0,
  },
  {
    key: 'breakout',
    side: 'buy',
    ta_name: 'Breakout',
    message_title: 'Mua khi giá vượt đỉnh',
    combination: {
      logic: 'AND',
      conditions: [c('breakout_20d', 'is_true'), c('vol_zscore', '>', 1.5)],
    },
    is_enabled: true,
    sort_order: 1,
  },
  {
    key: 'reversal',
    side: 'buy',
    ta_name: 'Reversal',
    message_title: 'Mua khi quay đầu tăng',
    combination: {
      logic: 'OR',
      conditions: [c('bull_engulfing', 'is_true'), c('hammer', 'is_true')],
    },
    is_enabled: true,
    sort_order: 2,
  },
  {
    key: 'squeeze',
    side: 'buy',
    ta_name: 'Squeeze',
    message_title: 'Mua trước khi bung khỏi vùng nén',
    combination: {
      logic: 'AND',
      conditions: [c('bb_squeeze', 'is_true'), c('ma_20_slope', '>', 0)],
    },
    is_enabled: true,
    sort_order: 3,
  },
  {
    key: 'continuation',
    side: 'buy',
    ta_name: 'Continuation',
    message_title: 'Mua khi đà tăng mạnh',
    combination: {
      logic: 'AND',
      conditions: [c('ma_stack_bull', 'is_true'), c('macd_hist', '>', 0), c('roc_20d', '>', 0.05)],
    },
    is_enabled: true,
    sort_order: 4,
  },
  {
    key: 'overbought',
    side: 'sell',
    ta_name: 'Overbought',
    message_title: 'Bán khi giá đã tăng nóng',
    combination: { logic: 'AND', conditions: [c('rsi_14', '>', 70), c('dist_ma_20', '>', 0.1)] },
    is_enabled: true,
    sort_order: 5,
  },
  {
    key: 'breakdown',
    side: 'sell',
    ta_name: 'Breakdown',
    message_title: 'Bán khi giá vỡ hỗ trợ',
    combination: {
      logic: 'OR',
      conditions: [c('breakdown_20d', 'is_true'), c('bb_breakout_down', 'is_true')],
    },
    is_enabled: true,
    sort_order: 6,
  },
  {
    key: 'top_reversal',
    side: 'sell',
    ta_name: 'Top Reversal',
    message_title: 'Bán khi nến đảo chiều giảm',
    combination: {
      logic: 'OR',
      conditions: [c('bear_engulfing', 'is_true'), c('shooting_star', 'is_true')],
    },
    is_enabled: true,
    sort_order: 7,
  },
  {
    key: 'squeeze_down',
    side: 'sell',
    ta_name: 'Squeeze Down',
    message_title: 'Bán khi bung nén xuống',
    combination: {
      logic: 'AND',
      conditions: [c('bb_breakout_down', 'is_true'), c('vol_zscore', '>', 1)],
    },
    is_enabled: true,
    sort_order: 8,
  },
  {
    key: 'trend_break',
    side: 'sell',
    ta_name: 'Trend Break',
    message_title: 'Bán khi gãy xu hướng',
    combination: {
      logic: 'OR',
      conditions: [c('death_cross', 'is_true'), c('macd_bear_cross', 'is_true')],
    },
    is_enabled: true,
    sort_order: 9,
  },
] as const;

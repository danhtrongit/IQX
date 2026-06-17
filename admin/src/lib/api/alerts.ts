import { api } from "./client"

export type AlertSide = "buy" | "sell"
export type AlertLogic = "AND" | "OR"

export interface AlertCondition {
  indicator: string
  op: string
  value: number | string | null
}

export interface AlertCombination {
  logic: AlertLogic
  conditions: AlertCondition[]
}

export interface AlertSignal {
  key: string
  side: AlertSide
  taName: string
  messageTitle: string
  combination: AlertCombination
  isEnabled: boolean
  sortOrder: number
}

export interface AlertSignalUpsert {
  side: AlertSide
  taName: string
  messageTitle: string
  combination: AlertCombination
  isEnabled: boolean
  sortOrder: number
}

interface RawSignal {
  key: string
  side: AlertSide
  ta_name: string
  message_title: string
  combination: AlertCombination
  is_enabled: boolean
  sort_order: number
}

function adapt(r: RawSignal): AlertSignal {
  return {
    key: r.key,
    side: r.side,
    taName: r.ta_name,
    messageTitle: r.message_title,
    combination: r.combination ?? { logic: "AND", conditions: [] },
    isEnabled: r.is_enabled,
    sortOrder: r.sort_order,
  }
}

function toRaw(body: AlertSignalUpsert) {
  return {
    side: body.side,
    ta_name: body.taName,
    message_title: body.messageTitle,
    combination: body.combination,
    is_enabled: body.isEnabled,
    sort_order: body.sortOrder,
  }
}

export const alertsAdminApi = {
  list: (): Promise<AlertSignal[]> =>
    api.get("admin/alerts/signals").json<RawSignal[]>().then((rs) => rs.map(adapt)),

  update: (key: string, body: AlertSignalUpsert): Promise<AlertSignal> =>
    api.put(`admin/alerts/signals/${key}`, { json: toRaw(body) }).json<RawSignal>().then(adapt),

  create: (key: string, body: AlertSignalUpsert): Promise<AlertSignal> =>
    api.post("admin/alerts/signals", { json: { key, ...toRaw(body) } }).json<RawSignal>().then(adapt),

  remove: (key: string): Promise<void> =>
    api.delete(`admin/alerts/signals/${key}`).then(() => undefined),

  seed: (overwrite = false): Promise<{ created: number; overwrite: boolean }> =>
    api
      .post("admin/alerts/seed", { searchParams: { overwrite: String(overwrite) } })
      .json<{ created: number; overwrite: boolean }>(),
}

/** The 38 indicators + raw price fields a condition may reference. */
export const ALERT_INDICATORS = [
  "ma_5", "ma_20", "ma_50", "ma_200", "ma_stack_bull", "uptrend", "death_cross",
  "ma_20_slope", "dist_ma_20", "dist_ma_200", "rsi_14", "macd_hist", "macd_bull_cross",
  "macd_bear_cross", "roc_20d", "atr_14", "atr_pct", "bb_width", "bb_squeeze",
  "bb_breakout_down", "vol_ma_20", "vol_zscore", "obv", "obv_ma_20", "high_20",
  "high_52w", "dist_52w_high", "breakout_20d", "breakout_52w", "low_20", "low_52w",
  "dist_52w_low", "breakdown_20d", "breakdown_52w", "hammer", "bull_engulfing",
  "bear_engulfing", "shooting_star", "close", "open", "high", "low", "volume",
]

export const ALERT_OPS = [">", "<", ">=", "<=", "==", "cross_above", "cross_below", "is_true"]

export const BINARY_INDICATORS = new Set([
  "ma_stack_bull", "uptrend", "death_cross", "macd_bull_cross", "macd_bear_cross",
  "bb_squeeze", "bb_breakout_down", "breakout_20d", "breakout_52w", "breakdown_20d",
  "breakdown_52w", "hammer", "bull_engulfing", "bear_engulfing", "shooting_star",
])

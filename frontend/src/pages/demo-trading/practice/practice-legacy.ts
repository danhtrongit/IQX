/**
 * Runs locked before SPEC V3 keep their config in the old per-side format (`params` + `ops` with
 * the rule ids `r1`, `r2`...) and stay viewable, untouched. The forms that described those params
 * no longer exist, so the labels of the old params live here, copied from the registry of the
 * time. Nothing here is used to edit or start anything.
 */

type LegacyParam = readonly [indicator: string, key: string, label: string, unit?: string]

const SESSIONS = "phiên"

const LEGACY_PARAMS: readonly LegacyParam[] = [
  ["rsi", "period", "Chu kỳ RSI", SESSIONS],
  ["rsi", "level", "Ngưỡng RSI"],
  ["macd", "fast", "Chu kỳ EMA nhanh", SESSIONS],
  ["macd", "slow", "Chu kỳ EMA chậm", SESSIONS],
  ["macd", "signal", "Chu kỳ đường tín hiệu", SESSIONS],
  ["ma", "period", "Chu kỳ SMA", SESSIONS],
  ["ma", "fast", "Chu kỳ SMA nhanh", SESSIONS],
  ["ma", "slow", "Chu kỳ SMA chậm", SESSIONS],
  ["ma", "trend_period", "Chu kỳ xu hướng SMA", SESSIONS],
  ["bollinger", "period", "Chu kỳ Bollinger", SESSIONS],
  ["bollinger", "k", "Hệ số dải"],
  ["ema", "period", "Chu kỳ EMA", SESSIONS],
  ["ema", "fast", "Chu kỳ EMA nhanh", SESSIONS],
  ["ema", "slow", "Chu kỳ EMA chậm", SESSIONS],
  ["ema", "trend_period", "Chu kỳ xu hướng EMA", SESSIONS],
  ["ma_cross", "fast", "Chu kỳ SMA nhanh", SESSIONS],
  ["ma_cross", "slow", "Chu kỳ SMA chậm", SESSIONS],
  ["dmi", "period", "Chu kỳ DMI", SESSIONS],
  ["dmi", "level", "Ngưỡng ADX"],
  ["stochastic", "k", "Chu kỳ %K", SESSIONS],
  ["stochastic", "d", "Chu kỳ %D", SESSIONS],
  ["stochastic", "smooth", "Chu kỳ trung bình %K", SESSIONS],
  ["stochastic", "level", "Ngưỡng %K"],
  ["cci", "period", "Chu kỳ CCI", SESSIONS],
  ["cci", "level", "Ngưỡng CCI"],
  ["obv", "baseline", "Chu kỳ SMA của OBV", SESSIONS],
  ["obv", "breakout_period", "Số phiên OBV", SESSIONS],
  ["mfi", "period", "Chu kỳ MFI", SESSIONS],
  ["mfi", "level", "Ngưỡng MFI"],
  ["cmf", "period", "Chu kỳ CMF", SESSIONS],
  ["cmf", "level", "Ngưỡng CMF"],
  ["donchian", "period", "Chu kỳ Donchian", SESSIONS],
  ["roc", "period", "Chu kỳ ROC", SESSIONS],
  ["roc", "level", "Ngưỡng ROC", "%"],
  ["williams_r", "period", "Chu kỳ Williams %R", SESSIONS],
  ["williams_r", "level", "Ngưỡng Williams %R"],
]

export type ParamMeta = { label: string; unit: string }

const BY_KEY = new Map<string, ParamMeta>(
  LEGACY_PARAMS.map(([indicator, key, label, unit]) => [`${indicator}.${key}`, { label, unit: unit ?? "" }]),
)

/** Label and unit of a side param of a run locked before SPEC V3, or null when it is unknown. */
export function legacyParamMeta(indicatorId: string, key: string): ParamMeta | null {
  return BY_KEY.get(`${indicatorId}.${key}`) ?? null
}

/** `r2` -> `Điều kiện 2`; any other id is shown as it is. */
export function legacyRuleLabel(ruleId: string): string {
  const match = /^r(\d+)$/.exec(ruleId)
  return match ? `Điều kiện ${match[1]}` : ruleId
}

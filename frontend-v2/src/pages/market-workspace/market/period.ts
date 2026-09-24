import type { SessionPeriod } from "./types"

const PRE_MARKET_END = 9 * 60 + 15 // 09:15
const POST_MARKET_START = 15 * 60 + 30 // 15:30

export interface GetDefaultActivePeriodOptions {
  /** Override when a trading-calendar source is available; defaults to "not a weekend". */
  isTradingDay?: boolean
}

/**
 * Which brief a visitor most likely wants when the workspace opens: before the
 * ATO window → pre-market, during the session → mid-day, after the close →
 * end-of-day. Computed once on mount, never re-evaluated while viewing.
 */
export function getDefaultActivePeriod(
  now: Date,
  opts?: GetDefaultActivePeriodOptions,
): SessionPeriod {
  const day = now.getDay()
  const weekend = day === 0 || day === 6
  const isTradingDay = opts?.isTradingDay ?? !weekend
  if (!isTradingDay) return "eod"

  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes < PRE_MARKET_END) return "premarket"
  if (minutes < POST_MARKET_START) return "midday"
  return "eod"
}

export type SessionPeriod = "premarket" | "midday" | "eod"

export interface GetDefaultActivePeriodOptions {
  /** Override khi có nguồn lịch giao dịch; mặc định suy từ thứ trong tuần. */
  isTradingDay?: boolean
}

const PRE_MARKET_END = 9 * 60 + 15 // 09:15
const POST_MARKET_START = 15 * 60 + 30 // 15:30

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

export type DisplayMode = "eod_yesterday" | "midday_loading" | "midday" | "eod_today"

export interface GetDisplayModeOptions {
  isTradingDay?: boolean
}

export function getDisplayMode(
  now: Date,
  opts?: GetDisplayModeOptions
): DisplayMode {
  const { isTradingDay = true } = opts ?? {}

  // Non-trading day always shows eod_yesterday
  if (!isTradingDay) {
    return "eod_yesterday"
  }

  // Calculate minutes of day in ICT (local hours)
  const minutesOfDay = now.getHours() * 60 + now.getMinutes()

  // Rules:
  // < 690 (11:30) → eod_yesterday
  // 690–704 (11:30–11:44) → midday_loading
  // 705–989 (11:45–16:29) → midday
  // >= 990 (16:30) → eod_today

  if (minutesOfDay < 690) {
    return "eod_yesterday"
  }

  if (minutesOfDay <= 704) {
    return "midday_loading"
  }

  if (minutesOfDay <= 989) {
    return "midday"
  }

  return "eod_today"
}

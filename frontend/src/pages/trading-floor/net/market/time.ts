/** Vietnam has no daylight saving: always UTC+7. Fixed arithmetic keeps tests independent of the machine's zone. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

export interface VnTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 is Sunday. */
  weekday: number
}

export function vnParts(epochMs: number): VnTime {
  const shifted = new Date(epochMs + VN_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  }
}

/** Minutes after midnight, Vietnam time. */
const at = (hour: number, minute: number): number => hour * 60 + minute

/** HOSE and HNX: morning from 09:00, lunch break, afternoon to the 14:45 close (ATC ends 14:45). */
const OPEN = at(9, 0)
const LUNCH_START = at(11, 30)
const LUNCH_END = at(13, 0)
const CLOSE = at(14, 45)

/** Where the clock stands in the trading day. Public holidays are not known here. */
export type SessionPhase = "weekend" | "before" | "open" | "lunch" | "after"

export function sessionPhase(epochMs: number): SessionPhase {
  const { weekday, hour, minute } = vnParts(epochMs)
  if (weekday === 0 || weekday === 6) return "weekend"
  const minutes = at(hour, minute)
  if (minutes < OPEN) return "before"
  if (minutes < LUNCH_START) return "open"
  if (minutes < LUNCH_END) return "lunch"
  if (minutes < CLOSE) return "open"
  return "after"
}

/** Milliseconds until the session phase can change today, or null when it cannot change before midnight. */
export function msToNextPhase(epochMs: number): number | null {
  const { hour, minute, second } = vnParts(epochMs)
  const minutes = at(hour, minute)
  const next = [OPEN, LUNCH_START, LUNCH_END, CLOSE].find(
    (boundary) => boundary > minutes
  )
  if (next === undefined) return null
  return (next - minutes) * MINUTE_MS - second * 1000
}

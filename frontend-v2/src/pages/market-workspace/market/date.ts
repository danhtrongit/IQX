/**
 * Local-date helpers for the market workspace.
 *
 * Single source of truth for "today" in the browser's timezone: the `/latest`
 * query keys must roll over at local midnight so a cached brief from yesterday
 * can never be served as today's, and the session views compare
 * `session_date` against the same value to detect a stale brief.
 */
import { useEffect, useState } from "react"

/** Today's date as "YYYY-MM-DD" in the local timezone. */
export function localTodayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** True when `iso` is today's local date. */
export function isSameLocalDay(iso: string | null | undefined): boolean {
  return !!iso && iso === localTodayIso()
}

/** ms until the next local midnight, plus a small buffer so we land on the new day. */
function msUntilNextLocalDay(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return Math.max(0, next.getTime() - now.getTime()) + 50
}

/**
 * Today's local ISO date, refreshed at midnight and whenever the tab becomes
 * visible again (a laptop that slept through midnight must not keep showing
 * yesterday's session).
 */
export function useLocalTodayIso(): string {
  const [today, setToday] = useState(localTodayIso)

  useEffect(() => {
    let timeoutId = 0

    const sync = () => {
      setToday((prev) => {
        const next = localTodayIso()
        return next === prev ? prev : next
      })
    }

    const arm = () => {
      timeoutId = window.setTimeout(() => {
        sync()
        arm()
      }, msUntilNextLocalDay())
    }

    arm()
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return today
}

const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]

/** "2026-06-30" → "Thứ Ba, 30/06/2026". Malformed input → "". */
export function formatSessionDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ""
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ""
  return `${WEEKDAYS_VI[d.getDay()]}, ${m[3]}/${m[2]}/${m[1]}`
}

/** "07:15" of a Vietnam-local `YYYY-MM-DD HH:mm:ss` stamp, for provenance lines. */
export function formatGeneratedAt(value: string | null | undefined): string {
  if (!value) return ""
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(value)
  if (!m) return ""
  return `${m[2]} · ${formatSessionDate(m[1])}`
}

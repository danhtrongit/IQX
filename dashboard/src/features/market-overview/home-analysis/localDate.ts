// ─── Local-date helpers shared across session views ───────────────────────────
// Single source of truth for "today's ISO date in local time". Used by:
//   • HomeMarketView  (newPeriod pill logic)
//   • MidDayView      (stale-brief date gate)
//   • PreMarketView   (stale-brief date gate)

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
export function localTodayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Returns true if `iso` matches today's local date. */
export function isSameLocalDay(iso: string): boolean {
  return iso === localTodayIso()
}

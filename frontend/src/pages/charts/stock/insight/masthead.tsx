/**
 * AI Insight v2 brand header: "AI Insight" + "Bản tin cổ phiếu" and the
 * analysis timestamp. Dates are formatted with Intl — this app ships no date
 * library.
 */
const DATE_PARTS = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const TIME = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** e.g. "Thứ Sáu, 19/06/2026 · 10:38"; an unparseable value is echoed back. */
export function formatInsightTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const parts: Record<string, string> = {}
  for (const part of DATE_PARTS.formatToParts(date)) parts[part.type] = part.value

  const rawWeekday = parts.weekday ?? ""
  const weekday = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1)
  const day = `${parts.day}/${parts.month}/${parts.year}`
  const time = TIME.format(date)
  return weekday ? `${weekday}, ${day} · ${time}` : `${day} · ${time}`
}

/** e.g. "10:38"; an unparseable value is echoed back. */
export function formatInsightTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : TIME.format(date)
}

export function Masthead({ updatedAt }: { updatedAt: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-3">
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-lg font-bold tracking-tight text-price-ref">
          AI Insight
        </span>
        <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Bản tin cổ phiếu
        </span>
      </div>
      <time
        dateTime={updatedAt}
        className="text-xs tracking-wide text-muted-foreground tabular-nums"
      >
        {formatInsightTimestamp(updatedAt)}
      </time>
    </header>
  )
}

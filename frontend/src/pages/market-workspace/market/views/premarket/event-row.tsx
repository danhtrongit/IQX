// ─── Event row ────────────────────────────────────────────────────────────────
// One dated event on today's timeline. The legacy glyph table is mapped to
// Lucide icons (ex_dividend → Banknote, agm → Users, insider → TrendingUp,
// listing → Star, anything else → Dot); the impact chip keeps the legacy labels
// and reads high = destructive, medium = accent, low = muted.

import { Banknote, Dot, Star, TrendingUp, Users, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import type { ResolvedEvent } from "../../types"
import { TickerPill } from "./ticker-pill"

const EVENT_ICON: Record<string, LucideIcon> = {
  ex_dividend: Banknote,
  agm: Users,
  insider: TrendingUp,
  listing: Star,
  other: Dot,
}

const IMPACT_LABEL: Record<string, string> = {
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
}

const IMPACT_TONE: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-accent/15 text-accent",
  low: "bg-muted text-muted-foreground",
}

export function EventRow({ event }: { event: ResolvedEvent }) {
  const Icon = EVENT_ICON[event.type] ?? Dot
  const tickers = event.tickers ?? []

  return (
    <div className="flex items-start gap-2.5 rounded-md bg-secondary px-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{event.time_label}</div>
        <div className="mt-0.5 text-sm font-semibold leading-snug">{event.title}</div>
        {tickers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tickers.map((ticker) => (
              <TickerPill key={ticker} ticker={ticker} />
            ))}
          </div>
        )}
        {event.note && (
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{event.note}</div>
        )}
      </div>

      <span
        className={cn(
          "shrink-0 self-center rounded-sm px-1.5 py-0.5 text-xs font-bold tracking-[0.04em]",
          IMPACT_TONE[event.impact] ?? IMPACT_TONE.low,
        )}
      >
        {IMPACT_LABEL[event.impact] ?? event.impact}
      </span>
    </div>
  )
}

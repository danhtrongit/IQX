import { Coffee, Moon, Sun, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { SESSION_LABEL, SESSION_TIME, type SessionPeriod } from "./types"

const TAB_ICONS: Record<SessionPeriod, LucideIcon> = {
  premarket: Sun,
  midday: Coffee,
  eod: Moon,
}

const SESSION_ORDER: SessionPeriod[] = ["premarket", "midday", "eod"]

/**
 * Session tabs. All three are always shown; the active one is chosen from the
 * time of day on mount. The "MỚI" pill marks the brief whose `generated_at` is
 * the newest of today's three — the only signal that a session's report has
 * been republished.
 */
export function SessionTabs({
  active,
  onSelect,
  newPeriod,
}: {
  active: SessionPeriod
  onSelect: (period: SessionPeriod) => void
  newPeriod: SessionPeriod | null
}) {
  return (
    <div
      role="tablist"
      aria-label="Phiên nhận định"
      className="no-scrollbar flex overflow-x-auto border-b border-border"
    >
      {SESSION_ORDER.map((period) => {
        const Icon = TAB_ICONS[period]
        const isActive = active === period
        return (
          <button
            key={period}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(period)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors duration-150",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {SESSION_LABEL[period]}
            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
              · {SESSION_TIME[period]}
            </span>
            {newPeriod === period && (
              <span className="rounded-sm bg-accent/15 px-1.5 py-px text-[10px] font-semibold text-accent">
                MỚI
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

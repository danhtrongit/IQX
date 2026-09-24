// ─── MidDayTakeaway — kịch bản phiên chiều + mã đáng quan sát ────────────────
// Prop-driven (MidDayView owns the fetch). Two blocks side by side:
//   • "Kịch bản phiên chiều" — 3 kịch bản (điều kiện → hệ quả) + countdown 14:45
//   • "Đáng quan sát phiên chiều" — 5 mã, tô nền theo alert_level
// Every AI-authored fragment goes through RichText (no raw HTML injection).

import { useEffect, useState, type ReactNode } from "react"
import { AlarmClock, Eye, Target, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { RichText } from "../../rich-text"
import type { MidDayAnalysis } from "../../types"

const COUNTDOWN_TICK_MS = 60_000

/** Countdown to 14:45 — the afternoon session's last useful entry window. */
function useCountdownTo1445(): string {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((tick) => tick + 1), COUNTDOWN_TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const now = new Date()
  const target = new Date(now)
  target.setHours(14, 45, 0, 0)
  if (now >= target) return ""

  const diffMin = Math.floor((target.getTime() - now.getTime()) / COUNTDOWN_TICK_MS)
  const hours = Math.floor(diffMin / 60)
  const minutes = diffMin % 60
  return hours > 0 ? `${hours}g ${minutes}p` : `${minutes}p`
}

function CountdownPill() {
  const remaining = useCountdownTo1445()
  if (!remaining) return null

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent/10 px-2.5 py-0.5 text-xs font-semibold tracking-[0.02em] text-accent"
      aria-label={`Còn ${remaining} đến 14:45`}
    >
      <AlarmClock className="size-3.5" aria-hidden />
      {remaining}
    </span>
  )
}

function BlockTitle({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children?: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  )
}

function ScenarioItem({ type, condition, outcome }: { type: "up" | "down"; condition: string; outcome: string }) {
  return (
    <li className="flex items-start gap-3 text-[13px] leading-relaxed text-foreground">
      <span
        className={cn("mt-[9px] size-1.5 shrink-0 rounded-full", type === "up" ? "bg-price-up" : "bg-price-down")}
        aria-hidden
      />
      <div>
        <RichText html={condition} />
        <span className="mx-1 text-muted-foreground" aria-hidden>
          →
        </span>
        <span className={cn("font-semibold", type === "up" ? "text-price-up" : "text-price-down")}>
          <RichText html={outcome} />
        </span>
      </div>
    </li>
  )
}

function WatchlistItem({
  ticker,
  alertLevel,
  reason,
}: {
  ticker: string
  alertLevel: "normal" | "alert" | "warn"
  reason: string
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md px-2 py-1 text-[13px] leading-relaxed",
        alertLevel === "warn" ? "bg-destructive/10" : alertLevel === "alert" ? "bg-accent/10" : null,
      )}
    >
      <span
        className={cn(
          "mt-[9px] size-1.5 shrink-0 rounded-full",
          alertLevel === "warn" ? "bg-destructive" : alertLevel === "alert" ? "bg-accent" : "bg-muted-foreground",
        )}
        aria-hidden
      />
      <div>
        <span className="font-heading font-bold tracking-tight text-foreground">{ticker}</span>{" "}
        <span className="text-muted-foreground">— </span>
        <RichText html={reason} className="text-muted-foreground" />
      </div>
    </li>
  )
}

export function MidDayTakeaway({
  data,
  showCountdown = true,
}: {
  data: MidDayAnalysis
  /** Gate the 14:45 countdown to today's brief only — a stale brief must not look live. */
  showCountdown?: boolean
}) {
  const scenarios = data.scenarios.slice(0, 3)
  const watchlist = data.watchlist.slice(0, 5)

  return (
    <section
      data-tour-id="tour-bantin-mid-takeaway"
      aria-label="Kịch bản và danh sách quan sát phiên chiều"
      className="rounded-lg border-l-2 border-l-accent bg-card p-5"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <BlockTitle icon={Target} label="Kịch bản phiên chiều">
            {showCountdown && <CountdownPill />}
          </BlockTitle>
          {scenarios.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Chưa có kịch bản.</p>
          ) : (
            <ul className="flex list-none flex-col gap-2.5 p-0">
              {scenarios.map((scenario, index) => (
                <ScenarioItem
                  key={index}
                  type={scenario.type}
                  condition={scenario.condition}
                  outcome={scenario.outcome}
                />
              ))}
            </ul>
          )}
        </div>

        <div>
          <BlockTitle icon={Eye} label="Đáng quan sát phiên chiều" />
          {watchlist.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Chưa có mã nào.</p>
          ) : (
            <>
              <ul className="flex list-none flex-col gap-1.5 p-0">
                {watchlist.map((item, index) => (
                  <WatchlistItem key={index} ticker={item.key} alertLevel={item.alert_level} reason={item.reason} />
                ))}
              </ul>
              <p className="mt-3.5 text-xs leading-[1.55] text-muted-foreground">
                Lý do quan sát dựa trên dòng tiền phiên sáng. Không phải khuyến nghị mua/bán.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

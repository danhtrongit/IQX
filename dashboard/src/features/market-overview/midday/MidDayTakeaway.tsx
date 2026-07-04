// ─── MidDayTakeaway — orange variant of MarketTakeaway ───────────────────────
// Prop-driven (MidDayView owns the fetch). Renders:
//   • "Kịch bản phiên chiều" — 3 scenario bullets (condition/outcome sanitized) +
//     a countdown pill to 14:45
//   • "Đáng quan sát phiên chiều" — 5 watchlist bullets styled by alert_level
// HTML content is sanitized via sanitizeInline — same mechanism as MarketTakeaway.

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { sanitizeInline } from "@/shared/utils/sanitize-inline"
import type { MidDayAnalysis } from "./types"
import "./midday.css"

// ─── Countdown to 14:45 ───────────────────────────────────────────────────────

function useCountdownTo1445(): string {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])
  const now = new Date()
  const target = new Date(now)
  target.setHours(14, 45, 0, 0)
  if (now >= target) return ""
  const diffMs = target.getTime() - now.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  if (h > 0) return `${h}g ${m}p`
  return `${m}p`
}

function CountdownPill() {
  const remaining = useCountdownTo1445()
  if (!remaining) return null
  return (
    <span className="mm-countdown-pill" aria-label={`Còn ${remaining} đến 14:45`}>
      ⏰ {remaining}
    </span>
  )
}

// ─── Block heading ────────────────────────────────────────────────────────────

function BlockTitle({ icon, label, children }: { icon: string; label: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3.5 flex-wrap">
      <span className="text-sm" aria-hidden>{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-2)]">
        {label}
      </span>
      {children}
    </div>
  )
}

// ─── Scenario item ────────────────────────────────────────────────────────────

function ScenarioItem({
  type,
  condition,
  outcome,
}: {
  type: "up" | "down"
  condition: string
  outcome: string
}) {
  const dotColor = type === "up" ? "#10b981" : "#ef4444"
  const outcomeColor = type === "up" ? "#10b981" : "#ef4444"

  return (
    <li className="flex items-start gap-3 text-[13px] leading-[1.6] text-[var(--color-text-1)]">
      <span
        className="mt-[9px] flex-shrink-0"
        style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }}
        aria-hidden
      />
      <div>
        <span
          dangerouslySetInnerHTML={{ __html: sanitizeInline(condition) }}
        />
        <span className="mx-1 text-[var(--color-text-3)]" aria-hidden>→</span>
        <span
          className="font-semibold"
          style={{ color: outcomeColor }}
          dangerouslySetInnerHTML={{ __html: sanitizeInline(outcome) }}
        />
      </div>
    </li>
  )
}

// ─── Watchlist item ───────────────────────────────────────────────────────────

function WatchlistItem({
  ticker,
  alert_level,
  reason,
}: {
  ticker: string
  alert_level: "normal" | "alert" | "warn"
  reason: string
}) {
  const dotColor =
    alert_level === "warn"
      ? "#ef4444"
      : alert_level === "alert"
        ? "#eab308"
        : "var(--color-text-3)"

  const rowClass =
    alert_level === "warn"
      ? "mm-watchlist-row--warn"
      : alert_level === "alert"
        ? "mm-watchlist-row--alert"
        : ""

  return (
    <li className={`flex items-start gap-3 text-[13px] leading-[1.6] px-2 py-1 ${rowClass}`}>
      <span
        className="mt-[9px] flex-shrink-0"
        style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }}
        aria-hidden
      />
      <div>
        <span className="font-bold text-[var(--color-text-1)] font-mono tracking-tight">
          {ticker}
        </span>{" "}
        <span
          className="text-[var(--color-text-2)]"
          dangerouslySetInnerHTML={{ __html: `— ${sanitizeInline(reason)}` }}
        />
      </div>
    </li>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MidDayTakeaway({
  data,
  showCountdown = true,
}: {
  data: MidDayAnalysis
  /** Gate the 14:45 countdown to today's brief only. Defaults true for backwards-compat. */
  showCountdown?: boolean
}) {
  const { scenarios, watchlist } = data
  const displayScenarios = scenarios.slice(0, 3)
  const displayWatchlist = watchlist.slice(0, 5)

  return (
    <section
      className="mm-takeaway relative overflow-hidden rounded-2xl border border-[var(--color-border-2)] mb-3.5"
      style={{
        background: "linear-gradient(135deg, var(--color-bg-2) 0%, var(--color-bg-1) 100%)",
        padding: "22px 24px",
      }}
      aria-label="Kịch bản và danh sách quan sát phiên chiều"
    >
      {/* Orange left accent bar */}
      <span
        className="absolute top-0 bottom-0 left-0"
        style={{ width: 3, background: "linear-gradient(180deg, #FFB347, #FFD580, #FFB347)" }}
        aria-hidden
      />

      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
      >
        {/* ── Left: Scenarios ── */}
        <div>
          <BlockTitle icon="🎯" label="Kịch bản phiên chiều">
            {showCountdown && <CountdownPill />}
          </BlockTitle>
          {displayScenarios.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-3)] italic">Chưa có kịch bản.</p>
          ) : (
            <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
              {displayScenarios.map((s, i) => (
                <ScenarioItem key={i} type={s.type} condition={s.condition} outcome={s.outcome} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Right: Watchlist ── */}
        <div>
          <BlockTitle icon="👁" label="Đáng quan sát phiên chiều" />
          {displayWatchlist.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-3)] italic">Chưa có mã nào.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
                {displayWatchlist.map((w, i) => (
                  <WatchlistItem key={i} ticker={w.key} alert_level={w.alert_level} reason={w.reason} />
                ))}
              </ul>
              <p className="mt-3.5 text-[11px] text-[var(--color-text-3)] leading-[1.55]">
                Lý do quan sát dựa trên dòng tiền phiên sáng. Không phải khuyến nghị mua/bán.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}


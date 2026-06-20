// ─── MarketTakeaway ────────────────────────────────────────────────────────────
// Mirrors the terminal's `.takeaway` block (iqx-terminal-final.html).
// Two-column layout:
//   Left  — "Kịch bản phiên sau" (scenarios: condition → outcome, up/down dot)
//   Right — "Đáng quan sát" (watchlist: ticker + reason, alert → amber dot+bg)
// All *_html fields are sanitized via sanitizeInline before dangerouslySetInnerHTML.

import { Skeleton } from "@arco-design/web-react"
import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"
import { sanitizeInline } from "@/shared/utils/sanitize-inline"
import type { DailyAnalysis } from "./types"

// ─── Scenario item ────────────────────────────────────────────────────────────

interface ScenarioItemProps {
  direction: "up" | "down"
  condition_html: string
  outcome_html: string
}

function ScenarioItem({ direction, condition_html, outcome_html }: ScenarioItemProps) {
  const dotColor = direction === "up" ? "#10b981" : "#ef4444"
  const outcomeColor = direction === "up" ? "#10b981" : "#ef4444"

  return (
    <li
      className="flex items-start gap-3 text-[13px] leading-[1.6] text-[var(--color-text-1)]"
    >
      {/* Direction dot */}
      <span
        className="mt-[9px] flex-shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
        }}
        aria-hidden
      />
      <div>
        <span
          className="mt-takeaway-condition"
          dangerouslySetInnerHTML={{ __html: sanitizeInline(condition_html) }}
        />
        <span
          className="mx-1 text-[var(--color-text-3)]"
          aria-hidden
        >
          →
        </span>
        <span
          className="font-semibold"
          style={{ color: outcomeColor }}
          dangerouslySetInnerHTML={{ __html: sanitizeInline(outcome_html) }}
        />
      </div>
    </li>
  )
}

// ─── Watchlist item ───────────────────────────────────────────────────────────

interface WatchlistItemProps {
  ticker: string
  alert: boolean
  reason_html: string
}

function WatchlistItem({ ticker, alert, reason_html }: WatchlistItemProps) {
  const dotColor = alert ? "#eab308" : "var(--color-text-3)"

  return (
    <li
      className={[
        "flex items-start gap-3 text-[13px] leading-[1.6] rounded-md px-2 py-1",
        alert
          ? "bg-[color-mix(in_oklch,#eab308_8%,transparent)]"
          : "",
      ].join(" ")}
    >
      {/* Alert / neutral dot */}
      <span
        className="mt-[9px] flex-shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
        }}
        aria-hidden
      />
      <div>
        <span className="font-bold text-[var(--color-text-1)] font-mono tracking-tight">
          {ticker}
        </span>{" "}
        <span
          className="text-[var(--color-text-2)]"
          dangerouslySetInnerHTML={{ __html: `— ${sanitizeInline(reason_html)}` }}
        />
      </div>
    </li>
  )
}

// ─── Column heading ───────────────────────────────────────────────────────────

function BlockTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3.5">
      <span className="text-[rgb(var(--primary-6))] text-sm" aria-hidden>
        {icon}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-2)]">
        {label}
      </span>
    </div>
  )
}

// ─── Body (given data) ────────────────────────────────────────────────────────

function TakeawayBody({ data }: { data: DailyAnalysis }) {
  const { scenarios, watchlist } = data

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[var(--color-border-2)] mb-3.5"
      style={{
        background: "linear-gradient(135deg, var(--color-bg-2) 0%, var(--color-bg-1) 100%)",
        padding: "22px 24px",
      }}
      aria-label="Kịch bản và danh sách quan sát"
    >
      {/* Left accent bar */}
      <span
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: 3,
          background: "linear-gradient(180deg, #10b981, #eab308, #ef4444)",
        }}
        aria-hidden
      />

      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
      >
        {/* ── Left: Scenarios ── */}
        <div>
          <BlockTitle icon="🎯" label="Kịch bản phiên sau" />
          {scenarios.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-3)] italic">
              Chưa có kịch bản.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
              {scenarios.map((s, i) => (
                <ScenarioItem
                  key={i}
                  direction={s.direction}
                  condition_html={s.condition_html}
                  outcome_html={s.outcome_html}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Right: Watchlist ── */}
        <div>
          <BlockTitle icon="👁" label="Đáng quan sát" />
          {watchlist.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-3)] italic">
              Chưa có mã nào.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
                {watchlist.map((w, i) => (
                  <WatchlistItem
                    key={i}
                    ticker={w.ticker}
                    alert={w.alert}
                    reason_html={w.reason_html}
                  />
                ))}
              </ul>
              <p className="mt-3.5 text-[11px] text-[var(--color-text-3)] leading-[1.55]">
                Lý do quan sát dựa trên dòng tiền bất thường + đóng góp lớn vào Index.
                Không phải khuyến nghị mua/bán.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TakeawaySkeleton() {
  return (
    <div
      className="rounded-2xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-5 mb-3.5"
      aria-label="Đang tải kịch bản..."
    >
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {[0, 1].map((col) => (
          <div key={col} className="flex flex-col gap-2.5">
            <Skeleton animation text={{ rows: 1, width: "60%" }} image={false} />
            <Skeleton animation text={{ rows: 3, width: "100%" }} image={false} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function MarketTakeaway() {
  const { data, isLoading, isError } = useDailyMarketAnalysis()

  if (isLoading) return <TakeawaySkeleton />

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-5 mb-3.5 text-center text-[12px] text-[var(--color-text-3)] italic">
        Không thể tải kịch bản thị trường.
      </div>
    )
  }

  return <TakeawayBody data={data} />
}

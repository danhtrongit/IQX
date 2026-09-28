import type { ReactNode } from "react"
import { ArrowRight, Eye, Target } from "lucide-react"

import { cn } from "@/lib/utils"

import { RichText } from "../../rich-text"
import type { DailyAnalysis } from "../../types"

function BlockTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <span aria-hidden className="text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  )
}

function ScenarioItem({
  direction,
  condition_html,
  outcome_html,
}: {
  direction: "up" | "down"
  condition_html: string
  outcome_html: string
}) {
  const isUp = direction === "up"
  return (
    <li className="flex items-start gap-3 text-[13px] leading-relaxed text-foreground">
      <span
        aria-hidden
        className={cn("mt-[9px] size-1.5 shrink-0 rounded-full", isUp ? "bg-price-up" : "bg-price-down")}
      />
      <div>
        <RichText html={condition_html} />
        <ArrowRight aria-hidden className="mx-1 inline size-3 text-muted-foreground" />
        <span className={cn("font-semibold", isUp ? "text-price-up" : "text-price-down")}>
          <RichText html={outcome_html} />
        </span>
      </div>
    </li>
  )
}

function WatchlistItem({
  ticker,
  alert,
  reason_html,
}: {
  ticker: string
  alert: boolean
  reason_html: string
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-sm px-2 py-1 text-[13px] leading-relaxed",
        alert && "bg-accent/10",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[9px] size-1.5 shrink-0 rounded-full",
          alert ? "bg-accent" : "bg-muted-foreground/60",
        )}
      />
      <div>
        <span className="font-bold tracking-tight text-foreground">{ticker}</span>{" "}
        <span className="text-muted-foreground">
          — <RichText html={reason_html} />
        </span>
      </div>
    </li>
  )
}

/**
 * The end-of-day "takeaway" block: tomorrow's scenarios on the left, the
 * watch-list on the right. An alert watch item is marked with the gold accent,
 * and the block always carries the "not a recommendation" footnote.
 */
export function MarketTakeaway({ data }: { data: DailyAnalysis }) {
  const { scenarios, watchlist } = data

  return (
    <section
      aria-label="Kịch bản và danh sách quan sát"
      className="relative overflow-hidden rounded-lg bg-card p-4"
    >
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-0 w-[3px] bg-gradient-to-b from-price-up via-price-ref to-price-down"
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <BlockTitle icon={<Target />} label="Kịch bản phiên sau" />
          {scenarios.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Chưa có kịch bản.</p>
          ) : (
            <ul className="flex list-none flex-col gap-2.5 p-0">
              {scenarios.map((scenario, index) => (
                <ScenarioItem
                  key={index}
                  direction={scenario.direction}
                  condition_html={scenario.condition_html}
                  outcome_html={scenario.outcome_html}
                />
              ))}
            </ul>
          )}
        </div>

        <div>
          <BlockTitle icon={<Eye />} label="Đáng quan sát" />
          {watchlist.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Chưa có mã nào.</p>
          ) : (
            <>
              <ul className="flex list-none flex-col gap-1.5 p-0">
                {watchlist.map((item, index) => (
                  <WatchlistItem
                    key={index}
                    ticker={item.ticker}
                    alert={item.alert}
                    reason_html={item.reason_html}
                  />
                ))}
              </ul>
              <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
                Lý do quan sát dựa trên dòng tiền bất thường + đóng góp lớn vào Index. Không phải
                khuyến nghị mua/bán.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

import { cn } from "@/lib/utils"

import type { MarketCharts } from "../../types"
import { ChartCard } from "./chart-card"

/**
 * The five HOSE breadth rows, in the legacy order. Ceiling/floor keep their own
 * tokens so a limit-up day never reads as an ordinary gain.
 */
const ROWS = [
  {
    key: "ceiling",
    label: "Tăng trần",
    dot: "bg-price-ceiling",
    bar: "bg-price-ceiling",
    count: "text-price-ceiling",
  },
  { key: "up", label: "Tăng", dot: "bg-price-up", bar: "bg-price-up", count: "text-price-up" },
  {
    key: "flat",
    label: "Đứng giá",
    dot: "bg-muted-foreground/50",
    bar: "bg-muted-foreground/50",
    count: "text-muted-foreground",
  },
  { key: "down", label: "Giảm", dot: "bg-price-down", bar: "bg-price-down", count: "text-price-down" },
  {
    key: "floor",
    label: "Giảm sàn",
    dot: "bg-price-floor",
    bar: "bg-price-floor",
    count: "text-price-floor",
  },
] as const

/** "Độ rộng thị trường HOSE" — 5 horizontal bars + the three summary stats. */
export function BreadthChart({ data }: { data: MarketCharts["breadth"] }) {
  const total = data.ceiling + data.up + data.flat + data.down + data.floor
  const ma20Tone =
    data.pct_above_ma20 === null
      ? "text-muted-foreground"
      : data.pct_above_ma20 < 50
        ? "text-price-down"
        : "text-price-up"
  // A ratio that starts with "1 :" means decliners outnumber advancers.
  const ratioTone = data.ratio_up_down.startsWith("1 :") ? "text-price-down" : "text-price-up"

  return (
    <ChartCard title="Độ rộng thị trường HOSE">
      <div className="mb-3.5 flex flex-col gap-2.5">
        {ROWS.map((row) => {
          const count = data[row.key]
          const widthPct = total > 0 ? (count / total) * 100 : 0
          return (
            <div
              key={row.key}
              className="grid grid-cols-[92px_1fr_44px] items-center gap-2.5 text-xs sm:grid-cols-[100px_1fr_50px]"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", row.dot)} />
                <span>{row.label}</span>
              </div>

              <div className="h-4 overflow-hidden rounded-[3px] bg-muted">
                <div
                  className={cn("h-full rounded-[3px]", row.bar)}
                  style={{ width: `${widthPct}%` }}
                />
              </div>

              <div className={cn("text-right font-bold tabular-nums", row.count)}>{count}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <div>
          <div className="mb-1 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Tỷ lệ T/G
          </div>
          <div className={cn("text-sm font-semibold tabular-nums", ratioTone)}>
            {data.ratio_up_down}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Phân loại
          </div>
          <div className="text-xs leading-snug font-semibold text-muted-foreground">
            {data.classification}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            % &gt; MA20
          </div>
          <div className={cn("text-sm font-semibold tabular-nums", ma20Tone)}>
            {data.pct_above_ma20 === null
              ? "—"
              : `${data.pct_above_ma20.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}%`}
          </div>
        </div>
      </div>
    </ChartCard>
  )
}

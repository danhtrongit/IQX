import { cn } from "@/lib/utils"

import type { MarketCharts } from "../../types"
import { ChartCard } from "./chart-card"

/** Row height and bar height kept from the legacy chart (32 / 26 px). */
const BAR_H = "h-[26px]"
const MIN_BAR = 6

function formatPoints(points: number, positive: boolean): string {
  const abs = Math.abs(points).toFixed(2)
  return positive ? abs : `-${abs}`
}

function TickerBox({ ticker, tone }: { ticker: string; tone: "up" | "down" }) {
  return (
    <div
      className={cn(
        "flex min-w-[46px] shrink-0 items-center justify-center rounded-md px-2 font-bold tracking-[-0.01em] text-primary-foreground",
        BAR_H,
        tone === "up" ? "bg-price-up" : "bg-price-down",
      )}
    >
      {ticker}
    </div>
  )
}

/**
 * "Top mã đóng góp ±" — mirrored diverging bars: negative rows grow leftward
 * from the centre divider with the value on the outer edge, positive rows grow
 * rightward from it. Values are index points, already signed by the backend.
 */
export function ContributionChart({ data }: { data: MarketCharts["contribution"] }) {
  const { top_negative, top_positive } = data

  const maxAbs = Math.max(
    1,
    ...top_negative.map((d) => Math.abs(d.points)),
    ...top_positive.map((d) => Math.abs(d.points)),
  )
  // The bar shares its track with the value label, so ~52px is reserved for the
  // label (+gap): the longest bar fills the rest, shorter bars scale linearly.
  const barWidth = (points: number) =>
    `max(${MIN_BAR}px, calc((100% - 52px) * ${(Math.abs(points) / maxAbs).toFixed(4)}))`

  const rowCount = Math.max(top_negative.length, top_positive.length)
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    neg: i < top_negative.length ? top_negative[i] : null,
    pos: i < top_positive.length ? top_positive[i] : null,
  }))

  if (rows.length === 0) {
    return (
      <ChartCard title="Top mã đóng góp ±">
        <div className="py-6 text-center text-sm text-muted-foreground">
          Không có dữ liệu đóng góp điểm số.
        </div>
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Top mã đóng góp ±">
      <div className="relative">
        <div
          aria-hidden
          className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border"
        />

        <div className="flex flex-col gap-[7px]">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-2 items-center gap-x-[18px]">
              {/* Negative side — value · bar(←) · ticker box at the divider */}
              <div className="flex h-8 items-center gap-1.5 overflow-hidden rounded-sm bg-muted px-1">
                {row.neg && (
                  <>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <span className="text-xs font-semibold tabular-nums whitespace-nowrap text-foreground">
                        {formatPoints(row.neg.points, false)}
                      </span>
                      <div
                        className={cn("shrink-0 rounded-[5px] bg-price-down", BAR_H)}
                        style={{ width: barWidth(row.neg.points) }}
                      />
                    </div>
                    <TickerBox ticker={row.neg.ticker} tone="down" />
                  </>
                )}
              </div>

              {/* Positive side — ticker box at the divider · bar(→) · value */}
              <div className="flex h-8 items-center gap-1.5 overflow-hidden rounded-sm bg-muted px-1">
                {row.pos && (
                  <>
                    <TickerBox ticker={row.pos.ticker} tone="up" />
                    <div className="flex min-w-0 flex-1 items-center justify-start gap-2">
                      <div
                        className={cn("shrink-0 rounded-[5px] bg-price-up", BAR_H)}
                        style={{ width: barWidth(row.pos.points) }}
                      />
                      <span className="text-xs font-semibold tabular-nums whitespace-nowrap text-foreground">
                        {formatPoints(row.pos.points, true)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}

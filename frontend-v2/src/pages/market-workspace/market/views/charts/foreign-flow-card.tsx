import { cn } from "@/lib/utils"

import type { MarketCharts } from "../../types"
import { FlowCard } from "./flow-card"

/**
 * "Khối ngoại" — foreign flow detail. The streak label names which session of
 * the run this is and the 5-day cumulative, both of which the backend may leave
 * null; "—" is shown rather than a fabricated number.
 */
export function ForeignFlowCard({ data }: { data: MarketCharts["foreign_detail"] }) {
  const { streak } = data
  const directionLabel =
    streak.direction === "sell" ? "bán" : streak.direction === "buy" ? "mua" : "mua/bán"
  const directionTone =
    streak.direction === "sell"
      ? "text-price-down"
      : streak.direction === "buy"
        ? "text-price-up"
        : "text-price-ref"

  const cumulative = streak.last_5d_cumulative
  const cumulativeTone =
    cumulative === null
      ? "text-muted-foreground"
      : cumulative >= 0
        ? "text-price-up"
        : "text-price-down"

  const streakLabel = (
    <>
      Phiên <strong className={cn("font-semibold", directionTone)}>thứ {streak.count}</strong>{" "}
      {directionLabel} ròng
      <br />
      <span className="text-muted-foreground">
        5 ngày:{" "}
        {cumulative === null ? (
          <span>—</span>
        ) : (
          <span className={cumulativeTone}>
            {cumulative >= 0 ? "+" : ""}
            {cumulative.toLocaleString("en-US", { maximumFractionDigits: 0 })} tỷ
          </span>
        )}
      </span>
    </>
  )

  return (
    <FlowCard
      title="Khối ngoại"
      buyValue={data.total_buy_vnd_billion}
      sellValue={Math.abs(data.total_sell_vnd_billion)}
      streakBars={data.last_12_sessions}
      streakLabel={streakLabel}
      topSell={data.top_sell}
      topBuy={data.top_buy}
    />
  )
}

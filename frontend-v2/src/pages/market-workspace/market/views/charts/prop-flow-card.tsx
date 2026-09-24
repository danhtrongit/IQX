import { cn } from "@/lib/utils"

import type { MarketCharts } from "../../types"
import { FlowCard } from "./flow-card"

export interface PropFlowCardProps {
  data: MarketCharts["prop_detail"]
  /** Foreign net tỷ (buy − sell), used for the cùng/ngược chiều label. */
  foreignNet?: number
}

/**
 * "Tự doanh CTCK" — proprietary-trading flow. `top_buy` items may carry
 * `anomaly`, which `FlowCard` renders as the BẤT THƯỜNG marker.
 */
export function PropFlowCard({ data, foreignNet }: PropFlowCardProps) {
  const net = data.net_vnd_billion
  const netTone = net >= 0 ? "text-price-up" : "text-price-down"

  let directionLabel = "Chưa có số liệu khối ngoại để đối chiếu"
  if (foreignNet !== undefined && net !== 0 && foreignNet !== 0) {
    const sameDirection = (net >= 0) === (foreignNet >= 0)
    directionLabel = sameDirection ? "cùng chiều khối ngoại" : "ngược chiều khối ngoại"
  }

  const streakLabel = (
    <>
      Net:{" "}
      <strong className={cn("font-semibold", netTone)}>
        {net >= 0 ? "+" : ""}
        {net.toLocaleString("en-US", { maximumFractionDigits: 0 })} tỷ
      </strong>
      <br />
      <span className="text-muted-foreground">{directionLabel}</span>
    </>
  )

  return (
    <FlowCard
      title="Tự doanh CTCK"
      buyValue={data.total_buy_vnd_billion}
      sellValue={Math.abs(data.total_sell_vnd_billion)}
      streakBars={data.last_12_sessions}
      streakLabel={streakLabel}
      topSell={data.top_sell}
      topBuy={data.top_buy}
    />
  )
}

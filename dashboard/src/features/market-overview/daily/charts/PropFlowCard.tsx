// ─── PropFlowCard ───────────────────────────────────────────────────────────
// Wraps FlowCard with prop_detail data.
// Streak label: "Net X tỷ · cùng/ngược chiều khối ngoại"
// Anomaly flag on top_buy items passes through automatically via FlowTopItem.

import type { MarketCharts } from "../types"
import { FlowCard } from "./FlowCard"

interface PropFlowCardProps {
  data: MarketCharts["prop_detail"]
  /** Foreign net tỷ (buy − sell) to determine cùng/ngược chiều */
  foreignNet?: number
}

export function PropFlowCard({ data, foreignNet }: PropFlowCardProps) {
  const net = data.net_vnd_billion
  const netColor = net >= 0 ? "#10b981" : "#ef4444"
  const netSign = net >= 0 ? "+" : ""

  let directionLabel = "cùng chiều khối ngoại"
  if (foreignNet !== undefined) {
    const propBuy = net >= 0
    const foreignBuy = foreignNet >= 0
    directionLabel =
      propBuy === foreignBuy
        ? "cùng chiều khối ngoại"
        : "ngược chiều khối ngoại"
  }

  const streakLabel = (
    <>
      Net:{" "}
      <strong style={{ color: netColor }}>
        {netSign}
        {Math.abs(net).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}{" "}
        tỷ
      </strong>
      <br />
      <span style={{ color: "var(--color-text-2)", fontSize: 10 }}>
        {directionLabel}
      </span>
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

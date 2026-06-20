// ─── ForeignFlowCard ────────────────────────────────────────────────────────
// Wraps FlowCard with foreign_detail data.
// Streak label: "Phiên thứ N bán/mua ròng · 5 ngày X tỷ"

import type { MarketCharts } from "../types"
import { FlowCard } from "./FlowCard"

interface ForeignFlowCardProps {
  data: MarketCharts["foreign_detail"]
}

export function ForeignFlowCard({ data }: ForeignFlowCardProps) {
  const { streak } = data
  const dirLabel = streak.direction === "sell" ? "bán" : "mua"
  const streakColor = streak.direction === "sell" ? "#ef4444" : "#10b981"
  const cum = streak.last_5d_cumulative
  const cumColor =
    cum === null ? "var(--color-text-2)" : cum >= 0 ? "#10b981" : "#ef4444"
  const cumSign = cum !== null && cum >= 0 ? "+" : ""

  const streakLabel = (
    <>
      Phiên{" "}
      <strong style={{ color: streakColor }}>thứ {streak.count}</strong>{" "}
      {dirLabel} ròng
      <br />
      <span style={{ color: "var(--color-text-2)", fontSize: 10 }}>
        5 ngày:{" "}
        {cum === null ? (
          <span style={{ color: "var(--color-text-2)" }}>—</span>
        ) : (
          <span style={{ color: cumColor }}>
            {cumSign}
            {cum.toLocaleString("vi-VN", {
              maximumFractionDigits: 0,
            })}{" "}
            tỷ
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

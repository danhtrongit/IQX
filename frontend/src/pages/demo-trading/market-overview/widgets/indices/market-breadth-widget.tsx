import {
  MISSING_VALUE,
  formatInt,
  formatSessionLabel,
} from "../../format"
import type { ExchangeCode, MarketBreadthExchange } from "../../types"
import { MoEmptyData, type WidgetBodyProps } from "../shared"

const EXCHANGE_LABELS: Readonly<Record<ExchangeCode, string>> = {
  HOSE: "HOSE",
  HNX: "HNX",
  UPCOM: "UPCoM",
}

interface NormalizedBreadth {
  ceiling: number
  upOnly: number
  unchanged: number
  dnOnly: number
  floor: number
  advancingTotal: number
  decliningTotal: number
  total: number
}

function normalizeBreadthCounts(ex: MarketBreadthExchange): NormalizedBreadth {
  const ceiling = Math.max(0, Math.round(ex.ceiling))
  const floor = Math.max(0, Math.round(ex.floor))
  const unchanged = Math.max(0, Math.round(ex.unchanged))
  const rawAdv = Math.max(0, Math.round(ex.advancing))
  const rawDec = Math.max(0, Math.round(ex.declining))
  const rawTotal = Math.max(0, Math.round(ex.total))

  // Detect whether backend `advancing`/`declining` already includes `ceiling`/`floor`.
  const inclusiveSum = rawAdv + unchanged + rawDec
  const exclusiveSum = inclusiveSum + ceiling + floor
  const isExclusive =
    rawTotal > 0 &&
    (ceiling > 0 || floor > 0) &&
    Math.abs(exclusiveSum - rawTotal) < Math.abs(inclusiveSum - rawTotal)

  const upOnly = isExclusive ? rawAdv : Math.max(0, rawAdv - ceiling)
  const dnOnly = isExclusive ? rawDec : Math.max(0, rawDec - floor)
  const advancingTotal = ceiling + upOnly
  const decliningTotal = floor + dnOnly
  const total = Math.max(0, advancingTotal + unchanged + decliningTotal)

  return {
    ceiling,
    upOnly,
    unchanged,
    dnOnly,
    floor,
    advancingTotal,
    decliningTotal,
    total,
  }
}

export function MarketBreadthWidget({
  data,
  meta,
}: WidgetBodyProps<"market_breadth">) {
  if (!data || data.exchanges.length === 0) {
    return <MoEmptyData />
  }

  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")

  return (
    <div className="mo-pad flex h-full flex-col justify-center overflow-hidden">
      <div className="mo-brow mo-note pb-1 pt-0">
        <span>Sàn</span>
        <span className="truncate">
          {!meta?.isMarketOpen && sessionLabel !== MISSING_VALUE ? sessionLabel : ""}
        </span>
        <span className="text-right">Tăng</span>
        <span className="text-right">Đứng</span>
        <span className="text-right">Giảm</span>
      </div>

      {data.exchanges.map((ex) => {
        const label = EXCHANGE_LABELS[ex.exchange] ?? ex.exchange
        const counts = normalizeBreadthCounts(ex)
        const tooltip = `${label}: Trần ${formatInt(counts.ceiling)} · Tăng ${formatInt(counts.upOnly)} · Đứng ${formatInt(counts.unchanged)} · Giảm ${formatInt(counts.dnOnly)} · Sàn ${formatInt(counts.floor)}`

        const segments: Array<{ key: string; count: number; color: string }> = [
          { key: "ce", count: counts.ceiling, color: "var(--mo-ce)" },
          { key: "up", count: counts.upOnly, color: "var(--mo-up)" },
          { key: "ref", count: counts.unchanged, color: "var(--mo-ref)" },
          { key: "dn", count: counts.dnOnly, color: "var(--mo-dn)" },
          { key: "fl", count: counts.floor, color: "var(--mo-fl)" },
        ].filter((seg) => seg.count > 0)

        return (
          <div key={ex.exchange} className="mo-brow">
            <span className="mo-b text-left">{label}</span>

            <div
              className="mo-sbar"
              role="img"
              aria-label={tooltip}
              title={tooltip}
            >
              {counts.total > 0 ? (
                segments.map((seg) => (
                  <span
                    key={seg.key}
                    style={{
                      flexGrow: seg.count,
                      flexBasis: 0,
                      backgroundColor: seg.color,
                    }}
                  />
                ))
              ) : (
                <span
                  style={{
                    flexGrow: 1,
                    backgroundColor: "var(--mo-line2)",
                  }}
                />
              )}
            </div>

            <span
              className="mo-b mo-up"
              title={`Tăng ${formatInt(counts.advancingTotal)} (gồm ${formatInt(counts.ceiling)} trần)`}
            >
              {formatInt(counts.advancingTotal)}
            </span>
            <span className="mo-b mo-rf" title={`Đứng giá ${formatInt(counts.unchanged)}`}>
              {formatInt(counts.unchanged)}
            </span>
            <span
              className="mo-b mo-dn"
              title={`Giảm ${formatInt(counts.decliningTotal)} (gồm ${formatInt(counts.floor)} sàn)`}
            >
              {formatInt(counts.decliningTotal)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

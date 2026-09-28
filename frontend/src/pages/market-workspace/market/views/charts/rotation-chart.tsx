import { cn } from "@/lib/utils"

import type { MarketCharts } from "../../types"
import { ChartCard } from "./chart-card"

export interface RotationChartProps {
  data: MarketCharts["sector_rotation"]
  frozen?: boolean
  /** Tag pill label, e.g. "Cuối ngày 30/06". */
  dataTag?: string
  frozenNote?: string
}

/**
 * "Dòng tiền chuyển nhóm" — diverging sector bars. The backend already sorts
 * `sectors_today` by % desc; that order is kept as-is. Bars grow from the centre
 * line, scaled against the largest absolute move in the set.
 */
export function RotationChart({ data, frozen, dataTag, frozenNote }: RotationChartProps) {
  const rows = data.sectors_today
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.pct)), 1)

  const tag = dataTag ? { label: dataTag, tone: frozen ? ("frozen" as const) : ("am" as const) } : undefined

  return (
    <ChartCard title="Dòng tiền chuyển nhóm" tag={tag} frozen={frozen} frozenNote={frozenNote}>
      <div className="mb-2.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        BIẾN ĐỘNG THEO NGÀNH (%)
      </div>

      <div className="flex flex-col gap-[5px]">
        {rows.map((row) => {
          const isPositive = row.pct >= 0
          const barTone = isPositive ? "bg-price-up" : "bg-price-down"
          const valueTone = isPositive ? "text-price-up" : "text-price-down"
          const barWidthPct = (Math.abs(row.pct) / maxAbs) * 48
          const valueLabel = `${isPositive ? "+" : ""}${row.pct.toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}%`

          return (
            <div
              key={row.name}
              className="grid grid-cols-[100px_1fr_48px] items-center gap-2.5 text-xs sm:grid-cols-[110px_1fr_52px]"
            >
              <div className="truncate font-medium text-foreground">{row.name}</div>

              <div className="relative h-4">
                <div aria-hidden className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
                <div
                  className={cn("absolute top-[3px] bottom-[3px] rounded-[2px]", barTone)}
                  style={
                    isPositive
                      ? { left: "50%", width: `${barWidthPct}%` }
                      : { right: "50%", width: `${barWidthPct}%` }
                  }
                />
              </div>

              <div className={cn("text-right font-semibold tabular-nums whitespace-nowrap", valueTone)}>
                {valueLabel}
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}

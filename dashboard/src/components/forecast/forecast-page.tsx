import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useForecastRanking, type ForecastHorizon } from "@/hooks/use-forecast-ranking"
import { ForecastRankingList } from "./forecast-ranking-list"
import { ForecastStockHeader } from "./forecast-stock-header"
import { ForecastLayerCards } from "./forecast-layer-cards"
import { ForecastPatterns } from "./forecast-patterns"
import { ForecastRightRail } from "./forecast-right-rail"
import { fmtProjectedPrice, fmtPct } from "./forecast-format"

// Default horizon — the page itself has no horizon selector in the mockup.
const DEFAULT_HORIZON: ForecastHorizon = "5"

export function ForecastPage() {
  const { items, loading, error } = useForecastRanking(DEFAULT_HORIZON)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  useEffect(() => {
    if (items.length === 0) {
      setSelectedSymbol(null)
      return
    }
    setSelectedSymbol((prev) => {
      if (prev && items.some((it) => it.symbol === prev)) return prev
      return items[0].symbol
    })
  }, [items])

  // Shared content (header + 5 layers + BCTC + patterns) — same on both
  // breakpoints, only the column arrangement differs.
  const detail = (
    <div className="space-y-3">
      <ForecastStockHeader symbol={selectedSymbol} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ForecastLayerCards symbol={selectedSymbol} />
        <ForecastRightRail symbol={selectedSymbol} />
      </div>
      <ForecastPatterns symbol={selectedSymbol} />
      <p className="text-[10px] text-muted-foreground text-center italic pt-1">
        Khuyến nghị chỉ có tính chất tham khảo, không phải là lời khuyên đầu tư.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Mobile: thẻ mã kèm Giá dự phóng + Lợi nhuận dự kiến ── */}
      <div className="lg:hidden border-b border-border/30 bg-card/40 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
          {items.map((it) => {
            const active = it.symbol === selectedSymbol
            return (
              <button
                key={it.symbol}
                onClick={() => setSelectedSymbol(it.symbol)}
                className={`shrink-0 w-[150px] rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 bg-card/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${active ? "bg-primary" : "bg-emerald-400"}`}
                  />
                  <span className="text-sm font-extrabold text-foreground">{it.symbol}</span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[9px] text-muted-foreground">Giá dự phóng</p>
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {fmtProjectedPrice(it.projectedPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">Lợi nhuận</p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        it.expectedReturn >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {fmtPct(it.expectedReturn, true)}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── Desktop: ranking sidebar ── */}
        <aside className="hidden lg:flex lg:w-[280px] lg:shrink-0 lg:flex-col lg:border-r lg:border-border/30 min-h-0">
          <ForecastRankingList
            items={items}
            loading={loading}
            error={error}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        </aside>

        {/* ── Detail area ── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">{detail}</div>
        </ScrollArea>
      </div>
    </div>
  )
}

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useForecastRanking, type ForecastHorizon } from "@/hooks/use-forecast-ranking"
import { ForecastRankingList } from "./forecast-ranking-list"
import { ForecastStockHeader } from "./forecast-stock-header"
import { ForecastLayerCards } from "./forecast-layer-cards"
import { ForecastPatterns } from "./forecast-patterns"
import { ForecastRightRail } from "./forecast-right-rail"

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
      {/* ── Mobile: horizontal symbol chips ── */}
      <div className="lg:hidden border-b border-border/30 bg-card/40 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
          {items.map((it) => {
            const active = it.symbol === selectedSymbol
            return (
              <button
                key={it.symbol}
                onClick={() => setSelectedSymbol(it.symbol)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${active ? "bg-primary" : "bg-emerald-400"}`}
                />
                {it.symbol}
              </button>
            )
          })}
          <span className="inline-flex items-center justify-center size-6 rounded-full border border-border/40 text-muted-foreground shrink-0">
            <Plus className="size-3" />
          </span>
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

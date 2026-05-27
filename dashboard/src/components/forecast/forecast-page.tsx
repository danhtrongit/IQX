import { useEffect, useState } from "react"
import { Brain, LayoutList, Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useForecastRanking, type ForecastHorizon } from "@/hooks/use-forecast-ranking"
import { ForecastRankingList } from "./forecast-ranking-list"
import { ForecastLayerCards } from "./forecast-layer-cards"
import { ForecastPatterns } from "./forecast-patterns"
import { ForecastRightRail } from "./forecast-right-rail"

type MobileTab = "ranking" | "insight" | "patterns"

const TABS: { id: MobileTab; label: string; icon: typeof LayoutList }[] = [
  { id: "ranking", label: "Đề xuất", icon: LayoutList },
  { id: "insight", label: "AI Phân tích", icon: Brain },
  { id: "patterns", label: "AI Mẫu + BCTC", icon: Sparkles },
]

// Default horizon — kept fixed to match the mockup which has no horizon selector
// on the page itself. Can be exposed later via a header dropdown if needed.
const DEFAULT_HORIZON: ForecastHorizon = "5"

export function ForecastPage() {
  const { items, loading, error } = useForecastRanking(DEFAULT_HORIZON)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>("ranking")

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

  const handleSelect = (sym: string) => {
    setSelectedSymbol(sym)
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileTab("insight")
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mobile tab bar */}
      <div className="lg:hidden flex border-b border-border/30 bg-card/40 shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === mobileTab
          return (
            <button
              key={id}
              onClick={() => setMobileTab(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                active
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Ranking — left col (lg+) / "Đề xuất" tab (mobile) */}
        <aside
          className={`lg:w-[280px] lg:shrink-0 lg:border-r lg:border-border/30 ${
            mobileTab === "ranking" ? "flex flex-1" : "hidden"
          } lg:flex lg:flex-none lg:flex-col min-h-0`}
        >
          <ForecastRankingList
            items={items}
            loading={loading}
            error={error}
            selectedSymbol={selectedSymbol}
            onSelect={handleSelect}
          />
        </aside>

        {/* Center — layer cards + patterns (lg+) / "AI Phân tích" tab (mobile) */}
        <section
          className={`flex-1 min-w-0 lg:border-r lg:border-border/30 ${
            mobileTab === "insight" ? "flex flex-1" : "hidden"
          } lg:flex lg:flex-col min-h-0`}
        >
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              <ForecastLayerCards symbol={selectedSymbol} />
              <ForecastPatterns symbol={selectedSymbol} />
              <p className="text-[10px] text-muted-foreground text-center italic pt-1">
                Khuyến nghị chỉ có tính chất tham khảo, không phải là lời khuyên đầu tư.
              </p>
            </div>
          </ScrollArea>
        </section>

        {/* Right rail — BCTC (lg+) / "AI Mẫu + BCTC" tab (mobile) */}
        <aside
          className={`lg:w-[300px] lg:shrink-0 ${
            mobileTab === "patterns" ? "flex flex-1" : "hidden"
          } lg:flex lg:flex-none lg:flex-col min-h-0`}
        >
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              <ForecastRightRail symbol={selectedSymbol} />
              {/* On mobile this tab also shows patterns since the center column
                  isn't visible. */}
              <div className="lg:hidden">
                <ForecastPatterns symbol={selectedSymbol} />
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}

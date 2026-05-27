import { useEffect, useState } from "react"
import { Brain, LayoutList, Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useForecastRanking, type ForecastHorizon } from "@/hooks/use-forecast-ranking"
import { ForecastRankingList } from "./forecast-ranking-list"
import { ForecastInsightSummary } from "./forecast-insight-summary"
import { ForecastRightRail } from "./forecast-right-rail"

type MobileTab = "ranking" | "insight" | "patterns"

const TABS: { id: MobileTab; label: string; icon: typeof LayoutList }[] = [
  { id: "ranking", label: "Đề xuất", icon: LayoutList },
  { id: "insight", label: "AI Phân tích", icon: Brain },
  { id: "patterns", label: "AI Mẫu", icon: Sparkles },
]

export function ForecastPage() {
  const [horizon, setHorizon] = useState<ForecastHorizon>("5")
  const { items, loading, error } = useForecastRanking(horizon)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>("ranking")

  // Auto-pick the top-ranked stock once ranking loads or horizon changes.
  useEffect(() => {
    if (items.length === 0) {
      setSelectedSymbol(null)
      return
    }
    // Keep previous selection if still in the new list; otherwise default to #1.
    setSelectedSymbol((prev) => {
      if (prev && items.some((it) => it.symbol === prev)) return prev
      return items[0].symbol
    })
  }, [items])

  const handleSelect = (sym: string) => {
    setSelectedSymbol(sym)
    // On mobile, jump to insight tab so user sees the analysis after picking.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileTab("insight")
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page title */}
      <div className="px-3 py-2 md:px-4 md:py-3 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h1 className="text-sm md:text-base font-bold text-foreground">Đề xuất đầu tư</h1>
          <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">
            AI dự báo lợi nhuận T+3 / T+5 / T+10
          </span>
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-border/30 bg-card/50 shrink-0">
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
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Ranking — left col (md+) / "Đề xuất" tab (mobile) */}
        <aside
          className={`md:w-[260px] md:shrink-0 md:border-r md:border-border/30 ${
            mobileTab === "ranking" ? "flex flex-1" : "hidden"
          } md:flex md:flex-none md:flex-col min-h-0`}
        >
          <ForecastRankingList
            horizon={horizon}
            onHorizonChange={setHorizon}
            items={items}
            loading={loading}
            error={error}
            selectedSymbol={selectedSymbol}
            onSelect={handleSelect}
          />
        </aside>

        {/* Insight summary — center (md+) / "AI Phân tích" tab (mobile) */}
        <section
          className={`flex-1 min-w-0 md:border-r md:border-border/30 ${
            mobileTab === "insight" ? "flex flex-1" : "hidden"
          } md:flex md:flex-col min-h-0`}
        >
          <ScrollArea className="flex-1 min-h-0">
            <ForecastInsightSummary symbol={selectedSymbol} />
          </ScrollArea>
        </section>

        {/* Right rail — right col (md+) / "AI Mẫu" tab (mobile) */}
        <aside
          className={`md:w-[340px] md:shrink-0 ${
            mobileTab === "patterns" ? "flex flex-1" : "hidden"
          } md:flex md:flex-none md:flex-col min-h-0`}
        >
          <ScrollArea className="flex-1 min-h-0">
            <ForecastRightRail symbol={selectedSymbol} />
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}

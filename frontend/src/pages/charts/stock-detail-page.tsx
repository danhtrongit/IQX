/**
 * `/co-phieu/:symbol` — full detail view for one ticker.
 *
 * Tab lives in the URL (`?tab=chart|orderbook|overview|financials`) so a reload
 * keeps the reader's place and the tool panel (`?tool=`) stays orthogonal. Each
 * tab is real data: TradingView candles + saved drawings, the price-board order
 * book, company/fundamental overview, and the KBS statements + forensic BCTC
 * analysis. "AI Phân tích" opens the 6-layer briefing (premium).
 */
import { useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { ArrowLeftRight, ChartCandlestick, Info, Sparkles, Wallet } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"

import { ChartShell } from "./chart-shell"
import { getDrawingPersistence } from "./chart/drawing-persistence"
import { NewsMarkPopover } from "./chart/news-mark-popover"
import { TVChart } from "./chart/tv-chart"
import { BctcAnalysis } from "./stock/components/bctc-analysis"
import { OrderBook } from "./stock/components/order-book"
import { StockFinancials } from "./stock/components/stock-financials"
import { StockOverview } from "./stock/components/stock-overview"
import { StockInsightDialog } from "./stock/stock-insight-dialog"

type StockTab = "chart" | "orderbook" | "overview" | "financials"

const TABS: { id: StockTab; label: string; icon: typeof ChartCandlestick }[] = [
  { id: "chart", label: "Biểu đồ", icon: ChartCandlestick },
  { id: "orderbook", label: "Sổ lệnh", icon: ArrowLeftRight },
  { id: "overview", label: "Tổng quan", icon: Info },
  { id: "financials", label: "Tài chính", icon: Wallet },
]

const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}$/

function readTab(value: string | null): StockTab {
  return value === "financials" || value === "overview" || value === "orderbook"
    ? value
    : "chart"
}

export function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const theme = useResolvedTheme()
  const { user } = useAuth()

  const raw = (symbol ?? "").toUpperCase()
  const code = SYMBOL_PATTERN.test(raw) ? raw : "VNINDEX"
  const tab = readTab(params.get("tab"))
  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)
  const [insightOpen, setInsightOpen] = useState(false)

  function selectSymbol(next: string) {
    const clean = next.trim().toUpperCase()
    if (!SYMBOL_PATTERN.test(clean) || clean === code) return
    navigate(`/co-phieu/${clean}`, { replace: true })
  }

  function selectTab(next: string) {
    const nextParams = new URLSearchParams(params)
    nextParams.set("tab", next)
    setParams(nextParams, { replace: true })
  }

  return (
    <WorkspacePage
      title={code}
      description="Biểu đồ kỹ thuật, sổ lệnh, tổng quan và báo cáo tài chính"
      scroll={false}
      contentClassName="p-0"
      actions={
        <Button type="button" variant="gold" onClick={() => setInsightOpen(true)}>
          <Sparkles aria-hidden="true" />
          AI Phân tích
        </Button>
      }
    >
      <ChartShell symbol={code} onSymbolChange={selectSymbol} onAiInsight={() => setInsightOpen(true)}>
        <Tabs
          value={tab}
          onValueChange={selectTab}
          className="h-full min-h-0 flex-col gap-0"
        >
          <TabsList
            variant="line"
            className="h-9 w-full shrink-0 justify-start gap-0 rounded-none border-b border-border px-2"
          >
            {TABS.map((item) => {
              const Icon = item.icon
              return (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="h-full flex-none px-3 text-xs after:bottom-[-2px]"
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                </TabsTrigger>
              )
            })}
          </TabsList>

          <TabsContent value="chart" className="flex min-h-0 flex-1 flex-col">
            <TVChart
              key={user?.id ?? "guest"}
              symbol={code}
              interval="D"
              theme={theme}
              onSymbolChanged={selectSymbol}
              onMarkClick={setActiveMarkId}
              persistence={getDrawingPersistence()}
            />
          </TabsContent>

          <TabsContent value="orderbook" className="min-h-0 flex-1">
            <ScrollArea className="h-full" viewportClassName="[&>div]:!block">
              <div className="p-4">
                <OrderBook symbol={code} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="overview" className="min-h-0 flex-1">
            <ScrollArea className="h-full" viewportClassName="[&>div]:!block">
              <StockOverview symbol={code} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="financials" className="min-h-0 flex-1">
            <ScrollArea className="h-full" viewportClassName="[&>div]:!block">
              <StockFinancials
                symbol={code}
                analysisSlot={<BctcAnalysis symbol={code} />}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </ChartShell>

      <NewsMarkPopover
        symbol={code}
        markId={activeMarkId}
        onClose={() => setActiveMarkId(null)}
      />

      <StockInsightDialog symbol={code} open={insightOpen} onOpenChange={setInsightOpen} />
    </WorkspacePage>
  )
}

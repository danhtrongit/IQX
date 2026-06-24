import { useCallback, useState, type ComponentType } from "react"
import { useNavigate, useParams } from "react-router"
import { Modal } from "@arco-design/web-react"
import { IconInfoCircle } from "@arco-design/web-react/icon"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { PremiumGate } from "@/features/premium"
import {
  RightSidebar,
  RightToolbar,
  NewsMarkPopover,
  TVChart,
  getDrawingPersistence,
} from "@/features/dashboard"
import { cn } from "@/shared/lib/cn"
import { IconCandlestick } from "@/shared/icons"
import { BctcAnalysis } from "./components/BctcAnalysis"
import { OrderBook } from "./components/OrderBook"
import { StockFinancials } from "./components/StockFinancials"
import { StockOverview } from "./components/StockOverview"
import { AiInsightBriefing } from "./ai-insight"
import { IconBars } from "./icons"

type StockTab = "chart" | "overview" | "financials" | "orderbook"

const TABS: { id: StockTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "chart", label: "Biểu đồ", icon: IconCandlestick },
  { id: "orderbook", label: "Sổ lệnh", icon: IconBars },
  { id: "overview", label: "Tổng quan", icon: IconInfoCircle },
  { id: "financials", label: "Tài chính", icon: IconBars },
]

/**
 * Full trading-terminal body for `/co-phieu/:symbol`. Mirrors the dashboard
 * terminal chrome: tabbed center (Chart / Overview / Financials) + RightSidebar
 * + RightToolbar, plus a draggable AI Insight window and the Forecast window.
 * MarketData + Sidebar providers are global (providers.tsx); SymbolProvider is
 * scoped by StockPage below.
 */
function StockTerminal() {
  const { symbol } = useSymbol()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<StockTab>("chart")
  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)
  const [aiInsightOpen, setAiInsightOpen] = useState(false)

  const handleSymbolChanged = useCallback(
    (newSymbol: string) => {
      const clean =
        newSymbol.split(":").pop()?.toUpperCase() || newSymbol.toUpperCase()
      if (clean && clean !== symbol) {
        navigate(`/co-phieu/${clean}`, { replace: true })
      }
    },
    [symbol, navigate],
  )

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") setAiInsightOpen((v) => !v)
  }

  return (
    <div
      id="stock-root"
      className="flex h-svh flex-col overflow-hidden bg-[var(--color-bg-1)]"
    >
      <TrialBanner />
      <Header />
      <MarketBar />

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <section className="flex flex-1 flex-col min-w-0 bg-[var(--color-bg-1)]">
          {/* Tab navigation */}
          <div className="flex items-center border-b border-[var(--color-border-2)] px-2 shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "text-[rgb(var(--primary-6))]"
                      : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                  )}
                >
                  <Icon className="text-[14px]" />
                  {tab.label}
                  {isActive && (
                    <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-[rgb(var(--primary-6))]" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="relative min-h-0 flex-1">
            {activeTab === "chart" && (
              <TVChart
                symbol={symbol}
                interval="D"
                theme={theme}
                onSymbolChanged={handleSymbolChanged}
                onMarkClick={setActiveMarkId}
                persistence={getDrawingPersistence()}
              />
            )}
            {activeTab === "orderbook" && (
              <div className="h-full overflow-y-auto p-3">
                <OrderBook symbol={symbol} />
              </div>
            )}
            {activeTab === "overview" && <StockOverview symbol={symbol} />}
            {activeTab === "financials" && (
              <StockFinancials
                symbol={symbol}
                analysisSlot={<BctcAnalysis symbol={symbol} />}
              />
            )}
          </div>
        </section>

        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      {/* News mark popover (chart marks) */}
      <NewsMarkPopover
        symbol={symbol}
        markId={activeMarkId}
        onClose={() => setActiveMarkId(null)}
      />

      {/* AI Insight modal */}
      <Modal
        visible={aiInsightOpen}
        onCancel={() => setAiInsightOpen(false)}
        footer={null}
        title={null}
        style={{ width: "min(960px, 94vw)", top: 24 }}
        autoFocus={false}
      >
        <div style={{ maxHeight: "86vh", overflowY: "auto" }}>
          <PremiumGate
            featureName="AI Insight"
            description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."
            onAuthRequested={() => setAiInsightOpen(false)}
          >
            <AiInsightBriefing symbol={symbol} />
          </PremiumGate>
        </div>
      </Modal>

    </div>
  )
}

/** Route entry for `/co-phieu/:symbol`. */
export function StockPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const ticker = symbol?.toUpperCase() || "VNINDEX"

  return (
    <SymbolProvider symbol={ticker}>
      <StockTerminal />
    </SymbolProvider>
  )
}

export default StockPage

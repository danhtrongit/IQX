import { useCallback, useState, type ComponentType } from "react"
import { useNavigate, useParams } from "react-router"
import { AnimatePresence, motion, useDragControls } from "framer-motion"
import { Button } from "@arco-design/web-react"
import {
  IconClose,
  IconDragDotVertical,
  IconInfoCircle,
} from "@arco-design/web-react/icon"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { ForecastWindow } from "@/features/forecast"
import { PremiumGate } from "@/features/premium"
import { RightSidebar, RightToolbar, NewsMarkPopover, TVChart } from "@/features/dashboard"
import { cn } from "@/shared/lib/cn"
import { IconCandlestick } from "@/shared/icons"
import { BctcAnalysis } from "./components/BctcAnalysis"
import { OrderBook } from "./components/OrderBook"
import { StockAiInsight } from "./components/StockAiInsight"
import { StockFinancials } from "./components/StockFinancials"
import { StockOverview } from "./components/StockOverview"
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
  const dragControls = useDragControls()

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

      {/* Draggable AI Insight window */}
      <AnimatePresence>
        {aiInsightOpen && (
          <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              drag
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
              dragMomentum={false}
              dragElastic={0.05}
              className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-1)] shadow-2xl"
              style={{
                width: "min(1100px, calc(100vw - 16px))",
                height: "min(700px, calc(100vh - 24px))",
                top: "max(8px, calc(50vh - min(350px, 50vh - 12px)))",
                left: "max(8px, calc(50vw - min(550px, 50vw - 8px)))",
              }}
            >
              <div
                className="flex shrink-0 cursor-move items-center justify-between border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-2"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="flex items-center gap-2 text-[var(--color-text-3)]">
                  <IconDragDotVertical style={{ fontSize: 16 }} />
                  <span className="select-none text-xs font-bold uppercase tracking-wider text-[var(--color-text-1)]">
                    AI Insight — {symbol}
                  </span>
                </div>
                <Button
                  type="text"
                  size="mini"
                  icon={<IconClose />}
                  aria-label="Đóng"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAiInsightOpen(false)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>

              <div className="relative min-h-0 flex-1 bg-[var(--color-bg-1)]">
                <PremiumGate
                  featureName="AI Insight"
                  description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."
                  onAuthRequested={() => setAiInsightOpen(false)}
                >
                  <StockAiInsight symbol={symbol} />
                </PremiumGate>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Forecast window — self-gates on sidebar context */}
      <ForecastWindow />
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

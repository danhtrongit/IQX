import { useState, useCallback, useEffect } from "react"
import {
  Header,
  MarketBar,
  RightSidebar,
  RightToolbar,
  Footer,
} from "@/components/layout"
import { TVChart } from "@/components/chart/tv-chart"
import { NewsMarkPopover } from "@/components/chart/news-mark-popover"
import { StockOverview } from "@/components/stock/stock-overview"
import { StockFinancials } from "@/components/stock/stock-financials"
import { StockAiInsight } from "@/components/stock/stock-ai-insight"
import { useParams, useNavigate, Navigate } from "react-router"
import { SymbolProvider } from "@/contexts/symbol-context"
import { MarketDataProvider } from "@/contexts/market-data-context"
import { BarChart3, LineChart, Info, X, GripHorizontal, Loader2 } from "lucide-react"
import { motion, AnimatePresence, useDragControls } from "framer-motion"
import { Button } from "@/components/ui/button"

import { useSEO } from "@/hooks/use-seo"
import { isSupportedStockRouteSymbol } from "@/lib/stock-route"

type StockTab = "chart" | "overview" | "financials"

export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const ticker = symbol?.toUpperCase() || "VNINDEX"
  const navigate = useNavigate()
  const [routeStatus, setRouteStatus] = useState<"checking" | "ready" | "not-found">("checking")

  useSEO({
    title: `Cổ phiếu ${ticker} - Biểu đồ, Tài chính & Phân Tích AI | IQX`,
    description: `Xem đa chiều cổ phiếu ${ticker}: Biểu đồ kỹ thuật thời gian thực, Dữ liệu tài chính, và Nhận định độc quyền từ hệ thống AI 6 lớp của IQX.`,
    url: `https://beta.iqx.vn/co-phieu/${ticker}`,
  })
  const [activeTab, setActiveTab] = useState<StockTab>("chart")
  const [isAiInsightOpen, setIsAiInsightOpen] = useState(false)
  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)
  const dragControls = useDragControls()

  useEffect(() => {
    let isCancelled = false

    setRouteStatus("checking")

    isSupportedStockRouteSymbol(ticker).then((isSupported) => {
      if (isCancelled) return
      setRouteStatus(isSupported ? "ready" : "not-found")
    })

    return () => {
      isCancelled = true
    }
  }, [ticker])

  const handleTVSymbolChanged = useCallback(
    (newSymbol: string) => {
      const clean = newSymbol.split(":").pop()?.toUpperCase() || newSymbol.toUpperCase()
      if (clean && clean !== ticker) {
        navigate(`/co-phieu/${clean}`, { replace: true })
      }
    },
    [ticker, navigate],
  )

  const tabs: { id: StockTab; label: string; icon: React.ReactNode }[] = [
    { id: "chart", label: "Biểu đồ", icon: <LineChart className="size-3.5" /> },
    { id: "overview", label: "Tổng quan", icon: <Info className="size-3.5" /> },
    { id: "financials", label: "Tài chính", icon: <BarChart3 className="size-3.5" /> },
  ]

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setIsAiInsightOpen((prev) => !prev)
    }
  }

  if (routeStatus === "not-found") {
    return <Navigate to="/404" replace />
  }

  if (routeStatus === "checking") {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Đang kiểm tra mã cổ phiếu...</span>
        </div>
      </div>
    )
  }

  return (
    <MarketDataProvider>
      <SymbolProvider symbol={ticker}>
        <div id="dashboard-root" className="flex h-svh flex-col overflow-hidden bg-background relative">
          <Header />
          <MarketBar />

          <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0 relative">
            <section className="flex flex-1 flex-col min-w-0 bg-background">
              {/* Tab Navigation */}
              <div className="flex items-center border-b border-border px-2 shrink-0">

                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative ${
                      activeTab === tab.id
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {activeTab === tab.id && (
                      <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0 relative">
                {activeTab === "chart" && (
                  <TVChart symbol={ticker} interval="D" theme="dark" onSymbolChanged={handleTVSymbolChanged} onMarkClick={setActiveMarkId} />
                )}
                {activeTab === "overview" && (
                  <StockOverview symbol={ticker} />
                )}
                {activeTab === "financials" && (
                  <StockFinancials symbol={ticker} />
                )}
              </div>
            </section>

            <RightSidebar />
            <RightToolbar onActionClick={handleActionClick} />
          </div>

          <Footer />

          {/* News Mark Popover */}
          <NewsMarkPopover
            symbol={ticker}
            markId={activeMarkId}
            onClose={() => setActiveMarkId(null)}
          />

          {/* Draggable AI Insight Window */}
          <AnimatePresence>
            {isAiInsightOpen && (
              <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
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
                  className="absolute flex flex-col bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl overflow-hidden pointer-events-auto md:rounded-xl"
                  style={{
                    width: "min(1100px, calc(100vw - 16px))",
                    height: "min(700px, calc(100vh - 24px))",
                    top: "max(8px, calc(50vh - min(350px, 50vh - 12px)))",
                    left: "max(8px, calc(50vw - min(550px, 50vw - 8px)))",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border cursor-move shrink-0"
                    onPointerDown={(e) => dragControls.start(e)}
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GripHorizontal className="size-4" />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground select-none">
                        AI Insight - {ticker}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-sm hover:bg-destructive/20 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAiInsightOpen(false);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  <div className="flex-1 min-h-0 relative bg-background/50">
                    <StockAiInsight symbol={ticker} />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </SymbolProvider>
    </MarketDataProvider>
  )
}

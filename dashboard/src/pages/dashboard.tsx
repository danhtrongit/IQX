import {
  Header,
  MarketBar,
  CenterPanel,
  RightSidebar,
  RightToolbar,
  Footer,
} from "@/components/layout"
import { NewsMarkPopover } from "@/components/chart/news-mark-popover"
import { ForecastWindow } from "@/components/forecast/forecast-window"
import { SymbolProvider } from "@/contexts/symbol-context"
import { MarketDataProvider } from "@/contexts/market-data-context"
import { useSidebar } from "@/contexts/sidebar-context"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Brain } from "lucide-react"
import { useSEO } from "@/hooks/use-seo"
import { useState } from "react"
import { useNavigate } from "react-router"

const INDEX_CODES = new Set([
  "VNINDEX", "VN30", "HNX", "HNXINDEX", "UPCOM", "UPCOMINDEX", "HNX30",
])

function isIndexSymbol(s: string): boolean {
  return INDEX_CODES.has(s.toUpperCase())
}

export default function DashboardPage() {
  const navigate = useNavigate()
  useSEO({
    title: "IQX Dashboard - Toàn Cảnh Thị Trường",
    description: "Nhận định diễn biến thị trường tỷ đô, VN-Index, dòng tiền và tin tức tác động đến thị trường chứng khoán Việt Nam.",
    url: "https://iqx.vn/",
  });

  const [aiInsightOpen, setAiInsightOpen] = useState(false)
  const [aiInsightSymbol, setAiInsightSymbol] = useState("")

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      // Dashboard tracks the whole market (VNINDEX) — AI Insight needs a
      // specific listed stock. Open a symbol-picker dialog instead of a
      // dead-end toast.
      setAiInsightSymbol("")
      setAiInsightOpen(true)
    }
  }

  const submitAiInsightSymbol = () => {
    const sym = aiInsightSymbol.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,10}$/.test(sym) || isIndexSymbol(sym)) return
    setAiInsightOpen(false)
    navigate(`/co-phieu/${sym}`)
  }

  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)
  const { forecastWindowOpen, closeForecastWindow } = useSidebar()
  const trimmedAiInsight = aiInsightSymbol.trim().toUpperCase()
  const aiInsightValid =
    /^[A-Z0-9]{2,10}$/.test(trimmedAiInsight) && !isIndexSymbol(trimmedAiInsight)

  return (
    <MarketDataProvider>
      <SymbolProvider symbol="VNINDEX">
        <div id="dashboard-root" className="flex h-svh flex-col overflow-hidden bg-background">
          <Header />
          <MarketBar />

          <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
            <CenterPanel onMarkClick={setActiveMarkId} />
            <RightSidebar />
            <RightToolbar onActionClick={handleActionClick} />
          </div>

          <Footer />

          {/* News Mark Popover */}
          <NewsMarkPopover
            symbol="VNINDEX"
            markId={activeMarkId}
            onClose={() => setActiveMarkId(null)}
          />

          {/* Mô hình dự báo — cửa sổ kéo–thả */}
          <ForecastWindow open={forecastWindowOpen} onClose={closeForecastWindow} />

          {/* AI Insight symbol picker — opens when user taps "AI Phân tích"
              on the dashboard (which tracks VNINDEX, not a tradable stock). */}
          <Dialog open={aiInsightOpen} onOpenChange={setAiInsightOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Brain className="size-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-base">Phân tích AI cho 1 mã cổ phiếu</DialogTitle>
                    <DialogDescription className="text-xs">
                      AI Insight cần 1 mã cụ thể. Nhập mã (vd. VCB, HPG, FPT) để chạy phân tích 6 lớp.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={aiInsightSymbol}
                  onChange={(e) => setAiInsightSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && submitAiInsightSymbol()}
                  placeholder="VD: VCB"
                  maxLength={10}
                  autoFocus
                  className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm font-mono uppercase tracking-wide outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={submitAiInsightSymbol}
                  disabled={!aiInsightValid}
                  className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Phân tích
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </SymbolProvider>
    </MarketDataProvider>
  )
}

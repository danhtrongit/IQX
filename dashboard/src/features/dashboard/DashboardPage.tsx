import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { Modal, Input, Button } from "@arco-design/web-react"
import { SymbolProvider } from "@/shared/contexts/symbol-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { ForecastWindow } from "@/features/forecast"
import { IconBrainCircuit } from "@/shared/icons"
import { CenterPanel } from "./components/CenterPanel"
import { RightSidebar } from "./components/RightSidebar"
import { RightToolbar } from "./components/RightToolbar"
import { NewsMarkPopover } from "./components/NewsMarkPopover"

const SEO = {
  title: "IQX Dashboard - Toàn Cảnh Thị Trường",
}

const INDEX_CODES = new Set([
  "VNINDEX",
  "VN30",
  "HNX",
  "HNXINDEX",
  "UPCOM",
  "UPCOMINDEX",
  "HNX30",
])

function isIndexSymbol(s: string): boolean {
  return INDEX_CODES.has(s.toUpperCase())
}

/**
 * Flagship Bloomberg-style trading terminal (`/` and `/dashboard`).
 *
 * Renders the FULL standalone chrome (NOT inside AppShell): TrialBanner +
 * Header + MarketBar + a flex body [LeftSidebar(40) | CenterPanel(flex-1) |
 * RightSidebar(280) | RightToolbar(48)] + Footer + ForecastWindow. The market
 * data + sidebar providers are global (providers.tsx); only SymbolProvider is
 * scoped here, defaulting to VNINDEX. Ported from dashboard-bak/pages/dashboard.
 */
export function DashboardPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO.title
    return () => {
      document.title = prevTitle
    }
  }, [])

  return (
    <SymbolProvider symbol="VNINDEX">
      <DashboardTerminal />
    </SymbolProvider>
  )
}

function DashboardTerminal() {
  const navigate = useNavigate()

  const [activeMarkId, setActiveMarkId] = useState<string | number | null>(null)

  // Dashboard tracks the whole market (VNINDEX); AI Insight needs a specific
  // listed stock, so tapping "AI Phân tích" opens a symbol picker.
  const [aiInsightOpen, setAiInsightOpen] = useState(false)
  const [aiInsightSymbol, setAiInsightSymbol] = useState("")

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setAiInsightSymbol("")
      setAiInsightOpen(true)
    }
  }

  const trimmedAiInsight = aiInsightSymbol.trim().toUpperCase()
  const aiInsightValid =
    /^[A-Z0-9]{2,10}$/.test(trimmedAiInsight) && !isIndexSymbol(trimmedAiInsight)

  const submitAiInsightSymbol = () => {
    if (!aiInsightValid) return
    setAiInsightOpen(false)
    navigate(`/co-phieu/${trimmedAiInsight}`)
  }

  return (
    <div
      id="dashboard-root"
      className="flex h-svh flex-col overflow-hidden bg-[var(--color-bg-1)]"
    >
      <TrialBanner />
      <Header />
      <MarketBar />

      {/* No custom LeftSidebar — TradingView provides its own drawing toolbar on the left. */}
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

      {/* Mô hình dự báo — cửa sổ kéo–thả (self-gates on sidebar context) */}
      <ForecastWindow />

      {/* AI Insight symbol picker */}
      <Modal
        visible={aiInsightOpen}
        onCancel={() => setAiInsightOpen(false)}
        footer={null}
        title={null}
        style={{ width: 420 }}
        autoFocus={false}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-xl bg-[var(--color-primary-light-1)] flex items-center justify-center">
            <IconBrainCircuit className="text-[rgb(var(--primary-6))] text-lg" />
          </div>
          <div>
            <div className="text-base font-semibold text-[var(--color-text-1)]">
              Phân tích AI cho 1 mã cổ phiếu
            </div>
            <div className="text-xs text-[var(--color-text-3)]">
              AI Insight cần 1 mã cụ thể. Nhập mã (vd. VCB, HPG, FPT) để chạy phân
              tích 6 lớp.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={aiInsightSymbol}
            onChange={(v) => setAiInsightSymbol(v.toUpperCase())}
            onPressEnter={submitAiInsightSymbol}
            placeholder="VD: VCB"
            maxLength={10}
            autoFocus
            className="flex-1 font-mono uppercase tracking-wide"
          />
          <Button
            type="primary"
            onClick={submitAiInsightSymbol}
            disabled={!aiInsightValid}
          >
            Phân tích
          </Button>
        </div>
      </Modal>
    </div>
  )
}

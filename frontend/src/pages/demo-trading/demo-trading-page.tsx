import { lazy, Suspense } from "react"
import { useSearchParams } from "react-router"

import { PanelState } from "@/components/layout/panel-state"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspaceFrame, WorkspacePanelToggle } from "@/components/layout/workspace-frame"
import { useRail } from "@/context/rail"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { parseDemoContent, withDemoContent, type DemoContent } from "./content-tabs-state"
import { BotPanel } from "./insights/bot-panel"
import { HuntMain } from "./insights/hunt-main"
import { HuntPanel } from "./insights/hunt-panel"
import type { MascotId } from "./journey/types"
import { NewsPanel } from "./market/news-panel"
import { PatternsPanel } from "./market/patterns-panel"
import { QuoteSummary } from "./market/quote-summary"
import { PortfolioPanel } from "./portfolio/portfolio-panel"
import { ShopMain, ShopPanel } from "./shop"
import { TradingRuntime } from "./trading"
import { OrderPanel } from "./trading/order-panel"
import { AccountStrip } from "./workspace/account-strip"
import { AcademyPanel } from "./workspace/academy-panel"
import { MascotStage } from "./workspace/mascot-stage"
import { useWorkspace } from "./workspace/use-workspace"

const ChartPage = lazy(() => import("@/pages/charts/chart-page").then((module) => ({ default: module.ChartPage })))
const PriceBoardPage = lazy(() => import("@/pages/securities/price-board/price-board-page").then((module) => ({ default: module.PriceBoardPage })))
const MarketWorkspacePage = lazy(() => import("@/pages/market-workspace/market-workspace-page").then((module) => ({ default: module.MarketWorkspacePage })))

const CONTENT_TABS: { id: DemoContent; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "chart", label: "Biểu đồ" },
  { id: "board", label: "Bảng giá" },
  { id: "ai-analysis", label: "AI Phân Tích" },
]

/** Title and one-line subtitle of the overview, per workspace tool. */
const TOOL_HEADINGS: Record<string, { title: string; subtitle: string }> = {
  academy: { title: "Học viện", subtitle: "13 chương · 71 bài học" },
  trading: { title: "Demo Trading", subtitle: "Tự đặt lệnh · Vốn mô phỏng 100.000.000 đồng" },
  portfolio: { title: "Danh mục", subtitle: "Tài khoản tự giao dịch và danh sách theo dõi" },
  bot: { title: "Bot", subtitle: "Linh thú và điều kiện giao dịch của bạn." },
  shop: { title: "Shop", subtitle: "" },
  hunt: { title: "Săn mã", subtitle: "Tìm cổ phiếu · Lưu vào danh mục theo dõi" },
  news: { title: "Tin tức", subtitle: "Tin AI theo mã đang xem" },
  patterns: { title: "Mẫu nến", subtitle: "Mẫu nến và mẫu hình giá của mã đang xem" },
}

/** Tools whose panel works on the selected symbol, so the overview shows its quote bar. */
const SYMBOL_TOOLS = new Set(["trading", "portfolio", "news", "patterns"])

function ContentTabs({ active, onSelect, children }: { active: DemoContent; onSelect: (content: DemoContent) => void; children: React.ReactNode }) {
  const content = active === "ai-analysis" ? (
    <ScrollArea className="h-full min-h-0" orientation="both" viewportClassName="[&>div]:h-full">
      {children}
    </ScrollArea>
  ) : children
  return (
    <Tabs value={active} onValueChange={(value) => value && onSelect(value as DemoContent)} className="min-h-0 flex-1 gap-0">
      <div className="flex shrink-0 items-stretch border-b border-border bg-card">
        <TabsList variant="line" aria-label="Nội dung demo trading" className="group-data-horizontal/tabs:h-11 min-w-0 flex-1 justify-start overflow-x-auto overflow-y-hidden rounded-none bg-card px-3 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
          {CONTENT_TABS.map((tab) => <TabsTrigger key={tab.id} value={tab.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })} className="h-full flex-none rounded-none px-3 text-xs font-semibold focus-visible:ring-inset group-data-horizontal/tabs:after:bottom-0">{tab.label}</TabsTrigger>)}
        </TabsList>
        <div className="flex shrink-0 items-center pr-2"><WorkspacePanelToggle /></div>
      </div>
      {CONTENT_TABS.map((tab) => <TabsContent key={tab.id} value={tab.id} forceMount className={cn("min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden", (tab.id === "board" || tab.id === "overview") && "flex flex-col")}>
        {active === tab.id && <Suspense fallback={<ContentFallback />}>{content}</Suspense>}
      </TabsContent>)}
    </Tabs>
  )
}

function ContentFallback() {
  return <div className="space-y-4 p-4 sm:p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></div>
}

function Overview({ toolId, symbol, mascotId, onSymbolChange, onNavigate }: {
  toolId: string
  symbol: string
  mascotId: MascotId
  onSymbolChange: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const heading = TOOL_HEADINGS[toolId] ?? TOOL_HEADINGS.academy
  return (
    <section aria-labelledby="workspace-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 shrink-0 flex-col justify-center gap-0.5 border-b border-border bg-card px-3 py-2 min-[901px]:px-4">
        <h1 id="workspace-heading" className="truncate font-heading text-base font-bold min-[901px]:text-lg">{heading.title}</h1>
        {heading.subtitle && <p className="truncate text-xs text-muted-foreground">{heading.subtitle}</p>}
      </header>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
        <div className="min-w-0 space-y-3 p-1.5 min-[901px]:p-3 min-[1750px]:p-5">
          {toolId === "hunt" ? (
            <HuntMain symbol={symbol} onSymbolChange={onSymbolChange} onNavigate={onNavigate} />
          ) : toolId === "shop" ? (
            <ShopMain onNavigate={onNavigate} />
          ) : (
            <>
              {SYMBOL_TOOLS.has(toolId) && (
                <div className="rounded-lg border border-border bg-card p-2"><QuoteSummary symbol={symbol} onSymbolChange={onSymbolChange} /></div>
              )}
              {(toolId === "trading" || toolId === "portfolio") && <AccountStrip />}
              <MascotStage mascotId={mascotId} />
            </>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}

function DemoWorkspace() {
  const { activeId, activeItem } = useRail()
  const [params, setParams] = useSearchParams()
  // Bootstraps the accounts once per session whichever main tab is open first.
  const { mascotId } = useWorkspace()
  const rawSymbol = params.get("symbol")?.toUpperCase()
  const symbol = rawSymbol && /^[A-Z0-9]{1,10}$/.test(rawSymbol) ? rawSymbol : "VNM"
  const content = parseDemoContent(params.get("content"))

  function selectSymbol(nextSymbol: string) {
    const next = new URLSearchParams(params)
    next.set("symbol", nextSymbol.toUpperCase())
    setParams(next, { replace: true })
  }
  function navigatePanel(panel: string, nextSymbol?: string) {
    const next = new URLSearchParams(params)
    next.set("view", panel)
    if (nextSymbol) next.set("symbol", nextSymbol.toUpperCase())
    setParams(next, { replace: true })
  }
  function selectContent(nextContent: DemoContent) {
    setParams(withDemoContent(params, nextContent), { replace: true })
  }
  function panel() {
    switch (activeId) {
      case "trading": return <OrderPanel symbol={symbol} onSymbolChange={selectSymbol} />
      case "portfolio": return <PortfolioPanel symbol={symbol} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />
      case "hunt": return <HuntPanel onNavigate={navigatePanel} />
      case "news": return <NewsPanel symbol={symbol} />
      case "patterns": return <PatternsPanel symbol={symbol} />
      case "bot": return <BotPanel />
      case "shop": return <ShopPanel onNavigate={navigatePanel} />
      default: return <AcademyPanel />
    }
  }

  const mainContent = content === "chart"
    ? <ChartPage embedded />
    : content === "board"
      ? <PriceBoardPage embedded />
      : content === "ai-analysis"
        ? <MarketWorkspacePage embedded />
        : <Overview toolId={activeId} symbol={symbol} mascotId={mascotId} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />

  return <>
    <WorkspaceFrame
      panelLabel={activeItem?.label ?? "Học viện"}
      defaultPanelOpen={params.has("view")}
      main={<ContentTabs active={content} onSelect={selectContent}>{mainContent}</ContentTabs>}
      panel={panel()}
    />
    <TradingRuntime />
  </>
}

export function DemoTradingPage() {
  const { user, sessionError, sessionExpired, openAuth } = useAuth()
  if (sessionError) return <main className="min-h-0 flex-1 p-6"><PanelState title="Không xác minh được phiên đăng nhập" description={sessionError.message} action={{ label: "Thử lại", onClick: () => window.location.reload() }} /></main>
  if (sessionExpired && !user) return <main className="min-h-0 flex-1 p-6"><PanelState title="Phiên đăng nhập đã hết hạn" description="Tài khoản của bạn vẫn được lưu trên máy chủ. Đăng nhập lại để tiếp tục." action={{ label: "Đăng nhập lại", onClick: () => openAuth("login") }} /></main>
  return <DemoWorkspace key={user?.id ?? "guest"} />
}

import { lazy, Suspense, useState } from "react"
import { useSearchParams } from "react-router"
import { LockKeyhole } from "lucide-react"
import { PagePanel } from "@/components/layout/page-panel"
import { PanelState } from "@/components/layout/panel-state"
import { RailMenu } from "@/components/layout/rail-menu"
import { RightSidebar } from "@/components/layout/right-sidebar"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRail } from "@/context/rail"
import { useAuth } from "@/hooks/use-auth"
import { JourneyDialogs } from "./journey/journey-dialogs"
import { JourneyPanel } from "./journey/journey-panel"
import { JourneyProvider } from "./journey/journey-provider"
import { JourneyStage } from "./journey/journey-stage"
import { useJourney } from "./journey/use-journey"
import { QuoteSummary } from "./market/quote-summary"
import { NewsPanel } from "./market/news-panel"
import { PatternsPanel } from "./market/patterns-panel"
import { OrderPanel } from "./trading/order-panel"
import { TradingRuntime } from "./trading"
import { PortfolioPanel } from "./portfolio/portfolio-panel"
import { AnalysisPanel } from "./insights/analysis-panel"
import { IdentityPanel } from "./insights/identity-panel"
import { HuntPanel } from "./insights/hunt-panel"
import { BotPanel } from "./insights/bot-panel"
import { parseDemoContent, withDemoContent, type DemoContent } from "./content-tabs-state"

const ChartPage = lazy(() => import("@/pages/charts/chart-page").then((module) => ({ default: module.ChartPage })))
const PriceBoardPage = lazy(() => import("@/pages/securities/price-board/price-board-page").then((module) => ({ default: module.PriceBoardPage })))
const MarketWorkspacePage = lazy(() => import("@/pages/market-workspace/market-workspace-page").then((module) => ({ default: module.MarketWorkspacePage })))

const CONTENT_TABS: { id: DemoContent; label: string }[] = [
  { id: "journey", label: "Hành trình" },
  { id: "chart", label: "Biểu đồ" },
  { id: "board", label: "Bảng giá" },
  { id: "ai-analysis", label: "AI Phân Tích" },
]

function ContentTabs({ active, onSelect, children }: { active: DemoContent; onSelect: (content: DemoContent) => void; children: React.ReactNode }) {
  const content = active === "ai-analysis" ? (
    <ScrollArea className="h-full min-h-0" orientation="both" viewportClassName="[&>div]:h-full">
      {children}
    </ScrollArea>
  ) : children
  return (
    <Tabs value={active} onValueChange={(value) => value && onSelect(value as DemoContent)} className="min-h-0 flex-1 gap-0">
      <TabsList variant="line" aria-label="Nội dung demo trading" className="group-data-horizontal/tabs:h-11 w-full min-w-0 shrink-0 justify-start overflow-x-auto overflow-y-hidden rounded-none border-b border-border bg-card px-3 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
        {CONTENT_TABS.map((tab) => <TabsTrigger key={tab.id} value={tab.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })} className="h-full flex-none rounded-none px-3 text-xs font-semibold focus-visible:ring-inset group-data-horizontal/tabs:after:bottom-0">{tab.label}</TabsTrigger>)}
      </TabsList>
      {CONTENT_TABS.map((tab) => <TabsContent key={tab.id} value={tab.id} forceMount className="min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden">
        {active === tab.id && <Suspense fallback={<ContentFallback />}>{content}</Suspense>}
      </TabsContent>)}
    </Tabs>
  )
}

function ContentFallback() {
  return <div className="space-y-4 p-4 sm:p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></div>
}

function DemoWorkspace() {
  const { user, openAuth } = useAuth()
  const journey = useJourney()
  const { activeId, activeItem, chrome, setActive } = useRail()
  const [params, setParams] = useSearchParams()
  const rawSymbol = params.get("symbol")?.toUpperCase()
  const symbol = rawSymbol && /^[A-Z0-9]{1,10}$/.test(rawSymbol) ? rawSymbol : "VNM"
  const content = parseDemoContent(params.get("content"))
  const locked: Record<string, string> = {}
  if (journey.level < 1) { locked.news = "Mở khóa từ Cấp 1"; locked.patterns = "Mở khóa từ Cấp 1" }
  if (journey.level < 4) locked.identity = "Mở khóa từ Cấp 4"
  if (journey.level < 5) locked.hunt = "Mở khóa từ Cấp 5"
  if (journey.level < 6 || !journey.progress?.graduated_at) locked.bot = "Mở khóa sau khi hoàn thành Cấp 6"

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
    if (journey.isLoading) return <SidebarPanel title={activeItem?.label ?? "Hành trình"}><PanelState title="Đang tải hành trình" loading /></SidebarPanel>
    if (journey.error) return <SidebarPanel title="Hành trình"><PanelState title="Không tải được tiến trình" description={journey.error.message} action={{ label: "Thử lại", onClick: () => void journey.refresh() }} /></SidebarPanel>
    if (locked[activeId]) return <SidebarPanel title={activeItem?.label ?? "Công cụ"}><div className="flex justify-center pt-8"><LockKeyhole className="size-9 text-muted-foreground" /></div><PanelState title={locked[activeId]} description="Công cụ xuất hiện khi bạn hoàn thành kỹ năng tương ứng trong hành trình." action={{ label: user ? "Xem nhiệm vụ hiện tại" : "Đăng nhập để bắt đầu", onClick: () => user ? navigatePanel("journey") : openAuth() }} /></SidebarPanel>
    switch (activeId) {
      case "trading": return <OrderPanel symbol={symbol} onSymbolChange={selectSymbol} />
      case "portfolio": return <PortfolioPanel symbol={symbol} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />
      case "analysis": return <AnalysisPanel symbol={symbol} />
      case "hunt": return <HuntPanel symbol={symbol} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />
      case "identity": return <IdentityPanel symbol={symbol} />
      case "news": return <NewsPanel symbol={symbol} />
      case "patterns": return <PatternsPanel symbol={symbol} />
      case "bot": return <BotPanel />
      default: return <JourneyPanel onNavigate={navigatePanel} />
    }
  }

  const mainContent = content === "chart"
    ? <ChartPage embedded />
    : content === "board"
      ? <PriceBoardPage embedded />
      : content === "ai-analysis"
        ? <MarketWorkspacePage embedded />
        : <PagePanel title="Demo Trading" description="Học đầu tư qua trải nghiệm · Dữ liệu thị trường thật, vốn mô phỏng">
            <div className="border-b border-border pb-4"><QuoteSummary symbol={symbol} onSymbolChange={selectSymbol} /></div>
            <JourneyStage onNavigate={navigatePanel} />
          </PagePanel>

  const [mobilePane, setMobilePane] = useState<"content" | "tools">("content")

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
    <div className="flex shrink-0 border-b border-border bg-card p-2 lg:hidden" role="group" aria-label="Khu vực demo trading">
      <button type="button" onClick={() => setMobilePane("content")} aria-pressed={mobilePane === "content"} className="h-8 flex-1 rounded-sm text-xs font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground">Nội dung</button>
      <button type="button" onClick={() => setMobilePane("tools")} aria-pressed={mobilePane === "tools"} className="h-8 flex-1 rounded-sm text-xs font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground">Công cụ</button>
    </div>
    <main className={["min-h-0 min-w-0 flex-1 flex-col overflow-hidden", mobilePane === "content" ? "flex" : "hidden", "lg:flex"].join(" ")}>
      <ContentTabs active={content} onSelect={selectContent}>{mainContent}</ContentTabs>
    </main>
    <div className={["min-h-0 min-w-0 flex-1 flex-col", mobilePane === "tools" ? "flex" : "hidden", "lg:flex lg:w-(--sidebar-width) lg:flex-none"].join(" ")}>
      <div className="shrink-0 border-b border-border bg-card p-2 lg:hidden">
        <Select value={activeId} onValueChange={(id) => {
          if (id === "ai-analysis") { selectContent("ai-analysis"); setMobilePane("content") }
          else setActive(id)
        }}>
          <SelectTrigger className="w-full" aria-label="Chọn công cụ"><SelectValue /></SelectTrigger>
          <SelectContent>{chrome.items.filter((item) => !locked[item.id]).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <RightSidebar label={activeItem?.label ?? "Hành trình"}>{panel()}</RightSidebar>
    </div>
    <div className="hidden lg:flex"><RailMenu locked={locked} hideLocked /></div>
    <TradingRuntime />
    <JourneyDialogs />
  </div>
}

export function DemoTradingPage() {
  const { user, sessionError, sessionExpired, openAuth } = useAuth()
  if (sessionError) return <main className="min-h-0 flex-1 p-6"><PanelState title="Không xác minh được phiên đăng nhập" description={sessionError.message} action={{ label: "Thử lại", onClick: () => window.location.reload() }} /></main>
  if (sessionExpired && !user) return <main className="min-h-0 flex-1 p-6"><PanelState title="Phiên đăng nhập đã hết hạn" description="Tiến trình của bạn vẫn được lưu trên máy chủ. Đăng nhập lại để tiếp tục đúng cấp độ đang học." action={{ label: "Đăng nhập lại", onClick: () => openAuth("login") }} /></main>
  return <JourneyProvider key={user?.id ?? "guest"}><DemoWorkspace /></JourneyProvider>
}

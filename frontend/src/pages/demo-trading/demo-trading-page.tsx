import { lazy, Suspense, useCallback, useLayoutEffect } from "react"
import { useLocation, useSearchParams } from "react-router"

import { PanelState } from "@/components/layout/panel-state"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspaceFrame, WorkspacePanelToggle, type WorkspaceRail } from "@/components/layout/workspace-frame"
import { demoChrome, sectionOfTool, type WorkspaceSection } from "@/config/chrome"
import { useRail } from "@/context/rail"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { AcademyMain } from "@/pages/academy/academy-main"
import { AcademyPanel } from "@/pages/academy/academy-panel"
import { isMainTool, parseDemoContent, withDemoContent, type DemoContent, type DemoTab } from "./content-tabs-state"
import { AnalysisDashboard } from "./analysis"
import { BotMain, BotPanel } from "./bot"
import { FlashbackMain, FlashbackPanel, FlashbackProvider } from "./flashback"
import { HuntPanel } from "./insights/hunt-panel"
import type { MascotId } from "./journey/types"
import { NewsPanel } from "./market/news-panel"
import { PatternsPanel } from "./market/patterns-panel"
import { PortfolioPanel } from "./portfolio/portfolio-panel"
import { PracticeMain, PracticePanel, PracticeProvider, parsePracticeParam } from "./practice"
import { ShopMain, ShopPanel } from "./shop"
import { TradingRuntime } from "./trading"
import { OrderPanel } from "./trading/order-panel"
import { useWorkspaceMemory, workspaceMemory } from "./workspace-sections"
import { useWorkspace } from "./workspace/use-workspace"

const ChartPage = lazy(() => import("@/pages/charts/chart-page").then((module) => ({ default: module.ChartPage })))
const PriceBoardPage = lazy(() => import("@/pages/securities/price-board/price-board-page").then((module) => ({ default: module.PriceBoardPage })))
const MarketWorkspacePage = lazy(() => import("@/pages/market-workspace/market-workspace-page").then((module) => ({ default: module.MarketWorkspacePage })))

const CONTENT_TABS: { id: DemoTab; label: string }[] = [
  { id: "chart", label: "Biểu đồ" },
  { id: "board", label: "Bảng giá" },
  { id: "market", label: "Thị trường" },
]

/** DEMO TRADING main area: the three tabs, or Insight in place of them (no tab selected). */
function ContentTabs({ active, onSelect, children }: { active: DemoContent; onSelect: (content: DemoContent) => void; children: React.ReactNode }) {
  const content = active === "market" || active === "insight" ? (
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
      {[...CONTENT_TABS.map((tab) => tab.id), "insight" as const, "dashboard" as const].map((id) => <TabsContent key={id} value={id} forceMount className={cn("min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden", (id === "board" || id === "dashboard") && "flex flex-col")}>
        {active === id && <Suspense fallback={<ContentFallback />}>{content}</Suspense>}
      </TabsContent>)}
    </Tabs>
  )
}

function ContentFallback() {
  return <div className="space-y-4 p-4 sm:p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></div>
}

/** HỌC VIỆN main area: the tool's view (Học viện, Bot, Shop) or the Bot practice. */
function AcademySection({ toolId, label, practice, mascotId, onNavigate }: {
  toolId: string
  label: string
  practice: boolean
  mascotId: MascotId
  onNavigate: (panel: string, symbol?: string) => void
}) {
  return (
    <section aria-label={label} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {practice ? <PracticeMain /> : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
          <div className="min-w-0 space-y-3 p-1.5 min-[901px]:p-3 min-[1750px]:p-5">
            {toolId === "bot" ? (
              <BotMain mascotId={mascotId} />
            ) : toolId === "shop" ? (
              <ShopMain onNavigate={onNavigate} />
            ) : toolId === "flashback" ? (
              <FlashbackMain onNavigate={onNavigate} />
            ) : (
              <AcademyMain mascotId={mascotId} />
            )}
          </div>
        </ScrollArea>
      )}
    </section>
  )
}

function DemoWorkspace() {
  const { activeId, activeItem } = useRail()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const memory = useWorkspaceMemory()
  // Bootstraps the accounts once per session whichever main tab is open first.
  const { mascotId } = useWorkspace()
  const rawSymbol = params.get("symbol")?.toUpperCase()
  const symbol = rawSymbol && /^[A-Z0-9]{1,10}$/.test(rawSymbol) ? rawSymbol : "VNM"
  const section: WorkspaceSection = sectionOfTool(activeId)
  const content = parseDemoContent(params.get("content"))
  // `view=bot&practice=<indicator_id>` opens the optional mini practice in place of the Bot panel.
  const practiceId = activeId === "bot" ? parsePracticeParam(params.get("practice")) : null
  const navigationState = location.state as { workspaceSection?: boolean; openPanel?: boolean } | null
  const lastTab = memory.demo?.lastTab ?? "chart"
  const collapsed = memory[section]?.collapsedTool === activeId

  // Each section comes back as it was left (tool, tab, lesson, collapsed panel).
  const search = location.search
  useLayoutEffect(() => {
    workspaceMemory.remember(section, search)
  }, [section, search])
  // A direct link to a tool always shows its panel; a collapsed panel belongs to its own tool only.
  const openRequested = navigationState?.openPanel === true
  const collapsedTool = memory[section]?.collapsedTool ?? null
  useLayoutEffect(() => {
    if (collapsedTool !== null && (openRequested || collapsedTool !== activeId)) workspaceMemory.setCollapsedTool(section, null)
  }, [location.key, openRequested, collapsedTool, activeId, section])

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
  const onCollapsedChange = useCallback((next: boolean) => {
    workspaceMemory.setCollapsedTool(section, next ? activeId : null)
  }, [section, activeId])

  const rail: WorkspaceRail = {
    items: demoChrome.items.filter((item) => !item.hidden && item.section === section),
    activeTool: activeId,
    mainToolId: section === "demo" && isMainTool(content) ? content : null,
    onSelectTool: (id) => {
      // A panel tool picked while a main-area tool is on screen brings back the tab it replaced.
      let next = new URLSearchParams(params)
      if (section === "demo" && isMainTool(content)) next = withDemoContent(next, lastTab)
      next.set("view", id)
      setParams(next, { replace: true })
    },
    // A main-area tool replaces the tabs; a second click returns to the tab it replaced.
    onSelectMainTool: (id) => {
      if (!isMainTool(id)) return
      selectContent(content === id ? lastTab : id)
    },
  }

  function panel() {
    if (practiceId) return <PracticePanel />
    switch (activeId) {
      case "trading": return <OrderPanel symbol={symbol} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />
      case "portfolio": return <PortfolioPanel symbol={symbol} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />
      case "hunt": return <HuntPanel onNavigate={navigatePanel} />
      case "news": return <NewsPanel symbol={symbol} />
      case "patterns": return <PatternsPanel symbol={symbol} />
      case "bot": return <BotPanel />
      case "shop": return <ShopPanel onNavigate={navigatePanel} />
      case "flashback": return <FlashbackPanel onNavigate={navigatePanel} />
      default: return <AcademyPanel />
    }
  }

  const main = section === "academy"
    ? <AcademySection toolId={activeId} label={activeItem?.label ?? "Học viện"} practice={practiceId !== null} mascotId={mascotId} onNavigate={navigatePanel} />
    : (
      <ContentTabs active={content} onSelect={selectContent}>
        {content === "chart" ? <ChartPage embedded />
          : content === "board" ? <PriceBoardPage embedded />
            : content === "dashboard" ? <AnalysisDashboard symbol={symbol} />
              : <MarketWorkspacePage embedded view={content === "insight" ? "stock" : "market"} />}
      </ContentTabs>
    )

  const frame = (
    <WorkspaceFrame
      // Switching sections starts each one afresh (on phones its panel layer starts closed).
      key={section}
      panelLabel={activeItem?.label ?? "Đặt lệnh"}
      // A direct link to a tool opens its layer; a direct link to a lesson shows the lesson, and the
      // header's section links keep the layer closed.
      defaultPanelOpen={params.has("view") && navigationState?.workspaceSection !== true && !(activeId === "academy" && params.has("lesson"))}
      revealKey={openRequested ? location.key : null}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      rail={rail}
      // HỌC VIỆN is long-form reading: on phones its tools sit in a bar above the lesson so the
      // article keeps the full width, and the bar's tool buttons open the panel layer.
      phoneRail={section === "academy" ? "bar" : "column"}
      main={main}
      panel={panel()}
    />
  )

  return <>
    <PracticeProvider indicatorId={practiceId}>
      {/* Flashback: vùng chính và panel dùng chung một lượt chơi. */}
      {activeId === "flashback" ? <FlashbackProvider>{frame}</FlashbackProvider> : frame}
    </PracticeProvider>
    <TradingRuntime />
  </>
}

export function DemoTradingPage() {
  const { user, sessionError, sessionExpired, openAuth } = useAuth()
  if (sessionError) return <main className="min-h-0 flex-1 p-6"><PanelState title="Không xác minh được phiên đăng nhập" description={sessionError.message} action={{ label: "Thử lại", onClick: () => window.location.reload() }} /></main>
  if (sessionExpired && !user) return <main className="min-h-0 flex-1 p-6"><PanelState title="Phiên đăng nhập đã hết hạn" description="Tài khoản của bạn vẫn được lưu trên máy chủ. Đăng nhập lại để tiếp tục." action={{ label: "Đăng nhập lại", onClick: () => openAuth("login") }} /></main>
  return <DemoWorkspace key={user?.id ?? "guest"} />
}

import { lazy, Suspense, useCallback, useLayoutEffect, useRef, type ComponentProps } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router"

import { PanelState } from "@/components/layout/panel-state"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspaceFrame, WorkspacePanelToggle, type WorkspaceRail } from "@/components/layout/workspace-frame"
import { FLASHBACK_TOOL, PRACTICE_TOOL, SECTION_CHROME, SECTION_PATH, TOOL_PARAM, type WorkspaceSection } from "@/config/chrome"
import { useRail } from "@/context/rail"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { AcademyMain } from "@/pages/academy/academy-main"
import { AcademyPanel } from "@/pages/academy/academy-panel"
import {
  isMainTool,
  parseDemoContent,
  parseTradingTab,
  TRADING_TAB_PARAM,
  withDemoContent,
  type DemoContent,
  type DemoTab,
  type TradingTab,
} from "./content-tabs-state"
import { AnalysisDashboard } from "./analysis"
import { BotMain, BotPanel } from "./bot"
import { CandleDojoFrame, CandleDojoMain, CandleDojoProvider } from "./candle-dojo"
import { FlashbackFrame, FlashbackMain, FlashbackPanel, FlashbackProvider } from "./flashback"
import { HuntPanel } from "./insights/hunt-panel"
import type { MascotId } from "./journey/types"
import { PatternsPanel } from "./market/patterns-panel"
import { PracticeMain, PracticePanel, PracticeProvider, parsePracticeParam } from "./practice"
import { ShopMain, ShopPanel } from "./shop"
import { requestCandleCardsFromDojo } from "./shop/candle-cards-store"
import { TradingRuntime } from "./trading"
import { TRADING_PANEL_TITLE, TradingToolPanel } from "./trading/trading-tool-panel"
import { sectionSearch, useWorkspaceMemory, withTool, workspaceMemory } from "./workspace-sections"
import { toolTarget } from "./workspace-url"
import { useWorkspace } from "./workspace/use-workspace"

const ChartPage = lazy(() => import("@/pages/charts/chart-page").then((module) => ({ default: module.ChartPage })))
const PriceBoardPage = lazy(() => import("@/pages/securities/price-board/price-board-page").then((module) => ({ default: module.PriceBoardPage })))
const MarketWorkspacePage = lazy(() => import("@/pages/market-workspace/market-workspace-page").then((module) => ({ default: module.MarketWorkspacePage })))

const CONTENT_TABS: { id: DemoTab; label: string }[] = [
  { id: "chart", label: "Biểu đồ" },
  { id: "board", label: "Bảng giá" },
  { id: "market", label: "Thị trường" },
]

function ContentTabBar() {
  return (
    <div className="flex shrink-0 items-stretch border-b border-border bg-card">
      <TabsList variant="line" aria-label="Nội dung giao dịch" className="group-data-horizontal/tabs:h-11 min-w-0 flex-1 justify-start overflow-x-auto overflow-y-hidden rounded-none bg-card px-3 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
        {CONTENT_TABS.map((tab) => <TabsTrigger key={tab.id} value={tab.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })} className="h-full flex-none rounded-none px-3 text-xs font-semibold text-text-secondary hover:text-foreground focus-visible:ring-inset data-active:text-foreground dark:text-text-secondary dark:hover:text-foreground dark:data-active:text-foreground group-data-horizontal/tabs:after:bottom-0">{tab.label}</TabsTrigger>)}
      </TabsList>
      <div className="flex shrink-0 items-center pr-2"><WorkspacePanelToggle /></div>
    </div>
  )
}

type MainView = DemoContent | "dashboard"

/** Giao dịch main area: the three tabs, or Insight in place of them; Dashboard phân tích keeps the tab bar. */
function ContentTabs({ active, onSelect, children }: { active: MainView; onSelect: (content: DemoContent) => void; children: React.ReactNode }) {
  const content = active === "market" || active === "insight" ? (
    <ScrollArea className="h-full min-h-0" orientation="both" viewportClassName="[&>div]:h-full">
      {children}
    </ScrollArea>
  ) : children
  return (
    <Tabs value={active} onValueChange={(value) => value && value !== "dashboard" && onSelect(value as DemoContent)} className="min-h-0 flex-1 gap-0">
      {active !== "dashboard" && <ContentTabBar />}
      {[...CONTENT_TABS.map((tab) => tab.id), "insight" as const, "dashboard" as const].map((id) => <TabsContent key={id} value={id} forceMount className={cn("min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden", (id === "board" || id === "dashboard") && "flex flex-col")}>
        {active === id && <Suspense fallback={<ContentFallback />}>{content}</Suspense>}
      </TabsContent>)}
    </Tabs>
  )
}

function ContentFallback() {
  return <div className="space-y-4 p-4 sm:p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></div>
}

/** Main area of a tool without tabs (Học viện, Candle Dojo, Bot, Shop, Flashback) or the Bot practice. */
function ToolSection({ toolId, label, practice, mascotId, onNavigate }: {
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
            {toolId === PRACTICE_TOOL.bot ? (
              <BotMain mascotId={mascotId} />
            ) : toolId === PRACTICE_TOOL.dojo ? (
              // The cards live in FLASHBACK → Shop (layout v1.3 §2.5): the Dojo's "Thẻ nến của bạn" block opens it.
              <CandleDojoMain
                onOpenShop={() => {
                  requestCandleCardsFromDojo()
                  onNavigate(FLASHBACK_TOOL.shop)
                }}
              />
            ) : toolId === FLASHBACK_TOOL.shop ? (
              <ShopMain onNavigate={onNavigate} />
            ) : toolId === FLASHBACK_TOOL.flashback ? (
              <FlashbackMain />
            ) : (
              <AcademyMain mascotId={mascotId} />
            )}
          </div>
        </ScrollArea>
      )}
    </section>
  )
}

/** A direct link to a tool always opens its panel, even one the learner collapsed. */
const OPEN_PANEL_STATE = { openPanel: true }

function DemoWorkspace({ section }: { section: WorkspaceSection }) {
  const { activeId, activeItem } = useRail()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const memory = useWorkspaceMemory()
  // Bootstraps the accounts once per session whichever tool is open first.
  const { mascotId } = useWorkspace()
  const rawSymbol = params.get("symbol")?.toUpperCase()
  const symbol = rawSymbol && /^[A-Z0-9]{1,10}$/.test(rawSymbol) ? rawSymbol : "VNM"
  const trading = activeId === PRACTICE_TOOL.trading
  const content = parseDemoContent(params.get("content"))
  const tradingTab = parseTradingTab(params.get(TRADING_TAB_PARAM))
  // `tool=bot&practice=<indicator_id>` opens the optional mini practice in place of the Bot panel.
  const practiceId = activeId === PRACTICE_TOOL.bot ? parsePracticeParam(params.get("practice")) : null
  const navigationState = location.state as { workspaceSection?: boolean; openPanel?: boolean } | null
  const sectionMemory = memory[section]
  const lastTab = sectionMemory?.lastTab ?? "chart"
  const collapsed = (trading && isMainTool(content)) || sectionMemory?.collapsedTool === activeId

  // Each section comes back as it was left (tool, Giao dịch tabs, lesson, collapsed panel).
  const search = location.search
  useLayoutEffect(() => {
    workspaceMemory.remember(section, search)
  }, [section, search])
  // A direct link to a tool always shows its panel; a collapsed panel belongs to its own tool only.
  const openRequested = navigationState?.openPanel === true
  const collapsedTool = sectionMemory?.collapsedTool ?? null
  // An "open the panel" link is honoured once per navigation; a later click on the rail may collapse it again.
  const handledOpenKey = useRef<string | null>(null)
  useLayoutEffect(() => {
    const freshOpen = openRequested && handledOpenKey.current !== location.key
    if (freshOpen) handledOpenKey.current = location.key
    if (collapsedTool !== null && (freshOpen || collapsedTool !== activeId)) workspaceMemory.setCollapsedTool(section, null)
  }, [location.key, openRequested, collapsedTool, activeId, section])

  function selectSymbol(nextSymbol: string) {
    const next = new URLSearchParams(params)
    next.set("symbol", nextSymbol.toUpperCase())
    setParams(next, { replace: true })
  }
  /** Links between tools: a panel id of either layout; the other section is another route. */
  function navigatePanel(panel: string, nextSymbol?: string) {
    const target = toolTarget(panel)
    if (!target) return
    if (target.section !== section) {
      const query = new URLSearchParams(sectionSearch(target.section, search, memory, { id: target.tool, tab: target.tab }))
      if (nextSymbol) query.set("symbol", nextSymbol.toUpperCase())
      navigate(`${SECTION_PATH[target.section]}?${query}`, { state: OPEN_PANEL_STATE })
      return
    }
    const next = withTool(params, target.tool, sectionMemory, target.tab)
    if (nextSymbol) next.set("symbol", nextSymbol.toUpperCase())
    setParams(next, { replace: true })
  }
  function selectContent(nextContent: DemoContent) {
    const next = trading ? params : withTool(params, PRACTICE_TOOL.trading, sectionMemory)
    setParams(withDemoContent(next, nextContent), { replace: true })
  }
  function selectTradingTab(tab: TradingTab) {
    const next = new URLSearchParams(params)
    next.set(TRADING_TAB_PARAM, tab)
    setParams(next, { replace: true })
  }
  const onCollapsedChange = useCallback((next: boolean) => {
    workspaceMemory.setCollapsedTool(section, next ? activeId : null)
  }, [section, activeId])

  const chrome = SECTION_CHROME[section]
  const rail: WorkspaceRail = {
    items: chrome.items.filter((item) => !item.hidden),
    activeTool: activeId,
    mainToolId: trading && isMainTool(content) ? content : null,
    onSelectTool: (id) => setParams(withTool(params, id, sectionMemory), { replace: true }),
    // Insight (while enabled) replaces the tabs; a second click returns to the tab it replaced.
    onSelectMainTool: (id) => {
      if (!isMainTool(id)) return
      selectContent(trading && content === id ? lastTab : id)
    },
  }

  // Dashboard phân tích and Candle Dojo fill the main area; Flashback shows its panel only in a match.
  const panelLess = activeId === PRACTICE_TOOL.dashboard || activeId === PRACTICE_TOOL.dojo

  function panel() {
    if (practiceId) return <PracticePanel />
    switch (activeId) {
      case PRACTICE_TOOL.trading:
        return <TradingToolPanel tab={tradingTab} onTabChange={selectTradingTab} symbol={symbol} onSymbolChange={selectSymbol} onNavigate={navigatePanel} />
      case "hunt": return <HuntPanel onNavigate={navigatePanel} />
      case "patterns": return <PatternsPanel symbol={symbol} />
      case PRACTICE_TOOL.bot: return <BotPanel />
      case PRACTICE_TOOL.dojo:
      case PRACTICE_TOOL.dashboard: return null
      case FLASHBACK_TOOL.shop: return <ShopPanel onNavigate={navigatePanel} />
      case FLASHBACK_TOOL.flashback: return <FlashbackPanel />
      default: return <AcademyPanel />
    }
  }

  const main = trading || activeId === PRACTICE_TOOL.dashboard
    ? (
      <ContentTabs active={trading ? content : "dashboard"} onSelect={selectContent}>
        {!trading ? <AnalysisDashboard symbol={symbol} tabsSlot={<ContentTabBar />} />
          : content === "chart" ? <ChartPage embedded />
            : content === "board" ? <PriceBoardPage embedded />
              : <MarketWorkspacePage embedded view={content === "insight" ? "stock" : "market"} />}
      </ContentTabs>
    )
    : <ToolSection toolId={activeId} label={activeItem?.label ?? chrome.items[0].label} practice={practiceId !== null} mascotId={mascotId} onNavigate={navigatePanel} />

  const frameProps: ComponentProps<typeof WorkspaceFrame> = {
    panelLabel: trading ? TRADING_PANEL_TITLE : activeItem?.label ?? chrome.items[0].label,
    // A direct link to a tool opens its layer; a direct link to a lesson shows the lesson, and the
    // header's section links keep the layer closed.
    defaultPanelOpen: params.has(TOOL_PARAM) && navigationState?.workspaceSection !== true && !(activeId === PRACTICE_TOOL.academy && params.has("lesson")),
    revealKey: openRequested ? location.key : null,
    collapsed,
    onCollapsedChange,
    rail,
    // Only Giao dịch keeps the rail column on phones; the long-form tools and Dashboard phân tích
    // (which stacks vertically) get a tool bar at the top so they keep the full phone width.
    phoneRail: trading ? "column" : "bar",
    main,
    panel: panel(),
  }
  // Flashback: the main area and the panel share one match, and the lobby and waiting room have no panel.
  // Candle Dojo: one screen without a panel; a lesson or exam also leaves the rail out until it ends.
  const frame = activeId === FLASHBACK_TOOL.flashback
    ? <FlashbackProvider><FlashbackFrame {...frameProps} /></FlashbackProvider>
    : activeId === PRACTICE_TOOL.dojo
      ? <CandleDojoProvider><CandleDojoFrame {...frameProps} /></CandleDojoProvider>
      : <WorkspaceFrame {...frameProps} panelHidden={panelLess} />

  return <>
    <PracticeProvider indicatorId={practiceId}>{frame}</PracticeProvider>
    <TradingRuntime />
  </>
}

function WorkspacePage({ section }: { section: WorkspaceSection }) {
  const { user, sessionError, sessionExpired, openAuth } = useAuth()
  if (sessionError) return <main className="min-h-0 flex-1 p-6"><PanelState title="Không xác minh được phiên đăng nhập" description={sessionError.message} action={{ label: "Thử lại", onClick: () => window.location.reload() }} /></main>
  if (sessionExpired && !user) return <main className="min-h-0 flex-1 p-6"><PanelState title="Phiên đăng nhập đã hết hạn" description="Tài khoản của bạn vẫn được lưu trên máy chủ. Đăng nhập lại để tiếp tục." action={{ label: "Đăng nhập lại", onClick: () => openAuth("login") }} /></main>
  return <DemoWorkspace key={user?.id ?? "guest"} section={section} />
}

/** LUYỆN TẬP (`/luyen-tap`): Candle Dojo · Học viện · Bot · Giao dịch · Dashboard phân tích. */
export function PracticePage() {
  return <WorkspacePage section="practice" />
}

/** FLASHBACK (`/flashback`): Flashback · Shop. */
export function FlashbackSectionPage() {
  return <WorkspacePage section="flashback" />
}

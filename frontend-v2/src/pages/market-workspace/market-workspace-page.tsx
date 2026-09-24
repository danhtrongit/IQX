// ─── Market workspace (/thi-truong) ───────────────────────────────────────────
// One route, three analysis views: market brief (3 sessions), stock analysis
// (6-layer AI insight) and financial-statement analysis (BCTC dashboard).
//
// Navigation state lives in the URL so a reload or a shared link lands on the
// same view: `?view=market|stock|financial` (or `?analysis=` when embedded in
// demo trading). The legacy `?tour=` entry point is
// still honoured (`bantin|phantich|bctc`): the request switches to the matching
// view, auto-starts that view's tour, and is then removed from the URL so a
// reload doesn't replay the tour.

import { useRef } from "react"
import { useSearchParams } from "react-router"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { withAnalysisView } from "@/pages/demo-trading/content-tabs-state"

import {
  WORKSPACE_VIEW_META,
  WorkspaceViewNav,
  parseWorkspaceView,
  type WorkspaceView,
} from "./components/view-rail"
import { FinancialAnalysisView } from "./financial/financial-analysis-view"
import { MarketSessionsView } from "./market/market-sessions-view"
import { StockAnalysisView } from "./stock/stock-analysis-view"
import type { ProductTourKey } from "./tour/use-product-tour"

const TOUR_VIEW: Record<ProductTourKey, WorkspaceView> = {
  bantin: "market",
  phantich: "stock",
  bctc: "financial",
}

function isProductTourKey(value: string | null): value is ProductTourKey {
  return value === "bantin" || value === "phantich" || value === "bctc"
}

export function MarketWorkspacePage({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams()
  const contentRef = useRef<HTMLDivElement>(null)

  const tourParam = params.get("tour")
  const tourKey = isProductTourKey(tourParam) ? tourParam : null
  // The view follows the URL; an unconsumed tour request decides it first.
  const active: WorkspaceView = tourKey
    ? TOUR_VIEW[tourKey]
    : parseWorkspaceView(params.get(embedded ? "analysis" : "view"))

  const consumeTour = (key: ProductTourKey) => {
    if (tourKey !== key) return
    const next = embedded ? withAnalysisView(params, TOUR_VIEW[key]) : new URLSearchParams(params)
    next.delete("tour")
    if (!embedded) next.set("view", TOUR_VIEW[key])
    setParams(next, { replace: true })
  }

  const selectView = (view: WorkspaceView) => {
    contentRef.current
      ?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
      ?.scrollTo({ top: 0, behavior: "smooth" })
    const next = embedded ? withAnalysisView(params, view) : new URLSearchParams(params)
    if (!embedded) next.set("view", view)
    setParams(next, { replace: true })
  }

  const meta = WORKSPACE_VIEW_META[active]

  const content = (
    <div ref={contentRef} className={embedded ? "min-h-full" : "min-h-full pb-24 lg:pb-0"}>
      {active === "market" && (
        <MarketSessionsView autoStartTour={tourKey === "bantin"} onTourStarted={() => consumeTour("bantin")} />
      )}
      {active === "stock" && (
        <StockAnalysisView autoStartTour={tourKey === "phantich"} onTourStarted={() => consumeTour("phantich")} />
      )}
      {active === "financial" && (
        <FinancialAnalysisView autoStartTour={tourKey === "bctc"} onTourStarted={() => consumeTour("bctc")} />
      )}
    </div>
  )

  return (
    <>
      {embedded ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <div><h2 className="font-heading text-lg font-semibold">{meta.title}</h2><p className="text-xs text-muted-foreground">{meta.description}</p></div>
            <WorkspaceViewNav active={active} onSelect={selectView} variant="header" />
          </header>
          <div className="p-4 sm:p-6">{content}</div>
        </div>
      ) : (
      <WorkspacePage
        title={meta.title}
        description={meta.description}
        actions={
          <div className="hidden lg:block">
            <WorkspaceViewNav active={active} onSelect={selectView} variant="header" />
          </div>
        }
        contentClassName="space-y-6"
      >
        {content}
      </WorkspacePage>
      )}
      {!embedded && <WorkspaceViewNav active={active} onSelect={selectView} variant="bottom" />}
    </>
  )
}

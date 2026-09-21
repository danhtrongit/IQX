import { useRef, useState } from "react"
import { HomeMarketView } from "@/features/market-overview/HomeMarketView"
import { HomeAnalysisRail, type HomeView } from "./HomeAnalysisRail"
import { StockAnalysisView } from "./StockAnalysisView"
import { FinancialAnalysisView } from "./FinancialAnalysisView"
import { useMediaQuery } from "./useMediaQuery"

export function HomeWorkspace() {
  const [requestedTour, setRequestedTour] = useState(() => new URLSearchParams(window.location.search).get("tour"))
  const requestedView = new URLSearchParams(window.location.search).get("view")
  const initialView: HomeView = requestedTour === "phantich" || requestedView === "stock"
    ? "stock"
    : requestedTour === "bctc" || requestedView === "financial"
      ? "financial"
      : "market"
  const [active, setActive] = useState<HomeView>(initialView)
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const contentRef = useRef<HTMLDivElement>(null)

  const select = (v: HomeView) => {
    setActive(v)
    // The window never scrolls (app shell is h-svh) — reset the real scrollers instead:
    // desktop = this content div itself; mobile = the shell's ancestor <main>.
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    contentRef.current?.closest("main")?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const consumeTourRequest = () => {
    setRequestedTour(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("tour")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }

  const content = (
    <div ref={contentRef} className="min-h-0 overflow-y-auto">
      {active === "market" && <HomeMarketView autoStartTour={requestedTour === "bantin"} onTourStarted={consumeTourRequest} />}
      {active === "stock" && <StockAnalysisView autoStartTour={requestedTour === "phantich"} onTourStarted={consumeTourRequest} />}
      {active === "financial" && <FinancialAnalysisView autoStartTour={requestedTour === "bctc"} onTourStarted={consumeTourRequest} />}
    </div>
  )

  if (isDesktop) {
    return (
      <div className="grid h-full grid-cols-[1fr_88px]">
        {content}
        <HomeAnalysisRail active={active} onSelect={select} variant="side" />
      </div>
    )
  }

  return (
    <div className="h-full">
      {content}
      <HomeAnalysisRail active={active} onSelect={select} variant="bottom" />
    </div>
  )
}

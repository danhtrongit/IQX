import { Button } from "@arco-design/web-react"
import { IconClose } from "@arco-design/web-react/icon"
import { useSidebar, type SidebarPanel } from "@/shared/contexts/sidebar-context"
import { NewsFeedPanel } from "@/features/news"
import { TradingPanel } from "@/features/trading"
import { WatchlistPanel } from "@/features/watchlist"
import { PremiumGate } from "@/features/premium"
import { AIPatternPanel } from "@/features/patterns"
// Imported from the concrete files (NOT the `@/features/cap0` barrel) — that
// barrel re-exports `Cap0TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`. Going through the
// barrel here would create a module-graph cycle between the two features.
import { JourneyPanel } from "@/features/cap0/JourneyPanel"
import { useCap0Events } from "@/features/cap0/Cap0Context"
import { useCap0Progress } from "@/features/cap0/hooks"
import { cap0Visibility } from "@/features/cap0/cap0Visibility"
// Same anti-cycle rationale as the cap0 imports above — `@/features/cap1`'s
// barrel re-exports `Cap1TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap1 } from "@/features/cap1/JourneyPanelCap1"
import { Cap1PortfolioAnalysisPanel } from "@/features/cap1/Cap1PortfolioAnalysisPanel"
import { useCap1Events } from "@/features/cap1/Cap1Context"
// Same anti-cycle rationale, two levels up — `@/features/cap2`'s barrel
// re-exports `Cap2TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap2 } from "@/features/cap2/JourneyPanelCap2"
import { Cap2PortfolioAnalysisPanel } from "@/features/cap2/Cap2PortfolioAnalysisPanel"
import { useCap2Events } from "@/features/cap2/Cap2Context"
// Same anti-cycle rationale, three levels up — `@/features/cap3`'s barrel
// re-exports `Cap3TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap3 } from "@/features/cap3/JourneyPanelCap3"
import { Cap3PortfolioAnalysisPanel } from "@/features/cap3/Cap3PortfolioAnalysisPanel"
import { useCap3Events } from "@/features/cap3/Cap3Context"

/**
 * Dynamic right sidebar that switches between panels:
 * - news: Market news feed with filters
 * - patterns: AI candle / chart pattern recognition (premium)
 * - trading: Virtual-trading order form + order book (premium)
 * - watchlist: Watchlist, holdings, and trade history
 * - journey: Cấp 0 «Nhập môn» onboarding checklist (only reachable on
 *   `/dau-truong` — `Cap0TradingPage` sets it as the default panel).
 *
 * "Mô hình dự báo" is no longer a panel — it lives at /du-bao.
 */
export function RightSidebar() {
  const { activePanel, isOpen, setIsOpen } = useSidebar()
  // Hide-by-level (spec §8) — "Tin tức" / "AI Mẫu nến" stay hidden until
  // Cấp 1 (graduation) while in Cấp 0. `useCap0Progress(isCap0Active)` only
  // queries inside Cấp 0, so this has zero effect on /bieu-do & /co-phieu.
  const { isCap0Active } = useCap0Events()
  const { data: cap0Progress } = useCap0Progress(isCap0Active)
  const visibility = cap0Visibility(cap0Progress)
  // Cấp 0, Cấp 1, Cấp 2 and Cấp 3 providers are never all independently
  // mounted (progression routing — `DauTruongPage` — picks exactly one shell
  // per visit), EXCEPT that each level's shell wraps every EARLIER level's
  // provider too (cộng dồn: a Cấp 3 session wraps `Cap1Provider` +
  // `Cap2Provider` + `Cap3Provider` — see `Cap3TradingPage`), so
  // `isCap1Active`/`isCap2Active` are ALSO true during Cấp 3. "journey" and
  // the per-level analysis panels therefore check the HIGHEST level FIRST
  // (most specific), falling through to lower levels then Cấp 0's default.
  const { isCap1Active } = useCap1Events()
  const { isCap2Active } = useCap2Events()
  const { isCap3Active } = useCap3Events()

  const getPanelContent = () => {
    switch (activePanel) {
      case "news":
        // Defense-in-depth: even if something else lands `activePanel` on
        // "news" while it's hidden (spec §8), fall back to the Cấp 0 default
        // view instead of showing the hidden panel.
        if (isCap0Active && !visibility.newsTab) return <JourneyPanel />
        return <NewsFeedPanel />
      case "patterns":
        if (isCap0Active && !visibility.aiPatternsTab) return <JourneyPanel />
        return (
          <PremiumGate
            featureName="AI Mẫu nến"
            description="Nhận diện mẫu nến tự động bằng AI cho mã đang xem."
          >
            <AIPatternPanel />
          </PremiumGate>
        )
      case "trading":
        return <TradingPanel />
      case "watchlist":
        return <WatchlistPanel />
      case "journey":
        if (isCap3Active) return <JourneyPanelCap3 />
        if (isCap2Active) return <JourneyPanelCap2 />
        return isCap1Active ? <JourneyPanelCap1 /> : <JourneyPanel />
      case "cap1-analysis":
        // Only reachable from `JourneyPanelCap1`'s own button (inside Cấp 1)
        // — defensive fallback mirrors the "journey" case above.
        return isCap1Active ? <Cap1PortfolioAnalysisPanel /> : <JourneyPanel />
      case "cap2-analysis":
        // Only reachable from `JourneyPanelCap2`'s own button (inside Cấp 2).
        return isCap2Active ? <Cap2PortfolioAnalysisPanel /> : <JourneyPanel />
      case "cap3-analysis":
        // Only reachable from `JourneyPanelCap3`'s own button (inside Cấp 3).
        return isCap3Active ? <Cap3PortfolioAnalysisPanel /> : <JourneyPanel />
      default:
        return <NewsFeedPanel />
    }
  }

  const panelNames: Record<SidebarPanel, string> = {
    news: "Tin tức",
    patterns: "AI Mẫu nến",
    trading: "Đặt lệnh",
    watchlist: "Danh mục",
    journey: "Hành trình",
    "cap1-analysis": "Phân tích danh mục",
    "cap2-analysis": "Phân tích danh mục",
    "cap3-analysis": "Phân tích danh mục",
  }

  return (
    <aside
      className={`fixed inset-x-0 bottom-[52px] top-[76px] z-40 bg-[var(--color-bg-1)] border-t border-[var(--color-border-2)] shadow-2xl transition-transform duration-300 md:static md:w-[280px] md:shrink-0 md:z-auto md:translate-y-0 md:border-l md:border-t-0 md:shadow-none flex flex-col overflow-hidden ${
        isOpen ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-2)] bg-[var(--color-fill-1)]">
        <span className="text-xs font-bold uppercase text-[var(--color-text-1)]">
          {panelNames[activePanel] || activePanel}
        </span>
        <Button
          type="text"
          size="mini"
          icon={<IconClose />}
          onClick={() => setIsOpen(false)}
        />
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {getPanelContent()}
      </div>
    </aside>
  )
}

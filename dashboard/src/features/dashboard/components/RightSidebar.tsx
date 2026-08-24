import { Button, Message } from "@arco-design/web-react"
import { IconClose } from "@arco-design/web-react/icon"
import { useSidebar, type SidebarPanel } from "@/shared/contexts/sidebar-context"
import { useSymbol } from "@/shared/contexts/symbol-context"
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
// Same anti-cycle rationale, four levels up — `@/features/cap4`'s barrel
// re-exports `Cap4TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap4 } from "@/features/cap4/JourneyPanelCap4"
import { Cap4PortfolioAnalysisPanel } from "@/features/cap4/Cap4PortfolioAnalysisPanel"
import { useCap4Events } from "@/features/cap4/Cap4Context"
// Same anti-cycle rationale, five levels up — `@/features/cap5`'s barrel
// re-exports `Cap5TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap5 } from "@/features/cap5/JourneyPanelCap5"
import { Cap5PortfolioAnalysisPanel } from "@/features/cap5/Cap5PortfolioAnalysisPanel"
import { SanMaPanel } from "@/features/cap5/SanMaPanel"
import { Cap5WatchlistPanel } from "@/features/cap5/Cap5WatchlistPanel"
import { useCap5Events } from "@/features/cap5/Cap5Context"
// Same anti-cycle rationale, six levels up — `@/features/cap6`'s barrel
// re-exports `Cap6TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap6 } from "@/features/cap6/JourneyPanelCap6"
import { Cap6PortfolioAnalysisPanel } from "@/features/cap6/Cap6PortfolioAnalysisPanel"
import { useCap6Events } from "@/features/cap6/Cap6Context"
// Same anti-cycle rationale, seven levels up — `@/features/cap7`'s barrel
// re-exports `Cap7TradingPage`, which itself imports `CenterPanel`/
// `RightSidebar`/`RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap7 } from "@/features/cap7/JourneyPanelCap7"
import { Cap7PortfolioAnalysisPanel } from "@/features/cap7/Cap7PortfolioAnalysisPanel"
import { useCap7Events } from "@/features/cap7/Cap7Context"
// Same anti-cycle rationale, eight levels up — `@/features/cap8`'s barrel
// re-exports `Cap8TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`.
import { JourneyPanelCap8 } from "@/features/cap8/JourneyPanelCap8"
import { Cap8PortfolioAnalysisPanel } from "@/features/cap8/Cap8PortfolioAnalysisPanel"
import { useCap8Events } from "@/features/cap8/Cap8Context"

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
  // Cấp 0 … Cấp 8 providers are never all independently mounted (progression
  // routing — `DauTruongPage` — picks exactly one shell per visit), EXCEPT that
  // each level's shell wraps every EARLIER level's provider too (cộng dồn: a Cấp
  // 8 session wraps `Cap1Provider` + … + `Cap8Provider` — see
  // `Cap8TradingPage`), so `isCap1Active`…`isCap7Active` are ALSO true during
  // Cấp 8. "journey" and the per-level analysis panels therefore check the
  // HIGHEST level FIRST (most specific), falling through to lower levels then
  // Cấp 0's default.
  const { isCap1Active } = useCap1Events()
  const { isCap2Active } = useCap2Events()
  const { isCap3Active } = useCap3Events()
  const { isCap4Active } = useCap4Events()
  const { isCap5Active } = useCap5Events()
  const { isCap6Active } = useCap6Events()
  const { isCap7Active } = useCap7Events()
  const { isCap8Active } = useCap8Events()

  // ★ Bấm vào một mã trong Danh mục (Nắm giữ / Theo dõi) KHÔNG được rời khỏi
  // `/dau-truong`. `WatchlistPanel`'s default row action navigates to
  // `/co-phieu/:symbol` — correct on /bieu-do & /co-phieu, but inside a level
  // shell it dumped the user out of the terminal in the middle of a nhiệm vụ
  // (and, on Cấp 0, out of `Cap0Provider`, so their next order fired into the
  // no-op bus). Every level page wraps this sidebar in its own `SymbolProvider`,
  // so the honest answer is: switch the terminal's symbol, stay put.
  //
  // `undefined` outside the level shells keeps today's navigation EXACTLY as it
  // is on the two shared routes — the prop is the only channel involved, so a
  // route with no level provider cannot be affected.
  const { setSymbol } = useSymbol()
  const isLevelActive =
    isCap0Active ||
    isCap1Active ||
    isCap2Active ||
    isCap3Active ||
    isCap4Active ||
    isCap5Active ||
    isCap6Active ||
    isCap7Active ||
    isCap8Active

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
        // ★★ Hai lối thoát nằm NGAY TRONG panel đặt lệnh, vá tại đúng một chỗ
        // và phủ cả chín cấp (kể cả các cấp đang tắt sau trần — mở cấp sau
        // không phải nhớ lại):
        //  · nút mã cổ phiếu ở đầu panel `navigate('/co-phieu/:sym')` — bấm
        //    lúc đang điền form kế hoạch là mất trắng form + rời cấp;
        //  · lỗi Premium từ BE (đặt lệnh / kích hoạt Đấu trường ảo) TỰ ĐỘNG
        //    `navigate('/nang-cap')` — user không bấm gì liên quan nâng cấp.
        // Ngoài shell cấp, `"navigate"` + `undefined` là ĐÚNG hành vi cũ của
        // /bieu-do & /co-phieu.
        return (
          <TradingPanel
            symbolLink={isLevelActive ? "none" : "navigate"}
            onPremiumRequired={
              isLevelActive
                ? () =>
                    Message.info({
                      // ★ KHÔNG chỉ tới nút «Nâng cấp Premium» của header: nó
                      // là `!hidden sm:!inline-flex` (Header.tsx) nên biến mất
                      // hoàn toàn dưới 640px, và trên điện thoại lối duy nhất
                      // là mục «Nâng cấp» trong menu ảnh đại diện. Câu này phải
                      // đúng ở CẢ hai bề rộng.
                      content:
                        "Tính năng này cần Premium. Mở menu ảnh đại diện ở góc phải → «Nâng cấp» (trên máy tính có sẵn nút «Nâng cấp Premium» ngay trên thanh tiêu đề). Hành trình của bạn vẫn giữ nguyên.",
                      duration: 6000,
                    })
                : undefined
            }
          />
        )
      case "watchlist":
        return <WatchlistPanel onRowSelect={isLevelActive ? setSymbol : undefined} />
      case "journey":
        if (isCap8Active) return <JourneyPanelCap8 />
        if (isCap7Active) return <JourneyPanelCap7 />
        if (isCap6Active) return <JourneyPanelCap6 />
        if (isCap5Active) return <JourneyPanelCap5 />
        if (isCap4Active) return <JourneyPanelCap4 />
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
      case "cap4-analysis":
        // Only reachable from `JourneyPanelCap4`'s own button (inside Cấp 4).
        return isCap4Active ? <Cap4PortfolioAnalysisPanel /> : <JourneyPanel />
      case "cap5-analysis":
        // Only reachable from `JourneyPanelCap5`'s own button (inside Cấp 5).
        return isCap5Active ? <Cap5PortfolioAnalysisPanel /> : <JourneyPanel />
      case "cap5-sanma":
        // Màn Săn mã của Cấp 5 (spec §5) — chỉ tới được từ `RightToolbar` khi
        // `isCap5Active`; phòng thủ y hệt "cap5-analysis" (mọi query bên trong
        // panel cũng đã tự gate bằng `isCap5Active`, nên không request nào bắn
        // ra ngoài Cấp 5 kể cả khi nhánh này lọt).
        return isCap5Active ? <SanMaPanel /> : <JourneyPanel />
      case "cap5-watchlist":
        // ★★ Watchlist Cấp 5 (spec §6) là panel RIÊNG — KHÔNG phải bản nâng của
        // `"watchlist"` ("Danh mục") dùng chung ở trên. Panel dùng chung đó có
        // nhiệm vụ ③ của Cấp 0 treo trên nó (`onPortfolioTabOpen`) và cũng chạy
        // trên /bieu-do + /co-phieu, nên nó giữ NGUYÊN hình dạng cũ ở mọi cấp
        // (xem `RightSidebar.cap5SanMa.test.tsx` — canh cả hai chiều).
        return isCap5Active ? <Cap5WatchlistPanel /> : <JourneyPanel />
      case "cap6-analysis":
        // Only reachable from `JourneyPanelCap6`'s own button (inside Cấp 6).
        return isCap6Active ? <Cap6PortfolioAnalysisPanel /> : <JourneyPanel />
      case "cap7-analysis":
        // Only reachable from `JourneyPanelCap7`'s own button (inside Cấp 7).
        return isCap7Active ? <Cap7PortfolioAnalysisPanel /> : <JourneyPanel />
      case "cap8-analysis":
        // Only reachable from `JourneyPanelCap8`'s own button (inside Cấp 8).
        return isCap8Active ? <Cap8PortfolioAnalysisPanel /> : <JourneyPanel />
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
    "cap4-analysis": "Phân tích danh mục",
    "cap5-analysis": "Phân tích danh mục",
    "cap5-sanma": "Săn mã",
    "cap5-watchlist": "Watchlist",
    "cap6-analysis": "Phân tích danh mục",
    "cap7-analysis": "Phân tích danh mục",
    "cap8-analysis": "Phân tích danh mục",
  }

  return (
    /* ★ Bề rộng đọc từ token `--right-sidebar-w` (khai trong `index.css`), KHÔNG
       hard-code ở đây: cột này dùng chung cho trang chủ, cả chín shell cấp,
       /bieu-do và /co-phieu — trước đây `280px` nằm rải một chỗ nhưng đổi nó là
       đổi mọi trang, nên nó xứng đáng là một token có tên và có chỗ giải thích. */
    <aside
      className={`fixed inset-x-0 bottom-[52px] top-[76px] z-40 bg-[var(--color-bg-1)] border-t border-[var(--color-border-2)] shadow-2xl transition-transform duration-300 md:static md:w-[var(--right-sidebar-w)] md:shrink-0 md:z-auto md:translate-y-0 md:border-l md:border-t-0 md:shadow-none flex flex-col overflow-hidden ${
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

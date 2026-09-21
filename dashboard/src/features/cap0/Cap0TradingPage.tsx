import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Message } from "@arco-design/web-react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { RightSidebar, RightToolbar } from "@/features/dashboard"
import { JourneyIdentityStage } from "@/features/journey-identity/JourneyIdentityStage"
import { Cap0Provider, useCap0Events } from "./Cap0Context"
import { ModeBadge } from "./ModeBadge"
import { JourneyBar } from "./JourneyBar"
import { Gbar } from "./Gbar"
import { GraduationModal } from "./GraduationModal"
import { useCap0Progress, useEnterCap0, usePlacement, usePlacementStatus } from "./hooks"
import { PlacementModal, type PlacementAnswer } from "./PlacementModal"
import { tradingModeFor } from "./types"
import { CAP0_TASK_TOUR_ROUTES } from "./journeyTasks"
import "./cap0.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 0 «Nhập môn»"

// Placement is account-scoped server state. The small in-memory flag below
// only covers the mutation-to-refetch window and is never persisted per browser.

/**
 * `/dau-truong` — Cấp 0 «Nhập môn» demo-trading shell (spec §0 "giữ header" +
 * §2 mode badge + §3 placement question). Renders the SAME surrounding chrome
 * as `DashboardPage` — `TrialBanner` + `Header` + `MarketBar` + ... + `Footer`
 * — around the SAME, untouched `CenterPanel`/`RightSidebar`/`RightToolbar`
 * terminal (with VNM preselected per spec §4 instead of VNINDEX), plus the
 * same "AI Phân tích" symbol-picker modal wired to `RightToolbar`'s
 * `onActionClick`. Adds the Cấp 0-specific `.cap0` dark chrome +
 * `Cap0Provider` event bus + sticky `.cap0-topbar` (JourneyBar + mode badge)
 * between `MarketBar` and the terminal body.
 */
export function Cap0TradingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = prevTitle
    }
  }, [])

  return (
    <SymbolProvider symbol="VNM">
      <Cap0Provider>
        <Cap0Terminal />
      </Cap0Provider>
    </SymbolProvider>
  )
}

function Cap0Terminal() {
  const navigate = useNavigate()
  const { registerHandlers } = useCap0Events()
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { data: progress, isFetched } = useCap0Progress()
  const { data: placementStatus, isFetched: placementFetched } = usePlacementStatus()
  const enterCap0 = useEnterCap0()
  const placement = usePlacement()
  const [placementSeen, setPlacementSeen] = useState(false)
  const { activePanel, setActivePanel, setIsOpen } = useSidebar()

  // Spec §7: "Là view mặc định khi user vào app lần đầu và mỗi lần vào lại
  // giữa chừng" — the sidebar's `SidebarProvider` is a SINGLE app-root
  // instance shared by every route (defaultPanel="news", see
  // `app/providers.tsx`), so Cấp 0 can't set its own default — it overrides
  // to "journey" on mount and RESTORES the previous panel on unmount.
  // Without the restore, "journey" leaks into /bieu-do & /co-phieu (they share
  // this global provider) e.g. after a CenterPanel search navigates away.
  // Capture the pre-mount panel once via a ref (not activePanel dep, which
  // would re-fire on every switch and fight the user).
  const prevPanelRef = useRef(activePanel)
  useEffect(() => {
    const previousPanel = prevPanelRef.current
    setActivePanel("journey")
    if (window.innerWidth < 768) setIsOpen(false)
    return () => setActivePanel(previousPanel)
  }, [setActivePanel, setIsOpen])

  useEffect(() => {
    registerHandlers({
      onLaunchTour: (taskNo) => {
        const route = CAP0_TASK_TOUR_ROUTES[taskNo]
        if (route) navigate(route)
      },
    })
  }, [navigate, registerHandlers])

  // Guard (§3): show only once — needs BOTH the server truth (no progress row
  // yet, i.e. never entered Cấp 0) AND the in-memory "already answered" flag
  // (covers the window before the progress query refetches). Wait for the
  // query to settle first so a loading flicker doesn't briefly show the modal
  // to a returning user.
  const showPlacement = isFetched && placementFetched && !progress && !placementStatus && !placementSeen

  // Cấp 0 tracks a single preselected stock (VNM); AI Insight still needs
  // whichever specific listed stock the user cares about, so tapping
  // "AI Phân tích" opens the same symbol picker as `DashboardPage` —
  // mirrors that page's `handleActionClick`/modal exactly.
  const [aiInsightOpen, setAiInsightOpen] = useState(false)

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setAiInsightOpen(true)
    }
  }

  /**
   * Câu hỏi xếp lớp §3 (v3.0) — 3 đáp án, MỘT handler.
   *
   * Người mới vào Cấp 0. Hai nhánh có kinh nghiệm được xếp thẳng Cấp 1/Cấp 2
   * sau chuỗi ba tour sản phẩm do HomeWorkspace điều phối.
   */
  const handlePlacement = (answer: PlacementAnswer) => {
    placement.mutate(answer, {
      onSuccess: () => {
        if (answer === "never") {
          enterCap0.mutate(undefined, { onSuccess: () => setPlacementSeen(true) })
          return
        }
        // Hai nhánh xếp thẳng phải xem ba tour sản phẩm trước khi vào cấp đã
        // xếp. HomeWorkspace tiếp quản chuỗi tour và routing sau khi hoàn tất.
        setPlacementSeen(true)
        Message.info("Hãy xem 3 tour sản phẩm trước khi bắt đầu cấp được xếp")
        navigate("/?view=market&tour=bantin")
      },
    })
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      <TrialBanner />
      <Header onSymbolSelect={setSymbol} />
      <MarketBar onSymbolClick={setSymbol} />

      {/* Top bar (spec §7 journey bar sticky trên đầu): `<JourneyBar/>`
          (progress "x/5" + next task + dots, click → tab Hành trình) + the
          mode badge at its right edge. */}
      <div className="cap0-topbar">
        <JourneyBar />
        <ModeBadge mode={tradingModeFor(progress)} />
      </div>

      {/* Sticky reminder bar for nhiệm vụ ① (spec §6 "sticky dưới journey
          bar") — sits right below `.cap0-topbar`, not inside it (own sticky
          offset), and renders nothing once hidden/not applicable. */}
      <Gbar />

      {/* No custom LeftSidebar — TradingView provides its own drawing toolbar on the left. */}
      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <JourneyIdentityStage level={0} />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      <PlacementModal visible={showPlacement} onChoose={handlePlacement} />

      {/* Màn tốt nghiệp (spec §9) — self-contained: opens itself once
          progress shows 2/2 + both behaviour gates (see `isGraduationReady`),
          closes itself once `graduated_at` comes back from the mutation. */}
      <GraduationModal />

      {/* ★★ AI Insight mở NGAY TRONG shell cấp (xem `AiInsightModal`).
          Trước đây nút này đổi hẳn route sang trang cổ phiếu: user bấm một nút
          của chính terminal, nhập một mã, rồi bị chuyển trang — mất hành trình,
          mất form kế hoạch đang gõ dở, không có đường quay lại. */}
      <AiInsightSymbolModal
        visible={aiInsightOpen}
        onClose={() => setAiInsightOpen(false)}
      />
    </div>
  )
}

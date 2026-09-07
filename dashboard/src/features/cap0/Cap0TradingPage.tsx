import { useEffect, useRef, useState } from "react"
import { Message } from "@arco-design/web-react"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { usePremiumStatus } from "@/features/premium"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { AiInsightSymbolModal } from "@/features/dau-truong"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { Cap0Provider } from "./Cap0Context"
import { ModeBadge } from "./ModeBadge"
import { JourneyBar } from "./JourneyBar"
import { Gbar } from "./Gbar"
import { GraduationModal } from "./GraduationModal"
import { useCap0Progress, useEnterCap0, usePlacement } from "./hooks"
import { PlacementModal, type PlacementAnswer } from "./PlacementModal"
import { tradingModeFor } from "./types"
import "./cap0.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 0 «Nhập môn»"

// No backend GET exists for `user_placement` (BE1 only exposes POST
// /cap0/placement), so "đã trả lời rồi" is not directly readable from the
// server. Since v3.0 all THREE placement answers call `POST /cap0/enter`, the
// server-side guard (`!progress`) is THE guard: a `cap0_progress` row exists
// iff the user has answered. The only window it cannot cover is the few hundred
// ms between `enterCap0` succeeding and `useCap0Progress` refetching — an
// in-memory flag (`placementSeen` state below) closes that.
//
// ★★ KHÔNG BAO GIỜ nhớ cờ này trong localStorage nữa. Bản trước lưu
// `iqx_cap0_placement_seen=1` theo TRÌNH DUYỆT, không theo user: tài khoản A
// trả lời xong → cờ bật; đăng xuất, đăng ký tài khoản B trên cùng máy → cờ
// vẫn bật → modal không hiện → không có `POST /cap0/enter` → không có
// `cap0_progress` → mọi `PATCH /cap0/task` sau đó 404 (FE nuốt lặng) → Hành
// trình đứng 0/4 mãi dù user đã mua/bán đủ. Tái hiện trên prod 2026-09-07
// (`iqx.test1@gmail.com`: 7 lệnh, 0 dòng cap0_progress, 0 dòng placement).
// Khôi phục lại cờ per-browser là dựng lại đúng lỗi này.

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
  // ★★ Ô tìm kiếm mã của Header và cụm giá của MarketBar đổi mã TẠI CHỖ
  // thay vì điều hướng: cả hai nằm TRONG `SymbolProvider` của trang này.
  const { setSymbol } = useSymbol()
  const { data: progress, isFetched } = useCap0Progress()
  const { isPremium } = usePremiumStatus()
  const enterCap0 = useEnterCap0()
  const placement = usePlacement()
  const [placementSeen, setPlacementSeen] = useState(false)
  const { activePanel, setActivePanel } = useSidebar()

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
    return () => setActivePanel(prevPanelRef.current)
  }, [])

  // ★ KHÔNG có tour host ở đây nữa. Cấp 0 từng gánh ba tour sản phẩm (bảng
  // điện / bản tin / "6 người chơi") làm nhiệm vụ ②③④ của "CHẶNG 2 — HIỂU SÂN
  // CHƠI", với `useTour`/`TourOverlay` của cả ba sống ngay trong trang này.
  // Cả chặng đó đã bị bỏ khỏi Cấp 0: ②③ giờ là "Xem tab Nắm giữ"/"Xem tab Theo
  // dõi", nên một `completeTask({taskNo: 2|3|4})` bắn ra từ tour kết thúc sẽ
  // đánh dấu SAI những nhiệm vụ đó là đã xong. Engine tour (`features/tour/`)
  // và các file config vẫn còn nguyên trên đĩa cho những cấp khác dùng — chỉ
  // dây nối vào Cấp 0 là bị cắt.

  // Guard (§3): show only once — needs BOTH the server truth (no progress row
  // yet, i.e. never entered Cấp 0) AND the in-memory "already answered" flag
  // (covers the window before the progress query refetches). Wait for the
  // query to settle first so a loading flicker doesn't briefly show the modal
  // to a returning user.
  const showPlacement = isFetched && !progress && !placementSeen

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
   * ★ **Trần bị kẹp xuống Cấp 1, và cả ba đáp án đều vào Cấp 0.** Spec §3 muốn
   * xếp thẳng người có kinh nghiệm lên Cấp 1/Cấp 2, nhưng backend chưa có
   * đường đó: `POST /cap0/placement` chỉ ghi một dòng `user_placement`
   * (`has_traded_before` boolean → `placed_level` 0/2) mà **không cấp nào đọc
   * để routing**, còn `POST /cap1/enter` thì 409 "Chưa tốt nghiệp Cấp 0". Vì
   * vậy FE làm đúng cái duy nhất có thật: ghi câu trả lời, rồi VÀO CẤP 0 cho
   * cả ba nhánh — và nói thẳng trần hiện tại là Cấp 1 thay vì hứa Cấp 2.
   *
   * Trước đây nhánh "Đã từng" KHÔNG gọi `enterCap0`, nên user rơi vào ngõ cụt:
   * modal đóng, đứng trên màn Cấp 0 mà không có `cap0_progress` row nào → mọi
   * `PATCH /cap0/task` sau đó đều 404. Nay cả ba nhánh đều vào Cấp 0 thật.
   */
  const handlePlacement = (answer: PlacementAnswer) => {
    const hasTradedBefore = answer !== "never"
    placement.mutate(hasTradedBefore)
    // Mark "seen" only once `enterCap0` actually SUCCEEDS. If it fails
    // (network error), `progress` stays falsy AND `placementSeen` stays
    // false, so `showPlacement` is still true and the modal remains
    // available for the user to retry — a fire-and-forget flag here would
    // otherwise hide the modal on a failed attempt.
    enterCap0.mutate(undefined, {
      onSuccess: () => {
        setPlacementSeen(true)
        // Chỉ người đã từng giao dịch mới cần lời giải thích vì sao họ vẫn bắt
        // đầu ở Cấp 0 — người mới hoàn toàn vốn thuộc về đó.
        if (hasTradedBefore) {
          Message.info("Chương trình hiện mở tới Cấp 1 «Học việc» — bạn bắt đầu ở Cấp 0")
        }
      },
    })
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      <TrialBanner />
      <Header onSymbolSelect={setSymbol} />
      <MarketBar onSymbolClick={setSymbol} />

      {/* Top bar (spec §7 journey bar sticky trên đầu): `<JourneyBar/>`
          (progress "x/4" + next task + dots, click → tab Hành trình) + the
          mode badge at its right edge. */}
      <div className="cap0-topbar">
        <JourneyBar />
        <ModeBadge mode={tradingModeFor(progress, isPremium)} />
      </div>

      {/* Sticky reminder bar for nhiệm vụ ① (spec §6 "sticky dưới journey
          bar") — sits right below `.cap0-topbar`, not inside it (own sticky
          offset), and renders nothing once hidden/not applicable. */}
      <Gbar />

      {/* No custom LeftSidebar — TradingView provides its own drawing toolbar on the left. */}
      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel symbolChange="select" />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      <PlacementModal visible={showPlacement} onChoose={handlePlacement} />

      {/* Màn tốt nghiệp (spec §9) — self-contained: opens itself once
          progress shows 4/4 + the debrief gate (see `isGraduationReady`),
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

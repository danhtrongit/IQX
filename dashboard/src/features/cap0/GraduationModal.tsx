import { useNavigate } from "react-router"
import { Modal } from "@arco-design/web-react"
import { usePremiumStatus } from "@/features/premium"
import { Badge, LEVELS } from "./Badge"
import { useCap0Progress, useGraduate } from "./hooks"
import { countTasksDone, type Cap0Progress } from "./types"
// Concrete-file import (NOT the `@/features/cap1` barrel) — that barrel
// re-exports `Cap1TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through the barrel here
// risks a module cycle the same way `RightSidebar.tsx`'s own comment
// describes for its cap0 imports. `@/features/cap1/hooks` has no cap0/
// dashboard dependency, so this is safe.
import { useEnterCap1 } from "@/features/cap1/hooks"
import "./cap0.css"

/**
 * Điều kiện mở màn tốt nghiệp (spec §9): 6/6 nhiệm vụ + 2 cổng hành vi (⑤
 * keydown ô cắt lỗ, ⑥ đóng màn kết sổ). Once `graduated_at` is set
 * server-side (the mutation below succeeded), the modal never re-opens even
 * though the 6/6+2-gate condition still technically holds — graduating is a
 * one-way trip.
 */
export function isGraduationReady(progress: Cap0Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countTasksDone(progress) >= 6 && progress.task5_sl_typed && progress.task6_debrief_done
}

// Verbatim spec §9 copy, `**bold**` markers kept for the inline-bold renderer
// below (same convention as `coachTemplate.ts` — the outer *"…"* italic-quote
// wrapper is markdown emphasis, not literal quote characters to render).
const BLOCK_1 =
  "Bạn đã đi trọn Cấp 0 «Nhập môn»: hiểu bảng điện, đọc được bản tin, biết 6 người chơi trên thị trường — và quan trọng nhất: đi trọn 2 vòng lệnh có kế hoạch, tự tay đặt ngưỡng cắt lỗ của mình. **Phần lớn người mua cổ phiếu ngoài kia chưa từng làm điều cuối cùng.**"

const BLOCK_2 =
  "Nói thẳng: bạn đã biết **CÁCH CHƠI**, chưa biết **CHƠI GIỎI** — và đó là chủ đích. Cấp 1 «Học việc» dạy bạn lập kế hoạch thật sự cho từng lệnh. Câu hỏi 'chọn mã nào' sẽ được trả lời dần từ chính dữ liệu 6 lớp bạn vừa làm quen."

const BLOCK_3_PREMIUM =
  "**Từ giờ: chế độ THỰC CHIẾN.** Luật thật 100% — mua xong chờ T+2,5 ngày cổ phiếu mới về, biên độ, phí, thuế đầy đủ. Vì hồ sơ nhà đầu tư của bạn bắt đầu được tính từ đây."

// Final-review fix (premium-honest mode): the backend only ever routes
// orders through the real T+2,5 `thuc_chien` engine for PREMIUM accounts —
// a free graduate's orders stay `san_tap`/T+0 no matter what this screen
// says. So a free graduate must NOT hear "chế độ THỰC CHIẾN" here; instead
// this khối is an honest upsell: Cấp 0 is genuinely done, but Thực chiến
// (and Cấp 1) is gated behind Premium.
const BLOCK_3_FREE =
  "**Cấp 0 hoàn tất.** Thực chiến — luật thật T+2,5, biên độ, phí thuế đầy đủ — là tính năng dành cho tài khoản Premium. Nâng cấp để mở khoá Thực chiến và bước vào Cấp 1 «Học việc»."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 0 (spec §9) — self-contained (calls `useCap0Progress` +
 * `useGraduate` itself, same pattern as `DebriefModal` owning
 * `useCompleteTask`): the consumer (`Cap0TradingPage`) just mounts
 * `<GraduationModal />` unconditionally, this component decides its own
 * visibility via `isGraduationReady`. 3 khối (Ghi nhận / Định vị trung thực /
 * Khối 3, viền xanh) + huy hiệu "vừa đúc xong" (n=0, fill=1, size=120, glow —
 * spec §12) + CTA button.
 *
 * Khối 3 + the CTA are premium-gated (final-review fix): the backend only
 * ever runs a PREMIUM user's orders through the real T+2,5 `thuc_chien`
 * engine — a free user's orders stay `san_tap`/T+0 forever, graduated or not.
 * So this screen must not promise "chế độ THỰC CHIẾN" to a free graduate.
 * `usePremiumStatus` (the SAME source `tradingModeFor` uses in
 * `Cap0TradingPage`/`JourneyPanel`) picks the honest copy: premium graduates
 * keep the verbatim spec §9 "Từ giờ: chế độ THỰC CHIẾN" + `Vào Cấp 1 «Học
 * việc» →`; free graduates instead get an upsell inviting them to Premium,
 * and the button routes to `/nang-cap` on success instead of teasing Cấp 1.
 *
 * `useGraduate()` still fires for BOTH tiers — graduating (recording
 * `graduated_at`) happens regardless of premium status; only what the screen
 * PROMISES as a consequence differs. On success, `useGraduate`'s `onSuccess`
 * already invalidates every Cấp 0 query (see `hooks.ts`), so `ModeBadge`
 * (`Cap0TradingPage`/`JourneyPanel`, both driven by
 * `tradingModeFor(progress, isPremium)`) updates the instant `graduated_at`
 * comes back — no extra prop wiring needed here.
 */
export function GraduationModal() {
  const { data: progress } = useCap0Progress()
  const { isPremium } = usePremiumStatus()
  const graduate = useGraduate()
  const enterCap1 = useEnterCap1()
  const navigate = useNavigate()
  const level = LEVELS[0]
  const visible = isGraduationReady(progress)

  const handleGraduate = () => {
    if (isPremium) {
      // Cấp 1 is live (Task FE3) — record the graduation, then fire the
      // idempotent `POST /cap1/enter` right here too (not just relying on
      // `DauTruongPage`'s own effect) so Cấp 1 progress is ready the instant
      // `DauTruongPage` swaps this Cấp 0 shell out for `Cap1TradingPage` —
      // driven by the SAME `useCap0Progress` query this mutation's
      // `graduated_at` just invalidated. No navigation call needed: this
      // modal only ever renders while already on `/dau-truong`.
      graduate.mutate(undefined, {
        onSuccess: () => {
          enterCap1.mutate()
        },
      })
      return
    }
    // Free graduate: still record the graduation server-side, but send them
    // to the real, already-existing Premium upgrade page instead of a Cấp 1
    // placeholder toast — that's the actual next step available to them.
    graduate.mutate(undefined, {
      onSuccess: () => {
        navigate("/nang-cap")
      },
    })
  }

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 0 · NHẬP MÔN</h2>
        <div className="cap0-grad-sub">6/6 nhiệm vụ · 2/2 cổng hành vi</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={1} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block">{renderInlineBold(BLOCK_1)}</div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap0-grad-block--mode">
        {renderInlineBold(isPremium ? BLOCK_3_PREMIUM : BLOCK_3_FREE)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        {isPremium ? "Vào Cấp 1 «Học việc» →" : "Nâng cấp Premium →"}
      </button>
    </Modal>
  )
}

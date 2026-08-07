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
 * Điều kiện mở màn tốt nghiệp (spec v3.0 §9): **5/5 nhiệm vụ + 1 cổng hành vi**
 * (⑤ đóng màn kết sổ). Once `graduated_at` is set server-side (the mutation
 * below succeeded), the modal never re-opens even though the condition still
 * technically holds — graduating is a one-way trip.
 *
 * v2.2 demanded 6/6 + a second gate (`task5_sl_typed`, a keydown into the ô
 * cắt lỗ). v3.0 removes cắt lỗ/chốt lời from Cấp 0, and with it that gate:
 * "Chỉ MỘT cổng hành vi ở Cấp 0" — closing the Kết sổ. `task1_star_clicked`
 * stays a recorded fact and is deliberately NOT read here.
 *
 * This must stay in lockstep with `Cap0Service.graduate`'s own check: if this
 * opens the modal while the backend still refuses, the CTA 409s forever with
 * no way out (the modal is `closable={false}`).
 */
export function isGraduationReady(progress: Cap0Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countTasksDone(progress) >= 5 && progress.task5_debrief_done
}

// Verbatim spec §9 copy, `**bold**` markers kept for the inline-bold renderer
// below (same convention as `coachTemplate.ts` — the outer *"…"* italic-quote
// wrapper is markdown emphasis, not literal quote characters to render).
// ★ Khối 1 v2.2 congratulated the user for "đi trọn 2 vòng lệnh có kế hoạch,
// tự tay đặt ngưỡng cắt lỗ của mình". Under v3.0 BOTH halves are false — Cấp 0
// asks for exactly ONE round trip (nhiệm vụ ⑤) and has no ô cắt lỗ at all
// (preamble, §0, §8, §13) — which made it the last surviving cắt-lỗ claim in
// the level, and the worst possible place to be wrong: a graduation screen
// crediting the user with work the product never let them do.
const BLOCK_1 =
  "Bạn đã đi trọn Cấp 0 «Nhập môn»: hiểu bảng điện, đọc được bản tin, biết 6 người chơi trên thị trường — và quan trọng nhất: **đi trọn một vòng đời lệnh hoàn chỉnh** (mua → nắm giữ → theo dõi → bán → kết sổ). Phần lớn người mua cổ phiếu ngoài kia còn không biết mình đang nắm gì."

const BLOCK_2 =
  "Nói thẳng: bạn đã biết **CÁCH CHƠI**, chưa biết **CHƠI GIỎI** — và đó là chủ đích. Cấp 1 «Học việc» dạy bạn chọn lý do mua có cơ sở cho từng lệnh, từ chính dữ liệu 6 lớp phân tích. Cấp 2 dạy đặt cắt lỗ/chốt lời và kỷ luật thực hiện."

const BLOCK_3_PREMIUM =
  "**Từ giờ: chế độ THỰC CHIẾN.** Luật thật 100% — mua xong chờ T+2,5 ngày cổ phiếu mới về, biên độ, phí, thuế đầy đủ. Vì hồ sơ nhà đầu tư của bạn bắt đầu được tính từ đây."

// Premium-honest MODE copy — but Cấp 1 the LEVEL is free.
//
// Two independent facts this khối must keep straight (an earlier version
// conflated them and paywalled a free level):
//  • The MODE is premium-gated: `VirtualTradingService.place_order` sets
//    `mode = "thuc_chien" if is_premium else "san_tap"`, so a free graduate's
//    orders stay `san_tap`/T+0 no matter what this screen says. They must NOT
//    hear "Từ giờ: chế độ THỰC CHIẾN" (see `types.ts#tradingModeFor`).
//  • Cấp 1 the LEVEL is FREE: `backend/app/api/v1/endpoints/cap1.py` says so
//    verbatim ("Cap 1 is FREE: all endpoints use `CurrentUser`... NOT
//    `PremiumUser`"), and `DauTruongPage`'s Cấp 1 entry effect is not premium-
//    gated either. Claiming Cấp 1 "requires Premium" was simply false, and
//    routing free graduates to `/nang-cap` left them unable to proceed at all.
const BLOCK_3_FREE =
  "**Cấp 0 hoàn tất — Cấp 1 «Học việc» mở ngay.** Bạn vẫn giao dịch ở chế độ SÂN TẬP (T+0, tiền ảo). Thực chiến — luật thật T+2,5, biên độ, phí thuế đầy đủ — là tính năng dành cho tài khoản Premium, nâng cấp bất cứ lúc nào bạn muốn."

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
 * Khối 3's COPY is premium-aware, but the CTA is not: the backend only ever
 * runs a PREMIUM user's orders through the real T+2,5 `thuc_chien` engine — a
 * free user's orders stay `san_tap`/T+0 forever, graduated or not — so this
 * screen must not promise "chế độ THỰC CHIẾN" to a free graduate.
 * `usePremiumStatus` (the SAME source `tradingModeFor` uses in
 * `Cap0TradingPage`/`JourneyPanel`) picks the honest copy: premium graduates
 * keep the verbatim spec §9 "Từ giờ: chế độ THỰC CHIẾN"; free graduates are
 * told they stay on sân tập and that Thực chiến is the Premium feature.
 *
 * The CTA, however, is the SAME for both tiers — `Vào Cấp 1 «Học việc» →`,
 * entering Cấp 1. Cấp 1 is FREE (`backend/app/api/v1/endpoints/cap1.py`: "Cap 1
 * is FREE: all endpoints use `CurrentUser`... NOT `PremiumUser`"), and
 * `DauTruongPage` routes a Cấp-0-graduated user into `Cap1TradingPage` with no
 * premium check. An earlier version sent free graduates to `/nang-cap`
 * instead, paywalling a level they already had access to and leaving them with
 * no way forward at all.
 *
 * `useGraduate()` fires for BOTH tiers — graduating (recording `graduated_at`)
 * happens regardless of premium status. On success, `useGraduate`'s `onSuccess`
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
  const level = LEVELS[0]
  const visible = isGraduationReady(progress)

  // Cấp 1 is live AND free — so this is the path for EVERY authenticated
  // graduate, premium or not (see the component docstring). Record the
  // graduation, then fire the idempotent `POST /cap1/enter` right here too
  // (not just relying on `DauTruongPage`'s own effect) so Cấp 1 progress is
  // ready the instant `DauTruongPage` swaps this Cấp 0 shell out for
  // `Cap1TradingPage` — driven by the SAME `useCap0Progress` query this
  // mutation's `graduated_at` just invalidated. No navigation call needed:
  // this modal only ever renders while already on `/dau-truong`.
  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        enterCap1.mutate()
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
        {/* Spec v3.0 §9 "Dòng phụ nhỏ: `5/5 nhiệm vụ`" — the "· 2/2 cổng hành
            vi" half counted a second gate that no longer exists. */}
        <div className="cap0-grad-sub">5/5 nhiệm vụ</div>
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
        Vào Cấp 1 «Học việc» →
      </button>
    </Modal>
  )
}

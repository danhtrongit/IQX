import { Modal } from "@arco-design/web-react"
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
 * Điều kiện mở màn tốt nghiệp: **4/4 nhiệm vụ + 1 cổng hành vi** (④ đóng màn
 * kết sổ). Once `graduated_at` is set server-side (the mutation below
 * succeeded), the modal never re-opens even though the condition still
 * technically holds — graduating is a one-way trip.
 *
 * ★ Ba tour sản phẩm của Chặng 2 đã bị bỏ khỏi Cấp 0, nên mẫu số là 4 chứ không
 * còn 5, và cổng hành vi duy nhất đổi tên theo nhiệm vụ nó thuộc về:
 * `task5_debrief_done` → `task4_debrief_done`.
 *
 * This must stay in lockstep with `Cap0Service.graduate`'s own check: if this
 * opens the modal while the backend still refuses, the CTA 409s forever with
 * no way out (the modal is `closable={false}`).
 */
export function isGraduationReady(progress: Cap0Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countTasksDone(progress) >= 4 && progress.task4_debrief_done
}

// ★ Ba khối copy spec §9 (Ghi nhận / Định vị trung thực / Khối 3 premium-aware)
// đã bỏ theo yêu cầu điều chỉnh: màn chỉ còn header + huy hiệu + CTA. Đừng dựng
// lại `renderInlineBold`/`usePremiumStatus` ở đây nếu không có yêu cầu mới.

/**
 * Màn tốt nghiệp Cấp 0 (spec §9) — self-contained (calls `useCap0Progress` +
 * `useGraduate` itself, same pattern as `DebriefModal` owning
 * `useCompleteTask`): the consumer (`Cap0TradingPage`) just mounts
 * `<GraduationModal />` unconditionally, this component decides its own
 * visibility via `isGraduationReady`. Header (tag + tiêu đề + "4/4 nhiệm vụ")
 * + huy hiệu "vừa đúc xong" (n=0, fill=1, size=120, glow — spec §12) + CTA.
 *
 * The CTA is the SAME for every tier — `Vào cấp 1: Học việc`, entering Cấp 1.
 * Cấp 1 is FREE (`backend/app/api/v1/endpoints/cap1.py`: "Cap 1 is FREE: all
 * endpoints use `CurrentUser`... NOT `PremiumUser`"), and `DauTruongPage`
 * routes a Cấp-0-graduated user into `Cap1TradingPage` with no premium check.
 * An earlier version sent free graduates to `/nang-cap` instead, paywalling a
 * level they already had access to and leaving them with no way forward at all.
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
        {/* Dòng phụ nhỏ — mẫu số phải khớp `TOTAL_TASKS`: 4 kể từ khi Chặng 2
            (ba tour sản phẩm) bị bỏ khỏi Cấp 0. */}
        <div className="cap0-grad-sub">4/4 nhiệm vụ</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={1} size={120} glow />
        </div>
      </div>

      <button
        type="button"
        className="cap0-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào cấp 1: Học việc
      </button>
    </Modal>
  )
}

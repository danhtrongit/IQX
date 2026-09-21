import { Modal } from "@arco-design/web-react"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { Badge, LEVELS } from "./Badge"
import { useCap0Progress, useGraduate } from "./hooks"
import { countTasksDone, type Cap0Progress } from "./types"
import { TOTAL_TASKS } from "./journeyTasks"
// Concrete-file import (NOT the `@/features/cap1` barrel) — that barrel
// re-exports `Cap1TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through the barrel here
// risks a module cycle the same way `RightSidebar.tsx`'s own comment
// describes for its cap0 imports. `@/features/cap1/hooks` has no cap0/
// dashboard dependency, so this is safe.
import { useEnterCap1 } from "@/features/cap1/hooks"
import "./cap0.css"

/**
 * Điều kiện mở màn tốt nghiệp: **2/2 nhiệm vụ + 1 cổng hành vi** (⑤ đóng màn
 * kết sổ). Once `graduated_at` is set server-side (the mutation below
 * succeeded), the modal never re-opens even though the condition still
 * technically holds — graduating is a one-way trip.
 *
 * This must stay in lockstep with `Cap0Service.graduate`'s own check: if this
 * opens the modal while the backend still refuses, the CTA 409s forever with
 * no way out (the modal is `closable={false}`).
 */
export function isGraduationReady(progress: Cap0Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return (
    countTasksDone(progress) >= TOTAL_TASKS &&
    progress.task1_star_clicked &&
    progress.task5_debrief_done
  )
}

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
    trackJourneyEvent("cap0_graduate")
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
        <div className="cap0-grad-sub">{TOTAL_TASKS}/{TOTAL_TASKS} nhiệm vụ</div>
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

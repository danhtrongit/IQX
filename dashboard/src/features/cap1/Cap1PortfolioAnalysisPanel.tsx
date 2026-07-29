import { useEffect } from "react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { useCap1Events } from "./Cap1Context"
import { useCap1Progress, useCompleteCap1Task } from "./hooks"
import { useCap1TradeLog } from "./tradeLog"
import { Cap1PortfolioAnalysis } from "./Cap1PortfolioAnalysis"

const NHIEM_VU_5 = 5

/**
 * "Phân tích danh mục" right-sidebar panel (spec §7) — the `RightSidebar`
 * "cap1-analysis" panel case. Self-contained (mirrors `JourneyPanelCap1`):
 * feeds `Cap1PortfolioAnalysis` from `useCap1Progress` + `useCap1TradeLog`,
 * and drives nhiệm vụ ⑤ ("mở trang Phân tích danh mục 3 lần khác ngày") by
 * firing `PATCH /cap1/task {task_no: 5}` on EVERY mount — the backend itself
 * dedupes by distinct calendar day (`Cap1Service.record_portfolio_view`), so
 * the FE needs no local "already counted today" tracking; simply notifying
 * every time this panel opens is correct and idempotent.
 */
export function Cap1PortfolioAnalysisPanel() {
  const { isCap1Active } = useCap1Events()
  const { data: progress } = useCap1Progress(isCap1Active)
  const { trades } = useCap1TradeLog()
  const markTask = useCompleteCap1Task()
  const { setActivePanel } = useSidebar()

  useEffect(() => {
    if (!isCap1Active) return
    markTask.mutate(NHIEM_VU_5)
    // Only re-fire if the panel is re-mounted (isCap1Active flips) — NOT on
    // every `markTask` identity change (a fresh mutation object each render
    // would otherwise refire this on every re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCap1Active])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-2)] p-3">
        <button
          type="button"
          onClick={() => setActivePanel("journey")}
          className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
        >
          ← Hành trình
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Cap1PortfolioAnalysis progress={progress ?? null} trades={trades} />
      </div>
    </div>
  )
}

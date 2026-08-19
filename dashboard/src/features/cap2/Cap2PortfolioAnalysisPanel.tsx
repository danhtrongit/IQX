import { useSidebar } from "@/shared/contexts/sidebar-context"
import { useCap2Events } from "./Cap2Context"
import { useCap2Progress } from "./hooks"
import { useCap2TradeLog } from "./tradeLogCap2"
import { Cap2PortfolioAnalysis } from "./Cap2PortfolioAnalysis"

/**
 * "Phân tích danh mục" right-sidebar panel (spec §12) — the `RightSidebar`
 * "cap2-analysis" panel case. Self-contained (mirrors
 * `cap1/Cap1PortfolioAnalysisPanel.tsx`): feeds `Cap2PortfolioAnalysis` from
 * `useCap2Progress` + `useCap2TradeLog` (the client-side trade/score
 * accumulator — see that module's docstring on why).
 *
 * Unlike Cấp 1's equivalent panel, Cấp 2 has no nhiệm vụ tied to "mở trang
 * Phân tích danh mục N lần" (its 5 nhiệm vụ are all lệnh-behaviour based —
 * spec §2), so this panel has no `markTask`-on-mount side effect.
 */
export function Cap2PortfolioAnalysisPanel() {
  const { isCap2Active } = useCap2Events()
  const { data: progress } = useCap2Progress(isCap2Active)
  const { trades, scores } = useCap2TradeLog()
  const { setActivePanel } = useSidebar()

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      {/* Mockup `.hdr`: nút quay lại bên trái + tiêu đề màn bên phải. Nhãn nút
          giữ "← Hành trình" (không phải "← Quay lại Nắm giữ" như mockup viết)
          vì đó là nơi nút NÀY thật sự quay về — `RightSidebar` chỉ vẽ tên panel
          ở nhánh `md:hidden`, nên trên desktop tiêu đề phải nằm ở đây. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border-2)] p-3">
        <button
          type="button"
          onClick={() => setActivePanel("journey")}
          className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
        >
          ← Hành trình
        </button>
        <span className="text-sm font-semibold text-[var(--color-text-1)]">Phân tích danh mục</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Cap2PortfolioAnalysis progress={progress ?? null} trades={trades} dailyScores={scores} />
      </div>
    </div>
  )
}

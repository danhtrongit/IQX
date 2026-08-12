import { useSidebar } from "@/shared/contexts/sidebar-context"
import { useCap1Events } from "./Cap1Context"
import { useCap1Progress } from "./hooks"
import { useCap1TradeLog } from "./tradeLog"
import { Cap1PortfolioAnalysis } from "./Cap1PortfolioAnalysis"

/**
 * "Phân tích danh mục" right-sidebar panel (spec §7) — the `RightSidebar`
 * "cap1-analysis" panel case. Self-contained (mirrors `JourneyPanelCap1`):
 * feeds `Cap1PortfolioAnalysis` from `useCap1Progress` + `useCap1TradeLog`.
 *
 * ★ KHÔNG có side effect nào lúc mount (giống Cấp 2/3/4/5). Bản trước bắn
 * `PATCH /cap1/task {task_no: 5}` mỗi lần mở để đếm "xem lại danh mục 3 lần
 * khác ngày" — nhiệm vụ đó đã bị bỏ khỏi hành trình, và ⑤ bây giờ là «10 lệnh
 * Thực chiến» (server tự suy ra từ `so_lenh_thuc_chien`). Gọi lại chỉ là một
 * lần tính lại vô nghĩa, nên đừng dựng lại.
 */
export function Cap1PortfolioAnalysisPanel() {
  const { isCap1Active } = useCap1Events()
  const { data: progress } = useCap1Progress(isCap1Active)
  const { trades } = useCap1TradeLog()
  const { setActivePanel } = useSidebar()

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

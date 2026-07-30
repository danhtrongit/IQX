import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2`) — cùng lý do chống
// vòng module đã ghi ở `Cap3PortfolioAnalysis.tsx`/`KetsoModalCap3.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Events } from "./Cap3Context"
import { useCap3Progress } from "./hooks"
import { useCap3TradeLog } from "./tradeLogCap3"
import { Cap3PortfolioAnalysis } from "./Cap3PortfolioAnalysis"

/**
 * Panel "Phân tích danh mục" của sidebar-phải trong Cấp 3 (spec §8) — case
 * `"cap3-analysis"` của `RightSidebar`. Self-contained, mirror
 * `cap2/Cap2PortfolioAnalysisPanel.tsx`: nạp `Cap3PortfolioAnalysis` từ
 * `useCap3Progress` + `useCap3TradeLog` (nhật ký lệnh đã đóng, xem docstring
 * module đó), CỘNG hồ sơ Cấp 2 + nhật ký điểm kỷ luật dùng chung
 * (`useCap2TradeLog().scores`) mà các khối kế thừa Cấp 1-2 cần.
 *
 * Mọi query đều gate bằng `isCap3Active` nên panel này vô hại nếu
 * `activePanel` tình cờ là "cap3-analysis" ở ngoài Cấp 3 (`SidebarProvider` là
 * singleton app-root). Cấp 3 không có nhiệm vụ nào gắn với "mở trang Phân tích
 * danh mục N lần" (3 nhiệm vụ đều dựa trên hành vi lệnh — spec §2), nên panel
 * không có side effect `markTask` lúc mount (giống Cấp 2).
 */
export function Cap3PortfolioAnalysisPanel() {
  const { isCap3Active } = useCap3Events()
  const { data: cap3Progress } = useCap3Progress(isCap3Active)
  const { data: cap2Progress } = useCap2Progress(isCap3Active)
  const { trades } = useCap3TradeLog()
  const { scores } = useCap2TradeLog()
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
        <Cap3PortfolioAnalysis
          cap2Progress={cap2Progress ?? null}
          cap3Progress={cap3Progress ?? null}
          trades={trades}
          dailyScores={scores}
        />
      </div>
    </div>
  )
}

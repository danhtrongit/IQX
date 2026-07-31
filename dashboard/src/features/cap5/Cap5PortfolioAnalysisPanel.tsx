import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2` / `@/features/cap3` /
// `@/features/cap4`) — cùng lý do chống vòng module đã ghi ở
// `Cap5PortfolioAnalysis.tsx` / `cap4/Cap4PortfolioAnalysisPanel.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Progress } from "@/features/cap3/hooks"
import { useCap4Progress } from "@/features/cap4/hooks"
import { useCap5Events } from "./Cap5Context"
import { useCap5Progress } from "./hooks"
import { useCap5TradeLog } from "./tradeLogCap5"
import { Cap5PortfolioAnalysis } from "./Cap5PortfolioAnalysis"

/**
 * Panel "Phân tích danh mục" của sidebar-phải trong Cấp 5 (spec §6) — case
 * `"cap5-analysis"` của `RightSidebar`. Self-contained, mirror
 * `cap4/Cap4PortfolioAnalysisPanel.tsx`: nạp `Cap5PortfolioAnalysis` từ
 * `useCap5Progress` + `useCap5TradeLog` (nhật ký lệnh đã đóng KÈM ô 4 — xem
 * docstring module đó), CỘNG hồ sơ Cấp 4 + Cấp 3 + Cấp 2 và nhật ký điểm kỷ luật
 * dùng chung (`useCap2TradeLog().scores`) mà các khối kế thừa Cấp 1-4 cần.
 *
 * Mọi query đều gate bằng `isCap5Active` nên panel này vô hại nếu `activePanel`
 * tình cờ là "cap5-analysis" ở ngoài Cấp 5 (`SidebarProvider` là singleton
 * app-root). LƯU Ý: `Cap5PortfolioAnalysis` tự gọi `useDanhSachDungNgoai()` (khối
 * ⑬ đọc thẳng từ server) và `Cap4PortfolioAnalysis` bên trong nó tự gọi
 * `useVuKhiDiemMu()` (khối ⑨) — cả hai auth-gated bên trong hook, nên mọi
 * test/mount của panel này cần provider auth + QueryClient (hoặc mock hook).
 *
 * Cấp 5 không có nhiệm vụ nào gắn với "mở trang Phân tích danh mục N lần" (3
 * nhiệm vụ đều dựa trên hành vi lệnh/đứng ngoài — spec §2), nên panel không có
 * side effect `markTask` lúc mount (giống Cấp 2/3/4).
 */
export function Cap5PortfolioAnalysisPanel() {
  const { isCap5Active } = useCap5Events()
  const { data: cap5Progress } = useCap5Progress(isCap5Active)
  const { data: cap4Progress } = useCap4Progress(isCap5Active)
  const { data: cap3Progress } = useCap3Progress(isCap5Active)
  const { data: cap2Progress } = useCap2Progress(isCap5Active)
  const { trades } = useCap5TradeLog()
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
        <Cap5PortfolioAnalysis
          cap2Progress={cap2Progress ?? null}
          cap3Progress={cap3Progress ?? null}
          cap4Progress={cap4Progress ?? null}
          cap5Progress={cap5Progress ?? null}
          trades={trades}
          dailyScores={scores}
        />
      </div>
    </div>
  )
}

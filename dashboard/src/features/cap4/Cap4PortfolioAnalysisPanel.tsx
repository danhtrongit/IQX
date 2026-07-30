import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2` / `@/features/cap3`) —
// cùng lý do chống vòng module đã ghi ở `Cap4PortfolioAnalysis.tsx` /
// `cap3/Cap3PortfolioAnalysisPanel.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Progress } from "@/features/cap3/hooks"
import { useCap4Events } from "./Cap4Context"
import { useCap4Progress } from "./hooks"
import { useCap4TradeLog } from "./tradeLogCap4"
import { Cap4PortfolioAnalysis } from "./Cap4PortfolioAnalysis"

/**
 * Panel "Phân tích danh mục" của sidebar-phải trong Cấp 4 (spec §7) — case
 * `"cap4-analysis"` của `RightSidebar`. Self-contained, mirror
 * `cap3/Cap3PortfolioAnalysisPanel.tsx`: nạp `Cap4PortfolioAnalysis` từ
 * `useCap4Progress` + `useCap4TradeLog` (nhật ký lệnh đã đóng, xem docstring
 * module đó), CỘNG hồ sơ Cấp 3 + hồ sơ Cấp 2 + nhật ký điểm kỷ luật dùng chung
 * (`useCap2TradeLog().scores`) mà các khối kế thừa Cấp 1-3 cần.
 *
 * Mọi query đều gate bằng `isCap4Active` nên panel này vô hại nếu `activePanel`
 * tình cờ là "cap4-analysis" ở ngoài Cấp 4 (`SidebarProvider` là singleton
 * app-root). LƯU Ý: `Cap4PortfolioAnalysis` tự gọi `useVuKhiDiemMu()` (khối ⑨
 * đọc thẳng từ server) — query đó auth-gated bên trong hook, nên mọi test/mount
 * của panel này cần provider auth + QueryClient (hoặc mock hook).
 *
 * Cấp 4 không có nhiệm vụ nào gắn với "mở trang Phân tích danh mục N lần" (3
 * nhiệm vụ đều dựa trên hành vi lệnh — spec §2), nên panel không có side effect
 * `markTask` lúc mount (giống Cấp 2/3).
 */
export function Cap4PortfolioAnalysisPanel() {
  const { isCap4Active } = useCap4Events()
  const { data: cap4Progress } = useCap4Progress(isCap4Active)
  const { data: cap3Progress } = useCap3Progress(isCap4Active)
  const { data: cap2Progress } = useCap2Progress(isCap4Active)
  const { trades } = useCap4TradeLog()
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
        <Cap4PortfolioAnalysis
          cap2Progress={cap2Progress ?? null}
          cap3Progress={cap3Progress ?? null}
          cap4Progress={cap4Progress ?? null}
          trades={trades}
          dailyScores={scores}
        />
      </div>
    </div>
  )
}

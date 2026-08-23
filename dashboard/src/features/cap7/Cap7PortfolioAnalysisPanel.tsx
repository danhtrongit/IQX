import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2` … `@/features/cap6`) —
// cùng lý do chống vòng module đã ghi ở `Cap7PortfolioAnalysis.tsx` /
// `cap6/Cap6PortfolioAnalysisPanel.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Progress } from "@/features/cap3/hooks"
import { useCap4Progress } from "@/features/cap4/hooks"
import { useCap5Progress } from "@/features/cap5/hooks"
import { useCap6Progress } from "@/features/cap6/hooks"
import { useCap7Events } from "./Cap7Context"
import { useCap7Progress } from "./hooks"
import { useCap7TradeLog } from "./tradeLogCap7"
import { Cap7PortfolioAnalysis } from "./Cap7PortfolioAnalysis"

/**
 * Panel "Phân tích danh mục" của sidebar-phải trong Cấp 7 (spec §7) — case
 * `"cap7-analysis"` của `RightSidebar`. Self-contained, mirror
 * `cap6/Cap6PortfolioAnalysisPanel.tsx`: nạp `Cap7PortfolioAnalysis` từ
 * `useCap7Progress` + `useCap7TradeLog` (nhật ký lệnh đã đóng KÈM khối đọc lực —
 * xem docstring module đó), CỘNG hồ sơ Cấp 6 + Cấp 5 + Cấp 4 + Cấp 3 + Cấp 2 và
 * nhật ký điểm kỷ luật dùng chung (`useCap2TradeLog().scores`) mà các khối kế
 * thừa Cấp 1-6 cần.
 *
 * Mọi query đều gate bằng `isCap7Active` nên panel này vô hại nếu `activePanel`
 * tình cờ là "cap7-analysis" ở ngoài Cấp 7 (`SidebarProvider` là singleton
 * app-root). LƯU Ý: `Cap7PortfolioAnalysis` tự gọi `useThachThucCap7()` (khối ⑯
 * đọc thẳng từ server) và các component Cấp 4/5/6 bên trong nó tự gọi
 * `useVuKhiDiemMu()` / `useThachThucCap6()` — tất cả
 * auth-gated bên trong hook, nên mọi test/mount của panel này cần provider auth +
 * QueryClient (hoặc mock hook).
 *
 * Cấp 7 không có nhiệm vụ nào gắn với "mở trang Phân tích danh mục N lần" (3
 * nhiệm vụ đều dựa trên hành vi đọc sổ lệnh — spec §2), nên panel không có side
 * effect `markTask` lúc mount (giống Cấp 2/3/4/5/6).
 */
export function Cap7PortfolioAnalysisPanel() {
  const { isCap7Active } = useCap7Events()
  const { data: cap7Progress } = useCap7Progress(isCap7Active)
  const { data: cap6Progress } = useCap6Progress(isCap7Active)
  const { data: cap5Progress } = useCap5Progress(isCap7Active)
  const { data: cap4Progress } = useCap4Progress(isCap7Active)
  const { data: cap3Progress } = useCap3Progress(isCap7Active)
  const { data: cap2Progress } = useCap2Progress(isCap7Active)
  const { trades } = useCap7TradeLog()
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
        <Cap7PortfolioAnalysis
          cap2Progress={cap2Progress ?? null}
          cap3Progress={cap3Progress ?? null}
          cap4Progress={cap4Progress ?? null}
          cap5Progress={cap5Progress ?? null}
          cap6Progress={cap6Progress ?? null}
          cap7Progress={cap7Progress ?? null}
          trades={trades}
          dailyScores={scores}
        />
      </div>
    </div>
  )
}

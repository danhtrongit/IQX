import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2` … `@/features/cap5`) —
// cùng lý do chống vòng module đã ghi ở `Cap6PortfolioAnalysis.tsx` /
// `cap5/Cap5PortfolioAnalysisPanel.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Progress } from "@/features/cap3/hooks"
import { useCap4Progress } from "@/features/cap4/hooks"
import { useCap5Progress } from "@/features/cap5/hooks"
import { useCap6Events } from "./Cap6Context"
import { useCap6Progress } from "./hooks"
import { useCap6TradeLog } from "./tradeLogCap6"
import { Cap6PortfolioAnalysis } from "./Cap6PortfolioAnalysis"

/**
 * Panel "Phân tích danh mục" của sidebar-phải trong Cấp 6 (spec §7) — case
 * `"cap6-analysis"` của `RightSidebar`. Self-contained, mirror
 * `cap5/Cap5PortfolioAnalysisPanel.tsx`: nạp `Cap6PortfolioAnalysis` từ
 * `useCap6Progress` + `useCap6TradeLog` (nhật ký lệnh đã đóng KÈM kiểu cổ phiếu
 * + lớp quyết định — xem docstring module đó), CỘNG hồ sơ Cấp 5 + Cấp 4 + Cấp 3
 * + Cấp 2 và nhật ký điểm kỷ luật dùng chung (`useCap2TradeLog().scores`) mà các
 * khối kế thừa Cấp 1-5 cần.
 *
 * Mọi query đều gate bằng `isCap6Active` nên panel này vô hại nếu `activePanel`
 * tình cờ là "cap6-analysis" ở ngoài Cấp 6 (`SidebarProvider` là singleton
 * app-root). LƯU Ý: `Cap6PortfolioAnalysis` tự gọi `useThachThucCap6()` (khối ⑮
 * đọc thẳng từ server) và các component Cấp 4/5 bên trong nó tự gọi
 * `useVuKhiDiemMu()` — tất cả auth-gated bên trong
 * hook, nên mọi test/mount của panel này cần provider auth + QueryClient (hoặc
 * mock hook).
 *
 * Cấp 6 không có nhiệm vụ nào gắn với "mở trang Phân tích danh mục N lần" (3
 * nhiệm vụ đều dựa trên hành vi đối chiếu — spec §2), nên panel không có side
 * effect `markTask` lúc mount (giống Cấp 2/3/4/5).
 */
export function Cap6PortfolioAnalysisPanel() {
  const { isCap6Active } = useCap6Events()
  const { data: cap6Progress } = useCap6Progress(isCap6Active)
  const { data: cap5Progress } = useCap5Progress(isCap6Active)
  const { data: cap4Progress } = useCap4Progress(isCap6Active)
  const { data: cap3Progress } = useCap3Progress(isCap6Active)
  const { data: cap2Progress } = useCap2Progress(isCap6Active)
  const { trades } = useCap6TradeLog()
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
        <Cap6PortfolioAnalysis
          cap2Progress={cap2Progress ?? null}
          cap3Progress={cap3Progress ?? null}
          cap4Progress={cap4Progress ?? null}
          cap5Progress={cap5Progress ?? null}
          cap6Progress={cap6Progress ?? null}
          trades={trades}
          dailyScores={scores}
        />
      </div>
    </div>
  )
}

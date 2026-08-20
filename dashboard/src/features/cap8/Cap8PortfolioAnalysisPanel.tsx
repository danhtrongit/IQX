import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2` … `@/features/cap7`) —
// cùng lý do chống vòng module đã ghi ở `Cap8PortfolioAnalysis.tsx` /
// `cap7/Cap7PortfolioAnalysisPanel.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Progress } from "@/features/cap3/hooks"
import { useCap4Progress } from "@/features/cap4/hooks"
import { useCap5Progress } from "@/features/cap5/hooks"
import { useCap6Progress } from "@/features/cap6/hooks"
import { useCap7Progress } from "@/features/cap7/hooks"
import { useCap7TradeLog } from "@/features/cap7/tradeLogCap7"
import { useCap8Events } from "./Cap8Context"
import { useCap8Progress } from "./hooks"
import { Cap8PortfolioAnalysis } from "./Cap8PortfolioAnalysis"

/**
 * Panel "Phân tích danh mục" của sidebar-phải trong Cấp 8 (spec §7) — case
 * `"cap8-analysis"` của `RightSidebar`. Self-contained, mirror
 * `cap7/Cap7PortfolioAnalysisPanel.tsx`: nạp `Cap8PortfolioAnalysis` từ
 * `useCap8Progress` + `useCap7TradeLog` (nhật ký lệnh đã đóng — **Cấp 8 KHÔNG có
 * nhật ký riêng**: nó không thêm trường nào vào bản ghi lệnh, khối ⑱ đọc thẳng từ
 * `GET /cap8/thach-thuc`), CỘNG hồ sơ Cấp 7 + 6 + 5 + 4 + 3 + 2 và nhật ký điểm
 * kỷ luật dùng chung (`useCap2TradeLog().scores`) mà các khối kế thừa Cấp 1-7
 * cần.
 *
 * ★ **`isCap8Active` gate CÁC QUERY DO CHÍNH PANEL NÀY GỌI, không phải mọi query
 * trong cây con.** Bảy `useCapNProgress` bên dưới đều nhận `isCap8Active`, nên
 * panel vô hại nếu `activePanel` tình cờ là "cap8-analysis" ở ngoài Cấp 8
 * (`SidebarProvider` là singleton app-root). Nhưng `Cap8PortfolioAnalysis` tự gọi
 * `useThachThucCap8()` KHÔNG gate, và các component Cấp 4/5/6/7 bên trong nó tự
 * gọi `useVuKhiDiemMu()` / `useThachThucCap6()` /
 * `useThachThucCap7()` cũng vậy — mỗi hook đó tự gate bằng `isAuthenticated` và
 * tự fail-closed, và panel này chỉ được mount từ bên trong Cấp 8, nên chuyện đó
 * vô hại. Hệ quả cho test: mọi test/mount của panel cần provider auth +
 * QueryClient (hoặc mock hook), chứ `isCap8Active` một mình không chặn được gì.
 *
 * Cấp 8 không có nhiệm vụ nào gắn với "mở trang Phân tích danh mục N lần" (3
 * nhiệm vụ đều dựa trên hành vi Kiểm tra danh mục — spec §2), nên panel không có
 * side effect `markTask` lúc mount (giống Cấp 2/3/4/5/6/7).
 */
export function Cap8PortfolioAnalysisPanel() {
  const { isCap8Active } = useCap8Events()
  const { data: cap8Progress } = useCap8Progress(isCap8Active)
  const { data: cap7Progress } = useCap7Progress(isCap8Active)
  const { data: cap6Progress } = useCap6Progress(isCap8Active)
  const { data: cap5Progress } = useCap5Progress(isCap8Active)
  const { data: cap4Progress } = useCap4Progress(isCap8Active)
  const { data: cap3Progress } = useCap3Progress(isCap8Active)
  const { data: cap2Progress } = useCap2Progress(isCap8Active)
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
        <Cap8PortfolioAnalysis
          cap2Progress={cap2Progress ?? null}
          cap3Progress={cap3Progress ?? null}
          cap4Progress={cap4Progress ?? null}
          cap5Progress={cap5Progress ?? null}
          cap6Progress={cap6Progress ?? null}
          cap7Progress={cap7Progress ?? null}
          cap8Progress={cap8Progress ?? null}
          trades={trades}
          dailyScores={scores}
        />
      </div>
    </div>
  )
}

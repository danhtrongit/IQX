import { useEffect, useMemo } from "react"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { useSidebar } from "@/shared/contexts/sidebar-context"
// Import file cụ thể (KHÔNG qua barrel `@/features/cap2`) — cùng lý do chống
// vòng module đã ghi ở `Cap3PortfolioAnalysis.tsx`/`KetsoModalCap3.tsx`.
import { useCap2Progress } from "@/features/cap2/hooks"
import { useCap2TradeLog } from "@/features/cap2/tradeLogCap2"
import { useCap3Events } from "./Cap3Context"
import { useCap3Progress, useCap3TradeAnalysis } from "./hooks"
import { cap3TradeFromWire, useCap3TradeLog } from "./tradeLogCap3"
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
 * singleton app-root). The two Cấp 3 tasks are derived from persisted placed
 * plans, so this analysis panel has no task side effect when it mounts.
 */
export function Cap3PortfolioAnalysisPanel() {
  const { isCap3Active } = useCap3Events()
  const { data: cap3Progress } = useCap3Progress(isCap3Active)
  const serverHistory = useCap3TradeAnalysis(isCap3Active)
  const { data: cap2Progress } = useCap2Progress(isCap3Active)
  const { trades: localTrades } = useCap3TradeLog()
  const { scores } = useCap2TradeLog()
  const { setActivePanel } = useSidebar()

  useEffect(() => {
    if (isCap3Active) trackJourneyEvent("cap3_phantich_danhmuc_view")
  }, [isCap3Active])

  const serverTrades = useMemo(
    () => serverHistory.data?.trades.map(cap3TradeFromWire).filter((trade) => trade != null) ?? [],
    [serverHistory.data?.trades],
  )
  const serverHasIncompleteRows = Boolean(
    serverHistory.isSuccess && serverHistory.data && serverTrades.length !== serverHistory.data.trades.length,
  )
  const historyUnknown = serverHasIncompleteRows || (!serverHistory.isSuccess && localTrades.length === 0)
  const usingLocalFallback = !serverHistory.isSuccess && localTrades.length > 0
  // A successful empty response is authoritative. Local data is usable only
  // when it actually contains evidence; an empty fallback means "unknown",
  // never zero trades.
  const trades = serverHistory.isSuccess ? serverTrades : localTrades

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
        {historyUnknown ? (
          <div
            className="rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3 text-xs text-[var(--color-text-3)]"
            data-testid="cap3-history-unknown"
          >
            Chưa tải được lịch sử lệnh Cấp 3 đầy đủ. Hệ thống chưa thể tính các chỉ số tự tin và
            khối lượng lúc này.
          </div>
        ) : (
          <>
            {usingLocalFallback && (
              <div
                className="mb-3 rounded-md border border-[var(--color-border-2)] px-3 py-2 text-[10.5px] text-[var(--color-text-3)]"
                data-testid="cap3-history-local-fallback"
              >
                Đang dùng lịch sử tạm trên thiết bị; số liệu sẽ tự đồng bộ khi máy chủ khả dụng.
              </div>
            )}
            <Cap3PortfolioAnalysis
              cap2Progress={cap2Progress ?? null}
              cap3Progress={cap3Progress ?? null}
              trades={trades}
              dailyScores={scores}
            />
          </>
        )}
      </div>
    </div>
  )
}

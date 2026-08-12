import { useCallback } from "react"
import { useNavigate } from "react-router"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { TVChart } from "../chart/TVChart"
import { getDrawingPersistence } from "../chart/drawing-persistence"

interface CenterPanelProps {
  onMarkClick?: (markId: string | number) => void
  /**
   * Chuyện gì xảy ra khi CHART đổi mã (user gõ mã mới trong widget, HOẶC chính
   * app `setSymbol` làm widget đổi theo — TVChart bắn `onSymbolChanged` cho CẢ
   * HAI, không phân biệt được).
   *
   * - `"navigate"` (mặc định): sang `/co-phieu/<mã>` — hành vi cũ của
   *   /bieu-do, /co-phieu.
   * - `"select"`: chỉ `setSymbol` tại chỗ. **Các trang cấp /dau-truong PHẢI
   *   dùng chế độ này** — với `"navigate"`, cú click mã ở tab Nắm giữ đi
   *   setSymbol → widget đổi mã → bắn event → navigate('/co-phieu/…') và user
   *   bị NÉM KHỎI Cấp 0/1 về màn hình đặt lệnh mặc định. Đó chính là bug
   *   "chuyển qua mã khác về lại như màn hình cũ" (punch list 2026-08-12);
   *   fix click-row trước đó đúng nhưng navigation lẻn lại bằng đường chart.
   */
  symbolChange?: "navigate" | "select"
}

export function CenterPanel({ onMarkClick, symbolChange = "navigate" }: CenterPanelProps = {}) {
  const { symbol, setSymbol } = useSymbol()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const handleSymbolChanged = useCallback(
    (newSymbol: string) => {
      const clean =
        newSymbol.split(":").pop()?.toUpperCase() || newSymbol.toUpperCase()
      if (!clean || clean === symbol.toUpperCase()) return // no-op echo từ chính setSymbol
      if (symbolChange === "select") {
        setSymbol(clean)
        return
      }
      navigate(`/co-phieu/${clean}`)
    },
    [navigate, symbolChange, setSymbol, symbol],
  )

  return (
    <section
      id="center-panel"
      className="flex flex-1 flex-col min-w-0 bg-[var(--color-bg-1)]"
    >
      {/* TradingView Chart - fills entire center panel */}
      <div className="flex-1 min-h-0" data-tour-id="cap0-tour-chart">
        <TVChart
          symbol={symbol}
          interval="D"
          theme={theme}
          onSymbolChanged={handleSymbolChanged}
          onMarkClick={onMarkClick}
          persistence={getDrawingPersistence()}
        />
      </div>
    </section>
  )
}

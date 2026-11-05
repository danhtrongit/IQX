/**
 * Biểu đồ Flashback bằng IQLine (Canvas), bật bằng `?iqline=1` (docs/iqline-design.md GĐ 5). Tải chậm: ở đường mặc định
 * (biểu đồ SVG cũ) file này và toàn bộ thư viện Canvas không được tải.
 *
 * Giữ nguyên luật Flashback v2.3 và v2.4: kho chỉ báo của Flashback (ẩn, cài đặt, xóa, tối đa 12), chiều cao ô và chú giải nổi
 * (do `IQLineFlashback`), nhãn trục "n phiên trước" / "Phiên n" không có ngày thật hay tên mã, dấu mua bán của các lệnh đã
 * khớp, hình vẽ theo ván chỉ trong bộ nhớ (Xu hướng, Fibonacci, thêm Đường ngang). Thanh công cụ vẽ nằm cùng hàng với nút
 * "Các chỉ báo" do màn chơi đưa vào (`leading`).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AlignJustify, Minus, TrendingUp } from "lucide-react"

import { useResolvedTheme } from "@/hooks/use-resolved-theme"
import { IQLineFlashback } from "@/lib/iqline/react/IQLineFlashback"
import type { ChartIndicatorInput, DrawingTool } from "@/lib/iqline/types"

import type { FlashbackBar, FlashbackOrder } from "./flashback-api"
import type { ChartIndicator } from "./flashback-context"
import type { Drawing as LegacyDrawing } from "./flashback-drawings"
import { DrawingToolbarView, type ToolButton } from "./flashback-drawing-toolbar"
import {
  applyIndicatorChange,
  indicatorTitleOf,
  legacyDrawingsToLib,
  ordersToMarkers,
  toChartInputs,
  toLibBars,
} from "./flashback-iqline-adapter"
import { formatNumber, sessionLabel } from "./flashback-model"
import { useChartFit } from "./use-chart-fit"
import { useSessionDrawings } from "./use-session-drawings"

/** Ba công cụ của Flashback (v2.1 §7 và thêm đường ngang); mã công cụ là của thư viện. */
const IQLINE_TOOLS: readonly ToolButton[] = [
  { key: "trend", tool: "trend", label: "Xu hướng", icon: TrendingUp },
  { key: "fib", tool: "fib-retracement", label: "Fibonacci", icon: AlignJustify },
  { key: "horizontal", tool: "horizontal", label: "Đường ngang", icon: Minus },
]

const formatPrice = (price: number): string => formatNumber(price)

export type FlashbackIqlineChartProps = {
  /** Nút "Các chỉ báo" của màn chơi: nằm cùng hàng với các nút công cụ vẽ. */
  leading: ReactNode
  /** Nến đã hiện (không gồm warmup). */
  bars: readonly FlashbackBar[]
  /** Nến khởi tạo cho chỉ báo, không vẽ. */
  warmup: readonly FlashbackBar[]
  indicators: readonly ChartIndicator[]
  orders: readonly FlashbackOrder[]
  viewBars: number
  playBars: number
  /** Hình của biểu đồ SVG cũ đang giữ trong ván (nếu có): chuyển sang IQLine một lần khi biểu đồ này hiện ra. */
  legacyShapes: readonly LegacyDrawing[]
  /** Phím tắt Esc, Delete: tắt khi có hộp thoại mở. */
  drawingKeys: boolean
  onToggle: (key: string) => void
  onSettings: (key: string) => void
  onRemove: (key: string) => void
}

export default function FlashbackIqlineChart({
  leading,
  bars,
  warmup,
  indicators,
  orders,
  viewBars,
  playBars,
  legacyShapes,
  drawingKeys,
  onToggle,
  onSettings,
  onRemove,
}: FlashbackIqlineChartProps) {
  const theme = useResolvedTheme()
  const drawings = useSessionDrawings(drawingKeys)
  const [fitRef, fit] = useChartFit()

  const { controller } = drawings
  const [carried] = useState(() => legacyDrawingsToLib(legacyShapes))
  useEffect(() => controller.seed(carried), [controller, carried])

  const libBars = useMemo(() => toLibBars(warmup, bars), [warmup, bars])
  const inputs = useMemo(() => toChartInputs(indicators), [indicators])
  const title = useMemo(() => indicatorTitleOf(indicators), [indicators])
  const formatX = useCallback((session: number) => sessionLabel(session, viewBars), [viewBars])
  const markers = useMemo(() => ordersToMarkers(orders, viewBars, bars.length - 1), [orders, viewBars, bars.length])
  const onIndicatorsChange = useCallback(
    (next: readonly ChartIndicatorInput[]) => applyIndicatorChange(inputs, next, { toggle: onToggle, remove: onRemove }),
    [inputs, onToggle, onRemove],
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        <DrawingToolbarView tools={IQLINE_TOOLS} active={drawings.snapshot.tool} onToggle={(tool) => drawings.toggleTool(tool as DrawingTool)} onClear={drawings.clear} />
      </div>
      <div ref={fitRef} className="w-full">
        <IQLineFlashback
          mode="flashback"
          theme={theme}
          bars={libBars}
          warmup={warmup.length}
          totalSlots={viewBars + playBars}
          formatX={formatX}
          markers={markers}
          divider={viewBars}
          drawings={controller}
          indicators={inputs}
          onIndicatorsChange={onIndicatorsChange}
          onIndicatorSettings={onSettings}
          indicatorTitle={title}
          labelToken="academy-label"
          formatPrice={formatPrice}
          available={fit.available}
          pageNarrow={fit.pageNarrow}
        />
      </div>
    </>
  )
}

/**
 * Biểu đồ Flashback bằng IQLine (Canvas), bật bằng `?iqline=1` (docs/iqline-design.md GĐ 5). Tải chậm: ở đường mặc định
 * (biểu đồ SVG cũ) file này và toàn bộ thư viện Canvas không được tải.
 *
 * Giữ nguyên luật Flashback v2.3 và v2.4: kho chỉ báo của Flashback (ẩn, cài đặt, xóa, tối đa 12), chiều cao ô và chú giải nổi
 * (do `IQLineFlashback`), nhãn trục ở khung mặc định như SVG ("Lịch sử n phiên", "Phiên 1", ...) và "n phiên trước" / "Phiên n" khi zoom, không có ngày thật hay tên mã, dấu mua bán của các lệnh đã
 * khớp, hình vẽ theo ván chỉ trong bộ nhớ.
 *
 * Công cụ vẽ: đủ 36 công cụ của thư viện (§10), dùng lại các nút nhóm, yêu thích, nam châm và danh sách hình vẽ của biểu đồ thị trường
 * (`HorizontalToolGroups`, `HorizontalToolExtras`), xếp ngang phía trên biểu đồ. Máy tính: một hàng cùng nút "Các chỉ báo" do màn chơi
 * đưa vào (`leading`). Điện thoại: hàng trên là "Các chỉ báo", nam châm, danh sách và Xoá; hàng dưới là bảy nhóm công cụ. Thanh kiểu
 * của hình đang chọn nổi ở đáy khung biểu đồ, trong khung nên không che nút Mua, Bán, Phiên tiếp bên dưới.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"
import { DrawingStyleBar, HorizontalToolExtras, HorizontalToolGroups } from "@/lib/iqline/react/drawing-toolbar"
import { IQLineFlashback } from "@/lib/iqline/react/IQLineFlashback"
import { useSessionToolbarChart } from "@/lib/iqline/react/session-toolbar"
import type { ChartIndicatorInput, DrawingTool } from "@/lib/iqline/types"
import { currentOwner } from "@/pages/charts/chart/drawing-persistence"

import type { FlashbackBar, FlashbackOrder } from "./flashback-api"
import type { ChartIndicator } from "./flashback-context"
import type { Drawing as LegacyDrawing } from "./flashback-drawings"
import {
  applyIndicatorChange,
  indicatorTitleOf,
  legacyDrawingsToLib,
  ordersToMarkers,
  toChartInputs,
  toLibBars,
} from "./flashback-iqline-adapter"
import { axisTicks } from "./flashback-chart-layout"
import { formatNumber, sessionLabel } from "./flashback-model"
import { useChartFit } from "./use-chart-fit"
import { useSessionDrawings } from "./use-session-drawings"

/**
 * Ba công cụ cũ của Flashback (v2.1 §7 và đường ngang), mặc định là yêu thích trên màn hình rộng để người chơi quen tay vẫn vẽ bằng một
 * lần bấm. Điện thoại không có yêu thích mặc định: hàng bảy nhóm công cụ đã vừa khít 390px. Chỉ áp dụng khi máy chưa lưu danh sách nào.
 */
const QUICK_TOOLS: readonly DrawingTool[] = ["trend", "fib-retracement", "horizontal"]
const quickTools = (): readonly DrawingTool[] => (typeof window !== "undefined" && window.matchMedia?.("(min-width: 640px)").matches ? QUICK_TOOLS : [])

/**
 * Menu công cụ chừa 72px phía dưới: thanh Mua, Bán, Chat, Phiên tiếp cố định ở đáy điện thoại (cao 57px) không bị menu che.
 * `HorizontalToolGroups` và `HorizontalToolExtras` đều nhận khoảng chừa này.
 */
const MENU_LAYOUT = { menuPadding: { top: 8, right: 8, bottom: 72, left: 8 } } as const

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
  const toolbarChart = useSessionToolbarChart(drawings.controller)
  const [scope] = useState(() => currentOwner() ?? "guest")
  const [favorites] = useState(quickTools)
  const [fitRef, fit] = useChartFit()

  const { controller } = drawings
  const [carried] = useState(() => legacyDrawingsToLib(legacyShapes))
  useEffect(() => controller.seed(carried), [controller, carried])

  const libBars = useMemo(() => toLibBars(warmup, bars), [warmup, bars])
  const inputs = useMemo(() => toChartInputs(indicators), [indicators])
  const title = useMemo(() => indicatorTitleOf(indicators), [indicators])
  const formatX = useCallback((session: number) => sessionLabel(session, viewBars), [viewBars])
  // Khung mặc định: đúng nhãn của biểu đồ SVG cũ ("Lịch sử 60 phiên", "Phiên 1", phiên giữa, "Phiên n"); zoom thì trục tự đổi nhãn theo phiên.
  const axisLabels = useCallback((narrow: boolean) => axisTicks(viewBars, playBars, narrow), [viewBars, playBars])
  const markers = useMemo(() => ordersToMarkers(orders, viewBars, bars.length - 1), [orders, viewBars, bars.length])
  const onIndicatorsChange = useCallback(
    (next: readonly ChartIndicatorInput[]) => applyIndicatorChange(inputs, next, { toggle: onToggle, remove: onRemove }),
    [inputs, onToggle, onRemove],
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="flashback-draw-toolbar">
        {leading}
        <HorizontalToolGroups chart={toolbarChart} scope={scope} layout={MENU_LAYOUT} defaultFavorites={favorites} className="max-sm:order-last max-sm:basis-full" />
        <HorizontalToolExtras
          chart={toolbarChart}
          layout={MENU_LAYOUT}
          className="max-sm:ml-auto"
          trailing={
            <Button type="button" variant="outline" size="sm" title="Xoá hình vẽ" data-testid="flashback-draw-clear" onClick={drawings.clear}>
              <Trash2 aria-hidden="true" />
              <span className="max-sm:sr-only">Xoá</span>
            </Button>
          }
        />
      </div>
      <div ref={fitRef} className="relative w-full">
        <IQLineFlashback
          mode="flashback"
          theme={theme}
          bars={libBars}
          warmup={warmup.length}
          totalSlots={viewBars + playBars}
          formatX={formatX}
          axisLabels={axisLabels}
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
        {toolbarChart.state.drawings.selectedId !== null || toolbarChart.state.drawings.pending !== null ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-2">
            <DrawingStyleBar chart={toolbarChart} />
          </div>
        ) : null}
      </div>
    </>
  )
}

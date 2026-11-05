/**
 * `<IQLineFlashback mode="flashback" />` (docs/iqline-design.md §6, §12): biểu đồ của Flashback.
 *
 * Ghép: `useIQLineChart` (bộ điều khiển dùng chung) + `IQLineCanvasView` (bốn lớp canvas) + chú giải nổi ở DOM
 * (`FlashbackLegend`) + nút zoom. Không có datafeed, store, tìm mã, chụp ảnh hay đường nào sang `market`.
 *
 * Luật công bằng (§12), mỗi luật có test ở `IQLineFlashback.test.tsx`, `scene/flashback-rules.test.ts`, `interaction/fairness.test.ts`:
 * - Chỉ nhận nến đã mở (`bars`), kiểu `Bar` không có trường thời gian; `formatX` do trang đưa vào, không có ngày thật hay tên mã.
 * - `warmup` nến đầu chỉ để tính chỉ báo: không vẽ, không kéo tới, không đọc được.
 * - Crosshair và chú giải không đọc được ô tương lai.
 * - Chiều cao ô theo `chartLayout` (v2.3 §2), chú giải nổi không chiếm chiều cao ô.
 * - `MAX_INDICATORS` do trang kiểm tra: thư viện nhận bao nhiêu chỉ báo thì tính bấy nhiêu.
 *
 * Zoom và kéo bật trong giới hạn nến đã mở: lăn chuột zoom quanh con trỏ (trang không cuộn theo khi con trỏ ở trên biểu đồ), lăn ngang
 * hoặc Shift + lăn để kéo, phím + và -, chụm hai ngón; nút "Về khung mặc định" và nhấp đúp vào biểu đồ đưa về khung mặc định.
 * Hình vẽ (đủ 36 công cụ như `market`) nằm ở `drawings` (`SessionDrawingController`), chỉ trong bộ nhớ của ván.
 */
import { useEffect, useImperativeHandle, useLayoutEffect, type Ref } from "react"
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { cn } from "@/lib/utils"

import { NARROW_WIDTH } from "../core/layout"
import type { SessionAxisLabel, Bar, ChartIndicatorInput, SessionMarker } from "../types"
import { FlashbackLegend } from "./flashback-legend"
import { IQLineCanvasView } from "./IQLineCanvas"
import type { SessionDrawingController } from "./session-drawings"
import { AXIS_RIGHT, useIQLineChart } from "./use-iqline-chart"

export type IQLineFlashbackHandle = {
  /** Về khung mặc định: nhìn hết mọi ô của trục. */
  fitContent(): void
  zoomIn(): void
  zoomOut(): void
}

export type IQLineFlashbackProps = {
  mode: "flashback"
  theme: "light" | "dark"
  /** Toàn bộ nến đã mở, gồm `warmup` nến đầu chỉ để tính chỉ báo. Không có trường thời gian. */
  bars: readonly Bar[]
  warmup: number
  /** Tổng số ô trên trục (không tính warmup); phần dư sau nến đã mở là tương lai. */
  totalSlots: number
  /** Nhãn của một phiên (chỉ số 0 là nến đầu tiên được hiện): trục ngang, crosshair và chú giải dùng chung. */
  formatX: (session: number) => string
  /**
   * Nhãn cố định của trục ngang khi đang nhìn hết mọi ô ("Lịch sử 60 phiên", "Phiên 1", ..., như Flashback v2.3). `narrow` là biểu đồ hẹp
   * hơn 600px. Giữ hàm ổn định giữa các lần render (useMemo). Đã zoom hoặc kéo thì trục dùng nhãn theo `formatX`.
   */
  axisLabels?: (narrow: boolean) => readonly SessionAxisLabel[]
  markers?: readonly SessionMarker[]
  /** Chỉ số ô bắt đầu phần chơi: vạch đứt ngăn giữa phần xem và phần chơi. */
  divider?: number
  drawings: SessionDrawingController
  interaction?: { zoom?: boolean; pan?: boolean }
  indicators: readonly ChartIndicatorInput[]
  /** Nút Ẩn và Xóa trên chú giải gọi hàm này với danh sách mới. Bỏ trống thì hai nút không làm gì. */
  onIndicatorsChange?: (next: readonly ChartIndicatorInput[]) => void
  /** Nút Cài đặt: hộp thoại thuộc về trang (danh mục chỉ báo của Flashback nằm ở trang, thư viện không sở hữu). */
  onIndicatorSettings?: (key: string) => void
  /** Tên hiển thị của chỉ báo trên chú giải ("RSI 14"); mặc định "RSI (14)". */
  indicatorTitle?: (input: ChartIndicatorInput, fallback: string) => string
  /** Mặc định `academy-label`, như Flashback hiện tại. */
  labelToken?: "muted-foreground" | "academy-label"
  formatPrice?: (price: number) => string
  /** Chiều cao màn hình còn trống cho biểu đồ (null khi chưa đo): ô giá lấy phần còn lại, tối thiểu 320px (điện thoại 240px). */
  available?: number | null
  /** Cửa sổ hẹp: dùng chiều cao ô của điện thoại dù biểu đồ rộng hơn 600px. */
  pageNarrow?: boolean
  className?: string
  ariaLabel?: string
  /** React 19: `ref` là một prop thường. */
  ref?: Ref<IQLineFlashbackHandle>
}

const defaultFormatPrice = (price: number): string => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(price)

const ZOOM_BUTTON =
  "inline-flex items-center justify-center rounded-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-40"

export function IQLineFlashback(props: IQLineFlashbackProps) {
  const { ref, theme, bars, warmup, totalSlots, formatX, axisLabels, markers, divider, drawings, interaction, indicators, onIndicatorsChange, onIndicatorSettings, indicatorTitle, available, pageNarrow, className } = props
  const labelToken = props.labelToken ?? "academy-label"
  const formatPrice = props.formatPrice ?? defaultFormatPrice

  const chart = useIQLineChart({
    mode: "flashback",
    theme,
    bars,
    warmup,
    totalSlots,
    formatX,
    axisLabels,
    markers,
    divider,
    available,
    pageNarrow,
    indicatorTitle,
    indicatorInputs: indicators,
    labelToken,
    formatPrice,
    interaction,
    resizablePanes: false,
    ariaLabel: props.ariaLabel ?? "Biểu đồ nến Flashback",
  })
  const { controller } = chart

  // ---- hình vẽ của ván: controller của trang nhận hành động và nạp lại hình đã giữ khi biểu đồ dựng lại.
  useLayoutEffect(() => {
    drawings.attach(controller)
    return () => drawings.attach(null)
  }, [drawings, controller])
  const shapes = chart.state.drawings
  const magnet = chart.state.magnet
  useEffect(() => {
    drawings.report({ ...shapes, magnet })
  }, [drawings, shapes, magnet])

  const handle: IQLineFlashbackHandle = {
    fitContent: () => controller.dispatch({ type: "reset" }),
    zoomIn: () => controller.dispatch({ type: "zoom", direction: "in" }),
    zoomOut: () => controller.dispatch({ type: "zoom", direction: "out" }),
  }
  useImperativeHandle(ref, () => handle)

  const narrow = chart.size.width < NARROW_WIDTH
  const touch = narrow || pageNarrow === true
  const defaultView = chart.config.defaultViewport
  const zoomed = Math.abs(chart.viewport.from - defaultView.from) > 1e-6 || Math.abs(chart.viewport.to - defaultView.to) > 1e-6
  const canZoom = chart.config.zoom
  const canFit = chart.config.zoom || chart.config.pan
  const priceBox = chart.frame?.price.box
  // Điện thoại: nút to 36px cho ngón tay; máy tính 24px.
  const buttonSize = touch ? 36 : 24
  const buttonClass = cn(ZOOM_BUTTON, touch ? "size-9" : "size-6")

  return (
    <div
      data-iqline-root="flashback"
      data-chart-height={chart.height}
      data-narrow={narrow}
      data-viewport={`${chart.viewport.from},${chart.viewport.to}`}
      className={cn("group/fb relative w-full", className)}
      style={{ height: chart.height || undefined, minHeight: chart.height || undefined }}
    >
      <IQLineCanvasView chart={chart} />
      <FlashbackLegend
        chart={chart}
        touch={touch}
        formatX={formatX}
        formatPrice={formatPrice}
        onToggleIndicator={(key) => onIndicatorsChange?.(indicators.map((item) => (item.key === key ? { ...item, hidden: !item.hidden } : item)))}
        onEditIndicator={onIndicatorSettings}
        onRemoveIndicator={(key) => onIndicatorsChange?.(indicators.filter((item) => item.key !== key))}
      />
      {priceBox && canFit ? (
        <div
          role="group"
          aria-label="Thu phóng biểu đồ"
          data-testid="flashback-zoom-controls"
          data-zoomed={zoomed}
          className={cn(
            "absolute flex items-center rounded-sm bg-background/80 transition-opacity",
            // Máy cảm ứng không có rê chuột: nút luôn hiện để zoom và về khung mặc định bằng một chạm (không chờ đã zoom bằng hai ngón).
            zoomed || touch ? "opacity-100" : "opacity-0 group-hover/fb:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100",
          )}
          style={{ top: priceBox.top + priceBox.height - buttonSize - 6, right: AXIS_RIGHT + 6 }}
        >
          {canZoom ? (
            <>
              <button type="button" className={buttonClass} aria-label="Thu nhỏ biểu đồ" title="Thu nhỏ" onClick={handle.zoomOut}>
                <ZoomOut className="size-3.5" aria-hidden="true" />
              </button>
              <button type="button" className={buttonClass} aria-label="Phóng to biểu đồ" title="Phóng to" onClick={handle.zoomIn}>
                <ZoomIn className="size-3.5" aria-hidden="true" />
              </button>
            </>
          ) : null}
          <button type="button" className={buttonClass} aria-label="Về khung mặc định" title="Về khung mặc định" disabled={!zoomed} onClick={handle.fitContent}>
            <Maximize2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

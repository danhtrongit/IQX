/**
 * Bố cục các khung của biểu đồ Flashback (spec v2.3 §2, thay v2 §6.4 "Chiều cao khung" và v2.1 §8).
 *
 * Phần tính toán nằm ở thư viện IQLine (`core/layout`, `core/price-scale`), dùng chung cho cả hai đường vẽ: SVG cũ và IQLine
 * (`?iqline=1`). File này chỉ còn là cầu nối giữ nguyên tên và chữ ký mà biểu đồ SVG và các test cũ đang dùng, cùng nhãn trục
 * ngang `axisTicks` chỉ có ở biểu đồ SVG (IQLine tự tính nhãn trục theo khung đang xem). Chỉ import file con của thư viện, không
 * import `@/lib/iqline` nguyên khối, để đường mặc định không kéo mã Canvas.
 */
export {
  AXIS_HEIGHT,
  CHART_TOP,
  LEGEND_ROW,
  NARROW_WIDTH,
  PAGE_NARROW_WIDTH,
  PANE_GAP,
  PANE_HEIGHT,
  chartLayout,
  priceHeight,
  type ChartLayout,
  type PaneBox,
  type PaneKind,
} from "@/lib/iqline/core/layout"
export { PRICE_PADDING, offscaleLabels, priceRange, type OffscaleLabel } from "@/lib/iqline/core/price-scale"

export type AxisTick = { index: number; label: string; anchor: "start" | "middle" | "end" }

/**
 * Nhãn trục ngang (không có ngày thật): "Lịch sử {n} phiên", "Phiên 1", phiên giữa, "Phiên {số
 * phiên chơi}". Điện thoại bỏ nhãn giữa và rút gọn nhãn đầu.
 */
export function axisTicks(viewBars: number, playBars: number, narrow: boolean): AxisTick[] {
  const total = viewBars + playBars
  if (narrow) {
    return [
      { index: 0, label: "Lịch sử", anchor: "start" },
      { index: viewBars, label: "Phiên 1", anchor: "middle" },
      { index: total - 1, label: `Phiên ${playBars}`, anchor: "end" },
    ]
  }
  const middle = Math.round(playBars / 2)
  return [
    { index: 0, label: `Lịch sử ${viewBars} phiên`, anchor: "start" },
    { index: viewBars, label: "Phiên 1", anchor: "middle" },
    { index: viewBars + middle - 1, label: `Phiên ${middle}`, anchor: "middle" },
    { index: total - 1, label: `Phiên ${playBars}`, anchor: "end" },
  ]
}

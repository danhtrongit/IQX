/**
 * Bố cục các khung của biểu đồ Flashback (spec v2 §6.4, đổi ở v2.1 §8).
 *
 * Mỗi khung có DẢI ĐẦU riêng cho dòng chú giải; đường vẽ nằm bên dưới dải này nên không bao giờ đè
 * lên chữ. Tổng chiều cao biểu đồ là một con số cho trước (`totalHeight`): máy tính gói gọn trong
 * màn hình (không dưới 300px), điện thoại cố định 380px. Phần còn lại sau khi trừ dải chú giải,
 * khoảng cách và trục ngang được chia cho các phần vẽ theo tỷ lệ giá 3,2 : khối lượng 1 : mỗi khung
 * chỉ báo riêng 1,15. Thêm chỉ báo thì các khung tự chia lại, biểu đồ không dài thêm.
 */

/** Chiều cao một dòng chú giải; đủ chỗ cho nút ẩn, cài đặt, xóa cỡ 24px. */
export const LEGEND_ROW = 24
/** Khoảng đệm dưới dải chú giải của ô giá và ô chỉ báo riêng. */
const LEGEND_PAD = 4
export const PANE_GAP = 10
export const CHART_TOP = 4
/** Chỗ cho nhãn trục ngang ở đáy. */
export const AXIS_HEIGHT = 18
/** Dưới độ rộng này biểu đồ dùng bố cục điện thoại. */
export const NARROW_WIDTH = 600

/** Tỷ lệ chiều cao phần vẽ: giá 3,2 · khối lượng 1 · mỗi khung chỉ báo riêng 1,15 (v2.1 §8). */
export const PLOT_WEIGHT = { price: 3.2, volume: 1, indicator: 1.15 } as const
/** Biểu đồ trên điện thoại cao cố định 380px, trang cuộn bình thường (v2.1 §8). */
export const CHART_HEIGHT_MOBILE = 380
/** Biểu đồ trên máy tính không thấp hơn 300px dù màn hình thấp (v2.1 §8). */
export const CHART_HEIGHT_MIN = 300
/** Tổng chiều cao phần vẽ không nhỏ hơn mức này; quá nhiều chỉ báo thì biểu đồ dài thêm chứ không bị bóp. */
export const PLOT_TOTAL_MIN = 60
/** Từ độ rộng cửa sổ này trở xuống trang dùng bố cục điện thoại: biểu đồ cao cố định, trang cuộn. */
export const PAGE_NARROW_WIDTH = 900

export type PaneKind = "price" | "volume" | "indicator"

/**
 * Tổng chiều cao biểu đồ (v2.1 §8). `fixed` (điện thoại): 380px. Máy tính: toàn bộ chiều cao còn
 * trống của màn hình (`available`) để biểu đồ và nút "Phiên tiếp" vừa một màn, không dưới 300px.
 */
export function chartTotalHeight(input: { fixed: boolean; available: number | null }): number {
  if (input.fixed) return CHART_HEIGHT_MOBILE
  if (input.available === null || !Number.isFinite(input.available)) return CHART_HEIGHT_MIN
  return Math.max(CHART_HEIGHT_MIN, Math.floor(input.available))
}

export type PaneBox = {
  key: string
  kind: PaneKind
  /** Đỉnh dải chú giải. */
  legendTop: number
  legendHeight: number
  /** Đỉnh và chiều cao phần vẽ (nằm dưới dải chú giải). */
  top: number
  height: number
}

export type ChartLayout = {
  panes: PaneBox[]
  /** Tổng chiều cao của biểu đồ, gồm nhãn trục ngang. */
  height: number
}

/**
 * Dựng các khung theo thứ tự: giá, khối lượng, rồi từng chỉ báo có ô riêng. Dải chú giải của ô giá
 * có một dòng O/H/L/C (hai dòng trên điện thoại) cộng một dòng cho mỗi chỉ báo vẽ trên ô giá; của ô
 * khối lượng có một dòng cộng một dòng cho mỗi chỉ báo Khối lượng. Chỉ báo đang ẩn vẫn giữ dòng của nó.
 *
 * Chiều cao phần vẽ còn lại (tổng chiều cao trừ lề, trục ngang, khoảng cách và các dải chú giải) chia
 * theo `PLOT_WEIGHT`, làm tròn xuống từng khung, phần dư về ô giá để tổng khớp đúng `totalHeight`.
 */
export function chartLayout(input: {
  narrow: boolean
  overlayCount: number
  volumeCount: number
  /** Khoá của từng chỉ báo có ô riêng, theo thứ tự hiển thị. */
  indicatorKeys: readonly string[]
  /** Tổng chiều cao biểu đồ mong muốn, gồm nhãn trục ngang (xem `chartTotalHeight`). */
  totalHeight: number
}): ChartLayout {
  const specs: { key: string; kind: PaneKind; legend: number }[] = [
    {
      key: "p",
      kind: "price",
      legend: (input.narrow ? 2 : 1) * LEGEND_ROW + input.overlayCount * LEGEND_ROW + LEGEND_PAD,
    },
    { key: "v", kind: "volume", legend: (1 + input.volumeCount) * LEGEND_ROW },
    ...input.indicatorKeys.map((key) => ({
      key: `i${key}`,
      kind: "indicator" as const,
      legend: LEGEND_ROW + LEGEND_PAD,
    })),
  ]
  const legends = specs.reduce((sum, spec) => sum + spec.legend, 0)
  const fixed = CHART_TOP + AXIS_HEIGHT + PANE_GAP * (specs.length - 1) + legends
  const plotTotal = Math.max(PLOT_TOTAL_MIN, Math.round(input.totalHeight - fixed))
  const weightSum = specs.reduce((sum, spec) => sum + PLOT_WEIGHT[spec.kind], 0)
  const plots = specs.map((spec) => Math.floor((plotTotal * PLOT_WEIGHT[spec.kind]) / weightSum))
  plots[0] += plotTotal - plots.reduce((sum, value) => sum + value, 0)

  const panes: PaneBox[] = []
  let top = CHART_TOP
  specs.forEach((spec, index) => {
    panes.push({
      key: spec.key,
      kind: spec.kind,
      legendTop: top,
      legendHeight: spec.legend,
      top: top + spec.legend,
      height: plots[index],
    })
    top += spec.legend + plots[index] + PANE_GAP
  })
  return { panes, height: top - PANE_GAP + AXIS_HEIGHT }
}

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

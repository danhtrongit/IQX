/**
 * Bố cục các khung của biểu đồ Flashback (spec v2 §6.4).
 *
 * Mỗi khung có DẢI ĐẦU riêng cho dòng chú giải; đường vẽ nằm bên dưới dải này nên không bao giờ đè
 * lên chữ. Chiều cao phần vẽ cố định (chỉ báo riêng 130px, ô giá 300px, ô khối lượng 90px; điện
 * thoại 110, 240 và 70px). Thêm chỉ báo thì biểu đồ dài thêm và trang cuộn được, các khung không
 * bao giờ bị ép nhỏ lại.
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

export const PLOT_HEIGHT = {
  desktop: { price: 300, volume: 90, indicator: 130 },
  mobile: { price: 240, volume: 70, indicator: 110 },
} as const

export type PaneKind = "price" | "volume" | "indicator"

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
 */
export function chartLayout(input: {
  narrow: boolean
  overlayCount: number
  volumeCount: number
  /** Khoá của từng chỉ báo có ô riêng, theo thứ tự hiển thị. */
  indicatorKeys: readonly string[]
}): ChartLayout {
  const plot = input.narrow ? PLOT_HEIGHT.mobile : PLOT_HEIGHT.desktop
  const specs: { key: string; kind: PaneKind; legend: number; plot: number }[] = [
    {
      key: "p",
      kind: "price",
      legend: (input.narrow ? 2 : 1) * LEGEND_ROW + input.overlayCount * LEGEND_ROW + LEGEND_PAD,
      plot: plot.price,
    },
    { key: "v", kind: "volume", legend: (1 + input.volumeCount) * LEGEND_ROW, plot: plot.volume },
    ...input.indicatorKeys.map((key) => ({
      key: `i${key}`,
      kind: "indicator" as const,
      legend: LEGEND_ROW + LEGEND_PAD,
      plot: plot.indicator,
    })),
  ]
  const panes: PaneBox[] = []
  let top = CHART_TOP
  for (const spec of specs) {
    panes.push({
      key: spec.key,
      kind: spec.kind,
      legendTop: top,
      legendHeight: spec.legend,
      top: top + spec.legend,
      height: spec.plot,
    })
    top += spec.legend + spec.plot + PANE_GAP
  }
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

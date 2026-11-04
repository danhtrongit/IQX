/**
 * Bố cục các khung của biểu đồ Flashback (spec v2.3 §2, thay v2 §6.4 "Chiều cao khung" và v2.1 §8).
 *
 * Chú giải nổi đè lên góc trên bên trái của từng khung (v2.3 §1) nên KHÔNG chiếm dòng nào: phần vẽ dùng
 * hết chiều cao khung. Ô khối lượng và mỗi ô chỉ báo riêng cao cố định; ô giá lấy phần còn lại của màn
 * hình nhưng không bao giờ dưới 320px (điện thoại 240px). Thêm ô chỉ báo khi ô giá đã ở mức tối thiểu thì
 * biểu đồ dài thêm xuống dưới, trang cuộn. Thêm, xoá, ẩn chỉ báo trên ô giá không đổi chiều cao ô nào.
 */

/** Chiều cao một dòng chú giải; đủ chỗ cho nút ẩn, cài đặt, xóa cỡ 24px. */
export const LEGEND_ROW = 24
export const PANE_GAP = 10
export const CHART_TOP = 4
/** Chỗ cho nhãn trục ngang ở đáy (v2.3 §2). */
export const AXIS_HEIGHT = 22
/** Dưới độ rộng này biểu đồ dùng bố cục điện thoại. */
export const NARROW_WIDTH = 600
/** Từ độ rộng cửa sổ này trở xuống trang dùng bố cục điện thoại. */
export const PAGE_NARROW_WIDTH = 900

/** Chiều cao các ô (v2.3 §2): giá tối thiểu, khối lượng và ô chỉ báo riêng cố định. */
export const PANE_HEIGHT = {
  desktop: { priceMin: 320, volume: 80, indicator: 100 },
  mobile: { priceMin: 240, volume: 64, indicator: 84 },
} as const

export type PaneKind = "price" | "volume" | "indicator"

export type PaneBox = {
  key: string
  kind: PaneKind
  /** Đỉnh khối chú giải (trùng đỉnh khung: chú giải đè lên phần vẽ). */
  legendTop: number
  /** Chiều cao khối chú giải theo số dòng; không trừ vào phần vẽ. */
  legendHeight: number
  /** Đỉnh và chiều cao phần vẽ (cả khung). */
  top: number
  height: number
}

export type ChartLayout = {
  panes: PaneBox[]
  /** Tổng chiều cao của biểu đồ, gồm nhãn trục ngang. */
  height: number
}

/**
 * Chiều cao ô giá (v2.3 §2): điện thoại 240px; máy tính lớn hơn của 320px và phần màn hình còn lại sau
 * khi trừ khối lượng, các ô chỉ báo, khoảng cách và trục thời gian. Chưa đo được màn hình thì 320px.
 */
export function priceHeight(input: { mobile: boolean; available: number | null; indicatorCount: number }): number {
  const size = input.mobile ? PANE_HEIGHT.mobile : PANE_HEIGHT.desktop
  if (input.mobile || input.available === null || !Number.isFinite(input.available)) return size.priceMin
  const rest =
    input.available -
    CHART_TOP -
    AXIS_HEIGHT -
    size.volume -
    input.indicatorCount * size.indicator -
    PANE_GAP * (1 + input.indicatorCount)
  return Math.max(size.priceMin, Math.floor(rest))
}

/**
 * Dựng các khung theo thứ tự: giá, khối lượng, rồi từng chỉ báo có ô riêng. Khối chú giải của ô giá có
 * một dòng O/H/L/C (hai dòng trên điện thoại hẹp) cộng một dòng cho mỗi chỉ báo vẽ trên ô giá; của ô
 * khối lượng có một dòng cộng một dòng cho mỗi chỉ báo Khối lượng; ô chỉ báo riêng một dòng.
 */
export function chartLayout(input: {
  narrow: boolean
  /** Bố cục điện thoại (máy hẹp hoặc cửa sổ hẹp): chiều cao các ô theo cột điện thoại. */
  mobile: boolean
  overlayCount: number
  volumeCount: number
  /** Khoá của từng chỉ báo có ô riêng, theo thứ tự hiển thị. */
  indicatorKeys: readonly string[]
  /** Chiều cao màn hình còn trống cho biểu đồ (máy tính); null khi chưa đo. */
  available: number | null
}): ChartLayout {
  const size = input.mobile ? PANE_HEIGHT.mobile : PANE_HEIGHT.desktop
  const specs: { key: string; kind: PaneKind; legend: number; height: number }[] = [
    {
      key: "p",
      kind: "price",
      legend: ((input.narrow ? 2 : 1) + input.overlayCount) * LEGEND_ROW,
      height: priceHeight({ mobile: input.mobile, available: input.available, indicatorCount: input.indicatorKeys.length }),
    },
    { key: "v", kind: "volume", legend: (1 + input.volumeCount) * LEGEND_ROW, height: size.volume },
    ...input.indicatorKeys.map((key) => ({
      key: `i${key}`,
      kind: "indicator" as const,
      legend: LEGEND_ROW,
      height: size.indicator,
    })),
  ]

  const panes: PaneBox[] = []
  let top = CHART_TOP
  specs.forEach((spec) => {
    panes.push({ key: spec.key, kind: spec.kind, legendTop: top, legendHeight: spec.legend, top, height: spec.height })
    top += spec.height + PANE_GAP
  })
  return { panes, height: top - PANE_GAP + AXIS_HEIGHT }
}

/** Biên trên/dưới của trục giá (v2.3 §3): chừa 6% khoảng giá ở mỗi đầu. */
export const PRICE_PADDING = 0.06

/** Trục giá theo giá cao nhất và thấp nhất của các nến đang hiện; đường chỉ báo không kéo giãn trục. */
export function priceRange(bars: readonly { high: number; low: number }[], last: number): { low: number; high: number } {
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (let index = 0; index <= last && index < bars.length; index += 1) {
    low = Math.min(low, bars[index].low)
    high = Math.max(high, bars[index].high)
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { low: 0, high: 1 }
  const padding = (high - low) * PRICE_PADDING || high * 0.01 || 1
  return { low: low - padding, high: high + padding }
}

export type OffscaleLabel = { key: string; text: string; color: string; side: "above" | "below"; y: number }

/**
 * Nhãn mép phải cho đường dạng MA nằm ngoài khung ở phiên đang mở (v2.3 §3): "{tên} {giá trị} ↑/↓".
 * Nhãn phía trên xếp từ đỉnh khung xuống, phía dưới xếp từ đáy lên, cách nhau một dòng nên không đè nhau.
 */
export function offscaleLabels(
  lines: readonly { key: string; name: string; value: number | null; color: string }[],
  range: { low: number; high: number },
  pane: { top: number; height: number },
  format: (value: number) => string,
  rowHeight = 16,
): OffscaleLabel[] {
  const labels: OffscaleLabel[] = []
  let above = 0
  let below = 0
  for (const line of lines) {
    if (line.value == null || !Number.isFinite(line.value)) continue
    if (line.value > range.high) {
      labels.push({ key: line.key, text: `${line.name} ${format(line.value)} ↑`, color: line.color, side: "above", y: pane.top + rowHeight * (above + 0.5) })
      above += 1
    } else if (line.value < range.low) {
      labels.push({ key: line.key, text: `${line.name} ${format(line.value)} ↓`, color: line.color, side: "below", y: pane.top + pane.height - rowHeight * (below + 0.5) })
      below += 1
    }
  }
  return labels
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

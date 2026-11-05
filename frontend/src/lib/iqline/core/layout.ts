/**
 * Bố cục các ô của biểu đồ (chuyển từ `flashback-chart-layout.ts`, spec Flashback v2.3 §2).
 *
 * Chú giải nổi đè lên góc trên bên trái của từng ô (v2.3 §1) nên KHÔNG chiếm dòng nào: phần vẽ dùng
 * hết chiều cao ô. Ô khối lượng và mỗi ô chỉ báo riêng cao cố định; ô giá lấy phần còn lại của màn
 * hình nhưng không bao giờ dưới mức tối thiểu (320px, điện thoại 240px). Thêm ô chỉ báo khi ô giá đã ở mức
 * tối thiểu thì biểu đồ dài thêm xuống dưới, trang cuộn. Thêm, xoá, ẩn chỉ báo trên ô giá không đổi chiều
 * cao ô nào. `market` điền đầy khung chứa bằng `priceMin` nhỏ hơn và cho kéo đổi chiều cao ô (`paneHeights`).
 */
import type { PaneKind } from "../types"

export type { PaneKind }

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
/** Ô nào cũng không thấp hơn mức này khi kéo đổi chiều cao. */
export const MIN_PANE_HEIGHT = 48

/** Chiều cao các ô (v2.3 §2): giá tối thiểu, khối lượng và ô chỉ báo riêng cố định. */
export const PANE_HEIGHT = {
  desktop: { priceMin: 320, volume: 80, indicator: 100 },
  mobile: { priceMin: 240, volume: 64, indicator: 84 },
} as const

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
export function priceHeight(input: {
  mobile: boolean
  available: number | null
  indicatorCount: number
  /** Chiều cao thật của ô khối lượng và các ô chỉ báo khi đã kéo đổi; mặc định theo `PANE_HEIGHT`. */
  fixed?: { volume: number; indicators: number }
  /** Ô giá tối thiểu; mặc định theo `PANE_HEIGHT`. */
  priceMin?: number
  /** Điền đầy `available` kể cả trên điện thoại (`market`: khung chứa có chiều cao cố định, không cuộn). */
  fill?: boolean
}): number {
  const size = input.mobile ? PANE_HEIGHT.mobile : PANE_HEIGHT.desktop
  const priceMin = input.priceMin ?? size.priceMin
  if ((input.mobile && !input.fill) || input.available === null || !Number.isFinite(input.available)) return priceMin
  const volume = input.fixed?.volume ?? size.volume
  const indicators = input.fixed?.indicators ?? input.indicatorCount * size.indicator
  const rest = input.available - CHART_TOP - AXIS_HEIGHT - volume - indicators - PANE_GAP * (1 + input.indicatorCount)
  return Math.max(priceMin, Math.floor(rest))
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
  /** Chiều cao ô đã kéo đổi, theo khoá ô (`v` là khối lượng, `i{khoá}` là ô chỉ báo). */
  paneHeights?: Readonly<Record<string, number>>
  /** Ô giá tối thiểu; `market` đặt nhỏ để vừa khung chứa. */
  priceMin?: number
  /** Điền đầy `available` kể cả trên điện thoại (`market`). */
  fill?: boolean
}): ChartLayout {
  const size = input.mobile ? PANE_HEIGHT.mobile : PANE_HEIGHT.desktop
  const override = (key: string, fallback: number) => {
    const value = input.paneHeights?.[key]
    return value !== undefined && Number.isFinite(value) ? Math.max(MIN_PANE_HEIGHT, Math.round(value)) : fallback
  }
  const volumeHeight = override("v", size.volume)
  const indicatorHeights = input.indicatorKeys.map((key) => override(`i${key}`, size.indicator))
  const specs: { key: string; kind: PaneKind; legend: number; height: number }[] = [
    {
      key: "p",
      kind: "price",
      legend: ((input.narrow ? 2 : 1) + input.overlayCount) * LEGEND_ROW,
      height: priceHeight({
        mobile: input.mobile,
        available: input.available,
        indicatorCount: input.indicatorKeys.length,
        fixed: { volume: volumeHeight, indicators: indicatorHeights.reduce((sum, height) => sum + height, 0) },
        priceMin: input.priceMin,
        fill: input.fill,
      }),
    },
    { key: "v", kind: "volume", legend: (1 + input.volumeCount) * LEGEND_ROW, height: volumeHeight },
    ...input.indicatorKeys.map((key, index) => ({
      key: `i${key}`,
      kind: "indicator" as const,
      legend: LEGEND_ROW,
      height: indicatorHeights[index],
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

/** Đường ngăn giữa ô `index - 1` và ô `index`: chính giữa khoảng cách. */
export function boundaryY(layout: ChartLayout, index: number): number {
  return layout.panes[index].top - PANE_GAP / 2
}

/** Đường ngăn nào nằm gần `y` trong `tolerance` pixel (để kéo đổi chiều cao ô); trả về chỉ số ô bên dưới đường ngăn. */
export function findPaneBoundary(layout: ChartLayout, y: number, tolerance = 5): number | null {
  for (let index = 1; index < layout.panes.length; index += 1) {
    if (Math.abs(y - boundaryY(layout, index)) <= tolerance) return index
  }
  return null
}

/**
 * Kéo đường ngăn trên ô `boundary` đi `dy` pixel (dương là xuống). Ô giá là ô co giãn nên khi kéo đường ngăn
 * giữa giá và khối lượng thì ô khối lượng đổi chiều cao còn ô giá nhận phần còn lại; các đường ngăn khác đổi
 * chiều cao ô phía trên và ô phía dưới theo chiều ngược nhau. Trả về `paneHeights` mới (mọi ô không phải giá).
 */
export function resizePanes(layout: ChartLayout, boundary: number, dy: number): Record<string, number> {
  const heights: Record<string, number> = {}
  for (const pane of layout.panes) if (pane.kind !== "price") heights[pane.key] = pane.height
  const upper = layout.panes[boundary - 1]
  const lower = layout.panes[boundary]
  if (!upper || !lower) return heights
  if (upper.kind === "price") {
    heights[lower.key] = Math.max(MIN_PANE_HEIGHT, lower.height - dy)
  } else {
    const shift = Math.max(MIN_PANE_HEIGHT - upper.height, Math.min(lower.height - MIN_PANE_HEIGHT, dy))
    heights[upper.key] = upper.height + shift
    heights[lower.key] = lower.height - shift
  }
  return heights
}

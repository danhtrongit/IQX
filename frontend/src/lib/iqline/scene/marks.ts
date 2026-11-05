/**
 * Đánh dấu trên ô giá: tin AI theo sắc thái (`market`, neo theo `time`) và điểm đặt lệnh (`flashback`, neo
 * theo phiên). Thư viện chỉ vẽ điểm; popover tin do trang xử lý khi nhận sự kiện bấm.
 */
import type { ColorToken, Scene } from "../types"
import { DOWN_TOKEN, UP_TOKEN } from "./colors"
import { textCommand, type PaneDraw } from "./draw"
import type { ChartFrame } from "./model"

export const MARK_RADIUS = 7
const MARK_STEP = 16
const MARK_BOTTOM_GAP = 12

export type MarkPosition = { id: string | number; x: number; y: number; radius: number; index: number; token: ColorToken; label: string }

/** Vị trí (CSS pixel) của các dấu tin đang thấy, để vẽ và để trang bắt sự kiện bấm. Nhiều tin cùng một nến xếp chồng lên. */
export function markPositions(frame: ChartFrame): MarkPosition[] {
  const { data } = frame
  if (data.timeScale.kind !== "market" || data.marks.length === 0 || !frame.visible) return []
  const pane = frame.price
  const stacks = new Map<number, number>()
  const out: MarkPosition[] = []
  for (const mark of data.marks) {
    const exact = data.timeScale.indexOfAnchor({ time: mark.time, price: 0 })
    if (exact === null) continue
    const index = Math.round(exact)
    if (index < frame.visible.first || index > frame.visible.last) continue
    const level = stacks.get(index) ?? 0
    stacks.set(index, level + 1)
    out.push({
      id: mark.id,
      x: pane.coords.xOfIndex(index),
      y: pane.box.top + pane.box.height - MARK_BOTTOM_GAP - MARK_RADIUS - level * MARK_STEP,
      radius: MARK_RADIUS,
      index,
      token: mark.token,
      label: mark.label,
    })
  }
  return out
}

export function drawMarks(scene: Scene, frame: ChartFrame, d: PaneDraw): void {
  for (const mark of markPositions(frame)) {
    scene.push({ op: "circle", token: mark.token, x: mark.x * d.dpr, y: mark.y * d.dpr, radius: mark.radius * d.dpr, fill: true })
    if (mark.label) scene.push(textCommand("background", mark.label.slice(0, 2), mark.x * d.dpr, (mark.y + 3.5) * d.dpr, "center", d.dpr, { size: 10, weight: 600, tabular: false }))
  }
}

/** Mua: tam giác lên dưới đáy nến; bán: tam giác xuống trên đỉnh nến; đóng: vòng tròn tại giá. */
export function drawSessionMarkers(scene: Scene, frame: ChartFrame, d: PaneDraw): void {
  const { data } = frame
  const dpr = d.dpr
  for (const marker of data.markers) {
    const index = Math.round(marker.session)
    if (index < d.first || index > d.last) continue
    const bar = data.raw[index]
    const x = d.xOf(index)
    if (marker.side === "buy") {
      const y = d.yOf(bar.low) + 6 * dpr
      scene.push({ op: "polygon", token: UP_TOKEN, alpha: 1, data: Float64Array.of(x, y, x + 6 * dpr, y + 10 * dpr, x - 6 * dpr, y + 10 * dpr), count: 6 })
    } else if (marker.side === "sell") {
      const y = d.yOf(bar.high) - 6 * dpr
      scene.push({ op: "polygon", token: DOWN_TOKEN, alpha: 1, data: Float64Array.of(x, y, x + 6 * dpr, y - 10 * dpr, x - 6 * dpr, y - 10 * dpr), count: 6 })
    } else {
      scene.push({ op: "circle", token: "foreground", x, y: d.yOf(marker.price ?? bar.close), radius: 4 * dpr, fill: false, width: 2 * dpr })
    }
  }
}

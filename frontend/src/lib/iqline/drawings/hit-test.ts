/**
 * Chọn hình và bắt tay nắm bằng chuột hoặc ngón tay (chuyển từ flashback-drawings.ts, mở rộng cho 14 công cụ).
 * Toạ độ là CSS pixel của canvas; hình ẩn hoặc chưa đủ điểm neo không bao giờ được chọn.
 */
import type { Drawing, PaneCoords } from "../types"
import { FIB_EXTENSION_LEVELS, FIB_RETRACEMENT_LEVELS, fibExtensionPrice, fibRetracementPrice } from "./fib"
import { isRenderable } from "./commands"
import { advancedDistance } from "./tools-advanced"
import { basicDistance, basicHandlePoints, isBasicTool } from "./tools-basic"
import {
  distanceToLine,
  distanceToRay,
  distanceToRect,
  distanceToSegment,
  resolveAnchors,
  type ScreenAnchor,
  type ScreenPoint,
} from "./geometry"

/** Sai số khi chọn hình bằng chuột hoặc ngón tay, tính bằng pixel. */
export const HIT_TOLERANCE = 7
/** Bán kính bắt tay nắm. */
export const HANDLE_RADIUS = 9

function minDistanceToPolyline(point: ScreenPoint, points: readonly ScreenPoint[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(point, points[i - 1], points[i]))
  return best
}

function distanceToLevels(point: ScreenPoint, left: number, right: number, ys: readonly number[]): number {
  if (point.x < left - 4 || point.x > right) return Infinity
  let best = Infinity
  for (const y of ys) best = Math.min(best, Math.abs(point.y - y))
  return best
}

function distanceToPoints(drawing: Drawing, points: readonly ScreenAnchor[], point: ScreenPoint, coords: PaneCoords): number {
  const { plot } = coords
  // Đợt 1 (tools-basic.ts); type guard thu hẹp `drawing.tool` cho `switch` bên dưới.
  if (isBasicTool(drawing.tool)) return basicDistance(drawing.tool, drawing, points, point, coords)
  const [p0, p1, p2] = points
  switch (drawing.tool) {
    case "trend":
      return distanceToSegment(point, p0, p1)
    case "ray":
      return distanceToRay(point, p0, p1)
    case "extended":
      return distanceToLine(point, p0, p1)
    case "horizontal":
      return point.x < plot.left || point.x > plot.right ? Infinity : Math.abs(point.y - p0.y)
    case "horizontal-ray":
      return point.x < p0.x - 4 || point.x > plot.right ? Infinity : Math.abs(point.y - p0.y)
    case "vertical":
      return point.y < plot.top || point.y > plot.bottom ? Infinity : Math.abs(point.x - p0.x)
    case "channel": {
      const main = distanceToSegment(point, p0, p1)
      const run = p1.x - p0.x
      const shift: ScreenPoint = run === 0 ? { x: p2.x - p0.x, y: 0 } : { x: 0, y: p2.y - (p0.y + ((p2.x - p0.x) * (p1.y - p0.y)) / run) }
      const second = distanceToSegment(point, { x: p0.x + shift.x, y: p0.y + shift.y }, { x: p1.x + shift.x, y: p1.y + shift.y })
      return Math.min(main, second)
    }
    case "fib-retracement": {
      const left = Math.min(p0.x, p1.x)
      const ys = FIB_RETRACEMENT_LEVELS.map(({ level }) => coords.yOfPrice(fibRetracementPrice(p0.price, p1.price, level)))
      return Math.min(distanceToSegment(point, p0, p1), distanceToLevels(point, left, plot.right, ys))
    }
    case "fib-extension": {
      const left = Math.min(p1.x, p2.x)
      const ys = FIB_EXTENSION_LEVELS.map(({ level }) => coords.yOfPrice(fibExtensionPrice(p0.price, p1.price, p2.price, level)))
      return Math.min(distanceToSegment(point, p0, p1), distanceToSegment(point, p1, p2), distanceToLevels(point, left, plot.right, ys))
    }
    case "rectangle":
      return distanceToRect(point, p0, p1, drawing.style.fill === true)
    case "measure":
      return Math.min(distanceToSegment(point, p0, p1), distanceToRect(point, p0, p1, drawing.style.fill === true))
    case "elliott-5":
    case "elliott-abc":
      return minDistanceToPolyline(point, points)
    case "note":
      return Math.hypot(point.x - p0.x, point.y - p0.y)
    // Đợt 2: vùng bấm lấy từ chính các nét đã vẽ (tools-advanced.ts).
    case "fib-time-zones":
    case "fib-fan":
    case "fib-channel":
    case "pitchfork":
    case "gann-fan":
    case "gann-box":
    case "xabcd":
    case "head-shoulders":
    case "triangle-pattern":
      return advancedDistance(drawing.tool, points, drawing.style, point, coords)
  }
}

/** Khoảng cách từ một điểm tới hình (đường nét, các mức ngang, viền); Infinity nếu hình không đổi được toạ độ. */
export function distanceToDrawing(drawing: Drawing, point: ScreenPoint, coords: PaneCoords): number {
  if (!isRenderable({ tool: drawing.tool, anchors: drawing.anchors, hidden: false })) return Infinity
  const points = resolveAnchors(drawing.anchors, coords)
  return points ? distanceToPoints(drawing, points, point, coords) : Infinity
}

/** Hình gần điểm bấm nhất trong sai số; hình vẽ sau nằm trên hình vẽ trước khi cùng khoảng cách. Hình ẩn bị bỏ qua. */
export function hitDrawing(
  drawings: readonly Drawing[],
  point: ScreenPoint,
  coords: PaneCoords,
  tolerance: number = HIT_TOLERANCE,
): Drawing | null {
  let best: Drawing | null = null
  let bestDistance = tolerance
  for (const drawing of drawings) {
    if (drawing.hidden) continue
    const distance = distanceToDrawing(drawing, point, coords)
    if (distance <= bestDistance) {
      best = drawing
      bestDistance = distance
    }
  }
  return best
}

/** Chỉ số điểm neo của hình đang chọn nằm dưới điểm bấm (nếu có). Hình khoá không có tay nắm. */
export function hitHandle(
  drawing: Drawing | null | undefined,
  point: ScreenPoint,
  coords: PaneCoords,
  radius: number = HANDLE_RADIUS,
): number | null {
  if (!drawing || drawing.locked || !isRenderable({ tool: drawing.tool, anchors: drawing.anchors, hidden: false })) return null
  const resolved = resolveAnchors(drawing.anchors, coords)
  if (!resolved) return null
  // Vị thế và nét bút có tay nắm không trùng điểm neo (tools-basic.ts).
  const points: readonly ScreenPoint[] = (isBasicTool(drawing.tool) ? basicHandlePoints(drawing.tool, resolved) : null) ?? resolved
  let best: number | null = null
  let bestDistance = radius
  points.forEach((anchor, index) => {
    const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y)
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

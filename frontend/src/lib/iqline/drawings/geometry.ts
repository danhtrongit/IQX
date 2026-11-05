/** Hình học thuần trên toạ độ màn hình (CSS pixel). */
import type { Anchor, PaneCoords } from "../types"

export type ScreenPoint = { x: number; y: number }
export type Rect = { left: number; top: number; right: number; bottom: number }

/** Một điểm neo đã đổi sang màn hình, kèm chỉ số và giá để tính nhãn. */
export type ScreenAnchor = ScreenPoint & { index: number; price: number }

/** Khoảng cách từ một điểm tới đoạn thẳng. */
export function distanceToSegment(point: ScreenPoint, from: ScreenPoint, to: ScreenPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy))
}

/** Khoảng cách từ một điểm tới tia xuất phát từ `from` đi qua `to`. */
export function distanceToRay(point: ScreenPoint, from: ScreenPoint, to: ScreenPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y)
  const t = Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy))
}

/** Khoảng cách từ một điểm tới đường thẳng đi qua hai điểm. */
export function distanceToLine(point: ScreenPoint, from: ScreenPoint, to: ScreenPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return Math.hypot(point.x - from.x, point.y - from.y)
  return Math.abs((point.x - from.x) * dy - (point.y - from.y) * dx) / length
}

/** Khoảng cách từ một điểm tới viền hình chữ nhật; trong hình thì 0 khi `filled`. */
export function distanceToRect(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint, filled: boolean): number {
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
  if (inside && filled) return 0
  const corners: ScreenPoint[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]
  let best = Infinity
  for (let i = 0; i < 4; i++) best = Math.min(best, distanceToSegment(point, corners[i], corners[(i + 1) % 4]))
  return best
}

export type Extend = "none" | "forward" | "both"

/**
 * Cắt đường thẳng đi qua `p` và `q` theo khung `rect` (Liang-Barsky). `extend` cho biết đường dừng ở `p` và `q`
 * (`none`), kéo dài qua `q` (`forward`, tia) hay kéo dài hai phía (`both`). Trả về null khi không còn đoạn nào trong khung.
 */
export function clipLine(p: ScreenPoint, q: ScreenPoint, rect: Rect, extend: Extend): [number, number, number, number] | null {
  const dx = q.x - p.x
  const dy = q.y - p.y
  if (dx === 0 && dy === 0) return null
  let t0 = extend === "both" ? -Infinity : 0
  let t1 = extend === "none" ? 1 : Infinity
  const checks: [number, number][] = [
    [-dx, p.x - rect.left],
    [dx, rect.right - p.x],
    [-dy, p.y - rect.top],
    [dy, rect.bottom - p.y],
  ]
  for (const [pk, qk] of checks) {
    if (pk === 0) {
      if (qk < 0) return null
      continue
    }
    const r = qk / pk
    if (pk < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  if (t0 > t1) return null
  return [p.x + t0 * dx, p.y + t0 * dy, p.x + t1 * dx, p.y + t1 * dy]
}

/**
 * Đổi các điểm neo sang màn hình. Trả về null nếu có điểm không đổi được (khác loại với chế độ hiện tại,
 * hoặc chưa tính được chỉ số), khi đó hình không được vẽ và không được chọn.
 */
export function resolveAnchors(anchors: readonly Anchor[], coords: PaneCoords): ScreenAnchor[] | null {
  const out: ScreenAnchor[] = []
  for (const anchor of anchors) {
    const index = coords.indexOfAnchor(anchor)
    if (index === null || !Number.isFinite(index) || !Number.isFinite(anchor.price)) return null
    out.push({ x: coords.xOfIndex(index), y: coords.yOfPrice(anchor.price), index, price: anchor.price })
  }
  return out
}

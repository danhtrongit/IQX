/**
 * Đổi điểm bấm thành điểm neo, hút vào OHLC, kéo tay nắm và kéo cả hình.
 * Điểm neo luôn là khoá ổn định (`time` ở market, `session` ở flashback) do `coords.anchorAt` tạo ra; chỉ số chỉ tồn tại
 * trong lúc tính. Nhờ vậy nạp thêm lịch sử hay đổi khung không làm lệch hình (docs/iqline-design.md §4).
 */
import type { Anchor, Bar, Drawing, PaneCoords } from "../types"
import type { ScreenPoint } from "./geometry"
import { isBasicTool, moveBasicHandle } from "./tools-basic"

/** Khoảng cách dọc tối đa (pixel) để hút vào một giá O, H, L hoặc C. */
export const SNAP_TOLERANCE = 12

export type IndexRange = { min: number; max: number }
/**
 * Nam châm: tắt, yếu (chỉ hút khi con trỏ trong ngưỡng, như trước) hoặc mạnh (luôn hút về giá O, H, L, C gần nhất của nến gần nhất,
 * không cần trong ngưỡng).
 */
export type MagnetMode = "off" | "weak" | "strong"

/**
 * Đọc trạng thái nam châm từ bất kỳ nguồn nào, kể cả layout cũ lưu kiểu boolean: `true` thành yếu, `false` và giá trị lạ thành tắt.
 */
export function normalizeMagnet(value: unknown): MagnetMode {
  if (value === "strong") return "strong"
  if (value === "weak" || value === true) return "weak"
  return "off"
}

/**
 * `bars[i]` là nến ở chỉ số `i` của trục (Flashback: đã bỏ warmup, phiên 0 là nến đầu tiên được hiện).
 *
 * `readable` là dải chỉ số nến được hút vào (gồm hai đầu); bỏ trống là mọi nến trong `bars`. Flashback đặt đúng dải nến đã mở
 * (`InteractionConfig.readable`), nên dù mảng `bars` có thừa nến thì nam châm cũng không bao giờ hút vào nến chưa mở (§12).
 * `clampOutside` (mặc định true, như `market`): con trỏ ở ngoài vùng có nến thì nam châm Mạnh hút về nến gần nhất ở hai đầu.
 * Đặt false (Flashback) thì ngoài vùng nến đã mở nam châm không làm gì, điểm vẽ giữ đúng chỗ con trỏ: ô tương lai chưa có nến nào để hút,
 * và hút về nến cuối sẽ chặn người chơi kéo hình sang phải.
 */
export type SnapOptions = {
  bars: ArrayLike<Bar>
  tolerance?: number
  /** Bỏ trống là yếu. */
  strength?: "weak" | "strong"
  readable?: { first: number; last: number } | null
  clampOutside?: boolean
}
export type AnchorOptions = {
  snap?: SnapOptions
  /** Giới hạn chỉ số của điểm neo (Flashback: từ warmup tới ô cuối của trục). Market không giới hạn. */
  indexRange?: IndexRange
}

export type SnapResult = { index: number; price: number; field: "open" | "high" | "low" | "close" }

/**
 * Hút điểm bấm vào giá O, H, L hoặc C gần nhất của nến dưới con trỏ. Trả về null khi con trỏ ngoài vùng có nến
 * hoặc giá gần nhất xa hơn `tolerance` pixel.
 */
export function snapToOhlc(
  point: ScreenPoint,
  coords: PaneCoords,
  bars: ArrayLike<Bar>,
  tolerance: number = SNAP_TOLERANCE,
  strength: "weak" | "strong" = "weak",
  range: Pick<SnapOptions, "readable" | "clampOutside"> = {},
): SnapResult | null {
  // Chỉ số nến được phép hút: trong `bars` và trong dải đọc được (nếu có), không bao giờ quá nến cuối đã mở.
  const first = Math.max(0, range.readable?.first ?? 0)
  const last = Math.min(bars.length - 1, range.readable?.last ?? bars.length - 1)
  if (last < first) return null
  const raw = coords.indexOfX(point.x)
  if (!Number.isFinite(raw)) return null
  const strong = strength === "strong"
  const rounded = Math.round(raw)
  // Mạnh: nến gần nhất (kể cả khi con trỏ ở ngoài vùng có nến) và giá gần nhất, không cần trong ngưỡng.
  const index = strong && range.clampOutside !== false ? Math.min(last, Math.max(first, rounded)) : rounded
  if (index < first || index > last) return null
  const bar = bars[index]
  let best: SnapResult | null = null
  let bestDistance = strong ? Infinity : tolerance
  for (const field of ["open", "high", "low", "close"] as const) {
    const price = bar[field]
    if (!Number.isFinite(price)) continue
    const distance = Math.abs(coords.yOfPrice(price) - point.y)
    if (distance <= bestDistance) {
      best = { index, price, field }
      bestDistance = distance
    }
  }
  return best
}

function clampIndex(index: number, range: IndexRange | undefined): number {
  return range ? Math.max(range.min, Math.min(range.max, index)) : index
}

/** Điểm neo tại điểm bấm, đúng loại theo chế độ hiện tại. */
export function anchorFromPoint(point: ScreenPoint, coords: PaneCoords, options: AnchorOptions = {}): Anchor {
  let index = coords.indexOfX(point.x)
  let price = coords.priceOfY(point.y)
  const snapped = options.snap ? snapToOhlc(point, coords, options.snap.bars, options.snap.tolerance, options.snap.strength, options.snap) : null
  if (snapped) {
    index = snapped.index
    price = snapped.price
  }
  return coords.anchorAt(clampIndex(index, options.indexRange), price)
}

/** Kéo một tay nắm tới điểm mới; các điểm neo còn lại giữ nguyên khoá gốc, không bị làm tròn qua chỉ số. */
export function moveHandle(drawing: Drawing, handle: number, point: ScreenPoint, coords: PaneCoords, options: AnchorOptions = {}): Drawing {
  // Vị thế và nét bút có cách kéo riêng (tools-basic.ts); các công cụ đợt 1 còn lại dùng cách chung bên dưới.
  if (isBasicTool(drawing.tool)) {
    const moved = moveBasicHandle(drawing.tool, drawing, handle, point, anchorFromPoint(point, coords, options), coords)
    if (moved) return moved
  }
  if (!Number.isInteger(handle) || handle < 0 || handle >= drawing.anchors.length) return drawing
  const anchors = drawing.anchors.map((anchor, index) => (index === handle ? anchorFromPoint(point, coords, options) : anchor))
  return { ...drawing, anchors }
}

/**
 * Dịch cả hình đi (dx, dy) pixel theo toạ độ màn hình, nên đúng với cả thang log và phần trăm. Nếu có `indexRange`,
 * cả hình dừng lại khi một điểm chạm biên (hình không bị méo). Điểm neo không đổi được chỉ số thì giữ nguyên.
 */
export function translateDrawing(drawing: Drawing, dx: number, dy: number, coords: PaneCoords, indexRange?: IndexRange): Drawing {
  const moved = drawing.anchors.map((anchor) => {
    const index = coords.indexOfAnchor(anchor)
    if (index === null) return { anchor, index: null, price: anchor.price }
    return { anchor, index: coords.indexOfX(coords.xOfIndex(index) + dx), price: coords.priceOfY(coords.yOfPrice(anchor.price) + dy) }
  })
  let correction = 0
  if (indexRange) {
    const indices = moved.flatMap((entry) => (entry.index === null ? [] : [entry.index]))
    if (indices.length > 0) {
      const low = Math.min(...indices)
      const high = Math.max(...indices)
      if (low < indexRange.min) correction = indexRange.min - low
      else if (high > indexRange.max) correction = indexRange.max - high
    }
  }
  const anchors = moved.map((entry) => (entry.index === null ? entry.anchor : coords.anchorAt(entry.index + correction, entry.price)))
  return { ...drawing, anchors }
}

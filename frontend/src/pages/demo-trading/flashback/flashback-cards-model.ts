/**
 * Thẻ nến trong ván Flashback (Candle Dojo spec v1.2 §9, v1.3 §5): phần thuần, không React, không DOM.
 *
 * Client không bao giờ tự nhận diện mẫu nến. Server chỉ trả những thẻ mình sở hữu và đã gặp (`snapshot.cards`, và `card` của phản hồi
 * "Phiên tiếp"); file này chỉ đổi dữ liệu đó thành thứ để vẽ:
 * - danh sách thẻ đã gặp theo thứ tự gặp (cũ nhất bên trái);
 * - khung bao đúng các nến của mẫu (§9.2) và nhãn tên (3 thẻ gần nhất, thẻ cũ hơn thu thành chấm);
 * - vị trí thẻ bật lên cạnh mẫu nến và vectơ bay vào khay (§9.3).
 *
 * Phiên k của ván là nến `viewBars - 1 + k` của danh sách nến đã hiện (cùng phép với dấu mua bán): thẻ có `playIdx = k` kết thúc ở nến đó
 * và gồm `n` nến liền trước, kể cả nến cuối.
 */
import { cdCard, type CdTier } from "@/lib/candle-dojo/cards"

import { CD_TIER_PALETTE } from "../candle-dojo/candle-card-style"

/** Một thẻ đã gặp trong ván. */
export type MetCard = {
  cardId: string
  /** Số nến của mẫu. */
  n: number
  /** Phiên (1, 2, ...) mà việc mở nến hoàn tất mẫu. */
  playIdx: number
}

/** Dạng của server (`snapshot.cards`). */
export type SnapshotCard = { card_id: string; card_n: number; play_idx: number }

/** Thẻ đã gặp theo thứ tự gặp. Bỏ thẻ không có trong danh mục, phiên không hợp lệ hoặc trùng phiên (mỗi phiên tối đa một thẻ). */
export function metCardsOf(raw: readonly SnapshotCard[] | null | undefined): MetCard[] {
  const byIdx = new Map<number, MetCard>()
  for (const item of raw ?? []) {
    if (!Number.isInteger(item.play_idx) || item.play_idx < 1) continue
    if (!Number.isInteger(item.card_n) || item.card_n < 1) continue
    if (!cdCard(item.card_id)) continue
    byIdx.set(item.play_idx, { cardId: item.card_id, n: item.card_n, playIdx: item.play_idx })
  }
  return [...byIdx.values()].sort((a, b) => a.playIdx - b.playIdx)
}

/** Thêm thẻ vừa gặp (phản hồi "Phiên tiếp") vào danh sách của ảnh chụp ván. Trùng phiên thì thay, không nhân đôi. */
export function appendSnapshotCard(
  cards: readonly SnapshotCard[] | null | undefined,
  shown: { id: string; n: number },
  playIdx: number,
): SnapshotCard[] {
  const rest = (cards ?? []).filter((item) => item.play_idx !== playIdx)
  return [...rest, { card_id: shown.id, card_n: shown.n, play_idx: playIdx }].sort((a, b) => a.play_idx - b.play_idx)
}

// ------------------------------------------------------------------ màu bậc

/** Màu chữ nhãn tên trên nền tối, sáng hơn màu khung của bậc (bản mẫu `TCL`). */
export const TIER_LABEL_COLOR: Readonly<Record<CdTier, string>> = {
  1: "#7fb2ff",
  2: "#bf9bff",
  3: "#f58ac8",
  4: "#f6c84a",
  5: "#ff8a80",
}

/** Màu nền tối của nhãn tên (bản mẫu `#0b1119`), giữ nguyên ở giao diện sáng để chữ màu bậc sáng vẫn đọc được. */
export const LABEL_BACKGROUND = "#0b1119"

/** Độ đậm nền khung: thường, và khi đang nhấn mạnh (thẻ vừa bật lên hoặc vừa bấm trong khay). */
export const BOX_FILL_ALPHA = { normal: 0.16, focus: 0.32 } as const
/** Độ dày viền khung (px): thường, và khi nhấn mạnh. */
export const BOX_BORDER = { normal: 1.4, focus: 2.4 } as const

/** Màu `#rrggbb` với độ trong suốt `alpha` (0..1) dưới dạng `rgba()`. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "")
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red},${green},${blue},${alpha})`
}

/** Màu khung (c1) của bậc thẻ. */
export const tierColor = (tier: CdTier): string => CD_TIER_PALETTE[tier].c1

// ------------------------------------------------------------------ khung trên biểu đồ

/** Chừa quanh các nến của mẫu (§9.2). */
export const BOX_PAD = 5

/** Phép đổi toạ độ của biểu đồ (CSS px trong khung chứa biểu đồ). Cả hai biểu đồ (IQLine và SVG cũ) đưa vào cùng một dạng. */
export type CardProjection = {
  /** Tâm của nến theo chỉ số nến đã hiện (0 là nến xem đầu tiên). */
  xOfIndex: (index: number) => number
  yOfPrice: (price: number) => number
  /** Bề rộng một nến (px). */
  barPx: number
  /** Khung giá: khung và nhãn không bao giờ ra ngoài đây. */
  plot: { left: number; top: number; right: number; bottom: number }
}

export type CardBar = { high: number; low: number }

/** Dải nến (chỉ số trong danh sách nến đã hiện) của mẫu; null nếu nến cuối của mẫu chưa có trong danh sách. */
export function cardRange(card: MetCard, viewBars: number, barCount: number): { first: number; last: number } | null {
  const last = viewBars - 1 + card.playIdx
  if (last < 0 || last >= barCount) return null
  return { first: Math.max(0, last - card.n + 1), last }
}

export type CardBox = {
  playIdx: number
  cardId: string
  tier: CdTier
  name: string
  first: number
  last: number
  left: number
  right: number
  top: number
  bottom: number
  /** Tâm ngang của phần khung còn trong khung giá: nhãn và chấm căn theo đây. */
  centerX: number
}

/**
 * Khung bao đúng các nến của mẫu: từ nến đầu tới nến cuối, cao từ đỉnh cao nhất tới đáy thấp nhất, chừa `BOX_PAD`.
 * Null khi thẻ lạ, nến chưa có, hoặc khung nằm hẳn ngoài khung giá (đã zoom hoặc kéo đi nơi khác).
 */
export function cardBox(card: MetCard, bars: readonly CardBar[], viewBars: number, projection: CardProjection): CardBox | null {
  const def = cdCard(card.cardId)
  const range = cardRange(card, viewBars, bars.length)
  if (!def || !range) return null
  let high = Number.NEGATIVE_INFINITY
  let low = Number.POSITIVE_INFINITY
  for (let index = range.first; index <= range.last; index += 1) {
    high = Math.max(high, bars[index].high)
    low = Math.min(low, bars[index].low)
  }
  const half = projection.barPx / 2
  const left = projection.xOfIndex(range.first) - half
  const right = projection.xOfIndex(range.last) + half
  const top = projection.yOfPrice(high) - BOX_PAD
  const bottom = projection.yOfPrice(low) + BOX_PAD
  const { plot } = projection
  if (![left, right, top, bottom].every(Number.isFinite)) return null
  if (right < plot.left || left > plot.right || bottom < plot.top || top > plot.bottom) return null
  const visibleLeft = Math.max(left, plot.left)
  const visibleRight = Math.min(right, plot.right)
  return {
    playIdx: card.playIdx,
    cardId: card.cardId,
    tier: def.tier,
    name: def.name,
    first: range.first,
    last: range.last,
    left,
    right,
    top,
    bottom,
    centerX: (visibleLeft + visibleRight) / 2,
  }
}

// ------------------------------------------------------------------ nhãn tên

/** Số thẻ gặp gần nhất có nhãn tên; thẻ cũ hơn thu thành chấm tròn. */
export const RECENT_LABELS = 3
export const LABEL_HEIGHT = 20
/** Chừa giữa đáy nhãn và đỉnh khung khi chưa bị đẩy lên. */
const LABEL_LIFT = 6
/** Khoảng cách dọc tối thiểu giữa hai nhãn chồng nhau theo chiều ngang. */
const LABEL_SPACING = 2
/** Mỗi lần đẩy lên, nhãn lên thêm chiều cao của nó cộng chừng này. */
const LABEL_STEP_GAP = 3
const MAX_LIFTS = 6
const DOT_RADIUS = 4
const DOT_LIFT = 7
const EDGE = 2

export type LabelPlacement =
  | {
      kind: "pill"
      playIdx: number
      tier: CdTier
      text: string
      x: number
      y: number
      width: number
      height: number
      /** Vạch mảnh nối nhãn xuống khung; null khi nhãn đã sát khung. */
      connector: { x: number; top: number; bottom: number } | null
    }
  | { kind: "dot"; playIdx: number; tier: CdTier; x: number; y: number; radius: number }

/** Bề rộng ước tính của nhãn theo số chữ (chữ đậm 11,5px, chấm màu bậc và hai lề). */
export function labelWidth(text: string): number {
  return Math.round(text.length * 6.8 + 26)
}

/**
 * Xếp nhãn cho các khung (đúng thứ tự gặp): 3 thẻ gần nhất có nhãn tên dạng viên thuốc ngay phía trên khung, nhãn sau chồng lên nhãn
 * trước thì đẩy lên trên; thẻ cũ hơn là chấm tròn ở đỉnh khung. Nhãn không ra ngoài khung giá.
 */
export function layoutLabels(boxes: readonly CardBox[], plot: CardProjection["plot"], recent: number = RECENT_LABELS): LabelPlacement[] {
  const result: LabelPlacement[] = []
  const placed: { x: number; y: number; width: number }[] = []
  const firstRecent = Math.max(0, boxes.length - recent)
  boxes.forEach((box, order) => {
    if (order < firstRecent) {
      result.push({ kind: "dot", playIdx: box.playIdx, tier: box.tier, x: box.centerX, y: Math.max(plot.top + DOT_RADIUS, box.top - DOT_LIFT), radius: DOT_RADIUS })
      return
    }
    const width = Math.min(labelWidth(box.name), Math.max(0, plot.right - plot.left - EDGE * 2))
    const maxX = Math.max(plot.left + EDGE, plot.right - width - EDGE)
    const x = Math.max(plot.left + EDGE, Math.min(maxX, box.centerX - width / 2))
    let y = box.top - LABEL_HEIGHT - LABEL_LIFT
    for (let lift = 0; lift < MAX_LIFTS && collides(placed, x, width, y); lift += 1) y -= LABEL_HEIGHT + LABEL_STEP_GAP
    y = Math.max(plot.top + EDGE, y)
    placed.push({ x, y, width })
    const connectorX = Math.max(x + 8, Math.min(x + width - 8, box.centerX))
    result.push({
      kind: "pill",
      playIdx: box.playIdx,
      tier: box.tier,
      text: box.name,
      x,
      y,
      width,
      height: LABEL_HEIGHT,
      connector: y + LABEL_HEIGHT < box.top - 1 ? { x: connectorX, top: y + LABEL_HEIGHT, bottom: box.top } : null,
    })
  })
  return result
}

function collides(placed: readonly { x: number; y: number; width: number }[], x: number, width: number, y: number): boolean {
  return placed.some((other) => !(x + width < other.x || x > other.x + other.width) && Math.abs(y - other.y) < LABEL_HEIGHT + LABEL_SPACING)
}

// ------------------------------------------------------------------ thẻ bật lên và bay vào khay

/** Bề rộng thẻ trong khay (§9.3). */
export const TRAY_CARD_WIDTH = 52
/**
 * Chiều cao khối "Thẻ trong ván": thẻ 52px cao 73px, chữ "Phiên N" và thanh cuộn ngang. Cố định kể cả khi chưa có thẻ để biểu đồ không
 * nhảy khi gặp thẻ đầu tiên; `use-chart-fit.ts` chừa đúng chiều cao này để màn chơi vẫn vừa một màn hình.
 */
export const CARDS_TRAY_HEIGHT = 100
/** Bề rộng thẻ bật lên: máy tính, điện thoại. */
export const POPUP_WIDTH = { desktop: 104, phone: 84 } as const
/** Dưới bề rộng cửa sổ này dùng thẻ bật lên cỡ điện thoại. */
export const POPUP_PHONE_BELOW = 600
/** Tỉ lệ thẻ 5:7. */
export const CARD_ASPECT = 7 / 5

/** Thời gian của ba bước (§9.3): lật ra, giữ nguyên, bay vào khay; và thời gian khung nhấn mạnh sau khi bấm thẻ trong khay. */
export const POP_MS = 400
export const HOLD_MS = 900
export const FLY_MS = 600
export const FOCUS_MS = 1600

export const popupWidthFor = (viewportWidth: number): number => (viewportWidth < POPUP_PHONE_BELOW ? POPUP_WIDTH.phone : POPUP_WIDTH.desktop)

export type Rect = { left: number; top: number; width: number; height: number }

const POPUP_MARGIN = 8
const POPUP_GAP = 14

/**
 * Chỗ đặt thẻ bật lên: ngay phía trên khung của mẫu, căn giữa; phía trên không đủ chỗ thì đặt phía dưới. Không bao giờ ra ngoài màn hình.
 * `target` là hình chữ nhật của khung theo toạ độ cửa sổ.
 */
export function placePopup(target: Rect, size: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number; below: boolean } {
  const maxLeft = Math.max(POPUP_MARGIN, viewport.width - size.width - POPUP_MARGIN)
  const left = Math.max(POPUP_MARGIN, Math.min(maxLeft, target.left + target.width / 2 - size.width / 2))
  let top = target.top - size.height - POPUP_GAP
  let below = false
  if (top < POPUP_MARGIN) {
    top = target.top + target.height + POPUP_GAP
    below = true
  }
  const maxTop = Math.max(POPUP_MARGIN, viewport.height - size.height - POPUP_MARGIN)
  return { left, top: Math.max(POPUP_MARGIN, Math.min(maxTop, top)), below }
}

/** Dịch chuyển và thu nhỏ để thẻ bật lên (`from`) rơi đúng lên ô của nó trong khay (`to`). Chưa đo được ô đích thì thu về cỡ khay. */
export function flightVector(from: Rect, to: Rect): { dx: number; dy: number; scale: number } {
  const scale = to.width > 0 && from.width > 0 ? to.width / from.width : from.width > 0 ? TRAY_CARD_WIDTH / from.width : 1
  return {
    dx: to.left + to.width / 2 - (from.left + from.width / 2),
    dy: to.top + to.height / 2 - (from.top + from.height / 2),
    scale,
  }
}

/** Người dùng bật giảm chuyển động. Không có `matchMedia` (jsdom, môi trường cũ) thì coi như không. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

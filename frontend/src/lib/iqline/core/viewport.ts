/**
 * Viewport theo chỉ số nến (docs/iqline-design.md §7): `{ from, to }`, có thể lẻ, `to` lớn hơn `from`.
 * Số nguyên là tâm nến nên một nến `i` chiếm `[i - 0.5, i + 0.5]`, và vừa khít `count` nến là
 * `{ from: -0.5, to: count - 0.5 }`. Mọi hàm thuần và trả viewport mới.
 */
import type { Viewport } from "../types"

/** Nến không rộng quá ngần này CSS pixel khi zoom gần nhất. */
export const MAX_BAR_PX = 40

export type ViewportLimits = {
  /** Biên trái và phải cho phép của viewport. */
  min: number
  max: number
  /** Số nến hiện ít nhất và nhiều nhất. */
  minSpan: number
  maxSpan: number
}

/**
 * Giới hạn kéo và zoom. `slots` là số ô trên trục (`market` là số nến, `flashback` là `totalSlots`).
 * `leftPad` và `rightPad` là số ô trống được kéo quá hai đầu: `market` cho kéo ra khoảng trống để nhìn phần
 * tương lai; `flashback` đặt 0 để không kéo tới phần warmup ở bên trái hay quá tương lai ở bên phải.
 */
export function viewportLimits(input: { slots: number; leftPad: number; rightPad: number; plotWidth: number; minSpan?: number }): ViewportLimits {
  const min = -0.5 - input.leftPad
  const max = input.slots - 0.5 + input.rightPad
  const maxSpan = Math.max(1, max - min)
  const minSpan = Math.min(maxSpan, input.minSpan ?? Math.max(2, input.plotWidth / MAX_BAR_PX))
  return { min, max, minSpan, maxSpan }
}

export function clampViewport(viewport: Viewport, limits: ViewportLimits): Viewport {
  const span = Math.min(limits.maxSpan, Math.max(limits.minSpan, viewport.to - viewport.from))
  let from = viewport.from
  if (!Number.isFinite(from)) from = limits.max - span
  if (from < limits.min) from = limits.min
  let to = from + span
  if (to > limits.max) {
    to = limits.max
    from = to - span
  }
  return { from, to }
}

/** Viewport mặc định: `visible` nến cuối, chừa `rightPad` ô trống bên phải. */
export function defaultViewport(input: { slots: number; visible: number; rightPad: number }, limits: ViewportLimits): Viewport {
  const to = input.slots - 0.5 + input.rightPad
  return clampViewport({ from: to - Math.max(1, input.visible), to }, limits)
}

/** Vừa khít mọi ô trên trục. */
export function fitViewport(limits: ViewportLimits): Viewport {
  return { from: limits.min, to: limits.max }
}

/**
 * Zoom quanh một chỉ số: `factor` lớn hơn 1 thu nhỏ (hiện nhiều nến hơn), nhỏ hơn 1 phóng to.
 * Chỉ số `anchor` giữ nguyên vị trí trên màn hình.
 */
export function zoomViewport(viewport: Viewport, factor: number, anchor: number, limits: ViewportLimits): Viewport {
  const span = viewport.to - viewport.from
  const nextSpan = Math.min(limits.maxSpan, Math.max(limits.minSpan, span * factor))
  const ratio = span === 0 ? 0.5 : (anchor - viewport.from) / span
  const from = anchor - ratio * nextSpan
  return clampViewport({ from, to: from + nextSpan }, limits)
}

/** Kéo theo số nến (dương là sang phải, tức xem phần mới hơn). */
export function panViewport(viewport: Viewport, bars: number, limits: ViewportLimits): Viewport {
  return clampViewport({ from: viewport.from + bars, to: viewport.to + bars }, limits)
}

/** Kéo bằng chuột: kéo `dx` pixel sang phải thì hình đi theo, nên viewport lùi về trái. */
export function panViewportByPixels(viewport: Viewport, dx: number, plotWidth: number, limits: ViewportLimits): Viewport {
  if (plotWidth <= 0) return viewport
  return panViewport(viewport, (-dx / plotWidth) * (viewport.to - viewport.from), limits)
}

/** Nạp thêm lịch sử làm `added` nến chèn vào đầu: dịch viewport đúng số đó để hình trên màn hình đứng yên. */
export function shiftForPrepend(viewport: Viewport, added: number): Viewport {
  return added === 0 ? viewport : { from: viewport.from + added, to: viewport.to + added }
}

/**
 * Số nến vừa chèn vào đầu dữ liệu: vị trí của nến đầu cũ trong dãy thời gian mới; 0 nếu không phải chèn vào đầu
 * (đổi mã hoặc đổi khung thì dữ liệu cũ không còn trong dãy mới).
 */
export function prependedCount(previousFirstTime: number | null, times: readonly number[]): number {
  if (previousFirstTime === null || times.length === 0 || times[0] >= previousFirstTime) return 0
  let low = 0
  let high = times.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    if (times[mid] === previousFirstTime) return mid
    if (times[mid] < previousFirstTime) low = mid + 1
    else high = mid - 1
  }
  return 0
}

/** Có nến mới ở cuối và viewport đang xem tới nến cuối cũ: đi theo để nến mới hiện ra. */
export function followAppend(viewport: Viewport, previousCount: number, count: number): Viewport {
  if (count <= previousCount || previousCount === 0) return viewport
  const atLatest = viewport.to >= previousCount - 0.5 && viewport.from <= previousCount - 0.5
  return atLatest ? shiftForPrepend(viewport, count - previousCount) : viewport
}

/** Dải chỉ số nến còn thấy được (kể cả nến lộ một phần), kẹp trong `[0, count - 1]`; null nếu không có nến nào. */
export function visibleIndexRange(viewport: Viewport, count: number): { first: number; last: number } | null {
  const first = Math.max(0, Math.floor(viewport.from + 0.5))
  const last = Math.min(count - 1, Math.ceil(viewport.to + 0.5) - 1)
  return first > last ? null : { first, last }
}

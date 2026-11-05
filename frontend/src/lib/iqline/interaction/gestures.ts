/** Phép tính thuần của cử chỉ: con lăn, chụm hai ngón (docs/iqline-design.md §7, bảng tương tác). */
import type { Viewport } from "../types"
import type { InteractionConfig, WheelInput } from "./types"
import type { ViewportOps } from "./viewport-ops"

/** Giữ ngón tay đủ lâu trên một chỗ (ms) thì bật crosshair thay vì kéo. Bên dùng đặt đồng hồ rồi gửi `long-press`. */
export const LONG_PRESS_MS = 350
/** Ngón tay lệch quá chừng này (pixel) thì không còn là nhấn giữ. */
export const LONG_PRESS_SLOP = 8
/** Chuột kéo từ điểm đầu quá chừng này (pixel) khi đang vẽ thì thả ra là chốt điểm cuối (kéo để vẽ). */
export const DRAW_DRAG_SLOP = 6
/** Mỗi lần bấm phím `+` hoặc `-` zoom theo hệ số này. */
export const ZOOM_STEP = 1.2
/** Mũi tên dịch 1 nến, giữ Shift thì 10 nến. */
export const KEY_PAN_BARS = 1
export const KEY_PAN_BARS_FAST = 10

export type WheelIntent = "zoom" | "pan" | "none"

/**
 * Cách xử lý một cú lăn chuột. `market` và `flashback` zoom bằng lăn dọc; `static` chỉ zoom khi giữ Ctrl (trình duyệt cũng gửi cử chỉ chụm
 * trên bàn di chuột dưới dạng Ctrl + lăn). Lăn ngang hoặc giữ Shift là kéo. `none` nghĩa là để trang cuộn: bên dùng chỉ gọi
 * `preventDefault` khi kết quả khác `none`, nên trên biểu đồ zoom được thì trang không cuộn theo con trỏ.
 */
export function wheelIntent(wheel: Pick<WheelInput, "deltaX" | "deltaY" | "ctrlKey" | "shiftKey" | "target">, config: Pick<InteractionConfig, "zoom" | "pan" | "wheelNeedsCtrl">): WheelIntent {
  if (wheel.target.region === "none") return "none"
  const horizontal = Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY) || Boolean(wheel.shiftKey)
  if (config.zoom && (wheel.ctrlKey || (!config.wheelNeedsCtrl && !horizontal))) return "zoom"
  if (config.pan && horizontal) return "pan"
  return "none"
}

function pixelDelta(value: number, mode: WheelInput["deltaMode"]): number {
  return mode === 1 ? value * 16 : mode === 2 ? value * 400 : value
}

/** Hệ số zoom của một cú lăn: lăn lên (deltaY âm) là phóng to. Cử chỉ chụm (Ctrl) nhạy hơn lăn thường. */
export function wheelZoomFactor(wheel: Pick<WheelInput, "deltaY" | "deltaMode" | "ctrlKey">): number {
  const delta = pixelDelta(wheel.deltaY, wheel.deltaMode)
  const factor = Math.exp(-delta * (wheel.ctrlKey ? 0.01 : 0.0015))
  return Math.min(2, Math.max(0.5, factor))
}

/** Số nến cần dịch cho một cú lăn ngang (hoặc Shift + lăn), tính theo bề rộng khung vẽ. */
export function wheelPanBars(wheel: Pick<WheelInput, "deltaX" | "deltaY" | "deltaMode" | "shiftKey">, viewport: Viewport, plotWidth: number): number {
  const raw = wheel.deltaX !== 0 && !wheel.shiftKey ? wheel.deltaX : wheel.deltaY
  return (pixelDelta(raw, wheel.deltaMode) * (viewport.to - viewport.from)) / Math.max(plotWidth, 1)
}

export type PinchStart = { startDistance: number; startViewport: Viewport; startRatio: number; startCenterX: number }

/**
 * Viewport khi chụm hai ngón: hai ngón dang ra là phóng to, và điểm giữa hai ngón kéo theo viewport (vừa zoom vừa kéo).
 * `distance` và `centerX` là của hai ngón ở thời điểm hiện tại; `plot` là mép trái và bề rộng khung vẽ.
 */
export function pinchViewport(start: PinchStart, current: { distance: number }, centerX: number, plotWidth: number, ops: ViewportOps): Viewport {
  const scale = start.startDistance > 0 && current.distance > 0 ? current.distance / start.startDistance : 1
  const zoomed = ops.zoom(start.startViewport, start.startRatio, scale)
  const span = zoomed.to - zoomed.from
  return ops.pan(zoomed, (-(centerX - start.startCenterX) * span) / Math.max(plotWidth, 1))
}

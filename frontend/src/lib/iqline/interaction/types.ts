/**
 * Kiểu của lớp tương tác: sự kiện đầu vào (đã chuẩn hoá, không phụ thuộc DOM), cấu hình theo chế độ, trạng thái và hành động.
 * Lớp `react/` đổi sự kiện DOM sang các kiểu này, xác định `target` bằng bố cục ô, rồi gọi `interactionReducer`.
 */
import type { Anchor, Bar, ChartMode, Drawing, DrawingTool, PaneCoords, PaneKind, Viewport } from "../types"
import type { DrawingsAction, DrawingsState } from "../drawings"
import type { History } from "./history"
import type { ViewportOps } from "./viewport-ops"

export type PointerKind = "mouse" | "touch" | "pen"
/** Vùng dưới con trỏ: khung vẽ của một ô, trục giá bên phải, trục thời gian ở đáy, hoặc ngoài biểu đồ. */
export type HitRegion = "plot" | "price-axis" | "time-axis" | "none"
export type PointerTarget = { region: HitRegion; paneKey: string; paneKind: PaneKind }

/** Toạ độ `x`, `y` là CSS pixel trong canvas (cùng hệ với `PaneCoords`). */
export type PointerInput = {
  pointerId: number
  pointerType: PointerKind
  x: number
  y: number
  target: PointerTarget
  /** Nút chuột; bỏ trống là nút chính. Nút khác nút chính bị bỏ qua. */
  button?: number
}

export type WheelInput = {
  x: number
  y: number
  deltaX: number
  deltaY: number
  /** Như `WheelEvent.deltaMode`: 0 pixel, 1 dòng, 2 trang. */
  deltaMode?: 0 | 1 | 2
  ctrlKey?: boolean
  shiftKey?: boolean
  target: PointerTarget
}

export type KeyInput = { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }

/** Cấu hình theo chế độ; dựng bằng `marketConfig`, `flashbackConfig`, `staticConfig` và dựng lại khi dữ liệu đổi. */
export type InteractionConfig = {
  mode: ChartMode
  zoom: boolean
  pan: boolean
  /** Kéo trên trục giá hoặc trục thời gian để co giãn (chỉ `market`). */
  axisScaling: boolean
  /** Có hoàn tác và làm lại không (chỉ `market`). */
  history: boolean
  /** `flashback`: lăn chuột thường để trang cuộn, chỉ Ctrl + lăn mới zoom. */
  wheelNeedsCtrl: boolean
  /** Nhấp đúp vào khung vẽ để về khung mặc định (`flashback`). Nhấp đúp vào trục thời gian luôn làm việc này. */
  doubleClickPlotResets: boolean
  /** Công cụ được dùng; rỗng nghĩa là không vẽ được (`static`). */
  allowedTools: readonly DrawingTool[]
  ops: ViewportOps
  /** Khung hiện khi bấm "về khung mặc định". */
  defaultViewport: Viewport
  /** Chỉ số nến đọc được (gồm hai đầu); null là không có nến nào. Flashback: từ warmup tới nến đã mở cuối cùng. */
  readable: { first: number; last: number } | null
  /** `market` cho crosshair đứng ở ô chưa có nến (chỉ có nhãn thời gian); `flashback` thì không (§12). */
  crosshairBeyondData: boolean
  /** Giới hạn chỉ số của điểm neo hình vẽ; null là không giới hạn. */
  anchorRange: { min: number; max: number } | null
  historyLimit: number
  /** Khoảng hút vào OHLC, pixel. */
  snapTolerance: number
}

/**
 * Crosshair. Khi `bar` khác null, bên vẽ đặt đường dọc ở tâm nến `bar` (`xOfIndex(bar)`) và đọc OHLC của nến đó; khi null
 * (ô chưa có nến, chỉ ở `market`) thì dùng `x` thô và không có giá trị nào để đọc.
 */
export type Crosshair = { x: number; y: number; paneKey: string; bar: number | null; source: "pointer" | "touch" | "keyboard" }

export type CursorHint = "default" | "crosshair" | "pointer" | "grabbing" | "ns-resize" | "ew-resize"

export type DragState =
  | { kind: "pan"; pointerId: number; startX: number; startViewport: Viewport }
  | { kind: "scale-time"; pointerId: number; startX: number; startViewport: Viewport }
  | { kind: "scale-price"; pointerId: number; paneKey: string; startY: number; startScale: number }
  | { kind: "handle"; pointerId: number; id: string; handle: number; before: readonly Drawing[] }
  | { kind: "move"; pointerId: number; id: string; origin: Drawing; startX: number; startY: number; before: readonly Drawing[] }
  | { kind: "draw"; pointerId: number; startX: number; startY: number }
  | { kind: "crosshair"; pointerId: number }

export type TouchPoint = { pointer: PointerInput; startX: number; startY: number }
export type PinchState = {
  ids: readonly [number, number]
  startDistance: number
  startViewport: Viewport
  startRatio: number
  startCenterX: number
}

export type InteractionState = {
  viewport: Viewport
  crosshair: Crosshair | null
  drag: DragState | null
  touches: Readonly<Record<number, TouchPoint>>
  pinch: PinchState | null
  /** Hệ số kéo tay trục giá của từng ô; vắng mặt hoặc 1 là tự co giãn. Scene nhân khoảng giá với hệ số này quanh tâm. */
  priceScale: Readonly<Record<string, number>>
  drawings: DrawingsState
  history: History<readonly Drawing[]>
  /** Hút vào OHLC khi vẽ và kéo tay nắm. */
  magnet: boolean
  /** Điểm con trỏ đang chờ làm điểm neo kế tiếp (bản xem trước khi vẽ). */
  preview: Anchor | null
  cursor: CursorHint
}

export type InteractionAction =
  | { type: "pointer-down"; pointer: PointerInput }
  | { type: "pointer-move"; pointer: PointerInput }
  | { type: "pointer-up"; pointer: PointerInput }
  | { type: "pointer-cancel"; pointerId: number }
  | { type: "pointer-leave" }
  | { type: "double-click"; pointer: PointerInput }
  /** Bên dùng gửi sau `LONG_PRESS_MS` kể từ khi chạm; bị bỏ qua nếu ngón tay đã kéo hay có ngón thứ hai. */
  | { type: "long-press"; pointerId: number }
  | { type: "wheel"; wheel: WheelInput }
  | { type: "key"; key: KeyInput }
  | { type: "zoom"; direction: "in" | "out" }
  /** Dịch viewport `bars` nến (dương là về phía tương lai). */
  | { type: "pan"; bars: number }
  | { type: "reset" }
  /** Viewport do bên ngoài tính (nạp thêm lịch sử, dữ liệu mới); vẫn bị kẹp theo giới hạn của chế độ. */
  | { type: "set-viewport"; viewport: Viewport }
  | { type: "reset-price-scale"; paneKey: string }
  | { type: "tool"; tool: DrawingTool | null }
  | { type: "magnet"; on: boolean }
  | { type: "undo" }
  | { type: "redo" }
  /** Thao tác trên hình có sẵn: chọn, khoá, ẩn, nhân bản, sửa kiểu, xoá. Không gồm `tool`, `anchor` và `load`. */
  | { type: "drawing"; action: DrawingsAction }
  /** Nạp hình từ kho lưu trữ; không ghi vào lịch sử hoàn tác. */
  | { type: "set-drawings"; drawings: readonly Drawing[] }
  /** Di chuyển crosshair bàn phím `bars` nến. */
  | { type: "move-crosshair"; bars: number }
  | { type: "clear-crosshair" }

/** Đầu vào của mỗi lần giảm: cấu hình, phép đổi toạ độ ô giá hiện tại và các nến (để hút vào OHLC và crosshair bàn phím). */
export type InteractionEnv = {
  config: InteractionConfig
  /** `xOfIndex` và `indexOfX` dùng được cho mọi ô; công cụ vẽ chỉ dùng ở ô giá. */
  coords: PaneCoords
  /** `bars[i]` là nến ở chỉ số `i` của trục. */
  bars?: ArrayLike<Bar>
}

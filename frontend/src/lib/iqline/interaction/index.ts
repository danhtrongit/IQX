/** Tương tác IQLine: bộ giảm trạng thái thuần cho zoom, kéo, co giãn trục, crosshair, phím, công cụ vẽ, cử chỉ chạm, hoàn tác. */
export { MARKET_LEFT_PAD, MARKET_RIGHT_PAD, createInteractionState, flashbackConfig, marketConfig, staticConfig, type FlashbackConfigInput, type MarketConfigInput, type StaticConfigInput } from "./config"
export {
  DRAW_DRAG_SLOP,
  KEY_PAN_BARS,
  KEY_PAN_BARS_FAST,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  ZOOM_STEP,
  pinchViewport,
  wheelIntent,
  wheelPanBars,
  wheelZoomFactor,
  type PinchStart,
  type WheelIntent,
} from "./gestures"
export { DEFAULT_HISTORY_LIMIT, canRedo, canUndo, createHistory, recordHistory, redoHistory, undoHistory, type History } from "./history"
export { keyToAction } from "./keyboard"
export { interactionReducer } from "./reducer"
export type {
  Crosshair,
  CursorHint,
  DragState,
  HitRegion,
  InteractionAction,
  InteractionConfig,
  InteractionEnv,
  InteractionState,
  KeyInput,
  PinchState,
  PointerInput,
  PointerKind,
  PointerTarget,
  TouchPoint,
  WheelInput,
} from "./types"
export { manualPriceRange } from "./price-adjust"
export { createViewportOps, limitsOf, opsFor, type ViewportOps, type ViewportSpec } from "./viewport-ops"

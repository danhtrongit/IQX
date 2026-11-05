/** Công cụ vẽ IQLine: mô tả 14 công cụ, dựng lệnh vẽ, chọn hình, kéo tay nắm, trạng thái và chuyển layout TradingView. */
export { ALL_TOOLS, FLASHBACK_TOOLS, TOOL_SPECS, anchorCountOf, clicksOf, isDrawingTool, isVariableTool, maxAnchorsOf, type ToolGroup, type ToolSpec } from "./tools"
export {
  BASIC_TOOLS,
  DOCUMENT_POINT_BUDGET,
  PATH_MAX_POINTS,
  POSITION_DEFAULT_RR,
  STROKE_MAX_POINTS,
  STROKE_RAW_MAX,
  barCount,
  capPoints,
  formatDuration,
  isBasicTool,
  positionLabels,
  priceRangeLabel,
  rangeLabel,
  roundAnchor,
  simplifyStroke,
  strokeCorners,
  type BasicTool,
} from "./tools-basic"
export {
  FIB_EXTENSION_LEVELS,
  FIB_FORBIDDEN_TOKENS,
  FIB_RETRACEMENT_LEVELS,
  FIB_ZONE,
  FIB_ZONE_TOKEN,
  defaultFormatPrice,
  fibExtensionPrice,
  fibLabel,
  fibRetracementPrice,
  type FibLevel,
} from "./fib"
export {
  clipLine,
  distanceToLine,
  distanceToRay,
  distanceToRect,
  distanceToSegment,
  resolveAnchors,
  type Extend,
  type Rect,
  type ScreenAnchor,
  type ScreenPoint,
} from "./geometry"
export { drawingCommands, handleCommands, isRenderable, measureLabel, previewCommands, type DrawingRenderOptions } from "./commands"
export { HANDLE_RADIUS, HIT_TOLERANCE, distanceToDrawing, hitDrawing, hitHandle } from "./hit-test"
export {
  SNAP_TOLERANCE,
  anchorFromPoint,
  moveHandle,
  normalizeMagnet,
  snapToOhlc,
  translateDrawing,
  type AnchorOptions,
  type MagnetMode,
  type IndexRange,
  type SnapOptions,
  type SnapResult,
} from "./edit"
export {
  INITIAL_DRAWINGS,
  clearOutcome,
  createDrawingsState,
  drawingsReducer,
  listDrawings,
  nextIdFor,
  variablePointCount,
  type DrawingListEntry,
  type DrawingsAction,
  type DrawingsState,
  type PendingDrawing,
} from "./state"
export { fromTradingViewLayout, intervalStepSeconds, type TradingViewConversion } from "./tradingview"
export { AI_OVERLAY_TOKEN, aiOverlayCommands, type AiOverlayOptions } from "./overlays"
export {
  ADVANCED_TOOLS,
  FIB_CHANNEL_LEVELS,
  FIB_FAN_LEVELS,
  FIB_SEQUENCE,
  GANN_ANGLES,
  GANN_BOX_LEVELS,
  fibTimeZonePositions,
  gannDirection,
  isAdvancedTool,
  ratioText,
  xabcdRatios,
  type AdvancedTool,
  type GannAngle,
  type XabcdRatios,
} from "./tools-advanced"

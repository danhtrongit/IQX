/**
 * Hợp đồng chung của IQLine (docs/iqline-design.md §4-§7). Mọi thư mục con chỉ phụ thuộc nhau qua file này
 * và qua hướng `react -> render, interaction -> scene -> core, indicators, drawings, labels`.
 * File này không chạm DOM. Sửa hợp đồng phải cập nhật mọi nơi dùng.
 */

/** Nến không có thời gian: chế độ `flashback` chỉ dùng kiểu này nên không thể lộ ngày thật. */
export type Bar = { open: number; high: number; low: number; close: number; volume: number }
/** Unix giây. Adapter chịu trách nhiệm đổi đơn vị từ API. */
export type TimedBar = Bar & { time: number }
export type Interval = "1" | "5" | "15" | "30" | "60" | "D" | "W" | "M"
export type ChartType = "candles" | "hollow" | "ohlc" | "line" | "area" | "heikin-ashi"
export type PriceScaleMode = "linear" | "log" | "percent"
export type ChartMode = "market" | "flashback" | "static"

/** Khoá ổn định của điểm neo: `time` ở `market`, `session` ở `flashback`. */
export type Anchor = { time: number; price: number } | { session: number; price: number }

/** Tên token trong `index.css`, không bao giờ là chuỗi `var(--x)` hay màu thô. */
export type ColorToken =
  | "background"
  | "foreground"
  | "border"
  | "muted-foreground"
  | "academy-label"
  | "price-up"
  | "price-down"
  | "price-ref"
  | "price-ceiling"
  | "price-floor"
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "chart-7"
  | "chart-8"

/** Viewport theo chỉ số nến, có thể lẻ; `to` lớn hơn `from`. */
export type Viewport = { from: number; to: number }
/** Kích thước theo CSS pixel; lệnh vẽ tính sẵn theo pixel thiết bị (nhân `dpr`). */
export type Geometry = { width: number; height: number; dpr: number; axisRight: number; axisBottom: number }

export type TextAlign = "left" | "right" | "center"
export type Layer = "base" | "data" | "drawings" | "top"

/**
 * Lệnh vẽ là dữ liệu thuần. `data` là bộ đệm dùng lại giữa các khung hình, `count` là số phần tử dùng được:
 * `rects` x,y,w,h; `lines` x1,y1,x2,y2; `polyline` và `polygon` x,y.
 */
export type DrawCommand =
  | { op: "rects"; token: ColorToken; alpha?: number; data: Float64Array; count: number }
  | { op: "lines"; token: ColorToken; width: number; dash?: readonly number[]; data: Float64Array; count: number }
  | { op: "polyline"; token: ColorToken; width: number; dash?: readonly number[]; data: Float64Array; count: number }
  | { op: "polygon"; token: ColorToken; alpha: number; data: Float64Array; count: number }
  | { op: "circle"; token: ColorToken; x: number; y: number; radius: number; fill: boolean; width?: number }
  | { op: "text"; token: ColorToken; text: string; x: number; y: number; align: TextAlign; size?: number; weight?: 400 | 500 | 600; tabular?: boolean }
  | { op: "clip"; x: number; y: number; width: number; height: number }
  | { op: "unclip" }

export type Scene = DrawCommand[]

/** Đổi toạ độ cho một ô; `core` cài đặt, `drawings` và `interaction` chỉ dùng. Toạ độ theo CSS pixel. */
export type PaneCoords = {
  xOfIndex(index: number): number
  indexOfX(x: number): number
  yOfPrice(price: number): number
  priceOfY(y: number): number
  /** Chỉ số (có thể lẻ, có thể vượt nến cuối) của một điểm neo; null nếu không đổi được. */
  indexOfAnchor(anchor: Anchor): number | null
  /** Điểm neo tại chỉ số và giá, đúng loại theo chế độ hiện tại. */
  anchorAt(index: number, price: number): Anchor
  plot: { left: number; top: number; right: number; bottom: number }
}

export type PaneKind = "price" | "volume" | "indicator"

// --- Chỉ báo ---
export type IndicatorKind = "over" | "vol" | "pane"
export type IndicatorParamValue = number | string | boolean
export type IndicatorParams = Record<string, IndicatorParamValue>
export type ChartIndicatorInput = { key: string; id: string; params: IndicatorParams; hidden?: boolean }
export type IndicatorSeries = { key: string; label: string; values: readonly (number | null)[]; color: ColorToken; style?: "line" | "dash" | "dots" | "area"; width?: number }
export type IndicatorPlot = {
  kind: IndicatorKind
  series: IndicatorSeries[]
  histogram?: { values: readonly (number | null)[]; upToken: ColorToken; downToken: ColorToken }
  /** Cột ngang trên ô giá (Volume Profile). `row` theo giá, `value` tỷ lệ 0-1. */
  profile?: { rows: readonly { low: number; high: number; up: number; down: number }[] }
  markers?: readonly { index: number; token: ColorToken; label?: string }[]
  levels?: readonly { key: string; value: number; label: string }[]
  zero?: boolean
  range?: readonly [number, number]
  levelBand?: { lower: number; upper: number }
  cross?: readonly [string, string]
}
export type IndicatorParamSpec = { key: string; label?: string; min?: number; max?: number; step?: number; default: IndicatorParamValue; options?: readonly string[] }
export type IndicatorDefinition = {
  id: string
  name: string
  kind: IndicatorKind
  params: readonly IndicatorParamSpec[]
  /** Chỉ dùng được ở `market` nếu false. */
  flashback: boolean
  compute(bars: readonly Bar[], params: IndicatorParams, palette: readonly ColorToken[]): IndicatorPlot
}

// --- Hình vẽ ---
export type DrawingTool =
  | "trend" | "ray" | "extended" | "horizontal" | "horizontal-ray" | "vertical" | "channel"
  | "fib-retracement" | "fib-extension" | "rectangle" | "elliott-5" | "elliott-abc" | "note" | "measure"
export type DrawingStyle = { color: ColorToken; width: number; dash?: "solid" | "dashed"; fill?: boolean }
export type Drawing = { id: string; tool: DrawingTool; anchors: Anchor[]; style: DrawingStyle; text?: string; locked?: boolean; hidden?: boolean }

// --- Lưu trữ (§11) ---
export type ChartDocument = {
  iqline: { version: 1; drawings: Drawing[]; indicators: ChartIndicatorInput[]; chartType: ChartType }
  /** Layout TradingView gốc, giữ tới khi dọn dẹp ở Giai đoạn 7. */
  charts?: unknown[]
}

// --- Dữ liệu ngoài (§6) ---
export type ChartMark = { id: string | number; time: number; label: string; token: ColorToken; count?: number }
export type SessionMarker = { session: number; side: "buy" | "sell" | "close"; price?: number; label?: string }
export type IQLineDatafeed = {
  /** `to` loại trừ; `countBack` là số nến tối thiểu mong muốn. */
  getBars(q: { symbol: string; interval: Interval; to: number; countBack: number; signal: AbortSignal }): Promise<{ bars: TimedBar[]; noMoreHistory: boolean }>
  /** Nến mới hoặc nến cuối được cập nhật. Trả về hàm huỷ. */
  subscribeBars(symbol: string, interval: Interval, onBar: (bar: TimedBar) => void): () => void
  getMarks?(q: { symbol: string; from: number; to: number; signal: AbortSignal }): Promise<ChartMark[]>
}
export type IQLineStore = {
  load(symbol: string): Promise<ChartDocument | null>
  save(symbol: string, doc: ChartDocument): void
}

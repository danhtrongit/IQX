/**
 * Hợp đồng chung của IQLine (docs/iqline-design.md §4-§7). Mọi thư mục con chỉ phụ thuộc nhau qua file này
 * và qua hướng `react -> render, interaction -> scene -> core, indicators, drawings, labels`.
 * File này không chạm DOM. Sửa hợp đồng phải cập nhật mọi nơi dùng.
 *
 * Quy ước đơn vị (mọi adapter đổi về đây trước khi đưa dữ liệu vào thư viện):
 * - Thời gian: Unix GIÂY, UTC (`TimedBar.time`, `Anchor.time`, `ChartMark.time`, tham số `to` của `getBars`). Chỉ code
 *   TradingView cũ (`datafeed.ts`) dùng mili giây; không để mili giây lọt vào thư viện.
 * - Giá cổ phiếu: nghìn đồng, như REST `/market-data/quotes/{symbol}/ohlcv` (58 là 58.000đ). `trading/price-board` trả
 *   đồng và WebSocket nhân 1.000: chia 1.000 trước khi dùng cho `priceLevels` hay nến.
 * - Giá chỉ số: điểm chỉ số, không nhân. Khối lượng: số cổ phiếu.
 * - Chỉ số nến (viewport, `PaneCoords`): số nguyên là TÂM nến, nến `i` chiếm `[i - 0.5, i + 0.5]`; lẻ được.
 * - Toạ độ trên màn hình (`PaneCoords`, `PointerInput`): CSS pixel. Lệnh vẽ (`DrawCommand`): pixel thiết bị, đã nhân `dpr`.
 * - Màu: chỉ tên token (`ColorToken`), không bao giờ `var(--x)` hay mã màu thô.
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
  | "card"
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
  /** Cam của Học viện (`--s2`), chỉ dùng ở chế độ `static`. */
  | "s2"

/** Viewport theo chỉ số nến, có thể lẻ; `to` lớn hơn `from`. */
export type Viewport = { from: number; to: number }
/** Kích thước theo CSS pixel; lệnh vẽ tính sẵn theo pixel thiết bị (nhân `dpr`). */
export type Geometry = { width: number; height: number; dpr: number; axisRight: number; axisBottom: number }

export type TextAlign = "left" | "right" | "center"
/**
 * Nhãn cố định của trục ngang `flashback` ở khung mặc định (Flashback v2.3: "Lịch sử 60 phiên", "Phiên 1", ...). `index` là chỉ số ô
 * (0 là nến đầu tiên được hiện); `anchor` là phía của nhãn so với tâm ô: `start` chữ chạy sang phải, `end` chữ chạy sang trái.
 */
export type SessionAxisLabel = { index: number; label: string; anchor: "start" | "middle" | "end" }
export type Layer = "base" | "data" | "drawings" | "top"

/**
 * Lệnh vẽ là dữ liệu thuần. `data` là bộ đệm dùng lại giữa các khung hình, `count` là số phần tử dùng được:
 * `rects` x,y,w,h; `lines` x1,y1,x2,y2; `polyline` và `polygon` x,y.
 */
export type DrawCommand =
  | { op: "rects"; token: ColorToken; alpha?: number; data: Float64Array; count: number }
  | { op: "lines"; token: ColorToken; alpha?: number; width: number; dash?: readonly number[]; data: Float64Array; count: number }
  | { op: "polyline"; token: ColorToken; alpha?: number; width: number; dash?: readonly number[]; data: Float64Array; count: number }
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
/**
 * Một đường của chỉ báo. `values` luôn dài đúng bằng số nến; `offset` chỉ dời chỗ VẼ (và chỗ đọc ở crosshair, chú giải):
 * giá trị tính từ nến `j` được vẽ ở chỉ số `j + offset`. `offset > 0` đẩy về tương lai (Senkou của Ichimoku, vẽ vào vùng
 * ngoại suy sau nến cuối, không kéo giãn trục); `offset < 0` kéo về quá khứ (Chikou). `style: "step"` vẽ mỗi đoạn có cùng giá
 * trị thành một đoạn ngang riêng, không nối sang đoạn kế tiếp khi giá trị đổi (Pivot Points theo kỳ).
 */
export type IndicatorSeries = { key: string; label: string; values: readonly (number | null)[]; color: ColorToken; style?: "line" | "dash" | "dots" | "area" | "step"; width?: number; offset?: number }
export type IndicatorPlot = {
  kind: IndicatorKind
  series: IndicatorSeries[]
  /** `fade`: cột co lại so với phiên trước (dương giảm, âm tăng) vẽ nhạt, kiểu MACD 4 màu. */
  histogram?: { values: readonly (number | null)[]; upToken: ColorToken; downToken: ColorToken; fade?: boolean }
  /** Cột ngang trên ô giá (Volume Profile). `row` theo giá, `value` tỷ lệ 0-1. */
  profile?: { rows: readonly { low: number; high: number; up: number; down: number }[] }
  markers?: readonly { index: number; token: ColorToken; label?: string }[]
  levels?: readonly { key: string; value: number; label: string }[]
  zero?: boolean
  range?: readonly [number, number]
  levelBand?: { lower: number; upper: number }
  cross?: readonly [string, string]
  /** Mây tô giữa hai chuỗi (theo `key`, tính cả `offset` của chúng): `upToken` khi `a >= b`, `downToken` khi `a < b` (Ichimoku). */
  cloud?: { a: string; b: string; upToken: ColorToken; downToken: ColorToken }
}
export type IndicatorParamSpec = {
  key: string
  label?: string
  min?: number
  max?: number
  step?: number
  default: IndicatorParamValue
  options?: readonly string[]
  /** Tên tiếng Việt của từng `options` ở hộp thoại; thiếu thì hiện chính giá trị. */
  optionLabels?: Readonly<Record<string, string>>
}
/**
 * Thông tin ngoài nến mà một số chỉ báo cần (VWAP đặt lại theo phiên, Pivot Points theo kỳ): thời gian từng nến (Unix giây, cùng
 * thứ tự và độ dài với `bars`) và khung. CHỈ có ở `market`; `flashback` không có đường nào để đọc thời gian (§12), nên chỉ báo cần
 * `context` trả biểu đồ rỗng khi thiếu nó.
 */
export type IndicatorContext = { times: readonly number[]; interval: Interval }
export type IndicatorDefinition = {
  id: string
  name: string
  kind: IndicatorKind
  params: readonly IndicatorParamSpec[]
  /** Chỉ dùng được ở `market` nếu false. */
  flashback: boolean
  compute(bars: readonly Bar[], params: IndicatorParams, palette: readonly ColorToken[], context?: IndicatorContext): IndicatorPlot
}

// --- Hình vẽ ---
export type DrawingTool =
  | "trend" | "ray" | "extended" | "horizontal" | "horizontal-ray" | "vertical" | "channel"
  | "fib-retracement" | "fib-extension" | "rectangle" | "elliott-5" | "elliott-abc" | "note" | "measure"
  // Đợt 1: vị thế, vẽ tự do, chú thích, đo, hình (drawings/tools-basic.ts).
  | "long-position" | "short-position" | "brush" | "arrow" | "arrow-up" | "arrow-down" | "price-label" | "callout"
  | "date-range" | "date-price-range" | "ellipse" | "triangle" | "path"
  // Đợt 2: Fibonacci, Pitchfork, Gann, mẫu hình (drawings/tools-advanced.ts).
  | "fib-time-zones" | "fib-fan" | "fib-channel" | "pitchfork" | "gann-fan" | "gann-box" | "xabcd" | "head-shoulders" | "triangle-pattern"
export type DrawingStyle = { color: ColorToken; width: number; dash?: "solid" | "dashed"; fill?: boolean }
export type Drawing = { id: string; tool: DrawingTool; anchors: Anchor[]; style: DrawingStyle; text?: string; locked?: boolean; hidden?: boolean }

// --- Lớp AI (§2 "Đánh dấu", §7) ---
/**
 * Mẫu hình AI vẽ đè lên ô giá. Chỉ dùng màu `chart-7` (màu dành riêng cho AI), nét phẳng, không tương tác. Điểm neo theo
 * `time` ở `market`. Không phải hình của người dùng: không lưu, không chọn, không xoá.
 */
export type AiOverlay =
  /** Đường gãy qua các điểm (dự báo hoặc đường viền mẫu hình). */
  | { id: string; kind: "path"; points: readonly Anchor[]; label?: string; dashed?: boolean }
  /** Mức giá ngang qua cả ô giá. */
  | { id: string; kind: "level"; price: number; label?: string }
  /** Vùng chữ nhật giữa hai góc. */
  | { id: string; kind: "zone"; from: Anchor; to: Anchor; label?: string }
  /** Một điểm đánh dấu có nhãn. */
  | { id: string; kind: "marker"; anchor: Anchor; label?: string }

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

/** Lấy qua ref, cho thanh công cụ bên ngoài (§6). */
export type IQLineHandle = {
  /** Về khung mặc định: viewport và thang giá tự co giãn. */
  fitContent(): void
  /** Ảnh PNG của biểu đồ (bốn lớp canvas trên nền giao diện hiện tại). */
  screenshot(): Promise<Blob>
  undo(): void
  redo(): void
}

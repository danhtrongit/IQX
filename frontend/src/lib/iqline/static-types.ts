/**
 * Kiểu dữ liệu của chế độ `static` (Học viện, docs/iqline-design.md §13). Số liệu đã tính sẵn: thư viện chỉ vẽ,
 * không chạy công thức chỉ báo. Màu luôn là tên token (`ColorToken`); việc đổi vai trò màu của nội dung bài học
 * (`price`, `p1`, `pos`...) sang token do bộ chuyển đổi ở trang đảm nhiệm, không nằm trong thư viện.
 *
 * Mọi chỉ số `i`, `from`, `to` là chỉ số quan sát tuyệt đối trong [frame.start, frame.end]; phần tử thứ k của
 * một mảng giá trị ứng với chỉ số `frame.start + k`.
 */
import type { ColorToken } from "./types"

/** Giá trị theo từng quan sát; `null` là thiếu số liệu và làm đứt đường, không bao giờ coi là 0. */
export type StaticValues = readonly (number | null)[]

/** Vùng nền theo chiều ngang (nhiều ô cùng tô). `token` là màu tô, `labelToken` là màu chữ nhãn (không bao giờ xám). */
export type StaticShade = { from: number; to: number; token: ColorToken; label?: string; labelToken?: ColorToken }
/** Đường dọc đánh dấu một phiên, nhãn in phía trên. */
export type StaticMark = { i: number; label: string }

/** Phần dùng chung của mọi ô trong một biểu đồ: trục x, nền, đường đánh dấu. Mọi ô của một biểu đồ trỏ cùng một đối tượng. */
export type StaticFrame = {
  start: number
  end: number
  /** Nhãn trục x theo vị trí trong cửa sổ; chuỗi rỗng là không in nhãn tại vị trí đó. */
  ticks?: readonly string[]
  shade?: readonly StaticShade[]
  marks: readonly StaticMark[]
  /** `false` là hình thu nhỏ: chỉ vẽ số liệu, không trục, không tiêu đề, không crosshair. */
  axes: boolean
  /** Mô tả cho trình đọc màn hình. */
  alt?: string
}

export type StaticCandles = { open: StaticValues; high: StaticValues; low: StaticValues; close: StaticValues }
export type StaticSeries = { name: string; token: ColorToken; dash?: boolean; width?: number; values: StaticValues }
/** Cột; `tokens[k]` là màu của cột thứ k (tăng, giảm, hoặc trung tính). */
export type StaticBars = { name: string; values: StaticValues; tokens: readonly ColorToken[] }
export type StaticBand = { upper: StaticValues; lower: StaticValues; token: ColorToken }
/** Tô giữa hai chuỗi (chỉ số trong `series`), màu theo dấu của a - b. */
export type StaticFillBetween = { a: number; b: number; aboveToken: ColorToken; belowToken: ColorToken }

export type StaticLevelRole = "buy" | "sell" | "neutral" | "avg"
export type StaticLevel = { value: number; role: StaticLevelRole; token: ColorToken; label?: string; labelToken: ColorToken }
export type StaticZone = { from: number; to: number; token: ColorToken; label?: string; labelToken: ColorToken }
export type StaticFib = {
  lo: { i: number; v: number }
  hi: { i: number; v: number }
  dir: "up" | "down"
  levels: readonly number[]
  /** Vùng tô giữa hai mức, theo tỷ lệ. */
  zone?: readonly [number, number]
  /** Không dùng `chart-3`, `chart-4`, `chart-7` (§7); phép dựng cảnh tự đổi về `chart-2` nếu gặp. */
  token: ColorToken
}
/** Đoạn thẳng trong không gian dữ liệu: [chỉ số, giá trị]. `extend` kéo dài qua `to` thêm n quan sát. */
export type StaticSegment = { from: readonly [number, number]; to: readonly [number, number]; token: ColorToken; dash?: boolean; extend?: number }
export type StaticNote = { i: number; value: number; text: string; token: ColorToken }
export type StaticPoint = { i: number; value: number; token: ColorToken; labelToken: ColorToken; shape?: "dot" | "ring"; label?: string; pos?: "above" | "below" | "left" | "right" }

/** Một ô (panel) của biểu đồ `static`. Các ô của cùng một biểu đồ dùng chung `frame`. */
export type StaticPanel = {
  frame: StaticFrame
  title: string
  candles?: StaticCandles
  series: readonly StaticSeries[]
  bars?: StaticBars
  band?: StaticBand
  fill_between?: StaticFillBetween
  /** Vẽ đường 0 khi trục chứa 0. */
  zero?: boolean
  /** Trục dưới không xuống dưới 0. */
  nonnegative?: boolean
  bounds?: readonly [number, number]
  ticks?: readonly number[]
  digits?: number
  levels?: readonly StaticLevel[]
  zones?: readonly StaticZone[]
  fib?: StaticFib
  segments?: readonly StaticSegment[]
  notes?: readonly StaticNote[]
  /** Dấu trên ô này (bộ chuyển đổi đã lọc theo ô). */
  points?: readonly StaticPoint[]
}

/** Một dòng chú giải: nến, chuỗi hoặc cột. */
export type StaticLegendEntry = { label: string; token: ColorToken; shape: "bar" | "line"; dash: boolean }

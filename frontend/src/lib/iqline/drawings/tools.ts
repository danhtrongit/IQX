/**
 * Mô tả chung của 36 công cụ vẽ (docs/iqline-design.md §10): số điểm neo, nhóm, nhãn và kiểu mặc định.
 * Mọi công cụ dùng chung một mô tả: danh sách điểm neo, cách vẽ (`commands.ts`), cách chọn (`hit-test.ts`).
 */
import type { Anchor, DrawingStyle, DrawingTool } from "../types"
import { BASIC_TOOLS, BASIC_TOOL_SPECS } from "./tools-basic"

export type ToolGroup = "line" | "channel" | "fib" | "shape" | "wave" | "annotation" | "pitchfork" | "pattern" | "position" | "freehand" | "measure"

export type ToolSpec = {
  tool: DrawingTool
  /** Tên hiển thị cho thanh công cụ và danh sách hình. */
  label: string
  group: ToolGroup
  /** Số điểm neo cần có để hình hoàn tất. */
  anchorCount: number
  /** Kiểu của hình mới vẽ. Màu chỉ lấy trong các token còn lại sau luật DESIGN.md (không dùng chart-3, chart-4, chart-7). */
  defaultStyle: DrawingStyle
  /**
   * Công cụ có số điểm neo thay đổi (nét bút, đường gấp khúc): `anchorCount` là số điểm tối thiểu, `max` là số điểm lưu tối đa,
   * `pendingMax` là số điểm tối đa khi đang vẽ. `stroke` là nét kéo thả (thả chuột là xong); không có thì bấm từng điểm,
   * nhấp đúp hoặc Enter để xong.
   */
  variable?: { max: number; pendingMax: number; stroke?: boolean }
  /** Số lần bấm để đặt hình khi ít hơn `anchorCount`; `expand` tạo các điểm neo từ các lần bấm (vị thế: bấm điểm vào rồi chốt lời). */
  clicks?: number
  expand?: (clicks: readonly Anchor[]) => Anchor[]
}

function spec(tool: DrawingTool, label: string, group: ToolGroup, anchorCount: number, style: Partial<DrawingStyle> = {}): ToolSpec {
  return { tool, label, group, anchorCount, defaultStyle: { color: "chart-2", width: 1.7, dash: "solid", ...style } }
}

export const TOOL_SPECS: Readonly<Record<DrawingTool, ToolSpec>> = {
  trend: spec("trend", "Đường xu hướng", "line", 2),
  ray: spec("ray", "Tia", "line", 2),
  extended: spec("extended", "Đường kéo dài", "line", 2),
  horizontal: spec("horizontal", "Đường ngang", "line", 1),
  "horizontal-ray": spec("horizontal-ray", "Tia ngang", "line", 1),
  vertical: spec("vertical", "Đường dọc", "line", 1),
  channel: spec("channel", "Kênh song song", "channel", 3, { fill: true }),
  "fib-retracement": spec("fib-retracement", "Fibonacci thoái lui", "fib", 2, { color: "chart-5" }),
  "fib-extension": spec("fib-extension", "Fibonacci mở rộng", "fib", 3, { color: "chart-5" }),
  "fib-time-zones": spec("fib-time-zones", "Vùng thời gian Fibonacci", "fib", 2, { color: "chart-5" }),
  "fib-fan": spec("fib-fan", "Quạt Fibonacci", "fib", 2, { color: "chart-5" }),
  "fib-channel": spec("fib-channel", "Kênh Fibonacci", "fib", 3, { color: "chart-5", fill: true }),
  pitchfork: spec("pitchfork", "Pitchfork Andrews", "pitchfork", 3, { color: "chart-2", fill: true }),
  "gann-fan": spec("gann-fan", "Quạt Gann", "pitchfork", 2, { color: "chart-2" }),
  "gann-box": spec("gann-box", "Hộp Gann", "pitchfork", 2, { color: "chart-8", fill: true }),
  xabcd: spec("xabcd", "Mẫu hình XABCD", "pattern", 5, { color: "chart-1", fill: true }),
  "head-shoulders": spec("head-shoulders", "Vai đầu vai", "pattern", 7, { color: "chart-1", fill: true }),
  "triangle-pattern": spec("triangle-pattern", "Mẫu hình tam giác", "pattern", 4, { color: "chart-1", fill: true }),
  rectangle: spec("rectangle", "Hình chữ nhật", "shape", 2, { fill: true }),
  "elliott-5": spec("elliott-5", "Elliott 5 sóng", "wave", 6, { color: "chart-1" }),
  "elliott-abc": spec("elliott-abc", "Elliott ABC", "wave", 4, { color: "chart-1" }),
  note: spec("note", "Ghi chú", "annotation", 1, { color: "foreground" }),
  measure: spec("measure", "Thước đo", "measure", 2, { color: "chart-1", fill: true }),
  ...BASIC_TOOL_SPECS,
}

/** 36 công cụ theo thứ tự hiện trong menu: 23 công cụ có trước, rồi 13 công cụ của đợt 1. */
export const ALL_TOOLS: readonly DrawingTool[] = [
  "trend",
  "ray",
  "extended",
  "horizontal",
  "horizontal-ray",
  "vertical",
  "channel",
  "fib-retracement",
  "fib-extension",
  "fib-time-zones",
  "fib-fan",
  "fib-channel",
  "rectangle",
  "elliott-5",
  "elliott-abc",
  "note",
  "measure",
  "pitchfork",
  "gann-fan",
  "gann-box",
  "xabcd",
  "head-shoulders",
  "triangle-pattern",
  ...BASIC_TOOLS,
]

/**
 * Flashback dùng đủ 36 công cụ như `market` (§10, §12). Không có công cụ nào đọc thời gian thật hay nến chưa mở: điểm neo của Flashback
 * là `session`, nhãn khoảng thời gian chỉ có số nến (`rangeLabel`), nam châm chỉ hút vào nến đã mở (`snapToOhlc`). Test ở
 * `flashback-fairness.test.ts` kiểm từng công cụ. Biểu đồ SVG cũ (`?iqline=0`) không dùng thư viện này và vẫn chỉ có hai công cụ.
 */
export const FLASHBACK_TOOLS: readonly DrawingTool[] = ALL_TOOLS

export function isDrawingTool(value: unknown): value is DrawingTool {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TOOL_SPECS, value)
}

export function anchorCountOf(tool: DrawingTool): number {
  return TOOL_SPECS[tool].anchorCount
}

/** Số lần bấm để đặt xong hình (vị thế: 2, dù có 3 điểm neo). Công cụ nhiều điểm không có số cố định. */
export function clicksOf(tool: DrawingTool): number {
  return TOOL_SPECS[tool].clicks ?? TOOL_SPECS[tool].anchorCount
}

/** Công cụ có số điểm neo thay đổi (nét bút, đường gấp khúc). */
export function isVariableTool(tool: DrawingTool): boolean {
  return TOOL_SPECS[tool].variable !== undefined
}

/** Số điểm neo tối đa lưu được cho một hình của công cụ này. */
export function maxAnchorsOf(tool: DrawingTool): number {
  return TOOL_SPECS[tool].variable?.max ?? TOOL_SPECS[tool].anchorCount
}

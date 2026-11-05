/**
 * Mô tả chung của 14 công cụ vẽ (docs/iqline-design.md §10): số điểm neo, nhóm, nhãn và kiểu mặc định.
 * Mọi công cụ dùng chung một mô tả: danh sách điểm neo, cách vẽ (`commands.ts`), cách chọn (`hit-test.ts`).
 */
import type { DrawingStyle, DrawingTool } from "../types"

export type ToolGroup = "line" | "channel" | "fib" | "shape" | "wave" | "annotation"

export type ToolSpec = {
  tool: DrawingTool
  /** Tên hiển thị cho thanh công cụ và danh sách hình. */
  label: string
  group: ToolGroup
  /** Số điểm neo cần có để hình hoàn tất. */
  anchorCount: number
  /** Kiểu của hình mới vẽ. Màu chỉ lấy trong các token còn lại sau luật DESIGN.md (không dùng chart-3, chart-4, chart-7). */
  defaultStyle: DrawingStyle
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
  rectangle: spec("rectangle", "Hình chữ nhật", "shape", 2, { fill: true }),
  "elliott-5": spec("elliott-5", "Elliott 5 sóng", "wave", 6, { color: "chart-1" }),
  "elliott-abc": spec("elliott-abc", "Elliott ABC", "wave", 4, { color: "chart-1" }),
  note: spec("note", "Ghi chú", "annotation", 1, { color: "foreground" }),
  measure: spec("measure", "Thước đo", "annotation", 2, { color: "chart-1", fill: true }),
}

/** 14 công cụ theo thứ tự ở §10. */
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
  "rectangle",
  "elliott-5",
  "elliott-abc",
  "note",
  "measure",
]

/** Flashback chỉ có ba công cụ (§10, §12). */
export const FLASHBACK_TOOLS: readonly DrawingTool[] = ["trend", "fib-retracement", "horizontal"]

export function isDrawingTool(value: unknown): value is DrawingTool {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TOOL_SPECS, value)
}

export function anchorCountOf(tool: DrawingTool): number {
  return TOOL_SPECS[tool].anchorCount
}

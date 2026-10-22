/**
 * Main area of the DEMO TRADING section: the three tabs ("Biểu đồ", "Bảng giá", "Thị trường")
 * and the two main-area tools a rail button opens in place of the tabs: Insight and
 * Dashboard phân tích. `chart` is the default and the only value without a URL param.
 */
export type DemoContent = "chart" | "board" | "market" | "insight" | "dashboard"
export type DemoTab = Exclude<DemoContent, "insight" | "dashboard">

const VALID_CONTENT: DemoContent[] = ["chart", "board", "market", "insight", "dashboard"]

/** Hai công cụ thay vùng chính của DEMO TRADING: Insight và Dashboard phân tích. */
export function isMainTool(value: string): value is "insight" | "dashboard" {
  return value === "insight" || value === "dashboard"
}

/** Unknown values fall back to the chart; retired values are rewritten by the route loader first. */
export function parseDemoContent(value: string | null): DemoContent {
  return VALID_CONTENT.includes(value as DemoContent) ? (value as DemoContent) : "chart"
}

export function withDemoContent(params: URLSearchParams, content: DemoContent): URLSearchParams {
  const next = new URLSearchParams(params)
  if (content === "chart") next.delete("content")
  else next.set("content", content)
  return next
}

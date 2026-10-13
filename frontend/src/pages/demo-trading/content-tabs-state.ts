/**
 * Main area of the DEMO TRADING section: the three tabs ("Biểu đồ", "Bảng giá", "Thị trường")
 * and Insight, which a rail tool opens in place of the tabs. `chart` is the default and the only
 * value without a URL param.
 */
export type DemoContent = "chart" | "board" | "market" | "insight"
export type DemoTab = Exclude<DemoContent, "insight">

const VALID_CONTENT: DemoContent[] = ["chart", "board", "market", "insight"]

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

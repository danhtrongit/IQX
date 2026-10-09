/** Main-area tabs of the workspace. `overview` ("Tổng quan") is the default and the only tab without a URL param. */
export type DemoContent = "overview" | "chart" | "board" | "ai-analysis"

const VALID_CONTENT: DemoContent[] = ["overview", "chart", "board", "ai-analysis"]

/** Unknown values, including the retired `journey` tab, fall back to the overview. */
export function parseDemoContent(value: string | null): DemoContent {
  return VALID_CONTENT.includes(value as DemoContent) ? (value as DemoContent) : "overview"
}

export function withDemoContent(params: URLSearchParams, content: DemoContent): URLSearchParams {
  const next = new URLSearchParams(params)
  if (content === "overview") next.delete("content")
  else next.set("content", content)
  return next
}

export function withAnalysisView(params: URLSearchParams, analysis: "market" | "stock" | "financial"): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set("analysis", analysis)
  return next
}

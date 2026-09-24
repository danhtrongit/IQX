export type DemoContent = "journey" | "chart" | "board" | "ai-analysis"

const VALID_CONTENT: DemoContent[] = ["journey", "chart", "board", "ai-analysis"]

export function parseDemoContent(value: string | null): DemoContent {
  return VALID_CONTENT.includes(value as DemoContent) ? (value as DemoContent) : "journey"
}

export function withDemoContent(params: URLSearchParams, content: DemoContent): URLSearchParams {
  const next = new URLSearchParams(params)
  if (content === "journey") next.delete("content")
  else next.set("content", content)
  return next
}

export function withAnalysisView(params: URLSearchParams, analysis: "market" | "stock" | "financial"): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set("analysis", analysis)
  return next
}

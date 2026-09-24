/** Keep saved URLs useful without retaining separate workspace pages. */
export function demoRouteRedirect(content: "chart" | "board" | "ai-analysis", search: string, hash = "") {
  const params = new URLSearchParams(search)
  if (content === "ai-analysis") {
    const analysis = params.get("view")
    if (analysis && ["market", "stock", "financial"].includes(analysis)) {
      params.set("analysis", analysis)
      params.delete("view")
    }
  }
  params.set("content", content)
  return { pathname: "/demo-trading", search: `?${params}`, hash }
}

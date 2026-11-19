import { LEGACY_WORKSPACE_PATH, resolveWorkspaceLocation } from "@/pages/demo-trading/workspace-url"

/**
 * Keep saved URLs of the retired workspace pages useful (`/bieu-do`, `/bang-gia`, `/dashboard`,
 * `/thi-truong`): they open LUYỆN TẬP → Giao dịch on the matching main-area tab.
 */
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
  const resolved = resolveWorkspaceLocation(LEGACY_WORKSPACE_PATH, `?${params}`)
  return { pathname: resolved.pathname, search: resolved.search, hash }
}

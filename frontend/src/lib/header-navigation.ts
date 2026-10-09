import { demoChrome } from "@/config/chrome"
import { parseDemoContent } from "@/pages/demo-trading/content-tabs-state"
import { ACADEMY_VIEW, VIEW_PARAM, normalizeWorkspaceSearch } from "@/pages/demo-trading/workspace-url"

type NavigationLocation = { pathname: string; search: string }

/**
 * The workspace tool a /demo-trading URL shows. A missing, unknown or retired
 * view value is the Học viện tool, which is also the default of the workspace.
 */
function effectiveWorkspaceView(search: string): string {
  const view = new URLSearchParams(normalizeWorkspaceSearch(search).search).get(VIEW_PARAM)
  const known = demoChrome.items.some((item) => item.id === view && item.affects === "sidebar")
  return view && known ? view : demoChrome.defaultId
}

/** Content links must not reset the mounted workspace tool or selected symbol. */
export function headerDestination(to: string, location: NavigationLocation): string {
  const [pathname, search = ""] = to.split("?")
  if (pathname !== "/demo-trading" || location.pathname !== pathname) return to
  const target = new URLSearchParams(search)
  const next = new URLSearchParams(normalizeWorkspaceSearch(location.search).search)
  const content = target.get("content")
  if (content) next.set("content", content)
  else next.delete("content")
  const view = target.get(VIEW_PARAM)
  if (view === ACADEMY_VIEW) next.set(VIEW_PARAM, ACADEMY_VIEW)
  else if (view && effectiveWorkspaceView(location.search) === ACADEMY_VIEW) next.set(VIEW_PARAM, view)
  const query = next.toString()
  return `${pathname}${query ? `?${query}` : ""}`
}

/** React Router's pathname-only matching cannot distinguish our content tabs or tools. */
export function isHeaderLinkActive(to: string, location: NavigationLocation): boolean {
  const pathname = location.pathname === "/gioi-thieu" ? "/"
    : location.pathname === "/kien-thuc" ? "/bai-hoc" : location.pathname
  const [target, search = ""] = to.split("?")
  if (target === "/") return pathname === "/"
  if (pathname !== target && !pathname.startsWith(`${target}/`)) return false
  if (target !== "/demo-trading") return true
  const targetParams = new URLSearchParams(search)
  const expected = parseDemoContent(targetParams.get("content"))
  if (parseDemoContent(new URLSearchParams(location.search).get("content")) !== expected) return false
  // "Học viện" owns the academy tool; "Demo Trading" owns every other tool.
  const academyLink = targetParams.get(VIEW_PARAM) === ACADEMY_VIEW
  return academyLink === (effectiveWorkspaceView(location.search) === ACADEMY_VIEW)
}

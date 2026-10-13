import { sectionOfTool } from "@/config/chrome"
import { VIEW_PARAM, normalizeWorkspaceSearch } from "@/pages/demo-trading/workspace-url"
import { sectionOfSearch, sectionSearch, type WorkspaceMemory } from "@/pages/demo-trading/workspace-sections"

type NavigationLocation = { pathname: string; search: string }

const WORKSPACE = "/demo-trading"

/**
 * "Demo Trading" and "Học viện" open their workspace section as it was left in this session
 * (tool, tab, lesson...); inside the section they keep the current URL, so the mounted tool and
 * the selected symbol never reset.
 */
export function headerDestination(to: string, location: NavigationLocation, saved: WorkspaceMemory = {}): string {
  const [pathname, search = ""] = to.split("?")
  if (pathname !== WORKSPACE) return to
  const section = sectionOfTool(new URLSearchParams(search).get(VIEW_PARAM))
  const current = location.pathname === WORKSPACE ? normalizeWorkspaceSearch(location.search).search : ""
  if (location.pathname === WORKSPACE && sectionOfSearch(location.search) === section) return `${WORKSPACE}${current}`
  return `${WORKSPACE}${sectionSearch(section, current, saved)}`
}

/** React Router's pathname-only matching cannot tell the two workspace sections apart. */
export function isHeaderLinkActive(to: string, location: NavigationLocation): boolean {
  const pathname = location.pathname === "/gioi-thieu" ? "/"
    : location.pathname === "/kien-thuc" ? "/bai-hoc" : location.pathname
  const [target, search = ""] = to.split("?")
  if (target === "/") return pathname === "/"
  if (pathname !== target && !pathname.startsWith(`${target}/`)) return false
  if (target !== WORKSPACE) return true
  return sectionOfTool(new URLSearchParams(search).get(VIEW_PARAM)) === sectionOfSearch(location.search)
}

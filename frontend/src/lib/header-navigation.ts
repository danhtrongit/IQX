import { SECTION_PATH, sectionOfPath } from "@/config/chrome"
import { sectionSearch, type WorkspaceMemory } from "@/pages/demo-trading/workspace-sections"

type NavigationLocation = { pathname: string; search: string }

/**
 * "Luyện tập" and "Flashback" open their workspace section as it was left in this session (tool,
 * Giao dịch tab, lesson...); inside the section they keep the current URL, so the mounted tool and the
 * selected symbol never reset. Moving between the two sections carries the shared params (symbol...).
 */
export function headerDestination(to: string, location: NavigationLocation, saved: WorkspaceMemory = {}): string {
  const section = sectionOfPath(to)
  if (!section) return to
  const current = sectionOfPath(location.pathname)
  if (current === section) return `${location.pathname}${location.search}`
  return `${SECTION_PATH[section]}${sectionSearch(section, current ? location.search : "", saved)}`
}

export function isHeaderLinkActive(to: string, location: NavigationLocation): boolean {
  const pathname = location.pathname === "/gioi-thieu" ? "/"
    : location.pathname === "/kien-thuc" ? "/bai-hoc" : location.pathname
  const [target] = to.split("?")
  if (target === "/") return pathname === "/"
  return pathname === target || pathname.startsWith(`${target}/`)
}

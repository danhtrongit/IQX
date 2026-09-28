import { parseDemoContent } from "@/pages/demo-trading/content-tabs-state"

type NavigationLocation = { pathname: string; search: string }

/** Content links must not reset the mounted trading sidebar or selected symbol. */
export function headerDestination(to: string, location: NavigationLocation): string {
  const [pathname, search = ""] = to.split("?")
  if (pathname !== "/demo-trading" || location.pathname !== pathname) return to
  const next = new URLSearchParams(location.search)
  const content = new URLSearchParams(search).get("content")
  if (content) next.set("content", content)
  else next.delete("content")
  const query = next.toString()
  return `${pathname}${query ? `?${query}` : ""}`
}

/** React Router's pathname-only matching cannot distinguish our content tabs. */
export function isHeaderLinkActive(to: string, location: NavigationLocation): boolean {
  const pathname = location.pathname === "/gioi-thieu" ? "/"
    : location.pathname === "/kien-thuc" ? "/bai-hoc" : location.pathname
  const [target, search = ""] = to.split("?")
  if (target === "/") return pathname === "/"
  if (pathname !== target && !pathname.startsWith(`${target}/`)) return false
  if (target !== "/demo-trading") return true
  const expected = parseDemoContent(new URLSearchParams(search).get("content"))
  return parseDemoContent(new URLSearchParams(location.search).get("content")) === expected
}

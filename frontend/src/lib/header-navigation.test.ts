import { describe, expect, it } from "vitest"
import { HEADER_NAV } from "@/config/chrome"
import { headerDestination, isHeaderLinkActive } from "./header-navigation"

describe("shared header routing", () => {
  it.each([
    ["/", "", "Giới thiệu"],
    ["/demo-trading", "?view=trading", "Demo Trading"],
    ["/demo-trading", "?view=bot&symbol=FPT", "Demo Trading"],
    ["/demo-trading", "?view=academy", "Học viện"],
    ["/demo-trading", "", "Học viện"],
    ["/demo-trading", "?content=journey", "Học viện"],
    ["/demo-trading", "?view=journey", "Học viện"],
    ["/bai-hoc/course/episode", "", "Bài học"],
  ])("highlights exactly one item for %s%s", (pathname, search, label) => {
    expect(HEADER_NAV.filter(item => isHeaderLinkActive(item.to, { pathname, search })).map(item => item.label)).toEqual([label])
  })

  it("updates only content while keeping the sidebar, symbol, and AI selection", () => {
    const location = { pathname: "/demo-trading", search: "?content=board&view=trading&symbol=VNM&analysis=stock" }
    const result = headerDestination("/demo-trading?content=chart", location)
    expect(Object.fromEntries(new URLSearchParams(result.split("?")[1]))).toEqual({ content: "chart", view: "trading", symbol: "VNM", analysis: "stock" })
    expect(headerDestination("/co-phieu", location)).toBe("/co-phieu")
  })

  it("opens the academy tool on request and leaves the symbol alone", () => {
    const location = { pathname: "/demo-trading", search: "?view=hunt&symbol=FPT" }
    const result = headerDestination("/demo-trading?view=academy", location)
    expect(Object.fromEntries(new URLSearchParams(result.split("?")[1]))).toEqual({ view: "academy", symbol: "FPT" })
  })

  it("moves Demo Trading off the academy tool but never changes another tool", () => {
    const fromAcademy = headerDestination("/demo-trading?view=trading", { pathname: "/demo-trading", search: "?view=academy&symbol=VIC" })
    expect(Object.fromEntries(new URLSearchParams(fromAcademy.split("?")[1]))).toEqual({ view: "trading", symbol: "VIC" })
    const fromDefault = headerDestination("/demo-trading?view=trading", { pathname: "/demo-trading", search: "" })
    expect(fromDefault).toBe("/demo-trading?view=trading")
    const fromBot = headerDestination("/demo-trading?view=trading", { pathname: "/demo-trading", search: "?view=bot" })
    expect(fromBot).toBe("/demo-trading?view=bot")
    expect(headerDestination("/demo-trading?view=trading", { pathname: "/chien-luoc", search: "" })).toBe("/demo-trading?view=trading")
  })
})

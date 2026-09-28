import { describe, expect, it } from "vitest"
import { HEADER_NAV } from "@/config/chrome"
import { headerDestination, isHeaderLinkActive } from "./header-navigation"

describe("shared header routing", () => {
  it.each([
    ["/", "", "Giới thiệu"],
    ["/demo-trading", "?view=trading", "Demo Trading"],
    ["/demo-trading", "?content=journey", "Demo Trading"],
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
})

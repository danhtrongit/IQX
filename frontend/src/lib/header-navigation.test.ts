import { beforeEach, describe, expect, it } from "vitest"
import { HEADER_NAV } from "@/config/chrome"
import { workspaceMemory } from "@/pages/demo-trading/workspace-sections"
import { headerDestination, isHeaderLinkActive } from "./header-navigation"

const workspace = (search: string) => ({ pathname: "/demo-trading", search })
const params = (url: string) => Object.fromEntries(new URLSearchParams(url.split("?")[1]))

beforeEach(() => workspaceMemory.reset())

describe("shared header routing", () => {
  it.each([
    ["/", "", "Giới thiệu"],
    ["/demo-trading", "?view=trading", "Demo Trading"],
    ["/demo-trading", "?view=bot&symbol=FPT", "Học viện"],
    ["/demo-trading", "?view=shop", "Học viện"],
    ["/demo-trading", "?view=academy", "Học viện"],
    ["/demo-trading", "", "Demo Trading"],
    ["/demo-trading", "?content=board", "Demo Trading"],
    ["/demo-trading", "?view=hunt", "Demo Trading"],
    ["/demo-trading", "?content=journey", "Demo Trading"],
    ["/demo-trading", "?view=journey", "Học viện"],
    ["/bai-hoc/course/episode", "", "Bài học"],
  ])("highlights exactly one item for %s%s", (pathname, search, label) => {
    expect(HEADER_NAV.filter(item => isHeaderLinkActive(item.to, { pathname, search })).map(item => item.label)).toEqual([label])
  })

  it("keeps the current URL when the link's section is already open", () => {
    const location = workspace("?content=board&view=trading&symbol=VNM")
    expect(headerDestination("/demo-trading?view=trading", location)).toBe("/demo-trading?content=board&view=trading&symbol=VNM")
    expect(headerDestination("/demo-trading?view=academy", workspace("?view=bot&symbol=FPT"))).toBe("/demo-trading?view=bot&symbol=FPT")
    expect(headerDestination("/co-phieu", location)).toBe("/co-phieu")
    expect(headerDestination("/", location)).toBe("/")
  })

  it("normalises a retired current URL instead of copying it", () => {
    expect(headerDestination("/demo-trading?view=academy", workspace("?view=journey&symbol=FPT"))).toBe("/demo-trading?view=academy&symbol=FPT")
  })

  it("opens the default tool of the other section and leaves shared params alone", () => {
    const toAcademy = headerDestination("/demo-trading?view=academy", workspace("?view=hunt&symbol=FPT&content=board"))
    expect(params(toAcademy)).toEqual({ view: "academy", symbol: "FPT" })
    const toDemo = headerDestination("/demo-trading?view=trading", workspace("?view=academy&symbol=VIC&lesson=ch01-l01"))
    expect(params(toDemo)).toEqual({ view: "trading", symbol: "VIC" })
  })

  it("opens a section's default tool when coming from another page", () => {
    expect(headerDestination("/demo-trading?view=trading", { pathname: "/chien-luoc", search: "" })).toBe("/demo-trading?view=trading")
    expect(headerDestination("/demo-trading?view=academy", { pathname: "/", search: "?symbol=X" })).toBe("/demo-trading?view=academy")
  })

  it("opens a section as it was left when memory has it", () => {
    workspaceMemory.remember("academy", "?view=bot&lesson=ch01-l01")
    workspaceMemory.remember("demo", "?view=portfolio&content=market")
    expect(params(headerDestination("/demo-trading?view=academy", workspace("?view=trading&symbol=FPT"), workspaceMemory.get())))
      .toEqual({ view: "bot", lesson: "ch01-l01", symbol: "FPT" })
    expect(params(headerDestination("/demo-trading?view=trading", workspace("?view=shop&symbol=FPT"), workspaceMemory.get())))
      .toEqual({ view: "portfolio", content: "market", symbol: "FPT" })
    expect(params(headerDestination("/demo-trading?view=trading", { pathname: "/chien-luoc", search: "" }, workspaceMemory.get())))
      .toEqual({ view: "portfolio", content: "market" })
    // Inside the section the memory does not override the current URL.
    expect(headerDestination("/demo-trading?view=academy", workspace("?view=shop"))).toBe("/demo-trading?view=shop")
  })
})

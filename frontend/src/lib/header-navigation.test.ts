import { beforeEach, describe, expect, it } from "vitest"
import { HEADER_NAV } from "@/config/chrome"
import { workspaceMemory } from "@/pages/demo-trading/workspace-sections"
import { headerDestination, isHeaderLinkActive } from "./header-navigation"

const practice = (search: string) => ({ pathname: "/luyen-tap", search })
const flashback = (search: string) => ({ pathname: "/flashback", search })

beforeEach(() => workspaceMemory.reset())

describe("shared header routing", () => {
  it.each([
    ["/", "", "Giới thiệu"],
    ["/gioi-thieu", "", "Giới thiệu"],
    ["/luyen-tap", "?tool=giao-dich&tab=dat-lenh", "Luyện tập"],
    ["/luyen-tap", "?tool=bot&symbol=FPT", "Luyện tập"],
    ["/luyen-tap", "", "Luyện tập"],
    ["/flashback", "?tool=shop", "Flashback"],
    ["/flashback", "", "Flashback"],
    ["/chien-luoc", "?tab=backtest", "Chiến lược"],
    ["/khu-giao-dich", "", "Khu giao dịch"],
    ["/bai-hoc/course/episode", "", "Bài học"],
  ])("highlights exactly one item for %s%s", (pathname, search, label) => {
    expect(HEADER_NAV.filter(item => isHeaderLinkActive(item.to, { pathname, search })).map(item => item.label)).toEqual([label])
  })

  it("does not highlight Flashback on the admin Flashback page", () => {
    expect(HEADER_NAV.filter(item => isHeaderLinkActive(item.to, { pathname: "/admin/flashback", search: "" }))).toEqual([])
  })

  it("keeps the current URL when the link's section is already open", () => {
    expect(headerDestination("/luyen-tap", practice("?tool=giao-dich&tab=danh-muc&content=board&symbol=VNM"))).toBe("/luyen-tap?tool=giao-dich&tab=danh-muc&content=board&symbol=VNM")
    expect(headerDestination("/flashback", flashback("?tool=shop&symbol=FPT"))).toBe("/flashback?tool=shop&symbol=FPT")
    expect(headerDestination("/co-phieu", practice("?tool=bot"))).toBe("/co-phieu")
    expect(headerDestination("/", practice(""))).toBe("/")
  })

  it("opens the default tool of the other section and carries the shared params", () => {
    expect(headerDestination("/flashback", practice("?tool=giao-dich&tab=danh-muc&symbol=FPT&content=board"))).toBe("/flashback?tool=flashback&symbol=FPT")
    expect(headerDestination("/luyen-tap", flashback("?tool=shop&symbol=VIC"))).toBe("/luyen-tap?tool=candle-dojo&symbol=VIC")
  })

  it("opens a section's default tool when coming from another page", () => {
    expect(headerDestination("/luyen-tap", { pathname: "/chien-luoc", search: "" })).toBe("/luyen-tap?tool=candle-dojo")
    expect(headerDestination("/flashback", { pathname: "/", search: "?symbol=X" })).toBe("/flashback?tool=flashback")
  })

  it("opens each section as it was left (tool, Giao dịch tab)", () => {
    workspaceMemory.remember("practice", "?tool=giao-dich&tab=tin-tuc&content=market")
    workspaceMemory.remember("flashback", "?tool=shop")
    expect(headerDestination("/luyen-tap", flashback("?tool=shop&symbol=FPT"), workspaceMemory.get())).toBe("/luyen-tap?tool=giao-dich&tab=tin-tuc&content=market&symbol=FPT")
    expect(headerDestination("/flashback", practice("?tool=bot"), workspaceMemory.get())).toBe("/flashback?tool=shop")
    expect(headerDestination("/luyen-tap", { pathname: "/chien-luoc", search: "" }, workspaceMemory.get())).toBe("/luyen-tap?tool=giao-dich&tab=tin-tuc&content=market")
    // Inside the section the memory does not override the current URL.
    expect(headerDestination("/flashback", flashback("?tool=flashback"), workspaceMemory.get())).toBe("/flashback?tool=flashback")
  })
})

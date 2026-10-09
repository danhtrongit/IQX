import { describe, expect, it } from "vitest"

import { HEADER_NAV, demoChrome } from "./chrome"

const visible = demoChrome.items.filter((item) => !item.hidden)

describe("demo workspace chrome", () => {
  it("lists the rail tools in the approved v4 order, Shop directly under Bot", () => {
    expect(visible.map((item) => [item.id, item.label])).toEqual([
      ["academy", "Học viện"],
      ["trading", "Đặt lệnh"],
      ["portfolio", "Danh mục"],
      ["bot", "Bot"],
      ["shop", "Shop"],
      ["hunt", "Săn mã"],
      ["news", "Tin tức"],
      ["patterns", "Mẫu nến"],
    ])
    const ids = visible.map((item) => item.id)
    expect(ids.indexOf("shop")).toBe(ids.indexOf("bot") + 1)
  })

  it("opens on Học viện", () => {
    expect(demoChrome.defaultId).toBe("academy")
    expect(demoChrome.items.find((item) => item.id === demoChrome.defaultId)?.affects).toBe("sidebar")
  })

  it("no longer has the journey, identity or level-analysis tools", () => {
    const ids = demoChrome.items.map((item) => item.id)
    for (const retired of ["journey", "identity", "analysis"]) expect(ids).not.toContain(retired)
    expect(demoChrome.items.some((item) => /hành trình/i.test(item.label))).toBe(false)
  })

  it("keeps AI Phân Tích as a URL-addressable main tab, outside the rail", () => {
    const ai = demoChrome.items.find((item) => item.id === "ai-analysis")
    expect(ai).toMatchObject({ affects: "left", hidden: true })
  })

  it("has Demo Trading and Học viện entries in the header that open workspace tools", () => {
    const entries = Object.fromEntries(HEADER_NAV.map((item) => [item.label, item.to]))
    expect(entries["Demo Trading"]).toBe("/demo-trading?view=trading")
    expect(entries["Học viện"]).toBe("/demo-trading?view=academy")
  })
})

import { describe, expect, it } from "vitest"

import { HEADER_NAV, SECTION_DEFAULT_TOOL, demoChrome, sectionOfTool } from "./chrome"

const visible = demoChrome.items.filter((item) => !item.hidden)

const inSection = (section: "demo" | "academy") => visible.filter((item) => item.section === section)

describe("demo workspace chrome", () => {
  it("lists the DEMO TRADING rail tools in order: Đặt lệnh, Danh mục, Tin tức, Insight", () => {
    expect(inSection("demo").map((item) => [item.id, item.label])).toEqual([
      ["trading", "Đặt lệnh"],
      ["portfolio", "Danh mục"],
      ["news", "Tin tức"],
      ["insight", "Insight"],
    ])
  })

  it("lists the HỌC VIỆN rail tools in order: Học viện, Bot, Shop", () => {
    expect(inSection("academy").map((item) => [item.id, item.label])).toEqual([
      ["academy", "Học viện"],
      ["bot", "Bot"],
      ["shop", "Shop"],
    ])
    expect(visible).toHaveLength(7)
  })

  it("hides Săn mã and Mẫu nến from the rail", () => {
    const hidden = demoChrome.items.filter((item) => item.hidden).map((item) => item.id)
    expect(hidden).toEqual(["hunt", "patterns"])
  })

  it("opens on Đặt lệnh (DEMO TRADING)", () => {
    expect(demoChrome.defaultId).toBe("trading")
    expect(demoChrome.items.find((item) => item.id === demoChrome.defaultId)?.affects).toBe("sidebar")
    expect(SECTION_DEFAULT_TOOL).toEqual({ demo: "trading", academy: "academy" })
  })

  it("Insight replaces the main area; every other tool fills the panel", () => {
    for (const item of demoChrome.items) expect(item.affects).toBe(item.id === "insight" ? "left" : "sidebar")
  })

  it("maps tools to sections, with anything unknown falling in DEMO TRADING", () => {
    for (const id of ["academy", "bot", "shop"]) expect(sectionOfTool(id)).toBe("academy")
    for (const id of ["trading", "portfolio", "news", "insight", "hunt", "patterns", "unknown", "journey", null]) {
      expect(sectionOfTool(id)).toBe("demo")
    }
  })

  it("no longer has the journey, identity or level-analysis tools", () => {
    const ids = demoChrome.items.map((item) => item.id)
    for (const retired of ["journey", "identity", "analysis"]) expect(ids).not.toContain(retired)
    expect(demoChrome.items.some((item) => /hành trình/i.test(item.label))).toBe(false)
  })

  it("no longer has the AI Phân Tích tool", () => {
    expect(demoChrome.items.some((item) => item.id === "ai-analysis")).toBe(false)
  })

  it("has Demo Trading and Học viện entries in the header that open workspace tools", () => {
    const entries = Object.fromEntries(HEADER_NAV.map((item) => [item.label, item.to]))
    expect(entries["Demo Trading"]).toBe("/demo-trading?view=trading")
    expect(entries["Học viện"]).toBe("/demo-trading?view=academy")
  })

  it("keeps Bài học routable but hidden from the header by default", () => {
    expect(HEADER_NAV.find((item) => item.label === "Bài học")).toMatchObject({ to: "/bai-hoc", hidden: true })
    expect(HEADER_NAV.filter((item) => !item.hidden).map((item) => item.label)).toEqual([
      "Giới thiệu",
      "Demo Trading",
      "Chiến lược",
      "Học viện",
    ])
  })
})

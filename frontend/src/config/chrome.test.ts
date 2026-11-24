import { describe, expect, it } from "vitest"

import { HEADER_NAV, INSIGHT_ENABLED, flashbackChrome, practiceChrome, sectionOfPath, sectionOfTool } from "./chrome"

const visible = (items: typeof practiceChrome.items) => items.filter((item) => !item.hidden).map((item) => [item.id, item.label])

describe("workspace chrome (layout v1.3)", () => {
  it("lists the LUYỆN TẬP rail in order: Candle Dojo, Học viện, Bot, Giao dịch, Dashboard phân tích, Toàn cảnh thị trường", () => {
    expect(visible(practiceChrome.items)).toEqual([
      ["candle-dojo", "Candle Dojo"],
      ["hoc-vien", "Học viện"],
      ["bot", "Bot"],
      ["giao-dich", "Giao dịch"],
      ["phan-tich", "Dashboard phân tích"],
      ["toan-canh", "Toàn cảnh thị trường"],
    ])
    expect(practiceChrome.param).toBe("tool")
    expect(practiceChrome.defaultId).toBe("candle-dojo")
  })

  it("lists the FLASHBACK rail in order: Flashback, Shop", () => {
    expect(visible(flashbackChrome.items)).toEqual([
      ["flashback", "Flashback"],
      ["shop", "Shop"],
    ])
    expect(flashbackChrome.defaultId).toBe("flashback")
  })

  it("keeps Insight, Săn mã and Mẫu nến in the code but hidden from every rail", () => {
    expect(practiceChrome.items.filter((item) => item.hidden).map((item) => item.id)).toEqual(["insight", "hunt", "patterns"])
    expect(flashbackChrome.items.some((item) => item.hidden)).toBe(false)
    expect(INSIGHT_ENABLED).toBe(false)
    for (const chrome of [practiceChrome, flashbackChrome]) {
      expect(chrome.items.filter((item) => !item.hidden).map((item) => item.label)).not.toContain("Insight")
    }
  })

  it("maps tools and paths to sections", () => {
    for (const id of ["candle-dojo", "hoc-vien", "bot", "giao-dich", "phan-tich", "toan-canh", "insight", "hunt"]) expect(sectionOfTool(id)).toBe("practice")
    for (const id of ["flashback", "shop"]) expect(sectionOfTool(id)).toBe("flashback")
    for (const id of ["trading", "academy", "unknown", null]) expect(sectionOfTool(id)).toBeNull()
    expect(sectionOfPath("/luyen-tap")).toBe("practice")
    expect(sectionOfPath("/flashback")).toBe("flashback")
    expect(sectionOfPath("/demo-trading")).toBeNull()
    expect(sectionOfPath("/admin/flashback")).toBeNull()
  })

  it("has GIỚI THIỆU · LUYỆN TẬP · FLASHBACK · CHIẾN LƯỢC in the header, then Khu giao dịch (unified route); Bài học hidden", () => {
    expect(HEADER_NAV.find((item) => item.label === "Bài học")).toMatchObject({ to: "/bai-hoc", hidden: true })
    expect(HEADER_NAV.filter((item) => !item.hidden).map((item) => [item.label, item.to])).toEqual([
      ["Giới thiệu", "/"],
      ["Luyện tập", "/luyen-tap"],
      ["Flashback", "/flashback"],
      ["Chiến lược", "/chien-luoc"],
      ["Khu giao dịch", "/khu-giao-dich"],
    ])
    expect(HEADER_NAV.some((item) => /Demo Trading|Học viện|Văn phòng/.test(item.label))).toBe(false)
  })
})

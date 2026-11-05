import { describe, expect, it } from "vitest"

import { iqlineEnabled } from "./iqline-flag"

const url = (search: string) => new URLSearchParams(search)

describe("iqlineEnabled", () => {
  it("mặc định bật ở cả ba loại nơi dùng", () => {
    for (const place of ["market", "flashback", "static"] as const) expect(iqlineEnabled(place, url(""), [])).toBe(true)
    expect(iqlineEnabled("market", url("symbol=FPT&interval=D"), [])).toBe(true)
  })

  it("VITE_IQLINE_OFF tắt đúng nơi được nêu", () => {
    expect(iqlineEnabled("market", url(""), ["market"])).toBe(false)
    expect(iqlineEnabled("flashback", url(""), ["market"])).toBe(true)
    expect(iqlineEnabled("static", url(""), ["market", "static"])).toBe(false)
  })

  it("tham số URL thắng cờ build; giá trị lạ bị bỏ qua", () => {
    expect(iqlineEnabled("market", url("iqline=0"), [])).toBe(false)
    expect(iqlineEnabled("market", url("iqline=1"), ["market"])).toBe(true)
    for (const value of ["true", "", "2"]) expect(iqlineEnabled("market", url(`iqline=${value}`), [])).toBe(true)
  })
})

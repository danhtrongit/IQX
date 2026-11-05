import { afterEach, describe, expect, it } from "vitest"

import { iqlineFlashbackEnabled } from "./iqline-flag"

afterEach(() => window.history.replaceState(null, "", "/"))

describe("iqlineFlashbackEnabled", () => {
  it("mặc định tắt: Flashback vẫn dùng biểu đồ SVG", () => {
    expect(iqlineFlashbackEnabled("")).toBe(false)
    expect(iqlineFlashbackEnabled("?room=482913")).toBe(false)
  })

  it("chỉ bật khi iqline=1, cùng luật với /bieu-do", () => {
    expect(iqlineFlashbackEnabled("?iqline=1")).toBe(true)
    expect(iqlineFlashbackEnabled("?room=482913&iqline=1")).toBe(true)
    for (const value of ["0", "true", "", "2"]) expect(iqlineFlashbackEnabled(`?iqline=${value}`)).toBe(false)
  })

  it("không đưa tham số thì đọc URL của trang", () => {
    expect(iqlineFlashbackEnabled()).toBe(false)
    window.history.replaceState(null, "", "/?iqline=1")
    expect(iqlineFlashbackEnabled()).toBe(true)
  })
})

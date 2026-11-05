import { describe, expect, it } from "vitest"

import { getIndicator, listIndicators, validateIndicatorParams } from "@/lib/iqline/indicators"
import { tryIndicatorHref } from "@/pages/charts/chart/try-indicator-param"
import { indicatorOfLesson, lessonIndicatorEntries } from "./lesson-indicator"
import { buildCatalog, catalogItemsOf } from "./test-fixtures"

/** Bảng "Bài học" của docs/iqline-design.md §9, theo đúng thứ tự trong tài liệu. */
const DESIGN_TABLE: [string, string][] = [
  ["ch04-l04", "volume"],
  ["ch04-l05", "ma"],
  ["ch04-l08", "bollinger"],
  ["ch06-l01", "ema"],
  ["ch06-l02", "ma_cross"],
  ["ch06-l04", "donchian"],
  ["ch04-l06", "rsi"],
  ["ch04-l07", "macd"],
  ["ch06-l03", "dmi"],
  ["ch07-l01", "stochastic"],
  ["ch07-l02", "cci"],
  ["ch07-l03", "roc"],
  ["ch07-l04", "williams_r"],
  ["ch07-l05", "obv"],
  ["ch07-l06", "mfi"],
  ["ch07-l07", "cmf"],
]

describe("indicatorOfLesson", () => {
  it("khớp bảng bài học ở §9 của thiết kế, đúng 16 bài", () => {
    expect(lessonIndicatorEntries()).toHaveLength(16)
    expect([...lessonIndicatorEntries()].sort()).toEqual([...DESIGN_TABLE].sort())
    expect(indicatorOfLesson("ch04-l06")).toBe("rsi")
  })

  it("mỗi id là chỉ báo có trong danh mục, tham số mặc định hợp lệ, và không trùng", () => {
    const catalog = new Set(listIndicators({ flashback: true }).map((definition) => definition.id))
    const ids = lessonIndicatorEntries().map(([, id]) => id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(getIndicator(id), id).toBeDefined()
      expect(catalog.has(id), id).toBe(true)
      expect(validateIndicatorParams(id, {}), id).toBeNull()
    }
    // 16 chỉ báo của danh mục, mỗi chỉ báo có đúng một bài.
    expect([...catalog].sort()).toEqual([...ids].sort())
  })

  it("khớp lesson_key technical:<id> của danh mục: bài nào có khoá đó thì có chỉ báo đó, bài khác thì không", () => {
    const items = catalogItemsOf(buildCatalog())
    let withIndicator = 0
    for (const item of items) {
      const technical = item.lesson_key.startsWith("technical:") ? item.lesson_key.slice("technical:".length) : null
      expect(indicatorOfLesson(item.id), item.id).toBe(technical)
      if (technical) withIndicator += 1
    }
    expect(withIndicator).toBe(16)
  })

  it("bài không dạy chỉ báo, bài thi, phòng tập, id lạ hoặc rỗng thì không có chỉ báo", () => {
    for (const id of ["ch01-l01", "ch08-l01", "ch04-l01", "ch04-exam", "ch03-practice", "ch99-l01", "", "constructor", "__proto__", "toString"]) {
      expect(indicatorOfLesson(id), id).toBeNull()
    }
    expect(indicatorOfLesson(null)).toBeNull()
    expect(indicatorOfLesson(undefined)).toBeNull()
  })

  it("liên kết mở /bieu-do với chi-bao là id chỉ báo của bài", () => {
    expect(tryIndicatorHref(indicatorOfLesson("ch04-l06") as string)).toBe("/bieu-do?chi-bao=rsi")
    expect(tryIndicatorHref("williams_r")).toBe("/bieu-do?chi-bao=williams_r")
  })
})

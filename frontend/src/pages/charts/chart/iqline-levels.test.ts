import { describe, expect, it } from "vitest"

import { priceLevelsFromQuote } from "./iqline-levels"

describe("priceLevelsFromQuote", () => {
  it("bảng giá tính VND, nến tính nghìn đồng: chia 1.000", () => {
    expect(priceLevelsFromQuote("FPT", { reference: 66_500, ceiling: 71_100, floor: 61_900 })).toEqual({ reference: 66.5, ceiling: 71.1, floor: 61.9 })
  })

  it("mức nào thiếu thì bỏ mức đó, không đặt 0", () => {
    expect(priceLevelsFromQuote("FPT", { reference: 66_500, ceiling: null, floor: null })).toEqual({ reference: 66.5 })
  })

  it("chưa có báo giá hoặc không có mức nào thì không vẽ gì", () => {
    expect(priceLevelsFromQuote("FPT", null)).toBeUndefined()
    expect(priceLevelsFromQuote("FPT", undefined)).toBeUndefined()
    expect(priceLevelsFromQuote("FPT", { reference: null, ceiling: null, floor: null })).toBeUndefined()
  })

  it("chỉ số không có trần sàn: không vẽ, không phân biệt hoa thường", () => {
    const quote = { reference: 1_300, ceiling: 1_400, floor: 1_200 }
    expect(priceLevelsFromQuote("VNINDEX", quote)).toBeUndefined()
    expect(priceLevelsFromQuote("vn30", quote)).toBeUndefined()
  })
})

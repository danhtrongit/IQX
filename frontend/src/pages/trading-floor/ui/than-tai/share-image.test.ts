import { describe, expect, it } from "vitest"

import {
  SHARE_URL,
  buildCaption,
  clampLines,
  wrapClamp,
  wrapText,
} from "./share-image.ts"

/** Every character is 10 px wide. */
const measure = (text: string): number => Array.from(text).length * 10

describe("buildCaption", () => {
  it("names the quẻ, its rank, the closing line and the link", () => {
    expect(
      buildCaption({
        hang: "dai_cat",
        chot: "Thuận buồm xuôi gió.",
        que: { ten: "Thiên Địa Thái" },
      })
    ).toBe(
      `Quẻ hôm nay của tôi: Thiên Địa Thái (Đại cát). Thuận buồm xuôi gió. Gieo quẻ tại ${SHARE_URL}`
    )
  })
})

describe("wrapText", () => {
  it("breaks at spaces without passing the width", () => {
    const lines = wrapText("một hai ba bốn năm sáu", 100, measure)
    expect(lines).toEqual(["một hai ba", "bốn năm", "sáu"])
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(100)
  })

  it("cuts a word wider than a line", () => {
    expect(wrapText("abcdefghijkl", 50, measure)).toEqual([
      "abcde",
      "fghij",
      "kl",
    ])
  })

  it("keeps paragraphs and drops trailing blanks", () => {
    expect(wrapText("a b\n\nc\n", 100, measure)).toEqual(["a b", "", "c"])
    expect(wrapText("", 100, measure)).toEqual([""])
  })
})

describe("clampLines", () => {
  it("returns the lines untouched when they fit", () => {
    expect(clampLines(["a", "b"], 2, 100, measure)).toEqual(["a", "b"])
  })

  it("ends the last kept line with an ellipsis that still fits", () => {
    const out = clampLines(["aaaaaaaaaa", "bbbbbbbbbb", "cc"], 2, 100, measure)
    expect(out).toHaveLength(2)
    expect(out[1].endsWith("…")).toBe(true)
    expect(measure(out[1])).toBeLessThanOrEqual(100)
    expect(out[0]).toBe("aaaaaaaaaa")
  })

  it("returns nothing for zero lines", () => {
    expect(clampLines(["a"], 0, 100, measure)).toEqual([])
  })
})

describe("wrapClamp", () => {
  it("wraps then clamps to the room available", () => {
    const out = wrapClamp(
      "một hai ba bốn năm sáu bảy tám chín mười",
      100,
      2,
      measure
    )
    expect(out).toHaveLength(2)
    expect(out[1].endsWith("…")).toBe(true)
    for (const l of out) expect(measure(l)).toBeLessThanOrEqual(100)
  })
})

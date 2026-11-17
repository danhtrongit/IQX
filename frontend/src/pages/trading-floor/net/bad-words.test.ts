import { describe, expect, it } from "vitest"

import { hasBadWords } from "./bad-words.ts"

describe("hasBadWords", () => {
  it.each([
    "đm mày",
    "dit me no",
    "Đ.M",
    "con cặc",
    "fuck you",
    "d i t m e",
    "ĐỤ",
    "thằng đĩ",
    "Đéo biết",
    "vcl luôn",
    "v.c.l",
  ])("blocks %s", (text) => expect(hasBadWords(text)).toBe(true))

  it.each([
    "các bạn ơi",
    "lon bia",
    "du lịch",
    "đụng đỉnh",
    "đĩa cơm",
    "cứu với",
    "VNINDEX lên 2000",
    "vl xin chào",
    "Thần Tài phù hộ",
    "dương lịch",
  ])("allows %s", (text) => expect(hasBadWords(text)).toBe(false))
})

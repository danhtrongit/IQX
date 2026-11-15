import { describe, expect, it } from "vitest"

import type { AdminLa } from "@/pages/trading-floor/net/types"

import { filterLa, isHex, parseNganh, wordCount } from "./form"

const la = (over: Partial<AdminLa>): AdminLa => ({
  id: 1,
  queId: 3,
  queTen: "Thủy Lôi Truân",
  chuHan: "水雷屯",
  hao: "100010",
  queTren: "kham",
  queDuoi: "chan",
  tuong: "",
  thoan: "",
  thoanNghia: "",
  haoDong: 3,
  tenHao: "Lục Tam",
  haoVan: "",
  haoNghia: "",
  hang: "than_trong",
  luan: "",
  chot: "Không hiểu đường rừng, chớ đuổi hươu.",
  active: true,
  updatedAt: 0,
  ...over,
})

describe("than-tai admin form", () => {
  it("counts words", () => {
    expect(wordCount("  Mây đã lên,  mưa sẽ tới. ")).toBe(6)
    expect(wordCount("")).toBe(0)
  })

  it("splits industries by line or comma, without blanks or duplicates", () => {
    expect(parseNganh("Ngân hàng\n chứng khoán , \nNgân  hàng\n\nThép")).toEqual([
      "Ngân hàng",
      "chứng khoán",
      "Thép",
    ])
  })

  it("checks hex colours", () => {
    expect(isHex("#2563eb")).toBe(true)
    expect(isHex("2563eb")).toBe(false)
    expect(isHex("#fff")).toBe(false)
  })

  it("filters by name without accents, rank and active state", () => {
    const rows = [la({ id: 1 }), la({ id: 2, queId: 11, queTen: "Địa Thiên Thái", chuHan: "地天泰", hang: "dai_cat", active: false })]
    expect(filterLa(rows, { query: "dia thien", hang: "all", active: "all" }).map((r) => r.id)).toEqual([2])
    expect(filterLa(rows, { query: "", hang: "dai_cat", active: "all" }).map((r) => r.id)).toEqual([2])
    expect(filterLa(rows, { query: "", hang: "all", active: "on" }).map((r) => r.id)).toEqual([1])
    expect(filterLa(rows, { query: "11", hang: "all", active: "all" }).map((r) => r.id)).toEqual([2])
    expect(filterLa(rows, { query: "水雷", hang: "all", active: "all" }).map((r) => r.id)).toEqual([1])
  })
})

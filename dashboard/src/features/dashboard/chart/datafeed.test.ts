import { describe, it, expect } from "vitest"
import { extractSearchItems } from "./search-utils"

describe("extractSearchItems (symbols/search response shapes)", () => {
  it("reads { items } — the real endpoint shape (regression: chart search was empty)", () => {
    expect(extractSearchItems({ items: [{ symbol: "VCB" }] })).toEqual([{ symbol: "VCB" }])
  })
  it("reads { data }", () => {
    expect(extractSearchItems({ data: [{ symbol: "FPT" }] })).toEqual([{ symbol: "FPT" }])
  })
  it("reads a bare array", () => {
    expect(extractSearchItems([{ symbol: "HPG" }])).toEqual([{ symbol: "HPG" }])
  })
  it("falls back to [] when nothing matches", () => {
    expect(extractSearchItems({})).toEqual([])
    expect(extractSearchItems(null)).toEqual([])
    expect(extractSearchItems({ items: "nope" })).toEqual([])
  })
})

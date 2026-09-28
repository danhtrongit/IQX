import { describe, expect, it } from "vitest"

import { extractSearchItems } from "./search-utils"

describe("extractSearchItems", () => {
  it("returns bare result arrays", () => {
    const rows = [{ symbol: "FPT" }]
    expect(extractSearchItems(rows)).toBe(rows)
  })

  it("extracts the canonical data envelope and legacy items envelope", () => {
    const rows = [{ symbol: "FPT" }]
    expect(extractSearchItems({ data: rows })).toBe(rows)
    expect(extractSearchItems({ items: rows })).toBe(rows)
  })

  it.each([null, undefined, {}, { data: null }, { data: "invalid" }, { items: {} }])(
    "returns an empty array for missing or malformed payloads (%j)",
    (payload) => {
      expect(extractSearchItems(payload)).toEqual([])
    },
  )
})

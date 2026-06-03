import { describe, it, expect } from "vitest"
import { moduleNote, hasAnyAi } from "../src/components/stock/bctc-ai"

describe("bctc-ai", () => {
  it("moduleNote returns note for id or empty", () => {
    const ai = { memo: "m", modules: { dupont: "x" } }
    expect(moduleNote(ai, "dupont")).toBe("x")
    expect(moduleNote(ai, "wcc")).toBe("")
    expect(moduleNote(null, "dupont")).toBe("")
  })
  it("hasAnyAi", () => {
    expect(hasAnyAi({ memo: "m", modules: {} })).toBe(true)
    expect(hasAnyAi({ memo: "", modules: {} })).toBe(false)
    expect(hasAnyAi(null)).toBe(false)
  })
})

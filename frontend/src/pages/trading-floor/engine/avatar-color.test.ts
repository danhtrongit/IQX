import { describe, expect, it } from "vitest"

import {
  AVATARS,
  OUTFIT_COLORS,
  cleanOutfitColor,
  normalizeAvatarId,
} from "../net/types.ts"
import { hexToRgb, recolorRgbaBuffer } from "./recolor.ts"

describe("avatar catalogue and outfit colors", () => {
  it("provides 5 male and 5 female avatars", () => {
    const males = AVATARS.filter((a) => a.gender === "male")
    const females = AVATARS.filter((a) => a.gender === "female")
    expect(males.map((a) => a.id)).toEqual([
      "male01",
      "male02",
      "male03",
      "male04",
      "male05",
    ])
    expect(females.map((a) => a.id)).toEqual([
      "female01",
      "female02",
      "female03",
      "female04",
      "female05",
    ])
    expect(OUTFIT_COLORS.length).toBeGreaterThanOrEqual(8)
  })

  it("accepts catalogue ids only, with no legacy aliases", () => {
    expect(normalizeAvatarId("male01")).toBe("male01")
    expect(normalizeAvatarId("female03")).toBe("female03")
    expect(normalizeAvatarId("broker01")).toBeNull()
    expect(normalizeAvatarId("saco")).toBeNull()
    expect(normalizeAvatarId("unknown-avatar")).toBeNull()
    expect(normalizeAvatarId(123)).toBeNull()
  })

  it("validates outfit color ids with clean fallback", () => {
    expect(cleanOutfitColor("burgundy")).toBe("burgundy")
    expect(cleanOutfitColor("gold")).toBe("gold")
    expect(cleanOutfitColor("invalid")).toBe("default")
    expect(cleanOutfitColor(undefined)).toBe("default")
  })
})

describe("recolorRgbaBuffer", () => {
  it("parses 6-digit hex colors cleanly", () => {
    expect(hexToRgb("#7c1f2c")).toEqual([124, 31, 44])
  })

  it("keeps transparent and unmasked pixels untouched while preserving luminance order in cloth", () => {
    // 4 pixels: transparent, unmasked skin, dark fold cloth, bright highlight cloth
    const src = new Uint8ClampedArray([
      0, 0, 0, 0, 235, 190, 155, 255, 45, 50, 58, 255, 175, 180, 190, 255,
    ])
    const mask = new Uint8ClampedArray([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ])

    const out = recolorRgbaBuffer(src, mask, "#7c1f2c", 0.42)
    // Transparent pixel stays transparent
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 0])
    // Unmasked pixel stays identical
    expect([...out.slice(4, 8)]).toEqual([235, 190, 155, 255])
    // Dark cloth shifts toward deep burgundy (R > B, R > G)
    expect(out[8]).toBeGreaterThan(out[9])
    expect(out[8]).toBeGreaterThan(out[10])
    expect(out[11]).toBe(255)
    // Highlight cloth stays strictly brighter than dark fold
    const darkLuma = out[8] + out[9] + out[10]
    const brightLuma = out[12] + out[13] + out[14]
    expect(brightLuma).toBeGreaterThan(darkLuma)
  })
})

import { describe, expect, it } from "vitest"

import {
  buildAllChibiPortraits,
  renderChibiPortraitDataUrl,
} from "@/lib/chibi-3d/portrait-renderer.ts"
import { resolveOutfitHex } from "@/lib/chibi-3d/types.ts"

import {
  AVATARS,
  OUTFIT_COLORS,
  avatarAllowedFor,
  avatarBadge,
  cleanOutfitColor,
  nameBadges,
  normalizeAvatarId,
} from "../net/types.ts"

describe("avatar catalogue and outfit colors", () => {
  it("provides 5 male and 5 female avatars to everyone", () => {
    const open = AVATARS.filter((a) => avatarAllowedFor(a.id, null))
    const males = open.filter((a) => a.gender === "male")
    const females = open.filter((a) => a.gender === "female")
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

  it("keeps the owner avatar and its tag for danhtrongit only", () => {
    expect(avatarAllowedFor("danhtrongit", "danhtrongit")).toBe(true)
    expect(avatarAllowedFor("danhtrongit", "other")).toBe(false)
    expect(avatarAllowedFor("danhtrongit", undefined)).toBe(false)
    expect(avatarBadge("danhtrongit")).toBe("IT")
    expect(nameBadges("male01", false)).toEqual([])
    expect(nameBadges("male01", true)).toEqual([{ text: "SACO", tone: "saco" }])
    expect(nameBadges("danhtrongit", true).map((b) => b.text)).toEqual([
      "IT",
      "SACO",
    ])
    expect(avatarBadge("male01")).toBeUndefined()
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

describe("procedural Chibi outfit resolution and portraits", () => {
  it("resolves every catalogue outfit color id to its canonical hex", () => {
    for (const c of OUTFIT_COLORS) {
      expect(resolveOutfitHex(c.id)).toBe(c.hex)
    }
    expect(resolveOutfitHex("default")).toBeNull()
    expect(resolveOutfitHex("#7c1f2c")).toBe("#7c1f2c")
    expect(resolveOutfitHex("not-a-color")).toBeNull()
  })

  it("generates instant Chibi portrait data URLs for all 11 canonical avatars", () => {
    const portraits = buildAllChibiPortraits()
    expect(Object.keys(portraits).sort()).toEqual(
      AVATARS.map((a) => a.id).sort()
    )
    for (const a of AVATARS) {
      expect(portraits[a.id]).toMatch(/^data:image\/(png|svg\+xml)/)
    }
    const tinted = renderChibiPortraitDataUrl(
      "male01",
      resolveOutfitHex("burgundy")
    )
    expect(tinted).toMatch(/^data:image\/(png|svg\+xml)/)
    expect(tinted).not.toBe(portraits.male01)
  })
})

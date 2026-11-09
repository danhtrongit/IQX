import { describe, expect, it } from "vitest"

import type { AdminBulletinContent } from "./bulletin-admin-api"
import {
  applySuggestion,
  contentFromDraft,
  contentKey,
  draftFromContent,
  errorFields,
  formatLevelInput,
  invalidLevels,
  parseLevelInput,
  type LevelDraft,
} from "./bulletin-admin-format"

const EMPTY: LevelDraft = { r1: "", r2: "", s1: "", s2: "", pa: "", pt: "", na: "", nt: "" }

function content(overrides: Partial<AdminBulletinContent> = {}): AdminBulletinContent {
  return {
    trend: "Xu hướng",
    momentum: "Động lượng",
    liquidity: "Thanh khoản",
    levels: { r1: 1800, r2: 1850.5, s1: 1700, s2: null, pa: null, pt: null, na: null, nt: null },
    ...overrides,
  }
}

describe("parseLevelInput", () => {
  it("reads Vietnamese grouping and decimal separators", () => {
    expect(parseLevelInput("1.755,5")).toEqual({ ok: true, value: 1755.5 })
    expect(parseLevelInput("1755,5")).toEqual({ ok: true, value: 1755.5 })
    expect(parseLevelInput("1.755")).toEqual({ ok: true, value: 1755 })
    expect(parseLevelInput("1755")).toEqual({ ok: true, value: 1755 })
    expect(parseLevelInput("1755.5")).toEqual({ ok: true, value: 1755.5 })
    expect(parseLevelInput(" 1 755,25 ")).toEqual({ ok: true, value: 1755.25 })
  })

  it("treats an empty box as not entered and rejects anything else", () => {
    expect(parseLevelInput("")).toEqual({ ok: true, value: null })
    expect(parseLevelInput("   ")).toEqual({ ok: true, value: null })
    for (const bad of ["abc", "-5", "0", "1,2,3", "1.7,5.5", "12a", "1..755", ","]) {
      expect(parseLevelInput(bad)).toEqual({ ok: false })
    }
  })
})

describe("formatLevelInput", () => {
  it("writes the same style the box accepts", () => {
    expect(formatLevelInput(1755.5)).toBe("1.755,5")
    expect(formatLevelInput(1755)).toBe("1.755")
    expect(formatLevelInput(null)).toBe("")
    expect(parseLevelInput(formatLevelInput(1234.56))).toEqual({ ok: true, value: 1234.56 })
  })
})

describe("draft and content", () => {
  it("round-trips content through a draft", () => {
    const original = content()
    const draft = draftFromContent(original)
    expect(draft.levels.r2).toBe("1.850,5")
    expect(contentFromDraft(draft)).toEqual(original)
  })

  it("refuses to build content while a level box is invalid", () => {
    const draft = draftFromContent(content())
    draft.levels.r1 = "mười"
    expect(invalidLevels(draft)).toEqual(["r1"])
    expect(contentFromDraft(draft)).toBeNull()
  })

  it("ignores surrounding spaces when comparing content", () => {
    expect(contentKey(content({ trend: "  Xu hướng " }))).toBe(contentKey(content()))
    expect(contentKey(content({ trend: "Khác" }))).not.toBe(contentKey(content()))
  })
})

describe("applySuggestion", () => {
  it("fills the first empty resistance box and keeps the nearest first", () => {
    let levels = applySuggestion(EMPTY, { value: 1850, side: "resistance" })
    expect(levels.r1).toBe("1.850")
    levels = applySuggestion(levels, { value: 1800, side: "resistance" })
    expect(levels.r1).toBe("1.800")
    expect(levels.r2).toBe("1.850")
  })

  it("replaces box 2 when both are full, then reorders supports from the nearest", () => {
    let levels = { ...EMPTY, s1: "1.700", s2: "1.650" }
    levels = applySuggestion(levels, { value: 1720, side: "support" })
    expect(levels.s1).toBe("1.720")
    expect(levels.s2).toBe("1.700")
  })

  it("does not duplicate a level that is already there", () => {
    const levels = { ...EMPTY, r1: "1.800" }
    expect(applySuggestion(levels, { value: 1800, side: "resistance" })).toBe(levels)
  })
})

describe("errorFields", () => {
  it("collects the fields that carry a red error", () => {
    const fields = errorFields({
      items: [
        { level: "error", code: "comment_empty", message: "x", field: "trend" },
        { level: "warn", code: "no_support", message: "y", field: "levels" },
        { level: "error", code: "slot_not_pushed", message: "z", field: "slot2" },
        { level: "info", code: "data_ready", message: "ok", field: "data" },
      ],
    })
    expect([...fields].sort()).toEqual(["slot2", "trend"])
  })
})

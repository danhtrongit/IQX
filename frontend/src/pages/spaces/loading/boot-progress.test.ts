import { describe, expect, it, vi } from "vitest"

import {
  BOOT_RANGES,
  BOOT_STAGES,
  createBootReporter,
  describePrepareProgress,
  phaseProgress,
} from "./boot-progress.ts"

describe("room boot progress", () => {
  it("maps phase fractions into the agreed global ranges", () => {
    expect(phaseProgress(BOOT_RANGES.build, 0)).toBeCloseTo(0.15)
    expect(phaseProgress(BOOT_RANGES.build, 1)).toBeCloseTo(0.6)
    expect(phaseProgress(BOOT_RANGES.build, 0.5)).toBeCloseTo(0.375)
    expect(phaseProgress(BOOT_RANGES.lights, 2)).toBeCloseTo(0.95)
    expect(phaseProgress(BOOT_RANGES.fonts, Number.NaN)).toBe(0)
  })

  it("labels shader warm-up with ready/total programs and texture uploads as images", () => {
    expect(
      describePrepareProgress({ phase: "shaders", fraction: 0.3, ready: 3, total: 10 })
    ).toEqual({
      progress: expect.closeTo(0.775, 5) as unknown as number,
      stage: "Đang chuẩn bị ánh sáng (3/10)",
    })
    expect(
      describePrepareProgress({ phase: "shaders", fraction: 1, ready: 0, total: 0 }).stage
    ).toBe(BOOT_STAGES.lights)
    const tex = describePrepareProgress({ phase: "textures", fraction: 1, ready: 5, total: 5 })
    expect(tex.stage).toBe(BOOT_STAGES.images)
    expect(tex.progress).toBeGreaterThanOrEqual(0.95)
    expect(tex.progress).toBeLessThan(1)
  })

  it("never goes backwards and drops duplicate updates", () => {
    const fn = vi.fn()
    const r = createBootReporter(fn)
    r.report(0, BOOT_STAGES.fonts)
    r.report(0.001, BOOT_STAGES.fonts) // same whole percent + label -> dropped
    r.report(0.3, BOOT_STAGES.floorBuild)
    r.report(0.2, BOOT_STAGES.floorBuild) // backwards -> clamped to 0.3, same label -> dropped
    r.report(0.2, BOOT_STAGES.floorActors) // label change keeps the max progress
    r.reportPrepare({ phase: "shaders", fraction: 0.5, ready: 5, total: 10 })
    expect(fn.mock.calls).toEqual([
      [0, BOOT_STAGES.fonts],
      [0.3, BOOT_STAGES.floorBuild],
      [0.3, BOOT_STAGES.floorActors],
      [0.825, "Đang chuẩn bị ánh sáng (5/10)"],
    ])
  })

  it("swallows listener errors so a broken screen never breaks the boot", () => {
    const r = createBootReporter(() => {
      throw new Error("boom")
    })
    expect(() => r.report(0.5, BOOT_STAGES.gpu)).not.toThrow()
    expect(() => createBootReporter().report(0.5, BOOT_STAGES.gpu)).not.toThrow()
  })
})

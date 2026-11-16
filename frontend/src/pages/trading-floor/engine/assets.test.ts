import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  liteManifest,
  type FrameArt,
  type Manifest,
  type WalkArt,
} from "./assets.ts"

const ASSETS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../public/trading-floor/assets"
)
const manifest = JSON.parse(
  readFileSync(resolve(ASSETS, "manifest.json"), "utf8")
) as Manifest

function frames(m: Manifest): (FrameArt | WalkArt)[] {
  return Object.values(m.characters).flatMap((c) => [
    ...Object.values(c.idle),
    ...Object.values(c.walk),
    ...Object.values(c.actions ?? {}).flatMap((a) => Object.values(a)),
    ...(c.statue ? [c.statue] : []),
  ])
}

describe("liteManifest", () => {
  const lite = liteManifest(manifest)

  it("points every character frame at a half-size file that is shipped", () => {
    const full = frames(manifest)
    const half = frames(lite)
    expect(half).toHaveLength(full.length)
    for (const art of half) {
      expect(art.file).toMatch(/@1x\.webp$/)
      expect(existsSync(resolve(ASSETS, art.file)), art.file).toBe(true)
    }
  })

  it("halves density, anchor and cell so a figure keeps its size and feet", () => {
    const full = manifest.characters.male01.walk.s!
    const half = lite.characters.male01.walk.s!
    expect(half.density).toBe(full.density / 2)
    expect(half.anchor).toEqual([full.anchor[0] / 2, full.anchor[1] / 2])
    expect(half.cell).toBe(full.cell / 2)
    expect(half.frames).toBe(full.frames)
    expect(half.durationsMs).toEqual(full.durationsMs)
    // Whole numbers only: a cell or an anchor on a half pixel would smear the sprite.
    for (const art of frames(lite)) {
      expect(
        Number.isInteger(art.anchor[0]) && Number.isInteger(art.anchor[1])
      ).toBe(true)
      if ("cell" in art) expect(Number.isInteger(art.cell)).toBe(true)
    }
  })

  it("leaves the full manifest, the masks and the props alone", () => {
    expect(manifest.characters.male01.walk.s!.file).toMatch(/@2x\.webp$/)
    expect(lite.characters.male01.masks).toBe(manifest.characters.male01.masks)
    expect(lite.props).toBe(manifest.props)
  })
})

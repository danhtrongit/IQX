import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MASCOT_SLUG_BY_ID, mascotAssetUrl, validateMascotManifest } from "./mascotManifest"
import type { MascotId } from "../types"
import { preloadSprite, useSpritePreload } from "./useSpritePreload"

const root = resolve(process.cwd(), "public/assets/mascots-2d/v2")
function fixture() { return JSON.parse(readFileSync(resolve(root, "bach-ho/manifest.json"), "utf8")) }
describe("v2 mascot asset contract", () => {
  it("all five manifests point to a complete, distinct set of static images and strips", () => {
    for (const [id, slug] of Object.entries(MASCOT_SLUG_BY_ID)) {
      const raw = JSON.parse(readFileSync(resolve(root, slug, "manifest.json"), "utf8"))
      const manifest = validateMascotManifest(raw, id as MascotId)
      const paths = [...Object.values(manifest.assets), ...Object.values(manifest.states).map(s => s.file)]
      expect(new Set(paths).size).toBe(9)
      for (const file of paths) expect(existsSync(resolve(root, slug, file))).toBe(true)
    }
  })
  it.each([
    (m: ReturnType<typeof fixture>) => { m.schemaVersion = 1 },
    (m: ReturnType<typeof fixture>) => { m.slug = "kim-quy" },
    (m: ReturnType<typeof fixture>) => { m.dominantLayer = "dinh_gia" },
    (m: ReturnType<typeof fixture>) => { m.states.idle.durationsMs.pop() },
    (m: ReturnType<typeof fixture>) => { m.states.greet.loop = true },
    (m: ReturnType<typeof fixture>) => { m.states.idle.columns = 0 },
    (m: ReturnType<typeof fixture>) => { m.states.idle.reducedMotionFrame = 6 },
    (m: ReturnType<typeof fixture>) => { m.assets.poster = "https://external.example/image.webp" },
    (m: ReturnType<typeof fixture>) => { m.assets.poster = "../kim-quy/poster.webp" },
    (m: ReturnType<typeof fixture>) => { m.states.sad = m.states.idle },
  ])("rejects corrupt or out-of-contract manifests", mutate => {
    const data = fixture(); mutate(data)
    expect(() => validateMascotManifest(data, "bach_ho")).toThrow()
  })
  it("versioned URLs cannot switch to another species, host, or traversal path", () => {
    expect(mascotAssetUrl("bach_ho", "idle-strip.webp")).toBe("/assets/mascots-2d/v2/bach-ho/idle-strip.webp?v=2.0.1")
    for (const path of ["//evil/image.webp", "/assets/mascots-2d/v2/kim-quy/poster.webp", "%2e%2e/image.webp", "a\\b.webp"]) {
      expect(() => mascotAssetUrl("bach_ho", path)).toThrow()
    }
  })
})

class FakeImage {
  static instances: FakeImage[] = []
  naturalWidth = 1920
  naturalHeight = 640
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  decode = vi.fn<() => Promise<void>>(() => Promise.resolve())
  set src(_value: string) { FakeImage.instances.push(this) }
}

function PreloadProbe({ src }: { src: string }) {
  const asset = useSpritePreload(src)
  return createElement("div", { "data-testid": "preload-probe", "data-width": asset?.width ?? "pending" })
}

afterEach(() => {
  FakeImage.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("sprite preload cache and decode failures", () => {
  it("deduplicates one decoded asset and reuses its settled cache entry", async () => {
    vi.stubGlobal("Image", FakeImage)
    const first = preloadSprite("/dedupe-strip.webp")
    const second = preloadSprite("/dedupe-strip.webp")
    expect(second).toBe(first)
    expect(FakeImage.instances).toHaveLength(1)
    FakeImage.instances[0].onload?.()
    await expect(first).resolves.toEqual({ width: 1920, height: 640 })
    expect(preloadSprite("/dedupe-strip.webp")).toBe(first)
    render(createElement(PreloadProbe, { src: "/dedupe-strip.webp" }))
    expect(screen.getByTestId("preload-probe")).toHaveAttribute("data-width", "1920")
  })

  it("rejects synchronous decode errors instead of leaving a pending cache entry", async () => {
    vi.stubGlobal("Image", FakeImage)
    const result = preloadSprite("/sync-decode-error.webp")
    FakeImage.instances[0].decode.mockImplementationOnce(() => { throw new Error("decoder unavailable") })
    FakeImage.instances[0].onload?.()
    await expect(result).rejects.toThrow("Image decode failed")
  })

  it("times out a load and allows the same URL to be retried", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("Image", FakeImage)
    const failed = preloadSprite("/timed-out-strip.webp")
    await vi.advanceTimersByTimeAsync(8000)
    await expect(failed).rejects.toThrow("Image timeout")
    await Promise.resolve()
    const retry = preloadSprite("/timed-out-strip.webp")
    expect(retry).not.toBe(failed)
    expect(FakeImage.instances).toHaveLength(2)
    FakeImage.instances[1].onload?.()
    await expect(retry).resolves.toEqual({ width: 1920, height: 640 })
  })
})

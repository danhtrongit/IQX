import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { JourneyCreatureIllustration, type JourneyCreatureIllustrationProps } from "./JourneyCreatureIllustration"

vi.mock("./artwork/EggArtwork", () => ({
  EggArtwork: () => <g data-testid="egg-vector-fallback"><g data-part="egg-shell-top" transform="translate(1 2)" /></g>,
}))

let frames: Map<number, FrameRequestCallback>, nextFrame: number
const defaults: JourneyCreatureIllustrationProps = {
  level: 6,
  accent: "#4fd1c5",
  phase: "egg",
  runtimeState: "idle",
  paused: false,
  reducedMotion: false,
}

async function frameAt(time: number) {
  await act(async () => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback(time))
  })
}

function asset(container: HTMLElement, part: string) {
  return container.querySelector<SVGImageElement>(`[data-part="${part}"]`)!
}

function failAllFormats(container: HTMLElement, part: string) {
  for (const format of ["avif", "webp", "png"]) {
    const image = asset(container, part)
    expect(image).toHaveAttribute("data-asset-format", format)
    fireEvent.error(image)
  }
}

beforeEach(() => {
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id) })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ImageGen identity artwork renderer", () => {
  it("reports an egg ready only after its selected source loads", () => {
    const onReady = vi.fn()
    const view = render(<JourneyCreatureIllustration {...defaults} onReady={onReady} />)
    const image = asset(view.container, "egg-poster")
    expect(image).toHaveAttribute("href", "/journey-identity/generated/egg-level-6.avif")
    expect(onReady).not.toHaveBeenCalled()
    fireEvent.load(image)
    expect(onReady).toHaveBeenCalledOnce()
  })

  it("waits for both the egg and selected mascot before hatch is ready", () => {
    const onReady = vi.fn()
    const view = render(<JourneyCreatureIllustration {...defaults} phase="hatch" mascotId="thanh_long" onReady={onReady} />)
    fireEvent.load(asset(view.container, "egg-poster"))
    expect(onReady).not.toHaveBeenCalled()
    fireEvent.load(asset(view.container, "mascot-poster"))
    expect(onReady).toHaveBeenCalledOnce()
    expect(view.container.querySelectorAll("image")).toHaveLength(2)
    expect(asset(view.container, "mascot-poster")).toHaveAttribute("href", "/assets/mascots-2d/v2/thanh-long/reveal-silhouette.webp?v=2.0.1")
  })

  it("allows hatch after a failed mascot resolves to the neutral IQX placeholder", () => {
    const onReady = vi.fn(), onError = vi.fn()
    const view = render(<JourneyCreatureIllustration {...defaults} phase="hatch" mascotId="bach_ho" onReady={onReady} onError={onError} />)
    fireEvent.load(asset(view.container, "egg-poster"))
    fireEvent.error(asset(view.container, "mascot-poster"))
    expect(view.getByTestId("mascot-neutral-placeholder")).toBeInTheDocument()
    expect(view.container.querySelector('[data-artwork="mascot-effect-overlay"]')).toBeNull()
    expect(view.container.querySelector("svg")).toHaveAttribute("data-renderer", "fallback")
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledOnce()
  })

  it("falls back an egg from AVIF to WebP to PNG and finally to local egg artwork", () => {
    const onReady = vi.fn(), onError = vi.fn()
    const view = render(<JourneyCreatureIllustration {...defaults} onReady={onReady} onError={onError} />)
    failAllFormats(view.container, "egg-poster")
    expect(view.getByTestId("egg-vector-fallback")).toBeInTheDocument()
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledOnce()
  })

  it("waits for the previous egg and gives it the same safe format fallback chain", () => {
    const onReady = vi.fn()
    const view = render(<JourneyCreatureIllustration {...defaults} level={5} previousLevel={4} onReady={onReady} />)
    fireEvent.load(asset(view.container, "egg-poster"))
    expect(onReady).not.toHaveBeenCalled()
    fireEvent.error(asset(view.container, "previous-egg-poster"))
    expect(asset(view.container, "previous-egg-poster")).toHaveAttribute("href", "/journey-identity/generated/egg-level-4.webp")
    fireEvent.error(asset(view.container, "previous-egg-poster"))
    expect(asset(view.container, "previous-egg-poster")).toHaveAttribute("href", "/journey-identity/generated/egg-level-4.png")
    fireEvent.load(asset(view.container, "previous-egg-poster"))
    expect(onReady).toHaveBeenCalledOnce()
  })

  it("keeps a flat mascot poster in its authored pose while effects animate", async () => {
    const onTap = vi.fn().mockReturnValue(true)
    const view = render(<JourneyCreatureIllustration {...defaults} phase="mascot" mascotId="loc_huou" onTap={onTap} />)
    const poster = asset(view.container, "mascot-poster")
    fireEvent.load(poster)
    await frameAt(100)
    const authoredTransform = poster.getAttribute("transform")
    fireEvent.click(view.getByRole("button"))
    await frameAt(350)
    await frameAt(700)
    expect(poster.getAttribute("transform")).toBe(authoredTransform)
    expect(poster.getAttribute("transform")).not.toContain("rotate(")
    expect(poster.getAttribute("transform")).not.toContain("scale(")
    expect(onTap).toHaveBeenCalledOnce()
  })

  it("crossfades the intact egg poster into the mascot without splitting a fake shell", async () => {
    let progress = 0
    const view = render(<JourneyCreatureIllustration {...defaults} phase="hatch" mascotId="kim_quy" getHatchProgress={() => progress} />)
    fireEvent.load(asset(view.container, "egg-poster"))
    fireEvent.load(asset(view.container, "mascot-poster"))
    progress = .65
    await frameAt(100)
    expect(view.container.querySelector('[data-layer="egg"]')).toHaveAttribute("opacity", "1")
    expect(view.container.querySelector('[data-layer="mascot"]')).toHaveAttribute("opacity", "0")
    expect(Number(view.container.querySelector('[data-layer="hatch-light"]')?.getAttribute("opacity"))).toBeGreaterThan(0)
    progress = 1
    await frameAt(200)
    expect(view.container.querySelector('[data-layer="egg"]')).toHaveAttribute("opacity", "0")
    expect(view.container.querySelector('[data-layer="mascot"]')).toHaveAttribute("opacity", "1")
    expect(asset(view.container, "egg-poster")).not.toHaveAttribute("transform")
  })

  it("uses only a static crossfade for reduced-motion hatch", async () => {
    const view = render(<JourneyCreatureIllustration {...defaults} phase="hatch" mascotId="kim_quy" reducedMotion getHatchProgress={() => .5} />)
    await frameAt(100)
    expect(view.container.querySelector('[data-layer="egg"]')).toHaveAttribute("opacity", "0.5")
    expect(view.container.querySelector('[data-layer="mascot"]')).toHaveAttribute("opacity", "0.5")
    expect(view.container.querySelector('[data-layer="hatch-light"]')).toHaveAttribute("opacity", "0")
  })

  it("keeps eggs non-interactive and pauses mascot input and its animation clock", async () => {
    const onTap = vi.fn().mockReturnValue(true)
    const view = render(<JourneyCreatureIllustration {...defaults} onTap={onTap} />)
    expect(view.getByRole("img")).not.toHaveAttribute("tabindex")
    fireEvent.click(view.getByRole("img"))
    expect(onTap).not.toHaveBeenCalled()

    view.rerender(<JourneyCreatureIllustration {...defaults} phase="mascot" mascotId="bach_ho" onTap={onTap} />)
    fireEvent.load(asset(view.container, "mascot-poster"))
    const button = view.getByRole("button", { name: /Bạch Hổ/ })
    fireEvent.keyDown(button, { key: "Enter" })
    expect(onTap).toHaveBeenCalledOnce()
    await frameAt(100)
    const halo = view.container.querySelector('[data-part="creature-halo"]')?.getAttribute("opacity")

    view.rerender(<JourneyCreatureIllustration {...defaults} phase="mascot" mascotId="bach_ho" paused onTap={onTap} />)
    expect(view.queryByRole("button")).toBeNull()
    fireEvent.click(view.getByRole("img"))
    await frameAt(5000)
    expect(view.container.querySelector('[data-part="creature-halo"]')).toHaveAttribute("opacity", halo)
    expect(onTap).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })
})

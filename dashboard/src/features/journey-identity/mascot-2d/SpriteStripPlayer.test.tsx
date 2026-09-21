import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpriteStripPlayer } from "./SpriteStripPlayer"
import type { MascotStateManifest } from "./mascotManifest"
const asset = vi.hoisted(() => ({ width: 1920, height: 640, error: false }))
vi.mock("./useSpritePreload", () => ({ useSpritePreload: () => asset }))
const animation: MascotStateManifest = { file: "test.webp", frameCount: 3, columns: 3, rows: 1,
  durationsMs: [100, 200, 300], loop: false, holdLastFrameMs: 50, prefetchPriority: "high", reducedMotionFrame: 1 }
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
beforeEach(() => { vi.useFakeTimers(); asset.width = 1920; asset.height = 640; asset.error = false })
afterEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  vi.useRealTimers()
})
describe("sprite playback clock", () => {
  it("uses individual holds and only completes once, after the final hold", () => {
    const done = vi.fn()
    render(<SpriteStripPlayer src="/test.webp" animation={animation} onComplete={done} />)
    advance(99); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "0")
    advance(1); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "1")
    advance(200); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "2")
    advance(349); expect(done).not.toHaveBeenCalled()
    advance(1); expect(done).toHaveBeenCalledTimes(1)
    advance(2000); expect(done).toHaveBeenCalledTimes(1)
  })
  it("pauses partway through a hold and resumes its remaining time without restarting", () => {
    const done = vi.fn()
    const view = render(<SpriteStripPlayer src="/test.webp" animation={animation} onComplete={done} />)
    advance(150)
    view.rerender(<SpriteStripPlayer src="/test.webp" animation={{ ...animation }} paused onComplete={done} />)
    advance(5000); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "1")
    view.rerender(<SpriteStripPlayer src="/test.webp" animation={{ ...animation }} onComplete={done} />)
    advance(149); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "1")
    advance(1); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "2")
    advance(350); expect(done).toHaveBeenCalledOnce()
  })
  it("preserves the exact remaining hold while the document is hidden", () => {
    const done = vi.fn()
    render(<SpriteStripPlayer src="/test.webp" animation={animation} onComplete={done} />)
    advance(150)
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    advance(5000)
    expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "1")
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    advance(149)
    expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "1")
    advance(1)
    expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "2")
    advance(350)
    expect(done).toHaveBeenCalledOnce()
  })
  it("respects loop delay and never sends one-shot completion for a loop", () => {
    const done = vi.fn(); const loop = { ...animation, loop: true, loopDelayMs: 400 }
    render(<SpriteStripPlayer src="/test.webp" animation={loop} onComplete={done} />)
    advance(999); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "2")
    advance(1); expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "0")
    expect(done).not.toHaveBeenCalled()
  })
  it("cancels stale callbacks when switching strips or unmounting", () => {
    const old = vi.fn(), current = vi.fn()
    const view = render(<SpriteStripPlayer src="/old.webp" animation={animation} onComplete={old} />)
    advance(500)
    view.rerender(<SpriteStripPlayer src="/new.webp" animation={animation} onComplete={current} />)
    advance(200); expect(old).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled()
    view.unmount(); advance(2000); expect(current).not.toHaveBeenCalled()
  })
  it("reports wrong strip dimensions instead of running a fabricated timeline", () => {
    asset.width = 1024
    const done = vi.fn(), error = vi.fn()
    render(<SpriteStripPlayer src="/test.webp" animation={animation} onComplete={done} onError={error} />)
    advance(2000); expect(error).toHaveBeenCalledOnce(); expect(done).not.toHaveBeenCalled()
  })
  it("never starts playback or ready callbacks for an errored decoded asset", () => {
    asset.error = true
    const done = vi.fn(), ready = vi.fn(), error = vi.fn()
    render(<SpriteStripPlayer src="/test.webp" animation={animation} onComplete={done} onReady={ready} onError={error} />)
    advance(2000)
    expect(error).toHaveBeenCalledOnce()
    expect(ready).not.toHaveBeenCalled()
    expect(done).not.toHaveBeenCalled()
  })
  it("reduced motion holds the configured still then finishes one-shot once", () => {
    const done = vi.fn()
    render(<SpriteStripPlayer src="/test.webp" animation={animation} reducedMotion onComplete={done} />)
    expect(screen.getByTestId("mascot-sprite")).toHaveAttribute("data-frame", "1")
    advance(300); expect(done).toHaveBeenCalledOnce()
    advance(2000); expect(done).toHaveBeenCalledOnce()
  })
})

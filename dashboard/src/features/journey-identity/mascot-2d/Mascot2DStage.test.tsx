import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Mascot2DStage } from "./Mascot2DStage"
import type { Mascot2DManifest } from "./mascotManifest"

const controls = vi.hoisted(() => ({ badManifest: false, failSprite: false, failPoster: false, failAll: false }))
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/assets/mascots-2d/v2/bach-ho/manifest.json"), "utf8")) as Mascot2DManifest
vi.mock("./useSpritePreload", () => ({
  useMascotManifest: () => controls.badManifest ? { error: true } : { data: manifest },
  useSpritePreload: (src?: string) => !src ? undefined : controls.failAll || controls.failPoster && src.includes("poster") ? { error: true } : { width: 1024, height: 1024 },
}))
vi.mock("./SpriteStripPlayer", async () => {
  const { useEffect } = await import("react")
  return { SpriteStripPlayer: (props: import("./SpriteStripPlayer").SpriteStripPlayerProps) => {
    // The stub signals readiness only on a new decoded source, as the real player does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (controls.failSprite) props.onError?.(); else props.onReady?.() }, [props.src])
    useEffect(() => {
      if (props.paused || props.animation.loop || controls.failSprite) return
      const timer = setTimeout(() => props.onComplete?.(), 1000)
      return () => clearTimeout(timer)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.src, props.paused, props.animation.loop])
    return <div data-testid="loaded-strip" data-paused={props.paused} />
  } }
})
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
beforeEach(() => { vi.useFakeTimers(); Object.assign(controls, { badManifest: false, failSprite: false, failPoster: false, failAll: false }) })
afterEach(() => { vi.useRealTimers() })
describe("mascot presentation fallbacks and reveal", () => {
  it("reveals silhouette before allowing greet and completing the presented token", () => {
    const done = vi.fn()
    render(<Mascot2DStage mascotId="bach_ho" state="idle" animationToken="welcome" reveal paused={false} reducedMotion={false} onComplete={done} />)
    expect(screen.getByTestId("mascot-2d-stage")).toHaveAttribute("data-color", "false")
    advance(600)
    expect(screen.getByTestId("mascot-2d-stage")).toHaveAttribute("data-color", "true")
    advance(299); expect(screen.getByTestId("loaded-strip")).toHaveAttribute("data-paused", "true")
    advance(1); expect(screen.getByTestId("loaded-strip")).toHaveAttribute("data-paused", "false")
    advance(1000); expect(done).toHaveBeenCalledExactlyOnceWith("welcome")
  })
  it("a failed strip falls back to the poster and completes once after visible presentation", () => {
    controls.failSprite = true
    const done = vi.fn()
    const view = render(<Mascot2DStage mascotId="bach_ho" state="updated" animationToken="updated:run-A" paused reducedMotion={false} onComplete={done} />)
    advance(2000); expect(done).not.toHaveBeenCalled()
    expect(screen.getByTestId("mascot-2d-stage")).toHaveAttribute("data-renderer", "poster-fallback")
    view.rerender(<Mascot2DStage mascotId="bach_ho" state="updated" animationToken="updated:run-A" paused={false} reducedMotion={false} onComplete={done} />)
    advance(300); expect(done).toHaveBeenCalledExactlyOnceWith("updated:run-A")
    advance(2000); expect(done).toHaveBeenCalledTimes(1)
  })
  it("invalid manifest and missing poster degrade to a neutral placeholder without a species swap", () => {
    controls.badManifest = true; controls.failAll = true
    const done = vi.fn()
    render(<Mascot2DStage mascotId="bach_ho" state="greet" animationToken="greet:2026-09-20" paused={false} reducedMotion={false} onComplete={done} />)
    expect(screen.getByTestId("mascot-neutral-placeholder")).toBeInTheDocument()
    advance(300); expect(done).toHaveBeenCalledExactlyOnceWith("greet:2026-09-20")
  })
  it("switching runs cancels the prior one-shot; completion names only the displayed run", () => {
    const done = vi.fn()
    const view = render(<Mascot2DStage mascotId="bach_ho" state="updated" animationToken="updated:run-A" paused={false} reducedMotion={false} onComplete={done} />)
    advance(500)
    view.rerender(<Mascot2DStage mascotId="bach_ho" state="updated" animationToken="updated:run-B" paused={false} reducedMotion={false} onComplete={done} />)
    advance(500); expect(done).not.toHaveBeenCalled()
    advance(500); expect(done).toHaveBeenCalledExactlyOnceWith("updated:run-B")
  })
})

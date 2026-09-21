import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { IdentityScene } from "./JourneyIdentityStage"
import { identityFixture } from "./test-fixtures"
import type { JourneyCreatureIllustrationProps } from "./JourneyCreatureIllustration"
const visibility = vi.hoisted(() => ({ visible: true, reduced: false }))
const renderer = vi.hoisted(() => ({ ready: true }))
vi.mock("./JourneyCreatureIllustration", async () => {
  const { useEffect } = await import("react")
  return { JourneyCreatureIllustration: (props: JourneyCreatureIllustrationProps) => {
    const ready = renderer.ready, onReady = props.onReady
    useEffect(() => { if (ready) onReady?.() }, [onReady, ready])
    return <button data-testid="journey-artwork" data-mascot={props.mascotId} data-previous-level={props.previousLevel} onClick={props.onTap}>Model</button>
  } }
})
vi.mock("./mascot-2d/Mascot2DStage", async () => {
  const { useEffect, useRef } = await import("react")
  return { Mascot2DStage: (props: import("./mascot-2d/Mascot2DStage").Mascot2DStageProps) => {
    const clock = useRef<Animation | null>(null)
    const node = useRef<HTMLButtonElement>(null)
    const current = useRef(props)
    const ready = renderer.ready
    useEffect(() => { current.current = props }, [props])
    useEffect(() => { if (ready) props.onReady?.() }, [props.onReady, ready])
    useEffect(() => {
      if (!ready || !props.animationToken) return
      const token = props.animationToken
      const animation = node.current!.animate([], { duration: 1200 })
      clock.current = animation
      animation.pause()
      let live = true
      animation.finished.then(() => { if (live) current.current.onComplete?.(token) }).catch(() => {})
      return () => { live = false; animation.cancel(); clock.current = null }
    }, [props.animationToken, ready])
    useEffect(() => { if (props.paused) clock.current?.pause(); else clock.current?.play() }, [props.paused, props.animationToken, ready])
    return <button ref={node} className="identity-cue" data-testid="journey-artwork" data-mascot={props.mascotId} onClick={props.onTap}>Model</button>
  } }
})
vi.mock("./visibility", () => ({ useStageVisibility: () => visibility.visible, useReducedMotion: () => visibility.reduced }))
vi.mock("./hooks", () => ({ useIdentity: vi.fn(), useIdentityEvent: vi.fn() }))
interface AnimationFake { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; finished: Promise<void>; complete: () => void; playState: string }
let animations: AnimationFake[]
beforeEach(() => {
  visibility.visible = true; visibility.reduced = false
  animations = []; renderer.ready = true
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn(function (this: Element) {
    let complete!: () => void
    const finished = new Promise<void>(resolve => { complete = resolve })
    const record: AnimationFake = { complete: () => { record.playState = "finished"; complete() }, playState: "paused", finished,
      play: vi.fn(() => { record.playState = "running" }), pause: vi.fn(() => { record.playState = "paused" }), cancel: vi.fn(() => { record.playState = "idle" }) }
    if (this.matches(".identity-model-wrap, .identity-cue")) animations.push(record)
    return record
  }) })
})

describe("single journey identity coordinator", () => {
  it("hatches once then welcomes once and persists two ordered milestones", async () => {
    const state = identityFixture(); state.lifecycle = "reveal_pending"; state.ui_state.egg_hatch_seen_at = null; state.ui_state.reveal_seen_at = null
    const persist = vi.fn().mockResolvedValue(undefined)
    render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "hatch")
    expect(Element.prototype.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 1200 }))
    await act(async () => animations[0].complete())
    await waitFor(() => expect(animations).toHaveLength(2))
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "welcome")
    await act(async () => animations[1].complete())
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2))
    expect(persist.mock.calls.map(call => call[0].event)).toEqual(["hatch_seen", "reveal_seen"])
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "mascot")
    expect(animations).toHaveLength(2)
    expect(screen.getAllByTestId("journey-artwork")).toHaveLength(1)
    expect(screen.getByTestId("journey-artwork")).toHaveAttribute("data-mascot", "bach_ho")
    expect(document.querySelector("img")).toBeNull()
  })
  it("uses the short reduced-motion hatch and still records completion after presentation", async () => {
    visibility.reduced = true
    const state = identityFixture(); state.lifecycle = "reveal_pending"; state.ui_state.egg_hatch_seen_at = null; state.ui_state.reveal_seen_at = null
    const persist = vi.fn().mockResolvedValue(undefined)
    render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    expect(Element.prototype.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 350 }))
    expect(persist).not.toHaveBeenCalled()
    await act(async () => animations[0].complete())
    expect(persist).toHaveBeenCalledWith({ event: "hatch_seen" })
  })
  it("does not replay a hatch already recorded on another device", async () => {
    const state = identityFixture(); state.ui_state.reveal_seen_at = null
    const persist = vi.fn().mockResolvedValue(undefined)
    render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "welcome")
    await act(async () => animations[0].complete())
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ event: "reveal_seen" }))
  })
  it("pending evidence never triggers hatch regardless of graduation timestamp", async () => {
    const state = identityFixture(); state.lifecycle = "pending_data_repair"; state.mascot = null
    const persist = vi.fn()
    render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await act(async () => {})
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "egg")
    expect(animations).toHaveLength(0); expect(persist).not.toHaveBeenCalled()
  })
  it("pauses an unseen greeting while occluded then resumes the same playhead", async () => {
    visibility.visible = false
    const state = identityFixture(); state.ui_state.greeted_local_date = null
    const persist = vi.fn().mockResolvedValue(undefined)
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    expect(animations[0].play).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled()
    visibility.visible = true
    view.rerender(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    expect(animations).toHaveLength(1); expect(animations[0].play).toHaveBeenCalledTimes(1)
    await act(async () => animations[0].complete())
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ event: "greet_seen" }))
  })
  it("does not restart on panel-independent parent renders or refetch of identical state", async () => {
    const state = identityFixture(); state.bot_run.status = "succeeded"; state.bot_run.latest_run_id = "run-A"
    const persist = vi.fn().mockResolvedValue(undefined)
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    view.rerender(<IdentityScene level={6} state={structuredClone(state)} canPersist persist={persist} />)
    expect(animations).toHaveLength(1)
    await act(async () => animations[0].complete())
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ event: "bot_run_updated_seen", run_id: "run-A" }))
    expect(animations).toHaveLength(1)
  })
  it("keeps the completed reveal visible when persistence fails", async () => {
    const state = identityFixture(); state.ui_state.reveal_seen_at = null
    const persist = vi.fn().mockRejectedValue(new Error("offline"))
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    await act(async () => animations[0].complete())
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "mascot")
    view.rerender(<IdentityScene level={6} state={structuredClone(state)} canPersist persist={persist} />)
    expect(animations).toHaveLength(1)
  })
  it("never treats a failed Bot run as an update", async () => {
    const state = identityFixture(); state.bot_run.status = "failed"; state.bot_run.latest_run_id = "failed"
    const persist = vi.fn()
    render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await act(async () => {})
    expect(animations).toHaveLength(0)
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-state", "idle")
  })
  it("accepts taps only at idle with a 1.8 second cooldown", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000)
    render(<IdentityScene level={6} state={identityFixture()} canPersist persist={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId("journey-artwork")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button"))
    expect(animations).toHaveLength(1)
    await act(async () => animations[0].complete())
    clock.mockReturnValue(1700); fireEvent.click(screen.getByRole("button"))
    expect(animations).toHaveLength(1)
    clock.mockReturnValue(2801); fireEvent.click(screen.getByRole("button"))
    expect(animations).toHaveLength(2)
    clock.mockRestore()
  })
  it("does not regress a newer cursor already presented on another device", async () => {
    const state = identityFixture(); state.bot_run.status = "succeeded"; state.bot_run.latest_run_id = "run-A"
    const persist = vi.fn().mockResolvedValue(undefined)
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    await act(async () => animations[0].complete())
    const newer = structuredClone(state)
    newer.bot_run.latest_run_id = "run-B"; newer.ui_state.last_animated_bot_run_id = "run-B"
    view.rerender(<IdentityScene level={6} state={newer} canPersist persist={persist} />)
    expect(animations).toHaveLength(1)
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-state", "idle")
  })
  it("cancels a tap when a real Bot run takes priority and never replays that tap", async () => {
    const state = identityFixture()
    const persist = vi.fn().mockResolvedValue(undefined)
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(screen.getByTestId("journey-artwork")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button"))
    expect(animations).toHaveLength(1)
    const next = structuredClone(state); next.bot_run.status = "running"; next.bot_run.latest_run_id = "run-new"
    view.rerender(<IdentityScene level={6} state={next} canPersist persist={persist} />)
    expect(animations[0].cancel).toHaveBeenCalled()
    next.bot_run.status = "succeeded"
    view.rerender(<IdentityScene level={6} state={{ ...next }} canPersist persist={persist} />)
    expect(animations).toHaveLength(2)
    await act(async () => animations[1].complete())
    expect(animations).toHaveLength(2)
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-state", "idle")
  })
  it("crossfades the previous egg level only after the illustration is ready, then records the new level", async () => {
    const state = identityFixture(); state.lifecycle = "egg"; state.mascot = null; state.cap6_graduated_at = null
    state.current_level = 4; state.ui_state.last_seen_egg_level = 3
    const persist = vi.fn().mockResolvedValue(undefined)
    render(<IdentityScene level={4} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    expect(screen.getByTestId("journey-artwork")).toHaveAttribute("data-previous-level", "3")
    expect(persist).not.toHaveBeenCalled()
    await act(async () => animations[0].complete())
    expect(persist).toHaveBeenCalledWith({ event: "level_seen", level: 4 })
    expect(screen.getByTestId("journey-artwork")).not.toHaveAttribute("data-previous-level")
  })
  it("waits for the artwork before beginning level-up", async () => {
    renderer.ready = false
    const state = identityFixture(); state.lifecycle = "egg"; state.mascot = null; state.cap6_graduated_at = null
    state.current_level = 4; state.ui_state.last_seen_egg_level = 3
    const persist = vi.fn().mockResolvedValue(undefined)
    const view = render(<IdentityScene level={4} state={state} canPersist persist={persist} />)
    expect(screen.getByTestId("journey-artwork")).toHaveAttribute("data-previous-level", "3")
    expect(animations).toHaveLength(0)
    expect(persist).not.toHaveBeenCalled()
    renderer.ready = true
    view.rerender(<IdentityScene level={4} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
  })
  it("does not mark an unseen hatch when the illustration has not been presented", async () => {
    renderer.ready = false
    const state = identityFixture(); state.lifecycle = "reveal_pending"; state.ui_state.egg_hatch_seen_at = null; state.ui_state.reveal_seen_at = null
    const persist = vi.fn()
    render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await act(async () => {})
    expect(persist).not.toHaveBeenCalled()
    expect(animations).toHaveLength(0)
    expect(document.querySelector("img")).toBeNull()
  })
  it("does not reuse egg readiness when the same assigned mascot becomes eligible to hatch", async () => {
    const state = identityFixture(); state.lifecycle = "pending_data_repair"
    state.ui_state.egg_hatch_seen_at = null; state.ui_state.reveal_seen_at = null
    const persist = vi.fn()
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await act(async () => {})
    expect(animations).toHaveLength(0)
    renderer.ready = false
    const repaired = { ...state, lifecycle: "reveal_pending" as const }
    view.rerender(<IdentityScene level={6} state={repaired} canPersist persist={persist} />)
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-phase", "hatch")
    expect(animations).toHaveLength(0); expect(persist).not.toHaveBeenCalled()
    renderer.ready = true
    view.rerender(<IdentityScene level={6} state={repaired} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
  })
  it("a locally completed greeting does not suppress the next server calendar day", async () => {
    const state = identityFixture(); state.ui_state.greeted_local_date = null
    const persist = vi.fn().mockResolvedValue(undefined)
    const view = render(<IdentityScene level={6} state={state} canPersist persist={persist} />)
    await waitFor(() => expect(animations).toHaveLength(1))
    await act(async () => animations[0].complete())
    const nextDay = { ...state, today_local: "2026-09-14" }
    view.rerender(<IdentityScene level={6} state={nextDay} canPersist persist={persist} />)
    expect(animations).toHaveLength(2)
    await act(async () => animations[1].complete())
    expect(persist.mock.calls.map(call => call[0].local_date)).toEqual(["2026-09-13", "2026-09-14"])
  })
})

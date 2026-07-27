// useTour.test.tsx
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TourConfig } from "./tourTypes"
import { useTour, type UseTourOptions } from "./useTour"

const CONFIG: TourConfig = {
  name: "unit-tour",
  steps: [
    { title: "A", body: "a" },
    { title: "B", body: "b" },
    { title: "C", body: "c" },
  ],
}

function setupHook(overrides: Partial<UseTourOptions> = {}) {
  const onComplete = overrides.onComplete ?? vi.fn()
  const onStepView = overrides.onStepView ?? vi.fn()
  const onStart = overrides.onStart ?? vi.fn()
  const onSkip = overrides.onSkip ?? vi.fn()
  const { result } = renderHook(() => useTour(CONFIG, { onComplete, onStepView, onStart, onSkip }))
  return { result, onComplete, onStepView, onStart, onSkip }
}

describe("useTour", () => {
  it("starts inactive at index 0, not busy", () => {
    const { result } = setupHook()
    expect(result.current.active).toBe(false)
    expect(result.current.index).toBe(0)
    expect(result.current.busy).toBe(false)
  })

  it("start() activates the tour, resets to step 0, and fires onStart + onStepView(0)", () => {
    const { result, onStart, onStepView } = setupHook()
    act(() => result.current.start())
    expect(result.current.active).toBe(true)
    expect(result.current.index).toBe(0)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStepView).toHaveBeenCalledWith(0)
  })

  it("next() advances the index and fires onStepView with the new index; clamps at the last step", () => {
    const { result, onStepView } = setupHook()
    act(() => result.current.start())
    act(() => result.current.next())
    expect(result.current.index).toBe(1)
    expect(onStepView).toHaveBeenCalledWith(1)
    act(() => result.current.next())
    act(() => result.current.next()) // already at last (index 2, totalSteps 3) — stays put
    expect(result.current.index).toBe(2)
    expect(result.current.isLast).toBe(true)
  })

  it("back() decrements the index and clamps at 0", () => {
    const { result } = setupHook()
    act(() => result.current.start())
    act(() => result.current.next())
    act(() => result.current.back())
    expect(result.current.index).toBe(0)
    act(() => result.current.back())
    expect(result.current.index).toBe(0)
    expect(result.current.isFirst).toBe(true)
  })

  it("complete() deactivates the tour and fires onComplete exactly once", () => {
    const { result, onComplete } = setupHook()
    act(() => result.current.start())
    act(() => result.current.complete())
    expect(result.current.active).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("skip() deactivates the tour and fires BOTH onSkip(currentIndex) and onComplete — skip counts as complete (spec)", () => {
    const { result, onComplete, onSkip } = setupHook()
    act(() => result.current.start())
    act(() => result.current.next())
    act(() => result.current.skip())
    expect(result.current.active).toBe(false)
    expect(onSkip).toHaveBeenCalledWith(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("stop() deactivates without firing onComplete — a silent abort, distinct from skip/complete", () => {
    const { result, onComplete } = setupHook()
    act(() => result.current.start())
    act(() => result.current.stop())
    expect(result.current.active).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("exposes a settable busy flag — TourOverlay uses this to gate double-clicks during transitions", () => {
    const { result } = setupHook()
    act(() => result.current.setBusy(true))
    expect(result.current.busy).toBe(true)
    act(() => result.current.setBusy(false))
    expect(result.current.busy).toBe(false)
  })
})

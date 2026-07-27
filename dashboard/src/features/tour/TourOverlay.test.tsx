import { act, fireEvent, render, screen } from "@testing-library/react"
import React, { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TourConfig } from "./tourTypes"
import { useTour, type UseTourOptions } from "./useTour"
import { TourOverlay } from "./TourOverlay"

const THREE_STEP_CONFIG: TourConfig = {
  name: "test-tour",
  steps: [
    { targetId: "a", title: "Bước một", body: "Nội dung bước một", tang: "XEM MỘT MÃ" },
    { targetId: "a", title: "Bước hai", body: "Nội dung bước hai" },
    { targetId: "a", title: "Bước ba", body: "Nội dung bước ba" },
  ],
}

function Harness({ config, callbacks }: { config: TourConfig; callbacks: UseTourOptions }) {
  const controller = useTour(config, callbacks)
  return (
    <>
      <button type="button" onClick={controller.start}>
        __start__
      </button>
      <TourOverlay config={config} controller={controller} />
    </>
  )
}

/**
 * Reproduces the target-resolution race (bug fix under test): the step's
 * `data-tour-id` target does NOT exist in the DOM on the render where
 * `TourOverlay`'s layout effect first resolves it — it only mounts once
 * `onStepView` fires. `useTour` fires `onStepView` from a `useEffect`, i.e. a
 * PASSIVE effect that commits after `TourOverlay`'s `useLayoutEffect`, same
 * ordering as the real bug (`Cap0TradingPage`'s `onStepView` → `setActivePanel`
 * switching the sidebar panel that owns the target).
 */
function LateTargetHarness({ config }: { config: TourConfig }) {
  const [showTarget, setShowTarget] = useState(false)
  const controller = useTour(config, {
    onComplete: vi.fn(),
    onStepView: () => setShowTarget(true),
  })
  return (
    <>
      <button type="button" onClick={controller.start}>
        __start__
      </button>
      {showTarget && <div data-tour-id="late-target" style={{ width: 40, height: 40 }} />}
      <TourOverlay config={config} controller={controller} />
    </>
  )
}

function setup(config: TourConfig, overrides: Partial<UseTourOptions> = {}) {
  const callbacks: UseTourOptions = {
    onComplete: overrides.onComplete ?? vi.fn(),
    onStepView: overrides.onStepView ?? vi.fn(),
    onStart: overrides.onStart ?? vi.fn(),
    onSkip: overrides.onSkip ?? vi.fn(),
  }
  render(<Harness config={config} callbacks={callbacks} />)
  act(() => {
    fireEvent.click(screen.getByText("__start__"))
  })
  return callbacks
}

/** Advance well past the ~350-400ms transition window (+ scroll settle) so `busy` clears. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(2000)
  })
}

let mountedTargets: HTMLElement[] = []

function mountTarget(id: string) {
  const el = document.createElement("div")
  el.setAttribute("data-tour-id", id)
  document.body.appendChild(el)
  mountedTargets.push(el)
  return el
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  // Remove only the target elements WE appended directly to `document.body`
  // (outside any RTL container) — wiping `body.innerHTML` wholesale would
  // yank the React portal's own node out from under it before RTL's
  // automatic per-test unmount runs, which throws "the node to be removed
  // is not a child of this node".
  mountedTargets.forEach((el) => el.remove())
  mountedTargets = []
})

describe("TourOverlay", () => {
  it("shows the step 0 title and the ĐIỂM 1/3 counter when active", () => {
    mountTarget("a")
    setup(THREE_STEP_CONFIG)
    expect(screen.getByText("Bước một")).toBeInTheDocument()
    expect(screen.getByText("ĐIỂM 1/3")).toBeInTheDocument()
  })

  it('clicking "Tiếp theo →" advances to step 1 and fires onStepView(1)', () => {
    mountTarget("a")
    const { onStepView } = setup(THREE_STEP_CONFIG)
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    expect(screen.getByText("Bước hai")).toBeInTheDocument()
    expect(screen.getByText("ĐIỂM 2/3")).toBeInTheDocument()
    expect(onStepView).toHaveBeenCalledWith(1)
  })

  it('"← Quay lại" is hidden on step 0 and visible on step 1', () => {
    mountTarget("a")
    setup(THREE_STEP_CONFIG)
    expect(screen.queryByText("← Quay lại")).not.toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    expect(screen.getByText("← Quay lại")).toBeInTheDocument()
  })

  it('on the last step the next button reads "Hoàn thành ✓", and clicking it calls onComplete', () => {
    mountTarget("a")
    const { onComplete } = setup(THREE_STEP_CONFIG)
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    settle()
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    expect(screen.getByText("ĐIỂM 3/3")).toBeInTheDocument()
    expect(screen.getByText("Hoàn thành ✓")).toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByText("Hoàn thành ✓"))
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('clicking "Bỏ qua tour" calls onComplete AND onSkip with the current step index (skip = complete)', () => {
    mountTarget("a")
    const { onComplete, onSkip } = setup(THREE_STEP_CONFIG)
    act(() => {
      fireEvent.click(screen.getByText("Bỏ qua tour"))
    })
    expect(onSkip).toHaveBeenCalledWith(0)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("clicking \"Bỏ qua tour\" mid-tour still calls onComplete + onSkip with the current index", () => {
    mountTarget("a")
    const { onComplete, onSkip } = setup(THREE_STEP_CONFIG)
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    settle()
    act(() => {
      fireEvent.click(screen.getByText("Bỏ qua tour"))
    })
    expect(onSkip).toHaveBeenCalledWith(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("renders a centered step's tooltip without requiring any mounted target", () => {
    const config: TourConfig = {
      name: "centered-tour",
      steps: [{ centered: true, title: "Khối ngoại", body: "Giải thích khối ngoại" }],
    }
    setup(config)
    expect(screen.getByText("Khối ngoại")).toBeInTheDocument()
    expect(screen.getByText("ĐIỂM 1/1")).toBeInTheDocument()
    // Last (and only) step — no back button, and the primary button completes.
    expect(screen.queryByText("← Quay lại")).not.toBeInTheDocument()
    expect(screen.getByText("Hoàn thành ✓")).toBeInTheDocument()
  })

  it("renders nothing before start() is called", () => {
    mountTarget("a")
    const callbacks: UseTourOptions = { onComplete: vi.fn() }
    render(<Harness config={THREE_STEP_CONFIG} callbacks={callbacks} />)
    expect(screen.queryByText("Bước một")).not.toBeInTheDocument()
  })

  it("a second rapid click on \"Tiếp theo →\" during the transition is ignored (busy gate)", () => {
    mountTarget("a")
    const { onStepView } = setup(THREE_STEP_CONFIG)
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    // Still mid-transition — clicking again immediately must not advance further.
    act(() => {
      fireEvent.click(screen.getByText("Tiếp theo →"))
    })
    expect(screen.getByText("ĐIỂM 2/3")).toBeInTheDocument()
    expect(onStepView).not.toHaveBeenCalledWith(2)
  })

  it("resolves the spotlight hole once the target mounts a render AFTER the step becomes active (panel-switch race)", () => {
    const config: TourConfig = {
      name: "late-target-tour",
      steps: [{ targetId: "late-target", title: "Bảng điện", body: "Nội dung" }],
    }
    render(<LateTargetHarness config={config} />)

    act(() => {
      fireEvent.click(screen.getByText("__start__"))
    })

    // Immediately on activation the target isn't in the DOM yet (mirrors the
    // real Cấp 0 Bảng điện tour's step 0/7 before `onStepView`'s
    // `setActivePanel` has switched the sidebar panel) — no hole yet, without
    // the fix this would never change.
    expect(document.querySelector(".iqx-tour-hole")).not.toBeInTheDocument()

    // Flush the fake-timer clock: this both lets the passive `onStepView`
    // effect mount the target AND lets `TourOverlay`'s rAF poll (also on the
    // fake clock) notice it and measure the hole.
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(document.querySelector(".iqx-tour-hole")).toBeInTheDocument()
  })
})

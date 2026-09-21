import { act, render, screen, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useStageVisibility } from "./visibility"

let covered: boolean
function Workspace() {
  const ref = useRef<HTMLElement>(null)
  const visible = useStageVisibility(ref)
  return <><section ref={ref} data-testid="visual" data-visible={visible}><span data-testid="artwork">Artwork</span></section><aside data-testid="panel" /></>
}

beforeEach(() => {
  covered = false
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} })
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON() {} })
  Object.defineProperty(document, "elementFromPoint", { configurable: true,
    value: () => document.querySelector(covered ? "aside" : "section span") })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("actual main visual visibility", () => {
  it("ignores sprite-frame style mutations inside the stage but still measures external overlays", async () => {
    render(<Workspace />)
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "true"))
    const measure = vi.mocked(HTMLElement.prototype.getBoundingClientRect)
    const baseline = measure.mock.calls.length
    await act(async () => {
      screen.getByTestId("artwork").style.transform = "translate3d(-100%, 0, 0)"
      await new Promise(resolve => setTimeout(resolve, 30))
    })
    expect(measure).toHaveBeenCalledTimes(baseline)

    covered = true
    await act(async () => { screen.getByTestId("panel").style.display = "block" })
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "false"))
    expect(measure.mock.calls.length).toBeGreaterThan(baseline)
  })
  it("pauses when an existing overlay covers the artwork through a style change", async () => {
    render(<Workspace />)
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "true"))
    covered = true
    await act(async () => { screen.getByTestId("panel").style.transform = "translateY(0)" })
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "false"))
    covered = false
    await act(async () => { screen.getByTestId("panel").style.transform = "translateY(100%)" })
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "true"))
  })
  it("remeasures the final position of a panel revealed with CSS keyframes", async () => {
    render(<Workspace />)
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "true"))
    covered = true
    await act(async () => { screen.getByTestId("panel").dispatchEvent(new Event("animationend", { bubbles: true })) })
    await waitFor(() => expect(screen.getByTestId("visual")).toHaveAttribute("data-visible", "false"))
  })
  it("pauses for browser backgrounding and resumes without remounting the visual", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    render(<Workspace />)
    const original = screen.getByTestId("visual")
    await waitFor(() => expect(original).toHaveAttribute("data-visible", "true"))
    visibility.mockReturnValue("hidden")
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
    await waitFor(() => expect(original).toHaveAttribute("data-visible", "false"))
    visibility.mockReturnValue("visible")
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
    await waitFor(() => expect(original).toHaveAttribute("data-visible", "true"))
    expect(screen.getByTestId("visual")).toBe(original)
  })
})

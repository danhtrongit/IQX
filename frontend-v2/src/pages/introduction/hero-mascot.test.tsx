import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HeroMascot } from "./hero-mascot"

function Scene() {
  const hostRef = useRef<HTMLElement>(null)
  return <section ref={hostRef}><HeroMascot hostRef={hostRef} /></section>
}

function prepare(reducedMotion = false) {
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal("Image", class {
    naturalWidth = 3840
    naturalHeight = 640
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("HeroMascot", () => {
  it("plays a real greeting strip once and returns to the sharp still", async () => {
    prepare()
    const { container } = render(<Scene />)
    await waitFor(() => expect(container.querySelector(".intro-mascot-trigger")).toBeTruthy())
    await act(async () => { await Promise.resolve() })
    vi.useFakeTimers()
    fireEvent.pointerEnter(container.querySelector("section")!)
    expect(container.querySelector('[data-frame="0"]')).toBeTruthy()
    for (const duration of [100, 180, 220, 220, 220, 380]) {
      act(() => { vi.advanceTimersByTime(duration) })
    }
    expect(container.querySelector(".intro-mascot-greet")).toBeNull()
    expect(screen.getByRole("img", { name: /Thanh Long, linh thú/ })).toHaveProperty("style.visibility", "visible")
  })

  it("keeps the still artwork when reduced motion is requested", () => {
    prepare(true)
    const { container } = render(<Scene />)
    fireEvent.pointerEnter(container.querySelector("section")!)
    fireEvent.click(screen.getByRole("button", { name: "Thanh Long vẫy chào" }))
    expect(container.querySelector(".intro-mascot-greet")).toBeNull()
  })
})

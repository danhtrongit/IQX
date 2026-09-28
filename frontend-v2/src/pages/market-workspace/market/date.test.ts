import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { localTodayIso, useLocalTodayIso } from "./date"

describe("market local date", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("updates the reactive date after local midnight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 27, 23, 59, 59, 900))

    const { result, unmount } = renderHook(() => useLocalTodayIso())
    expect(result.current).toBe("2026-09-27")

    vi.setSystemTime(new Date(2026, 8, 28, 0, 0, 0, 0))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    expect(result.current).toBe("2026-09-28")
    unmount()
  })

  it("resynchronizes after a hidden tab sleeps across midnight", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 27, 23, 0, 0))

    const { result, unmount } = renderHook(() => useLocalTodayIso())
    expect(result.current).toBe("2026-09-27")

    vi.setSystemTime(new Date(2026, 8, 28, 8, 0, 0))
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(result.current).toBe(localTodayIso())
    expect(result.current).toBe("2026-09-28")
    unmount()
  })
})

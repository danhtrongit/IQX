// useFeatureTour.test.tsx
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { TourConfig } from "./tourTypes"
import { useFeatureTour } from "./useFeatureTour"

const CONFIG: TourConfig = {
  name: "unit-feature-tour",
  steps: [
    { title: "A", body: "a" },
    { title: "B", body: "b" },
  ],
}

const STORAGE_KEY = "iqx_tour_test_unit"

describe("useFeatureTour", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY)
  })

  it("does not auto-run — controller starts inactive", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    expect(result.current.controller.active).toBe(false)
  })

  it("start() activates the underlying tour controller at step 0", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    act(() => result.current.start())
    expect(result.current.controller.active).toBe(true)
    expect(result.current.controller.index).toBe(0)
  })

  it("seen defaults to false when localStorage has no record for storageKey", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    expect(result.current.seen).toBe(false)
  })

  it("seen is true on mount when localStorage already has the seen flag", () => {
    window.localStorage.setItem(STORAGE_KEY, "1")
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    expect(result.current.seen).toBe(true)
  })

  it("finishing the tour (complete) marks seen=true and persists it to localStorage", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    act(() => result.current.start())
    act(() => result.current.controller.complete())
    expect(result.current.seen).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1")
  })

  it("skip() also marks seen=true — skip counts as complete (engine contract)", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    act(() => result.current.start())
    act(() => result.current.controller.skip())
    expect(result.current.seen).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1")
  })

  it("markSeen() persists the seen flag without running the tour", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY }))
    act(() => result.current.markSeen())
    expect(result.current.seen).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1")
  })

  it("works without a storageKey — in-memory seen still flips, nothing thrown", () => {
    const { result } = renderHook(() => useFeatureTour(CONFIG))
    act(() => result.current.start())
    expect(() => act(() => result.current.controller.complete())).not.toThrow()
    expect(result.current.seen).toBe(true)
  })

  it("does not throw when localStorage access fails (SSR / private-mode guard)", () => {
    const original = window.localStorage
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked")
        },
        setItem: () => {
          throw new Error("blocked")
        },
      },
      configurable: true,
    })

    try {
      expect(() =>
        renderHook(() => useFeatureTour(CONFIG, { storageKey: STORAGE_KEY })),
      ).not.toThrow()
    } finally {
      Object.defineProperty(window, "localStorage", { value: original, configurable: true })
    }
  })
})

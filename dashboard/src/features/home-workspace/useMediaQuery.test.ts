import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { useMediaQuery } from "./useMediaQuery"

describe("useMediaQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the stubbed matches value when matchMedia is available", () => {
    const addEventListenerFn = vi.fn()
    const removeEventListenerFn = vi.fn()

    const fakeMediaQueryList = {
      matches: true,
      addEventListener: addEventListenerFn,
      removeEventListener: removeEventListenerFn,
      // legacy fallback stubs
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }

    vi.spyOn(window, "matchMedia").mockReturnValue(
      fakeMediaQueryList as unknown as MediaQueryList,
    )

    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"))
    expect(result.current).toBe(true)
  })

  it("returns false when matchMedia returns matches:false", () => {
    const fakeMediaQueryList = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }

    vi.spyOn(window, "matchMedia").mockReturnValue(
      fakeMediaQueryList as unknown as MediaQueryList,
    )

    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"))
    expect(result.current).toBe(false)
  })

  it("returns false when matchMedia is not a function", () => {
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      value: undefined,
      writable: true,
      configurable: true,
    })
    try {
      const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"))
      expect(result.current).toBe(false)
    } finally {
      Object.defineProperty(window, "matchMedia", {
        value: originalMatchMedia,
        writable: true,
        configurable: true,
      })
    }
  })
})

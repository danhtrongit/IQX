import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useInitialSymbol, persistLastViewedSymbol, LAST_VIEWED_KEY } from "./useInitialSymbol"

vi.mock("@/features/watchlist", () => ({ useWatchlist: vi.fn() }))
import { useWatchlist } from "@/features/watchlist"

describe("useInitialSymbol", () => {
  beforeEach(() => {
    localStorage.clear()
    ;(useWatchlist as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] })
  })

  it("returns the persisted last-viewed symbol when present", () => {
    localStorage.setItem(LAST_VIEWED_KEY, "HPG")
    const { result } = renderHook(() => useInitialSymbol())
    expect(result.current).toBe("HPG")
  })

  it("falls back to the first watchlist item when no last-viewed", () => {
    ;(useWatchlist as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [{ symbol: "FPT" }, { symbol: "VCB" }] })
    const { result } = renderHook(() => useInitialSymbol())
    expect(result.current).toBe("FPT")
  })

  it("falls back to VNINDEX when nothing else is available", () => {
    const { result } = renderHook(() => useInitialSymbol())
    expect(result.current).toBe("VNINDEX")
  })

  it("persistLastViewedSymbol stores a stock but ignores an index", () => {
    persistLastViewedSymbol("HPG")
    expect(localStorage.getItem(LAST_VIEWED_KEY)).toBe("HPG")
    persistLastViewedSymbol("VNINDEX")
    expect(localStorage.getItem(LAST_VIEWED_KEY)).toBe("HPG") // unchanged
  })
})

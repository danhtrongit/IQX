import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import type { DailyAnalysis } from "./types"

const { fetchDailyAnalysis } = vi.hoisted(() => ({
  fetchDailyAnalysis: vi.fn(),
}))

vi.mock("./api", () => ({
  fetchDailyAnalysis,
  fetchMidDayAnalysis: vi.fn(),
  fetchPreMarketAnalysis: vi.fn(),
}))

import { useDailyMarketAnalysis } from "./hooks"

const wrapper = (queryClient: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

const brief = (session_date: string): DailyAnalysis => ({ session_date } as DailyAnalysis)

describe("market analysis freshness polling", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("polls a stale latest report until today's response arrives, then stops", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0, 0))
    fetchDailyAnalysis
      .mockResolvedValueOnce(brief("2026-09-27"))
      .mockResolvedValueOnce(brief("2026-09-28"))

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(() => useDailyMarketAnalysis(), { wrapper: wrapper(queryClient) })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.data?.session_date).toBe("2026-09-27")
    expect(fetchDailyAnalysis).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.data?.session_date).toBe("2026-09-28")
    expect(fetchDailyAnalysis).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(fetchDailyAnalysis).toHaveBeenCalledTimes(2)
    unmount()
    queryClient.clear()
  })
})

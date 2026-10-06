import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EngineRefreshResult } from "./use-engine-refresh"
import { useEngineRefresh } from "./use-engine-refresh"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  api: mocks.refresh,
  errorMessage: (error: unknown) => String(error),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "user-a" } }),
}))

vi.mock("@/hooks/use-trading", () => ({
  useTradingAccount: () => ({ data: { id: "acc-1" } }),
}))

function payload(
  overrides: Partial<EngineRefreshResult> = {}
): EngineRefreshResult {
  return {
    orders_filled: 0,
    orders_expired: 0,
    settlements_settled: 0,
    warnings: [],
    ...overrides,
  }
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  mocks.refresh.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useEngineRefresh", () => {
  it("invalidates the portfolio query even when the refresh changed nothing", async () => {
    mocks.refresh.mockResolvedValue(payload())
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    vi.useFakeTimers()

    const { result } = renderHook(() => useEngineRefresh(), {
      wrapper: wrapper(client),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(result.current.state).toEqual({
      status: "ok",
      changed: 0,
      warnings: [],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["trading", "portfolio"],
    })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["journey"] })
  })

  it("counts a rights payout as a change and invalidates the broader domains", async () => {
    mocks.refresh.mockResolvedValue(payload({ rights_cash_paid: 1 }))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    vi.useFakeTimers()

    const { result } = renderHook(() => useEngineRefresh(), {
      wrapper: wrapper(client),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(result.current.state).toEqual({
      status: "ok",
      changed: 1,
      warnings: [],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["trading", "portfolio"],
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["trading"] })
  })
})

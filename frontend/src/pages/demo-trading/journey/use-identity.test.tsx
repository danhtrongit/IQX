import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { IdentityState } from "./types"
import { useIdentity } from "./use-identity"

const mocks = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  getIdentity: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}))

vi.mock("@/lib/api", () => ({ api: mocks.getIdentity }))

function identity(status: "idle" | "running" | "succeeded", runId: string | null = null): IdentityState {
  return {
    lifecycle: "mascot",
    current_level: 6,
    cap6_graduated_at: "2026-09-27T00:00:00Z",
    mascot_rules_version: 1,
    mascot: null,
    today_local: "2026-09-27",
    timezone: "Asia/Ho_Chi_Minh",
    ui_state: {
      last_seen_egg_level: 6,
      egg_hatch_seen_at: "2026-09-27T00:00:00Z",
      reveal_seen_at: "2026-09-27T00:00:00Z",
      greeted_local_date: "2026-09-27",
      last_animated_bot_run_id: null,
    },
    bot_run: {
      status,
      latest_run_id: runId,
      last_updated_at: null,
      processed_unseen_sessions: 0,
      issues: [],
      connected: status !== "idle",
    },
  }
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  mocks.userId = "user-a"
  mocks.getIdentity.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useIdentity", () => {
  it("refreshes Bot run state every 30 seconds while mounted and keeps each user's cache separate", async () => {
    let current = identity("idle")
    mocks.getIdentity.mockImplementation(async () => current)
    const queryClient = client()
    vi.useFakeTimers()
    const { result, rerender } = renderHook(() => useIdentity(), { wrapper: wrapper(queryClient) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(result.current.data?.bot_run.status).toBe("idle")
    expect(mocks.getIdentity).toHaveBeenCalledTimes(1)

    current = identity("running", "run-a")
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.getIdentity).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData<IdentityState>(["identity", "user-a"])?.bot_run.status).toBe("running")
    expect(result.current.data?.bot_run.status).toBe("running")

    current = identity("succeeded", "run-a")
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.data?.bot_run.status).toBe("succeeded")
    expect(queryClient.getQueryData<IdentityState>(["identity", "user-a"])?.bot_run.status).toBe("succeeded")

    mocks.userId = "user-b"
    current = identity("idle")
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.data?.bot_run.status).toBe("idle")
    expect(queryClient.getQueryData<IdentityState>(["identity", "user-a"])?.bot_run.status).toBe("succeeded")
    expect(queryClient.getQueryData<IdentityState>(["identity", "user-b"])?.bot_run.status).toBe("idle")
  })

  it("does not poll when signed out or the page is hidden", async () => {
    mocks.userId = null
    mocks.getIdentity.mockResolvedValue(identity("idle"))
    const queryClient = client()
    vi.useFakeTimers()
    const { rerender } = renderHook(() => useIdentity(), { wrapper: wrapper(queryClient) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.getIdentity).not.toHaveBeenCalled()

    mocks.userId = "user-a"
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.getIdentity).toHaveBeenCalledTimes(1)
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.getIdentity).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })
})

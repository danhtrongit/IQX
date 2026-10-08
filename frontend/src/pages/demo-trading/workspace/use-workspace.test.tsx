import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useWorkspace } from "./use-workspace"
import { resetEnsuredWorkspaces, resolveActiveMascotId } from "./workspace-api"

const mocks = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  api: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}))

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

async function notFound() {
  const { ApiError } = await import("@/lib/api")
  return new ApiError("Not found", 404)
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function calls(path: string, method?: string) {
  return mocks.api.mock.calls.filter(([url, init]) => url === path && (!method || init?.method === method))
}

beforeEach(() => {
  mocks.userId = "user-a"
  mocks.api.mockReset()
  resetEnsuredWorkspaces()
})

describe("workspace bootstrap", () => {
  it("ensures once per session, before reading state, and never repeats on re-render or remount", async () => {
    const order: string[] = []
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      order.push(`${init?.method ?? "GET"} ${path}`)
      if (path === "/workspace/state") return { data: { active_mascot: { mascot_id: "thanh_long" } } }
      return { data: { ok: true } }
    })
    const client = newClient()
    const first = renderHook(() => useWorkspace(), { wrapper: wrapper(client) })
    await waitFor(() => expect(first.result.current.mascotId).toBe("thanh_long"))
    first.rerender()
    first.rerender()
    first.unmount()

    const second = renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(second.result.current.mascotId).toBe("thanh_long"))

    expect(calls("/workspace/ensure", "POST")).toHaveLength(1)
    expect(order.indexOf("POST /workspace/ensure")).toBeLessThan(order.indexOf("GET /workspace/state"))
    expect(calls("/workspace/ensure").every(([, init]) => init?.method === "POST")).toBe(true)
  })

  it("ensures again for a different account", async () => {
    mocks.api.mockResolvedValue({ data: {} })
    const view = renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(calls("/workspace/state")).toHaveLength(1))
    mocks.userId = "user-b"
    view.rerender()
    await waitFor(() => expect(calls("/workspace/state")).toHaveLength(2))
    expect(calls("/workspace/ensure", "POST")).toHaveLength(2)
  })

  it("does nothing for a signed-out visitor", async () => {
    mocks.userId = null
    const view = renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.api).not.toHaveBeenCalled()
    expect(view.result.current.mascotId).toBe("bach_ho")
  })

  it("ignores a 404 from a backend that has no workspace routes yet and falls back to Bạch Hổ", async () => {
    const missing = await notFound()
    mocks.api.mockRejectedValue(missing)
    const first = renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(calls("/workspace/state")).toHaveLength(1))
    expect(first.result.current.mascotId).toBe("bach_ho")
    expect(first.result.current.state).toBeNull()
    first.unmount()

    renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(calls("/workspace/state")).toHaveLength(2))
    // 404 counts as settled: the missing route is not hammered on every mount.
    expect(calls("/workspace/ensure", "POST")).toHaveLength(1)
  })

  it("keeps reading state after another ensure failure and retries ensure on the next mount", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/workspace/ensure") throw new Error("boom")
      return { data: { active_mascot: { mascot_id: "loc_huou" } } }
    })
    const first = renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(first.result.current.mascotId).toBe("loc_huou"))
    first.unmount()
    renderHook(() => useWorkspace(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(calls("/workspace/ensure", "POST")).toHaveLength(2))
  })
})

describe("active mascot", () => {
  it("uses the account's mascot and never an unknown id", () => {
    expect(resolveActiveMascotId({ active_mascot: { mascot_id: "phung_hoang" } })).toBe("phung_hoang")
    expect(resolveActiveMascotId({ active_mascot: { mascot_id: "egg" } })).toBe("bach_ho")
    expect(resolveActiveMascotId({ active_mascot: null })).toBe("bach_ho")
    expect(resolveActiveMascotId({})).toBe("bach_ho")
    expect(resolveActiveMascotId(null)).toBe("bach_ho")
  })

  it("reads the shape GET /workspace/state really returns (mascot.active_mascot_id)", () => {
    expect(resolveActiveMascotId({ mascot: { active_mascot_id: "kim_quy", revision: 4 } })).toBe("kim_quy")
    expect(resolveActiveMascotId({ mascot: { active_mascot_id: "egg" } })).toBe("bach_ho")
    expect(resolveActiveMascotId({ mascot: { active_mascot_id: "thanh_long" }, active_mascot: { mascot_id: "kim_quy" } })).toBe("thanh_long")
  })
})

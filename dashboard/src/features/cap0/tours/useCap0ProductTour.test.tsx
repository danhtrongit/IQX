import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type { TourConfig } from "@/features/tour"

const { jsonMock, postMock, trackMock, authRef } = vi.hoisted(() => ({
  jsonMock: vi.fn(),
  postMock: vi.fn(),
  trackMock: vi.fn(),
  authRef: { current: { isAuthenticated: true, user: { id: "user-7" } } },
}))
vi.mock("@/shared/http/client", () => ({ api: { post: postMock } }))
vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: trackMock }))
vi.mock("@/features/auth", () => ({ useAuth: () => authRef.current }))

import { useCap0ProductTour } from "./useCap0ProductTour"

const config: TourConfig = { name: "bantin", steps: [{ title: "Một", body: "Một", centered: true }] }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useCap0ProductTour(config, "bantin"), { wrapper })
  return { ...hook, client, invalidate }
}

describe("useCap0ProductTour", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRef.current = { isAuthenticated: true, user: { id: "user-7" } }
    jsonMock.mockResolvedValue({ da_xem_tour: false, completed: ["bantin"] })
    postMock.mockReturnValue({ json: jsonMock })
  })

  it("emits complete and finishes UI only after the server write, then refreshes Cap0", async () => {
    const onFinished = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    let resolveWrite!: (value: unknown) => void
    jsonMock.mockReturnValue(new Promise((resolve) => { resolveWrite = resolve }))
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useCap0ProductTour(config, "bantin", { onFinished }), { wrapper })

    act(() => result.current.start())
    act(() => result.current.complete())
    expect(trackMock).not.toHaveBeenCalledWith("tour_bantin_complete")
    expect(onFinished).not.toHaveBeenCalled()

    resolveWrite({})
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(false))
    expect(trackMock).toHaveBeenCalledWith("tour_bantin_complete")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cap0"] })
  })

  it("persists skip but never emits the full-completion event", async () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.skip())
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("cap0/tours/bantin/complete", { json: { skipped: true } }))
    expect(trackMock).toHaveBeenCalledWith("tour_bantin_skip", { step_id: 1 })
    expect(trackMock).not.toHaveBeenCalledWith("tour_bantin_complete")
  })

  it("keeps an auth failure retryable without replaying and scopes the mutation to the user", async () => {
    authRef.current = { isAuthenticated: false, user: null as never }
    const { result, rerender, client } = setup()
    act(() => result.current.start())
    act(() => result.current.complete())
    await waitFor(() => expect(result.current.completionError).toBeTruthy())
    expect(postMock).not.toHaveBeenCalled()

    authRef.current = { isAuthenticated: true, user: { id: "user-9" } }
    rerender()
    act(() => result.current.retryCompletion())
    await waitFor(() => expect(trackMock).toHaveBeenCalledWith("tour_bantin_complete"))
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(client.getMutationCache().getAll().at(-1)?.options.mutationKey).toEqual([
      "cap0", "tour-complete", "user-9", "bantin",
    ])
  })
})

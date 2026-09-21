import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PropsWithChildren } from "react"
import { useLearningReading } from "./hooks"
import { identityApi } from "./api"
import { LOP_KEYS } from "@/features/cap4/doc5Lop"
import type { Lop5Partial } from "@/features/cap4/types"
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ user: { id: "user" } }) }))
vi.mock("./api", () => ({ identityApi: { dataset: vi.fn(), submit: vi.fn(), reveal: vi.fn() } }))
const all = Object.fromEntries(LOP_KEYS.map(key => [key, "ok"])) as Lop5Partial
const rows = Object.fromEntries(LOP_KEYS.map(key => [key, { lines: ["source"], degraded: false }]))
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(identityApi.dataset).mockResolvedValue({ id: "dataset", symbol: "VNM", trading_date: "2026-09-11", price: 100, readings: rows } as never)
  vi.mocked(identityApi.submit).mockResolvedValue({ id: "assessment", dataset_id: "dataset" })
  vi.mocked(identityApi.reveal).mockResolvedValue({ id: "assessment", dataset_id: "dataset", ai_answers: all, first_answers: all, readings: rows } as never)
})
describe("pre-reveal request protocol", () => {
  it("loads only the masked dataset before all answers are complete", async () => {
    const { result } = renderHook(() => useLearningReading("VNM", { ky_thuat: "ok" }), { wrapper })
    await waitFor(() => expect(result.current.dataset.isSuccess).toBe(true))
    expect(identityApi.submit).not.toHaveBeenCalled()
    expect(identityApi.reveal).not.toHaveBeenCalled()
    expect(result.current.aiAnswers).toBeNull()
  })
  it("waits for the committed submission receipt before requesting any AI", async () => {
    let resolve!: (value: { id: string; dataset_id: string }) => void
    vi.mocked(identityApi.submit).mockImplementation(() => new Promise(r => { resolve = r }))
    const { result } = renderHook(() => useLearningReading("VNM", all), { wrapper })
    await waitFor(() => expect(identityApi.submit).toHaveBeenCalledTimes(1))
    expect(identityApi.reveal).not.toHaveBeenCalled()
    expect(result.current.aiAnswers).toBeNull()
    await act(async () => resolve({ id: "committed", dataset_id: "dataset" }))
    await waitFor(() => expect(identityApi.reveal).toHaveBeenCalledWith("committed"))
    await waitFor(() => expect(result.current.aiAnswers).toEqual(all))
  })
  it("changing a rated answer after reveal never rewrites the original receipt", async () => {
    const client = new QueryClient()
    const stable = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, rerender } = renderHook(({ answers }) => useLearningReading("VNM", answers), { initialProps: { answers: all }, wrapper: stable })
    await waitFor(() => expect(result.current.aiAnswers).toEqual(all))
    rerender({ answers: { ...all, ky_thuat: "bad" } })
    expect(identityApi.submit).toHaveBeenCalledTimes(1)
    expect(identityApi.submit).toHaveBeenCalledWith("dataset", all)
  })
})

import { act, cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { api } = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, api }
})
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" }, isPremium: true }) }))

import { ApiError } from "@/lib/api"

import { InvestmentViewBlock } from "./investment-view-block"
import type { InvestmentView } from "./types"

const theses = [
  { id: "b", order: 2, title: "Biên lãi quyết định", summary: "Tóm tắt hai" },
  { id: "a", order: 1, title: "Tăng trưởng ổn định", summary: "Tóm tắt một" },
]

function ready(valuation: Extract<InvestmentView, { status: "ready" }>["valuation"], t = theses): InvestmentView {
  return { status: "ready", version: 1, theses: t, valuation }
}

const RANGE = {
  mode: "range",
  targetMedian: 68000,
  targetMin: 65000,
  targetMax: 72000,
  currentPrice: 61700,
  upsidePercent: 10.2,
} as const

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InvestmentViewBlock symbol="vcb" />
    </QueryClientProvider>,
  )
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe("InvestmentViewBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("renders theses in order and a range valuation", async () => {
    api.mockResolvedValue({ data: ready(RANGE) })
    renderBlock()
    await flush()

    expect(api.mock.calls[0][0]).toBe("/ai/investment-view/VCB")
    const section = screen.getByRole("region", { name: "Góc nhìn đầu tư" })
    expect(section).toBeTruthy()
    const items = screen.getAllByRole("listitem")
    expect(items[0].textContent).toContain("Tăng trưởng ổn định")
    expect(items[0].textContent).toContain("01")
    expect(items[1].textContent).toContain("02")
    expect(screen.getByText("Luận điểm chính")).toBeTruthy()
    expect(screen.getByText("Giá mục tiêu trung vị")).toBeTruthy()
    expect(screen.getByText("68.000")).toBeTruthy()
    expect(screen.getByText("Khoảng tham chiếu")).toBeTruthy()
    expect(screen.getByText("65.000 – 72.000")).toBeTruthy()
    expect(screen.getByText("So với giá hiện tại")).toBeTruthy()
    expect(screen.getByText("+10,2%")).toBeTruthy()
  })

  it("renders single mode without a range row and a negative upside", async () => {
    api.mockResolvedValue({
      data: ready({ mode: "single", targetMedian: 68000, currentPrice: 70500, upsidePercent: -3.5 }),
    })
    renderBlock()
    await flush()

    expect(screen.getByText("Giá mục tiêu")).toBeTruthy()
    expect(screen.queryByText("Khoảng tham chiếu")).toBeNull()
    expect(screen.queryByText("Giá mục tiêu trung vị")).toBeNull()
    expect(screen.getByText("-3,5%")).toBeTruthy()
  })

  it("hides the upside row when upsidePercent is null", async () => {
    api.mockResolvedValue({
      data: ready({ mode: "single", targetMedian: 68000, currentPrice: null, upsidePercent: null }),
    })
    renderBlock()
    await flush()

    expect(screen.getByText("68.000")).toBeTruthy()
    expect(screen.queryByText("So với giá hiện tại")).toBeNull()
  })

  it("hides the valuation module when valuation is null", async () => {
    api.mockResolvedValue({ data: ready(null) })
    renderBlock()
    await flush()

    expect(screen.getByText("Luận điểm chính")).toBeTruthy()
    expect(screen.queryByText("Định giá tham chiếu")).toBeNull()
  })

  it("hides the theses module when there are none, and renders nothing when both are hidden", async () => {
    api.mockResolvedValue({ data: ready(RANGE, []) })
    const first = renderBlock()
    await flush()
    expect(screen.queryByText("Luận điểm chính")).toBeNull()
    expect(screen.getByText("Định giá tham chiếu")).toBeTruthy()
    first.unmount()

    api.mockResolvedValue({ data: ready(null, []) })
    const { container } = renderBlock()
    await flush()
    expect(container.innerHTML).toBe("")
  })

  it("shows a skeleton while processing, polls the status endpoint, then renders", async () => {
    api.mockImplementation(async (path: string) => {
      if (path.includes("/status")) {
        const polls = api.mock.calls.filter(([p]) => String(p).includes("/status")).length
        return { data: polls < 2 ? { status: "processing", jobId: "job-1" } : ready(RANGE) }
      }
      return { data: { status: "processing", jobId: "job-1" } }
    })
    renderBlock()
    await flush()

    const section = screen.getByRole("region", { name: "Góc nhìn đầu tư" })
    expect(section.getAttribute("aria-busy")).toBe("true")
    expect(screen.getByTestId("investment-view-skeleton")).toBeTruthy()
    expect(api.mock.calls.some(([p]) => p === "/ai/investment-view/VCB/status?jobId=job-1")).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(screen.queryByTestId("investment-view-skeleton")).toBeNull()
    expect(screen.getByText("65.000 – 72.000")).toBeTruthy()
    const calls = api.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(api.mock.calls.length).toBe(calls)
  })

  it("backs off polling to 10 s after one minute", async () => {
    api.mockImplementation(async () => ({
      data: { status: "processing", jobId: "job-1" },
    }))
    renderBlock()
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    const before = api.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(api.mock.calls.length - before).toBe(1)
  })

  it.each([
    ["empty", () => api.mockResolvedValue({ data: { status: "empty" } })],
    [
      "feature disabled",
      () => api.mockRejectedValue(new ApiError("off", 404, { code: "FEATURE_DISABLED" })),
    ],
    [
      "premium required",
      () => api.mockRejectedValue(new ApiError("pay", 403, { code: "PREMIUM_REQUIRED" })),
    ],
    ["server error", () => api.mockRejectedValue(new ApiError("boom", 500, { code: "INTERNAL" }))],
  ])("renders nothing on %s", async (_name, setup) => {
    setup()
    const { container } = renderBlock()
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(container.innerHTML).toBe("")
  })
})

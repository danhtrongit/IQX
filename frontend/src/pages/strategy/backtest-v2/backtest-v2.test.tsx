import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"

import { REGISTRY, runResult, sharedState } from "./test-fixtures"

const mocks = vi.hoisted(() => ({
  getSharedConfig: vi.fn(),
  getTechnicalRegistry: vi.fn(),
  saveSharedConfig: vi.fn(),
  runBacktestV2: vi.fn(),
  getBacktestRun: vi.fn(),
  listBacktestRuns: vi.fn(),
}))

vi.mock("@/lib/shared-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared-config")>()),
  getSharedConfig: mocks.getSharedConfig,
  getTechnicalRegistry: mocks.getTechnicalRegistry,
  saveSharedConfig: mocks.saveSharedConfig,
}))

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  runBacktestV2: mocks.runBacktestV2,
  getBacktestRun: mocks.getBacktestRun,
  listBacktestRuns: mocks.listBacktestRuns,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isPremium: true, premiumLoading: false }),
}))

vi.mock("../backtest/symbol-info-box", () => ({ SymbolInfoBox: () => null }))

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}))

const { BacktestV2 } = await import("./backtest-v2")

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function renderV2() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BacktestV2 initialSymbol="fpt" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSharedConfig.mockResolvedValue(sharedState())
  mocks.getTechnicalRegistry.mockResolvedValue(REGISTRY)
  mocks.listBacktestRuns.mockResolvedValue([])
})

describe("BacktestV2", () => {
  it("lists only learned indicators and edits Buy and Sell tabs independently", async () => {
    const user = userEvent.setup()
    renderV2()
    expect(await screen.findByTestId("library-ma")).toBeTruthy()
    expect(screen.getByTestId("library-rsi")).toBeTruthy()
    expect(screen.queryByTestId("library-macd")).toBeNull()

    const buyPeriod = screen.getByLabelText("Chu kỳ SMA · MA / SMA · Mua")
    await user.clear(buyPeriod)
    await user.type(buyPeriod, "50")
    await user.click(screen.getByRole("tab", { name: "BÁN" }))
    expect((screen.getByLabelText("Chu kỳ SMA · MA / SMA · Bán") as HTMLInputElement).value).toBe("20")

    await user.click(screen.getByRole("tab", { name: "MUA" }))
    expect((screen.getByLabelText("Chu kỳ SMA · MA / SMA · Mua") as HTMLInputElement).value).toBe("50")
    expect(screen.getByTestId("revision-banner").textContent).toContain("Bản nháp chưa lưu")
  })

  it("blocks the run while the draft is dirty and runs the SAVED revision once saved", async () => {
    const user = userEvent.setup()
    mocks.saveSharedConfig.mockImplementation(async (body: { indicators: Record<string, unknown> }) => {
      const state = sharedState()
      return {
        revision: 4,
        config: { ...state.config, revision: 4, indicators: { ...state.config.indicators, ...body.indicators } },
        config_hash: "hash-4",
        effective_session: "2026-05-06",
        status: "pending",
      }
    })
    mocks.runBacktestV2.mockResolvedValue({ run_id: "run-1", status: "succeeded", result: runResult() })
    renderV2()

    const run = (await screen.findByRole("button", { name: "Chạy backtest" })) as HTMLButtonElement
    expect(run.disabled).toBe(false)

    const buyPeriod = screen.getByLabelText("Chu kỳ SMA · MA / SMA · Mua")
    await user.clear(buyPeriod)
    await user.type(buyPeriod, "50")
    expect(run.disabled).toBe(true)
    expect(screen.getByTestId("run-hint").textContent).toContain("hãy Lưu trước khi chạy")

    await user.click(screen.getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(run.disabled).toBe(false))
    expect(mocks.saveSharedConfig).toHaveBeenCalledTimes(1)
    const patch = mocks.saveSharedConfig.mock.calls[0]![0]
    expect(patch.expected_revision).toBe(3)
    expect(Object.keys(patch.indicators)).toEqual(["ma"])
    expect(patch.indicators.ma.buy.params.period).toBe(50)
    expect(patch.indicators.ma.sell.params.period).toBe(20)

    await user.click(run)
    await user.click(run)
    await waitFor(() => expect(mocks.runBacktestV2).toHaveBeenCalledTimes(2))
    const [first, second] = mocks.runBacktestV2.mock.calls.map((call) => call[0])
    expect(first).toMatchObject({
      shared_revision: 4,
      symbol: "FPT",
      assumptions: { fee_preset: "standard", execution: "next_open" },
    })
    expect(first.assumptions.capital).toBeUndefined()
    expect(first.idempotency_key).not.toBe(second.idempotency_key)
    expect(await screen.findByTestId("snapshot")).toBeTruthy()
  })

  it("keeps the draft and shows a conflict banner on 409 REVISION_CONFLICT", async () => {
    const user = userEvent.setup()
    mocks.saveSharedConfig.mockRejectedValue(
      new ApiError("Xung đột", 409, { code: "REVISION_CONFLICT", details: { current_revision: 5 } }),
    )
    renderV2()
    const buyPeriod = await screen.findByLabelText("Chu kỳ SMA · MA / SMA · Mua")
    await user.clear(buyPeriod)
    await user.type(buyPeriod, "50")
    await user.click(screen.getByRole("button", { name: "Lưu" }))

    expect(await screen.findByTestId("conflict-banner")).toBeTruthy()
    expect((screen.getByLabelText("Chu kỳ SMA · MA / SMA · Mua") as HTMLInputElement).value).toBe("50")
    expect(screen.getByTestId("revision-banner").textContent).toContain("Bản nháp chưa lưu")
  })

  it("Đặt lại resets only the current tab; Hủy restores the saved revision", async () => {
    const user = userEvent.setup()
    renderV2()
    const buyPeriod = await screen.findByLabelText("Chu kỳ SMA · MA / SMA · Mua")
    await user.clear(buyPeriod)
    await user.type(buyPeriod, "50")
    await user.click(screen.getByRole("tab", { name: "BÁN" }))
    const sellPeriod = screen.getByLabelText("Chu kỳ SMA · MA / SMA · Bán")
    await user.clear(sellPeriod)
    await user.type(sellPeriod, "30")

    await user.click(screen.getByRole("button", { name: "Đặt lại" }))
    expect((screen.getByLabelText("Chu kỳ SMA · MA / SMA · Bán") as HTMLInputElement).value).toBe("20")
    await user.click(screen.getByRole("tab", { name: "MUA" }))
    expect((screen.getByLabelText("Chu kỳ SMA · MA / SMA · Mua") as HTMLInputElement).value).toBe("50")

    await user.click(screen.getByRole("button", { name: "Hủy" }))
    expect((screen.getByLabelText("Chu kỳ SMA · MA / SMA · Mua") as HTMLInputElement).value).toBe("20")
    expect(screen.getByTestId("revision-banner").textContent).toContain("Đang dùng cấu hình đã lưu")
  })

  it("shows the lock reason when a research request returns 403 CAPABILITY_LOCKED", async () => {
    const user = userEvent.setup()
    mocks.runBacktestV2.mockRejectedValue(
      new ApiError("Khoá", 403, { code: "CAPABILITY_LOCKED", details: { capability: "sensitivity", reason: "not_learned" } }),
    )
    renderV2()
    const panel = await screen.findByTestId("research-panel")
    await user.click(within(panel).getByText(/Nghiên cứu nâng cao/))
    await user.type(within(panel).getByLabelText("Các giá trị"), "10, 20, 30")
    await user.click(within(panel).getByRole("button", { name: "Chạy kiểm định" }))

    const lock = await within(panel).findByTestId("capability-lock")
    expect(lock.textContent).toContain("Chưa học bài ch02-l14.")
    expect(within(lock).getByRole("link").getAttribute("href")).toBe("/hoc-vien/ch02-l14")
    const body = mocks.runBacktestV2.mock.calls[0]![0]
    expect(body.research).toEqual({ kind: "sensitivity", path: { indicator: "ma", side: "buy", key: "period" }, values: [10, 20, 30] })
    expect(body.shared_revision).toBe(3)
  })

  it("sends the frozen system payload and shows flag-off locks", async () => {
    const user = userEvent.setup()
    mocks.runBacktestV2.mockRejectedValue(
      new ApiError("Khoá", 403, { code: "CAPABILITY_LOCKED", details: { capability: "portfolio", reason: "flag_off" } }),
    )
    renderV2()
    const panel = await screen.findByTestId("system-panel")
    await user.click(within(panel).getByText(/Hệ thống nâng cao/))
    await user.type(within(panel).getByLabelText("Các mã trong danh mục"), "fpt, vnm")
    await user.type(within(panel).getByLabelText("Số vị thế tối đa"), "2")
    await user.click(within(panel).getByRole("button", { name: "Chạy hệ thống" }))

    expect((await within(panel).findByTestId("capability-lock")).textContent).toContain("Tính năng chưa bật trên máy chủ.")
    expect(mocks.runBacktestV2.mock.calls[0]![0].system).toEqual({ symbols: ["FPT", "VNM"], max_positions: 2 })
  })
})

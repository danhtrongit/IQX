import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"

const mocks = vi.hoisted(() => ({
  getSharedConfig: vi.fn(),
  legacyCatalog: vi.fn(),
}))

vi.mock("@/lib/shared-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared-config")>()),
  getSharedConfig: mocks.getSharedConfig,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isPremium: false,
    premiumLoading: false,
  }),
}))

// Legacy lab data hooks: a 403 catalog renders the legacy Premium panel.
vi.mock("../hooks", () => {
  const idle = { mutate: vi.fn(), isPending: false }
  return {
    useBacktestCatalog: () => {
      mocks.legacyCatalog()
      return {
        isLoading: false,
        isError: true,
        data: undefined,
        error: new ApiError("Cấm", 403),
        refetch: vi.fn(),
      }
    },
    useSavedStrategies: () => ({ data: [], isLoading: false }),
    useRunBacktest: () => idle,
    useSaveStrategy: () => idle,
    useDeleteStrategy: () => idle,
    useCreateAlertRule: () => idle,
  }
})

vi.mock("../backtest-v2/backtest-v2", () => ({
  BacktestV2: ({ initialSymbol }: { initialSymbol?: string }) => (
    <div data-testid="backtest-v2">v2 {initialSymbol}</div>
  ),
}))

const { BacktestLab } = await import("./backtest-lab")

function renderLab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BacktestLab initialSymbol="FPT" />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())

describe("BacktestLab bot-v2 switch", () => {
  it("renders the legacy lab unchanged when shared config is 404 FEATURE_DISABLED", async () => {
    mocks.getSharedConfig.mockRejectedValue(
      new ApiError("Không tìm thấy", 404, "FEATURE_DISABLED")
    )
    renderLab()
    expect(await screen.findByText("Cần gói Premium")).toBeTruthy()
    expect(mocks.legacyCatalog).toHaveBeenCalled()
    expect(screen.queryByTestId("backtest-v2")).toBeNull()
  })

  it("renders Backtest v2 when shared config loads", async () => {
    mocks.getSharedConfig.mockResolvedValue({ saved_revision: 0 })
    renderLab()
    expect((await screen.findByTestId("backtest-v2")).textContent).toBe(
      "v2 FPT"
    )
  })

  it("shows the Premium panel (not the legacy lab) when shared config is 403", async () => {
    mocks.getSharedConfig.mockRejectedValue(
      new ApiError("Cần Premium", 403, "PREMIUM_REQUIRED")
    )
    renderLab()
    expect(await screen.findByText("Cần gói Premium")).toBeTruthy()
    expect(mocks.legacyCatalog).not.toHaveBeenCalled()
    expect(screen.queryByTestId("backtest-v2")).toBeNull()
  })

  it("shows a retryable error for other shared-config failures", async () => {
    mocks.getSharedConfig.mockRejectedValue(new ApiError("Lỗi máy chủ", 500))
    renderLab()
    expect(
      await screen.findByText("Không tải được cấu hình chiến lược")
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy()
  })
})

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"

import { FilterTab } from "./filter-tab"
import type { ScreenerMetric, ScreenerRunResult } from "./types"

const mocks = vi.hoisted(() => ({
  getScreenerMetrics: vi.fn(),
  runScreener: vi.fn(),
  listFilters: vi.fn(),
  listLists: vi.fn(),
  createList: vi.fn(),
}))

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return { ...actual, ...mocks }
})

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isPremium: true }),
}))

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const metric = (over: Partial<ScreenerMetric>): ScreenerMetric => ({
  id: "roe",
  name: "ROE",
  lesson_id: "ch03-l06",
  unit: "%",
  api_unit: "ratio",
  period: "TTM",
  applicability: "all",
  operators: [">", "<"],
  learned: true,
  supported: true,
  unsupported_reason: null,
  ...over,
})

const METRICS: ScreenerMetric[] = [
  metric({}),
  metric({ id: "profit_yoy", name: "Tăng trưởng LNST YoY", lesson_id: "ch03-l02", learned: false }),
  metric({
    id: "ccc",
    name: "Chu kỳ tiền mặt",
    unit: "ngày",
    api_unit: "ngày",
    lesson_id: "ch12-l05",
    supported: false,
    unsupported_reason: "Chưa có nguồn số liệu tồn kho đã chuẩn hoá.",
  }),
]

const RESULT: ScreenerRunResult = {
  as_of: "2026-05-04",
  scope: { market: "all", sector: "all", period: "TTM" },
  period: "TTM",
  counts: { universe: 2, passed: 1, missing: 1 },
  results: [
    {
      symbol: "AAA",
      name: "Công ty A",
      sector: "Công nghệ",
      passed: true,
      metrics: { roe: { value: 0.2, status: "valid", unit: "ratio", period: "TTM", available_at: null, source_revision: null } },
    },
    {
      symbol: "BBB",
      name: "Công ty B",
      sector: "Ngân hàng",
      passed: false,
      metrics: { roe: { value: null, status: "missing", unit: "ratio", period: "TTM", available_at: null, source_revision: null } },
    },
  ],
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FilterTab />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.getScreenerMetrics.mockResolvedValue(METRICS)
  mocks.listFilters.mockResolvedValue([])
  mocks.listLists.mockResolvedValue([])
})

describe("FilterTab", () => {
  it("shows the disabled empty state when the backend returns 404 FEATURE_DISABLED", async () => {
    mocks.getScreenerMetrics.mockRejectedValue(new ApiError("Không tìm thấy", 404, "FEATURE_DISABLED"))
    renderTab()
    expect(await screen.findByText("Bộ lọc chưa được bật")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Chạy bộ lọc" })).toBeNull()
    expect(mocks.listFilters).not.toHaveBeenCalled()
  })

  it("keeps unlearned metrics locked with a lesson link and unsupported metrics disabled with the reason", async () => {
    renderTab()
    const locked = await screen.findByTestId("metric-profit_yoy")
    const lockedButton = within(locked).getByRole("button", { name: /Tăng trưởng LNST YoY \(không khả dụng\)/ }) as HTMLButtonElement
    expect(lockedButton.disabled).toBe(true)
    expect(within(locked).getByRole("link").getAttribute("href")).toBe("/hoc-vien/ch03-l02")

    const unsupported = screen.getByTestId("metric-ccc")
    expect((within(unsupported).getByRole("button") as HTMLButtonElement).disabled).toBe(true)
    expect(within(unsupported).getByText("Chưa có nguồn số liệu tồn kho đã chuẩn hoá.")).toBeTruthy()

    const user = userEvent.setup()
    await user.click(lockedButton)
    expect(screen.queryByLabelText("Ngưỡng Tăng trưởng LNST YoY")).toBeNull()
  })

  it("sends % thresholds as ratios and renders missing values as a badge, never 0", async () => {
    mocks.runScreener.mockResolvedValue(RESULT)
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole("button", { name: "Thêm ROE" }))
    await user.type(screen.getByLabelText("Ngưỡng ROE"), "15,5")
    expect(screen.getByText("Tất cả điều kiện (AND)")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))

    expect(mocks.runScreener).toHaveBeenCalledTimes(1)
    const definition = mocks.runScreener.mock.calls[0][0]
    expect(definition).toMatchObject({
      schema_version: "2.0",
      logic: "AND",
      rules: [{ metric_id: "roe", operator: ">", value: 0.155, api_unit: "ratio" }],
      scope: { market: "all", sector: "all", period: "TTM" },
    })

    expect((await screen.findByTestId("filter-counts")).textContent).toContain("1/2 mã đạt")
    expect(screen.getByTestId("cell-AAA-roe").textContent).toBe("20")
    expect(screen.queryByTestId("result-BBB")).toBeNull()

    await user.click(screen.getByLabelText("Chỉ hiện mã đạt"))
    const missing = screen.getByTestId("cell-BBB-roe")
    expect(missing.textContent).toContain("—")
    expect(missing.textContent).toContain("Thiếu dữ liệu")
    expect(missing.textContent).not.toMatch(/\b0\b/)
  })

  it("shows the lock message on 403 CAPABILITY_LOCKED", async () => {
    mocks.runScreener.mockRejectedValue(
      new ApiError("Chỉ tiêu chưa được mở khoá", 403, "CAPABILITY_LOCKED"),
    )
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole("button", { name: "Thêm ROE" }))
    await user.type(screen.getByLabelText("Ngưỡng ROE"), "10")
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chỉ tiêu chưa mở khoá")
    expect(alert.textContent).toContain("Học viện")
  })

  it("blocks running when a threshold is empty instead of sending 0", async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole("button", { name: "Thêm ROE" }))
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    expect(mocks.runScreener).not.toHaveBeenCalled()
    expect((await screen.findByRole("alert")).textContent).toContain("Nhập ngưỡng cho “ROE”")
  })

  it("saves the passed tickers as a static list labelled with as_of", async () => {
    mocks.runScreener.mockResolvedValue(RESULT)
    mocks.createList.mockResolvedValue({
      id: "list-1",
      name: "Danh sách lọc 2026-05-04",
      filter_id: null,
      filter_version: null,
      tickers: ["AAA"],
      as_of: "2026-05-04",
      data_source: "iqx-screener",
      scope: RESULT.scope,
      created_at: null,
    })
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole("button", { name: "Chạy bộ lọc" }))
    await user.click(await screen.findByRole("button", { name: "Lưu danh sách" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog.textContent).toContain("Danh sách tĩnh tại ngày 2026-05-04 — không phải danh mục lịch sử")
    await user.click(within(dialog).getByRole("button", { name: "Lưu danh sách" }))
    expect(mocks.createList).toHaveBeenCalledWith(
      expect.objectContaining({ tickers: ["AAA"], as_of: "2026-05-04", scope: RESULT.scope }),
    )
    expect(mocks.createList.mock.calls[0][0]).not.toHaveProperty("filter_id")
  })
})

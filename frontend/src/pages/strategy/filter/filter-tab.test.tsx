import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import { callsTo, request, savedList, universeState } from "../../demo-trading/bot/test-support"
import { createStrategyApi, createStrategyWorld, FakeApiError, LIST_ID, T0, type StrategyWorld } from "../test-support"
import { FilterTab } from "./filter-tab"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, isPremium: true, premiumLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

let world: StrategyWorld

beforeEach(() => {
  world = createStrategyWorld()
  mocks.api.mockReset()
  mocks.api.mockImplementation(createStrategyApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

const posts = (path: string) => callsTo(world, "POST", path)

async function renderTab() {
  render(<FilterTab />, "/chien-luoc?tab=bo-loc")
  await screen.findByRole("region", { name: "Điều kiện lọc" })
}

const library = () => screen.getByRole("complementary", { name: "Thư viện chỉ tiêu" })

async function addMetric(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(library()).getByRole("button", { name: `Thêm ${name} vào điều kiện lọc` }))
}

/** LNST > 15 on the latest quarter and ROE > 15 on four quarters, as in the approved sample. */
async function addSampleConditions(user: ReturnType<typeof userEvent.setup>) {
  await addMetric(user, "Tăng trưởng LNST YoY")
  await addMetric(user, "ROE")
  for (const input of screen.getAllByLabelText("Ngưỡng")) await user.type(input, "15")
}

async function runFilter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
  return screen.findByRole("region", { name: "Kết quả sàng lọc" })
}

async function runSample(user: ReturnType<typeof userEvent.setup>) {
  await addSampleConditions(user)
  return runFilter(user)
}

describe("metric library", () => {
  it("lists only the learned metrics; usable ones can be added, a learned but not-ready one is unavailable with its reason", async () => {
    await renderTab()
    const items = within(library()).getAllByTestId(/^metric-/)
    expect(items.map((item) => item.getAttribute("data-testid"))).toEqual(["metric-revenue_yoy", "metric-profit_yoy", "metric-eps_yoy", "metric-gross_margin", "metric-net_margin", "metric-roe", "metric-roic"])
    expect(within(library()).queryByText("ROA")).toBeNull()
    expect(within(library()).getByLabelText("5 đã mở")).toBeTruthy()
    const eps = within(library()).getByTestId("metric-eps_yoy")
    expect(eps.textContent).toMatch(/Chưa dùng được: Nguồn dữ liệu hiện tại chưa có EPS/)
    expect(within(eps).getByRole("button").hasAttribute("disabled")).toBe(true)
    expect(within(library()).getByTestId("metric-roic").textContent).toMatch(/Chưa có thuế suất chuẩn hóa/)
    expect(within(library()).getByText("Tăng trưởng LNST YoY")).toBeTruthy()
    expect(document.body.textContent).not.toContain("DT YoY")
  })

  it("names all 42 lessons in the catalog dialog with what each is missing", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(within(library()).getByRole("button", { name: "Danh mục 42 chỉ tiêu" }))
    const dialog = await screen.findByRole("dialog", { name: /Danh mục 8 chỉ tiêu/ })
    expect(within(dialog).getByTestId("catalog-roa").textContent).toContain("Chưa mở · học bài ch06-l01")
    expect(within(dialog).getByTestId("catalog-roic").textContent).toContain("Chờ định nghĩa")
    expect(within(dialog).getByTestId("catalog-eps_yoy").textContent).toContain("Chưa có nguồn dữ liệu")
    expect(within(dialog).getByTestId("catalog-roe").textContent).toContain("Dùng được")
  })

  it("has no Mua/Bán switch anywhere in the filter", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addSampleConditions(user)
    expect(screen.queryAllByRole("switch")).toHaveLength(0)
    expect(screen.queryByRole("button", { name: /^(Mua|Bán)$/ })).toBeNull()
    expect(screen.queryByText(/Điều kiện (Mua|Bán)/)).toBeNull()
  })
})

describe("conditions", () => {
  it("gives every condition its own period from the metric's allowed periods, with the metric's default", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addMetric(user, "Tăng trưởng LNST YoY")
    await addMetric(user, "ROE")
    const lnst = within(screen.getByTestId("rule-profit_yoy")).getByLabelText("Kỳ tính") as HTMLSelectElement
    const roe = within(screen.getByTestId("rule-roe")).getByLabelText("Kỳ tính") as HTMLSelectElement
    expect(lnst.value).toBe("quarter")
    expect([...lnst.options].map((option) => option.textContent)).toEqual(["Quý gần nhất", "Bốn quý gần nhất", "Năm tài chính gần nhất"])
    expect(roe.value).toBe("ttm")
    expect([...roe.options].map((option) => option.textContent)).toEqual(["Bốn quý gần nhất", "Năm tài chính gần nhất"])
    expect(within(screen.getByRole("region", { name: "Phạm vi lọc" })).queryByLabelText(/Kỳ/)).toBeNull()

    await user.selectOptions(lnst, "year")
    expect(lnst.value).toBe("year")
    expect(roe.value).toBe("ttm")
  })

  it("adds a metric only once", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addMetric(user, "ROE")
    const button = within(library()).getByRole("button", { name: "ROE đã có trong điều kiện" })
    expect(button.hasAttribute("disabled")).toBe(true)
    await user.click(button)
    expect(screen.getAllByTestId("rule-roe")).toHaveLength(1)
  })

  it("sends definition 3.0 with a period per rule, ratio thresholds, reference columns and no filter-wide period", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addMetric(user, "Tăng trưởng LNST YoY")
    await addMetric(user, "ROE")
    await user.selectOptions(within(screen.getByTestId("rule-profit_yoy")).getByLabelText("Kỳ tính"), "year")
    const [lnst, roe] = screen.getAllByLabelText("Ngưỡng")
    await user.type(lnst!, "15,5")
    await user.type(roe!, "15")
    await runFilter(user)
    const body = posts("/strategy/screener/run")[0]!.body as { schema_version: string; scope: Record<string, string>; rules: Array<Record<string, unknown>>; columns: Array<Record<string, unknown>>; logic: string }
    expect(body.schema_version).toBe("3.0")
    expect(body.logic).toBe("AND")
    expect(body.scope).toEqual({ market: "all", sector: "all" })
    expect(body.rules).toMatchObject([
      { metric_id: "profit_yoy", period: "year", operator: ">", value: 0.155, api_unit: "ratio" },
      { metric_id: "roe", period: "ttm", operator: ">", value: 0.15, api_unit: "ratio" },
    ])
    expect(body.columns.map((column) => column.metric_id)).toEqual(["revenue_yoy", "gross_margin", "net_margin"])
    expect(body.columns.every((column) => typeof column.period === "string")).toBe(true)
  })

  it("blocks the run and says what is missing instead of guessing a threshold", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addMetric(user, "ROE")
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/Nhập ngưỡng cho “ROE”/)
    expect(posts("/strategy/screener/run")).toHaveLength(0)
  })
})

describe("results", () => {
  it("shows each figure with its real period and header period, and the server status instead of a number", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    expect(within(results).getByTestId("passed-count").textContent).toBe("2 doanh nghiệp")
    expect(within(results).getByTestId("result-counts").textContent).toBe("6 doanh nghiệp trong phạm vi · 2 đạt · 2 không đạt ngưỡng · 2 có điều kiện không tính được")

    const lnstHead = within(results).getByTestId("head-profit_yoy")
    expect(lnstHead.textContent).toContain("Tăng trưởng LNST YoY (%)")
    expect(lnstHead.textContent).toContain("Quý gần nhất")
    expect(within(results).getByTestId("head-roe").textContent).toContain("Bốn quý gần nhất")
    const fpt = within(results).getByTestId("row-FPT")
    expect(fpt.textContent).toContain("28")
    expect(fpt.textContent).toContain("Q3/2025")
    expect(fpt.textContent).toContain("22,5")
    expect(fpt.textContent).toContain("4 quý đến Q3/2025")
    // A bank: the reference gross margin does not apply, yet it passes the conditions.
    const mbb = within(results).getByTestId("row-MBB")
    expect(mbb.textContent).toContain("Không áp dụng")
    expect(within(results).queryByTestId("row-XYZ")).toBeNull()

    await user.click(within(results).getByRole("checkbox", { name: "Hiện cả doanh nghiệp không đạt" }))
    await waitFor(() => expect(within(results).getByTestId("row-XYZ")).toBeTruthy())
    expect(within(results).getByTestId("row-XYZ").textContent).toContain("Chưa đủ dữ liệu")
    expect(within(results).getByTestId("row-XYZ").textContent).toContain("Thiếu dữ liệu")
    expect(within(results).getByTestId("row-NEG").textContent).toContain("Không tính được")
    expect(within(results).getByTestId("row-CMG").textContent).toContain("Không đạt")
    expect(within(results).getByTestId("row-XYZ").textContent).not.toMatch(/\b0\b/)
  })

  it("maps every server cell status to its own wording, never to 0 or to a pass", async () => {
    const { cellView } = await import("./units")
    const base = { metric_id: "roe", period_mode: "ttm", unit: "ratio", actual_period_label: "4 quý đến Q3/2025", comparison_period_label: null, published_at: null, available_at: null, source_revision: null, components: [] } as const
    const view = (status: string, extra: Record<string, unknown> = {}) => cellView({ ...base, status, value: status === "ok" ? 0.2 : null, ...extra } as never, "ratio")
    expect(view("ok").text).toBe("20")
    expect(view("ok", { value: 0, lower_bound: true }).text).toBe("≥ 0")
    expect(view("missing")).toMatchObject({ text: "—", caption: "Chưa đủ dữ liệu", ok: false })
    expect(view("not_applicable")).toMatchObject({ text: "—", caption: "Không áp dụng", ok: false })
    expect(view("insufficient_base")).toMatchObject({ text: "—", caption: "Không tính được", ok: false })
    expect(view("definition_pending")).toMatchObject({ text: "—", caption: "Chờ định nghĩa", ok: false })
    expect(view("data_unavailable")).toMatchObject({ text: "—", caption: "Chưa có nguồn dữ liệu", ok: false })
    // The retired client statuses are not a thing any more.
    expect(view("valid").ok).toBe(false)
    expect(view("undefined_denominator").text).toBe("—")
  })

  it("opens the evidence of one figure: actual period, comparison period, published and received dates, cutoff, source and components", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: /FPT · Tăng trưởng LNST YoY: 28/ }))
    const dialog = await screen.findByRole("dialog", { name: "FPT · Tăng trưởng LNST YoY" })
    expect(dialog.textContent).toContain("Quý gần nhất")
    expect(dialog.textContent).toMatch(/Kỳ đang tính.*Q3\/2025/)
    expect(dialog.textContent).toMatch(/Kỳ so sánh.*Q3\/2024/)
    expect(dialog.textContent).toMatch(/20\/10\/2025/)
    expect(dialog.textContent).toMatch(/21\/10\/2025/)
    expect(dialog.textContent).toMatch(/Mốc dữ liệu của kết quả \(cutoff\)/)
    expect(dialog.textContent).toContain("vci-2025-10-20")
    expect(dialog.textContent).toMatch(/Nguồn không cung cấp/)
    expect(within(dialog).getByRole("table", { name: "Các kỳ báo cáo đã sử dụng" })).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/đã kiểm toán/i)
  })

  it("explains a missing or not applicable figure instead of a number", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: /MBB · Biên lợi nhuận gộp: Không áp dụng/ }))
    const dialog = await screen.findByRole("dialog", { name: "MBB · Biên lợi nhuận gộp" })
    expect(dialog.textContent).toMatch(/Không áp dụng cho ngân hàng, bảo hiểm, chứng khoán/)
    expect(within(dialog).getByRole("status").textContent).toContain("Không áp dụng")
  })

  it("lists why companies are missing: per condition and per cause, apart from 'did not pass'", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Xem chi tiết" }))
    const dialog = await screen.findByRole("dialog", { name: "Dữ liệu của các điều kiện lọc" })
    expect(dialog.textContent).toMatch(/2 trên 6 doanh nghiệp có điều kiện bắt buộc thiếu dữ liệu/)
    expect(within(dialog).getByRole("table", { name: "Thống kê dữ liệu theo chỉ tiêu" }).textContent).toContain("Điều kiện")
    expect(dialog.textContent).toMatch(/Một số liệu thiếu ở cột tham khảo không loại doanh nghiệp/)
  })

  it("pages through the stored result (same figures on every page) and keeps nothing but the current page in the table", async () => {
    const user = userEvent.setup()
    world.extraCompanies = 70
    await renderTab()
    const results = await runSample(user)
    expect(within(results).getByTestId("passed-count").textContent).toBe("72 doanh nghiệp")
    expect(within(results).getAllByTestId(/^row-/)).toHaveLength(50)
    expect(within(results).getByText(/Hiển thị từ 1 đến 50 trên 72 doanh nghiệp/)).toBeTruthy()
    await user.click(within(results).getByRole("button", { name: "Trang sau" }))
    await waitFor(() => expect(within(results).getAllByTestId(/^row-/)).toHaveLength(22))
    expect(within(results).getByText(/Hiển thị từ 51 đến 72 trên 72 doanh nghiệp/)).toBeTruthy()
    const pageCalls = world.calls.filter((call) => call.method === "GET" && call.path.startsWith("/strategy/screener/results/"))
    expect(pageCalls.length).toBeGreaterThanOrEqual(1)
    expect(posts("/strategy/screener/run")).toHaveLength(1)
  })

  it("flags results that no longer match the conditions on screen and never keeps an older answer over a newer run", async () => {
    const user = userEvent.setup()
    world.runDelay = (index) => (index === 0 ? 150 : 0)
    await renderTab()
    await addSampleConditions(user)
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    await user.selectOptions(within(screen.getByTestId("rule-profit_yoy")).getByLabelText("Kỳ tính"), "ttm")
    await user.click(screen.getByRole("button", { name: /Chạy bộ lọc|Đang lọc/ }))
    const results = await screen.findByRole("region", { name: "Kết quả sàng lọc" })
    await waitFor(() => expect(within(results).getByTestId("head-profit_yoy").textContent).toContain("Bốn quý gần nhất"))
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(within(results).getByTestId("head-profit_yoy").textContent).toContain("Bốn quý gần nhất")
    expect(within(results).queryByText("Điều kiện đã đổi · cần lọc lại")).toBeNull()
    await user.selectOptions(within(screen.getByTestId("rule-profit_yoy")).getByLabelText("Kỳ tính"), "year")
    expect(within(results).getByText("Điều kiện đã đổi · cần lọc lại")).toBeTruthy()
  })
})

describe("three different saves", () => {
  it("Lưu bộ lọc saves only the criteria (3.0, a period per rule), not a list, a result or anything of the Bot", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addSampleConditions(user)
    await user.click(screen.getByRole("button", { name: "Lưu bộ lọc" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu bộ lọc" })
    await user.type(within(dialog).getByLabelText("Tên bộ lọc"), "Tăng trưởng và ROE")
    expect(dialog.textContent).toMatch(/Tăng trưởng LNST YoY \(Quý gần nhất\) > 15 %/)
    await user.click(within(dialog).getByRole("button", { name: "Lưu bộ lọc" }))
    await waitFor(() => expect(posts("/strategy/filters")).toHaveLength(1))
    const body = posts("/strategy/filters")[0]!.body as { name: string; definition: { schema_version: string; rules: Array<{ period: string }> } }
    expect(body.name).toBe("Tăng trưởng và ROE")
    expect(body.definition.schema_version).toBe("3.0")
    expect(body.definition.rules.map((rule) => rule.period)).toEqual(["quarter", "ttm"])
    expect(posts("/strategy/lists/from-result")).toHaveLength(0)
    expect(posts("/strategy/result-snapshots")).toHaveLength(0)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    expect(String(mocks.toast.success.mock.calls[0]![0])).toMatch(/Bot không đổi/)
  })

  it("Lưu danh mục makes a visible list from the stored result; with nothing selected it covers every passed company", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    expect(within(results).getByTestId("selection-line").textContent).toMatch(/Chưa chọn riêng: Lưu và áp dụng dùng toàn bộ 2 mã đạt, kể cả các trang khác/)
    await user.click(within(results).getByRole("button", { name: "Lưu danh mục" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu danh mục" })
    expect(within(dialog).getByTestId("save-count").textContent).toBe("Lưu 2 mã")
    expect(dialog.textContent).toMatch(/không mua cổ phiếu và không đổi Bot/)
    await user.click(within(dialog).getByRole("button", { name: "Lưu danh mục" }))
    await waitFor(() => expect(posts("/strategy/lists/from-result")).toHaveLength(1))
    const body = posts("/strategy/lists/from-result")[0]!.body as Record<string, unknown>
    expect(body).toMatchObject({ run_id: "dddddddd-dddd-4ddd-8ddd-000000000001", selection: { mode: "all" }, visibility: "saved" })
    expect(posts("/strategy/result-snapshots")).toHaveLength(0)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
    expect(world.lists.at(-1)!.visibility).toBe("saved")
    expect(world.universe.pending).toBeNull()
  })

  it("Lưu kết quả freezes the chosen rows only (a subset) as a result snapshot", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("checkbox", { name: "Chọn FPT" }))
    expect(within(results).getByTestId("selection-line").textContent).toMatch(/Đã chọn 1 mã/)
    await user.click(within(results).getByRole("button", { name: "Lưu kết quả" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu kết quả" })
    expect(within(dialog).getByTestId("save-count").textContent).toBe("Lưu 1 mã")
    await user.click(within(dialog).getByRole("button", { name: "Lưu kết quả" }))
    await waitFor(() => expect(posts("/strategy/result-snapshots")).toHaveLength(1))
    expect(posts("/strategy/result-snapshots")[0]!.body).toMatchObject({ selection: { mode: "subset", symbols: ["FPT"] }, visibility: "saved" })
    expect(posts("/strategy/lists/from-result")).toHaveLength(0)
    expect(posts("/strategy/filters")).toHaveLength(0)
    expect(world.snapshots[0]!.row_count).toBe(1)
  })

  it("keeps the draft and says so when a save fails, without a success toast", async () => {
    const user = userEvent.setup()
    world.override["POST /strategy/lists/from-result"] = () => {
      throw new FakeApiError("Không lưu được danh mục.", 503)
    }
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Lưu danh mục" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu danh mục" })
    await user.click(within(dialog).getByRole("button", { name: "Lưu danh mục" }))
    expect(await within(dialog).findByText("Không lưu được danh mục.")).toBeTruthy()
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("opens a saved result and a saved list as they were saved, with the figures of that moment", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Lưu kết quả" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu kết quả" })).getByRole("button", { name: "Lưu kết quả" }))
    await waitFor(() => expect(world.snapshots).toHaveLength(1))
    await user.click(screen.getByRole("button", { name: "Kết quả đã lưu" }))
    const list = await screen.findByRole("dialog", { name: "Kết quả đã lưu" })
    await user.click(await within(list).findByRole("button", { name: /Xem/ }))
    const detail = await screen.findByRole("dialog", { name: /Kết quả lọc/ })
    expect(await within(detail).findByRole("table", { name: "Số liệu đã lưu" })).toBeTruthy()
    expect(detail.textContent).toMatch(/Không được tính lại bằng dữ liệu mới/)
    expect(detail.textContent).toContain("Q3/2025")
  })
})

describe("saved filters", () => {
  it("loads criteria and the period of each condition into the editor without running anything or touching the Bot", async () => {
    const user = userEvent.setup()
    world.filters = [
      {
        id: "f0000000-0000-4000-8000-000000000001", name: "Chất lượng", current_version: 2, version: 2, stored_schema_version: "3.0", legacy_review: null, definition_hash: "h", created_at: T0, updated_at: T0,
        definition: { schema_version: "3.0", name: "Chất lượng", logic: "AND", data_mode: "latest_disclosed", scope: { market: "HOSE", sector: "all" }, rules: [{ id: "x1", metric_id: "roe", period: "year", operator: ">", value: 0.2, api_unit: "ratio" }] },
      },
    ]
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Bộ lọc đã lưu" }))
    const dialog = await screen.findByRole("dialog", { name: "Bộ lọc đã lưu" })
    expect(await within(dialog).findByText(/ROE \(Năm tài chính gần nhất\) > 20 %/)).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: /Dùng Chất lượng/ }))
    const rule = await screen.findByTestId("rule-roe")
    expect((within(rule).getByLabelText("Kỳ tính") as HTMLSelectElement).value).toBe("year")
    expect((within(rule).getByLabelText("Ngưỡng") as HTMLInputElement).value).toBe("20")
    expect((screen.getByLabelText("Thị trường") as HTMLSelectElement).value).toBe("HOSE")
    expect(posts("/strategy/screener/run")).toHaveLength(0)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
  })

  it("does not turn a period the metric no longer supports into another one: the user must choose again", async () => {
    const user = userEvent.setup()
    world.filters = [
      {
        id: "f0000000-0000-4000-8000-000000000002", name: "ROE quý cũ", current_version: 1, version: 1, stored_schema_version: "2.0", definition_hash: "h", created_at: T0, updated_at: T0,
        legacy_review: { stored_schema_version: "2.0", legacy_period: "quarter", needs_review: true, rules: [{ rule_id: "x1", metric_id: "roe", legacy_period: "quarter", mapped_period: "quarter", status: "needs_review", reason: "Kỳ quarter của bộ lọc cũ không còn được hỗ trợ cho roe; cần chọn lại kỳ." }] },
        definition: { schema_version: "3.0", name: "ROE quý cũ", logic: "AND", data_mode: "latest_disclosed", scope: { market: "all", sector: "all" }, rules: [{ id: "x1", metric_id: "roe", period: "quarter", operator: ">", value: 0.15, api_unit: "ratio" }] },
      },
    ]
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Bộ lọc đã lưu" }))
    const dialog = await screen.findByRole("dialog", { name: "Bộ lọc đã lưu" })
    expect(await within(dialog).findByText(/Hệ thống không tự đổi kỳ/)).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: /Dùng ROE quý cũ/ }))
    const rule = await screen.findByTestId("rule-roe")
    expect((within(rule).getByLabelText("Kỳ tính") as HTMLSelectElement).value).toBe("")
    expect(rule.textContent).toMatch(/cần chọn lại kỳ/)
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    await waitFor(() => expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toMatch(/Chọn kỳ tính cho “ROE”/))
    expect(posts("/strategy/screener/run")).toHaveLength(0)
    await user.selectOptions(within(rule).getByLabelText("Kỳ tính"), "ttm")
    await runFilter(user)
    expect((posts("/strategy/screener/run")[0]!.body as { rules: Array<{ period: string }> }).rules[0]!.period).toBe("ttm")
  })
})

describe("áp dụng cho Bot", () => {
  it("confirms first, then records an internal list from the stored result and applies THAT list with the chosen symbols", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    expect(await within(dialog).findByTestId("apply-count")).toBeTruthy()
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("2 / 2 mã"))
    expect(dialog.textContent).toMatch(/Có hiệu lực từ phiên giao dịch tiếp theo/)
    expect(dialog.textContent).toMatch(/Không bán cổ phiếu Bot đang giữ/)
    expect(dialog.textContent).toMatch(/VN30 là nguồn mặc định/)
    // Nothing is sent before the confirmation.
    expect(posts("/strategy/lists/from-result")).toHaveLength(0)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)

    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(1))
    const fromResult = posts("/strategy/lists/from-result")
    expect(fromResult).toHaveLength(1)
    expect(fromResult[0]!.body).toMatchObject({ run_id: "dddddddd-dddd-4ddd-8ddd-000000000001", selection: { mode: "all" }, visibility: "internal" })
    const internalList = world.lists.at(-1)!
    expect(internalList.visibility).toBe("internal")
    const apply = posts("/bot/universe/apply-list")[0]!.body as { list_id: string; symbols: string[]; expected_revision: number; idempotency_key: string }
    expect(apply.list_id).toBe(internalList.id)
    expect(apply.symbols).toEqual(["FPT", "MBB"])
    expect(apply.expected_revision).toBe(0)
    expect(apply.idempotency_key.length).toBeGreaterThanOrEqual(8)
    expect(world.calls.indexOf(fromResult[0]!)).toBeLessThan(world.calls.indexOf(posts("/bot/universe/apply-list")[0]!))

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    expect(String(mocks.toast.success.mock.calls[0]![0])).toMatch(/chờ hiệu lực/)
    expect(String(mocks.toast.success.mock.calls[0]![0])).toMatch(/không bị bán/)
    // The new source is pending; the one in use is still VN30. The internal list is not a saved list.
    const source = await screen.findByRole("region", { name: "Danh mục mua mới của Bot" })
    await waitFor(() => expect(source.textContent).toMatch(/Chờ hiệu lực:.*2 mã/))
    expect(within(source).getByRole("heading").textContent).toContain("VN30")
    expect(world.lists.filter((list) => list.visibility === "saved")).toHaveLength(0)
  })

  it("applies only the symbols kept in the confirmation, and records a list of exactly those", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("2 / 2 mã"))
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn MBB" }))
    expect(within(dialog).getByTestId("apply-count").textContent).toBe("1 / 2 mã")
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(1))
    expect(posts("/strategy/lists/from-result")[0]!.body).toMatchObject({ selection: { mode: "subset", symbols: ["FPT"] }, visibility: "internal" })
    expect((posts("/bot/universe/apply-list")[0]!.body as { symbols: string[] }).symbols).toEqual(["FPT"])
  })

  it("starts from the symbols ticked in the table and cannot be confirmed with none", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("checkbox", { name: "Chọn MBB" }))
    await user.click(within(results).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("1 / 2 mã"))
    await user.click(within(dialog).getByRole("button", { name: "Chọn tất cả" }))
    await user.click(within(dialog).getByRole("button", { name: "Bỏ chọn tất cả" }))
    expect(within(dialog).getByTestId("apply-count").textContent).toBe("Chọn ít nhất một mã để áp dụng.")
    expect(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }).hasAttribute("disabled")).toBe(true)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
  })

  it("reuses the list the user already saved for the same result instead of creating another one", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Lưu danh mục" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Lưu danh mục" })).getByRole("button", { name: "Lưu danh mục" }))
    await waitFor(() => expect(posts("/strategy/lists/from-result")).toHaveLength(1))
    const saved = world.lists.at(-1)!
    await user.click(within(results).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("2 / 2 mã"))
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(1))
    expect(posts("/strategy/lists/from-result")).toHaveLength(1)
    expect((posts("/bot/universe/apply-list")[0]!.body as { list_id: string }).list_id).toBe(saved.id)
  })

  it("sends nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    expect(screen.queryByRole("dialog", { name: "Áp dụng danh mục cho Bot" })).toBeNull()
    expect(posts("/strategy/lists/from-result")).toHaveLength(0)
    expect(posts("/bot/universe/apply-list")).toHaveLength(0)
    expect(world.universe.pending).toBeNull()
  })

  it("lists the symbols the server refuses and changes nothing; a revision conflict keeps the draft", async () => {
    const user = userEvent.setup()
    world.invalidSymbols = [{ symbol: "MBB", reason: "not_tradable" }]
    await renderTab()
    const results = await runSample(user)
    await user.click(within(results).getByRole("button", { name: "Áp dụng cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await waitFor(() => expect(within(dialog).getByTestId("apply-count").textContent).toBe("2 / 2 mã"))
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    expect(await within(dialog).findByText("Một số mã không hợp lệ cho nguồn mua của Bot")).toBeTruthy()
    expect(within(dialog).getByText(/Bot chỉ mua cổ phiếu đang niêm yết trên HOSE/)).toBeTruthy()
    expect(world.universe.pending).toBeNull()
    expect(mocks.toast.success).not.toHaveBeenCalled()
    world.invalidSymbols = null
    world.universe = { ...world.universe, revision: 5 }
    await user.click(within(dialog).getByRole("button", { name: "Bỏ chọn các mã không hợp lệ" }))
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list").length).toBeGreaterThanOrEqual(1))
    expect(await within(dialog).findByText(/đã được thay đổi ở nơi khác/)).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "Áp dụng danh mục cho Bot" })).toBeTruthy()
  })

  it("applies a saved list whole or in part, from Danh mục đã lưu", async () => {
    const user = userEvent.setup()
    world.lists = [savedList(LIST_ID, "Cổ phiếu tăng trưởng", ["FPT", "HPG", "CMG"])]
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Danh mục đã lưu" }))
    const lists = await screen.findByRole("dialog", { name: "Danh mục đã lưu" })
    await user.click(await within(lists).findByRole("button", { name: /Áp dụng cho Bot Cổ phiếu tăng trưởng/ }))
    const dialog = await screen.findByRole("dialog", { name: "Áp dụng danh mục cho Bot" })
    await user.click(within(dialog).getByRole("checkbox", { name: "Chọn CMG" }))
    await user.click(within(dialog).getByRole("button", { name: "Áp dụng cho Bot" }))
    await waitFor(() => expect(posts("/bot/universe/apply-list")).toHaveLength(1))
    expect(posts("/bot/universe/apply-list")[0]!.body).toMatchObject({ list_id: LIST_ID, symbols: ["FPT", "HPG"], expected_revision: 0 })
    expect(posts("/strategy/lists/from-result")).toHaveLength(0)
  })
})

describe("Bot source block", () => {
  it("shows the source in use apart from the pending one and never calls a pending source 'in use'", async () => {
    world.universe = universeState({ revision: 2, pending: request({ kind: "custom", name: "Danh mục chờ", revision: 2, symbol_count: 4 }) })
    await renderTab()
    const source = await screen.findByRole("region", { name: "Danh mục mua mới của Bot" })
    await within(source).findByRole("heading", { name: /VN30/ })
    expect(within(source).getByRole("heading").textContent).toContain("30 mã")
    expect(source.textContent).toMatch(/Chờ hiệu lực: Danh mục chờ · 4 mã · từ phiên 09\/10\/2026/)
    expect(within(source).getByRole("link", { name: "Xem Bot" }).getAttribute("href")).toBe("/demo-trading?view=bot")
  })

  it("goes back to VN30 only after a confirmation that says nothing is sold", async () => {
    const user = userEvent.setup()
    world.universe = universeState({
      revision: 1,
      effective: { ...universeState().effective, kind: "custom", name: "Ngân hàng", revision: 1, status: "effective", symbol_count: 2, effective_session: "2026-10-02", saved_list_id: LIST_ID, symbols: [{ symbol: "VCB", name: null, exchange: "HOSE" }, { symbol: "BID", name: null, exchange: "HOSE" }] },
    })
    await renderTab()
    const source = await screen.findByRole("region", { name: "Danh mục mua mới của Bot" })
    await user.click(await within(source).findByRole("button", { name: "Về VN30" }))
    const dialog = await screen.findByRole("dialog", { name: "Quay về VN30" })
    expect(dialog.textContent).toMatch(/không bị bán do thay danh mục/)
    expect(posts("/bot/universe/revert-vn30")).toHaveLength(0)
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }))
    await waitFor(() => expect(posts("/bot/universe/revert-vn30")).toHaveLength(1))
    expect(posts("/bot/universe/revert-vn30")[0]!.body).toMatchObject({ expected_revision: 1 })
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
  })

  it("cancels only the pending change, after a confirmation", async () => {
    const user = userEvent.setup()
    world.universe = universeState({ revision: 2, pending: request({ kind: "custom", name: "Danh mục chờ", revision: 2, symbol_count: 4 }) })
    await renderTab()
    const source = await screen.findByRole("region", { name: "Danh mục mua mới của Bot" })
    await user.click(await within(source).findByRole("button", { name: "Hủy thay đổi" }))
    const dialog = await screen.findByRole("dialog", { name: "Hủy thay đổi chờ hiệu lực?" })
    expect(callsTo(world, "POST", "/bot/universe/pending/cancel")).toHaveLength(0)
    await user.click(within(dialog).getByRole("button", { name: "Hủy thay đổi" }))
    await waitFor(() => expect(callsTo(world, "POST", "/bot/universe/pending/cancel")).toHaveLength(1))
    expect(callsTo(world, "POST", "/bot/universe/pending/cancel")[0]!.body).toEqual({ expected_revision: 2 })
  })
})

describe("deleting a list", () => {
  it("explains the 409 LIST_IN_USE_BY_BOT instead of deleting, and offers VN30 or cancelling the pending change", async () => {
    const user = userEvent.setup()
    world.lists = [savedList(LIST_ID, "Cổ phiếu tăng trưởng", ["FPT", "HPG"])]
    world.universe = universeState({ revision: 3, pending: request({ kind: "custom", name: "Cổ phiếu tăng trưởng", revision: 3, symbol_count: 2, saved_list_id: LIST_ID }) })
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Danh mục đã lưu" }))
    const lists = await screen.findByRole("dialog", { name: "Danh mục đã lưu" })
    expect(await within(lists).findByText("Chờ hiệu lực")).toBeTruthy()
    await user.click(within(lists).getByRole("button", { name: "Xóa danh mục Cổ phiếu tăng trưởng" }))
    const confirm = await screen.findByRole("dialog", { name: "Xóa danh mục?" })
    await user.click(within(confirm).getByRole("button", { name: "Xóa danh mục" }))
    const explain = await screen.findByRole("dialog", { name: "Danh mục đang được Bot sử dụng" })
    expect(explain.textContent).toMatch(/đang chờ hiệu lực làm nguồn mua mới của Bot, nên chưa thể xóa/)
    expect(explain.textContent).toMatch(/chuyển Bot sang danh mục khác hoặc về VN30/)
    expect(explain.textContent).toMatch(/Bot không tự bán và không tự đổi nguồn/)
    expect(within(explain).getByRole("button", { name: "Hủy thay đổi chờ" })).toBeTruthy()
    expect(world.lists).toHaveLength(1)
    expect(callsTo(world, "DELETE", `/strategy/lists/${LIST_ID}`)).toHaveLength(1)
  })

  it("lets the user go back to VN30 from that explanation (with its own confirmation)", async () => {
    const user = userEvent.setup()
    world.lists = [savedList(LIST_ID, "Cổ phiếu tăng trưởng", ["FPT", "HPG"])]
    world.universe = universeState({
      revision: 1,
      effective: { ...universeState().effective, kind: "custom", name: "Cổ phiếu tăng trưởng", revision: 1, status: "effective", symbol_count: 2, effective_session: "2026-10-02", saved_list_id: LIST_ID, symbols: [{ symbol: "FPT", name: null, exchange: "HOSE" }] },
    })
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Danh mục đã lưu" }))
    const lists = await screen.findByRole("dialog", { name: "Danh mục đã lưu" })
    expect(await within(lists).findByText("Bot đang dùng")).toBeTruthy()
    await user.click(within(lists).getByRole("button", { name: "Xóa danh mục Cổ phiếu tăng trưởng" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Xóa danh mục?" })).getByRole("button", { name: "Xóa danh mục" }))
    const explain = await screen.findByRole("dialog", { name: "Danh mục đang được Bot sử dụng" })
    await user.click(within(explain).getByRole("button", { name: "Về VN30" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Quay về VN30" })).getByRole("button", { name: "Xác nhận" }))
    await waitFor(() => expect(posts("/bot/universe/revert-vn30")).toHaveLength(1))
    expect(world.lists).toHaveLength(1)
  })

  it("deletes a list the Bot does not use", async () => {
    const user = userEvent.setup()
    world.lists = [savedList(LIST_ID, "Cổ phiếu tăng trưởng", ["FPT"])]
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Danh mục đã lưu" }))
    const lists = await screen.findByRole("dialog", { name: "Danh mục đã lưu" })
    await user.click(await within(lists).findByRole("button", { name: "Xóa danh mục Cổ phiếu tăng trưởng" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Xóa danh mục?" })).getByRole("button", { name: "Xóa danh mục" }))
    await waitFor(() => expect(world.lists).toHaveLength(0))
    expect(await within(lists).findByText(/Chưa có danh mục đã lưu/)).toBeTruthy()
  })
})

describe("availability", () => {
  it("explains a feature that is switched off", async () => {
    world.override["GET /strategy/screener/metrics"] = () => {
      throw new FakeApiError("Tính năng chiến lược v2 chưa được bật.", 404, { code: "FEATURE_DISABLED" })
    }
    render(<FilterTab />, "/chien-luoc?tab=bo-loc")
    expect(await screen.findByText("Tính năng chưa được bật")).toBeTruthy()
  })

  it("turns a locked metric into words when the server refuses the run", async () => {
    const user = userEvent.setup()
    world.override["POST /strategy/screener/run"] = () => {
      throw new FakeApiError("Bạn cần hoàn thành bài học.", 403, { code: "CAPABILITY_LOCKED" })
    }
    await renderTab()
    await addSampleConditions(user)
    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/chỉ tiêu chưa mở/)
  })
})

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import { callsTo, registryFor } from "../../demo-trading/bot/test-support"
import { createStrategyApi, createStrategyWorld, FakeApiError, runSummary, type StrategyWorld } from "../test-support"
import { BacktestTab } from "./backtest-tab"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, isPremium: true, premiumLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

const ALL_16 = ["rsi", "macd", "ma", "bollinger", "volume", "ema", "ma_cross", "dmi", "stochastic", "cci", "obv", "mfi", "cmf", "donchian", "roc", "williams_r"]
let world: StrategyWorld

function useIndicators(ids: string[]) {
  for (const id of ids) {
    const config = world.indicators[id]
    if (config) {
      config.master_enabled = true
      config.buy.enabled = true
      config.sell.enabled = true
    }
  }
}

beforeEach(() => {
  world = createStrategyWorld()
  useIndicators(["macd", "ma"])
  mocks.api.mockReset()
  mocks.api.mockImplementation(createStrategyApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

const posts = (path: string) => callsTo(world, "POST", path)
const patches = () => callsTo(world, "PATCH", "/strategy/shared-config")

async function renderTab() {
  render(<BacktestTab initialSymbol="fpt" />, "/chien-luoc?tab=backtest&symbol=FPT")
  await screen.findByRole("heading", { name: "Điều kiện Mua" })
}

async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Chạy backtest" }))
  return screen.findByTestId("backtest-results")
}

describe("library", () => {
  it("lists only the granted indicators of the catalog (here 5) and counts them", async () => {
    await renderTab()
    const library = screen.getByRole("complementary", { name: "Thư viện chỉ báo" })
    expect(within(library).getAllByTestId(/^library-/)).toHaveLength(5)
    for (const name of ["RSI", "MACD", "MA / SMA", "Bollinger Bands", "Khối lượng"]) expect(within(library).getByText(name)).toBeTruthy()
    expect(within(library).queryByText("EMA")).toBeNull()
    expect(within(library).getByLabelText("5 đã mở")).toBeTruthy()
  })

  it("shows exactly the 16 indicators once all 16 are granted, grouped by chapter 1, 5, 7 and 10", async () => {
    world.granted = ALL_16
    await renderTab()
    const library = screen.getByRole("complementary", { name: "Thư viện chỉ báo" })
    expect(within(library).getAllByTestId(/^library-/)).toHaveLength(16)
    expect(within(library).getByLabelText("16 đã mở")).toBeTruthy()
    for (const chapter of [1, 5, 7, 10]) expect(within(library).getByRole("region", { name: `Chương ${chapter}` })).toBeTruthy()
  })

  it("never lists ADX, ATR or any id outside the 16, even when the server sends one as granted", async () => {
    world.granted = [...ALL_16, "adx", "atr"]
    const registry = registryFor(world.granted)
    const extras = ["adx", "atr"].map((id) => ({ ...registry.indicators[0]!, id, name: id.toUpperCase(), learned: true }))
    world.override["GET /strategy/registry/technical"] = () => ({ ...registry, indicators: [...registry.indicators, ...extras] })
    await renderTab()
    const library = screen.getByRole("complementary", { name: "Thư viện chỉ báo" })
    expect(within(library).getAllByTestId(/^library-/)).toHaveLength(16)
    expect(screen.queryByText("ADX")).toBeNull()
    expect(screen.queryByText("ATR")).toBeNull()
  })

  it("has no copy about the old Bot rules, the legacy lab or Academy-side configuration", async () => {
    await renderTab()
    const text = document.body.textContent ?? ""
    for (const banned of ["Học viện chỉnh", "stop L1", "Săn mã là nguồn", "Mô phỏng Bot", "ATR", "ADX", "Từ Bot", "Từ Học viện"]) expect(text).not.toContain(banned)
  })

  it("is a graceful state, not a legacy fallback, when the strategy routes are switched off", async () => {
    world.override["GET /strategy/shared-config"] = () => {
      throw new FakeApiError("Tính năng chiến lược v2 chưa được bật.", 404, { code: "FEATURE_DISABLED" })
    }
    render(<BacktestTab />, "/chien-luoc?tab=backtest")
    expect(await screen.findByText("Tính năng chưa được bật")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Chạy backtest" })).toBeNull()
  })
})

describe("run", () => {
  it("runs the saved revision once with the next-open profile and shows exactly six KPIs, the chart title and its legend", async () => {
    const user = userEvent.setup()
    await renderTab()
    expect(screen.getByTestId("run-hint").textContent).toMatch(/cấu hình chung đã lưu bản 3/)
    const results = await run(user)

    const body = posts("/strategy/backtests")[0]!.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["assumptions", "end", "idempotency_key", "shared_revision", "start", "symbol"])
    expect(body).toMatchObject({ shared_revision: 3, symbol: "FPT", assumptions: { capital: 100_000_000, fee_preset: "standard", execution: "next_open" } })

    const tiles = within(results).getAllByTestId("kpi")
    expect(tiles).toHaveLength(6)
    expect(tiles.map((tile) => tile.querySelector("div")?.textContent)).toEqual([
      "Tổng lợi nhuận",
      "Lợi nhuận năm hóa",
      "Sụt giảm lớn nhất",
      "Số giao dịch",
      "Tỷ lệ thắng",
      "Lợi nhuận mua và giữ",
    ])
    expect(tiles[0]!.textContent).toContain("+74,2%")
    expect(tiles[2]!.textContent).toContain("−10,6%")
    expect(tiles[3]!.textContent).toContain("3")
    expect(tiles[4]!.textContent).toContain("66,7%")
    expect(within(results).getByRole("heading", { name: "Lợi nhuận danh mục (%)" })).toBeTruthy()
    const legend = within(results).getByRole("list", { name: "Chú giải biểu đồ" })
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Danh mục chiến lược", "Mua và giữ FPT", "VN-Index"])
    expect(screen.queryByTestId("stale-badge")).toBeNull()
  })

  it("offers the two execution profiles with their caveat and sends the chosen one", async () => {
    const user = userEvent.setup()
    await renderTab()
    const select = screen.getByLabelText("Khớp lệnh") as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual(["Đóng cửa cùng phiên", "Mở cửa phiên kế tiếp"])
    expect(screen.getByTestId("execution-caveat").textContent).toMatch(/giá mở cửa của phiên giao dịch kế tiếp/)
    await user.selectOptions(select, "same_close")
    expect(screen.getByTestId("execution-caveat").textContent).toMatch(/Thực tế không thể biết đủ giá đóng cửa/)
    await run(user)
    expect((posts("/strategy/backtests")[0]!.body as { assumptions: { execution: string } }).assumptions.execution).toBe("same_close")
    const assumptions = screen.getByTestId("assumptions")
    expect(assumptions.textContent).toMatch(/Đóng cửa cùng phiên/)
    expect(assumptions.textContent).toMatch(/không có stop, chốt lời, trailing hay giới hạn thời gian giữ/i)
  })

  it("sends no run until a Buy condition is in use, and explains why", async () => {
    for (const config of Object.values(world.indicators)) config.master_enabled = false
    await renderTab()
    expect(screen.getByRole("button", { name: "Chạy backtest" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByTestId("run-hint").textContent).toMatch(/Chưa có điều kiện Mua đang dùng/)
    expect(posts("/strategy/backtests")).toHaveLength(0)
  })

  it("does not send a second request while one is pending, and never re-runs by itself", async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    const base = createStrategyApi(world)
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST" && path.startsWith("/strategy/backtests")) await new Promise<void>((resolve) => { release = resolve })
      return base(path, init)
    })
    await renderTab()
    const button = screen.getByRole("button", { name: "Chạy backtest" })
    await user.click(button)
    await user.click(screen.getByRole("button", { name: "Đang chạy…" }))
    release()
    await screen.findByTestId("backtest-results")
    expect(posts("/strategy/backtests")).toHaveLength(1)
    await user.selectOptions(screen.getByLabelText("Khớp lệnh"), "same_close")
    await user.click(screen.getByLabelText("Phí giao dịch"))
    expect(posts("/strategy/backtests")).toHaveLength(1)
  })

  it("keeps the result and flags it as needing a re-run once the assumptions on the form differ", async () => {
    const user = userEvent.setup()
    await renderTab()
    await run(user)
    expect(screen.queryByTestId("stale-badge")).toBeNull()
    await user.selectOptions(screen.getByLabelText("Khớp lệnh"), "same_close")
    expect(screen.getByTestId("stale-badge").textContent).toBe("Cấu hình đã đổi · cần chạy lại")
    expect(screen.getAllByTestId("kpi")).toHaveLength(6)
    await user.selectOptions(screen.getByLabelText("Khớp lệnh"), "next_open")
    expect(screen.queryByTestId("stale-badge")).toBeNull()
  })

  it("shows an error from the server and keeps the previous result untouched", async () => {
    const user = userEvent.setup()
    await renderTab()
    await run(user)
    world.override["POST /strategy/backtests"] = () => {
      throw new FakeApiError("Chưa đủ dữ liệu khởi tạo cho chỉ báo.", 422, { code: "INSUFFICIENT_DATA" })
    }
    await user.click(screen.getByRole("button", { name: "Chạy backtest" }))
    expect((await screen.findAllByRole("alert")).some((alert) => /Chưa đủ dữ liệu khởi tạo/.test(alert.textContent ?? ""))).toBe(true)
    expect(screen.getByTestId("backtest-results")).toBeTruthy()
  })

  it("draws no VN-Index series and says why when the benchmark has no data", async () => {
    const user = userEvent.setup()
    world.marketAvailable = false
    await renderTab()
    const results = await run(user)
    const legend = within(results).getByRole("list", { name: "Chú giải biểu đồ" })
    expect(within(legend).queryByText("VN-Index")).toBeNull()
    expect(results.textContent).toMatch(/VN-Index: Thiếu dữ liệu VN-Index cùng ngày gốc/)
  })
})

describe("trade history", () => {
  it("reaches every closed trade through the trades endpoint, 25 per page, with open position and pending orders apart", async () => {
    const user = userEvent.setup()
    world.nextTrades = 60
    world.nextOpen = true
    world.nextPending = true
    await renderTab()
    const results = await run(user)

    expect(within(results).getByTestId("trade-total").textContent).toBe("Toàn bộ 60 giao dịch đã đóng")
    expect(within(results).getAllByTestId("trade-row")).toHaveLength(25)
    expect(callsTo(world, "GET", "/strategy/backtests/bbbbbbbb-bbbb-4bbb-8bbb-000000000001/trades")).toHaveLength(0)

    await user.click(within(results).getByRole("button", { name: "Trang sau" }))
    await waitFor(() => expect(within(results).getAllByTestId("trade-row")[0]!.textContent).toContain("26"))
    const second = callsTo(world, "GET", "/strategy/backtests/bbbbbbbb-bbbb-4bbb-8bbb-000000000001/trades")
    expect(second).toHaveLength(1)
    await user.click(within(results).getByRole("button", { name: "Trang sau" }))
    await waitFor(() => expect(within(results).getAllByTestId("trade-row")).toHaveLength(10))
    expect(within(results).getByText(/Hiển thị từ 51 đến 60 trên 60 giao dịch/)).toBeTruthy()
    expect(within(results).getByRole("button", { name: "Trang sau" }).hasAttribute("disabled")).toBe(true)

    const open = within(results).getByTestId("open-position")
    expect(open.textContent).toMatch(/Vị thế đang mở/)
    expect(open.textContent).toMatch(/chưa trừ phí và thuế bán/)
    expect(open.closest("table")).toBeNull()
    const pending = within(results).getByTestId("pending-orders")
    expect(pending.textContent).toMatch(/Tín hiệu Mua cuối kỳ 31\/12\/2025 chưa có phiên khớp/)
    expect(within(results).getByTestId("trade-total").textContent).not.toMatch(/61|62/)
  })

  it("opens the detail of a trade: signal date apart from fill date, fees, net cash and the condition values", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await run(user)
    await user.click(within(results).getByRole("button", { name: "Chi tiết giao dịch 2" }))
    const dialog = await screen.findByRole("dialog", { name: /Giao dịch #2/ })
    expect(dialog.textContent).toMatch(/Tín hiệu 09\/03\/2025/)
    expect(dialog.textContent).toMatch(/khớp 10\/03\/2025/)
    expect(dialog.textContent).toMatch(/phí 30\.000 đ/)
    expect(within(dialog).getByRole("table", { name: "Điều kiện Mua tại tín hiệu" })).toBeTruthy()
    expect(within(dialog).getByRole("table", { name: "Điều kiện Bán tại tín hiệu" })).toBeTruthy()
    expect(dialog.textContent).toMatch(/0,4/)
  })

  it("shows an empty history, a dash instead of 0% for the win rate, when nothing was closed", async () => {
    const user = userEvent.setup()
    world.nextTrades = 0
    await renderTab()
    const results = await run(user)
    expect(within(results).getByText("Chưa có giao dịch đã đóng trong khoảng kiểm thử này.")).toBeTruthy()
    const winRate = within(results).getAllByTestId("kpi")[4]!
    expect(winRate.textContent).toContain("—")
    expect(winRate.textContent).not.toContain("0%")
  })

  it("opens a stored run from Đã lưu without writing the shared configuration and loads its inputs", async () => {
    const user = userEvent.setup()
    const stored = (await createStrategyApi(world)("/strategy/backtests", { method: "POST", body: JSON.stringify({ shared_revision: 3, symbol: "VNM", start: "2023-01-02", end: "2024-12-31", assumptions: { capital: 200_000_000, execution: "same_close", fee_preset: "none" } }) })) as { run_id: string }
    world.calls.length = 0
    world.runs = [runSummary({ run_id: stored.run_id, symbol: "VNM", start: "2023-01-02", end: "2024-12-31" })]
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Đã lưu" }))
    const dialog = await screen.findByRole("dialog", { name: "Kết quả kiểm thử đã lưu" })
    expect(dialog.textContent).toMatch(/Mở kết quả không thay cấu hình chung của Bot và Backtest/)
    await user.click(within(dialog).getByRole("button", { name: /Xem VNM/ }))
    const results = await screen.findByTestId("backtest-results")
    expect(results.textContent).toContain("VNM")
    expect((screen.getByLabelText("Khớp lệnh") as HTMLSelectElement).value).toBe("same_close")
    expect((screen.getByLabelText("Vốn ban đầu (VND)") as HTMLInputElement).value).toBe("200.000.000")
    expect(patches()).toHaveLength(0)
    expect(posts("/strategy/backtests")).toHaveLength(0)
    expect(screen.queryByTestId("stale-badge")).toBeNull()
  })
})

describe("shared configuration", () => {
  it("states that the shared config is the Bot's and when it takes effect (saved, Bot revision, pending)", async () => {
    await renderTab()
    expect(screen.getByTestId("config-effective").textContent).toMatch(/Bot đang dùng bản 2/)
    expect(screen.getByTestId("config-effective").textContent).toMatch(/bản 3/)
    expect(screen.getByTestId("config-effective").textContent).toMatch(/09\/10\/2026/)
  })

  it("opens the chosen side from the library and saves it to the shared config, saying the Bot uses it too", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Thêm RSI vào Bán" }))
    const dialog = await screen.findByRole("dialog", { name: "Cấu hình chung · RSI" })
    expect(within(dialog).getByTestId("shared-config-note").textContent).toMatch(/dùng chung với Bot/)
    expect(within(dialog).getByTestId("shared-config-note").textContent).toMatch(/từ phiên giao dịch hợp lệ kế tiếp/)
    expect(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }).getAttribute("aria-selected")).toBe("true")
    expect((within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Bán" }) as HTMLElement).getAttribute("aria-checked")).toBe("true")
    // Nothing is in the saved config until Lưu.
    expect(patches()).toHaveLength(0)
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    const sent = patches()[0]!.body as { expected_revision: number; indicators: Record<string, { master_enabled: boolean; buy: { enabled: boolean }; sell: { enabled: boolean } }> }
    expect(sent.expected_revision).toBe(3)
    expect(Object.keys(sent.indicators)).toEqual(["rsi"])
    expect(sent.indicators.rsi).toMatchObject({ master_enabled: true, buy: { enabled: false }, sell: { enabled: true } })
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    expect(String(mocks.toast.success.mock.calls[0]![0])).toMatch(/Bot cũng dùng bản này/)
    expect(screen.getByTestId("panel-sell").textContent).toContain("RSI")
    expect(screen.getByTestId("panel-buy").textContent).not.toContain("RSI")
  })

  it("adds nothing when the dialog is cancelled, and asks before throwing a changed draft away", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Thêm RSI vào Mua" }))
    const dialog = await screen.findByRole("dialog", { name: "Cấu hình chung · RSI" })
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    expect(screen.queryByRole("dialog", { name: "Cấu hình chung · RSI" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Thêm RSI vào Mua" }))
    const again = await screen.findByRole("dialog", { name: "Cấu hình chung · RSI" })
    const period = within(again).getByLabelText("Chu kỳ RSI")
    await user.clear(period)
    await user.type(period, "20")
    await user.keyboard("{Escape}")
    expect(await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Tiếp tục chỉnh sửa" }))
    expect((within(again).getByLabelText("Chu kỳ RSI") as HTMLInputElement).value).toBe("20")
    await user.click(within(again).getByRole("button", { name: "Hủy" }))
    await user.click(await screen.findByRole("button", { name: "Bỏ thay đổi" }))
    expect(patches()).toHaveLength(0)
    expect(screen.getByTestId("panel-buy").textContent).not.toContain("RSI")
  })

  it("removes an indicator from ONE side as a confirmed save: that side OFF, params and the other side kept", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Bỏ MACD khỏi Mua" }))
    const confirm = await screen.findByRole("dialog", { name: "Bỏ MACD khỏi Mua?" })
    expect(confirm.textContent).toMatch(/Bot cũng không dùng MACD cho phía Mua/)
    expect(patches()).toHaveLength(0)
    await user.click(within(confirm).getByRole("button", { name: "Bỏ và lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    const sent = patches()[0]!.body as { indicators: Record<string, { master_enabled: boolean; buy: { enabled: boolean; params: Record<string, number> }; sell: { enabled: boolean } }> }
    expect(sent.indicators.macd).toMatchObject({ master_enabled: true, buy: { enabled: false, params: { fast: 12, slow: 26, signal: 9 } }, sell: { enabled: true } })
    await waitFor(() => expect(screen.getByTestId("panel-buy").textContent).not.toContain("MACD"))
    expect(screen.getByTestId("panel-sell").textContent).toContain("MACD")
  })

  it("keeps the draft and offers a reload when another device saved first (409)", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Thêm RSI vào Mua" }))
    const dialog = await screen.findByRole("dialog", { name: "Cấu hình chung · RSI" })
    world.savedRevision = 4
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    expect(await within(dialog).findByText("Cấu hình đã thay đổi ở nơi khác")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Lưu" }).hasAttribute("disabled")).toBe(true)
    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }))
    expect(await within(dialog).findByText(/Đã tải bản #4/)).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Lưu" }).hasAttribute("disabled")).toBe(false)
  })
})

describe("alert from a result", () => {
  it("pins the snapshot of the run itself (backtest_run), not the form", async () => {
    const user = userEvent.setup()
    await renderTab()
    expect(screen.getByRole("button", { name: "Tạo cảnh báo" }).hasAttribute("disabled")).toBe(true)
    const results = await run(user)
    await user.click(screen.getByRole("button", { name: "Tạo cảnh báo" }))
    const dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    expect((within(dialog).getByLabelText("Nguồn cấu hình") as HTMLSelectElement).value).toBe("run")
    await within(dialog).findByText(/Cấu hình của kết quả kiểm thử FPT/)
    expect((within(dialog).getByLabelText("Tên cảnh báo") as HTMLInputElement).value).toBe("FPT · Theo dõi tín hiệu")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    await waitFor(() => expect(posts("/strategy/alerts")).toHaveLength(1))
    expect(posts("/strategy/alerts")[0]!.body).toMatchObject({ source: { kind: "backtest_run", run_id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001" }, scope: { kind: "symbols", symbols: ["FPT"] }, sides: ["buy", "sell"] })
    expect(results).toBeTruthy()
  })
})

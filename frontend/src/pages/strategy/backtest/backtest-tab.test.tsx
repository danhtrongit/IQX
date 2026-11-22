/** Tab Backtest v2.0 (spec Bot và Chiến lược §4): basket runs, Lưu ▾, strategy menu, tab IQX, saved runs, Bộ lọc basket. */
import type { ReactElement } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render as rtlRender, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { stubBrowser } from "../../demo-trading/bot/test-render"
import { buildRegistry, callsTo } from "../../demo-trading/bot/test-support"
import { createStrategyApi, createStrategyWorld, type StrategyWorld } from "../test-support"
import { BacktestTab } from "./backtest-tab"
import { contentOf, emptyDraft } from "./draft"
import { V2_T0 } from "./test-fake"

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

function render(ui: ReactElement, entry: string | { pathname: string; search?: string; state?: unknown } = "/chien-luoc?tab=backtest") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const posts = (path: string) => callsTo(world, "POST", path)
const runButton = () => screen.getByTestId("run-button")

async function renderTab(entry?: Parameters<typeof render>[1]) {
  render(<BacktestTab />, entry)
  await screen.findByRole("heading", { name: "Điều kiện Mua" })
  await waitFor(() => expect(screen.getByLabelText("Từ ngày")).toBeTruthy())
}

/** "+ Mua" / "+ Bán" of the library, then "Lưu vào bản nháp" with the template rows. */
async function addSide(user: ReturnType<typeof userEvent.setup>, name: string, side: "Mua" | "Bán") {
  const library = screen.getByRole("complementary", { name: "Thư viện chỉ báo" })
  await user.click(within(library).getByRole("button", { name: `Thêm ${name} vào ${side}` }))
  await user.click(await screen.findByRole("button", { name: "Lưu vào bản nháp" }))
}

async function runNow(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect((runButton() as HTMLButtonElement).disabled).toBe(false))
  await user.click(runButton())
  return screen.findByTestId("backtest-results")
}

function savedStrategy(id: string, name: string) {
  const registry = buildRegistry()
  const draft = emptyDraft(registry)
  draft.indicators.macd!.master_enabled = true
  draft.indicators.macd!.buy.enabled = true
  draft.indicators.macd!.sell.enabled = true
  const content = contentOf(draft)
  return {
    item: { id, name, latest_version: 1, latest_saved_at: V2_T0, universe_label: "VN30", universe_count: 30, sell_only: false, on_bot: { last: false, next: false } },
    versions: [{ strategy_id: id, name, version: 1, version_label: "bản 08/10 10:00", content, config_hash: "h1", created_at: V2_T0, note: null, from_run_id: null, universe_label: "VN30", max_holding: 30 }],
  }
}

describe("tab Chỉ báo", () => {
  it("a new strategy: rổ VN30, giữ 30, locked capital, Run waits for a Mua row, the rules line is shown", async () => {
    await renderTab()
    expect(screen.getByTestId("strategy-picker").textContent).toContain("Chiến lược mới")
    expect((screen.getByLabelText("Rổ mã") as HTMLSelectElement).value).toBe("vn30")
    expect((screen.getByLabelText("Giữ tối đa") as HTMLInputElement).value).toBe("30")
    const capital = screen.getByLabelText("Vốn ban đầu (VND)") as HTMLInputElement
    expect(capital.disabled).toBe(true)
    expect(capital.value).toBe("100.000.000")
    expect((runButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId("run-hint").textContent).toBe("Cần ít nhất một dòng Mua đang bật để chạy.")
    expect(screen.getByTestId("rules-line").textContent).toContain("khớp giá đóng cửa cùng phiên")
  })

  it("Giữ tối đa outside 3–250 blocks the run with its sentence", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addSide(user, "MACD", "Mua")
    const input = screen.getByLabelText("Giữ tối đa")
    await user.clear(input)
    await user.type(input, "2")
    expect(screen.getByRole("alert").textContent).toBe("Giữ tối đa phải từ 3 đến 250 phiên, số nguyên.")
    expect((runButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("runs the draft on the basket: 7 KPIs, caption, 5 tabs, close-fill and past-results lines; an edit marks it stale", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addSide(user, "MACD", "Mua")
    await addSide(user, "MACD", "Bán")
    const results = await runNow(user)
    const body = posts("/strategy/backtests").at(-1)!.body as { strategy: { source: string; content: { universe: unknown; max_holding: number } }; start: string; end: string }
    expect(body.strategy.source).toBe("draft")
    expect(body.strategy.content.universe).toEqual({ type: "vn30" })
    expect(body.strategy.content.max_holding).toBe(30)
    expect(body.end).toBe(world.storeMeta.data_as_of)
    expect(within(results).getAllByTestId("kpi")).toHaveLength(7)
    expect(within(results).getByTestId("result-caption").textContent).toMatch(/^Rổ VN30 \(30 mã\) · .* · giữ tối đa 30 phiên · khớp giá đóng cửa cùng phiên$/)
    expect(within(results).getAllByRole("tab")).toHaveLength(5)
    expect(within(results).getByTestId("past-results").textContent).toBe("Kết quả quá khứ không bảo đảm kết quả tương lai.")
    expect(await within(results).findByText(/lệnh bán do hết thời gian giữ/)).toBeTruthy()
    await user.click(within(results).getByRole("tab", { name: "Giả định" }))
    expect(within(results).getByText("Giả định khớp đúng giá đóng cửa; thực tế có thể khác.")).toBeTruthy()
    expect(screen.queryByTestId("stale-label")).toBeNull()

    const input = screen.getByLabelText("Giữ tối đa")
    await user.clear(input)
    await user.type(input, "40")
    expect(screen.getByTestId("stale-label").textContent).toContain("Cấu hình đã đổi sau lần chạy này · cần chạy lại")
  })

  it("Lưu ▾ is locked until the draft ran; then Lưu thành chiến lược mới saves with from_run_id", async () => {
    const user = userEvent.setup()
    await renderTab()
    await addSide(user, "MACD", "Mua")
    await user.click(screen.getByTestId("save-menu-trigger"))
    const locked = await screen.findByTestId("save-new")
    expect(locked.getAttribute("aria-disabled")).toBe("true")
    expect(locked.textContent).toContain("Bấm Chạy trước khi Lưu.")
    await user.keyboard("{Escape}")

    await runNow(user)
    await user.click(screen.getByTestId("save-menu-trigger"))
    await user.click(await screen.findByTestId("save-new"))
    const name = await screen.findByLabelText("Tên chiến lược (tối đa 40 ký tự)")
    await user.type(name, "Xu hướng của tôi")
    await user.click(screen.getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(posts("/strategy/strategies")).toHaveLength(1))
    const sent = posts("/strategy/strategies")[0]!.body as { name: string; from_run_id: string; apply_next?: boolean }
    expect(sent.name).toBe("Xu hướng của tôi")
    expect(sent.from_run_id).toMatch(/^b2000000/)
    expect(sent.apply_next).toBeUndefined()
    await waitFor(() => expect(screen.getByTestId("strategy-picker").textContent).toContain("Xu hướng của tôi"))
    expect(world.schedule.next.source).toBe("iqx")
  })

  it("Lưu và dùng cho Bot asks to confirm the due positions and resends them", async () => {
    world.dueImpact = { next_session: "2026-10-08", n_current: 30, n_new: 10, positions: [{ symbol: "HPG", counted: 12, sell_session: "2026-10-08" }] }
    const user = userEvent.setup()
    await renderTab()
    await addSide(user, "MACD", "Mua")
    await runNow(user)
    await user.click(screen.getByTestId("save-menu-trigger"))
    await user.click(await screen.findByTestId("save-use"))
    await user.type(await screen.findByLabelText("Tên chiến lược (tối đa 40 ký tự)"), "Cho Bot")
    await user.click(screen.getByRole("button", { name: "Lưu" }))
    const tick = await screen.findByRole("checkbox", { name: "Tôi hiểu các vị thế trên sẽ được bán." })
    const confirm = screen.getByRole("button", { name: "Lưu và dùng cho Bot" })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.click(tick)
    await user.click(confirm)
    await waitFor(() => expect(world.strategies).toHaveLength(1))
    const sent = posts("/strategy/strategies").at(-1)!.body as { apply_next: boolean; confirm_due_positions: string[] }
    expect(sent.apply_next).toBe(true)
    expect(sent.confirm_due_positions).toEqual(["HPG"])
    expect(world.schedule.next).toMatchObject({ source: "user", id: world.strategies[0]!.item.id })
  })
})

describe("strategy menu", () => {
  it("lists n/20, locks delete of the strategy the Bot runs next, deletes another", async () => {
    world.strategies = [savedStrategy("a2000000-0000-4000-8000-000000000001", "Đang chạy"), savedStrategy("a2000000-0000-4000-8000-000000000002", "Cũ")]
    world.schedule = { ...world.schedule, next: { ...world.schedule.next, source: "user", id: "a2000000-0000-4000-8000-000000000001", version: 1, name: "Đang chạy", version_label: "bản 07/10 09:00", hidden: false, content: { universe: { type: "vn30" }, indicators: {}, max_holding: 30 } } }
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByTestId("strategy-picker"))
    const menu = await screen.findByTestId("strategy-menu")
    expect(await within(menu).findByText("Chiến lược đã lưu (2/20)")).toBeTruthy()
    expect((within(menu).getByRole("button", { name: /Không xóa được Đang chạy/ }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(menu).getByRole("button", { name: "Xóa Cũ" }))
    await user.click(await screen.findByRole("button", { name: "Xóa chiến lược" }))
    await waitFor(() => expect(world.strategies).toHaveLength(1))
    expect(mocks.toast.success).toHaveBeenCalledWith('Đã xóa "Cũ".')
  })

  it("locks Tạo chiến lược mới at the limit", async () => {
    world.strategies = [savedStrategy("a2000000-0000-4000-8000-000000000001", "Một")]
    world.strategyLimit = 1
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByTestId("strategy-picker"))
    const menu = await screen.findByTestId("strategy-menu")
    await within(menu).findByText("Chiến lược đã lưu (1/1)")
    expect((within(menu).getByRole("button", { name: "Tạo chiến lược mới" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("opening a saved strategy over an edited draft asks first", async () => {
    world.strategies = [savedStrategy("a2000000-0000-4000-8000-000000000001", "Một")]
    const user = userEvent.setup()
    await renderTab()
    await addSide(user, "RSI", "Mua")
    await user.click(screen.getByTestId("strategy-picker"))
    await user.click(await within(await screen.findByTestId("strategy-menu")).findByRole("button", { name: /^Một/ }))
    expect(await screen.findByText("Thay bản nháp đang chỉnh?")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Thay" }))
    await waitFor(() => expect(screen.getByTestId("strategy-picker").textContent).toContain("Một"))
  })
})

describe("tab IQX", () => {
  it("shows a Chiến lược IQX read only and trial-runs it by reference", async () => {
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getAllByRole("tab", { name: "IQX" })[0]!)
    expect(await screen.findByTestId("iqx-strategy-strip")).toBeTruthy()
    expect((screen.getByLabelText("Giữ tối đa") as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByTestId("save-menu-trigger")).toBeNull()
    await runNow(user)
    const body = posts("/strategy/backtests").at(-1)!.body as { strategy: { source: string; id: string; version: number } }
    expect(body.strategy).toEqual({ source: "iqx", id: world.iqx.strategy[0]!.id, version: world.iqx.strategy[0]!.version })
    expect(screen.getAllByText(/Tham khảo để học, không phải khuyến nghị đầu tư\./).length).toBeGreaterThan(0)
  })
})

describe("Lần chạy đã lưu", () => {
  it("a legacy run only shows its three numbers", async () => {
    world.v2RunList = [
      { run_id: "b1000000-0000-4000-8000-000000000001", created_at: V2_T0, legacy: true, strategy_label: "FPT · cấu hình chung", version_label: null, universe_label: "FPT", start: "2024-01-02", end: "2025-12-31", kpis: { total_return: 12.3, max_drawdown: -4.5, closed_trades: 6 } },
    ]
    const user = userEvent.setup()
    await renderTab()
    await user.click(screen.getByRole("button", { name: "Lần chạy đã lưu" }))
    await user.click(await screen.findByRole("button", { name: "Tất cả" }))
    expect(await screen.findByText("Cấu hình cũ")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Xem số liệu" }))
    expect(await screen.findByText("Chạy trên 1 mã theo cấu hình chung trước đây. Chỉ xem, không chạy lại.")).toBeTruthy()
    expect(screen.getByTestId("legacy-kpis").textContent).toContain("12,3")
  })
})

describe("Bộ lọc → Backtest với rổ là kết quả này (§13)", () => {
  it("opens a new strategy with the VN100 symbols of the result and names the dropped ones; nothing runs", async () => {
    await renderTab({ pathname: "/chien-luoc", search: "?tab=backtest", state: { backtestBasket: { name: "Kết quả bộ lọc chưa lưu · 07/10", symbols: ["FPT", "HPG", "XYZ"] } } })
    expect(await screen.findByText(/Bỏ 1 mã ngoài VN100 \(không có trong kho dữ liệu\): XYZ/)).toBeTruthy()
    expect(screen.getByTestId("universe-line").textContent).toContain("Kết quả bộ lọc chưa lưu · 07/10")
    expect(posts("/strategy/backtests")).toHaveLength(0)
  })
})

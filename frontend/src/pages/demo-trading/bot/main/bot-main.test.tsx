import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, type World } from "../test-support"
import type { BotConditions, BotJournalItem, BotPosition } from "../types"
import { BotMain } from "./bot-main"

const mocks = vi.hoisted(() => ({ api: vi.fn(), openAuth: vi.fn() }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: mocks.openAuth }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock("../../journey/mascot-2d/Mascot2DStage", () => ({
  Mascot2DStage: ({ mascotId }: { mascotId: string }) => <div data-testid="mascot-2d" data-mascot={mascotId} />,
}))
vi.mock("../../journey/visibility", () => ({ useStageVisibility: () => true, useReducedMotion: () => false }))

let world: World

beforeEach(() => {
  world = createWorld()
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

function conditions(partial: Partial<BotConditions> = {}): BotConditions {
  return {
    state: "waiting_for_conditions", state_label: "Chờ thiết lập điều kiện", has_active_buy: false, has_active_sell: false,
    buy_condition_count: 0, sell_condition_count: 0, buy_status: "inactive", sell_status: "inactive", errors: { buy: null, sell: null },
    saved_revision: null, effective_revision: null, effective_session: null, config_status: "none", pending: null, open_positions: 0, ...partial,
  }
}

async function renderMain() {
  renderBot(<BotMain mascotId="bach_ho" />)
  await screen.findByRole("region", { name: "Linh thú của bạn" })
  await waitFor(() => expect(screen.getByTestId("bot-state-chip").textContent).not.toBe("Đang tải điều kiện"))
}

const position = (partial: Partial<BotPosition> & Pick<BotPosition, "id" | "symbol">): BotPosition => ({
  qty: 300, entry_price_vnd: "98500", current_close_vnd: "101200", market_value_vnd: "30360000", weight_pct: "29.1", unrealized_pnl_net_vnd: "710000",
  in_universe: true, source_scope: "in_buy_source", entry_source_snapshot: { kind: "vn30", name: "VN30" }, entry_config_revision: 2, holding_sessions: 4,
  last_decision: null, legacy_stop_loss_vnd: null, legacy_amplitude_at_entry_vnd: null, legacy_amplitude_source_ref: null, legacy_take_profit_vnd: null,
  legacy_filter_ids: [], opened_session: "2026-10-01", opened_at: "2026-10-01T08:00:00Z", sector: null, source_refs: {}, ...partial,
})

function decision(id: string, date: string, action: BotJournalItem["action"], extra: Partial<BotJournalItem> = {}): BotJournalItem {
  return {
    id, run_id: `run-${date}`, trading_date: date, action, reason_code: "x", reason_label: "Điều kiện Mua chưa đạt", reason: "raw", execution: null, symbol: "HPG",
    in_universe: true, universe_kind: "vn30", universe_revision: 0, policy_version: "iqx-bot-v1.0", decision_config_revision: 3, condition_snapshot: null,
    rank_tuple: null, legacy_filter_ids: [], legacy_threshold_vnd: null, source_refs: {}, created_at: `${date}T12:00:00Z`, ...extra,
  }
}
const execution = (side: "buy" | "sell", qty: number, price: number, net: number) => ({
  id: `e-${side}-${price}`, side, qty, price_vnd: String(price), gross_value_vnd: String(qty * price), fee_vnd: "1500", tax_vnd: side === "sell" ? "1000" : "0", net_cash_delta_vnd: String(net),
})

describe("Bot main", () => {
  it("shows the four KPIs of the Bot account, the mascot and the source/holdings chips", async () => {
    world.positions = [position({ id: "p1", symbol: "FPT" }), position({ id: "p2", symbol: "VRE" })]
    await renderMain()

    const strip = document.querySelector("dl[aria-label='Tài khoản Bot']") as HTMLElement
    const labels = [...strip.querySelectorAll("dt")].map((node) => node.textContent)
    expect(labels).toEqual(["Vốn Bot ban đầu", "Tiền mặt", "Giá trị danh mục", "Tổng lợi nhuận"])
    const values = [...strip.querySelectorAll("dd")].map((node) => node.textContent?.replace(/\s/g, " "))
    expect(values).toEqual(["100.000.000 đ", "100.000.000 đ", "100.000.000 đ", "0,00%"])

    expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho")
    expect(screen.getByRole("heading", { level: 2, name: "Bạch Hổ" })).toBeTruthy()
    await screen.findByText("Nguồn mua: VN30")
    expect(screen.getByText("2 mã đang giữ")).toBeTruthy()
    expect(screen.queryByText(/Cấu hình chờ hiệu lực/)).toBeNull()
  })

  it("never triggers a run or any write: only GET reads", async () => {
    const user = userEvent.setup()
    await renderMain()
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }))
    await user.click(screen.getByRole("tab", { name: "Nhật ký" }))
    expect(world.calls.filter((call) => call.method !== "GET")).toEqual([])
  })

  it.each([
    ["waiting_for_conditions", "Chờ thiết lập điều kiện"],
    ["buy_only", "Đã bật điều kiện Mua"],
    ["sell_only", "Chỉ xét điều kiện Bán"],
    ["buy_and_sell", "Đã bật Mua và Bán"],
    ["error", "Lỗi cấu hình hoặc quyền"],
  ] as const)("shows the config state chip for %s", async (state, label) => {
    world.conditions = conditions({ state })
    await renderMain()
    expect(screen.getByTestId("bot-state-chip").textContent).toBe(label)
  })

  it("explains a config error and blocks the affected side's card", async () => {
    world.conditions = conditions({
      state: "error", buy_status: "blocked",
      errors: { buy: { reason: "config_invalid_or_unauthorized", detail: "Chỉ báo RSI chưa được cấp quyền", indicator_ids: ["rsi"] }, sell: null },
    })
    await renderMain()
    const buy = screen.getByRole("region", { name: "ĐIỀU KIỆN MUA" })
    expect(within(buy).getByRole("alert").textContent).toMatch(/Phía Mua đang bị chặn: Chỉ báo RSI chưa được cấp quyền/)
    expect(within(screen.getByRole("region", { name: "ĐIỀU KIỆN BÁN" })).getByText("Chưa có điều kiện hiệu lực.")).toBeTruthy()
  })

  it("lists the effective conditions in readable form with the AND badge", async () => {
    world.savedRevision = 2
    world.effectiveRevision = 2
    world.indicators.rsi!.master_enabled = true
    world.indicators.rsi!.buy.enabled = true
    world.indicators.rsi!.buy.params = { period: 10, level: 25 }
    world.indicators.macd!.master_enabled = true
    world.indicators.macd!.sell.enabled = true
    world.conditions = conditions({ state: "buy_and_sell", has_active_buy: true, has_active_sell: true, buy_condition_count: 1, sell_condition_count: 1, buy_status: "active", sell_status: "active", saved_revision: 2, effective_revision: 2, config_status: "effective" })
    await renderMain()

    const buy = await screen.findByRole("region", { name: "ĐIỀU KIỆN MUA" })
    expect(within(buy).getByText("AND")).toBeTruthy()
    expect(await within(buy).findByText("RSI")).toBeTruthy()
    expect(within(buy).getByText(/Chu kỳ RSI 10 phiên · Ngưỡng quá bán 25/)).toBeTruthy()
    expect(within(buy).getByText("RSI phiên trước < 25")).toBeTruthy()
    expect(within(buy).getByText("RSI > RSI phiên trước")).toBeTruthy()
    const sell = screen.getByRole("region", { name: "ĐIỀU KIỆN BÁN" })
    expect(within(sell).getByText("MACD")).toBeTruthy()
    expect(within(sell).getByText("MACD < Đường tín hiệu")).toBeTruthy()
    expect(screen.queryByText(/Chưa có điều kiện hiệu lực/)).toBeNull()
  })

  it("notes the pending revision beside the effective one and lists the pending conditions separately", async () => {
    world.savedRevision = 5
    world.effectiveRevision = 4
    world.effectiveSession = "2026-10-09"
    world.indicators.rsi!.master_enabled = true
    world.indicators.rsi!.buy.enabled = true
    world.conditions = conditions({
      state: "waiting_for_conditions", saved_revision: 5, effective_revision: 4, effective_session: "2026-10-09", config_status: "pending",
      pending: { revision: 5, effective_session: "2026-10-09", status: "pending" },
    })
    await renderMain()
    expect(await screen.findByText("Đã lưu cấu hình bản 5. Bản 4 vẫn đang có hiệu lực; thay đổi bắt đầu từ phiên 09/10/2026.")).toBeTruthy()
    expect(screen.getByText("Cấu hình chờ hiệu lực")).toBeTruthy()
    const buy = screen.getByRole("region", { name: "ĐIỀU KIỆN MUA" })
    expect(within(buy).getByText("Chưa có điều kiện hiệu lực.")).toBeTruthy()
    expect(within(buy).getByText(/Chờ hiệu lực · bản 5 · từ phiên 09\/10\/2026/)).toBeTruthy()
    expect(within(buy).getByRole("list", { name: "ĐIỀU KIỆN MUA chờ hiệu lực" })).toBeTruthy()
  })
})

describe("Danh mục Bot", () => {
  it("lists open positions with qty, cost, price, P&L, holding sessions and the buy-source badge", async () => {
    world.positions = [
      position({ id: "p1", symbol: "FPT" }),
      position({ id: "p2", symbol: "VRE", qty: 500, entry_price_vnd: "26200", current_close_vnd: "25400", unrealized_pnl_net_vnd: "-465000", in_universe: false, source_scope: "sell_watch_only", holding_sessions: 6 }),
    ]
    const user = userEvent.setup()
    await renderMain()
    const table = await screen.findByRole("table", { name: "Vị thế Bot đang giữ" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    const fpt = within(rows[0]!)
    expect(fpt.getByText("FPT")).toBeTruthy()
    expect(fpt.getByText("300")).toBeTruthy()
    expect(fpt.getByText("98.500 đ")).toBeTruthy()
    expect(fpt.getByText("101.200 đ")).toBeTruthy()
    expect(fpt.getByText("+710.000 đ")).toBeTruthy()
    expect(fpt.getByText("4 phiên")).toBeTruthy()
    expect(fpt.getByText("Trong nguồn mua")).toBeTruthy()
    expect(within(rows[1]!).getByText("Chỉ theo dõi Bán")).toBeTruthy()
    expect(within(rows[1]!).getByText("−465.000 đ")).toBeTruthy()

    await user.click(within(table).getByRole("button", { name: "Chi tiết vị thế FPT" }))
    const detail = await screen.findByRole("dialog", { name: "Vị thế FPT" })
    expect(detail.textContent).not.toMatch(/cũ|stop|L1/i)
  })

  it("shows legacy values only inside the detail of a position that has them", async () => {
    world.positions = [position({ id: "p3", symbol: "HPG", legacy_stop_loss_vnd: "24000", legacy_filter_ids: ["kl"] })]
    const user = userEvent.setup()
    await renderMain()
    expect(screen.queryByText(/cắt lỗ|Mốc|stop/i)).toBeNull()
    await user.click(await screen.findByRole("button", { name: "Chi tiết vị thế HPG" }))
    const detail = await screen.findByRole("dialog", { name: "Vị thế HPG" })
    expect(within(detail).getByRole("region", { name: "Dữ liệu chính sách cũ" }).textContent).toMatch(/Mốc cắt lỗ cũ/)
  })

  it("shows an empty state without positions", async () => {
    await renderMain()
    expect(await screen.findByText("Chưa có cổ phiếu đang nắm giữ")).toBeTruthy()
  })

  it("History lists executions with real symbols and dates and the realized P&L of a closed trade", async () => {
    world.journal = [
      decision("4", "2026-10-07", "sell", { symbol: "FPT", reason_label: "Bán theo điều kiện Bán", execution: execution("sell", 300, 101200, 30358500), created_at: "2026-10-07T12:00:00Z" }),
      decision("3", "2026-10-06", "skip", { symbol: "HPG" }),
      decision("2", "2026-10-01", "buy", { symbol: "FPT", reason_label: "Mua theo điều kiện Mua", execution: execution("buy", 300, 98500, -29551500), created_at: "2026-10-01T12:00:00Z", universe_kind: "custom", universe_revision: 2 }),
    ]
    const user = userEvent.setup()
    await renderMain()
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }))
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText("07/10/2026")).toBeTruthy()
    expect(within(rows[0]!).getByText("FPT")).toBeTruthy()
    expect(within(rows[0]!).getByText("Bán")).toBeTruthy()
    expect(within(rows[0]!).getByText("+807.000 đ")).toBeTruthy()
    expect(within(rows[0]!).getByText("Danh mục riêng · bản 2")).toBeTruthy()
    expect(within(rows[1]!).getByText("Mua")).toBeTruthy()

    await user.click(within(rows[0]!).getByRole("button", { name: /Chi tiết/ }))
    const detail = await screen.findByRole("dialog", { name: "Bán FPT" })
    expect(detail.textContent).toMatch(/Phiên mua01\/10\/2026/)
    expect(detail.textContent).toMatch(/Cấu hình quyết định.*Bản 3/)
  })

  it("Journal groups decisions per session with the server's reasons and reaches the whole history page by page", async () => {
    const items: BotJournalItem[] = []
    for (let session = 0; session < 8; session += 1) {
      const date = `2026-09-${String(30 - session).padStart(2, "0")}`
      for (let index = 0; index < 30; index += 1) items.push(decision(`${date}-${index}`, date, "skip", { symbol: `S${index}`, created_at: `${date}T12:00:${String(59 - index).padStart(2, "0")}Z` }))
    }
    world.journal = items
    const user = userEvent.setup()
    await renderMain()
    await user.click(screen.getByRole("tab", { name: "Nhật ký" }))
    const table = await screen.findByRole("table", { name: "Nhật ký Bot theo phiên" })
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1)
    expect(within(table).getAllByText("Điều kiện Mua chưa đạt ×30").length).toBeGreaterThan(0)
    expect(within(table).getAllByText("VN30").length).toBeGreaterThan(0)
    expect(within(table).getAllByText("Bản 3").length).toBeGreaterThan(0)

    const journalCalls = () => callsTo(world, "GET", "/bot/journal").length
    expect(journalCalls()).toBe(1)
    await user.click(screen.getByRole("button", { name: "Tải thêm nhật ký" }))
    await waitFor(() => expect(journalCalls()).toBe(2))
    await user.click(screen.getByRole("button", { name: "Tải thêm nhật ký" }))
    await waitFor(() => expect(journalCalls()).toBe(3))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tải thêm nhật ký" })).toBeNull())
    // 8 sessions x 30 decisions = 240 items over three 100-item pages: every session is reachable.
    expect(within(screen.getByRole("table", { name: "Nhật ký Bot theo phiên" })).getAllByRole("row")).toHaveLength(1 + 8)
  })

  it("History keeps loading older pages by itself until it has some trades", async () => {
    const items: BotJournalItem[] = []
    for (let index = 0; index < 150; index += 1) items.push(decision(`s-${index}`, "2026-10-07", "skip", { created_at: `2026-10-07T12:${String(59 - Math.floor(index / 60)).padStart(2, "0")}:${String(59 - (index % 60)).padStart(2, "0")}Z` }))
    items.push(decision("buy", "2026-09-01", "buy", { symbol: "FPT", execution: execution("buy", 100, 90000, -9001500), created_at: "2026-09-01T12:00:00Z" }))
    world.journal = items
    const user = userEvent.setup()
    await renderMain()
    await user.click(screen.getByRole("tab", { name: "Lịch sử" }))
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    expect(within(table).getByText("01/09/2026")).toBeTruthy()
    expect(callsTo(world, "GET", "/bot/journal")).toHaveLength(2)
  })
})

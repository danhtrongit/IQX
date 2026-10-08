import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "../test-render"
import { createFakeApi, createWorld, type World } from "../test-support"
import type { BotConditions, BotPosition } from "../types"
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

  it("says that new buys are off while the candidate order awaits confirmation, and nothing otherwise", async () => {
    world.newBuysEnabled = false
    await renderMain()
    const note = await screen.findByTestId("new-buys-off-note")
    expect(note.textContent).toMatch(/Chưa bật mua mới: thứ tự ứng viên chờ xác nhận/)
    expect(note.textContent).toMatch(/vẫn xét Bán/)
  })

  it.each([true, null] as const)("shows no new-buys note when the server says %s", async (value) => {
    world.newBuysEnabled = value
    await renderMain()
    expect(screen.queryByTestId("new-buys-off-note")).toBeNull()
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
    // Nothing is waiting, so no "chờ hiệu lực" block.
    expect(screen.queryByText(/Chờ hiệu lực/)).toBeNull()
  })

  describe("effective config vs a newer saved revision", () => {
    /** Revision 4 is in force (RSI buy < 25, MACD sell); revision 5 is saved and not in force yet. */
    function pendingWorld(edit: (saved: World["indicators"]) => void) {
      world.indicators.rsi!.master_enabled = true
      world.indicators.rsi!.buy.enabled = true
      world.indicators.rsi!.buy.params = { period: 14, level: 25 }
      world.indicators.macd!.master_enabled = true
      world.indicators.macd!.sell.enabled = true
      world.effectiveIndicators = structuredClone(world.indicators)
      edit(world.indicators)
      world.savedRevision = 5
      world.effectiveRevision = 4
      world.effectiveSession = "2026-10-09"
      world.status = "pending"
      world.conditions = conditions({
        state: "buy_and_sell", has_active_buy: true, has_active_sell: true, buy_condition_count: 1, sell_condition_count: 1, buy_status: "active", sell_status: "active",
        saved_revision: 5, effective_revision: 4, effective_session: "2026-10-09", config_status: "pending",
        pending: { revision: 5, effective_session: "2026-10-09", status: "pending" },
      })
    }

    it("shows the conditions in force, then the pending revision apart under «Chờ hiệu lực từ phiên …»", async () => {
      pendingWorld((saved) => {
        saved.rsi!.buy.params = { period: 14, level: 20 }
        saved.macd!.sell.enabled = false
        saved.macd!.master_enabled = false
      })
      await renderMain()

      expect(await screen.findByText("Đã lưu cấu hình bản 5. Bản 4 vẫn đang có hiệu lực; thay đổi bắt đầu từ phiên 09/10/2026.")).toBeTruthy()
      expect(screen.getByText("Cấu hình chờ hiệu lực")).toBeTruthy()

      const buy = screen.getByRole("region", { name: "ĐIỀU KIỆN MUA" })
      const buyInForce = await within(buy).findByRole("list", { name: "ĐIỀU KIỆN MUA đang hiệu lực" })
      expect(within(buyInForce).getByText("RSI phiên trước < 25")).toBeTruthy()
      expect(within(buyInForce).queryByText("RSI phiên trước < 20")).toBeNull()
      expect(within(buy).getByText("Đang hiệu lực · bản 4")).toBeTruthy()
      expect(within(buy).getByText("Chờ hiệu lực từ phiên 09/10/2026 · bản 5")).toBeTruthy()
      const buyPending = within(buy).getByRole("list", { name: "ĐIỀU KIỆN MUA chờ hiệu lực" })
      expect(within(buyPending).getByText("RSI phiên trước < 20")).toBeTruthy()

      // The Sell side lost its only condition in the pending revision; the effective one is still listed.
      const sell = screen.getByRole("region", { name: "ĐIỀU KIỆN BÁN" })
      expect(within(within(sell).getByRole("list", { name: "ĐIỀU KIỆN BÁN đang hiệu lực" })).getByText("MACD < Đường tín hiệu")).toBeTruthy()
      expect(within(sell).getByText("Chờ hiệu lực từ phiên 09/10/2026 · bản 5")).toBeTruthy()
      expect(within(sell).getByText("Không còn điều kiện nào được bật ở phía này.")).toBeTruthy()
      expect(within(sell).queryByRole("list", { name: "ĐIỀU KIỆN BÁN chờ hiệu lực" })).toBeNull()
    })

    it("lists a pending block only on the side where the saved revision differs", async () => {
      pendingWorld((saved) => {
        saved.macd!.sell.params = { fast: 8, slow: 21, signal: 5 }
      })
      await renderMain()
      const sell = await screen.findByRole("region", { name: "ĐIỀU KIỆN BÁN" })
      await within(sell).findByRole("list", { name: "ĐIỀU KIỆN BÁN chờ hiệu lực" })
      const buy = screen.getByRole("region", { name: "ĐIỀU KIỆN MUA" })
      expect(within(buy).queryByText(/Chờ hiệu lực/)).toBeNull()
      expect(within(buy).queryByText(/Đang hiệu lực · bản/)).toBeNull()
      expect(within(buy).getByRole("list", { name: "ĐIỀU KIỆN MUA đang hiệu lực" })).toBeTruthy()
    })

    it("before any revision is in force the cards say so and the saved revision is the pending one", async () => {
      world.indicators.rsi!.master_enabled = true
      world.indicators.rsi!.buy.enabled = true
      world.savedRevision = 1
      world.effectiveRevision = null
      world.effectiveSession = "2026-10-09"
      world.status = "pending"
      world.conditions = conditions({ saved_revision: 1, effective_revision: null, config_status: "pending", pending: { revision: 1, effective_session: "2026-10-09", status: "pending" } })
      await renderMain()
      const buy = await screen.findByRole("region", { name: "ĐIỀU KIỆN MUA" })
      await within(buy).findByText("Chờ hiệu lực từ phiên 09/10/2026 · bản 1")
      expect(within(buy).getByText("Chưa có điều kiện hiệu lực.")).toBeTruthy()
      expect(within(buy).getByRole("list", { name: "ĐIỀU KIỆN MUA chờ hiệu lực" })).toBeTruthy()
      expect(within(buy).queryByRole("list", { name: "ĐIỀU KIỆN MUA đang hiệu lực" })).toBeNull()
    })

    it("does not invent a start session when the trading calendar is missing", async () => {
      world.indicators.rsi!.master_enabled = true
      world.indicators.rsi!.buy.enabled = true
      world.savedRevision = 1
      world.effectiveRevision = null
      world.effectiveSession = null
      world.status = "calendar_unavailable"
      world.conditions = conditions({ saved_revision: 1, config_status: "calendar_unavailable", pending: { revision: 1, effective_session: null, status: "calendar_unavailable" } })
      await renderMain()
      const buy = await screen.findByRole("region", { name: "ĐIỀU KIỆN MUA" })
      await within(buy).findByText("Chờ hiệu lực · chưa xác định phiên bắt đầu vì thiếu lịch giao dịch · bản 1")
      expect(within(buy).queryByText(/từ phiên/)).toBeNull()
    })

    it("a newer revision with the same content as the one in force is not shown as pending", async () => {
      world.indicators.rsi!.master_enabled = true
      world.indicators.rsi!.buy.enabled = true
      world.effectiveIndicators = structuredClone(world.indicators)
      world.savedRevision = 5
      world.effectiveRevision = 4
      world.status = "effective"
      world.conditions = conditions({ saved_revision: 5, effective_revision: 4, config_status: "effective" })
      await renderMain()
      const buy = await screen.findByRole("region", { name: "ĐIỀU KIỆN MUA" })
      await within(buy).findByRole("list", { name: "ĐIỀU KIỆN MUA đang hiệu lực" })
      expect(within(buy).queryByText(/Chờ hiệu lực/)).toBeNull()
    })

    it("still reads the saved config as the effective one from a response that has no `effective` field", async () => {
      world.omitEffective = true
      world.indicators.rsi!.master_enabled = true
      world.indicators.rsi!.buy.enabled = true
      world.savedRevision = 2
      world.effectiveRevision = 2
      world.status = "effective"
      world.conditions = conditions({ saved_revision: 2, effective_revision: 2, config_status: "effective" })
      await renderMain()
      const buy = await screen.findByRole("region", { name: "ĐIỀU KIỆN MUA" })
      expect(await within(buy).findByRole("list", { name: "ĐIỀU KIỆN MUA đang hiệu lực" })).toBeTruthy()
    })
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

})

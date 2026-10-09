import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, decisionFixture, FakeApiError, sessionFixture, tradeFixture, type World } from "../test-support"
import type { BotSessionDecision, BotTrade } from "../types"
import { PortfolioBlock } from "./portfolio-block"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})

let world: World

beforeEach(() => {
  world = createWorld()
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

async function openTab(name: "Lịch sử" | "Nhật ký") {
  const user = userEvent.setup()
  renderBot(<PortfolioBlock disclosure={null} names={{ rsi: "RSI" }} />)
  await user.click(await screen.findByRole("tab", { name }))
  return user
}

const queryOf = (call: { query?: string } | undefined) => new URLSearchParams(call?.query ?? "")
const dayOffset = (offset: number) => new Date(Date.UTC(2026, 9, 7 - offset)).toISOString().slice(0, 10)

describe("Lịch sử (GET /bot/trades)", () => {
  const winner = () => tradeFixture({ id: "t-2" })
  const loser = () =>
    tradeFixture({
      id: "t-1",
      symbol: "HPG",
      buy: { ...tradeFixture({ id: "x" }).buy, session: "2026-09-20", price_vnd: "27000", qty: 1000, entry_source_snapshot: { kind: "custom", name: "Cổ phiếu ngân hàng", revision: 2 } },
      sell: { ...tradeFixture({ id: "x" }).sell, session: "2026-09-25", price_vnd: "25800", qty: 1000 },
      realized_pnl_vnd: "-1337000",
      realized_pnl_pct: "-4.912345678901",
      holding_sessions: 3,
      holding_days: 5,
    })

  it("lists the closed trades the server returned, in its order, with its realized P&L, percent, holding sessions and entry source", async () => {
    world.trades = [winner(), loser()]
    await openTab("Lịch sử")
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)

    const first = within(rows[0]!)
    expect(first.getByText("07/10/2026")).toBeTruthy()
    expect(first.getByText("Mua 01/10/2026")).toBeTruthy()
    expect(first.getByText("FPT")).toBeTruthy()
    expect(first.getByText("300")).toBeTruthy()
    expect(first.getByText("98.500 đ")).toBeTruthy()
    expect(first.getByText("101.200 đ")).toBeTruthy()
    expect(first.getByText("+689.775 đ")).toBeTruthy()
    expect(first.getByText("+2,33%")).toBeTruthy()
    expect(first.getByText("4 phiên")).toBeTruthy()
    expect(first.getByText("VN30")).toBeTruthy()

    const second = within(rows[1]!)
    expect(second.getByText("HPG")).toBeTruthy()
    expect(second.getByText("−1.337.000 đ")).toBeTruthy()
    expect(second.getByText("−4,91%")).toBeTruthy()
    expect(second.getByText("3 phiên")).toBeTruthy()
    expect(second.getByText("Cổ phiếu ngân hàng · bản 2")).toBeTruthy()
  })

  it("shows the server's P&L as is: nothing is paired or recomputed on the client", async () => {
    world.trades = [tradeFixture({ id: "t-9", realized_pnl_vnd: "123456", realized_pnl_pct: "0.5" })]
    await openTab("Lịch sử")
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    expect(within(table).getByText("+123.456 đ")).toBeTruthy()
    expect(within(table).getByText("+0,5%")).toBeTruthy()
    expect(callsTo(world, "GET", "/bot/journal")).toHaveLength(0)
    expect(world.calls.filter((call) => call.method !== "GET")).toEqual([])
  })

  it("leaves the percent out when the server has none (zero cost) and shows a zero result as 0 đ", async () => {
    world.trades = [tradeFixture({ id: "t-0", realized_pnl_vnd: "0", realized_pnl_pct: null })]
    await openTab("Lịch sử")
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    expect(within(table).getByText("0 đ")).toBeTruthy()
    expect(within(table).queryByText(/%/)).toBeNull()
  })

  it("opens a detail with both legs, fees, tax, the deciding revisions, reasons and the entry source", async () => {
    world.trades = [tradeFixture({ id: "t-2", buy: { ...tradeFixture({ id: "x" }).buy, entry_source_snapshot: { kind: "custom", name: "Cổ phiếu ngân hàng", revision: 2 } } })]
    const user = await openTab("Lịch sử")
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    await user.click(within(table).getByRole("button", { name: /Chi tiết/ }))

    const detail = await screen.findByRole("dialog", { name: "Giao dịch FPT" })
    expect(detail.textContent).toMatch(/Lãi\/lỗ đã chốt \(sau phí, thuế\)\+689\.775 đ \(\+2,33%\)/)
    expect(detail.textContent).toMatch(/Thời gian giữ4 phiên · 6 ngày/)
    expect(detail.textContent).toMatch(/Nguồn mua lúc mởCổ phiếu ngân hàng · bản 2/)

    const buy = within(within(detail).getByRole("region", { name: "Lệnh mua" }))
    expect(buy.getByText("01/10/2026")).toBeTruthy()
    expect(buy.getByText("29.550.000 đ")).toBeTruthy()
    expect(buy.getByText("44.325 đ")).toBeTruthy()
    expect(buy.getByText("29.594.325 đ")).toBeTruthy()
    expect(buy.getByText("Bản 3")).toBeTruthy()
    expect(buy.getByText("Mua theo điều kiện Mua")).toBeTruthy()

    const sell = within(within(detail).getByRole("region", { name: "Lệnh bán" }))
    expect(sell.getByText("07/10/2026")).toBeTruthy()
    expect(sell.getByText("30.360.000 đ")).toBeTruthy()
    expect(sell.getByText("45.540 đ")).toBeTruthy()
    expect(sell.getByText("30.360 đ")).toBeTruthy()
    expect(sell.getByText("30.284.100 đ")).toBeTruthy()
    expect(sell.getByText("Bản 4")).toBeTruthy()
    expect(sell.getByText("Bán theo điều kiện Bán")).toBeTruthy()
    expect(within(detail).queryByRole("region", { name: "Dữ liệu chính sách cũ" })).toBeNull()

    await user.click(within(detail).getByRole("button", { name: "Đóng" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("falls back to the raw reason text when a reason has no label, and shows legacy values only in the detail of a trade that has them", async () => {
    const base = tradeFixture({ id: "t-3" })
    world.trades = [
      tradeFixture({
        id: "t-3",
        buy: { ...base.buy, reason_label: null, reason: "Mua do bộ lọc cũ", entry_source_snapshot: null, decision_config_revision: null },
        legacy_stop_loss_vnd: "90000", legacy_filter_ids: ["kl"],
      }),
    ]
    const user = await openTab("Lịch sử")
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    expect(within(table).queryByText(/cắt lỗ|cũ/)).toBeNull()
    await user.click(within(table).getByRole("button", { name: /Chi tiết/ }))
    const detail = await screen.findByRole("dialog", { name: "Giao dịch FPT" })
    expect(within(detail).getByText("Mua do bộ lọc cũ")).toBeTruthy()
    expect(within(detail).getByRole("region", { name: "Dữ liệu chính sách cũ" }).textContent).toMatch(/Mốc cắt lỗ cũ.*90\.000 đ/)
    expect(detail.textContent).toMatch(/Nguồn mua lúc mở—/)
  })

  it("reaches the whole record by cursor: a page of 30, then «Tải thêm lịch sử» with the last id as cursor", async () => {
    const trades: BotTrade[] = Array.from({ length: 45 }, (_, index) => tradeFixture({ id: `t-${45 - index}`, symbol: `S${45 - index}` }))
    world.trades = trades
    const user = await openTab("Lịch sử")
    const table = await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 30)
    expect(queryOf(callsTo(world, "GET", "/bot/trades")[0]).get("limit")).toBe("30")
    expect(queryOf(callsTo(world, "GET", "/bot/trades")[0]).get("cursor")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Tải thêm lịch sử" }))
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Lịch sử giao dịch Bot" })).getAllByRole("row")).toHaveLength(1 + 45))
    expect(queryOf(callsTo(world, "GET", "/bot/trades")[1]).get("cursor")).toBe("t-16")
    expect(screen.queryByRole("button", { name: "Tải thêm lịch sử" })).toBeNull()
    expect(callsTo(world, "GET", "/bot/trades")).toHaveLength(2)
  })

  it("explains an empty record, pointing to Đang giữ for positions not sold yet", async () => {
    await openTab("Lịch sử")
    expect(await screen.findByText("Chưa có giao dịch đã chốt")).toBeTruthy()
    expect(screen.getByText(/Vị thế chưa bán nằm ở tab Đang giữ/)).toBeTruthy()
  })

  it("reports a failed read with a retry instead of an empty history", async () => {
    let failing = true
    world.override["GET /bot/trades"] = () => {
      if (failing) throw new FakeApiError("Máy chủ bận.", 503)
      return { items: [tradeFixture({ id: "t-1" })], next_cursor: null }
    }
    const user = await openTab("Lịch sử")
    expect(await screen.findByText("Máy chủ bận.")).toBeTruthy()
    expect(screen.queryByText("Chưa có giao dịch đã chốt")).toBeNull()
    failing = false
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("table", { name: "Lịch sử giao dịch Bot" })).toBeTruthy()
  })

  it("reads nothing until the tab is opened", async () => {
    renderBot(<PortfolioBlock disclosure={null} names={{}} />)
    await screen.findByRole("tab", { name: "Lịch sử" })
    expect(callsTo(world, "GET", "/bot/trades")).toHaveLength(0)
    expect(callsTo(world, "GET", "/bot/journal/sessions")).toHaveLength(0)
  })
})

describe("Nhật ký (GET /bot/journal/sessions)", () => {
  const buyDecision = (): BotSessionDecision =>
    decisionFixture({
      id: "d-1", trading_date: "2026-10-07", action: "buy", symbol: "FPT", reason_label: "Mua theo điều kiện Mua",
      execution: { id: "x-1", side: "buy", qty: 300, price_vnd: "98500", gross_value_vnd: "29550000", fee_vnd: "44325", tax_vnd: "0", net_cash_delta_vnd: "-29594325" },
      condition_snapshot: { rules: [{ id: "r1", indicator: "rsi", side: "buy", op: "<", lhs: 22.5, rhs: 30, result: true }] },
    })

  function seed() {
    world.sessions = [
      sessionFixture({
        session: "2026-10-07", config_revision: 4, universe: { kind: "custom", name: "Cổ phiếu ngân hàng", revision: 2 },
        counts: { buy: 1, sell: 0, hold: 0, skip: 29, total: 30 },
        reasons: [
          { action: "buy", reason_code: "buy_all_conditions_met", reason_label: "Mua theo điều kiện Mua", count: 1 },
          { action: "skip", reason_code: "buy_not_met", reason_label: "Điều kiện Mua chưa đạt", count: 28 },
          { action: "skip", reason_code: "no_data", reason_label: null, count: 1 },
        ],
        nav_end_vnd: "100250000", cash_end_vnd: "70655675",
      }),
      sessionFixture({ session: "2026-10-06" }),
    ]
    world.decisions["2026-10-07"] = [
      buyDecision(),
      decisionFixture({ id: "d-2", trading_date: "2026-10-07", action: "skip", symbol: "HPG" }),
      decisionFixture({ id: "d-3", trading_date: "2026-10-07", action: "skip", symbol: "MWG", reason_label: null, reason: "Thiếu dữ liệu giá" }),
    ]
  }

  it("shows one row per session from the server: source, config revision and the reason counts", async () => {
    seed()
    await openTab("Nhật ký")
    const table = await screen.findByRole("table", { name: "Nhật ký Bot theo phiên" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    const first = within(rows[0]!)
    expect(first.getByText("07/10/2026")).toBeTruthy()
    expect(first.getByText("Cổ phiếu ngân hàng · bản 2")).toBeTruthy()
    expect(first.getByText("Bản 4")).toBeTruthy()
    expect(first.getByText("Mua 1 · Điều kiện Mua chưa đạt ×28 · no_data")).toBeTruthy()
    const second = within(rows[1]!)
    expect(second.getByText("VN30")).toBeTruthy()
    expect(second.getByText("Không có quyết định")).toBeTruthy()
    expect(callsTo(world, "GET", "/bot/journal")).toHaveLength(0)
  })

  it("flags a run that is not a plain success and a session with notes, with text and not only colour", async () => {
    world.sessions = [
      sessionFixture({ session: "2026-10-07", run_status: "failed" }),
      sessionFixture({ session: "2026-10-06", run_status: "running" }),
      sessionFixture({ session: "2026-10-05", issues: [{ code: "missing_close", symbol: "VRE", detail: "Thiếu giá đóng cửa" }] }),
      sessionFixture({ session: "2026-10-02", universe: null, config_revision: null }),
    ]
    await openTab("Nhật ký")
    const table = await screen.findByRole("table", { name: "Nhật ký Bot theo phiên" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(within(rows[0]!).getByText("Lỗi xử lý")).toBeTruthy()
    expect(within(rows[1]!).getByText("Đang xử lý")).toBeTruthy()
    expect(within(rows[2]!).getByText("Có ghi chú")).toBeTruthy()
    const legacy = within(rows[3]!)
    expect(legacy.getAllByText("—")).toHaveLength(2)
  })

  it("fetches a session's decisions only when its row is opened, shows them with the server's labels and closes again", async () => {
    seed()
    const user = await openTab("Nhật ký")
    const table = await screen.findByRole("table", { name: "Nhật ký Bot theo phiên" })
    expect(callsTo(world, "GET", "/bot/journal/sessions/2026-10-07")).toHaveLength(0)

    const toggle = within(table).getByRole("button", { name: /07\/10\/2026/ })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    await user.click(toggle)
    const decisions = await screen.findByRole("region", { name: "Quyết định của phiên 07/10/2026" })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(callsTo(world, "GET", "/bot/journal/sessions/2026-10-07")).toHaveLength(1)

    const items = within(decisions).getAllByRole("listitem")
    expect(items).toHaveLength(3 + 1)
    expect(within(decisions).getByText("Mua theo điều kiện Mua")).toBeTruthy()
    expect(within(decisions).getByText("FPT", { selector: "strong" })).toBeTruthy()
    expect(within(decisions).getByText(/300 CP × 98\.500 đ/)).toBeTruthy()
    expect(within(decisions).getByText("Điều kiện Mua chưa đạt")).toBeTruthy()
    // A decision without a label shows the server's own text.
    expect(within(decisions).getByText("Thiếu dữ liệu giá")).toBeTruthy()
    // The rule evidence frozen with the decision, named with the indicator's name.
    expect(within(decisions).getByText("Mua · RSI r1: 22,5 < 30 — đạt")).toBeTruthy()

    // The session's own facts come from the row.
    expect(screen.getByText("100.250.000 đ")).toBeTruthy()
    expect(screen.getByText("70.655.675 đ")).toBeTruthy()

    await user.click(toggle)
    expect(screen.queryByRole("region", { name: "Quyết định của phiên 07/10/2026" })).toBeNull()
    await user.click(toggle)
    await screen.findByRole("region", { name: "Quyết định của phiên 07/10/2026" })
  })

  it("shows the notes and an incomplete valuation of an opened session", async () => {
    world.sessions = [
      sessionFixture({ session: "2026-10-07", nav_end_vnd: null, cash_end_vnd: null, valuation_complete: false, issues: [{ code: "missing_close", symbol: "VRE", detail: "Thiếu giá đóng cửa" }] }),
    ]
    world.decisions["2026-10-07"] = []
    const user = await openTab("Nhật ký")
    await user.click(await screen.findByRole("button", { name: /07\/10\/2026/ }))
    expect(await screen.findByText("Phiên này không có quyết định nào được ghi.")).toBeTruthy()
    expect(screen.getByText("VRE: Thiếu giá đóng cửa")).toBeTruthy()
    expect(screen.getByText(/chưa định giá đầy đủ/)).toBeTruthy()
  })

  it("pages a long session's decisions by cursor", async () => {
    world.sessions = [sessionFixture({ session: "2026-10-07", counts: { buy: 0, sell: 0, hold: 0, skip: 130, total: 130 } })]
    world.decisions["2026-10-07"] = Array.from({ length: 130 }, (_, index) => decisionFixture({ id: `d-${index}`, trading_date: "2026-10-07", action: "skip", symbol: `S${index}` }))
    const user = await openTab("Nhật ký")
    await user.click(await screen.findByRole("button", { name: /07\/10\/2026/ }))
    const region = await screen.findByRole("region", { name: "Quyết định của phiên 07/10/2026" })
    expect(within(region).getAllByRole("listitem")).toHaveLength(100)
    expect(queryOf(callsTo(world, "GET", "/bot/journal/sessions/2026-10-07")[0]).get("limit")).toBe("100")

    await user.click(screen.getByRole("button", { name: "Tải thêm quyết định" }))
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Quyết định của phiên 07/10/2026" })).getAllByRole("listitem")).toHaveLength(130))
    expect(queryOf(callsTo(world, "GET", "/bot/journal/sessions/2026-10-07")[1]).get("cursor")).toBe("d-99")
  })

  it("reaches every session by cursor: 30 per page, then «Tải thêm nhật ký» with the last session date", async () => {
    world.sessions = Array.from({ length: 35 }, (_, index) => sessionFixture({ session: dayOffset(index) }))
    const user = await openTab("Nhật ký")
    const table = await screen.findByRole("table", { name: "Nhật ký Bot theo phiên" })
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 30)
    expect(queryOf(callsTo(world, "GET", "/bot/journal/sessions")[0]).get("limit")).toBe("30")

    await user.click(screen.getByRole("button", { name: "Tải thêm nhật ký" }))
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Nhật ký Bot theo phiên" })).getAllByRole("row")).toHaveLength(1 + 35))
    expect(queryOf(callsTo(world, "GET", "/bot/journal/sessions")[1]).get("cursor")).toBe(dayOffset(29))
    expect(screen.queryByRole("button", { name: "Tải thêm nhật ký" })).toBeNull()
  })

  it("reports a failed decisions read inside the opened row, with a retry", async () => {
    seed()
    let failing = true
    world.override["GET /bot/journal/sessions/2026-10-07"] = () => {
      if (failing) throw new FakeApiError("Máy chủ bận.", 503)
      return { session: world.sessions[0], items: world.decisions["2026-10-07"], next_cursor: null }
    }
    const user = await openTab("Nhật ký")
    await user.click(await screen.findByRole("button", { name: /07\/10\/2026/ }))
    expect(await screen.findByText(/Không tải được quyết định của phiên: Máy chủ bận\./)).toBeTruthy()
    failing = false
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("region", { name: "Quyết định của phiên 07/10/2026" })).toBeTruthy()
  })

  it("explains an empty journal and a failed read", async () => {
    await openTab("Nhật ký")
    expect(await screen.findByText("Chưa có phiên xử lý")).toBeTruthy()
  })

  it("reports a failed sessions read instead of an empty journal", async () => {
    world.override["GET /bot/journal/sessions"] = () => {
      throw new FakeApiError("Máy chủ bận.", 503)
    }
    await openTab("Nhật ký")
    expect(await screen.findByText("Máy chủ bận.")).toBeTruthy()
    expect(screen.queryByText("Chưa có phiên xử lý")).toBeNull()
  })
})

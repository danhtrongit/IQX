import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BotPositionV2 } from "../api-v2"
import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, scheduledFixture, scheduleFixture, strategyContentFixture, type World } from "../test-support"
import type { BotPosition } from "../types"
import { BotMain } from "./bot-main"

const mocks = vi.hoisted(() => ({ api: vi.fn(), openAuth: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: mocks.openAuth }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("../../journey/mascot-2d/Mascot2DStage", () => ({
  Mascot2DStage: ({ mascotId }: { mascotId: string }) => <div data-testid="mascot-2d" data-mascot={mascotId} />,
}))
vi.mock("../../journey/visibility", () => ({ useStageVisibility: () => true, useReducedMotion: () => false }))

/** Normalised text of an element, like jest-dom's toHaveTextContent. */
function norm(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim()
}

let world: World

beforeEach(() => {
  world = createWorld()
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockReset())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

function position(partial: Partial<BotPositionV2> & Pick<BotPosition, "id" | "symbol">): BotPositionV2 {
  return {
    qty: 500, entry_price_vnd: "22550", current_close_vnd: "22500", market_value_vnd: "11250000", weight_pct: 11.2,
    unrealized_pnl_net_vnd: "-50000", opened_session: "2026-10-01", holding_sessions: 10, sector: null,
    entry_source_snapshot: { kind: "vn30", name: "VN30", revision: 1 }, entry_config_revision: 3, in_universe: true, source_scope: "in_buy_source",
    last_decision: null, legacy_stop_loss_vnd: null, legacy_take_profit_vnd: null, legacy_amplitude_at_entry_vnd: null, legacy_filter_ids: [],
    ...partial,
  } as BotPositionV2
}

const rsiSma = scheduledFixture({ id: "s1", name: "RSI + SMA20" })

describe("Bot main (v2.0 §5.2–§5.3)", () => {
  it("shows the KPIs, the mascot with the new tagline and only the strategy/holdings chips; no state chip, no switch", async () => {
    renderBot(<BotMain mascotId="kim_quy" />)
    expect((await screen.findAllByText("100.000.000 đ")).length).toBeGreaterThan(0)
    expect(screen.getByText("Học kiến thức. Chọn chiến lược cho Bot.")).toBeTruthy()
    expect(await screen.findByText("Chiến lược: chưa chọn")).toBeTruthy()
    expect(screen.getByText("0 mã đang giữ")).toBeTruthy()
    expect(screen.queryByText("Đã bật Mua và Bán")).toBeNull()
    expect(screen.queryByTestId("bot-state-chip")).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByText(/Điều kiện mua/i)).toBeNull()
  })

  it("Lịch phiên without a strategy: both rows say so and point to the list on the right (B13)", async () => {
    renderBot(<BotMain mascotId="kim_quy" />)
    const last = await screen.findByTestId("schedule-last")
    expect(norm(last)).toContain("Phiên gần nhất")
    expect(norm(last)).toContain("Thứ 6 06/11")
    expect(norm(last)).toContain("Chưa chọn chiến lược")
    expect(norm(screen.getByTestId("schedule-next"))).toContain("Thứ 2 09/11Chưa chọn chiến lược · chọn ở danh sách bên phải")
  })

  it("same strategy and version on both rows reads «không đổi» with no action (B03)", async () => {
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...rsiSma, session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    renderBot(<BotMain mascotId="kim_quy" />)
    const next = await screen.findByTestId("schedule-next")
    expect(norm(next)).toContain("RSI + SMA20· bản 05/11 20:02không đổi")
    expect(within(next).queryByRole("button")).toBeNull()
    expect(norm(screen.getByText("Chiến lược:", { exact: false }))).toContain("Chiến lược: RSI + SMA20")
  })

  it("a different next version reads «có thay đổi»; Xem khác biệt lists Rổ mã, Giữ tối đa and rows removed/added (B03)", async () => {
    const changed = { ...rsiSma, version: 3, version_label: "bản 08/11 13:47", content: strategyContentFixture({ max_holding: 10, universe: { type: "vn100" }, indicators: {} }) }
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...changed, session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    const next = await screen.findByTestId("schedule-next")
    expect(norm(next)).toContain("có thay đổi")
    await user.click(within(next).getByRole("button", { name: "Xem khác biệt" }))
    const dialog = await screen.findByRole("dialog", { name: "Khác biệt giữa hai bản" })
    expect(norm(dialog)).toContain("RSI + SMA20 · bản 05/11 20:02 → RSI + SMA20 · bản 08/11 13:47")
    expect(norm(dialog)).toContain("Rổ mã: VN30 → VN100")
    expect(norm(dialog)).toContain("Giữ tối đa: 30 phiên → 10 phiên")
    await waitFor(() => expect(within(dialog).getByText(/^RSI: /, { selector: "del" })).toBeTruthy())
  })

  it("«Hai bản giống nhau về điều kiện.» when only the version differs", async () => {
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...rsiSma, version: 3, version_label: "bản 08/11 13:47", session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    await user.click(await screen.findByRole("button", { name: "Xem khác biệt" }))
    expect(await screen.findByText("Hai bản giống nhau về điều kiện.")).toBeTruthy()
  })

  it("Giữ như phiên gần nhất with no due position: confirm, POST keep-last with the next session, toast (B03)", async () => {
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...rsiSma, id: "s2", name: "MACD", session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    await user.click(await screen.findByRole("button", { name: "Giữ như phiên gần nhất" }))
    const dialog = await screen.findByRole("dialog", { name: "Giữ như phiên gần nhất?" })
    expect(norm(dialog)).toContain("Phiên Thứ 2 09/11 dùng RSI + SMA20 · bản 05/11 20:02.")
    const confirm = within(dialog).getByRole("button", { name: "Giữ như phiên gần nhất" })
    await waitFor(() => expect((confirm) as HTMLButtonElement).toHaveProperty("disabled", false))
    await user.click(confirm)
    await waitFor(() => expect(callsTo(world, "POST", "/bot/schedule/next/keep-last")).toHaveLength(1))
    expect(callsTo(world, "POST", "/bot/schedule/next/keep-last")[0].body).toEqual({ expected_next_session: "2026-11-09" })
    expect(mocks.toast.success).toHaveBeenCalledWith("Phiên tới giữ như phiên gần nhất.")
    expect(norm(await screen.findByTestId("schedule-next"))).toContain("không đổi")
  })

  it("lowering Giữ tối đa lists the due positions; the button stays off until ticked and the list is sent (B04)", async () => {
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...rsiSma, id: "s2", name: "MACD", session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    world.impactPositions = [{ symbol: "HDB", counted: 12, sell_session: "2026-11-09" }, { symbol: "MSN", counted: 11, sell_session: "2026-11-09" }]
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    await user.click(await screen.findByRole("button", { name: "Giữ như phiên gần nhất" }))
    const dialog = await screen.findByRole("dialog", { name: "Giữ như phiên gần nhất?" })
    const block = await within(dialog).findByTestId("due-impact")
    expect(norm(block)).toContain("2 vị thế sẽ được bán ở phiên Thứ 2 09/11 vì đã giữ từ 10 phiên trở lên: HDB (12 phiên), MSN (11 phiên).")
    const confirm = within(dialog).getByRole("button", { name: "Giữ như phiên gần nhất" })
    expect((confirm) as HTMLButtonElement).toHaveProperty("disabled", true)
    await user.click(within(dialog).getByRole("checkbox", { name: "Tôi hiểu các vị thế trên sẽ được bán." }))
    expect((confirm) as HTMLButtonElement).toHaveProperty("disabled", false)
    await user.click(confirm)
    await waitFor(() => expect(callsTo(world, "POST", "/bot/schedule/next/keep-last")).toHaveLength(1))
    expect(callsTo(world, "POST", "/bot/schedule/next/keep-last")[0].body).toEqual({ expected_next_session: "2026-11-09", confirm_due_positions: ["HDB", "MSN"] })
  })

  it("a due list that changed between reading and saving is shown again, unticked (B05)", async () => {
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...rsiSma, id: "s2", name: "MACD", session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    world.impactPositions = [{ symbol: "HDB", counted: 12, sell_session: "2026-11-09" }]
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    await user.click(await screen.findByRole("button", { name: "Giữ như phiên gần nhất" }))
    const dialog = await screen.findByRole("dialog", { name: "Giữ như phiên gần nhất?" })
    await within(dialog).findByTestId("due-impact")
    world.impactPositions = [{ symbol: "HDB", counted: 12, sell_session: "2026-11-09" }, { symbol: "TCB", counted: 10, sell_session: "2026-11-09" }]
    await user.click(within(dialog).getByRole("checkbox"))
    await user.click(within(dialog).getByRole("button", { name: "Giữ như phiên gần nhất" }))
    expect(await within(dialog).findByText("Danh sách vị thế đến hạn vừa thay đổi. Kiểm tra lại trước khi xác nhận.")).toBeTruthy()
    expect(norm(within(dialog).getByTestId("due-impact"))).toContain("HDB (12 phiên), TCB (10 phiên)")
    expect((within(dialog).getByRole("checkbox")).getAttribute("aria-checked")).toBe("false")
    expect((within(dialog).getByRole("button", { name: "Giữ như phiên gần nhất" })) as HTMLButtonElement).toHaveProperty("disabled", true)
  })

  it("a save that races the cutoff (409 SCHEDULE_SESSION_LOCKED) reloads the schedule and says from which session it applies", async () => {
    world.schedule = scheduleFixture({ last: rsiSma, next: { ...rsiSma, id: "s2", name: "MACD", session_date: "2026-11-09", follow_latest: true, cutoff_at: null } })
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    await user.click(await screen.findByRole("button", { name: "Giữ như phiên gần nhất" }))
    const dialog = await screen.findByRole("dialog", { name: "Giữ như phiên gần nhất?" })
    await waitFor(() => expect((within(dialog).getByRole("button", { name: "Giữ như phiên gần nhất" })) as HTMLButtonElement).toHaveProperty("disabled", false))
    world.schedule = { ...world.schedule, last: { ...world.schedule.next, session_date: "2026-11-09" } as typeof rsiSma, next: { ...world.schedule.next, session_date: "2026-11-10" } }
    await user.click(within(dialog).getByRole("button", { name: "Giữ như phiên gần nhất" }))
    expect(await within(dialog).findByText("Phiên Thứ 2 09/11 vừa chốt. Thay đổi áp dụng từ phiên Thứ 3 10/11.")).toBeTruthy()
    expect(norm(dialog)).toContain("Phiên Thứ 3 10/11 dùng")
  })

  it("an IQX strategy with a newer version shows the box; Cập nhật pins the new version from the next session (B07)", async () => {
    const iqx = scheduledFixture({ id: "iqx-1", name: "Theo xu hướng", source: "iqx", version: 1, version_label: "v1" })
    world.schedule = scheduleFixture({ last: iqx, next: { ...iqx, session_date: "2026-11-09", follow_latest: false, cutoff_at: null }, iqx_update: { latest_version: 2, content: strategyContentFixture({ max_holding: 40 }) } })
    world.strategyOptions = { iqx: [{ id: "iqx-1", slug: "xu-huong", name: "Theo xu hướng", version: 2, universe_label: "VN30", max_holding: 40, hidden: false, on_bot: { last: true, next: true } }], mine: [] }
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    const box = await screen.findByTestId("iqx-update")
    expect(norm(box)).toContain("Chiến lược IQX · Theo xu hướng có bản v2.")
    await user.click(within(box).getByRole("button", { name: "Cập nhật từ phiên Thứ 2 09/11" }))
    const dialog = await screen.findByRole("dialog", { name: "Cập nhật Chiến lược IQX · Theo xu hướng lên v2?" })
    const confirm = within(dialog).getByRole("button", { name: "Cập nhật" })
    await waitFor(() => expect((confirm) as HTMLButtonElement).toHaveProperty("disabled", false))
    await user.click(confirm)
    await waitFor(() => expect(callsTo(world, "PUT", "/bot/schedule/next")).toHaveLength(1))
    expect(callsTo(world, "PUT", "/bot/schedule/next")[0].body).toEqual({ source: "iqx", id: "iqx-1", version: 2, expected_next_session: "2026-11-09" })
    expect(mocks.toast.success).toHaveBeenCalledWith("Bot dùng v2 từ phiên Thứ 2 09/11.")
  })
})

describe("Đang giữ (v2.0 §5.5, B10)", () => {
  it("shows Đã giữ counted / N with Thực giữ and the four sell states", async () => {
    world.schedule = scheduleFixture({ last: rsiSma })
    world.positions = [
      position({ id: "p1", symbol: "HDB", counted: 11, held: 34, max_holding: 30, sell_state: "sellable", due_session: "2026-11-25", anchor_session: "2026-10-23", entry_session: "2026-09-18", anchor_reason: "policy_cutover", sellable_from_session: "2026-09-22" }),
      position({ id: "p2", symbol: "SHB", counted: 1, held: 1, max_holding: 30, sell_state: "t2_wait", sellable_from_session: "2026-11-10" }),
      position({ id: "p3", symbol: "ACB", counted: 30, held: 30, max_holding: 30, sell_state: "due" }),
      position({ id: "p4", symbol: "KDH", counted: 30, held: 52, max_holding: 30, sell_state: "due_unfilled", sell_state_detail: "Tạm ngừng giao dịch", in_universe: false }),
    ]
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    const table = await screen.findByRole("table", { name: "Vị thế Bot đang giữ" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(norm(within(rows[0]).getByTestId("held-cell"))).toContain("11 / 30 phiênThực giữ 34 phiên")
    expect(norm(within(rows[0]).getByTestId("sell-state"))).toContain("Có thể bánĐến hạn 25/11")
    expect(norm(within(rows[1]).getByTestId("held-cell"))).toMatch(/^1 \/ 30 phiên$/)
    expect(norm(within(rows[1]).getByTestId("sell-state"))).toContain("Chờ T+2Bán được từ 10/11")
    expect(norm(within(rows[2]).getByTestId("sell-state"))).toContain("Đến hạnBán ở phiên xử lý kế tiếp")
    expect(norm(within(rows[3]).getByTestId("sell-state"))).toContain("Đến hạn, chưa khớpTạm ngừng giao dịch")
    expect(norm(rows[3])).toContain("Ngoài nguồn mua")
    expect(norm(rows[0])).toContain("Trong nguồn mua")

    await user.click(within(rows[0]).getByRole("button", { name: "Chi tiết vị thế HDB" }))
    const detail = await screen.findByRole("dialog", { name: "HDB · chi tiết vị thế" })
    for (const text of ["Phiên mua18/09/2026", "Bán được từ (T+2)22/09/2026", "Đã giữ34 phiên", "Mốc tính hạn23/10/2026 (phiên áp dụng giới hạn)", "Giới hạn30 phiên · RSI + SMA20", "Đến hạn25/11/2026", "Nguồn mua lúc mởVN30"]) {
      expect(norm(detail)).toContain(text)
    }
  })

  it("uses N = 30 and «mặc định» without a strategy, and no Mốc tính hạn when the anchor is the entry", async () => {
    world.positions = [position({ id: "p1", symbol: "FPT", counted: 5, held: 5, entry_session: "2026-11-01", anchor_session: "2026-11-01", sell_state: "sellable" })]
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    const table = await screen.findByRole("table", { name: "Vị thế Bot đang giữ" })
    expect(norm(within(table).getByTestId("held-cell"))).toMatch(/^5 \/ 30 phiên$/)
    await user.click(within(table).getByRole("button", { name: "Chi tiết vị thế FPT" }))
    const detail = await screen.findByRole("dialog", { name: "FPT · chi tiết vị thế" })
    expect(norm(detail)).toContain("Giới hạn30 phiên · mặc định")
    expect(norm(detail)).not.toContain("Mốc tính hạn")
  })

  it("Nguyên tắc Bot lists exactly the §5.7 labels (B14)", async () => {
    const user = userEvent.setup()
    renderBot(<BotMain mascotId="kim_quy" />)
    await user.click(await screen.findByRole("button", { name: "Nguyên tắc Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Nguyên tắc Bot" })
    const labels = within(dialog).getAllByRole("term").map((term) => term.textContent)
    expect(labels).toEqual([
      "Vốn khởi tạo", "Chiến lược", "Nguồn mua mới", "Mua", "Bán", "Giữ tối đa", "Ngân sách mỗi lần mua", "Mua mới mỗi phiên",
      "Tỷ trọng khi mua", "Mã đang nắm giữ", "Khớp lệnh", "Thanh toán", "Đổi chiến lược", "Cắt lỗ / chốt lời tự động", "Thông báo",
    ])
    expect(norm(dialog)).toContain("T+2 · cổ phiếu mua phiên T bán được từ phiên T+2")
    expect(norm(dialog)).not.toContain("Luyện tập")
  })

  it("opens Lịch sử from a `bot_tab=lich-su` link (the bell's Bot notification, T09)", async () => {
    renderBot(<BotMain mascotId="kim_quy" />, "/luyen-tap?tool=bot&bot_tab=lich-su")
    expect(await screen.findByRole("tab", { name: "Lịch sử", selected: true })).toBeTruthy()
    await waitFor(() => expect(norm(screen.getByTestId("location"))).not.toContain("bot_tab"))
  })

  it("only reads: no write on load", async () => {
    renderBot(<BotMain mascotId="kim_quy" />)
    await screen.findByTestId("bot-schedule")
    expect(world.calls.filter((call) => call.method !== "GET")).toEqual([])
  })
})

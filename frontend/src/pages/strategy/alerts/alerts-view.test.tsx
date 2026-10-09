import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import { callsTo, savedList } from "../../demo-trading/bot/test-support"
import { alertView, createStrategyApi, createStrategyWorld, eventView, FakeApiError, LIST_ID, T0, type StrategyWorld } from "../test-support"
import { AlertsView } from "./alerts-view"

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
  for (const id of ["macd", "ma"]) {
    const config = world.indicators[id]!
    config.master_enabled = true
    config.buy.enabled = true
    config.sell.enabled = true
  }
  mocks.api.mockReset()
  mocks.api.mockImplementation(createStrategyApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

const posts = () => callsTo(world, "POST", "/strategy/alerts")
const patches = () => world.calls.filter((call) => call.method === "PATCH")

async function renderView() {
  render(<AlertsView />, "/chien-luoc?tab=canh-bao")
  await screen.findByRole("heading", { name: "Cảnh báo đang theo dõi" })
}

function seedAlerts() {
  world.alerts = [
    alertView(),
    alertView({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      name: "FPT · Điều kiện Mua",
      enabled: false,
      status: "paused",
      paused_at: T0,
      last_check: { session: null, evaluated_at: null, pairs_expected: 0, pairs_checked: 0, satisfied: 0, not_satisfied: 0, unknown: 0, blocked: 0 },
      version: { ...alertView().version, symbols: ["FPT"], sides: ["buy"] },
    }),
  ]
}

describe("alerts table", () => {
  it("shows an empty state with a way to create the first alert", async () => {
    await renderView()
    expect(await screen.findByText("Chưa có cảnh báo")).toBeTruthy()
    expect(screen.getByTestId("alerts-summary").textContent).toBe("Chưa có cảnh báo nào")
  })

  it("lists name, scope, sides, pinned versions, status and last check of each alert", async () => {
    seedAlerts()
    await renderView()
    const table = await screen.findByRole("table", { name: "Cảnh báo đang theo dõi" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain("Theo dõi xu hướng")
    expect(rows[0]!.textContent).toContain("2 mã")
    expect(rows[0]!.textContent).toContain("FPT · VNM")
    expect(rows[0]!.textContent).toContain("MuaBán")
    expect(rows[0]!.textContent).toContain("Cấu hình bản 3 · Cảnh báo v1")
    expect(rows[0]!.textContent).toContain("Đang theo dõi")
    expect(rows[0]!.textContent).toContain("Đã kiểm tra 07/10/2026")
    expect(rows[1]!.textContent).toContain("Một mã")
    expect(rows[1]!.textContent).toContain("Tạm dừng")
    expect(rows[1]!.textContent).toContain("Chưa có lần kiểm tra")
    expect(screen.getByTestId("alerts-summary").textContent).toBe("2 cảnh báo · 1 đang theo dõi · kiểm tra gần nhất phiên 07/10/2026")
  })

  it("labels the five states apart: watching, paused, unchecked, waiting for data, config or permission error", async () => {
    world.alerts = (["watching", "paused", "unchecked", "waiting_data", "config_error"] as const).map((status, index) =>
      alertView({ id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${index + 1}`, name: `Cảnh báo ${status}`, status, enabled: status !== "paused" }),
    )
    await renderView()
    const table = await screen.findByRole("table", { name: "Cảnh báo đang theo dõi" })
    const text = within(table).getAllByRole("row").slice(1).map((row) => row.textContent ?? "")
    expect(text[0]).toContain("Đang theo dõi")
    expect(text[1]).toContain("Tạm dừng")
    expect(text[2]).toContain("Chưa kiểm tra")
    expect(text[3]).toContain("Chờ dữ liệu")
    expect(text[4]).toContain("Lỗi cấu hình/quyền")
  })

  it("pauses and resumes with a switch that only sets enabled, without touching conditions", async () => {
    const user = userEvent.setup()
    seedAlerts()
    await renderView()
    const toggle = await screen.findByRole("switch", { name: "Bật hoặc tạm dừng Theo dõi xu hướng" })
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    await user.click(toggle)
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]!.body).toEqual({ enabled: false })
    await waitFor(() => expect(screen.getByRole("switch", { name: "Bật hoặc tạm dừng Theo dõi xu hướng" }).getAttribute("aria-checked")).toBe("false"))
    expect(within(screen.getByRole("table", { name: "Cảnh báo đang theo dõi" })).getAllByText("Tạm dừng")).toHaveLength(2)
    expect(mocks.toast.success.mock.calls[0]![0]).toMatch(/Cấu hình chỉ báo và Bot được giữ nguyên/)
  })

  it("deletes only after a confirmation that says the history is kept", async () => {
    const user = userEvent.setup()
    seedAlerts()
    await renderView()
    await user.click(await screen.findByRole("button", { name: "Xóa cảnh báo Theo dõi xu hướng" }))
    const dialog = await screen.findByRole("dialog", { name: "Xóa cảnh báo?" })
    expect(dialog.textContent).toMatch(/Lịch sử tín hiệu và các phiên bản đã ghim được giữ lại/)
    expect(world.calls.some((call) => call.method === "DELETE")).toBe(false)
    await user.click(within(dialog).getByRole("button", { name: "Xóa cảnh báo" }))
    await waitFor(() => expect(world.alerts).toHaveLength(1))
    expect(world.calls.some((call) => call.method === "DELETE")).toBe(true)
  })

  it("explains a feature that is switched off instead of a blank tab", async () => {
    world.override["GET /strategy/alerts"] = () => {
      throw new FakeApiError("Tính năng chiến lược v2 chưa được bật.", 404, { code: "FEATURE_DISABLED" })
    }
    render(<AlertsView />, "/chien-luoc?tab=canh-bao")
    expect(await screen.findByText("Tính năng chưa được bật")).toBeTruthy()
  })
})

describe("create and edit", () => {
  it("creates a Sell-only alert from the saved config on a symbol, pinning exactly the chosen revision", async () => {
    const user = userEvent.setup()
    await renderView()
    await user.click(screen.getAllByRole("button", { name: "Tạo cảnh báo" })[0]!)
    const dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    await user.type(within(dialog).getByLabelText("Tên cảnh báo"), "Chỉ bán FPT")
    expect([...(within(dialog).getByLabelText("Nguồn cấu hình") as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(["Cấu hình của kết quả kiểm thử", "Cấu hình chung đã lưu"])
    await within(dialog).findByText(/Cấu hình chung bản 3/)
    expect((within(dialog).getByLabelText("Bản cấu hình chung") as HTMLSelectElement).value).toBe("3")
    await user.selectOptions(within(dialog).getByLabelText("Bản cấu hình chung"), "2")
    await within(dialog).findByText(/Cấu hình chung bản 2/)

    await user.type(within(dialog).getByLabelText("Mã theo dõi"), "fpt{Enter}")
    expect(within(dialog).getByText("FPT")).toBeTruthy()
    await user.click(within(dialog).getByRole("checkbox", { name: "Điều kiện Mua" }))
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]!.body).toMatchObject({
      name: "Chỉ bán FPT",
      source: { kind: "shared_config", revision: 2 },
      scope: { kind: "symbols", symbols: ["FPT"] },
      sides: ["sell"],
      enabled: true,
    })
    expect(String((posts()[0]!.body as { idempotency_key: string }).idempotency_key).length).toBeGreaterThanOrEqual(8)
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    expect(String(mocks.toast.success.mock.calls[0]![0])).toMatch(/Cấu hình Bot và danh mục mua mới không đổi/)
    const table = await screen.findByRole("table", { name: "Cảnh báo đang theo dõi" })
    await waitFor(() => expect(table.textContent).toContain("Chỉ bán FPT"))
    expect(table.textContent).toContain("Cấu hình chung · bản 2")
  })

  it("only allows the sides the pinned source really has: no Sell box when the source has no Sell condition", async () => {
    const user = userEvent.setup()
    for (const id of ["macd", "ma"]) world.indicators[id]!.sell.enabled = false
    await renderView()
    await user.click(screen.getAllByRole("button", { name: "Tạo cảnh báo" })[0]!)
    const dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    await within(dialog).findByText(/Bán: chưa có điều kiện hợp lệ/)
    const sell = within(dialog).getByRole("checkbox", { name: /Điều kiện Bán/ })
    expect(sell.hasAttribute("disabled") || sell.getAttribute("aria-disabled") === "true" || sell.getAttribute("data-disabled") !== null).toBe(true)
    expect(within(dialog).getByText(/chưa có điều kiện Bán hợp lệ/)).toBeTruthy()
    await user.type(within(dialog).getByLabelText("Tên cảnh báo"), "Chỉ mua")
    await user.type(within(dialog).getByLabelText("Mã theo dõi"), "VNM{Enter}")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect((posts()[0]!.body as { sides: string[] }).sides).toEqual(["buy"])
  })

  it("never creates an active alert when no side is valid", async () => {
    const user = userEvent.setup()
    for (const id of Object.keys(world.indicators)) world.indicators[id]!.master_enabled = false
    await renderView()
    await user.click(screen.getAllByRole("button", { name: "Tạo cảnh báo" })[0]!)
    const dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    await user.type(within(dialog).getByLabelText("Tên cảnh báo"), "Rỗng")
    await user.type(within(dialog).getByLabelText("Mã theo dõi"), "FPT{Enter}")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    expect(await within(dialog).findByText("Chọn ít nhất một phía có điều kiện hợp lệ.")).toBeTruthy()
    expect(posts()).toHaveLength(0)
  })

  it("validates the name and the symbols before sending and keeps the draft on a server refusal", async () => {
    const user = userEvent.setup()
    world.alerts = [alertView({ name: "Trùng tên" })]
    await renderView()
    await user.click(screen.getAllByRole("button", { name: "Tạo cảnh báo" })[0]!)
    const dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    await within(dialog).findByText(/Cấu hình chung bản 3/)
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    expect(await within(dialog).findByText("Nhập tên cảnh báo.")).toBeTruthy()
    await user.type(within(dialog).getByLabelText("Tên cảnh báo"), "Trùng tên")
    await user.type(within(dialog).getByLabelText("Mã theo dõi"), "<b>x</b>")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    expect(await within(dialog).findByText(/Mã không hợp lệ/)).toBeTruthy()
    await user.clear(within(dialog).getByLabelText("Mã theo dõi"))
    await user.type(within(dialog).getByLabelText("Mã theo dõi"), "FPT{Enter}")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    expect(await within(dialog).findByText("Tên cảnh báo đã tồn tại.")).toBeTruthy()
    expect((within(dialog).getByLabelText("Tên cảnh báo") as HTMLInputElement).value).toBe("Trùng tên")
    expect(world.alerts).toHaveLength(1)
  })

  it("asks before a changed draft is thrown away with Hủy", async () => {
    const user = userEvent.setup()
    await renderView()
    await user.click(screen.getAllByRole("button", { name: "Tạo cảnh báo" })[0]!)
    const dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    await user.type(within(dialog).getByLabelText("Tên cảnh báo"), "Nháp")
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    expect(await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Tiếp tục chỉnh sửa" }))
    expect((within(dialog).getByLabelText("Tên cảnh báo") as HTMLInputElement).value).toBe("Nháp")
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    await user.click(await screen.findByRole("button", { name: "Bỏ thay đổi" }))
    expect(screen.queryByRole("dialog", { name: "Tạo cảnh báo" })).toBeNull()
    expect(posts()).toHaveLength(0)
  })

  it("renaming keeps the pinned version: only the name is sent, no source, no version", async () => {
    const user = userEvent.setup()
    seedAlerts()
    await renderView()
    await user.click(await screen.findByRole("button", { name: /Chỉnh Theo dõi xu hướng/ }))
    const dialog = await screen.findByRole("dialog", { name: "Chỉnh cảnh báo" })
    expect((within(dialog).getByLabelText("Nguồn cấu hình") as HTMLSelectElement).value).toBe("keep")
    expect([...(within(dialog).getByLabelText("Nguồn cấu hình") as HTMLSelectElement).options][0]!.textContent).toBe("Giữ cấu hình đang theo dõi")
    const name = within(dialog).getByLabelText("Tên cảnh báo")
    await user.clear(name)
    await user.type(name, "Xu hướng FPT VNM")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]!.body).toEqual({ name: "Xu hướng FPT VNM" })
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    expect(world.alerts[0]!.current_version).toBe(1)
  })

  it("changing the scope creates a new definition version with the expected version and the new symbols", async () => {
    const user = userEvent.setup()
    seedAlerts()
    await renderView()
    await user.click(await screen.findByRole("button", { name: /Chỉnh Theo dõi xu hướng/ }))
    const dialog = await screen.findByRole("dialog", { name: "Chỉnh cảnh báo" })
    await user.click(within(dialog).getByRole("button", { name: "Bỏ mã VNM" }))
    await user.type(within(dialog).getByLabelText("Mã theo dõi"), "HPG{Enter}")
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]!.body).toEqual({ scope: { kind: "symbols", symbols: ["FPT", "HPG"] }, expected_version: 1 })
    await waitFor(() => expect(world.alerts[0]!.current_version).toBe(2))
    expect(await screen.findByText("Cảnh báo v2", { exact: false })).toBeTruthy()
  })

  it("watches a saved list with a chosen subset, and keeps the pinned symbols when its list is gone", async () => {
    const user = userEvent.setup()
    world.lists = [savedList(LIST_ID, "Cổ phiếu tăng trưởng", ["FPT", "HPG", "CMG"])]
    await renderView()
    await user.click(screen.getAllByRole("button", { name: "Tạo cảnh báo" })[0]!)
    let dialog = await screen.findByRole("dialog", { name: "Tạo cảnh báo" })
    await user.type(within(dialog).getByLabelText("Tên cảnh báo"), "Danh mục theo dõi")
    await user.selectOptions(within(dialog).getByLabelText("Phạm vi"), `list:${LIST_ID}`)
    await user.click(within(dialog).getByRole("checkbox", { name: "CMG" }))
    await within(dialog).findByText(/Cấu hình chung bản 3/)
    await user.click(within(dialog).getByRole("button", { name: "Lưu cảnh báo" }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]!.body).toMatchObject({ scope: { kind: "saved_list", list_id: LIST_ID, symbols: ["FPT", "HPG"] } })
    await waitFor(() => expect(screen.getByRole("table", { name: "Cảnh báo đang theo dõi" }).textContent).toContain("Danh mục: Cổ phiếu tăng trưởng"))
    // The list is deleted afterwards: the alert keeps its pinned symbols and never changes by itself.
    world.lists = []
    await user.click(await screen.findByRole("button", { name: /Chỉnh Danh mục theo dõi/ }))
    dialog = await screen.findByRole("dialog", { name: "Chỉnh cảnh báo" })
    expect(await within(dialog).findByText(/Danh mục nguồn đã bị xóa/)).toBeTruthy()
    expect(within(dialog).getByText("FPT · HPG")).toBeTruthy()
  })
})

describe("signal history", () => {
  beforeEach(() => {
    seedAlerts()
    world.events = [
      eventView(),
      eventView({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", symbol: "FPT", side: "sell", side_label: "Bán", message: "Thỏa điều kiện Bán", event_kind: "first_observation", event_kind_label: "Đang thỏa ở lần kiểm tra đầu", signal_session: "2026-10-06", previous_valid_result: null, previous_valid_session: null }),
    ]
  })

  it("lists session, symbol, 'Thỏa điều kiện Mua/Bán', alert name, version and a way to open the conditions", async () => {
    await renderView()
    const table = await screen.findByRole("table", { name: "Tín hiệu đã ghi nhận" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain("07/10/2026")
    expect(rows[0]!.textContent).toContain("HPG")
    expect(rows[0]!.textContent).toContain("Thỏa điều kiện Mua")
    expect(rows[0]!.textContent).toContain("Theo dõi xu hướng")
    expect(rows[0]!.textContent).toContain("Bản 3 · CB v1")
    expect(rows[1]!.textContent).toContain("Thỏa điều kiện Bán")
    expect(rows[1]!.textContent).toContain("Đang thỏa ở lần kiểm tra đầu")
    expect(screen.getByTestId("history-meta").textContent).toBe("2 tín hiệu")
    expect(document.body.textContent).not.toMatch(/Bot đã (mua|bán)|Lệnh đã khớp/)
  })

  it("filters by side on the server and keeps the whole history reachable page by page", async () => {
    const user = userEvent.setup()
    world.events = Array.from({ length: 30 }, (_unused, index) => eventView({ id: `eeeeeeee-eeee-4eee-8eee-${String(index + 1).padStart(12, "0")}`, symbol: `S${index}`, side: index % 2 === 0 ? "buy" : "sell", side_label: index % 2 === 0 ? "Mua" : "Bán", message: index % 2 === 0 ? "Thỏa điều kiện Mua" : "Thỏa điều kiện Bán" }))
    await renderView()
    await screen.findByRole("table", { name: "Tín hiệu đã ghi nhận" })
    expect(screen.getByTestId("history-meta").textContent).toBe("30 tín hiệu")
    expect(within(screen.getByRole("table", { name: "Tín hiệu đã ghi nhận" })).getAllByRole("row").slice(1)).toHaveLength(25)
    await user.click(screen.getByRole("button", { name: "Trang sau" }))
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Tín hiệu đã ghi nhận" })).getAllByRole("row").slice(1)).toHaveLength(5))
    await user.selectOptions(screen.getByLabelText("Lọc loại tín hiệu"), "sell")
    await waitFor(() => expect(screen.getByTestId("history-meta").textContent).toBe("15 tín hiệu"))
    const eventCalls = callsTo(world, "GET", "/strategy/alerts/events")
    expect(eventCalls.length).toBeGreaterThanOrEqual(3)
    const rows = within(screen.getByRole("table", { name: "Tín hiệu đã ghi nhận" })).getAllByRole("row").slice(1)
    expect(rows.every((row) => (row.textContent ?? "").includes("Thỏa điều kiện Bán"))).toBe(true)
  })

  it("opens the recorded evidence: values, operator, params and the pinned config of that version", async () => {
    const user = userEvent.setup()
    await renderView()
    await user.click((await screen.findAllByRole("button", { name: /Xem điều kiện HPG/ }))[0]!)
    const dialog = await screen.findByRole("dialog", { name: /HPG · Thỏa điều kiện Mua/ })
    expect(dialog.textContent).toMatch(/Tín hiệu mới: trước đó chưa thỏa điều kiện/)
    expect(dialog.textContent).toMatch(/không phải lệnh và không phải giao dịch của Bot/)
    expect(dialog.textContent).toMatch(/fast 12 · slow 26 · signal 9/)
    expect(dialog.textContent).toMatch(/Mở 27\.000 · Cao 27\.800 · Thấp 26\.900 · Đóng 27\.650/)
    const table = within(dialog).getByRole("table", { name: "Điều kiện tại phiên tín hiệu" })
    const row = within(table).getAllByRole("row")[1]!
    expect(row.textContent).toContain("MACD")
    expect(row.textContent).toContain("0,42")
    expect(row.textContent).toContain("Đường tín hiệu")
    expect(row.textContent).toContain(">")
    expect(row.textContent).toContain("0,31")
    expect(row.textContent).toContain("Đạt")
    await waitFor(() => expect(dialog.textContent).toMatch(/Bản 3 · Cảnh báo v1/))
  })

  it("keeps the name and evidence recorded at emission after the alert is renamed", async () => {
    const user = userEvent.setup()
    world.alerts = [alertView({ name: "Tên mới" })]
    await renderView()
    const table = await screen.findByRole("table", { name: "Tín hiệu đã ghi nhận" })
    expect(within(table).getAllByRole("row")[1]!.textContent).toContain("Theo dõi xu hướng")
    expect(within(table).getAllByRole("row")[1]!.textContent).not.toContain("Tên mới")
    await user.click((await screen.findAllByRole("button", { name: /Xem điều kiện HPG/ }))[0]!)
    expect((await screen.findByRole("dialog", { name: /HPG/ })).textContent).toContain("Theo dõi xu hướng")
  })
})

describe("legacy alerts", () => {
  it("keeps the old alerts and Telegram in a separate, closed section that loads only when opened", async () => {
    const user = userEvent.setup()
    await renderView()
    const section = screen.getByRole("region", { name: "Cảnh báo cũ" })
    expect(within(section).getByRole("button", { name: /Cảnh báo cũ/ }).getAttribute("aria-expanded")).toBe("false")
    expect(within(section).queryAllByText("Kết nối Telegram")).toHaveLength(0)
    expect(world.calls.some((call) => call.path.startsWith("/alerts/"))).toBe(false)
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/alerts/rules")) return { items: [{ id: "r1", name: "Pullback cũ", side: "buy", base_signal_key: "pullback", combination: { logic: "AND", conditions: [{ indicator: "rsi_14", op: "<", value: 45 }] }, is_enabled: true }] }
      if (path.startsWith("/alerts/events")) return { items: [] }
      if (path.startsWith("/alerts/telegram")) return { linked: false }
      return createStrategyApi(world)(path, init)
    })
    await user.click(within(section).getByRole("button", { name: /Cảnh báo cũ/ }))
    expect(await within(section).findByText("Pullback cũ")).toBeTruthy()
    expect(within(section).getAllByText("Kết nối Telegram").length).toBeGreaterThanOrEqual(1)
    expect(within(section).getByText(/Chỉ dành cho cảnh báo cũ/)).toBeTruthy()
    expect(within(section).getByRole("switch", { name: "Bật cảnh báo cũ Pullback cũ" })).toBeTruthy()
  })
})

/** Tab IQX of the Backtest (§3): Dùng fills a draft, run on the draft, Lưu cho Bot, Về cấu hình đã lưu, Mua và giữ. */
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import { callsTo } from "../../demo-trading/bot/test-support"
import { createStrategyApi, createStrategyWorld, type StrategyWorld } from "../test-support"
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

const posts = (path: string) => callsTo(world, "POST", path)
const patches = () => callsTo(world, "PATCH", "/strategy/shared-config")
const library = () => screen.getByRole("complementary", { name: "Thư viện chỉ báo" })
/** Hồi phục quá bán: Bollinger + RSI, both granted in the fake. */
const HOIPHUC = 3

async function renderTab(path = "/chien-luoc?tab=backtest&symbol=FPT") {
  render(<BacktestTab initialSymbol="fpt" />, path)
  await screen.findByRole("heading", { name: "Điều kiện Mua" })
}

async function useStrategy(user: ReturnType<typeof userEvent.setup>, index: number) {
  await user.click(within(library()).getByRole("tab", { name: "IQX" }))
  const item = world.iqx.strategy[index]!
  await user.click(await within(library()).findByRole("button", { name: `Dùng ${item.content.name}` }))
  return item
}

async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Chạy backtest" }))
  return screen.findByTestId("backtest-results")
}

describe("tab IQX of the Backtest", () => {
  it("lists the Chiến lược IQX with Mua/Bán summaries and the footer; the indicators tab is still the default", async () => {
    const user = userEvent.setup()
    await renderTab()
    expect(within(library()).getByRole("tab", { name: /^Chỉ báo/ }).getAttribute("aria-selected")).toBe("true")
    await user.click(within(library()).getByRole("tab", { name: "IQX" }))
    const card = await within(library()).findByTestId("iqx-strategy-hoiphuc")
    expect(card.textContent).toMatch(/Mua: .*Bán: .*giữ tối đa \d+ phiên/)
    expect(screen.getByTestId("iqx-footer").textContent).toBe(
      "Chiến lược dựng sẵn bởi IQX. Bấm Dùng để điền sẵn các thẻ chỉ báo vào Điều kiện Mua và Bán của bản nháp. Bot không đổi.",
    )
  })

  it("Dùng fills a draft (Bot untouched), the run sends only the changed indicators with the origin", async () => {
    const user = userEvent.setup()
    await renderTab()
    const item = await useStrategy(user, HOIPHUC)
    expect(mocks.toast.success).toHaveBeenCalledWith(`Đã điền sẵn Chiến lược IQX · ${item.content.name} vào bản nháp. Bot chưa thay đổi.`)
    expect(screen.getByTestId("draft-badge").textContent).toBe("Bản nháp · chưa lưu cho Bot")
    expect(screen.getByTestId("iqx-strategy-strip").textContent).toContain(`Bản nháp bắt đầu từ Chiến lược IQX · ${item.content.name}.`)
    expect((screen.getByLabelText("Giữ tối đa (phiên)") as HTMLInputElement).value).toBe(String(item.content.definition.max_holding))
    await waitFor(() => expect(posts(`/strategy/iqx-templates/${item.id}/used`)).toHaveLength(1))
    expect(patches()).toHaveLength(0)

    const results = await run(user)
    const body = posts("/strategy/backtests")[0]!.body as { shared_revision: number; draft: { indicators: Record<string, unknown> }; origin: unknown; trial?: boolean }
    expect(body.shared_revision).toBe(3)
    expect(Object.keys(body.draft.indicators).sort()).toEqual(["bollinger", "ma", "macd", "rsi"])
    expect(body.origin).toEqual({ type: "iqx_strategy", id: item.id, version: 1 })
    expect(body.trial).toBeUndefined()
    expect(within(results).getByTestId("run-source").textContent).toBe(`Bản nháp · từ Chiến lược IQX ${item.content.name} (v1)`)
    expect(patches()).toHaveLength(0)
  })

  it("Lưu cho Bot needs a run of this exact draft, then writes one revision with the run as source", async () => {
    const user = userEvent.setup()
    await renderTab()
    await useStrategy(user, HOIPHUC)
    const save = screen.getByRole("button", { name: "Lưu cho Bot" })
    expect(save.hasAttribute("disabled")).toBe(true)
    await run(user)
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu cho Bot" }).hasAttribute("disabled")).toBe(false))

    // Editing Giữ tối đa after the run makes the run stale for saving.
    const hold = screen.getByLabelText("Giữ tối đa (phiên)")
    await user.clear(hold)
    await user.type(hold, "40")
    expect(screen.getByRole("button", { name: "Lưu cho Bot" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByTestId("bot-save-hint").textContent).toBe("Bản nháp đã sửa sau lần chạy. Bấm Chạy trước khi Lưu cho Bot.")
    await run(user)

    await user.click(screen.getByRole("button", { name: "Lưu cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu cho Bot" })
    expect(within(dialog).getByTestId("save-bot-summary").textContent).toMatch(/Lần chạy lúc \d{2}:\d{2} · từ Chiến lược IQX · /)
    await user.click(within(dialog).getByRole("button", { name: "Lưu cho Bot" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = patches()[0]!.body as { expected_revision: number; indicators: Record<string, unknown>; source: { backtest_run_id: string } }
    expect(body.expected_revision).toBe(3)
    expect(Object.keys(body.indicators).sort()).toEqual(["bollinger", "ma", "macd", "rsi"])
    expect(body.source.backtest_run_id).toBe(posts("/strategy/backtests").length === 2 ? "bbbbbbbb-bbbb-4bbb-8bbb-000000000002" : "")
    await waitFor(() => expect(screen.queryByTestId("draft-badge")).toBeNull())
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Đã lưu cho Bot \(bản 4\)/))
  })

  it("a second Dùng asks first; Về cấu hình đã lưu drops the draft after a confirm", async () => {
    const user = userEvent.setup()
    await renderTab()
    await useStrategy(user, HOIPHUC)
    const other = world.iqx.strategy[2]!
    await user.click(within(library()).getByRole("button", { name: `Dùng ${other.content.name}` }))
    const confirm = await screen.findByRole("dialog", { name: "Thay bản nháp đang chỉnh?" })
    expect(confirm.textContent).toContain("Cấu hình Bot đang dùng không đổi.")
    await user.click(within(confirm).getByRole("button", { name: "Thay bằng chiến lược IQX" }))
    expect(screen.getByTestId("iqx-strategy-strip").textContent).toContain(other.content.name)

    await user.click(screen.getByRole("button", { name: "Về cấu hình đã lưu" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Về cấu hình đã lưu?" })).getByRole("button", { name: "Về cấu hình đã lưu" }))
    expect(screen.queryByTestId("draft-badge")).toBeNull()
    expect(screen.queryByTestId("iqx-strategy-strip")).toBeNull()
    await run(user)
    const body = posts("/strategy/backtests")[0]!.body as { draft?: unknown }
    expect(body.draft).toBeUndefined()
  })

  it("?iqx= from a symbol of a Bộ lọc IQX fills its paired Chiến lược IQX", async () => {
    const item = world.iqx.strategy[HOIPHUC]!
    await renderTab(`/chien-luoc?tab=backtest&symbol=FPT&iqx=${item.id}`)
    await waitFor(() => expect(screen.getByTestId("iqx-strategy-strip").textContent).toContain(item.content.name))
    expect(mocks.toast.success).toHaveBeenCalledWith(`Mở Backtest FPT. Đã điền sẵn Chiến lược IQX · ${item.content.name} vào bản nháp. Bot chưa thay đổi.`)
  })

  it("every run shows Mua và giữ {mã} next to the strategy profit, with its line", async () => {
    const user = userEvent.setup()
    await renderTab()
    const results = await run(user)
    const kpis = within(results).getByRole("group", { name: "Sáu chỉ số kết quả" }).textContent ?? ""
    expect(kpis.indexOf("Mua và giữ FPT")).toBeGreaterThan(kpis.indexOf("Tổng lợi nhuận"))
    expect(kpis).toMatch(/Mua và giữ FPT\+17,9%/)
    expect(kpis).not.toContain("Lần chạy cũ chưa có số liệu này")
  })
})

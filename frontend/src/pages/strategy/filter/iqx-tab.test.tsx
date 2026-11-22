/** Tab IQX of the Bộ lọc (§2): Dùng fills the form, strip, confirm, save origin, symbol → paired Chiến lược IQX. */
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot as render, stubBrowser } from "../../demo-trading/bot/test-render"
import { callsTo } from "../../demo-trading/bot/test-support"
import { createStrategyApi, createStrategyWorld, iqxId, type StrategyWorld } from "../test-support"
import { FilterTab } from "./filter-tab"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

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
const library = () => screen.getByRole("complementary", { name: "Thư viện chỉ tiêu" })
const HOIPHUC = 5

async function openIqx(user: ReturnType<typeof userEvent.setup>) {
  render(<FilterTab />, "/chien-luoc?tab=bo-loc")
  await screen.findByRole("region", { name: "Cơ bản" })
  await user.click(within(library()).getByRole("tab", { name: "IQX" }))
  return within(library())
}

describe("tab IQX of the Bộ lọc", () => {
  it("lists the shown Bộ lọc IQX in order with their counts, idea and the footer", async () => {
    const user = userEvent.setup()
    const lib = await openIqx(user)
    const cards = await lib.findAllByRole("button", { name: /^Dùng / })
    expect(cards.map((button) => button.getAttribute("aria-label"))).toEqual(world.iqx.filter.map((item) => `Dùng ${item.content.name}`))
    expect(screen.getByTestId("iqx-filter-canslim").textContent).toMatch(/Thị trường 1.*Cơ bản 3.*Kỹ thuật 2/)
    expect(screen.getByTestId("iqx-footer").textContent).toBe("Bộ lọc dựng sẵn bởi IQX. Bấm Dùng để điền sẵn vào form, rồi sửa như tự thiết lập. Tham khảo để học, không phải khuyến nghị.")
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it("Dùng on an empty form fills it at once, shows the strip, counts one use and runs exactly the item's criteria", async () => {
    const user = userEvent.setup()
    const lib = await openIqx(user)
    const item = world.iqx.filter[HOIPHUC]!
    await user.click(await lib.findByRole("button", { name: `Dùng ${item.content.name}` }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.toast.success).toHaveBeenCalledWith(`Đã điền sẵn Bộ lọc IQX · ${item.content.name}. Sửa từng điều kiện như tự thiết lập, rồi bấm Chạy bộ lọc.`)
    const strip = screen.getByTestId("iqx-filter-strip")
    expect(strip.textContent).toContain(`Bắt đầu từ Bộ lọc IQX · ${item.content.name}.`)
    await user.click(within(strip).getByRole("button", { name: "Xem thêm" }))
    expect(strip.textContent).toContain(item.content.when_wrong)
    expect(strip.textContent).toContain("Tham khảo để học, không phải khuyến nghị đầu tư.")
    await waitFor(() => expect(posts(`/strategy/iqx-templates/${item.id}/used`)).toHaveLength(1))

    await user.click(screen.getByRole("button", { name: "Chạy bộ lọc" }))
    await screen.findByRole("region", { name: "Kết quả sàng lọc" })
    const body = posts("/strategy/screener/run")[0]!.body as { market: { baskets: string[] }; technical: unknown[]; rules: unknown[] }
    expect(body.market.baskets).toEqual(["VN100"])
    expect(body.technical).toEqual(item.content.definition.technical)
    expect(body.rules).toEqual([])
    // No "Đi cặp với" line and no per-symbol Backtest link any more (spec v2.0 §13).
    expect(strip.textContent).not.toContain("Đi cặp với")
    expect(screen.queryAllByRole("link", { name: /^Backtest / })).toHaveLength(0)
  })

  it("asks before replacing a form that already has conditions; Hủy keeps it", async () => {
    const user = userEvent.setup()
    const lib = await openIqx(user)
    const first = world.iqx.filter[HOIPHUC]!
    const second = world.iqx.filter[4]!
    await user.click(await lib.findByRole("button", { name: `Dùng ${first.content.name}` }))
    await user.click(lib.getByRole("button", { name: `Dùng ${second.content.name}` }))
    const dialog = await screen.findByRole("dialog", { name: "Thay bộ lọc đang soạn?" })
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    expect(screen.getByTestId("iqx-filter-strip").textContent).toContain(first.content.name)
    await user.click(lib.getByRole("button", { name: `Dùng ${second.content.name}` }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Thay bằng bộ lọc IQX" }))
    expect(screen.getByTestId("iqx-filter-strip").textContent).toContain(second.content.name)
  })

  it("Lưu bộ lọc suggests “{tên} (từ Bộ lọc IQX)” and keeps the origin with the saved filter", async () => {
    const user = userEvent.setup()
    const lib = await openIqx(user)
    const item = world.iqx.filter[HOIPHUC]!
    await user.click(await lib.findByRole("button", { name: `Dùng ${item.content.name}` }))
    await user.click(screen.getByRole("button", { name: "Lưu bộ lọc" }))
    const dialog = await screen.findByRole("dialog", { name: "Lưu bộ lọc" })
    expect((within(dialog).getByLabelText("Tên bộ lọc") as HTMLInputElement).value).toBe(`${item.content.name} (từ Bộ lọc IQX)`)
    await user.click(within(dialog).getByRole("button", { name: "Lưu bộ lọc" }))
    await waitFor(() => expect(posts("/strategy/filters")).toHaveLength(1))
    const body = posts("/strategy/filters")[0]!.body as { definition: { origin?: unknown } }
    expect(body.definition.origin).toEqual({ type: "iqx_filter", id: iqxId("filter", HOIPHUC), version: 1 })
  })
})

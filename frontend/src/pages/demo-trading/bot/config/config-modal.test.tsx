import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BotPanel } from "../panel/bot-panel"
import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, FakeApiError, type World } from "../test-support"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: vi.fn() }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("../test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => String(error) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

let world: World

beforeEach(() => {
  world = createWorld()
  mocks.api.mockReset()
  mocks.api.mockImplementation(createFakeApi(world))
  Object.values(mocks.toast).forEach((fn) => fn.mockClear())
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

type Patch = { expected_revision: number; idempotency_key: string; indicators: Record<string, { master_enabled: boolean; buy: { enabled: boolean; params: Record<string, number>; rules: { id: string; op: string }[] }; sell: { enabled: boolean; params: Record<string, number>; rules: { id: string; op: string }[] } }> }
const patches = () => callsTo(world, "PATCH", "/strategy/shared-config")
const lastPatch = () => patches().at(-1)!.body as unknown as Patch

async function openConfig(user: ReturnType<typeof userEvent.setup>, name = "RSI") {
  renderBot(<BotPanel />)
  const article = await screen.findByRole("article", { name })
  await user.click(within(article).getByRole("button", { name: /Cấu hình/ }))
  return screen.findByRole("dialog", { name: new RegExp(`Cấu hình Bot · ${name}`) })
}
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
async function setValue(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(input(label))
  await user.type(input(label), value)
}

describe("config modal layout", () => {
  it("has MUA/BÁN tabs, a side switch, registry-bounded inputs, operator selects and a note about Backtest", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)

    expect(within(dialog).getByRole("tab", { name: "Điều kiện Mua" }).getAttribute("aria-selected")).toBe("true")
    expect(within(dialog).getByRole("tab", { name: "Điều kiện Bán" })).toBeTruthy()
    expect(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }).getAttribute("aria-checked")).toBe("false")
    expect(dialog.textContent).toMatch(/dùng chung với Backtest/)

    const level = input("Ngưỡng quá bán")
    expect([level.min, level.max, level.step]).toEqual(["10", "49", "1"])
    expect(input("Chu kỳ RSI")).toMatchObject({ min: "5", max: "50", step: "1" })

    const operators = within(dialog).getAllByRole("combobox")
    expect(operators.map((select) => (select as HTMLSelectElement).value)).toEqual(["<", ">"])
    expect(within(operators[0]!).getAllByRole("option").map((option) => option.textContent)).toEqual([">", "<"])
    expect(dialog.textContent).toMatch(/RSI phiên trước/)

    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    const sellLevel = input("Ngưỡng quá mua")
    expect([sellLevel.min, sellLevel.max, sellLevel.value]).toEqual(["51", "90", "70"])
  })

  it("shows the interval operator of Bollinger and the cross label of MA Cross", async () => {
    world.granted.push("ma_cross")
    const user = userEvent.setup()
    let dialog = await openConfig(user, "Bollinger Bands")
    const selects = within(dialog).getAllByRole("combobox") as HTMLSelectElement[]
    expect(selects.map((select) => select.value)).toEqual(["<", "∈", ">"])
    expect(within(selects[1]!).getAllByRole("option").map((option) => option.textContent)).toEqual(["∈", "∉"])
    expect(dialog.textContent).toMatch(/Dải Bollinger/)
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await user.click(within(screen.getByRole("article", { name: "MA Cross" })).getByRole("button", { name: /Cấu hình/ }))
    dialog = await screen.findByRole("dialog", { name: /MA Cross/ })
    expect(dialog.textContent).toMatch(/Giao cắt giữa hai phiên/)
    expect(dialog.textContent).toMatch(/SMA 20/)
  })
})

describe("Đặt lại, Hủy and validation", () => {
  it("Đặt lại restores only the open tab's params and operators to the registry defaults and keeps its ON/OFF and the other tab", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)

    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    await setValue(user, "Chu kỳ RSI", "30")
    await setValue(user, "Ngưỡng quá bán", "40")
    await user.selectOptions(within(dialog).getAllByRole("combobox")[0]!, ">")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    await setValue(user, "Ngưỡng quá mua", "85")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Mua" }))

    await user.click(within(dialog).getByRole("button", { name: "Đặt lại" }))
    expect(input("Chu kỳ RSI").value).toBe("14")
    expect(input("Ngưỡng quá bán").value).toBe("30")
    expect((within(dialog).getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("<")
    expect(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }).getAttribute("aria-checked")).toBe("true")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    expect(input("Ngưỡng quá mua").value).toBe("85")
    expect(patches()).toHaveLength(0)
  })

  it("Hủy closes straight away when nothing changed", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("asks before discarding a changed draft; refusing keeps the draft, confirming throws it away without saving", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Ngưỡng quá bán", "40")

    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    const confirm = await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })
    await user.click(within(confirm).getByRole("button", { name: "Tiếp tục chỉnh sửa" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).toBeNull())
    expect(input("Ngưỡng quá bán").value).toBe("40")

    await user.keyboard("{Escape}")
    await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })
    // Escape on the confirmation only answers "no": the config and its draft stay.
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).toBeNull())
    expect(input("Ngưỡng quá bán").value).toBe("40")
    await user.keyboard("{Escape}")
    await user.click(within(await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).getByRole("button", { name: "Bỏ thay đổi" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(patches()).toHaveLength(0)
  })

  it("blocks Lưu for a value outside the registry domain and explains it", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Ngưỡng quá bán", "60")
    expect(within(dialog).getByText(/Ngưỡng quá bán: nhập số nguyên từ 10 đến 49/)).toBeTruthy()
    expect((within(dialog).getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(true)
    await setValue(user, "Ngưỡng quá bán", "35")
    expect((within(dialog).getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("Lưu", () => {
  it("PATCHes only this indicator with expected_revision and an idempotency key, then reports the saved revision and session", async () => {
    world.savedRevision = 6
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    await setValue(user, "Ngưỡng quá bán", "25")
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = lastPatch()
    expect(body.expected_revision).toBe(6)
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    expect(Object.keys(body.indicators)).toEqual(["rsi"])
    expect(body.indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: true, params: { period: 14, level: 25 } }, sell: { enabled: false, params: { level: 70 } } })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã lưu cấu hình RSI (bản 7). Có hiệu lực từ phiên 09/10/2026.")
  })

  it("editing numbers while the master is OFF does not turn the master on", async () => {
    world.indicators.rsi!.buy.enabled = true
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Chu kỳ RSI", "21")
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: true, params: { period: 21 } } })
  })

  it("saving with both sides OFF turns the master OFF and keeps the params", async () => {
    world.indicators.rsi!.master_enabled = true
    world.indicators.rsi!.buy.enabled = true
    world.indicators.rsi!.buy.params = { period: 21, level: 25 }
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    expect(dialog.textContent).toMatch(/Cả hai phía đều tắt: sau khi lưu, chỉ báo sẽ tắt/)
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: false, params: { period: 21, level: 25 } } })
  })

  it("opened from the master switch, saving with a side ON turns the master ON", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    const article = await screen.findByRole("article", { name: "RSI" })
    await user.click(within(article).getByRole("switch", { name: "Bật RSI cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: /Cấu hình Bot · RSI/ })
    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: true, buy: { enabled: true }, sell: { enabled: false } })
  })

  it("opened from the master switch, saving with both sides OFF activates nothing", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    const article = await screen.findByRole("article", { name: "RSI" })
    await user.click(within(article).getByRole("switch", { name: "Bật RSI cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: /Cấu hình Bot · RSI/ })
    await setValue(user, "Chu kỳ RSI", "20")
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: false } })
  })

  it("shows the server's refusal and keeps the draft when the save is invalid", async () => {
    world.override["PATCH /strategy/shared-config"] = () => {
      throw new FakeApiError("Cấu hình không hợp lệ.", 422, { code: "CONFIG_INVALID", details: [{ path: "indicators.rsi.buy.params.level", message: "Ngưỡng không hợp lệ" }] })
    }
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Ngưỡng quá bán", "25")
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    expect(await within(dialog).findByText("Ngưỡng không hợp lệ")).toBeTruthy()
    expect(within(dialog).getByText("Cấu hình không hợp lệ.")).toBeTruthy()
    expect(input("Ngưỡng quá bán").value).toBe("25")
  })

  describe("409 conflict", () => {
    it("keeps the draft, explains, blocks Lưu until reload, then merges the newer config with the user's edits", async () => {
      world.savedRevision = 2
      const user = userEvent.setup()
      const dialog = await openConfig(user)
      await setValue(user, "Ngưỡng quá bán", "25")

      // Another tab saves first: a new revision with a different Sell level.
      world.savedRevision = 3
      world.indicators.rsi!.sell.params = { period: 14, level: 85 }

      await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
      expect(await within(dialog).findByText("Cấu hình đã thay đổi ở nơi khác")).toBeTruthy()
      expect(input("Ngưỡng quá bán").value).toBe("25")
      expect((within(dialog).getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(true)
      expect(patches()).toHaveLength(1)

      await user.click(within(dialog).getByRole("button", { name: "Tải lại" }))
      expect(await within(dialog).findByText(/Đã tải bản #3/)).toBeTruthy()
      expect(input("Ngưỡng quá bán").value).toBe("25")
      await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
      expect(input("Ngưỡng quá mua").value).toBe("85")

      await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
      await waitFor(() => expect(patches()).toHaveLength(2))
      expect(lastPatch().expected_revision).toBe(3)
      expect(lastPatch().indicators.rsi).toMatchObject({ buy: { params: { level: 25 } }, sell: { params: { level: 85 } } })
    })
  })

  it("retries a failed network save with the same idempotency key", async () => {
    let attempts = 0
    const real = createFakeApi(world)
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "PATCH" && attempts++ === 0) {
        world.calls.push({ method: "PATCH", path, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
        throw new FakeApiError("Mất kết nối", 503)
      }
      return real(path, init)
    })
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Ngưỡng quá bán", "25")
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    expect(await within(dialog).findByText("Mất kết nối")).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }))
    await waitFor(() => expect(patches()).toHaveLength(2))
    const [first, second] = patches().map((call) => (call.body as unknown as Patch).idempotency_key)
    expect(second).toBe(first)
  })
})

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BotPanel } from "../panel/bot-panel"
import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, FakeApiError, rowsOf, type World } from "../test-support"

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

type PatchRow = { id: string; enabled: boolean; [field: string]: string | number | boolean }
type PatchSide = { enabled: boolean; rules: PatchRow[]; params?: Record<string, number> }
type Patch = { expected_revision: number; idempotency_key: string; indicators: Record<string, { master_enabled: boolean; buy: PatchSide; sell: PatchSide }> }
const patches = () => callsTo(world, "PATCH", "/strategy/shared-config")
const lastPatch = () => patches().at(-1)!.body as unknown as Patch

async function openConfig(user: ReturnType<typeof userEvent.setup>, name = "RSI") {
  renderBot(<BotPanel />)
  const article = await screen.findByRole("article", { name })
  await user.click(within(article).getByRole("button", { name: /Cấu hình/ }))
  return screen.findByRole("dialog", { name: new RegExp(`Cấu hình Bot · ${name}`) })
}
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const saveButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Lưu" }) as HTMLButtonElement
async function setValue(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(input(label))
  await user.type(input(label), value)
}

describe("config modal layout", () => {
  it("has MUA/BÁN tabs, a side switch and the RSI rows as sentences with their own inputs, no shared param block", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)

    expect(within(dialog).getByRole("tab", { name: "Điều kiện Mua" }).getAttribute("aria-selected")).toBe("true")
    expect(within(dialog).getByRole("tab", { name: "Điều kiện Bán" })).toBeTruthy()
    expect(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }).getAttribute("aria-checked")).toBe("false")
    expect(dialog.textContent).toMatch(/dùng chung với Backtest/)

    const rows = within(within(dialog).getByRole("list", { name: "Điều kiện Mua" })).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(input("Chu kỳ RSI (dòng 1, Mua)").value).toBe("14")
    expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("30")
    const op = input("Dấu so sánh (dòng 1, Mua)") as unknown as HTMLSelectElement
    expect([...op.options].map((option) => option.textContent)).toEqual([">", "<"])
    expect(op.value).toBe("<")
    expect(input("Chu kỳ RSI (dòng 2, Mua)").value).toBe("14")
    expect(rows[1]!.textContent).toMatch(/xu hướng/)
    expect(dialog.textContent).not.toMatch(/phiên trước/)
    expect(within(dialog).getByTestId("row-count-buy").textContent).toBe("2/2 điều kiện được bật · Các điều kiện đang bật phải đồng thời thỏa mãn")
    // Nothing outside the rows: no "Từ … đến …" hint of the old param grid.
    expect(dialog.textContent).not.toMatch(/Từ \d+ đến/)

    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    expect(input("Ngưỡng RSI (dòng 1, Bán)").value).toBe("70")
  })

  it("keeps the param grid and rule templates of Volume", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user, "Khối lượng")
    expect(input("Số phiên tham chiếu")).toMatchObject({ min: "5", max: "100", value: "20" })
    expect(dialog.textContent).toMatch(/Khối lượng><1 × TB 20 phiên/)
    expect(within(dialog).queryByRole("list", { name: "Điều kiện Mua" })).toBeNull()
  })

  it("shows the saved rows of MA Cross with preset period selects", async () => {
    world.granted.push("ma_cross")
    const user = userEvent.setup()
    const dialog = await openConfig(user, "MA Cross")
    const fast = input("Chu kỳ SMA nhanh (dòng 1, Mua)") as unknown as HTMLSelectElement
    expect(fast.tagName).toBe("SELECT")
    expect([...fast.options].map((option) => option.value)).toEqual(["5", "10", "20", "50", "100", "200"])
    expect(fast.value).toBe("20")
    expect(dialog.textContent).toMatch(/cắt/)
  })
})

describe("Đặt lại, Hủy and validation", () => {
  it("Đặt lại restores only the open tab's rows to the registry defaults and keeps its ON/OFF and the other tab", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)

    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    await setValue(user, "Chu kỳ RSI (dòng 1, Mua)", "30")
    await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "40")
    await user.selectOptions(input("Dấu so sánh (dòng 1, Mua)"), ">")
    await user.click(within(dialog).getByRole("switch", { name: "Bật điều kiện 2 (Mua)" }))
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    await setValue(user, "Ngưỡng RSI (dòng 1, Bán)", "85")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Mua" }))

    await user.click(within(dialog).getByRole("button", { name: "Đặt lại" }))
    expect(input("Chu kỳ RSI (dòng 1, Mua)").value).toBe("14")
    expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("30")
    expect(input("Dấu so sánh (dòng 1, Mua)").value).toBe("<")
    expect(within(dialog).getByRole("switch", { name: "Bật điều kiện 2 (Mua)" }).getAttribute("aria-checked")).toBe("true")
    expect(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }).getAttribute("aria-checked")).toBe("true")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    expect(input("Ngưỡng RSI (dòng 1, Bán)").value).toBe("85")
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
    await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "40")

    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    const confirm = await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })
    await user.click(within(confirm).getByRole("button", { name: "Tiếp tục chỉnh sửa" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).toBeNull())
    expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("40")

    await user.keyboard("{Escape}")
    await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })
    // Escape on the confirmation only answers "no": the config and its draft stay.
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).toBeNull())
    expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("40")
    await user.keyboard("{Escape}")
    await user.click(within(await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" })).getByRole("button", { name: "Bỏ thay đổi" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(patches()).toHaveLength(0)
  })

  it("blocks Lưu with the SPEC V3 message under the rows, never corrects the value, and unblocks once fixed", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "130")
    expect(within(dialog).getByTestId("row-errors-buy").textContent).toBe("Mua · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên.")
    expect(input("Ngưỡng RSI (dòng 1, Mua)").getAttribute("aria-invalid")).toBe("true")
    expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("130")
    expect(saveButton(dialog).disabled).toBe(true)
    await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "35")
    expect(within(dialog).queryByTestId("row-errors-buy")).toBeNull()
    expect(saveButton(dialog).disabled).toBe(false)
  })

  it("checks both tabs: an error on Bán blocks Lưu from Mua and flags the Bán tab, including a row that is off", async () => {
    const user = userEvent.setup()
    const dialog = await openConfig(user, "MACD")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    // MACD row 2 is OFF by default and is still validated.
    await setValue(user, "Chu kỳ EMA nhanh (dòng 2, Bán)", "30")
    expect(within(dialog).getByTestId("row-errors-sell").textContent).toBe("Bán · dòng 2: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.")
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Mua" }))
    expect(within(dialog).getByRole("tab", { name: /Điều kiện Bán/ }).textContent).toMatch(/có lỗi/)
    expect(within(dialog).getByRole("tab", { name: "Điều kiện Mua" })).toBeTruthy()
    expect(saveButton(dialog).disabled).toBe(true)
  })
})

describe("Lưu", () => {
  it("PATCHes only this indicator, every row with its own values, with expected_revision and an idempotency key", async () => {
    world.savedRevision = 6
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "25")
    await setValue(user, "Chu kỳ RSI (dòng 2, Mua)", "9")
    await user.click(saveButton(dialog))

    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = lastPatch()
    expect(body.expected_revision).toBe(6)
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    expect(Object.keys(body.indicators)).toEqual(["rsi"])
    expect(body.indicators.rsi).toEqual({
      master_enabled: false,
      buy: { enabled: true, rules: [{ id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 25 }, { id: "rsi.trend", enabled: true, period: 9, dir: "up" }] },
      sell: { enabled: false, rules: [{ id: "rsi.level", enabled: true, period: 14, op: ">", threshold: 70 }, { id: "rsi.trend", enabled: true, period: 14, dir: "down" }] },
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã lưu cấu hình RSI (bản 7). Có hiệu lực từ phiên 09/10/2026.")
  })

  it.each([
    ["Chaikin Money Flow", "cmf", "Ngưỡng CMF", "-0.05", -0.05],
    ["CCI", "cci", "Ngưỡng CCI", "-100", -100],
    ["Williams %R", "williams_r", "Ngưỡng Williams %R", "-80", -80],
    ["ROC", "roc", "Ngưỡng ROC (%)", "5", 5],
  ])("saves and reloads %s %s exactly", async (name, id, label, typed, stored) => {
    world.granted.push(id)
    const user = userEvent.setup()
    let dialog = await openConfig(user, name)
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    await setValue(user, `${label} (dòng 1, Bán)`, typed)
    await user.click(saveButton(dialog))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(rowsOf(lastPatch().indicators[id] as never, "sell").rules[0]!.threshold).toBe(stored)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await user.click(within(screen.getByRole("article", { name })).getByRole("button", { name: /Cấu hình/ }))
    dialog = await screen.findByRole("dialog", { name: new RegExp(`Cấu hình Bot · ${name.replace(/[%()]/g, ".")}`) })
    await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
    expect(input(`${label} (dòng 1, Bán)`).value).toBe(typed)
  })

  it("editing values while the master is OFF does not turn the master on", async () => {
    world.indicators.rsi!.buy.enabled = true
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Chu kỳ RSI (dòng 1, Mua)", "21")
    await user.click(saveButton(dialog))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: true, rules: [{ period: 21 }, { period: 14 }] } })
  })

  it("saving with both sides OFF turns the master OFF and keeps the rows", async () => {
    world.indicators.rsi!.master_enabled = true
    world.indicators.rsi!.buy.enabled = true
    rowsOf(world.indicators.rsi!, "buy").rules[0]!.threshold = 25
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    expect(dialog.textContent).toMatch(/Cả hai phía đều tắt: sau khi lưu, chỉ báo sẽ tắt/)
    await user.click(saveButton(dialog))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: false, rules: [{ threshold: 25 }, {}] } })
  })

  it("opened from the master switch, saving with a side ON turns the master ON", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    const article = await screen.findByRole("article", { name: "RSI" })
    await user.click(within(article).getByRole("switch", { name: "Bật RSI cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: /Cấu hình Bot · RSI/ })
    await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
    await user.click(saveButton(dialog))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: true, buy: { enabled: true }, sell: { enabled: false } })
  })

  it("opened from the master switch, saving with both sides OFF activates nothing", async () => {
    const user = userEvent.setup()
    renderBot(<BotPanel />)
    const article = await screen.findByRole("article", { name: "RSI" })
    await user.click(within(article).getByRole("switch", { name: "Bật RSI cho Bot" }))
    const dialog = await screen.findByRole("dialog", { name: /Cấu hình Bot · RSI/ })
    await setValue(user, "Chu kỳ RSI (dòng 1, Mua)", "20")
    await user.click(saveButton(dialog))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(lastPatch().indicators.rsi).toMatchObject({ master_enabled: false, buy: { enabled: false } })
  })

  it("says so and sends nothing when nothing changed", async () => {
    world.indicators.rsi!.buy.enabled = true
    const user = userEvent.setup()
    const dialog = await openConfig(user)
    await setValue(user, "Chu kỳ RSI (dòng 1, Mua)", "14")
    await user.click(saveButton(dialog))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.toast.info).toHaveBeenCalledWith("Không có thay đổi để lưu.")
    expect(patches()).toHaveLength(0)
  })

  describe("errors from the API", () => {
    it("422 on a row of the other tab: opens that tab, flags it, puts the message under the rows on its field and clears it when the row is edited", async () => {
      world.override["PATCH /strategy/shared-config"] = () => {
        throw new FakeApiError("Cấu hình không hợp lệ.", 422, {
          code: "CONFIG_INVALID",
          details: [{ path: "indicators.rsi.sell.rules.1.period", message: "Bán · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên." }],
        })
      }
      const user = userEvent.setup()
      const dialog = await openConfig(user)
      await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
      await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "25")
      await user.click(saveButton(dialog))

      const sellTab = await within(dialog).findByRole("tab", { name: /Điều kiện Bán/ })
      await waitFor(() => expect(sellTab.getAttribute("aria-selected")).toBe("true"))
      expect(sellTab.textContent).toMatch(/có lỗi/)
      expect(within(dialog).getByTestId("row-errors-sell").textContent).toBe("Bán · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
      expect(within(dialog).getAllByText("Bán · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")).toHaveLength(1)
      expect(input("Chu kỳ RSI (dòng 2, Bán)").getAttribute("aria-invalid")).toBe("true")
      expect(input("Chu kỳ RSI (dòng 1, Bán)").getAttribute("aria-invalid")).toBeNull()
      expect(within(dialog).getByText("Cấu hình không hợp lệ.")).toBeTruthy()

      // Editing another row keeps it; editing that row clears it.
      await setValue(user, "Chu kỳ RSI (dòng 1, Bán)", "15")
      expect(input("Chu kỳ RSI (dòng 2, Bán)").getAttribute("aria-invalid")).toBe("true")
      await setValue(user, "Chu kỳ RSI (dòng 2, Bán)", "20")
      expect(within(dialog).queryByTestId("row-errors-sell")).toBeNull()
      expect(input("Chu kỳ RSI (dòng 2, Bán)").getAttribute("aria-invalid")).toBeNull()
      await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Mua" }))
      expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("25")
    })

    it("422 SIDE_REQUIRED shows its message once and keeps the draft", async () => {
      const message = "Chọn ít nhất một phía Mua hoặc Bán trước khi bật chỉ báo rsi."
      world.override["PATCH /strategy/shared-config"] = () => {
        throw new FakeApiError(message, 422, { code: "SIDE_REQUIRED", details: [{ path: "indicators.rsi", message }] })
      }
      const user = userEvent.setup()
      const dialog = await openConfig(user)
      await setValue(user, "Chu kỳ RSI (dòng 1, Mua)", "20")
      await user.click(saveButton(dialog))
      await within(dialog).findByText(message)
      expect(within(dialog).getAllByText(message)).toHaveLength(1)
      expect(input("Chu kỳ RSI (dòng 1, Mua)").value).toBe("20")
    })

    it("403 CAPABILITY_LOCKED names the indicator whose quiz is missing", async () => {
      world.override["PATCH /strategy/shared-config"] = () => {
        throw new FakeApiError("Cần hoàn thành bài học của chỉ báo rsi trước khi bật.", 403, {
          code: "CAPABILITY_LOCKED",
          details: [{ capability: "indicator:rsi", reason: "not_learned", indicator: "rsi" }],
        })
      }
      const user = userEvent.setup()
      const dialog = await openConfig(user)
      await user.click(within(dialog).getByRole("switch", { name: "Sử dụng điều kiện Mua" }))
      await user.click(saveButton(dialog))
      expect(await within(dialog).findByText("Đạt bài kiểm tra của bài học chỉ báo RSI để bật.")).toBeTruthy()
    })
  })

  describe("409 conflict", () => {
    it("names the newest revision the server reports before anything is reloaded", async () => {
      world.savedRevision = 2
      const user = userEvent.setup()
      const dialog = await openConfig(user)
      await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "25")
      world.savedRevision = 5
      await user.click(saveButton(dialog))
      expect(await within(dialog).findByText(/Bản mới nhất là #5, bản nháp của bạn dựa trên #2/)).toBeTruthy()
    })

    it("keeps the draft, explains, blocks Lưu until reload, then merges the newer config with the user's edits", async () => {
      world.savedRevision = 2
      const user = userEvent.setup()
      const dialog = await openConfig(user)
      await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "25")

      // Another tab saves first: a new revision with a different Bán threshold.
      world.savedRevision = 3
      rowsOf(world.indicators.rsi!, "sell").rules[0]!.threshold = 85

      await user.click(saveButton(dialog))
      expect(await within(dialog).findByText("Cấu hình đã thay đổi ở nơi khác")).toBeTruthy()
      expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("25")
      expect(saveButton(dialog).disabled).toBe(true)
      expect(patches()).toHaveLength(1)

      await user.click(within(dialog).getByRole("button", { name: "Tải lại" }))
      expect(await within(dialog).findByText(/Đã tải bản #3/)).toBeTruthy()
      expect(input("Ngưỡng RSI (dòng 1, Mua)").value).toBe("25")
      await user.click(within(dialog).getByRole("tab", { name: "Điều kiện Bán" }))
      expect(input("Ngưỡng RSI (dòng 1, Bán)").value).toBe("85")

      await user.click(saveButton(dialog))
      await waitFor(() => expect(patches()).toHaveLength(2))
      expect(lastPatch().expected_revision).toBe(3)
      expect(lastPatch().indicators.rsi).toMatchObject({ buy: { rules: [{ threshold: 25 }, {}] }, sell: { rules: [{ threshold: 85 }, {}] } })
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
    await setValue(user, "Ngưỡng RSI (dòng 1, Mua)", "25")
    await user.click(saveButton(dialog))
    expect(await within(dialog).findByText("Mất kết nối")).toBeTruthy()
    await user.click(saveButton(dialog))
    await waitFor(() => expect(patches()).toHaveLength(2))
    const [first, second] = patches().map((call) => (call.body as unknown as Patch).idempotency_key)
    expect(second).toBe(first)
  })
})

describe("outdated saved config", () => {
  it("says the saved conditions were in the old format and are now the new defaults", async () => {
    world.outdated = true
    renderBot(<BotPanel />)
    expect((await screen.findByText(/mẫu điều kiện cũ/)).textContent).toMatch(/mặc định của mẫu mới/)
  })
})

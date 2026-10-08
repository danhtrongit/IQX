import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderBot, stubBrowser } from "../test-render"
import { callsTo, createFakeApi, createWorld, FakeApiError, type World } from "../test-support"
import { BotPanel } from "./bot-panel"

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, openAuth: vi.fn() }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: mocks.openAuth }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError } = await import("../test-support")
  return { api: mocks.api, ApiError: FakeApiError, errorMessage: (error: unknown) => String(error) }
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

const REGISTRY_ORDER = ["RSI", "MACD", "MA / SMA", "Bollinger Bands", "Khối lượng", "EMA", "MA Cross", "DMI", "Stochastic", "CCI", "OBV", "MFI", "Chaikin Money Flow", "Donchian Channel", "ROC", "Williams %R"]

async function renderPanel(route?: string) {
  const view = renderBot(<BotPanel />, route)
  await screen.findByRole("article", { name: "RSI" })
  return view
}
const row = (name: string) => screen.getByRole("article", { name })
const location = () => screen.getByTestId("location").textContent ?? ""
const patches = () => callsTo(world, "PATCH", "/strategy/shared-config")

describe("Bot panel", () => {
  it("lists the 16 indicators grouped by chapter in registry order, with the opened count in the header", async () => {
    await renderPanel()

    expect(screen.getByRole("heading", { name: "Bot" })).toBeTruthy()
    expect(screen.getByText("5 / 16 chỉ báo đã mở")).toBeTruthy()
    const groups = screen.getAllByRole("region").filter((region) => region.getAttribute("aria-label")?.startsWith("Chương"))
    expect(groups.map((group) => group.querySelector("h3")?.textContent)).toEqual([
      "Chương 1 · Chỉ báo kỹ thuật nền tảng",
      "Chương 5 · Xu hướng và động lượng nâng cao",
      "Chương 7 · Khối lượng và dòng tiền",
      "Chương 10 · Kênh giá và động lượng",
    ])
    const names = screen.getAllByRole("article").map((article) => article.getAttribute("aria-label"))
    expect(names).toEqual(REGISTRY_ORDER)
    expect(groups.map((group) => within(group).getAllByRole("article").length)).toEqual([5, 5, 3, 3])
  })

  it("renders granted indicators with practice, config and an accessible master switch", async () => {
    await renderPanel()
    const rsi = within(row("RSI"))
    expect(rsi.getByText("Đã mở")).toBeTruthy()
    expect(rsi.getByRole("button", { name: /Luyện tập/ })).toBeTruthy()
    expect(rsi.getByRole("button", { name: /Cấu hình/ })).toBeTruthy()
    const toggle = rsi.getByRole("switch", { name: "Bật RSI cho Bot" })
    expect(toggle.getAttribute("aria-checked")).toBe("false")
  })

  it("renders locked indicators with only 'Xem bài' to the right lesson: no practice, config or switch", async () => {
    await renderPanel("/demo-trading?view=bot&symbol=FPT&content=overview")
    const ema = within(row("EMA"))
    expect(ema.getByText("Chưa mở")).toBeTruthy()
    const link = ema.getByRole("link", { name: "Xem bài EMA" })
    const href = new URL(link.getAttribute("href") ?? "", "http://x")
    expect(href.searchParams.get("view")).toBe("academy")
    expect(href.searchParams.get("lesson")).toBe("ch05-l01")
    expect(href.searchParams.get("symbol")).toBe("FPT")
    expect(ema.queryByRole("button")).toBeNull()
    expect(ema.queryByRole("switch")).toBeNull()
    expect(within(row("OBV")).getByRole("link", { name: "Xem bài OBV" }).getAttribute("href")).toContain("lesson=ch07-l01")
  })

  it("sends Luyện tập to view=bot&practice=<indicator> and keeps the other params", async () => {
    const user = userEvent.setup()
    await renderPanel()
    await user.click(within(row("MACD")).getByRole("button", { name: /Luyện tập/ }))
    const search = new URLSearchParams(location().split("?")[1])
    expect(search.get("view")).toBe("bot")
    expect(search.get("practice")).toBe("macd")
    expect(search.get("symbol")).toBe("FPT")
  })

  it("filters by name without diacritics and reports no match", async () => {
    const user = userEvent.setup()
    await renderPanel()
    await user.type(screen.getByRole("searchbox", { name: "Tìm chỉ báo" }), "khoi luong")
    expect(screen.getAllByRole("article").map((article) => article.getAttribute("aria-label"))).toEqual(["Khối lượng"])
    await user.clear(screen.getByRole("searchbox", { name: "Tìm chỉ báo" }))
    await user.type(screen.getByRole("searchbox", { name: "Tìm chỉ báo" }), "zzz")
    expect(screen.getByText("Không tìm thấy chỉ báo.")).toBeTruthy()
  })

  describe("master switch", () => {
    it("ON while both sides are OFF opens the config and Hủy activates nothing", async () => {
      const user = userEvent.setup()
      await renderPanel()
      await user.click(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }))

      const dialog = await screen.findByRole("dialog", { name: /Cấu hình Bot · RSI/ })
      await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
      expect(patches()).toHaveLength(0)
      expect(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }).getAttribute("aria-checked")).toBe("false")
    })

    it("ON with a side already ON saves the master ON and keeps the children untouched", async () => {
      world.indicators.rsi!.buy.enabled = true
      world.savedRevision = 3
      const user = userEvent.setup()
      await renderPanel()
      await user.click(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }))

      await waitFor(() => expect(patches()).toHaveLength(1))
      const body = patches()[0]!.body as { expected_revision: number; idempotency_key: string; indicators: Record<string, { master_enabled: boolean; buy: { enabled: boolean }; sell: { enabled: boolean } }> }
      expect(body.expected_revision).toBe(3)
      expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
      expect(Object.keys(body.indicators)).toEqual(["rsi"])
      expect(body.indicators.rsi).toMatchObject({ master_enabled: true, buy: { enabled: true }, sell: { enabled: false } })
      await waitFor(() => expect(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }).getAttribute("aria-checked")).toBe("true"))
      expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining("Có hiệu lực từ phiên 09/10/2026"))
    })

    it("OFF saves the master OFF and keeps the sides ON", async () => {
      world.indicators.macd!.master_enabled = true
      world.indicators.macd!.buy.enabled = true
      world.indicators.macd!.sell.enabled = true
      world.savedRevision = 1
      const user = userEvent.setup()
      await renderPanel()
      await user.click(within(row("MACD")).getByRole("switch", { name: "Bật MACD cho Bot" }))

      await waitFor(() => expect(patches()).toHaveLength(1))
      const body = patches()[0]!.body as { indicators: { macd: { master_enabled: boolean; buy: { enabled: boolean }; sell: { enabled: boolean } } } }
      expect(body.indicators.macd).toMatchObject({ master_enabled: false, buy: { enabled: true }, sell: { enabled: true } })
    })

    it("reports a conflict without changing the switch and reloads the saved config", async () => {
      world.indicators.rsi!.buy.enabled = true
      world.savedRevision = 3
      world.override["PATCH /strategy/shared-config"] = () => {
        throw new FakeApiError("Cấu hình đã được lưu ở nơi khác.", 409, { code: "REVISION_CONFLICT", details: [{ field: "expected_revision", current_revision: 4 }] })
      }
      const user = userEvent.setup()
      await renderPanel()
      await user.click(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }))
      await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("Đã tải lại bản mới nhất")))
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("Bản mới nhất là #4."))
      expect(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }).getAttribute("aria-checked")).toBe("false")
      await waitFor(() => expect(callsTo(world, "GET", "/strategy/shared-config").length).toBeGreaterThan(1))
    })

    it("names the indicator whose quiz is missing when the server locks it (403 CAPABILITY_LOCKED)", async () => {
      world.indicators.rsi!.buy.enabled = true
      world.override["PATCH /strategy/shared-config"] = () => {
        throw new FakeApiError("Cần hoàn thành bài học của chỉ báo rsi (8/8) trước khi bật.", 403, {
          code: "CAPABILITY_LOCKED",
          details: [{ capability: "indicator:rsi", reason: "not_learned", indicator: "rsi" }],
        })
      }
      const user = userEvent.setup()
      await renderPanel()
      await user.click(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }))
      await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Hoàn thành bài kiểm tra 8/8 của chỉ báo RSI để bật."))
      expect(within(row("RSI")).getByRole("switch", { name: "Bật RSI cho Bot" }).getAttribute("aria-checked")).toBe("false")
    })
  })
})

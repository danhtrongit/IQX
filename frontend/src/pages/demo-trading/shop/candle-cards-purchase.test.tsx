import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resetCandleCardsStore } from "./candle-cards-store"
import { ShopMain } from "./shop-main"
import { apiError, cardsTab, createShopBackend, renderWithProviders, type BackendOptions, type Call, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: ShopBackend

async function setup(options: BackendOptions = {}) {
  backend = createShopBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  const view = renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
  await screen.findByRole("heading", { name: "Thẻ nến" })
  await waitFor(() => expect(screen.queryByTestId("candle-cards-loading")).toBeNull())
  return view
}

const cell = (id: string) => document.querySelector<HTMLElement>(`[data-candle-card="${id}"]`) as HTMLElement
const posts = () => backend.callsTo("POST", "/candle-dojo/cards/")
const cardReads = () => backend.callsTo("GET", "/candle-dojo/cards")
const isCardPurchase = (call: Call) => call.method === "POST" && call.path.startsWith("/candle-dojo/cards/")

async function openDialog(user: ReturnType<typeof userEvent.setup>, id = "marubozu_giam") {
  await user.click(within(cell(id)).getByRole("button", { name: /^Mua/ }))
  return screen.findByRole("dialog", { name: "Mua thẻ nến" })
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  resetCandleCardsStore()
})

describe("Mua thẻ nến: confirmation", () => {
  it("shows the card, its name, the sentence and the balance table, and spends nothing until confirmed", async () => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["marubozu"] })
    const dialog = await openDialog(user)

    expect(within(dialog).getByRole("img", { name: /Bearish Marubozu/ })).toBeTruthy()
    expect(within(dialog).getByRole("heading", { name: "Bearish Marubozu" })).toBeTruthy()
    expect(within(dialog).getByText("Thẻ sẽ hiện trong Flashback khi gặp đúng mẫu nến này.")).toBeTruthy()
    expect(within(dialog).getByText("Số dư hiện tại").nextElementSibling?.textContent).toBe("1.000 xu")
    expect(within(dialog).getByText("Giá thẻ").nextElementSibling?.textContent).toBe("300 xu")
    expect(within(dialog).getByText("Số dư sau khi mua").nextElementSibling?.textContent).toBe("700 xu")
    expect(within(dialog).getByRole("button", { name: "Hủy" })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Mua · 300 xu" })).toBeTruthy()
    expect(posts()).toHaveLength(0)

    await user.click(within(dialog).getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(posts()).toHaveLength(0)
    expect(backend.state.balance).toBe(1_000)
  })
})

describe("Mua thẻ nến: success", () => {
  it("sends the price and catalog version the learner saw, closes, thanks with a toast and moves the card to Đã sở hữu", async () => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["marubozu"] })
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole("button", { name: "Mua · 300 xu" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(posts()).toHaveLength(1)
    expect(posts()[0].path).toBe("/candle-dojo/cards/marubozu_giam/purchase")
    expect(posts()[0].body).toEqual({ expected_price_xu: 300, catalog_version: "iqx-candle-dojo-v1" })
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã thêm Bearish Marubozu vào kho thẻ.")
    expect(backend.state.balance).toBe(700)

    // The card left the shop tab (marubozu_tang is still for sale) and is in the vault.
    await waitFor(() => expect(cell("marubozu_giam")).toBeNull())
    expect(cell("marubozu_tang")).toBeTruthy()
    expect(screen.getByTestId("candle-cards-owned-count").textContent).toBe("1 / 47 đã sở hữu")
    await user.click(cardsTab("Đã sở hữu"))
    expect(cell("marubozu_giam").getAttribute("data-candle-state")).toBe("owned")
    // The balance is read again everywhere: the wallet strip shows what the server now says.
    await waitFor(() => expect(screen.getByTestId("shop-mobile-wallet").textContent).toContain("700 xu"))
  })

  it("writes the purchase to the coin ledger as a debit named after the card", async () => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["doji"] })
    await user.click(within(await openDialog(user, "doji")).getByRole("button", { name: "Mua · 300 xu" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const row = backend.state.ledger.at(-1)
    expect(row?.kind).toBe("card_purchase")
    expect(row?.delta).toBe(-300)
    expect(row?.label.card_name).toBe("Doji")
  })

  it("sends a single purchase however many times the confirm button is clicked while it is in flight", async () => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["marubozu"] })
    let release: (() => void) | undefined
    mocks.api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path.startsWith("/candle-dojo/cards/")) return new Promise((resolve) => { release = () => resolve(backend.handle(path, init)) })
      return backend.handle(path, init)
    })
    const sent = () => mocks.api.mock.calls.filter(([path, init]) => init?.method === "POST" && String(path).startsWith("/candle-dojo/cards/")).length
    const dialog = await openDialog(user)
    const confirm = within(dialog).getByRole("button", { name: "Mua · 300 xu" })
    await user.dblClick(confirm)
    await user.click(confirm)
    expect((await within(dialog).findByRole("button", { name: "Đang mua…" }) as HTMLButtonElement).disabled).toBe(true)
    expect(sent()).toBe(1)
    expect((within(dialog).getByRole("button", { name: "Hủy" }) as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect(release).toBeDefined())
    release?.()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(posts()).toHaveLength(1)
    expect(backend.state.balance).toBe(700)
  })
})

describe("Mua thẻ nến: refusals use the Shop's own error style and the spec's sentences", () => {
  it.each([
    ["CARD_OWNED", "Bạn đã có thẻ này. Không trừ thêm xu."],
    ["CARD_LOCKED", "Học xong bài ở Candle Dojo để mở thẻ này."],
    ["INSUFFICIENT_XU", "Số xu hiện tại không đủ. Không thực hiện giao dịch."],
  ])("%s shows its sentence in the dialog, offers only Đóng and charges nothing", async (code, message) => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["marubozu"] })
    backend.intercept(isCardPurchase, () => { throw apiError(409, code, "thông điệp của máy chủ", code === "INSUFFICIENT_XU" ? [{ balance_xu: 100, price_xu: 300, shortfall_xu: 200 }] : undefined) })
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole("button", { name: "Mua · 300 xu" }))

    const alert = await within(dialog).findByRole("alert")
    expect(alert.textContent).toBe(message)
    expect(alert.className).toContain("text-destructive")
    expect(within(dialog).queryByRole("button", { name: /^Mua/ })).toBeNull()
    // The corner X and the footer Đóng are the only ways out.
    const closers = within(dialog).getAllByRole("button", { name: "Đóng" })
    expect(closers).toHaveLength(2)
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(backend.state.balance).toBe(1_000)

    await user.click(closers[1])
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it.each([
    ["PRICE_CHANGED", "Giá thẻ đã thay đổi. Đã cập nhật, vui lòng xác nhận lại."],
    ["CATALOG_CHANGED", "Bộ thẻ đã thay đổi. Đã cập nhật, vui lòng xác nhận lại."],
  ])("%s rereads the cards, keeps the dialog open and asks to confirm again", async (code, message) => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["marubozu"] })
    backend.intercept(isCardPurchase, () => { throw apiError(409, code, "x", [{ current_price_xu: 300, catalog_version: "iqx-candle-dojo-v1" }]) })
    const dialog = await openDialog(user)
    const readsBefore = cardReads().length
    await user.click(within(dialog).getByRole("button", { name: "Mua · 300 xu" }))

    expect((await within(dialog).findByRole("alert")).textContent).toBe(message)
    await waitFor(() => expect(cardReads().length).toBeGreaterThan(readsBefore))
    // Confirming again goes through at the price the learner now sees.
    await user.click(within(dialog).getByRole("button", { name: "Mua · 300 xu" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(posts()).toHaveLength(2)
    expect(backend.state.balance).toBe(700)
  })

  it("a purchase that fails for another reason says so and can be tried again", async () => {
    const user = userEvent.setup()
    await setup({ balance: 1_000, learnedLessons: ["marubozu"] })
    backend.intercept(isCardPurchase, () => { throw new Error("mạng chập chờn") })
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole("button", { name: "Mua · 300 xu" }))
    expect((await within(dialog).findByRole("alert")).textContent).toBe("mạng chập chờn")
    expect((within(dialog).getByRole("button", { name: "Mua · 300 xu" }) as HTMLButtonElement).disabled).toBe(false)
    expect(backend.state.balance).toBe(1_000)
  })
})

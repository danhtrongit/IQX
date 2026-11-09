import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resetCandleCardsStore } from "./candle-cards-store"
import { ShopMain } from "./shop-main"
import { apiError, cardsTab, createShopBackend, mascotTab, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: ShopBackend

async function setup(options: BackendOptions = {}, before?: (server: ShopBackend) => void) {
  backend = createShopBackend(options)
  before?.(backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  const view = renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
  await screen.findByRole("heading", { name: "Thẻ nến" })
  await waitFor(() => expect(screen.queryByTestId("candle-cards-loading")).toBeNull())
  return view
}

const cell = (id: string) => document.querySelector<HTMLElement>(`[data-candle-card="${id}"]`) as HTMLElement
const shownIds = () => Array.from(document.querySelectorAll("[data-candle-card]")).map((node) => node.getAttribute("data-candle-card"))
const tierLines = () => Array.from(document.querySelectorAll("[data-candle-tier]")).map((node) => node.firstElementChild?.firstElementChild?.textContent)

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  resetCandleCardsStore()
})

describe("Thẻ nến section: head, tabs and empty states", () => {
  it("sits under the Linh thú grid with the title, the owned count and its own tabs", async () => {
    await setup({ learnedLessons: ["marubozu"], ownedCards: ["marubozu_tang"] })
    const section = screen.getByTestId("candle-cards-section")
    const mascots = screen.getByTestId("shop-main").querySelector("[data-shop-card]") as HTMLElement
    // The Linh thú grid comes first, the Thẻ nến section follows it, set off by a rule.
    expect(mascots.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(section.className).toContain("border-t")
    expect(within(section).getByRole("heading", { name: "Thẻ nến" })).toBeTruthy()
    expect(screen.getByTestId("candle-cards-owned-count").textContent).toBe("1 / 47 đã sở hữu")
    expect(within(screen.getByRole("tablist", { name: "Thẻ nến" })).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Cửa hàng", "Đã sở hữu"])
    expect(cardsTab("Cửa hàng").getAttribute("aria-selected")).toBe("true")
  })

  it("keeps a tab state of its own: switching one collection never switches the other", async () => {
    const user = userEvent.setup()
    await setup({ learnedLessons: ["marubozu"], ownedCards: ["marubozu_tang"] })
    await user.click(cardsTab("Đã sở hữu"))
    expect(cardsTab("Đã sở hữu").getAttribute("aria-selected")).toBe("true")
    expect(mascotTab("Cửa hàng").getAttribute("aria-selected")).toBe("true")
    await user.click(mascotTab("Đã sở hữu"))
    await user.click(cardsTab("Cửa hàng"))
    expect(mascotTab("Đã sở hữu").getAttribute("aria-selected")).toBe("true")
    expect(cardsTab("Cửa hàng").getAttribute("aria-selected")).toBe("true")
  })

  it("says to learn a lesson first when no lesson is learned yet, and that the vault is empty on the owned tab", async () => {
    const user = userEvent.setup()
    await setup()
    expect(screen.getByTestId("candle-cards-empty").textContent).toBe("Chưa có thẻ nào. Học xong một bài ở Candle Dojo để mở thẻ của bài đó.")
    expect(shownIds()).toEqual([])
    await user.click(cardsTab("Đã sở hữu"))
    expect(screen.getByTestId("candle-cards-empty").textContent).toBe("Kho thẻ trống. Mua thẻ ở tab Cửa hàng.")
  })

  it("says everything is bought once every card of the learned lessons is owned", async () => {
    await setup({ learnedLessons: ["doji"], ownedCards: ["doji"] })
    expect(screen.getByTestId("candle-cards-empty").textContent).toBe("Bạn đã mua hết thẻ của các bài đã học.")
  })
})

describe("Thẻ nến section: Cửa hàng and Đã sở hữu", () => {
  it("Cửa hàng lists only learned, unowned cards, grouped by tier with the tier line and its price", async () => {
    await setup({ balance: 5_000, learnedLessons: ["marubozu", "engulfing", "star"], ownedCards: ["marubozu_tang"] })
    // doji and the other lessons are not learned: their cards are not for sale; marubozu_tang is owned.
    expect(shownIds()).toEqual(["marubozu_giam", "nhan_chim_tang", "nhan_chim_giam", "sao_mai", "sao_hom"])
    expect(tierLines()).toEqual(["1 NẾN", "2 NẾN", "3 NẾN"])
    const groups = Array.from(document.querySelectorAll("[data-candle-tier]"))
    expect(groups.map((group) => group.firstElementChild?.lastElementChild?.textContent)).toEqual(["300 xu", "600 xu", "1.000 xu"])
    expect(cell("sao_mai").textContent).toContain("Morning Star")
    expect(cell("sao_mai").textContent).toContain("1.000 xu")
    // The picture of the cell is the card itself.
    expect(within(cell("sao_mai")).getByRole("img", { name: /Morning Star/ })).toBeTruthy()
  })

  it("every cell is Mua with enough xu and Chưa đủ xu (locked, no purchase) without", async () => {
    const user = userEvent.setup()
    await setup({ balance: 400, learnedLessons: ["marubozu", "engulfing"] })
    const buy = within(cell("marubozu_giam")).getByRole("button", { name: /^Mua/ }) as HTMLButtonElement
    expect(buy.textContent).toBe("Mua")
    expect(buy.disabled).toBe(false)
    expect(cell("marubozu_giam").getAttribute("data-candle-state")).toBe("buy")

    const short = within(cell("nhan_chim_tang")).getByRole("button") as HTMLButtonElement
    expect(short.textContent).toBe("Chưa đủ xu")
    expect(short.disabled).toBe(true)
    expect(cell("nhan_chim_tang").getAttribute("data-candle-state")).toBe("short")
    expect(cell("nhan_chim_tang").textContent).toContain("600 xu")

    await user.click(short)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(backend.callsTo("POST", "/candle-dojo/cards/")).toHaveLength(0)
  })

  it("Đã sở hữu lists the owned cards by tier with a count, no price and no button, and marks the ones met in Flashback", async () => {
    const user = userEvent.setup()
    await setup({ learnedLessons: ["marubozu", "engulfing"], ownedCards: ["marubozu_tang", "marubozu_giam", "nhan_chim_tang"], seenCards: ["marubozu_tang"] })
    await user.click(cardsTab("Đã sở hữu"))
    expect(shownIds()).toEqual(["marubozu_tang", "marubozu_giam", "nhan_chim_tang"])
    const groups = Array.from(document.querySelectorAll("[data-candle-tier]"))
    expect(groups.map((group) => group.firstElementChild?.lastElementChild?.textContent)).toEqual(["2 thẻ", "1 thẻ"])
    for (const id of shownIds()) {
      expect(within(cell(id!)).queryByRole("button")).toBeNull()
      expect(cell(id!).textContent).toContain("Đã sở hữu")
      expect(cell(id!).textContent).not.toMatch(/\bxu\b/)
      expect(cell(id!).getAttribute("data-candle-state")).toBe("owned")
    }
    expect(within(cell("marubozu_tang")).getByText("Đã gặp")).toBeTruthy()
    expect(within(cell("marubozu_giam")).queryByText("Đã gặp")).toBeNull()
    expect(within(cell("nhan_chim_tang")).queryByText("Đã gặp")).toBeNull()
  })

  it("lays the cells out on a grid of 132 px cells that is two columns on a phone", async () => {
    await setup({ learnedLessons: ["marubozu"] })
    const grid = cell("marubozu_giam").parentElement as HTMLElement
    expect(grid.className).toContain("grid-cols-[repeat(auto-fill,minmax(132px,1fr))]")
    expect(grid.className).toContain("max-[650px]:grid-cols-2")
  })

  it("leaves the Linh thú part of the Shop untouched", async () => {
    await setup({ balance: 500, learnedLessons: ["marubozu"] })
    expect(screen.getByTestId("shop-owned-count").textContent).toBe("1 / 5 đã sở hữu")
    expect(Array.from(document.querySelectorAll("[data-shop-card]")).map((node) => node.getAttribute("data-shop-card"))).toEqual(["thanh_long", "loc_huou", "phung_hoang", "kim_quy"])
  })
})

describe("Thẻ nến section: loading and errors never break the rest of the Shop", () => {
  it("shows its own skeleton while the cards load and the Linh thú part is already usable", async () => {
    let release: (() => void) | undefined
    backend = createShopBackend({ learnedLessons: ["doji"] })
    mocks.api.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/candle-dojo/cards") return new Promise((resolve) => { release = () => resolve(backend.handle(path, init)) })
      return backend.handle(path, init)
    })
    renderWithProviders(<ShopMain onNavigate={vi.fn()} />)
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
    expect(screen.getByTestId("candle-cards-loading")).toBeTruthy()
    expect(screen.queryByTestId("candle-cards-owned-count")).toBeNull()
    expect(document.querySelector("[data-shop-card]")).toBeTruthy()
    await waitFor(() => expect(release).toBeDefined())
    release?.()
    await waitFor(() => expect(cell("doji")).toBeTruthy())
    expect(screen.queryByTestId("candle-cards-loading")).toBeNull()
  })

  it("a failed or malformed cards read is an alert with retry in the section only, never an empty vault", async () => {
    const user = userEvent.setup()
    await setup({ balance: 900, learnedLessons: ["doji"] }, (server) => {
      server.intercept((call) => call.path === "/candle-dojo/cards", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    })
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chưa tải được thẻ nến")
    expect(screen.getByTestId("candle-cards-section").contains(alert)).toBe(true)
    expect(screen.queryByTestId("candle-cards-empty")).toBeNull()
    expect(screen.queryByTestId("candle-cards-owned-count")).toBeNull()
    // Linh thú and the balance are unaffected.
    expect(document.querySelectorAll("[data-shop-card]")).toHaveLength(4)
    expect(screen.getByTestId("shop-mobile-wallet").textContent).toContain("900 xu")

    backend.intercept((call) => call.path === "/candle-dojo/cards", () => ({}))
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Chưa tải được thẻ nến")

    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Thử lại" }))
    await waitFor(() => expect(cell("doji")).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

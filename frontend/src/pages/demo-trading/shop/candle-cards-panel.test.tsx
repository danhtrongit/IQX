import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceFrameContext, type WorkspaceFrameState } from "@/components/layout/workspace-frame-context"
import { resetCandleCardsStore } from "./candle-cards-store"
import { ShopMain } from "./shop-main"
import { ShopPanel } from "./shop-panel"
import { apiError, cardsTab, createShopBackend, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("../journey/mascot-2d/Mascot2DStage", () => ({
  Mascot2DStage: ({ mascotId }: { mascotId: string }) => <div data-testid="mascot-2d" data-mascot={mascotId} />,
}))

let backend: ShopBackend
const scrollIntoView = vi.fn()
const original = Element.prototype.scrollIntoView

function connect(options: BackendOptions, before?: (server: ShopBackend) => void) {
  backend = createShopBackend(options)
  before?.(backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
}

const OWNED = { balance: 500, learnedLessons: ["marubozu", "doji", "engulfing", "star"], ownedCards: ["marubozu_tang", "doji", "nhan_chim_tang", "sao_mai"], seenCards: ["doji"] }

beforeEach(() => {
  mocks.api.mockReset()
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
  resetCandleCardsStore()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

afterEach(() => {
  Element.prototype.scrollIntoView = original
  vi.unstubAllGlobals()
})

describe("Shop panel: Thẻ nến block", () => {
  it("shows THẺ NẾN with the owned count and five tier backs that each carry their tier's count", async () => {
    connect(OWNED)
    renderWithProviders(<ShopPanel onNavigate={vi.fn()} />)
    const block = await screen.findByTestId("shop-candle-cards")
    await waitFor(() => expect(within(block).queryByTestId("shop-candle-cards-loading")).toBeNull())

    expect(within(block).getByRole("heading", { name: "Thẻ nến 4 / 47" })).toBeTruthy()
    expect(within(block).getByRole("heading").textContent).toBe("Thẻ nến4 / 47")
    const backs = Array.from(block.querySelectorAll("[data-candle-tier-back]"))
    expect(backs.map((back) => back.getAttribute("data-candle-tier-back"))).toEqual(["1", "2", "3", "4", "5"])
    expect(backs.map((back) => back.textContent)).toEqual(["2", "1", "1", "0", "0"])
    expect(backs.map((back) => back.getAttribute("aria-label"))).toEqual(["1 NẾN: 2 thẻ", "2 NẾN: 1 thẻ", "3 NẾN: 1 thẻ", "4 NẾN: 0 thẻ", "5 NẾN TRỞ LÊN: 0 thẻ"])
    // Each back wears the metal gradient of its tier colour.
    expect((backs[0] as HTMLElement).style.getPropertyValue("--c1")).toBe("#2F7BF5")
    expect((backs[4] as HTMLElement).style.getPropertyValue("--c1")).toBe("#E5352B")
    expect(within(block).getByRole("button", { name: "Xem kho thẻ" })).toBeTruthy()
  })

  it("sits directly above Hoàn thành bài học and leaves the other blocks where they were", async () => {
    connect(OWNED)
    renderWithProviders(<ShopPanel onNavigate={vi.fn()} />)
    await screen.findByTestId("shop-owned-list")
    const block = await screen.findByTestId("shop-candle-cards")
    expect(block.nextElementSibling?.textContent).toContain("Hoàn thành bài học")
    expect(block.previousElementSibling?.querySelector("[data-testid=shop-owned-list]")).toBeTruthy()
    expect(screen.getByTestId("shop-wallet")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Vào Học viện/ })).toBeTruthy()
  })

  it("Xem kho thẻ → opens the Đã sở hữu tab of the Thẻ nến section in the main area and scrolls to it", async () => {
    const user = userEvent.setup()
    connect(OWNED)
    renderWithProviders(<><ShopMain onNavigate={vi.fn()} /><ShopPanel onNavigate={vi.fn()} /></>)
    await screen.findByTestId("candle-cards-owned-count")
    expect(cardsTab("Cửa hàng").getAttribute("aria-selected")).toBe("true")
    expect(document.querySelector("[data-candle-card=doji]")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Xem kho thẻ" }))
    expect(cardsTab("Đã sở hữu").getAttribute("aria-selected")).toBe("true")
    expect(Array.from(document.querySelectorAll("[data-candle-card]")).map((node) => node.getAttribute("data-candle-card"))).toEqual(["marubozu_tang", "doji", "nhan_chim_tang", "sao_mai"])
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).getAttribute("data-testid")).toBe("candle-cards-section")
    expect(document.activeElement).toBe(screen.getByTestId("candle-cards-section"))

    // Pressed again while the tab is already open: it still brings the section into view.
    await user.click(screen.getByRole("button", { name: "Xem kho thẻ" }))
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2))
  })

  it("on a phone the slide-over panel closes so the section is what the learner sees", async () => {
    const user = userEvent.setup()
    connect(OWNED)
    const setOpen = vi.fn()
    const frame = { open: true, overlay: true, railBar: true, collapsed: false, panelId: "p", panelLabel: "Shop", setOpen, revealPanel: vi.fn() } satisfies WorkspaceFrameState
    renderWithProviders(<WorkspaceFrameContext.Provider value={frame}><ShopMain onNavigate={vi.fn()} /><ShopPanel onNavigate={vi.fn()} /></WorkspaceFrameContext.Provider>)
    await screen.findByTestId("candle-cards-owned-count")
    await user.click(screen.getByRole("button", { name: "Xem kho thẻ" }))
    expect(setOpen).toHaveBeenCalledWith(false)
    expect(cardsTab("Đã sở hữu").getAttribute("aria-selected")).toBe("true")
  })

  it("a failed cards read is an alert with retry inside the block only; the balance stays", async () => {
    const user = userEvent.setup()
    connect({ ...OWNED, balance: 640 }, (server) => {
      server.intercept((call) => call.path === "/candle-dojo/cards", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    })
    renderWithProviders(<ShopPanel onNavigate={vi.fn()} />)
    expect((await screen.findByTestId("shop-balance")).textContent).toBe("640")
    const block = screen.getByTestId("shop-candle-cards")
    const alert = await within(block).findByRole("alert")
    expect(alert.textContent).toContain("Chưa tải được thẻ nến")
    expect(within(block).queryByRole("button", { name: "Xem kho thẻ" })).toBeNull()
    expect(block.querySelector("[data-candle-tier-back]")).toBeNull()

    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    await waitFor(() => expect(block.querySelectorAll("[data-candle-tier-back]")).toHaveLength(5))
  })
})

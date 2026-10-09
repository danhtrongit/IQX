import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ShopMain } from "./shop-main"
import { CATALOG_VERSION, apiError, createShopBackend, renderWithProviders, type BackendOptions, type Call, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))

let backend: ShopBackend
const onNavigate = vi.fn()

async function setup(options: BackendOptions = {}) {
  backend = createShopBackend(options)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  const view = renderWithProviders(<ShopMain onNavigate={onNavigate} />)
  await screen.findByRole("heading", { name: "Linh thú" })
  return view
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-shop-card="${id}"]`) as HTMLElement
const posts = () => backend.callsTo("POST", "/shop/purchases")
const puts = () => backend.callsTo("PUT", "/shop/active-mascot")
const isPurchaseStatus = (call: Call) => call.method === "GET" && call.path.startsWith("/shop/purchases/")

async function openDialog(user: ReturnType<typeof userEvent.setup>, id = "thanh_long") {
  await user.click(within(card(id)).getByRole("button", { name: "Mua" }))
  return screen.findByRole("dialog")
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  onNavigate.mockReset()
})

describe("purchase confirmation", () => {
  it("shows name, picture, current balance, price and the balance after, and spends nothing until confirmed", async () => {
    const user = userEvent.setup()
    await setup({ balance: 750 })
    const dialog = await openDialog(user)

    expect(within(dialog).getByRole("heading", { name: "Thanh Long" })).toBeTruthy()
    expect(within(dialog).getByRole("img", { name: "Linh thú Thanh Long" }).getAttribute("src")).toContain("/assets/mascots-2d/v2/thanh-long/poster.webp")
    expect(within(dialog).getByText("Số dư hiện tại").nextElementSibling?.textContent).toBe("750 xu")
    expect(within(dialog).getByText("Giá linh thú").nextElementSibling?.textContent).toBe("500 xu")
    expect(within(dialog).getByText("Số dư sau khi mua").nextElementSibling?.textContent).toBe("250 xu")
    expect(within(dialog).getByRole("button", { name: "Hủy" })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Mua · 500 xu" })).toBeTruthy()
    expect(posts()).toHaveLength(0)
  })

  it("Hủy and Escape close it without any purchase, and the card is unchanged", async () => {
    const user = userEvent.setup()
    await setup()
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await openDialog(user)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(posts()).toHaveLength(0)
    expect(card("thanh_long").getAttribute("data-card-state")).toBe("buy")
    expect(backend.state.balance).toBe(500)
  })

  it("returns keyboard focus to the card after closing", async () => {
    const user = userEvent.setup()
    await setup()
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(card("thanh_long").contains(document.activeElement)).toBe(true))
  })
})

describe("successful purchase", () => {
  it("sends the confirmed values with an idempotency key, then shows Đã sở hữu, the new balance, Để sau / Sử dụng - and never activates", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole("button", { name: "Mua · 500 xu" }))

    const done = await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body).toEqual({
      mascot_id: "thanh_long",
      expected_price_xu: 500,
      catalog_version: CATALOG_VERSION,
      idempotency_key: expect.stringMatching(/^[A-Za-z0-9._:-]{8,128}$/),
    })
    expect(within(done).getByText("Xu còn lại").nextElementSibling?.textContent).toBe("0 xu")
    expect(within(done).getByRole("button", { name: "Để sau" })).toBeTruthy()
    expect(within(done).getByRole("button", { name: "Sử dụng" })).toBeTruthy()
    expect(puts()).toHaveLength(0)
    expect(backend.state.active).toBe("bach_ho")

    await user.click(within(done).getByRole("button", { name: "Để sau" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(puts()).toHaveLength(0)
    await waitFor(() => expect(card("thanh_long").getAttribute("data-card-state")).toBe("owned"))
    expect(screen.getByTestId("shop-owned-count").textContent).toBe("2 / 5 đã sở hữu")
    expect(card("loc_huou").getAttribute("data-card-state")).toBe("short")
  })

  it("Sử dụng after buying switches the mascot with the revision it read, then closes", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    const done = await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    await user.click(within(done).getByRole("button", { name: "Sử dụng" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(puts()).toHaveLength(1)
    expect(puts()[0].body).toEqual({ mascot_id: "thanh_long", expected_revision: 1 })
    expect(mocks.toast.success).toHaveBeenCalledWith("Đang sử dụng Thanh Long", expect.anything())
    await waitFor(() => expect(card("thanh_long").getAttribute("data-card-state")).toBe("active"))
  })

  it("locks the confirm button and cannot be dismissed while the request is in flight", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    let release: (() => void) | undefined
    backend.intercept((call) => call.method === "POST", (call) => new Promise((resolve) => {
      release = () => resolve(backend.handle(call.path, { method: "POST", body: JSON.stringify(call.body) }))
    }))
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))

    const pending = await screen.findByRole("button", { name: "Đang mua…" })
    expect((pending as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Hủy" }) as HTMLButtonElement).disabled).toBe(true)
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeTruthy()
    await user.click(pending)
    expect(posts()).toHaveLength(1)

    await waitFor(() => expect(release).toBeDefined())
    release?.()
    expect(await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })).toBeTruthy()
  })
})

describe("refusals", () => {
  it("INSUFFICIENT_XU shows the new balance, charges nothing and points to the Học viện", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    await openDialog(user)
    backend.state.balance = 120

    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    const dialog = screen.getByRole("dialog")
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Chưa đủ xu: bạn có 120 xu, cần 500 xu.")
    expect(posts()).toHaveLength(1)
    expect(within(dialog).queryByRole("button", { name: /^Mua/ })).toBeNull()
    await waitFor(() => expect(within(dialog).getByText("Số dư hiện tại").nextElementSibling?.textContent).toBe("120 xu"))

    await user.click(within(dialog).getByRole("button", { name: "Vào Học viện" }))
    expect(onNavigate).toHaveBeenCalledWith("academy")
    expect(backend.state.owned).toEqual(["bach_ho"])
    expect(backend.state.balance).toBe(120)
  })

  it("PRICE_CHANGED refreshes the price and needs a new confirmation before anything is charged", async () => {
    const user = userEvent.setup()
    await setup({ balance: 1_000 })
    await openDialog(user)
    backend.state.price = 600

    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    const dialog = screen.getByRole("dialog")
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Giá linh thú đã thay đổi, hiện là 600 xu")
    await within(dialog).findByRole("button", { name: "Mua · 600 xu" })
    expect(within(dialog).getByText("Giá linh thú").nextElementSibling?.textContent).toBe("600 xu")
    expect(within(dialog).getByText("Số dư sau khi mua").nextElementSibling?.textContent).toBe("400 xu")
    expect(posts()).toHaveLength(1)
    expect(backend.state.balance).toBe(1_000)

    await user.click(within(dialog).getByRole("button", { name: "Mua · 600 xu" }))
    await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body?.expected_price_xu).toBe(600)
    expect(posts()[1].body?.idempotency_key).not.toBe(posts()[0].body?.idempotency_key)
    expect(backend.state.balance).toBe(400)
  })

  it("CATALOG_CHANGED refreshes and asks again", async () => {
    const user = userEvent.setup()
    await setup()
    await openDialog(user)
    backend.intercept((call) => call.method === "POST", () => {
      throw apiError(409, "CATALOG_CHANGED", "Danh mục linh thú đã thay đổi", [{ catalog_version: CATALOG_VERSION }])
    })
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    const dialog = screen.getByRole("dialog")
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Danh mục linh thú đã thay đổi")
    expect(backend.state.owned).toEqual(["bach_ho"])
    await user.click(within(dialog).getByRole("button", { name: "Mua · 500 xu" }))
    await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    expect(posts()).toHaveLength(2)
  })

  it("a mascot already owned elsewhere is reported as owned, with no extra charge", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    await openDialog(user)
    backend.state.owned.push("thanh_long")

    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    const done = await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    expect(done.textContent).toContain("Đã sở hữu. Không trừ thêm xu.")
    expect(within(done).getByText("Xu còn lại").nextElementSibling?.textContent).toBe("500 xu")
    expect(backend.state.balance).toBe(500)
    expect(backend.state.ledger).toHaveLength(0)
  })

  it("a refusal from the server keeps the dialog open with the server's message and no success", async () => {
    const user = userEvent.setup()
    await setup()
    backend.intercept((call) => call.method === "POST", () => { throw apiError(422, "VALIDATION_ERROR", "Dữ liệu yêu cầu không hợp lệ") })
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Dữ liệu yêu cầu không hợp lệ")
    expect(screen.queryByRole("dialog", { name: /Đã sở hữu/ })).toBeNull()
    expect(card("thanh_long").getAttribute("data-card-state")).toBe("buy")
  })
})

describe("lost responses (timeout / network error)", () => {
  it("looks the key up first and, when it never committed, retries with the SAME idempotency key", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    backend.intercept((call) => call.method === "POST", () => { throw new TypeError("Failed to fetch") })
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))

    const retry = await screen.findByRole("button", { name: "Thử lại · 500 xu" })
    expect(posts()).toHaveLength(1)
    const key = posts()[0].body?.idempotency_key as string
    const statusCalls = backend.calls.filter(isPurchaseStatus)
    expect(statusCalls).toHaveLength(1)
    expect(statusCalls[0].path).toBe(`/shop/purchases/${encodeURIComponent(key)}`)
    expect(screen.getByRole("alert").textContent).toContain("chưa được ghi nhận")

    await user.click(retry)
    await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body?.idempotency_key).toBe(key)
    expect(backend.state.balance).toBe(0)
    // The order matters: no second purchase before the lookup answered.
    const order = backend.calls.filter((call) => call.method === "POST" || isPurchaseStatus(call)).map((call) => call.method + (call.path.startsWith("/shop/purchases/") ? " status" : ""))
    expect(order).toEqual(["POST", "GET status", "POST"])
  })

  it("when the lookup says it committed, shows success without a second purchase", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    backend.intercept((call) => call.method === "POST", (call) => {
      backend.commitPurchase("thanh_long", call.body?.idempotency_key as string)
      throw new TypeError("Failed to fetch")
    })
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))

    const done = await screen.findByRole("dialog", { name: "Đã sở hữu Thanh Long" })
    expect(posts()).toHaveLength(1)
    expect(within(done).getByText("Xu còn lại").nextElementSibling?.textContent).toBe("0 xu")
    expect(backend.state.balance).toBe(0)
    expect(puts()).toHaveLength(0)
  })

  it("a server fault (500) is also checked before another attempt is allowed", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    backend.intercept((call) => call.method === "POST", () => { throw apiError(500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống") })
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    await screen.findByRole("button", { name: "Thử lại · 500 xu" })
    expect(backend.calls.filter(isPurchaseStatus)).toHaveLength(1)
  })

  it("when even the lookup fails, offers only a re-check - never a new purchase", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    backend.intercept((call) => call.method === "POST", () => { throw new TypeError("Failed to fetch") })
    backend.intercept(isPurchaseStatus, () => { throw new TypeError("Failed to fetch") })
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))

    const dialog = screen.getByRole("dialog")
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Chưa xác định được giao dịch")
    expect(within(dialog).queryByRole("button", { name: /^Mua|Thử lại/ })).toBeNull()
    await user.click(within(dialog).getByRole("button", { name: "Kiểm tra lại" }))
    await within(dialog).findByRole("button", { name: "Thử lại · 500 xu" })
    expect(posts()).toHaveLength(1)
  })

  it("every time the dialog opens it gets its own key", async () => {
    const user = userEvent.setup()
    await setup({ balance: 500 })
    backend.intercept((call) => call.method === "POST", () => { throw new TypeError("Failed to fetch") }, false)
    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    await screen.findByRole("button", { name: "Thử lại · 500 xu" })
    await user.click(screen.getByRole("button", { name: "Hủy" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await openDialog(user)
    await user.click(screen.getByRole("button", { name: "Mua · 500 xu" }))
    await screen.findByRole("button", { name: "Thử lại · 500 xu" })
    expect(posts()).toHaveLength(2)
    expect(posts()[1].body?.idempotency_key).not.toBe(posts()[0].body?.idempotency_key)
  })
})

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LedgerItem } from "./shop-api"
import { HistoryDialog } from "./history-dialog"
import { apiError, createShopBackend, ledgerItem, renderWithProviders, type BackendOptions, type ShopBackend } from "./shop-test-support"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let backend: ShopBackend

function setup(options: BackendOptions = {}, before?: (backend: ShopBackend) => void) {
  backend = createShopBackend(options)
  before?.(backend)
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return renderWithProviders(<HistoryDialog open onOpenChange={vi.fn()} />)
}

const ledgerCalls = () => backend.callsTo("GET", "/shop/coin-ledger")
const rowSeqs = () => Array.from(document.querySelectorAll("tr[data-ledger-seq]")).map((row) => Number(row.getAttribute("data-ledger-seq")))

function rewards(count: number): LedgerItem[] {
  return Array.from({ length: count }, (_, index) => ledgerItem(index + 1))
}

beforeEach(() => {
  mocks.api.mockReset()
})

describe("coin history", () => {
  it("shows time, content, signed xu and the balance after each entry, newest first", async () => {
    const purchase = ledgerItem(3, {
      kind: "mascot_purchase", delta: -500, balance_after: 0, created_at: "2026-10-08T09:18:00.000Z",
      label: { lesson_key: null, lesson_id: null, mascot_id: "thanh_long", mascot_name: "Thanh Long" },
    })
    setup({
      balance: 0,
      ledger: [
        ledgerItem(1, { balance_after: 100, label: { lesson_key: "technical:l1", lesson_id: "ch01-l01", mascot_id: null, mascot_name: null } }),
        ledgerItem(2, { balance_after: 500, delta: 400 }),
        purchase,
      ],
    })

    const rows = await screen.findAllByRole("row")
    // header + 3 entries
    expect(rows).toHaveLength(4)
    const first = within(rows[1]).getAllByRole("cell")
    expect(first[0].textContent).toBe("8/10/202616:18")
    expect(first[1].textContent).toBe("Mua Thanh Long")
    expect(first[2].textContent).toBe("−500")
    expect(first[3].textContent).toBe("0")
    const last = within(rows[3]).getAllByRole("cell")
    expect(last[1].textContent).toBe("Hoàn thành bài RSI")
    expect(last[2].textContent).toBe("+100")
    expect(last[3].textContent).toBe("100")
    expect(screen.getByRole("columnheader", { name: "Số dư" })).toBeTruthy()
  })

  it("summarises balance, received and spent from the server's totals over the whole history", async () => {
    setup({ balance: 200, ledger: [...rewards(25), ledgerItem(26, { kind: "mascot_purchase", delta: -500, balance_after: 200, label: { lesson_key: null, lesson_id: null, mascot_id: "kim_quy", mascot_name: "Kim Quy" } })] })
    await screen.findAllByRole("row")
    const dialog = screen.getByRole("dialog", { name: "Lịch sử xu" })
    expect(within(dialog).getAllByText("Số dư")[0].nextElementSibling?.textContent).toBe("200 xu")
    expect(within(dialog).getByText("Đã nhận").nextElementSibling?.textContent).toBe("+2.500 xu")
    expect(within(dialog).getByText("Đã sử dụng").nextElementSibling?.textContent).toBe("−500 xu")
  })

  it("pages through the whole ledger by cursor without losing or repeating a row", async () => {
    const user = userEvent.setup()
    setup({ ledger: rewards(45) })
    await waitFor(() => expect(rowSeqs()).toHaveLength(20))
    expect(rowSeqs()[0]).toBe(45)
    expect(ledgerCalls()[0].path).toBe("/shop/coin-ledger?limit=20")

    await user.click(screen.getByRole("button", { name: "Xem thêm" }))
    await waitFor(() => expect(rowSeqs()).toHaveLength(40))
    expect(ledgerCalls()[1].path).toBe("/shop/coin-ledger?limit=20&cursor=26")

    await user.click(screen.getByRole("button", { name: "Xem thêm" }))
    await waitFor(() => expect(rowSeqs()).toHaveLength(45))
    expect(ledgerCalls()[2].path).toBe("/shop/coin-ledger?limit=20&cursor=6")
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull()

    const seqs = rowSeqs()
    expect(new Set(seqs).size).toBe(45)
    expect(seqs).toEqual(Array.from({ length: 45 }, (_, index) => 45 - index))
  })

  it("keeps commit order for entries written in the same instant", async () => {
    const at = "2026-10-08T02:00:00.000Z"
    setup({ ledger: [1, 2, 3].map((seq) => ledgerItem(seq, { created_at: at, balance_after: seq * 100 })) })
    await waitFor(() => expect(rowSeqs()).toEqual([3, 2, 1]))
  })

  it("reports a failed next page without dropping what is loaded, and retries it", async () => {
    const user = userEvent.setup()
    setup({ ledger: rewards(30) })
    await waitFor(() => expect(rowSeqs()).toHaveLength(20))
    backend.intercept((call) => call.path.includes("cursor="), () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    await user.click(screen.getByRole("button", { name: "Xem thêm" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chưa tải được trang tiếp theo")
    expect(rowSeqs()).toHaveLength(20)
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    await waitFor(() => expect(rowSeqs()).toHaveLength(30))
  })

  it("reports a failed first page as an error, not as an empty history, and can retry", async () => {
    const user = userEvent.setup()
    setup({ ledger: rewards(3) }, (server) => {
      server.intercept((call) => call.path.startsWith("/shop/coin-ledger"), () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    })
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Chưa tải được lịch sử xu")
    expect(screen.queryByText("Chưa có lịch sử xu.")).toBeNull()
    await user.click(within(alert).getByRole("button", { name: "Thử lại" }))
    await waitFor(() => expect(rowSeqs()).toHaveLength(3))
  })

  it("says so when the account has no entries yet", async () => {
    setup({ balance: 0, lessons: 0 })
    expect(await screen.findByText("Chưa có lịch sử xu.")).toBeTruthy()
  })
})

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HuntMain } from "./hunt-main"

type Row = { id: string; symbol: string; sortOrder: number; createdAt: string }

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  list: [] as Row[],
  postGate: null as Promise<void> | null,
  postError: null as Error | null,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  openAuth: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, isLoading: false, openAuth: mocks.openAuth }),
}))
vi.mock("@/lib/api", () => ({
  api: mocks.api,
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "lỗi"),
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

const hunt = {
  ma: "ngoai", icon: null, ten: "Khối ngoại gom", mo_ta: "", dieu_kien: "", xep_hang_theo: "", nguon_du_lieu: null,
  kha_dung: true, ly_do_chua_kha_dung: null, tong_so_ma: 21, so_ma_trong_ro: 380, so_ma_xet: 380, so_ma_truot_loc_san: 0,
  so_ma_bo_qua_thieu_du_lieu: 0, ket_qua_day_du: true, canh_bao_thieu_du_lieu: null, hien_thi_toi_da: 10, loc_san: [],
  items: ["FPT", "MWG", "HPG"].map((symbol, index) => ({
    hang: index + 1, symbol, gia_vnd: 30_000 + index, pct_thay_doi: 1.25, tin_hieu: `Mua ròng ${index + 1}`, gia_tri_xep_hang: 10 - index,
  })),
}

async function handle(path: string, init?: RequestInit): Promise<unknown> {
  const method = init?.method ?? "GET"
  if (path === "/cap5/san-ma/ngoai") return { data: hunt }
  if (path === "/watchlists" && method === "GET") return { data: mocks.list }
  if (path === "/watchlists" && method === "POST") {
    if (mocks.postGate) await mocks.postGate
    if (mocks.postError) throw mocks.postError
    const { symbol } = JSON.parse(String(init?.body)) as { symbol: string }
    mocks.list = [...mocks.list, { id: `wl-${symbol}`, symbol, sortOrder: mocks.list.length, createdAt: "2026-10-08T00:00:00Z" }]
    return { data: {} }
  }
  if (path.startsWith("/watchlists/") && method === "DELETE") {
    const symbol = decodeURIComponent(path.slice("/watchlists/".length))
    mocks.list = mocks.list.filter((row) => row.symbol !== symbol)
    return undefined
  }
  throw new Error(`unexpected ${method} ${path}`)
}

function renderHunt() {
  const onNavigate = vi.fn()
  const onSymbolChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/demo-trading?view=hunt"]}>
        <HuntMain symbol="VNM" onSymbolChange={onSymbolChange} onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onNavigate, onSymbolChange, user: userEvent.setup() }
}

const box = (symbol: string) => screen.getByRole("checkbox", { name: `Theo dõi ${symbol}` })

beforeEach(() => {
  mocks.api.mockReset()
  mocks.api.mockImplementation(handle)
  mocks.list = [{ id: "wl-FPT", symbol: "FPT", sortOrder: 0, createdAt: "2026-10-01T00:00:00Z" }]
  mocks.postGate = null
  mocks.postError = null
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
})

describe("HuntMain (Săn mã results)", () => {
  it("shows the selected group, its result rows and the watch state from the account watch list", async () => {
    renderHunt()
    expect(await screen.findByRole("heading", { name: "Khối ngoại gom" })).toBeTruthy()
    await screen.findByRole("checkbox", { name: "Theo dõi FPT" })
    await waitFor(() => expect(box("FPT").getAttribute("aria-checked")).toBe("true"))
    expect(box("MWG").getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("region", { name: "Bảng kết quả Săn mã" })).toBeTruthy()
  })

  it("adds one watch-list row per mã with an optimistic check and no fake success toast", async () => {
    let release: () => void = () => {}
    mocks.postGate = new Promise<void>((resolve) => { release = resolve })
    const { user } = renderHunt()
    await waitFor(() => expect(box("FPT").getAttribute("aria-checked")).toBe("true"))

    await user.click(box("MWG"))
    // optimistic: checked while the server has not answered yet
    await waitFor(() => expect(box("MWG").getAttribute("aria-checked")).toBe("true"))
    expect(mocks.list.map((row) => row.symbol)).toEqual(["FPT"])
    release()
    await waitFor(() => expect(mocks.list.map((row) => row.symbol)).toEqual(["FPT", "MWG"]))
    await waitFor(() => expect(box("MWG").getAttribute("aria-checked")).toBe("true"))

    const posts = mocks.api.mock.calls.filter(([path, init]) => path === "/watchlists" && init?.method === "POST")
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0][1].body))).toEqual({ symbol: "MWG" })
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("rolls the checkbox back and reports the error inline when saving fails", async () => {
    mocks.postError = new Error("Danh mục theo dõi đã đủ 50 mã")
    const { user } = renderHunt()
    await waitFor(() => expect(box("FPT").getAttribute("aria-checked")).toBe("true"))

    await user.click(box("HPG"))
    const alert = await screen.findByRole("alert")
    expect(within(alert).getByText("HPG: Danh mục theo dõi đã đủ 50 mã")).toBeTruthy()
    await waitFor(() => expect(box("HPG").getAttribute("aria-checked")).toBe("false"))
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it("removes a mã from the watch list when it is unticked", async () => {
    const { user } = renderHunt()
    await waitFor(() => expect(box("FPT").getAttribute("aria-checked")).toBe("true"))
    await user.click(box("FPT"))
    await waitFor(() => expect(box("FPT").getAttribute("aria-checked")).toBe("false"))
    await waitFor(() => expect(mocks.api.mock.calls.some(([path, init]) => path === "/watchlists/FPT" && init?.method === "DELETE")).toBe(true))
    expect(mocks.list).toEqual([])
  })

  it("Đặt lệnh only opens the order form with that mã and never places an order", async () => {
    const { user, onNavigate } = renderHunt()
    await screen.findByRole("checkbox", { name: "Theo dõi HPG" })
    const row = screen.getByRole("button", { name: "HPG" }).closest("tr")!
    await user.click(within(row).getByRole("button", { name: "Đặt lệnh" }))
    expect(onNavigate).toHaveBeenCalledWith("trading", "HPG")
    expect(mocks.api.mock.calls.some(([path]) => String(path).startsWith("/virtual-trading"))).toBe(false)
    expect(mocks.api.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  })
})

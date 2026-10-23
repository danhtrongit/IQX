import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SymbolSearchResult } from "@/pages/demo-trading/market/market-api"

import { HeaderSearch } from "./header-search"

const mocks = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock("@/pages/demo-trading/market/market-api", () => ({ searchTradableSymbols: mocks.search }))

const item = (symbol: string, name: string): SymbolSearchResult => ({ symbol, name, exchange: "HOSE", industry: null })

function renderSearch() {
  const router = createMemoryRouter(
    [{ path: "/demo-trading", element: <HeaderSearch /> }],
    { initialEntries: ["/demo-trading?content=dashboard&symbol=FPT"] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  mocks.search.mockReset()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => vi.unstubAllGlobals())

describe("HeaderSearch · Enter (DB-05b)", () => {
  it("Enter bấm trước khi kết quả về thì chọn dòng đầu ngay khi kết quả về", async () => {
    let resolve: (items: SymbolSearchResult[]) => void = () => {}
    mocks.search.mockImplementation(() => new Promise<SymbolSearchResult[]>((done) => { resolve = done }))
    const user = userEvent.setup()
    const router = renderSearch()

    await user.click(screen.getByRole("button", { name: "Tìm mã cổ phiếu" }))
    await user.type(screen.getByRole("combobox", { name: "Tìm mã hoặc tên công ty" }), "hoa phat{Enter}")
    expect(router.state.location.search).toBe("?content=dashboard&symbol=FPT")

    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("hoa phat", expect.anything()))
    resolve([item("HPG", "Hòa Phát"), item("HPX", "Hải Phát")])
    await waitFor(() => expect(router.state.location.search).toBe("?content=dashboard&symbol=HPG"))
  })

  it("gõ đúng một mã có trong danh sách thì Enter chọn mã đó", async () => {
    mocks.search.mockResolvedValue([item("VCBS", "Chứng khoán Vietcombank"), item("VCB", "Vietcombank")])
    const user = userEvent.setup()
    const router = renderSearch()

    await user.click(screen.getByRole("button", { name: "Tìm mã cổ phiếu" }))
    await user.type(screen.getByRole("combobox", { name: "Tìm mã hoặc tên công ty" }), "vcb")
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2))
    await user.keyboard("{Enter}")
    await waitFor(() => expect(router.state.location.search).toBe("?content=dashboard&symbol=VCB"))
  })
})

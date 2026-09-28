import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { PriceBoardRow } from "../../market/types"
import { BoardTable, type BoardTableProps } from "./board-table"

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const baseRow: PriceBoardRow = {
  symbol: "AAA",
  exchange: "HOSE",
  ceilingPrice: 77,
  floorPrice: 67,
  referencePrice: 72,
  openPrice: 72,
  closePrice: 72,
  highestPrice: 73,
  lowestPrice: 71,
  priceChange: 0,
  percentChange: 0,
  hasTraded: true,
  totalVolume: 1000,
  totalValue: 72_000_000,
  bid: [],
  ask: [],
  foreignBuy: 100,
  foreignSell: 50,
  foreignRoom: null,
}

const handlers = { onOpen: vi.fn(), onToggleWatch: vi.fn() }

function board(props: Partial<BoardTableProps> = {}) {
  return (
    <MemoryRouter>
      <BoardTable
        rows={[baseRow]}
        isLoading={false}
        error={null}
        emptyHint="Không có mã"
        watchedSymbols={new Set()}
        {...handlers}
        {...props}
      />
    </MemoryRouter>
  )
}

describe("price board background updates", () => {
  it("keeps the same row mounted and updates only values without a flash or loader", () => {
    const { rerender } = render(board())
    const symbol = screen.getByRole("link", { name: "AAA" })
    const mountedRow = symbol.closest("tr")
    expect(mountedRow).not.toBeNull()

    rerender(board({ rows: [{ ...baseRow, closePrice: 73, priceChange: 1, percentChange: 1.39 }], isLoading: true }))

    expect(screen.getByRole("link", { name: "AAA" }).closest("tr")).toBe(mountedRow)
    expect(mountedRow?.textContent).toContain("73.00")
    expect(screen.queryByText("Đang tải bảng giá…")).toBeNull()
    expect(mountedRow?.innerHTML).not.toMatch(/bg-price-(?:up|down)\/15|transition-colors/)
  })

  it("shows loading and errors when there is no data yet", () => {
    const { rerender } = render(board({ rows: [], isLoading: true }))
    expect(screen.getByText("Đang tải bảng giá…")).toBeTruthy()

    rerender(board({ rows: [], error: new Error("Mất kết nối") }))
    expect(screen.getByText("Không tải được dữ liệu giá: Mất kết nối")).toBeTruthy()
  })
})

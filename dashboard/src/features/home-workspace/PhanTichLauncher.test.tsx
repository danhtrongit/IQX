import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))
let mockSymbol = "HPG"
vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: mockSymbol, setSymbol: vi.fn() }) }))
vi.mock("@/features/stock", () => ({ isIndexSymbol: (s: string) => s === "VNINDEX" }))
import { PhanTichLauncher } from "./PhanTichLauncher"

describe("PhanTichLauncher", () => {
  it("navigates to the stock page for a stock symbol", () => {
    mockSymbol = "HPG"
    render(<PhanTichLauncher />)
    fireEvent.click(screen.getByRole("button", { name: /Mở phân tích/ }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/HPG")
  })

  it("shows the empty state for an index", () => {
    mockSymbol = "VNINDEX"
    render(<PhanTichLauncher />)
    expect(screen.getByText(/Hãy chọn mã CK/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Mở phân tích/ })).not.toBeInTheDocument()
  })
})

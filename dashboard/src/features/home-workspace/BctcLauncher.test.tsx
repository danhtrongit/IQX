import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BctcLauncher } from "./PhanTichLauncher"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: "FPT" }) }))
vi.mock("@/features/stock", () => ({ isIndexSymbol: () => false }))

describe("BctcLauncher", () => {
  it("điều hướng /co-phieu/FPT?tab=financials", () => {
    render(<BctcLauncher />)
    fireEvent.click(screen.getByRole("button", { name: /Mở phân tích BCTC/ }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/FPT?tab=financials")
  })
})

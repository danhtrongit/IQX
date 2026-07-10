import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StockAnalysisView } from "./StockAnalysisView"
import { FinancialAnalysisView } from "./FinancialAnalysisView"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))

describe("Stock/Financial analysis views", () => {
  it("StockAnalysisView: submit → /co-phieu/FPT", () => {
    navigate.mockClear()
    render(<StockAnalysisView />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "fpt" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/FPT")
  })
  it("StockAnalysisView: hiển thị đúng tiêu đề + subtitle", () => {
    render(<StockAnalysisView />)
    expect(screen.getByText("Phân tích cổ phiếu")).toBeInTheDocument()
    expect(screen.getByText("6 lớp dữ liệu · Cập nhật theo phiên giao dịch")).toBeInTheDocument()
  })
  it("FinancialAnalysisView: submit → /co-phieu/HPG?tab=financials", () => {
    navigate.mockClear()
    render(<FinancialAnalysisView />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "hpg" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/HPG?tab=financials")
  })
  it("FinancialAnalysisView: tiêu đề BCTC", () => {
    render(<FinancialAnalysisView />)
    expect(screen.getByText("Phân tích BCTC")).toBeInTheDocument()
    expect(screen.getByText("Báo cáo tài chính · Theo quý và cả năm")).toBeInTheDocument()
  })
})

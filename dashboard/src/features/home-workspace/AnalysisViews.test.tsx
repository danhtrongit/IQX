import React, { useRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StockAnalysisView } from "./StockAnalysisView"
import { FinancialAnalysisView } from "./FinancialAnalysisView"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@/features/stock", () => ({
  // Simulates the real AiInsightBriefing's mount-once fetch behavior: it captures the
  // `symbol` it saw on its FIRST render into a ref and keeps rendering that captured value
  // forever after, ignoring subsequent prop changes — exactly like a `useEffect(fn, [])`
  // that never re-fires when `symbol` changes. Without `key={symbol}` at the call site,
  // React reuses the same component instance across a resubmit, so this mock (like the
  // real component) would keep showing the stale symbol. With `key={symbol}`, React
  // remounts a fresh instance for the new symbol, resetting the ref.
  AiInsightBriefing: ({ symbol }: { symbol: string }) => {
    const mountedSymbol = useRef(symbol)
    return <div data-testid="ai-insight">{mountedSymbol.current}</div>
  },
}))
vi.mock("@/features/premium", () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/features/stock/bctc-dashboard", () => ({
  BctcDashboard: ({ symbol }: { symbol: string }) => <div data-testid="bctc-dash">{symbol}</div>,
}))

describe("Stock/Financial analysis views", () => {
  it("StockAnalysisView: nhập mã → render AiInsightBriefing inline (không điều hướng)", () => {
    navigate.mockClear()
    render(<StockAnalysisView />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "fpt" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(screen.getByTestId("ai-insight")).toHaveTextContent("FPT")
    expect(navigate).not.toHaveBeenCalled()
  })
  it("StockAnalysisView: tìm lại mã khác → AiInsightBriefing remount, không kẹt dữ liệu mã cũ", () => {
    render(<StockAnalysisView />)
    const input = screen.getByPlaceholderText("Nhập mã cổ phiếu...")
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))

    fireEvent.change(input, { target: { value: "fpt" } })
    submit()
    expect(screen.getByTestId("ai-insight")).toHaveTextContent("FPT")

    // Resubmit a different symbol via the same persistent search box. The mock simulates
    // AiInsightBriefing's mount-once fetch (captures symbol in a ref on first render), so this
    // only shows "HPG" if StockAnalysisView remounts the component (key={symbol}) rather than
    // reusing the same instance with updated props.
    fireEvent.change(input, { target: { value: "hpg" } })
    submit()
    expect(screen.getByTestId("ai-insight")).toHaveTextContent("HPG")
  })
  it("StockAnalysisView: hiển thị đúng tiêu đề + subtitle", () => {
    render(<StockAnalysisView />)
    expect(screen.getByText("Phân tích cổ phiếu")).toBeInTheDocument()
    expect(screen.getByText("6 lớp dữ liệu · Cập nhật theo phiên giao dịch")).toBeInTheDocument()
  })
  it("FinancialAnalysisView: submit → render BctcDashboard inline (không điều hướng)", () => {
    navigate.mockClear()
    render(<FinancialAnalysisView />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "vcb" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(screen.getByTestId("bctc-dash")).toHaveTextContent("VCB")
    expect(navigate).not.toHaveBeenCalled()
  })
  it("FinancialAnalysisView: tiêu đề BCTC", () => {
    render(<FinancialAnalysisView />)
    expect(screen.getByText("Phân tích BCTC")).toBeInTheDocument()
    expect(screen.getByText("Báo cáo tài chính · Theo quý và cả năm")).toBeInTheDocument()
  })
})

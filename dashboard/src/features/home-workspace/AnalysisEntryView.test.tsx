import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AnalysisEntryView } from "./AnalysisEntryView"

const base = {
  icon: <span>I</span>,
  title: "Phân tích cổ phiếu",
  subtitle: "6 lớp dữ liệu · Cập nhật theo phiên giao dịch",
  placeholder: "Nhập mã cổ phiếu...",
  emptyIcon: <span>E</span>,
  emptyTitle: "Nhập mã cổ phiếu để bắt đầu",
  emptyDesc: "Hệ thống sẽ phân tích...",
}

describe("AnalysisEntryView", () => {
  it("hiển thị header, subtitle, empty-state", () => {
    render(<AnalysisEntryView {...base} onSubmit={() => {}} />)
    expect(screen.getByText("Phân tích cổ phiếu")).toBeInTheDocument()
    expect(screen.getByText("6 lớp dữ liệu · Cập nhật theo phiên giao dịch")).toBeInTheDocument()
    expect(screen.getByText("Nhập mã cổ phiếu để bắt đầu")).toBeInTheDocument()
    expect(screen.getByText("Hệ thống sẽ phân tích...")).toBeInTheDocument()
  })
  it("Enter trong input → onSubmit(SYMBOL uppercase, trimmed)", () => {
    const onSubmit = vi.fn()
    render(<AnalysisEntryView {...base} onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText("Nhập mã cổ phiếu...")
    fireEvent.change(input, { target: { value: " fpt " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledWith("FPT")
  })
  it("click nút Phân tích → onSubmit", () => {
    const onSubmit = vi.fn()
    render(<AnalysisEntryView {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "hpg" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(onSubmit).toHaveBeenCalledWith("HPG")
  })
  it("input rỗng → KHÔNG onSubmit", () => {
    const onSubmit = vi.fn()
    render(<AnalysisEntryView {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

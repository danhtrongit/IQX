import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { formatSessionDate } from "./formatSessionDate"
import { SessionTabs } from "./SessionTabs"
import { SessionMeta } from "./SessionMeta"

describe("formatSessionDate", () => {
  it("thứ trong tuần tiếng Việt + DD/MM/YYYY", () => {
    expect(formatSessionDate("2026-06-30")).toBe("Thứ Ba, 30/06/2026")
    expect(formatSessionDate("2026-07-05")).toBe("Chủ Nhật, 05/07/2026")
  })
  it("input hỏng → chuỗi rỗng", () => expect(formatSessionDate("garbage")).toBe(""))
})

describe("SessionMeta", () => {
  it("badge + ngày", () => {
    render(<SessionMeta dateLabel="Thứ Ba, 30/06/2026" />)
    expect(screen.getByText("Phân tích thị trường")).toBeInTheDocument()
    expect(screen.getByText("Thứ Ba, 30/06/2026")).toBeInTheDocument()
  })
  it("dateLabel null → chỉ badge, không crash", () => {
    render(<SessionMeta dateLabel={null} />)
    expect(screen.getByText("Phân tích thị trường")).toBeInTheDocument()
  })
})

describe("SessionTabs", () => {
  it("3 tab luôn hiển thị với giờ publish thật", () => {
    render(<SessionTabs active="midday" onSelect={() => {}} newPeriod={null} />)
    expect(screen.getByRole("tab", { name: /Trước phiên/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Giữa phiên/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toBeInTheDocument()
    expect(screen.getByText("· 07:15")).toBeInTheDocument()
    expect(screen.getByText("· 11:30")).toBeInTheDocument()
    expect(screen.getByText("· 16:30")).toBeInTheDocument()
  })
  it("tab active có aria-selected", () => {
    render(<SessionTabs active="eod" onSelect={() => {}} newPeriod={null} />)
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /Trước phiên/ })).toHaveAttribute("aria-selected", "false")
  })
  it("click gọi onSelect với period đúng", () => {
    const onSelect = vi.fn()
    render(<SessionTabs active="eod" onSelect={onSelect} newPeriod={null} />)
    fireEvent.click(screen.getByRole("tab", { name: /Trước phiên/ }))
    expect(onSelect).toHaveBeenCalledWith("premarket")
  })
  it("pill MỚI trên đúng tab", () => {
    render(<SessionTabs active="eod" onSelect={() => {}} newPeriod="midday" />)
    const midday = screen.getByRole("tab", { name: /Giữa phiên/ })
    expect(midday).toHaveTextContent("MỚI")
  })
  it("newPeriod null → không có MỚI", () => {
    render(<SessionTabs active="eod" onSelect={() => {}} newPeriod={null} />)
    expect(screen.queryByText("MỚI")).not.toBeInTheDocument()
  })
})

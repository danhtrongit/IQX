import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { HomeIconRail } from "./HomeIconRail"

describe("HomeIconRail", () => {
  it("renders the 5 tab labels and fires onSelect", () => {
    const onSelect = vi.fn()
    render(<HomeIconRail active="order" onSelect={onSelect} isIndex={false} />)
    for (const label of ["Đặt lệnh", "Danh mục", "Tin tức", "Phân tích", "Mẫu nến"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole("button", { name: /Tin tức/ }))
    expect(onSelect).toHaveBeenCalledWith("news")
  })

  it("disables the Đặt lệnh tab when the context is an index", () => {
    const onSelect = vi.fn()
    render(<HomeIconRail active="watchlist" onSelect={onSelect} isIndex />)
    const orderBtn = screen.getByRole("button", { name: /Đặt lệnh/ })
    expect(orderBtn).toBeDisabled()
    fireEvent.click(orderBtn)
    expect(onSelect).not.toHaveBeenCalledWith("order")
  })
})

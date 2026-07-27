// TourLaunchButton.test.tsx
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { TourLaunchButton } from "./TourLaunchButton"

describe("TourLaunchButton", () => {
  it("renders the default 'Xem hướng dẫn' label", () => {
    render(<TourLaunchButton onClick={vi.fn()} />)
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()
  })

  it("calls onClick when clicked", () => {
    const onClick = vi.fn()
    render(<TourLaunchButton onClick={onClick} />)
    fireEvent.click(screen.getByText("Xem hướng dẫn"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("supports a custom label", () => {
    render(<TourLaunchButton onClick={vi.fn()} label="Hướng dẫn Bảng giá" />)
    expect(screen.getByText("Hướng dẫn Bảng giá")).toBeInTheDocument()
  })
})

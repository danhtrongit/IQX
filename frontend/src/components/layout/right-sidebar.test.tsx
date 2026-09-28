import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RightSidebar } from "./right-sidebar"

describe("RightSidebar layout", () => {
  it("allows its flex column to shrink to the available workspace height", () => {
    render(
      <RightSidebar label="Đặt lệnh">
        <div>Panel content</div>
      </RightSidebar>,
    )

    const sidebar = screen.getByRole("complementary", { name: "Đặt lệnh" })
    expect(sidebar.classList.contains("min-h-0")).toBe(true)
    expect(sidebar.classList.contains("flex-1")).toBe(true)
    expect(sidebar.classList.contains("lg:flex-none")).toBe(false)
    expect(sidebar.classList.contains("lg:shrink-0")).toBe(false)
  })
})

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SidebarPanel } from "./sidebar-panel"

describe("SidebarPanel scroll region", () => {
  it("gives the nested ScrollArea a definite flex height", () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    render(
      <SidebarPanel title="Đặt lệnh">
        {Array.from({ length: 40 }, (_, index) => <p key={index}>Nội dung {index + 1}</p>)}
      </SidebarPanel>,
    )

    const scrollArea = screen.getByRole("heading", { name: "Đặt lệnh" }).closest("section")?.querySelector('[data-slot="scroll-area"]')
    expect(scrollArea).not.toBeNull()
    expect(scrollArea?.classList.contains("h-0")).toBe(true)
    expect(scrollArea?.classList.contains("min-h-0")).toBe(true)
    expect(scrollArea?.classList.contains("flex-1")).toBe(true)
  })
})

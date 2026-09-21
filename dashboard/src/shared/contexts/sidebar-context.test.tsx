import { useEffect } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SidebarProvider, useSidebar } from "./sidebar-context"

// Journey pages choose their starting panel in an effect, then the toolbar
// owns subsequent choices. A provider rerender must not rerun that setup.
function JourneyWorkspace() {
  const { activePanel, setActivePanel, isOpen, setIsOpen, openForecastWindow } = useSidebar()
  useEffect(() => {
    setActivePanel("journey")
    setIsOpen(false)
  }, [setActivePanel, setIsOpen])
  return <>
    <output aria-label="Bảng hiện tại">{activePanel}</output>
    <output aria-label="Bảng đang mở">{String(isOpen)}</output>
    <button onClick={() => setActivePanel("trading")}>Đặt lệnh</button>
    <button onClick={() => setIsOpen(false)}>Đóng bảng</button>
    <button onClick={openForecastWindow}>Dự báo</button>
  </>
}

describe("SidebarProvider journey navigation", () => {
  it("keeps a toolbar selection after initial journey setup and unrelated provider updates", () => {
    render(<SidebarProvider><JourneyWorkspace /></SidebarProvider>)
    expect(screen.getByLabelText("Bảng hiện tại")).toHaveTextContent("journey")
    expect(screen.getByLabelText("Bảng đang mở")).toHaveTextContent("false")
    fireEvent.click(screen.getByRole("button", { name: "Đặt lệnh" }))
    expect(screen.getByLabelText("Bảng hiện tại")).toHaveTextContent("trading")
    expect(screen.getByLabelText("Bảng đang mở")).toHaveTextContent("true")
    fireEvent.click(screen.getByRole("button", { name: "Dự báo" }))
    expect(screen.getByLabelText("Bảng hiện tại")).toHaveTextContent("trading")
    fireEvent.click(screen.getByRole("button", { name: "Đóng bảng" }))
    expect(screen.getByLabelText("Bảng hiện tại")).toHaveTextContent("trading")
    expect(screen.getByLabelText("Bảng đang mở")).toHaveTextContent("false")
  })
})

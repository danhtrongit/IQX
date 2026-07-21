import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
// Spies referenced from inside `vi.mock` factories MUST go through
// `vi.hoisted` — `vi.mock` calls are hoisted above ALL other statements
// (including plain top-level `const`s), so a factory closing over a plain
// `const` can hit a TDZ ReferenceError at mock-invocation time.
const { useCap0ProgressMock, enterMutate, placementMutate, messageInfo } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  enterMutate: vi.fn(),
  placementMutate: vi.fn(),
  messageInfo: vi.fn(),
}))

// Terminal children (CenterPanel/RightSidebar/RightToolbar) are the EXISTING,
// untouched dashboard components — stub them so this test only exercises the
// Cap0 shell (placement modal + mode badge + wiring), not the real terminal.
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <div data-testid="right-sidebar" />,
  RightToolbar: () => <div data-testid="right-toolbar" />,
}))

// FE1 hooks — mocked so this test controls progress state without a real
// QueryClient/API.
vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
  useEnterCap0: () => ({ mutate: enterMutate }),
  usePlacement: () => ({ mutate: placementMutate }),
}))

// Only stub `Message` (used for the "Đã từng" toast) — keep the real Modal/
// Button so PlacementModal renders faithfully.
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { Cap0TradingPage } from "./Cap0TradingPage"

const fakeProgress: Cap0Progress = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  entered_at: "2026-07-21T00:00:00Z",
  virtual_balance_init: 250_000_000,
  task_1_done_at: null,
  task_2_done_at: null,
  task_3_done_at: null,
  task_4_done_at: null,
  task_5_done_at: null,
  task_6_done_at: null,
  task1_star_clicked: false,
  task5_sl_typed: false,
  task6_debrief_done: false,
  graduated_at: null,
  time_to_graduate_hours: null,
}

describe("Cap0TradingPage", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    enterMutate.mockReset()
    placementMutate.mockReset()
    messageInfo.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    render(<Cap0TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it('shows the mode badge "SÂN TẬP · T+0"', () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    render(<Cap0TradingPage />)
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
  })

  it("shows PlacementModal when the user has no progress yet (first visit)", () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<Cap0TradingPage />)
    expect(screen.getByText("Chào mừng đến Demo Trading của IQX.")).toBeInTheDocument()
    expect(screen.getByText("Bạn đã từng mua cổ phiếu chưa?")).toBeInTheDocument()
    expect(screen.getByText("Chưa từng")).toBeInTheDocument()
    expect(screen.getByText("Bắt đầu từ Cấp 0 «Nhập môn»")).toBeInTheDocument()
    expect(screen.getByText("Đã từng")).toBeInTheDocument()
    expect(screen.getByText("Làm bài xếp lớp 5 phút")).toBeInTheDocument()
  })

  it("does NOT show PlacementModal once the user already has Cấp 0 progress", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    render(<Cap0TradingPage />)
    expect(screen.queryByText("Chào mừng đến Demo Trading của IQX.")).not.toBeInTheDocument()
  })

  it("does NOT show PlacementModal while progress is still loading", () => {
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<Cap0TradingPage />)
    expect(screen.queryByText("Chào mừng đến Demo Trading của IQX.")).not.toBeInTheDocument()
  })

  it('clicking "Chưa từng" calls placement(false) + enterCap0() and stays in Cấp 0', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Chưa từng"))
    expect(placementMutate).toHaveBeenCalledWith(false)
    expect(enterMutate).toHaveBeenCalledTimes(1)
  })

  it('clicking "Đã từng" calls placement(true) but does NOT enter Cấp 0, shows a toast', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Đã từng"))
    expect(placementMutate).toHaveBeenCalledWith(true)
    expect(enterMutate).not.toHaveBeenCalled()
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("xếp lớp"))
  })

  it('marks placement as locally "seen" after answering, so a re-render (e.g. progress still null while /enter is in flight) does not re-show it', () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    const { rerender } = render(<Cap0TradingPage />)
    fireEvent.click(screen.getByText("Chưa từng"))
    // Re-render with the SAME (still-null) progress, simulating the window
    // before useEnterCap0's mutation resolves and invalidates the query.
    rerender(<Cap0TradingPage />)
    expect(window.localStorage.getItem("iqx_cap0_placement_seen")).toBe("1")
  })

  it("mounts the real JourneyBar (progress x/6 + next-task copy) in the top bar", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    render(<Cap0TradingPage />)
    expect(screen.getByText("CẤP 0 · 0/6")).toBeInTheDocument()
    expect(screen.getByTitle("Bấm để mở Hành trình")).toBeInTheDocument()
  })

  it("defaults the sidebar to the journey panel on mount (overrides the app-root 'news' default)", () => {
    useCap0ProgressMock.mockReturnValue({ data: fakeProgress, isFetched: true })
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="news">
        <Cap0TradingPage />
        <PanelSpy />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })
})

describe("Cap0TradingPage smoke", () => {
  it("mounts without crashing when progress is null", () => {
    useCap0ProgressMock.mockReturnValue({ data: null, isFetched: true })
    const { container } = render(<Cap0TradingPage />)
    expect(within(container).getByTestId("center-panel")).toBeInTheDocument()
  })
})

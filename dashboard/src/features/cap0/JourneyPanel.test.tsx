import { fireEvent, render, screen, within } from "@testing-library/react"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import { Cap0Provider, useCap0Events } from "./Cap0Context"
import { JourneyBar } from "./JourneyBar"
import { JourneyPanel } from "./JourneyPanel"
import type { Cap0Progress } from "./types"

const { useCap0ProgressMock, launchTourMock, trackMock } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  launchTourMock: vi.fn(),
  trackMock: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap0Progress: (...args: unknown[]) => useCap0ProgressMock(...args),
}))
vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: trackMock }))

function progress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return {
    id: "p1", user_id: "u1", entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 100_000_000,
    task_1_done_at: null, task_2_done_at: null, task_3_done_at: null,
    task_4_done_at: null, task_5_done_at: null,
    task1_star_clicked: false, task5_debrief_done: false,
    graduated_at: null, time_to_graduate_hours: null,
    ...overrides,
  }
}

function TourRegistrar() {
  const { registerHandlers } = useCap0Events()
  useEffect(() => registerHandlers({ onLaunchTour: launchTourMock }), [registerHandlers])
  return null
}

function PanelSpy() {
  const { activePanel } = useSidebar()
  return <span data-testid="panel">{activePanel}</span>
}

function renderJourney(withBar = false) {
  return render(
    <SidebarProvider defaultPanel="news">
      <Cap0Provider>
        <TourRegistrar />
        {withBar && <JourneyBar />}
        <JourneyPanel />
        <PanelSpy />
      </Cap0Provider>
    </SidebarProvider>,
  )
}

describe("JourneyPanel — 2 nhiệm vụ giao dịch", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    launchTourMock.mockReset()
    trackMock.mockReset()
  })

it("renders the Cấp 0 card, lesson, practice badge, stages and five tasks", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress() })
    renderJourney()
    expect(screen.getByText("NHẬP MÔN")).toBeInTheDocument()
    expect(screen.getByText("SÂN TẬP · T+0")).toBeInTheDocument()
    expect(screen.getAllByTestId(/cap0-task-/)).toHaveLength(2)
    expect(screen.getByText("0/2")).toBeInTheDocument()
    expect(screen.queryByTestId("cap0-focus")).not.toBeInTheDocument()
    expect(screen.queryByText(/Tour phân tích/)).not.toBeInTheDocument()
  })

it("unlocks the sell task immediately after the first trading task", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress({ task_1_done_at: "t", task1_star_clicked: true }) })
    renderJourney()
    expect(screen.getByText("1/2")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap0-task-5")).getByRole("button", { name: "Làm ngay →" })).toBeEnabled()
  })

it("opens trading for the sell task without launching a tour", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress({ task_1_done_at: "t", task1_star_clicked: true }) })
    renderJourney()
    fireEvent.click(within(screen.getByTestId("cap0-task-5")).getByRole("button"))
    expect(screen.getByTestId("panel")).toHaveTextContent("trading")
    expect(launchTourMock).not.toHaveBeenCalled()
    expect(trackMock).toHaveBeenCalledWith("cap0_task_start", { task_id: 5 })
  })

  it("opens the trading panel for task 1", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress() })
    renderJourney()
    fireEvent.click(within(screen.getByTestId("cap0-task-1")).getByText("Làm ngay →"))
    expect(screen.getByTestId("panel")).toHaveTextContent("trading")
  })

})

describe("JourneyBar", () => {
  beforeEach(() => useCap0ProgressMock.mockReset())

  it("shows the first trading task and two progress dots", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress() })
    const { container } = renderJourney(true)
    expect(screen.getByText("CẤP 0 · 0/2")).toBeInTheDocument()
    expect(screen.getByText("Lệnh đầu tiên của bạn")).toBeInTheDocument()
    expect(container.querySelectorAll(".cap0-jd")).toHaveLength(2)
  })

it("moves directly to the sell task after task 1", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress({ task_1_done_at: "t", task1_star_clicked: true }) })
    renderJourney(true)
    expect(screen.getByTitle("Bấm để mở Hành trình")).toHaveTextContent("Bán một lệnh — kết sổ đầu tiên")
  })

  it("opens the journey panel when clicked", () => {
    useCap0ProgressMock.mockReturnValue({ data: progress() })
    renderJourney(true)
    fireEvent.click(screen.getByTitle("Bấm để mở Hành trình"))
    expect(screen.getByTestId("panel")).toHaveTextContent("journey")
  })
})

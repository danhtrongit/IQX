import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap3Progress } from "./types"

const { useCap3ProgressMock, useCap3EventsMock, flags } = vi.hoisted(() => ({
  flags: { CAP_MAX_ENABLED: 3 },
  useCap3ProgressMock: vi.fn(),
  useCap3EventsMock: vi.fn<(...args: unknown[]) => unknown>(() => ({ isCap3Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap3Progress: (...args: unknown[]) => useCap3ProgressMock(...args),
}))
vi.mock("./Cap3Context", () => ({
  useCap3Events: () => useCap3EventsMock(),
}))
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

import { JourneyPanelCap3, taskStateCap3 } from "./JourneyPanelCap3"

function makeProgress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-08-01T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_quan_ly_von: 0,
    muc_tu_tin_da_dung: [],
    so_muc_tu_tin_da_dung: 0,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap3 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap3", () => {
  beforeEach(() => {
    flags.CAP_MAX_ENABLED = 3
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: makeProgress() })
    useCap3EventsMock.mockReset()
    useCap3EventsMock.mockReturnValue({ isCap3Active: true })
  })

  it("renders exactly two concurrent source tasks with the X/2 journey count", () => {
    renderPanel()
    expect(screen.getByText("Hai nhiệm vụ làm song song")).toBeInTheDocument()
    expect(screen.getByText("0/2")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-task-1")).getByText(
      "10 lệnh có chấm mức tự tin và đặt khối lượng theo khẩu vị",
    )).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-task-2")).getByText("Đặt lệnh ở cả 3 mức tự tin")).toBeInTheDocument()
    expect(screen.queryByTestId("cap3-task-3")).not.toBeInTheDocument()
  })

  it("shows the server-owned ten-order counter and all confidence coverage states", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({
        so_lenh_quan_ly_von: 6,
        muc_tu_tin_da_dung: [1, 2],
        so_muc_tu_tin_da_dung: 2,
      }),
    })
    renderPanel()

    expect(within(screen.getByTestId("cap3-task-1")).getByText("6/10 lệnh")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-task-2")).getByText(/Thấp ✓/)).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-task-2")).getByText(/Vừa ✓/)).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-task-2")).getByText("⭐⭐⭐ Cao")).toBeInTheDocument()
    expect(within(screen.getByTestId("cap3-task-2")).getByText("2/3 mức")).toBeInTheDocument()
  })

  it("keeps both tasks active independently and focuses task two after task one is done", () => {
    const fresh = makeProgress()
    expect(taskStateCap3(1, fresh)).toBe("active")
    expect(taskStateCap3(2, fresh)).toBe("active")

    useCap3ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "done" }) })
    renderPanel()

    expect(taskStateCap3(2, makeProgress({ task_1_done_at: "done" }))).toBe("active")
    expect(within(screen.getByTestId("cap3-focus")).getByText("Đặt lệnh ở cả 3 mức tự tin")).toBeInTheDocument()
  })

  it("shows preserved graduates as complete without inventing cleared task evidence", () => {
    useCap3ProgressMock.mockReturnValue({
      data: makeProgress({
        graduated_at: "2026-09-01T00:00:00Z",
        time_to_graduate_hours: 48,
      }),
    })
    renderPanel()

    expect(screen.getByText("2/2")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-graduated-checklist")).toHaveTextContent(
      "không được diễn giải lại theo tiêu chí mới",
    )
    expect(screen.queryByTestId("cap3-task-1")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap3-task-2")).not.toBeInTheDocument()
    expect(screen.queryByText("Làm ngay →")).not.toBeInTheDocument()
  })

  it("routes task actions to trading without showing legacy profit, fifteen-order, or discipline gates", () => {
    function ActivePanel() {
      return <div data-testid="active-panel">{useSidebar().activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap3 />
        <ActivePanel />
      </SidebarProvider>,
    )

    fireEvent.click(within(screen.getByTestId("cap3-focus")).getByText("Làm ngay →"))
    expect(screen.getByTestId("active-panel")).toHaveTextContent("trading")
    expect(screen.queryByText(/Thách thức Bản lĩnh/)).not.toBeInTheDocument()
    expect(screen.queryByText(/15 lệnh/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Điểm kỷ luật/)).not.toBeInTheDocument()
  })

  it("does not query progress outside the Level 3 provider", () => {
    useCap3EventsMock.mockReturnValue({ isCap3Active: false })
    renderPanel()
    expect(useCap3ProgressMock).toHaveBeenCalledWith(false)
  })
})

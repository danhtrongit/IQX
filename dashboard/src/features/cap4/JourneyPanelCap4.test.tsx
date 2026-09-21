import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap4Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap4ProgressMock, useCap4EventsMock, flags } = vi.hoisted(() => ({
  // Mutable so ô mục tiêu được kiểm ở CẢ HAI phía của trần cấp.
  flags: { CAP_MAX_ENABLED: 4 },
  useCap4ProgressMock: vi.fn(),
  useCap4EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap4Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
}))
vi.mock("./Cap4Context", () => ({
  useCap4Events: () => useCap4EventsMock(),
}))

// Getter (not a plain value): panel phải đọc trần lúc RENDER.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

import { JourneyPanelCap4, taskStateCap4 } from "./JourneyPanelCap4"

function makeProgress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "p4",
    user_id: "u1",
    entered_at: "2026-07-30T00:00:00Z",
    task_1_done_at: null,
    so_lenh_doc_du_5lop: 7,
    vu_khi_lop: null,
    diem_mu_lop: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap4 />
    </SidebarProvider>,
  )
}

function renderWithSpy() {
  function PanelSpy() {
    const { activePanel } = useSidebar()
    return <div data-testid="panel-spy">{activePanel}</div>
  }
  return render(
    <SidebarProvider>
      <JourneyPanelCap4 />
      <PanelSpy />
    </SidebarProvider>,
  )
}

describe("taskStateCap4", () => {
  it("is active until task_1_done_at, done after", () => {
    expect(taskStateCap4(1, makeProgress())).toBe("active")
    expect(taskStateCap4(1, makeProgress({ task_1_done_at: "t" }))).toBe("done")
    expect(taskStateCap4(1, null)).toBe("active")
  })
})

describe("JourneyPanelCap4", () => {
  beforeEach(() => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReset()
    useCap4ProgressMock.mockReturnValue({ data: makeProgress() })
    useCap4EventsMock.mockReset()
    useCap4EventsMock.mockReturnValue({ isCap4Active: true })
  })

it("shows the level identity, lesson and counting rule", () => {
    renderPanel()
    expect(screen.getByText("THUẦN THỤC")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-task-1")).toHaveTextContent("7/10 lệnh")
    expect(within(screen.getByTestId("cap4-task-1")).getByRole("button", { name: "Làm ngay →" })).toBeEnabled()
  })

  it("renders the Cấp 4 badge (tím #a78bfa)", () => {
    renderPanel()
    const svg = document.querySelector(".cap0-badge svg")
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML).toContain("#a78bfa")
  })

  // Contract: `demo-trading-update/LEVEL 4/iqx-cap4-hanhtrinh.html` has one
  // ordered task; removed challenge conditions must not create extra rows.
  it("★ has exactly the source journey's ONE task — checklist header counts n/1", () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 5")).toBeInTheDocument()
    expect(screen.getByText("0/1")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-task-1")).toBeInTheDocument()
    expect(screen.queryByTestId("cap4-task-2")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap4-task-3")).not.toBeInTheDocument()
  })

  it("★ counts 1/1 once the nhiệm vụ is stamped", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lenh_doc_du_5lop: 20 }),
    })
    renderPanel()
    expect(screen.getByText("1/1")).toBeInTheDocument()
  })

  it("★ khối Thách thức Thuần thục (3 điều kiện) đã bị GỠ khỏi Hành trình", () => {
    renderPanel()
    expect(screen.queryByTestId("cap4-thachthuc")).not.toBeInTheDocument()
    expect(screen.queryByText(/Thách thức Thuần thục/)).not.toBeInTheDocument()
    // Hộp Vũ khí & điểm mù cũng đi — nó thuộc Phân tích danh mục (khối ⑨).
    expect(screen.queryByTestId("cap4-journey-vukhi")).not.toBeInTheDocument()
    // Và Hành trình KHÔNG được gọi endpoint của khối đó nữa.
    expect(screen.queryByText(/đồng thuận cao/i)).not.toBeInTheDocument()
  })

  it("caps the progress counter at the target instead of showing 21/10", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_doc_du_5lop: 24, task_1_done_at: "t" }),
    })
    renderPanel()
    expect(screen.getByTestId("cap4-task-1")).toHaveTextContent("10/10 lệnh")
  })

  it("★ says nothing rather than 0/10 while progress has not loaded (chưa biết ≠ 0)", () => {
    useCap4ProgressMock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.queryByText(/\/10 lệnh/)).not.toBeInTheDocument()
  })

  // ── explain-box + tools ──────────────────────────────────────────────────

  it("renders the 2-tool row of the mockup (Kết sổ tĩnh + Phân tích danh mục bấm được)", () => {
    renderWithSpy()
    const tools = screen.getByTestId("cap4-tools")
    expect(within(tools).getByText("📓 Kết sổ")).toBeInTheDocument()
    fireEvent.click(within(tools).getByText("📊 Phân tích danh mục"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap4-analysis")
  })

  it('"Làm ngay →" jumps to the đặt lệnh (trading) panel', () => {
    renderWithSpy()
    fireEvent.click(screen.getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  it("★ đã tốt nghiệp + trần = 4: vẫn không hứa Cấp 5 đã có", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        so_lenh_doc_du_5lop: 20,
        graduated_at: "2026-08-10T00:00:00Z",
      }),
    })
    renderPanel()
    expect(screen.queryByTestId("cap4-focus")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap4-journey-goal")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Vào Cấp 5/ })).not.toBeInTheDocument()
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec §11 — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })

  it("does not query Cấp 4 data outside a Cap4Provider (shared app-root sidebar)", () => {
    useCap4EventsMock.mockReturnValue({ isCap4Active: false })
    renderPanel()
    expect(useCap4ProgressMock).toHaveBeenCalledWith(false)
  })
})

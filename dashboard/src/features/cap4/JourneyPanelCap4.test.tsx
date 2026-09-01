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
    so_lenh_doc_du_5lop: 14,
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

  it("renders the level card — CẤP 4 / THUẦN THỤC / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 4")).toBeInTheDocument()
    expect(screen.getByText("THUẦN THỤC")).toBeInTheDocument()
    expect(
      screen.getByText(
        '"Đọc trọn bức tranh, không chỉ một lý do — và biết mình đọc giỏi ở đâu."',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
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

  it("★ ô tập trung mang tên + mô tả VERBATIM của source journey, kèm tiến độ n/20 lệnh", () => {
    renderPanel()
    const focus = screen.getByTestId("cap4-focus")
    expect(focus).toHaveTextContent("NHIỆM VỤ ĐANG LÀM")
    expect(focus).toHaveTextContent("Đọc và chấm đủ 5 lớp qua 20 lệnh")
    expect(focus).toHaveTextContent(
      "Mỗi lệnh tự đọc và chấm cả 5 lớp thay vì chỉ chọn 1 lý do.",
    )
    expect(focus).toHaveTextContent("14/20 lệnh")
  })

  it("caps the progress counter at the target instead of showing 21/20", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_doc_du_5lop: 24, task_1_done_at: "t" }),
    })
    renderPanel()
    expect(screen.getByTestId("cap4-task-1")).toHaveTextContent("20/20 lệnh")
  })

  it("★ says nothing rather than 0/20 while progress has not loaded (chưa biết ≠ 0)", () => {
    useCap4ProgressMock.mockReturnValue({ data: undefined })
    renderPanel()
    expect(screen.queryByText(/\/20 lệnh/)).not.toBeInTheDocument()
  })

  // ── Dải 5 icon độ phủ (mockup .coverage / .off) ───────────────────────────

  it("★ dải 5 icon độ phủ MỜ khi chưa lệnh nào đọc đủ 5 lớp (.off)", () => {
    useCap4ProgressMock.mockReturnValue({ data: makeProgress({ so_lenh_doc_du_5lop: 0 }) })
    renderPanel()
    const strip = screen.getByTestId("cap4-coverage")
    expect(within(strip).getAllByText(/./)).toHaveLength(5)
    for (const lop of ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]) {
      expect(screen.getByTestId(`cap4-coverage-${lop}`)).toHaveClass("cap4-coverage-off")
    }
  })

  it("★ dải 5 icon SÁNG hết từ lệnh đầu tiên đọc đủ (một lệnh đã phủ cả 5 lớp)", () => {
    useCap4ProgressMock.mockReturnValue({ data: makeProgress({ so_lenh_doc_du_5lop: 1 }) })
    renderPanel()
    for (const lop of ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]) {
      expect(screen.getByTestId(`cap4-coverage-${lop}`)).not.toHaveClass("cap4-coverage-off")
    }
  })

  // ── explain-box + tools ──────────────────────────────────────────────────

  it("★ explain-box nói luật đếm: chấm đủ 5 lớp, không cần đóng, không cần thắng", () => {
    renderPanel()
    const box = screen.getByTestId("cap4-journey-explain")
    expect(box).toHaveTextContent(/đủ cả 5 lớp/)
    expect(box).toHaveTextContent(/không tính/)
    expect(box).toHaveTextContent(/[Kk]hông cần lệnh phải đóng/)
    expect(box).toHaveTextContent(/không phải điểm đúng\/sai/)
  })

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

  // ── ★ Ô mục tiêu — gắn theo trần cấp, CẢ HAI phía ─────────────────────────

  it("★ trần ≥ 5: ô mục tiêu hứa Cấp 5 «Lão luyện» (chủ động săn mã)", () => {
    flags.CAP_MAX_ENABLED = 5
    renderPanel()
    const goal = screen.getByTestId("cap4-journey-goal")
    expect(goal).toHaveTextContent("Xong → tốt nghiệp Cấp 4, lên Cấp 5 «Lão luyện» (chủ động săn mã).")
    expect(goal).not.toHaveTextContent(/chưa ra mắt/)
  })

  it("★ trần = 4: ô mục tiêu KHÔNG hứa một cấp chưa tồn tại", () => {
    flags.CAP_MAX_ENABLED = 4
    renderPanel()
    const goal = screen.getByTestId("cap4-journey-goal")
    expect(goal).toHaveTextContent("Cấp 5 «Lão luyện» chưa ra mắt")
    expect(goal).toHaveTextContent(/chặng cuối của chương trình hiện tại/)
    expect(goal).toHaveTextContent(/chủ động săn mã/)
  })

  it("★★ ô mục tiêu KHÔNG được nói Cấp 5 dạy 4 ô / tách quyết định khỏi kết quả / mâu thuẫn giữa các lớp", () => {
    // Cấp 5 thật = SĂN MÃ. Bốn nguồn (mockup Cấp 4, IQX-Cap5-Spec, mockup Cấp
    // 5, IQX-NguyenTac-Chung) đều nói vậy; "4 ô" là bản Cấp 5 CŨ và "mâu thuẫn
    // giữa các lớp" là Cấp 6. Canh cả hai phía của trần.
    for (const tran of [4, 5]) {
      flags.CAP_MAX_ENABLED = tran
      const { unmount } = renderPanel()
      const goal = screen.getByTestId("cap4-journey-goal")
      expect(goal).not.toHaveTextContent(/tách quyết định khỏi kết quả/)
      expect(goal).not.toHaveTextContent(/đúng-thắng/)
      expect(goal).not.toHaveTextContent(/đứng ngoài/)
      expect(goal).not.toHaveTextContent(/mâu thuẫn/)
      unmount()
    }
  })

  // ── Trạng thái sau khi tốt nghiệp ────────────────────────────────────────

  it("★ đã tốt nghiệp: ô tập trung + ô mục tiêu KHÔNG bắt làm lại việc vừa xong", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({
        task_1_done_at: "t",
        so_lenh_doc_du_5lop: 20,
        graduated_at: "2026-08-10T00:00:00Z",
      }),
    })
    renderPanel()
    expect(screen.getByTestId("cap4-focus")).toHaveTextContent("Đã tốt nghiệp Cấp 4 «Thuần thục»")
    const goal = screen.getByTestId("cap4-journey-goal")
    expect(goal).toHaveTextContent("Bạn đã tốt nghiệp")
    expect(goal).not.toHaveTextContent(/Xong → tốt nghiệp/)
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
    expect(screen.getByTestId("cap4-journey-goal")).toHaveTextContent(
      /Cấp 5 «Lão luyện» chưa ra mắt/,
    )
  })

  it("xong nhiệm vụ nhưng chưa tốt nghiệp → ô tập trung nói sẵn sàng tốt nghiệp", () => {
    useCap4ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lenh_doc_du_5lop: 20 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap4-focus")).toHaveTextContent("Sẵn sàng tốt nghiệp Cấp 4")
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

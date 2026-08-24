import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import { visibleText } from "@/__tests__/textGuards"
import type { Cap2Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap2ProgressMock, useCap2EventsMock, flags } = vi.hoisted(() => ({
  // Mutable so the goal box can be asserted on BOTH sides of the trần cấp.
  flags: { CAP_MAX_ENABLED: 2 },
  useCap2ProgressMock: vi.fn(),
  useCap2EventsMock: vi.fn<(...a: unknown[]) => unknown>(() => ({ isCap2Active: true })),
}))

vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
}))
vi.mock("./Cap2Context", () => ({
  useCap2Events: () => useCap2EventsMock(),
}))

// Getter (not a plain value): the panel must read the trần at RENDER time.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

import { JourneyPanelCap2 } from "./JourneyPanelCap2"

/**
 * ★ Fixture cố tình KHÔNG dùng giá trị default cho `so_lenh_co_cl_tp` ở các ca
 * đo con số — xem từng `it`. Ở đây chỉ là hàng "vừa vào cấp".
 */
function makeProgress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    task_1_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <SidebarProvider>
      <JourneyPanelCap2 />
    </SidebarProvider>,
  )
}

describe("JourneyPanelCap2", () => {
  beforeEach(() => {
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: makeProgress() })
    useCap2EventsMock.mockReset()
    useCap2EventsMock.mockReturnValue({ isCap2Active: true })
    flags.CAP_MAX_ENABLED = 2
  })

  it("renders the level card — CẤP 2 / KỶ LUẬT / italic bài học / badge THỰC CHIẾN", () => {
    renderPanel()
    expect(screen.getByText("CẤP 2")).toBeInTheDocument()
    expect(screen.getByText("KỶ LUẬT")).toBeInTheDocument()
    expect(screen.getByText('"Kế hoạch chỉ có giá trị khi được thực hiện."')).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  // ── ★★ Hành trình CHỈ CÒN MỘT NHIỆM VỤ ★★ ─────────────────────────────────
  it("★ renders EXACTLY 1 nhiệm vụ — ② «Thực hiện đúng khi giá chạm mốc» is gone for good", () => {
    renderPanel()
    expect(screen.getByTestId("cap2-task-1")).toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-2")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-3")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-4")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-task-5")).not.toBeInTheDocument()
    // ...và không còn dấu vết câu chữ của nhiệm vụ ② đã bỏ. `visibleText()`
    // thay cho `textContent` (nó dán liền hai text node — xem textGuards).
    const body = visibleText()
    expect(body).not.toContain("Thực hiện đúng khi giá chạm mốc")
    expect(body).not.toContain("song song")
    expect(body).not.toMatch(/\d+\/2 lần/u)
    // ...lẫn của 5 nhiệm vụ cũ.
    expect(screen.queryByText(/Chuỗi lệnh kỷ luật đầu tiên/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cắt lỗ đúng phiên — 5 lần/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Không nhồi lệnh khi lỗ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cửa sổ 20 lệnh/)).not.toBeInTheDocument()
  })

  it("★ renders the nhiệm vụ name VERBATIM from the mockup", () => {
    renderPanel()
    expect(
      within(screen.getByTestId("cap2-task-1")).getByText(
        "10 lệnh Thực chiến có đặt cắt lỗ / chốt lời",
      ),
    ).toBeInTheDocument()
  })

  it('shows the checklist header "TRƯỚC KHI LÊN CẤP 3" + 0/1 with fresh progress', () => {
    renderPanel()
    expect(screen.getByText("TRƯỚC KHI LÊN CẤP 3")).toBeInTheDocument()
    expect(screen.getByText("0/1")).toBeInTheDocument()
    // Mẫu số cũ tuyệt đối không được sống sót ở bất kỳ đâu trên panel.
    expect(visibleText()).not.toContain("0/2")
  })

  // ── ★★ Các khối chỉ số đã RỜI tab Hành trình ★★ ───────────────────────────
  it("★ no ChuoiWidget, no Điểm kỷ luật card, no Cẩm nang block", () => {
    renderPanel()
    expect(screen.queryByTestId("cap2-chuoi")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-diem-card")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-camnang")).not.toBeInTheDocument()
    expect(screen.queryByText(/CẨM NANG CẮT LỖ/i)).not.toBeInTheDocument()
  })

  // ── ★★ Nhiệm vụ duy nhất mở ngay, không khoá, không "Làm ngay →" trên dòng ─
  it("★ the single nhiệm vụ is active from 0/1 — never locked, and needs no row shortcut", () => {
    renderPanel()
    const row = screen.getByTestId("cap2-task-1")
    expect(row.className).not.toContain("cap0-checklist-item--locked")
    expect(row.className).toContain("cap0-checklist-item--current")
    // Lối tắt của nhiệm vụ song song không còn lý do tồn tại — ô tập trung ngay
    // trên đã có nút "Làm ngay →" của chính nhiệm vụ này.
    expect(within(row).queryByText("Làm ngay →")).not.toBeInTheDocument()
  })

  it("★ once ① is done the row reads done and the focus box switches", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ task_1_done_at: "t", so_lenh_co_cl_tp: 12 }),
    })
    renderPanel()
    expect(screen.getByTestId("cap2-task-1").className).toContain("cap0-checklist-item--done")
    const focus = within(screen.getByTestId("cap2-focus"))
    expect(focus.getByText("ĐÃ XONG NHIỆM VỤ CẤP 2")).toBeInTheDocument()
    expect(focus.getByText("Sẵn sàng tốt nghiệp Cấp 2")).toBeInTheDocument()
  })

  // ── ★★ Con số tiến độ NGUYÊN VĂN mockup: "6/10 lệnh" ★★ ───────────────────
  it("★ ① reads «6/10 lệnh» — exactly the mockup's `.task .prog`, from the server counter", () => {
    // 6 ≠ default 0 ⇒ ca này phân biệt được "đọc server" với "trả hằng số".
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({ so_lenh_co_cl_tp: 6 }),
    })
    renderPanel()
    // ① đang được tập trung → con số nằm trên ô tập trung.
    expect(within(screen.getByTestId("cap2-focus")).getByText("6/10 lệnh")).toBeInTheDocument()
  })

  it("★ the counter never overshoots 10 (server may count past it)", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress({ so_lenh_co_cl_tp: 47 }) })
    renderPanel()
    expect(within(screen.getByTestId("cap2-focus")).getByText("10/10 lệnh")).toBeInTheDocument()
    expect(visibleText()).not.toContain("47")
  })

  // ── ★★ Thanh hành trình (mockup `.jbar`) ★★ ───────────────────────────────
  it("★ jbar reads «CẤP 2 · 0/1» + the mockup's sub-line, with exactly ONE dot", () => {
    renderPanel()
    const jbar = within(screen.getByTestId("cap2-jbar"))
    expect(jbar.getByText("CẤP 2 · 0/1")).toBeInTheDocument()
    expect(jbar.getByText("Đặt 10 lệnh có cắt lỗ / chốt lời")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-jbar-dot-1").className).toContain("cap2-jd--now")
    expect(screen.queryByTestId("cap2-jbar-dot-2")).not.toBeInTheDocument()
  })

  it("★ jbar at 1/1 says the level is finished", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    const jbar = within(screen.getByTestId("cap2-jbar"))
    expect(jbar.getByText("🎓 Hoàn thành Cấp 2!")).toBeInTheDocument()
    expect(screen.getByText("CẤP 2 · 1/1")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-jbar-dot-1").className).toContain("cap2-jd--done")
  })

  // ── Hàng 2 công cụ (mockup `.tools`) ──────────────────────────────────────
  it('clicking "📊 Phân tích danh mục" switches the sidebar to the cap2-analysis panel', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap2 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByText("📊 Phân tích danh mục"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("cap2-analysis")
  })

  it('"Làm ngay →" leads back to the Đặt lệnh tab', () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider>
        <JourneyPanelCap2 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(within(screen.getByTestId("cap2-focus")).getByText("Làm ngay →"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  // ── ★★ Ô mục tiêu: TRẠNG THÁI CUỐI của một người đã tốt nghiệp Cấp 2 ★★ ───
  it("★ goal box says «Xong 1/1 →» and never promises Cấp 3 while the trần is 2", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress({ task_1_done_at: "t" }) })
    renderPanel()
    const goal = screen.getByTestId("cap2-journey-goal")
    expect(goal).toHaveTextContent("Xong 1/1 →")
    expect(goal.textContent ?? "").not.toContain("Xong 2/2")
    expect(goal).not.toHaveTextContent(/lên\s+Cấp 3/)
    expect(goal).toHaveTextContent(/Cấp 3 «Bản lĩnh» chưa ra mắt/)
  })

  it("★ goal box restores the mockup's Cấp 3 wording the moment the trần reaches 3", () => {
    flags.CAP_MAX_ENABLED = 3
    renderPanel()
    const goal = screen.getByTestId("cap2-journey-goal")
    expect(goal).toHaveTextContent(
      "Xong 1/1 → tốt nghiệp Cấp 2, lên Cấp 3 «Bản lĩnh» (quản lý vốn: khẩu vị · tự tin · khối lượng).",
    )
    expect(goal).not.toHaveTextContent(/chưa ra mắt/)
  })

  // ★★ Panel Hành trình KHÔNG được đo/khoe «thực hiện đúng khi giá chạm mốc» —
  // nhiệm vụ ② đã bỏ. Ba con số 🛑/🎯/✅ chỉ còn sống ở «Phân tích danh mục».
  it("★ never shows a «thực hiện đúng» counter, even when the server reports some", () => {
    useCap2ProgressMock.mockReturnValue({
      data: makeProgress({
        so_lenh_co_cl_tp: 4,
        so_lan_cat_lo_dung: 3,
        so_lan_chot_loi_dung: 4,
        so_lan_thuc_hien_dung: 7,
      }),
    })
    renderPanel()
    // Neo DƯƠNG TÍNH: panel thật sự đã render (không phải "không tìm thấy vì
    // không vẽ gì") — xem quy ước ở `src/__tests__/textGuards.ts`.
    expect(within(screen.getByTestId("cap2-focus")).getByText("4/10 lệnh")).toBeInTheDocument()
    const body = visibleText()
    expect(body).not.toContain("thực hiện đúng")
    expect(body).not.toContain("chạm mốc")
    expect(body).not.toContain("7/2")
    // `\b` của JS chỉ tính ASCII ⇒ dùng lookaround unicode, không `\b`.
    expect(body).not.toMatch(/(?<![\d.,])7(?!\p{L}|[\d.,])/u)
  })

  it("does NOT render any medal cabinet / Tủ huân chương (spec — no cấp has one)", () => {
    renderPanel()
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Tt]ủ huân/)).not.toBeInTheDocument()
  })

  it("only queries Cấp 2 progress inside a real Cap2Provider", () => {
    useCap2EventsMock.mockReturnValue({ isCap2Active: false })
    renderPanel()
    expect(useCap2ProgressMock).toHaveBeenCalledWith(false)
  })
})

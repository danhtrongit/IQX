import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap8Progress } from "./types"

const { useCap8ProgressMock, graduateMutate, graduatePending } = vi.hoisted(() => ({
  useCap8ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  graduatePending: { current: false },
}))

vi.mock("./hooks", () => ({
  useCap8Progress: (...a: unknown[]) => useCap8ProgressMock(...a),
  useGraduateCap8: () => ({ mutate: graduateMutate, isPending: graduatePending.current }),
}))

import { GraduationModalCap8, isGraduationReadyCap8 } from "./GraduationModalCap8"

function makeProgress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return {
    id: "p8",
    user_id: "u1",
    entered_at: "2026-11-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_kiem_tra: 0,
    so_lan_mua_bat_chap_canh_bao: 0,
    don_nganh_max_pct: null,
    tong_rui_ro_pct: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    so_lan_co_canh_bao: 0,
    bat_chap_gan_day: 0,
    cua_so_gan_day: 0,
    so_lenh_da_ket_so: 0,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_kiem_tra: 18,
    so_lan_co_canh_bao: 7,
    so_lan_mua_bat_chap_canh_bao: 3,
    bat_chap_gan_day: 1,
    cua_so_gan_day: 15,
    so_lenh_da_ket_so: 12,
    don_nganh_max_pct: 31,
    tong_rui_ro_pct: 14,
    ...overrides,
  })
}

function renderModal() {
  return render(
    <SidebarProvider defaultPanel="trading">
      <GraduationModalCap8 />
    </SidebarProvider>,
  )
}

describe("isGraduationReadyCap8", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap8(null)).toBe(false)
    expect(isGraduationReadyCap8(undefined)).toBe(false)
  })

  it("is false when fewer than 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap8(readyProgress({ task_3_done_at: null }))).toBe(false)
    expect(isGraduationReadyCap8(readyProgress({ task_1_done_at: null }))).toBe(false)
  })

  it("is true at 3/3 and never re-opens once graduated_at is stamped", () => {
    expect(isGraduationReadyCap8(readyProgress())).toBe(true)
    expect(isGraduationReadyCap8(readyProgress({ graduated_at: "2026-12-01T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap8 — màn cuối của chương trình 0-8 (spec §3)", () => {
  beforeEach(() => {
    useCap8ProgressMock.mockReset()
    useCap8ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockClear()
    graduatePending.current = false
  })

  it("stays hidden until 3/3 nhiệm vụ", () => {
    useCap8ProgressMock.mockReturnValue({ data: readyProgress({ task_2_done_at: null }) })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the spec §3 header: tag, title, sub with REAL numbers", () => {
    renderModal()
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 8 · QUẢN TRỊ RỦI RO DANH MỤC")).toBeInTheDocument()
    expect(screen.getByTestId("cap8-grad-sub")).toHaveTextContent(
      "3/3 · danh mục phân tán · tổng rủi ro 14%",
    )
  })

  it('shows the header\'s "Trọn mạch Nhập môn → đây." line verbatim', () => {
    renderModal()
    expect(screen.getByTestId("cap8-grad-tronmach")).toHaveTextContent(
      "Trọn mạch Nhập môn → đây.",
    )
  })

  // ★★ `tong_rui_ro_pct` is `number | null`. `?? 0` in the header would tell a
  // user their whole portfolio carries ZERO risk at the very moment the program
  // congratulates them for measuring it.
  it("★ a null tổng rủi ro renders as «chưa tính được», NEVER as 0%", () => {
    useCap8ProgressMock.mockReturnValue({ data: readyProgress({ tong_rui_ro_pct: null }) })
    renderModal()
    const sub = screen.getByTestId("cap8-grad-sub")
    expect(sub).toHaveTextContent("tổng rủi ro chưa tính được")
    expect(sub.textContent).not.toMatch(/tổng rủi ro 0\s*%/)
  })

  it("★ a null dồn-ngành max renders as «chưa tính được» in the provenance line too", () => {
    useCap8ProgressMock.mockReturnValue({ data: readyProgress({ don_nganh_max_pct: null }) })
    renderModal()
    const prov = screen.getByTestId("cap8-grad-khoi1-provenance")
    expect(prov).toHaveTextContent("chưa tính được")
    expect(prov.textContent).not.toMatch(/ngành lớn nhất 0\s*%/i)
  })

  // ── 3 khối, copy spec §3 verbatim ─────────────────────────────────────────
  it("Khối 1 — Ghi nhận, spec §3 verbatim with {N} filled from the real count", () => {
    renderModal()
    expect(screen.getByTestId("cap8-grad-khoi1")).toHaveTextContent(
      "Bạn đã quản trị rủi ro ở tầm danh mục qua 18 lệnh: không dồn một ngành, để ý các mã cùng nhịp, và luôn biết tổng vốn mình đang đặt cược. Bạn đã đi trọn hành trình từ lệnh đầu tiên ở Cấp 0 tới quản trị cả danh mục hôm nay.",
    )
  })

  it("§C12c — Khối 1 is followed by where its numbers came from", () => {
    renderModal()
    const prov = screen.getByTestId("cap8-grad-khoi1-provenance")
    expect(prov).toHaveTextContent("7 lần bước kiểm tra bật cảnh báo")
    expect(prov).toHaveTextContent("1/15 lệnh gần nhất")
    expect(prov).toHaveTextContent("14%")
    expect(prov).toHaveTextContent("31%")
  })

  it("Khối 2 — Định vị, spec §3 verbatim", () => {
    renderModal()
    expect(screen.getByTestId("cap8-grad-khoi2")).toHaveTextContent(
      "Đây là hết mạch kỹ năng nền tảng. Nhưng thị trường luôn còn tầng sâu hơn: chu kỳ ngành, xoay vòng dòng tiền, định giá nâng cao… Hành trình học không dừng.",
    )
  })

  it("Khối 3 — Chuyển tiếp, spec §3 verbatim", () => {
    renderModal()
    expect(screen.getByTestId("cap8-grad-khoi3")).toHaveTextContent(
      "Bạn đã ở cấp cao nhất hiện có. Các cấp theo chủ đề (Cấp 9+) sẽ mở dần khi ra mắt. Giờ: giữ kỷ luật, và giao dịch như một nhà đầu tư đã đi trọn con đường.",
    )
  })

  // ── CẤP CUỐI: không có cấp sau ────────────────────────────────────────────
  it('★ the ONLY CTA is "Xem hồ sơ hành trình →" — no "vào Cấp 9" anywhere', () => {
    renderModal()
    const cta = screen.getByTestId("cap8-grad-cta")
    expect(cta).toHaveTextContent("Xem hồ sơ hành trình →")
    expect(cta.textContent).not.toMatch(/Cấp 9/)
    expect(cta.textContent).not.toMatch(/Vào Cấp/)
    // Khối 3 mentions Cấp 9+ as TEXT only — nothing clickable inside it.
    const khoi3 = screen.getByTestId("cap8-grad-khoi3")
    expect(within(khoi3).queryByRole("button")).not.toBeInTheDocument()
    expect(within(khoi3).queryByRole("link")).not.toBeInTheDocument()
  })

  // ★★ THE TRAP: the modal is `closable={false}` and only unmounts once
  // `graduated_at` comes back, so a permanently-disabled CTA locks every 3/3
  // user into a screen with no exit.
  it("★ the CTA is NEVER disabled — not even mid-flight", () => {
    renderModal()
    expect(screen.getByTestId("cap8-grad-cta")).not.toBeDisabled()
    graduatePending.current = true
    renderModal()
    expect(screen.getAllByTestId("cap8-grad-cta")[1]).not.toBeDisabled()
  })

  it("records the graduation server-side when the CTA is pressed", () => {
    renderModal()
    fireEvent.click(screen.getByTestId("cap8-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("does not fire a second POST while the first is still in flight", () => {
    graduatePending.current = true
    renderModal()
    fireEvent.click(screen.getByTestId("cap8-grad-cta"))
    expect(graduateMutate).not.toHaveBeenCalled()
  })

  it("★ opens the Hành trình tab (the 0-8 rail) once the graduation is recorded", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="trading">
        <GraduationModalCap8 />
        <PanelSpy />
      </SidebarProvider>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
    fireEvent.click(screen.getByTestId("cap8-grad-cta"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")
  })

  it("does NOT switch panels when the graduation POST fails (no false payoff)", () => {
    graduateMutate.mockImplementationOnce(
      (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error("500"))
      },
    )
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    render(
      <SidebarProvider defaultPanel="trading">
        <GraduationModalCap8 />
        <PanelSpy />
      </SidebarProvider>,
    )
    fireEvent.click(screen.getByTestId("cap8-grad-cta"))
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("trading")
  })

  // ── Mốc "trọn mạch 0-8" (spec §10 checklist) ──────────────────────────────
  it("★ carries the completed 0-8 badge rail — the moment, with no confetti/medal", () => {
    renderModal()
    const rail = screen.getByTestId("cap8-grad-rail")
    for (let n = 0; n <= 8; n++) {
      expect(within(rail).getByTestId(`cap8-grad-rail-${n}`)).toBeInTheDocument()
    }
    expect(within(rail).queryByTestId("cap8-grad-rail-9")).not.toBeInTheDocument()
    // Cấp 8's own cell + the 120px header badge both paint the level colour.
    expect(within(rail).getByTestId("cap8-grad-rail-8").innerHTML).toContain("#3f9b5a")
  })

  it("★ no medal and no confetti anywhere in the finale (§C10)", () => {
    const { container } = renderModal()
    expect(container.querySelector("[class*=confetti]")).toBeNull()
    expect(container.querySelector("[class*=medal]")).toBeNull()
    expect(container.querySelector("[class*=huychuong]")).toBeNull()
    expect(container.textContent).not.toMatch(/huy chương/i)
  })
})

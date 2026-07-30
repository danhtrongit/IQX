import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap3Progress } from "./types"

const { useCap3ProgressMock, graduateMutate, enterCap4Mutate } = vi.hoisted(() => ({
  useCap3ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  enterCap4Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useGraduateCap3: () => ({ mutate: graduateMutate, isPending: false }),
}))

// Cấp 4 is live (Cấp 4 Task FE3) — the CTA now really enters Cấp 4.
vi.mock("@/features/cap4/hooks", () => ({
  useEnterCap4: () => ({ mutate: enterCap4Mutate, isPending: false }),
}))

import { GraduationModalCap3, isGraduationReadyCap3 } from "./GraduationModalCap3"

function makeProgress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-07-28T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_cap3: 16,
    lai_pct_cap3: 6.4,
    diem_ky_luat_tb_cap3: 84,
    ...overrides,
  })
}

describe("isGraduationReadyCap3", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap3(null)).toBe(false)
    expect(isGraduationReadyCap3(undefined)).toBe(false)
  })

  it("is false when fewer than 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap3(readyProgress({ task_3_done_at: null }))).toBe(false)
  })

  it("is true once 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap3(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(isGraduationReadyCap3(readyProgress({ graduated_at: "2026-07-30T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap3", () => {
  beforeEach(() => {
    useCap3ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap4Mutate.mockReset()
  })

  it("does not render when 3/3 isn't met", () => {
    useCap3ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap3 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header (tag/tên/dòng phụ) + a 120px glowing Cấp 3 badge once ready", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 3 · BẢN LĨNH")).toBeInTheDocument()
    // Dòng phụ spec §3: `Lãi +X% · 15+ lệnh · kỷ luật XX%` — real numbers.
    expect(screen.getByText("Lãi +6.4% · 16 lệnh · kỷ luật 84%")).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
  })

  it("renders the 3 khối VERBATIM (spec §3)", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)

    // Khối 1 — Ghi nhận
    expect(screen.getByText(/Bạn đã đạt \+5% với kỷ luật vững/)).toBeInTheDocument()
    expect(screen.getByText("mua bao nhiêu cho mỗi lệnh")).toBeInTheDocument()
    expect(
      screen.getByText(/Bạn không còn mua theo cảm hứng hay tất tay một mã\./),
    ).toBeInTheDocument()

    // Khối 2 — Định vị
    expect(
      screen.getByText(/Nhưng có một câu hỏi bạn chưa trả lời được/),
    ).toBeInTheDocument()
    expect(screen.getByText("phán đoán đúng")).toBeInTheDocument()
    expect(screen.getByText("may mắn")).toBeInTheDocument()
    expect(screen.getByText(/tách quyết định khỏi kết quả/)).toBeInTheDocument()

    // Khối 3 — Chuyển cấp
    expect(screen.getByText("Từ giờ: Cấp 4 «Thuần thục».")).toBeInTheDocument()
    expect(
      screen.getByText(/quyết định đúng-thắng, đúng-thua, sai-thắng, sai-thua/),
    ).toBeInTheDocument()
  })

  it("Khối 3 carries the Cấp 4 tím border class (#a78bfa)", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    expect(document.querySelector(".cap3-grad-block--cap4")).not.toBeNull()
  })

  it('clicking "Vào Cấp 4" graduates Cấp 3 and REALLY enters Cấp 4 (now live)', () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByText("Vào Cấp 4 «Thuần thục» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap4Mutate).toHaveBeenCalledTimes(1)
  })

  it("does NOT enter Cấp 4 before the Cấp 3 graduation actually succeeds", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByText("Vào Cấp 4 «Thuần thục» →"))
    expect(enterCap4Mutate).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-30T00:00:00Z" }),
    })
    render(<GraduationModalCap3 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("shows no huy chương / confetti (spec §11)", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
  })
})

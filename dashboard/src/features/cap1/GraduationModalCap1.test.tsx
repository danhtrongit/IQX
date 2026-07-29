import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap1Progress } from "./types"

const { useCap1ProgressMock, graduateMutate, enterCap2Mutate } = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  enterCap2Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useGraduateCap1: () => ({ mutate: graduateMutate, isPending: false }),
}))

// Cấp 2 is live (Task FE4) — concrete-file import (NOT the `@/features/cap2`
// barrel), same anti-cycle rationale `cap0/GraduationModal.tsx` already
// documents for its own `@/features/cap1/hooks` import.
vi.mock("@/features/cap2/hooks", () => ({
  useEnterCap2: () => ({ mutate: enterCap2Mutate, isPending: false }),
}))

import { GraduationModalCap1, isGraduationReadyCap1 } from "./GraduationModalCap1"

function makeProgress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-21T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    task_6_done_at: null,
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
    so_lan_xem_danh_muc: 0,
    so_lenh_thuc_chien: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    task_6_done_at: "t",
    so_lenh_thuc_chien: 10,
    ...overrides,
  })
}

describe("isGraduationReadyCap1", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap1(null)).toBe(false)
    expect(isGraduationReadyCap1(undefined)).toBe(false)
  })

  it("is false when fewer than 6/6 tasks are done", () => {
    expect(isGraduationReadyCap1(readyProgress({ task_6_done_at: null }))).toBe(false)
  })

  it("is true once 6/6 tasks are done", () => {
    expect(isGraduationReadyCap1(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(
      isGraduationReadyCap1(readyProgress({ graduated_at: "2026-07-21T00:00:00Z" })),
    ).toBe(false)
  })
})

describe("GraduationModalCap1", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap2Mutate.mockReset()
  })

  it("does not render when 6/6 isn't met", () => {
    useCap1ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap1 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header + 3 khối VERBATIM (spec §3) + 120px glowing badge once ready", () => {
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)

    // Header
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 1 · HỌC VIỆC")).toBeInTheDocument()
    expect(screen.getByText("6/6 nhiệm vụ · 10 lệnh Thực chiến")).toBeInTheDocument()

    // Khối 1 — Ghi nhận
    expect(screen.getByText(/Bạn đã đi qua 10 lệnh Thực chiến đầu tiên/)).toBeInTheDocument()
    expect(screen.getByText("Bạn không còn vào lệnh cảm tính.")).toBeInTheDocument()

    // Khối 2 — Định vị
    expect(screen.getByText(/Nhưng biết mua thôi chưa đủ/)).toBeInTheDocument()
    expect(
      screen.getByText(
        "đặt cắt lỗ / chốt lời có cơ sở, và thực hiện đúng cam kết của chính mình",
      ),
    ).toBeInTheDocument()

    // Khối 3 — Chuyển cấp (viền ngọc lam)
    expect(screen.getByText("Từ giờ: Cấp 2 «Kỷ luật».")).toBeInTheDocument()
    expect(screen.getByText(/Bạn sẽ có thêm: chuỗi lệnh kỷ luật/)).toBeInTheDocument()

    // Button
    expect(screen.getByText("Vào Cấp 2 «Kỷ luật» →")).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
  })

  it('clicking "Vào Cấp 2" calls useGraduateCap1().mutate, then really enters Cấp 2 (POST /cap2/enter) — Cấp 2 is live', () => {
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)
    fireEvent.click(screen.getByText("Vào Cấp 2 «Kỷ luật» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap2Mutate).toHaveBeenCalledTimes(1)
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap1ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    render(<GraduationModalCap1 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

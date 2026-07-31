import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap4Progress } from "./types"

const { useCap4ProgressMock, graduateMutate, enterCap5Mutate } = vi.hoisted(() => ({
  useCap4ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  enterCap5Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
  useGraduateCap4: () => ({ mutate: graduateMutate, isPending: false }),
}))

// Cấp 5 is live (Cấp 5 Task FE3) — the CTA now really enters Cấp 5.
vi.mock("@/features/cap5/hooks", () => ({
  useEnterCap5: () => ({ mutate: enterCap5Mutate, isPending: false }),
}))

import { GraduationModalCap4, isGraduationReadyCap4 } from "./GraduationModalCap4"

function makeProgress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "p4",
    user_id: "u1",
    entered_at: "2026-07-30T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 0,
    vu_khi_lop: null,
    diem_mu_lop: null,
    ty_le_thang_dong_thuan_cao: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    ty_le_thang_dong_thuan_cao: 64,
    ...overrides,
  })
}

describe("isGraduationReadyCap4", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap4(null)).toBe(false)
    expect(isGraduationReadyCap4(undefined)).toBe(false)
  })

  it("is false when fewer than 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap4(readyProgress({ task_3_done_at: null }))).toBe(false)
  })

  it("is true once 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap4(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(isGraduationReadyCap4(readyProgress({ graduated_at: "2026-08-10T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap4", () => {
  beforeEach(() => {
    useCap4ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap5Mutate.mockReset()
  })

  it("does not render when 3/3 isn't met", () => {
    useCap4ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header (tag/tên/dòng phụ) + a 120px glowing Cấp 4 badge once ready", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 4 · THUẦN THỤC")).toBeInTheDocument()
    // Dòng phụ spec §3 — số THẬT của user.
    expect(
      screen.getByText("22 lệnh đọc đủ 5 lớp · vũ khí: 💰 Dòng tiền · đồng thuận cao thắng 64%"),
    ).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
    expect(svg?.innerHTML).toContain("#a78bfa")
  })

  it("renders the 3 khối VERBATIM (spec §3), with the user's real vũ khí / điểm mù lớp", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)

    // Khối 1 — Ghi nhận
    expect(screen.getByText(/Bạn đã đọc trọn 5 lớp qua hơn 20 lệnh/)).toBeInTheDocument()
    expect(screen.getByTestId("cap4-grad-khoi1")).toHaveTextContent(
      "Bạn biết vũ khí của mình là đọc lớp 💰 Dòng tiền, và điểm mù cần cải thiện là lớp 📰 Tin tức.",
    )
    expect(screen.getByTestId("cap4-grad-khoi1")).toHaveTextContent(
      /không phụ thuộc hoàn toàn vào AI/,
    )

    // Khối 2 — Định vị
    expect(screen.getByText(/Nhưng đọc giỏi vẫn chưa đủ/)).toBeInTheDocument()
    expect(screen.getByTestId("cap4-grad-khoi2")).toHaveTextContent(
      /Một quyết định tốt vẫn có thể thua, một quyết định ẩu vẫn có thể thắng/,
    )
    expect(screen.getByTestId("cap4-grad-khoi2")).toHaveTextContent(/bản lĩnh của người lão luyện/)

    // Khối 3 — Chuyển cấp
    expect(screen.getByText("Từ giờ: Cấp 5 «Lão luyện».")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-grad-khoi3")).toHaveTextContent(
      /đúng-thắng \/ đúng-thua \/ sai-thắng \/ sai-thua/,
    )
    expect(screen.getByTestId("cap4-grad-khoi3")).toHaveTextContent(
      /đứng ngoài cũng là một quyết định/,
    )
  })

  it("Khối 3 + CTA carry the Cấp 5 vàng kim classes (#e0b64d)", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(document.querySelector(".cap4-grad-block--cap5")).not.toBeNull()
    expect(document.querySelector(".cap4-grad-cta--cap5")).not.toBeNull()
  })

  it('clicking "Vào Cấp 5" graduates Cấp 4 and REALLY enters Cấp 5 (now live)', () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    fireEvent.click(screen.getByText("Vào Cấp 5 «Lão luyện» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap5Mutate).toHaveBeenCalledTimes(1)
  })

  it("does NOT enter Cấp 5 before the Cấp 4 graduation actually succeeds", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap4 />)
    fireEvent.click(screen.getByText("Vào Cấp 5 «Lão luyện» →"))
    expect(enterCap5Mutate).not.toHaveBeenCalled()
  })

  it("degrades honestly when the system never concluded a vũ khí/điểm mù lớp", () => {
    useCap4ProgressMock.mockReturnValue({
      data: readyProgress({ vu_khi_lop: null, diem_mu_lop: null }),
    })
    render(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-khoi1")).toHaveTextContent(/chưa xác định/)
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap4ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-08-10T00:00:00Z" }),
    })
    render(<GraduationModalCap4 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("shows no huy chương / confetti (spec §11)", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
  })
})

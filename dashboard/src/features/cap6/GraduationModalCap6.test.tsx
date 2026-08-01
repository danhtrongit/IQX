import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap6Progress } from "./types"

const { useCap6ProgressMock, graduateMutate, enterCap7Mutate, navigateMock } = vi.hoisted(() => ({
  useCap6ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  enterCap7Mutate: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
  useGraduateCap6: () => ({ mutate: graduateMutate, isPending: false }),
}))

vi.mock("@/features/cap7/hooks", () => ({
  useEnterCap7: () => ({ mutate: enterCap7Mutate, isPending: false }),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

import { GraduationModalCap6, isGraduationReadyCap6 } from "./GraduationModalCap6"

function makeProgress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    id: "p6",
    user_id: "u1",
    entered_at: "2026-07-31T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doi_chieu: 0,
    so_kieu_da_gap: 0,
    ty_le_thang_khop: 0,
    ty_le_thang_lech: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_doi_chieu: 18,
    so_kieu_da_gap: 4,
    ty_le_thang_khop: 64,
    ty_le_thang_lech: 41,
    ...overrides,
  })
}

describe("isGraduationReadyCap6", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap6(null)).toBe(false)
    expect(isGraduationReadyCap6(undefined)).toBe(false)
  })

  it("is false when fewer than 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap6(readyProgress({ task_3_done_at: null }))).toBe(false)
    expect(isGraduationReadyCap6(readyProgress({ task_1_done_at: null }))).toBe(false)
  })

  it("is true once 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap6(readyProgress())).toBe(true)
  })

  it("is false once already graduated — one-way trip, never re-opens", () => {
    expect(isGraduationReadyCap6(readyProgress({ graduated_at: "2026-09-01T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap6", () => {
  beforeEach(() => {
    useCap6ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap7Mutate.mockReset()
    navigateMock.mockReset()
  })

  it("does not render when 3/3 isn't met", () => {
    useCap6ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap6 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header + a 120px glowing Cấp 6 đỏ son badge once ready", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 6 · ĐỐI CHIẾU")).toBeInTheDocument()
    // Dòng phụ spec §3 — `3/3 · {N} lệnh đối chiếu · {K} kiểu`, số THẬT.
    expect(screen.getByText("3/3 · 18 lệnh đối chiếu · 4 kiểu")).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
    expect(svg?.innerHTML).toContain("#d64550")
  })

  it("renders Khối 1 — Ghi nhận, with the user's real {N}/{K} (spec §3)", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)

    const khoi1 = screen.getByTestId("cap6-grad-khoi1")
    expect(khoi1).toHaveTextContent(
      "Bạn đã đối chiếu 18 lệnh khi các lớp mâu thuẫn, qua 4 loại cổ phiếu",
    )
    expect(khoi1).toHaveTextContent(/không còn bối rối khi các tín hiệu trái nhau/)
  })

  it("backs Khối 1 with the real khớp/lệch numbers (§C12c — no bare claim)", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    expect(screen.getByTestId("cap6-grad-khoi1-provenance")).toHaveTextContent(
      "khớp gợi ý thắng 64% vs lệch gợi ý 41%",
    )
  })

  it("renders Khối 2 — Định vị (what the order book adds)", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    const khoi2 = screen.getByTestId("cap6-grad-khoi2")
    expect(khoi2).toHaveTextContent(/mọi lớp tới giờ đọc từ dữ liệu ngày/)
    expect(khoi2).toHaveTextContent(/sổ lệnh/)
    expect(khoi2).toHaveTextContent(/Cấp 7/)
  })

  it("Khối 3 describes what Cấp 7 ACTUALLY is — Lực + cảnh giác lệnh treo lớn", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    expect(screen.getByText("Từ giờ: Cấp 7 «Đọc sổ lệnh».")).toBeInTheDocument()
    const khoi3 = screen.getByTestId("cap6-grad-khoi3")
    expect(khoi3).toHaveTextContent(/Lực/)
    expect(khoi3).toHaveTextContent(/dư mua/)
    expect(khoi3).toHaveTextContent(/lệnh treo/)
  })

  it("Khối 3 promises NOTHING Cấp 7 does not do (no lệnh-giả detection)", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    const khoi3 = screen.getByTestId("cap6-grad-khoi3")
    expect(khoi3.textContent).not.toMatch(/phân biệt cầu thật với lệnh giả/)
    expect(khoi3.textContent).not.toMatch(/phát hiện lệnh giả/)
  })

  it("Khối 3 + CTA carry Cấp 7's hồng magenta classes (#c65cae)", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    expect(document.querySelector(".cap6-grad-block--cap7")).not.toBeNull()
    expect(document.querySelector(".cap6-grad-cta--cap7")).not.toBeNull()
  })

  // ★ Cấp 7 «Đọc sổ lệnh» đã ship — nút KHÔNG còn "sắp ra mắt" nữa. Nó vẫn KHÔNG
  // điều hướng: `DauTruongPage` tự đổi shell khi `graduated_at` về (cùng query).
  it("the Cấp 7 button no longer says «sắp ra mắt», and still NEVER navigates", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    const cta = screen.getByTestId("cap6-grad-cta")
    expect(cta).toHaveTextContent("Vào Cấp 7 «Đọc sổ lệnh»")
    expect(cta.textContent).not.toMatch(/sắp ra mắt/)
    fireEvent.click(cta)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("clicking it records the graduation and REALLY enters Cấp 7", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    fireEvent.click(screen.getByTestId("cap6-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap7Mutate).toHaveBeenCalledTimes(1)
  })

  it("does NOT enter Cấp 7 before the graduation actually succeeds", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap6 />)
    fireEvent.click(screen.getByTestId("cap6-grad-cta"))
    expect(enterCap7Mutate).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap6ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-09-01T00:00:00Z" }),
    })
    render(<GraduationModalCap6 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("shows no huy chương / confetti (spec §10)", () => {
    useCap6ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap6 />)
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
  })
})

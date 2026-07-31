import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap5Progress } from "./types"

const { useCap5ProgressMock, graduateMutate, messageInfo } = vi.hoisted(() => ({
  useCap5ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  messageInfo: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
  useGraduateCap5: () => ({ mutate: graduateMutate, isPending: false }),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModalCap5, isGraduationReadyCap5 } from "./GraduationModalCap5"

function makeProgress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p5",
    user_id: "u1",
    entered_at: "2026-07-31T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_phan_loai: 0,
    so_lan_dung_ngoai_da_cham: 0,
    ty_le_quyet_dinh_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_phan_loai: 24,
    so_lan_dung_ngoai_da_cham: 6,
    ty_le_quyet_dinh_dung: 75,
    ...overrides,
  })
}

describe("isGraduationReadyCap5", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap5(null)).toBe(false)
    expect(isGraduationReadyCap5(undefined)).toBe(false)
  })

  it("is false when fewer than 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap5(readyProgress({ task_3_done_at: null }))).toBe(false)
  })

  it("is true once 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap5(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(isGraduationReadyCap5(readyProgress({ graduated_at: "2026-09-01T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap5", () => {
  beforeEach(() => {
    useCap5ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    messageInfo.mockReset()
  })

  it("does not render when 3/3 isn't met", () => {
    useCap5ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap5 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header (tag/tên/dòng phụ) + a 120px glowing Cấp 5 badge once ready", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 5 · LÃO LUYỆN")).toBeInTheDocument()
    // Dòng phụ spec §3 — `3/3 · {X}% quyết định đúng`, số THẬT của user.
    expect(screen.getByText("3/3 · 75% quyết định đúng")).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
    expect(svg?.innerHTML).toContain("#e0b64d")
  })

  it("renders Khối 1 — Ghi nhận, with the user's real numbers, celebrating the 0-5 arc", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)

    const khoi1 = screen.getByTestId("cap5-grad-khoi1")
    expect(khoi1).toHaveTextContent("Bạn đã nhìn lại 24 lệnh qua 4 ô, và 6 lần chủ động đứng ngoài")
    expect(khoi1).toHaveTextContent("75% quyết định của bạn là ĐÚNG — bất kể thắng hay thua")
    expect(khoi1).toHaveTextContent(/không còn nhầm may mắn với năng lực/)
    // Mốc đóng mạch nền tảng 0-5.
    expect(khoi1).toHaveTextContent(/đi trọn mạch nền tảng Nhập môn → Lão luyện/)
  })

  it("renders Khối 2 — Định vị (the Cấp 6 question)", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)

    const khoi2 = screen.getByTestId("cap5-grad-khoi2")
    expect(khoi2).toHaveTextContent(/Nhưng đến giờ bạn đọc từng lớp riêng lẻ/)
    expect(khoi2).toHaveTextContent(/khối ngoại mua ròng nhưng kỹ thuật xấu/)
    expect(khoi2).toHaveTextContent(/Cấp 6 «Đối chiếu»/)
  })

  it("renders Khối 3 — Chuyển cấp (verbatim spec §3)", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)

    expect(screen.getByText("Từ giờ: Cấp 6 «Đối chiếu».")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-grad-khoi3")).toHaveTextContent(
      /xử lý mâu thuẫn giữa các lớp, và lớp nào quan trọng cho loại cổ phiếu nào/,
    )
  })

  it("Khối 3 + CTA carry the Cấp 6 đỏ son classes (#d64550)", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)
    expect(document.querySelector(".cap5-grad-block--cap6")).not.toBeNull()
    expect(document.querySelector(".cap5-grad-cta--cap6")).not.toBeNull()
  })

  it('clicking "Vào Cấp 6" graduates Cấp 5 and says Cấp 6 is coming (not built yet)', () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)
    fireEvent.click(screen.getByText("Vào Cấp 6 «Đối chiếu» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("Cấp 6"))
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("sắp ra mắt"))
  })

  it("does NOT announce Cấp 6 before the graduation actually succeeds", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap5 />)
    fireEvent.click(screen.getByText("Vào Cấp 6 «Đối chiếu» →"))
    expect(messageInfo).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap5ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-09-01T00:00:00Z" }),
    })
    render(<GraduationModalCap5 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("shows no huy chương / confetti (spec §9)", () => {
    useCap5ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap5 />)
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
  })
})

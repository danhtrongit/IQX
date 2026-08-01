import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap7Progress } from "./types"

const { useCap7ProgressMock, graduateMutate, enterCap8Mutate, messageInfo, navigateMock } =
  vi.hoisted(() => ({
    useCap7ProgressMock: vi.fn(),
    graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    }),
    enterCap8Mutate: vi.fn(),
    messageInfo: vi.fn(),
    navigateMock: vi.fn(),
  }))

vi.mock("./hooks", () => ({
  useCap7Progress: (...a: unknown[]) => useCap7ProgressMock(...a),
  useGraduateCap7: () => ({ mutate: graduateMutate, isPending: false }),
}))

// Cấp 8 «Quản trị rủi ro danh mục» đã ship (Cấp 8 Task FE3) — nút này vào Cấp 8
// THẬT, nên hook `POST /cap8/enter` phải được mock ở đây.
vi.mock("@/features/cap8/hooks", () => ({
  useEnterCap8: () => ({ mutate: enterCap8Mutate, isPending: false }),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModalCap7, isGraduationReadyCap7 } from "./GraduationModalCap7"

function makeProgress(overrides: Partial<Cap7Progress> = {}): Cap7Progress {
  return {
    id: "p7",
    user_id: "u1",
    entered_at: "2026-08-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_luc: 0,
    so_lan_khong_duoi_theo_co: 0,
    ty_le_doc_luc_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    trong_phien: true,
    so_lenh_da_cham: 0,
    so_lenh_chua_cham: 0,
    so_lan_gap_co: 0,
    so_lan_mua_duoi_theo: 0,
    so_phien_cham: 2,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap7Progress> = {}): Cap7Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_doc_luc: 21,
    so_lan_khong_duoi_theo_co: 5,
    ty_le_doc_luc_dung: 61,
    so_lenh_da_cham: 18,
    so_lenh_chua_cham: 3,
    so_lan_gap_co: 9,
    so_lan_mua_duoi_theo: 4,
    ...overrides,
  })
}

describe("isGraduationReadyCap7", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap7(null)).toBe(false)
    expect(isGraduationReadyCap7(undefined)).toBe(false)
  })

  it("is false when fewer than 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap7(readyProgress({ task_3_done_at: null }))).toBe(false)
    expect(isGraduationReadyCap7(readyProgress({ task_1_done_at: null }))).toBe(false)
  })

  it("is true once 3/3 nhiệm vụ are done", () => {
    expect(isGraduationReadyCap7(readyProgress())).toBe(true)
  })

  it("is false once already graduated — one-way trip, never re-opens", () => {
    expect(isGraduationReadyCap7(readyProgress({ graduated_at: "2026-10-01T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap7", () => {
  beforeEach(() => {
    useCap7ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap8Mutate.mockReset()
    messageInfo.mockReset()
    navigateMock.mockReset()
  })

  it("does not render when 3/3 isn't met", () => {
    useCap7ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap7 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header + a 120px glowing Cấp 7 hồng-magenta badge once ready", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 7 · ĐỌC SỔ LỆNH")).toBeInTheDocument()
    // Dòng phụ spec §3 — `3/3 · đọc lực đúng {X}%`, số THẬT.
    expect(screen.getByText("3/3 · đọc lực đúng 61%")).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
    expect(svg?.innerHTML).toContain("#c65cae")
    // fill=7 must not fall off the core-opacity table (Cấp 6's FE3 regression).
    expect(svg?.innerHTML).not.toContain("NaN")
  })

  it("renders Khối 1 — Ghi nhận, VERBATIM spec §3 with the user's real {N}/{M}", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)

    const khoi1 = screen.getByTestId("cap7-grad-khoi1")
    expect(khoi1).toHaveTextContent(
      "Bạn đã đọc lực sổ lệnh qua 21 lệnh, và 5 lần tỉnh táo không đuổi theo lệnh treo đáng ngờ.",
    )
    expect(khoi1).toHaveTextContent(
      "Bạn đọc được bên nào đang áp đảo ngay lúc đặt — và biết lệnh treo to chưa chắc là cầu thật.",
    )
  })

  it("backs Khối 1 with the scored/unscored split (§C12c — no bare claim)", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    const prov = screen.getByTestId("cap7-grad-khoi1-provenance")
    expect(prov).toHaveTextContent("đọc lực đúng 61% trên 18 lệnh đã chấm")
    // ★ Lệnh chưa tới hạn chấm phải được nói ra — nếu không, 61% trông như tính
    // trên cả 21 lệnh và 3 lệnh kia bị hiểu nhầm là đọc sai.
    expect(prov).toHaveTextContent("3 lệnh chưa tới hạn chấm")
    expect(prov).toHaveTextContent(/ngoài mẫu số/i)
  })

  it("renders Khối 2 — Định vị (rủi ro nằm ở cả danh mục, không phải một lệnh)", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    const khoi2 = screen.getByTestId("cap7-grad-khoi2")
    expect(khoi2).toHaveTextContent("Giờ bạn đọc giỏi từng lệnh.")
    expect(khoi2).toHaveTextContent(
      "Nhưng rủi ro lớn nhất không nằm ở một lệnh — mà ở cả danh mục: dồn quá nhiều vào một ngành, các mã cùng lên cùng xuống.",
    )
    expect(khoi2).toHaveTextContent("Quản trị rủi ro toàn danh mục là Cấp 8.")
  })

  it("Khối 3 describes what Cấp 8 ACTUALLY is — ngành / tương quan / tổng rủi ro", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    expect(screen.getByText("Từ giờ: Cấp 8 «Quản trị rủi ro danh mục».")).toBeInTheDocument()
    const khoi3 = screen.getByTestId("cap7-grad-khoi3")
    expect(khoi3).toHaveTextContent(/phân bổ ngành/)
    expect(khoi3).toHaveTextContent(/tương quan/)
    expect(khoi3).toHaveTextContent(/tổng vốn đang ở rủi ro/)
  })

  it("Khối 3 promises NOTHING beyond Cấp 8's actual scope", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    const khoi3 = screen.getByTestId("cap7-grad-khoi3").textContent ?? ""
    // Không hứa tự động hoá, không hứa phát hiện lệnh giả, không hứa lãi.
    expect(khoi3).not.toMatch(/tự động/i)
    expect(khoi3).not.toMatch(/lệnh giả/i)
    expect(khoi3).not.toMatch(/lợi nhuận|sinh lời|thắng/i)
  })

  it("Khối 3 + CTA carry Cấp 8's xanh lá classes (#3f9b5a)", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    expect(document.querySelector(".cap7-grad-block--cap8")).not.toBeNull()
    expect(document.querySelector(".cap7-grad-cta--cap8")).not.toBeNull()
  })

  // ★ Cấp 8 «Quản trị rủi ro danh mục» đã ship — nút KHÔNG còn "sắp ra mắt" nữa.
  // Nó vẫn KHÔNG điều hướng: `DauTruongPage` tự đổi shell khi `graduated_at` về
  // (cùng query `useCap7Progress` mà mutation này vừa invalidate).
  it("the Cấp 8 button no longer says «sắp ra mắt», and still NEVER navigates", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    const cta = screen.getByTestId("cap7-grad-cta")
    expect(cta).toHaveTextContent("Vào Cấp 8 «Quản trị rủi ro danh mục»")
    expect(cta.textContent).not.toMatch(/sắp ra mắt/)
    fireEvent.click(cta)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  // ★★ The bug Cấp 6's FE3 established: this modal is `closable={false}` and only
  // unmounts on `graduated_at`, so a DISABLED "next level" button would trap
  // every 3/3 user in a screen with no way out, forever.
  it("★ the CTA is NOT disabled — a disabled button would trap every 3/3 user", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    expect(screen.getByTestId("cap7-grad-cta")).not.toBeDisabled()
  })

  it("clicking it records the graduation and REALLY enters Cấp 8", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    fireEvent.click(screen.getByTestId("cap7-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap8Mutate).toHaveBeenCalledTimes(1)
    // ★ Không còn thông báo "sắp ra mắt" nào — Cấp 8 có thật.
    expect(messageInfo).not.toHaveBeenCalled()
  })

  // ★★ `POST /cap8/enter` đòi Cấp 7 ĐÃ tốt nghiệp. Bắn nó trước khi
  // `POST /cap7/graduate` thành công thì server 400/403 và user vừa xong 3/3 lại
  // không vào được cấp mới.
  it("★ does NOT enter Cấp 8 before the graduation actually succeeds", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap7 />)
    fireEvent.click(screen.getByTestId("cap7-grad-cta"))
    expect(enterCap8Mutate).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap7ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-10-01T00:00:00Z" }),
    })
    render(<GraduationModalCap7 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("shows no huy chương / confetti (spec §9)", () => {
    useCap7ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap7 />)
    expect(screen.queryByText(/[Hh]uân chương/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Hh]uy chương/)).not.toBeInTheDocument()
  })
})

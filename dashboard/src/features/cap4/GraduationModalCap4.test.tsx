import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap4Progress } from "./types"

const {
  useCap4ProgressMock,
  graduateMutate,
  graduatePending,
  messageInfo,
  enterCap5Mutate,
  flags,
} = vi.hoisted(() => ({
  // Mutable so Khối 3 + dòng CTA can be asserted on BOTH sides of the trần cấp.
  flags: { CAP_MAX_ENABLED: 4 },
  useCap4ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  // Mutable so a test can put the mutation "in flight" and prove the CTA
  // re-opens the moment it settles (a permanent lock would trap a 1/1 user).
  graduatePending: { value: false },
  messageInfo: vi.fn(),
  enterCap5Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
  useGraduateCap4: () => ({ mutate: graduateMutate, isPending: graduatePending.value }),
}))

// Getter (not a plain value): the modal must read the trần at RENDER time.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

// Cấp 5 — concrete-file import (NOT the `@/features/cap5` barrel). Spy canh CẢ
// hai chiều: có `POST /cap5/enter` khi Cấp 5 mở, và tuyệt đối KHÔNG có khi trần
// còn ở 4 (nếu không server sẽ có một hàng `cap5_progress` THẬT cho một cấp
// user không thể vào — router /cap5 đã đăng ký nên request thành công thật).
vi.mock("@/features/cap5/hooks", () => ({
  useEnterCap5: () => ({ mutate: enterCap5Mutate, isPending: false }),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModalCap4, isGraduationReadyCap4 } from "./GraduationModalCap4"

function makeProgress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "p4",
    user_id: "u1",
    entered_at: "2026-07-30T00:00:00Z",
    task_1_done_at: null,
    so_lenh_doc_du_5lop: 0,
    vu_khi_lop: null,
    diem_mu_lop: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function readyProgress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return makeProgress({
    task_1_done_at: "t",
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    ...overrides,
  })
}

describe("isGraduationReadyCap4", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap4(null)).toBe(false)
    expect(isGraduationReadyCap4(undefined)).toBe(false)
  })

  it("is false while the single nhiệm vụ is unfinished", () => {
    expect(isGraduationReadyCap4(readyProgress({ task_1_done_at: null }))).toBe(false)
  })

  it("is true once the single nhiệm vụ is done", () => {
    expect(isGraduationReadyCap4(readyProgress())).toBe(true)
  })

  it("★ does NOT require vũ khí/điểm mù — chúng không còn là cổng tốt nghiệp", () => {
    expect(isGraduationReadyCap4(readyProgress({ vu_khi_lop: null, diem_mu_lop: null }))).toBe(
      true,
    )
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(isGraduationReadyCap4(readyProgress({ graduated_at: "2026-08-10T00:00:00Z" }))).toBe(
      false,
    )
  })
})

describe("GraduationModalCap4", () => {
  beforeEach(() => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    graduatePending.value = false
    messageInfo.mockReset()
    enterCap5Mutate.mockReset()
  })

  it("does not render while the nhiệm vụ isn't done", () => {
    useCap4ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header (tag/tên/dòng phụ) + a 120px glowing Cấp 4 badge once ready", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 4 · THUẦN THỤC")).toBeInTheDocument()
    // Dòng phụ — số THẬT của user, không còn "đồng thuận cao thắng XX%".
    expect(
      screen.getByText("22 lệnh đọc đủ 5 lớp · vũ khí: 💰 Dòng tiền · điểm mù: 📰 Tin tức"),
    ).toBeInTheDocument()

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
    expect(svg?.innerHTML).toContain("#a78bfa")
  })

  it("renders Khối 1 với vũ khí / điểm mù THẬT của user", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.getByText(/Bạn đã đọc trọn 5 lớp qua hơn 20 lệnh/)).toBeInTheDocument()
    expect(screen.getByTestId("cap4-grad-khoi1")).toHaveTextContent(
      "Bạn biết vũ khí của mình là đọc lớp 💰 Dòng tiền, và điểm mù cần cải thiện là lớp 📰 Tin tức.",
    )
  })

  it("degrades honestly when the system never concluded a vũ khí/điểm mù lớp", () => {
    useCap4ProgressMock.mockReturnValue({
      data: readyProgress({ vu_khi_lop: null, diem_mu_lop: null }),
    })
    render(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-khoi1")).toHaveTextContent(/chưa xác định/)
    // …và KHÔNG in ra một lớp bịa hay một con số 0.
    expect(screen.getByTestId("cap4-grad-khoi1")).not.toHaveTextContent(/0%/)
  })

  // ── ★★ Cấp 5 thật = SĂN MÃ ────────────────────────────────────────────────

  it("★★ Khối 2 + Khối 3 nói SĂN MÃ, không phải 4 ô / đứng ngoài / mâu thuẫn giữa các lớp", () => {
    // Cấp 5 «Lão luyện» = chủ động săn mã (mockup Hành trình Cấp 4,
    // IQX-Cap5-Spec, mockup Hành trình Cấp 5, IQX-NguyenTac-Chung — 4/5 nguồn).
    // "4 ô đúng-thắng/…" là bản Cấp 5 CŨ; "mâu thuẫn giữa các lớp" là Cấp 6.
    // Màn tốt nghiệp không được hứa một cấp sau khác với cấp sau có thật.
    flags.CAP_MAX_ENABLED = 5
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)

    const khoi2 = screen.getByTestId("cap4-grad-khoi2")
    const khoi3 = screen.getByTestId("cap4-grad-khoi3")
    expect(khoi2).toHaveTextContent(/mã vẫn tự tìm đến bạn/)
    expect(khoi2).toHaveTextContent(/họ đi săn/)
    expect(khoi3).toHaveTextContent("Từ giờ: Cấp 5 «Lão luyện».")
    expect(khoi3).toHaveTextContent(/bộ lọc/)
    expect(khoi3).toHaveTextContent(/Watchlist/)
    expect(khoi3).toHaveTextContent(/săn nhiều, chọn kỹ, không mua vội/)

    for (const block of [khoi2, khoi3]) {
      expect(block).not.toHaveTextContent(/đúng-thắng/)
      expect(block).not.toHaveTextContent(/sai-thua/)
      expect(block).not.toHaveTextContent(/tách quyết định khỏi kết quả/)
      expect(block).not.toHaveTextContent(/đứng ngoài/)
      expect(block).not.toHaveTextContent(/mâu thuẫn/)
    }
  })

  it("Khối 3 + CTA carry the Cấp 5 vàng kim classes (#e0b64d)", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(document.querySelector(".cap4-grad-block--cap5")).not.toBeNull()
    expect(document.querySelector(".cap4-grad-cta--cap5")).not.toBeNull()
  })

  // ── ★ Trần cấp — CẢ HAI phía ──────────────────────────────────────────────

  it("★ trần = 4: Khối 3 không tuyên bố Cấp 5 đã bắt đầu", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    const khoi3 = screen.getByTestId("cap4-grad-khoi3")
    expect(khoi3).toHaveTextContent("Cấp 5 «Lão luyện» chưa ra mắt.")
    expect(khoi3).toHaveTextContent(/chặng cuối của chương trình hiện tại/)
    // Nội dung Cấp 5 sẽ mang lại vẫn được giữ — chỉ ở thì TƯƠNG LAI.
    expect(khoi3).toHaveTextContent(/chủ động săn mã/)
    expect(khoi3).not.toHaveTextContent("Từ giờ: Cấp 5 «Lão luyện».")
  })

  it("★ trần = 4: dòng «sắp ra mắt» nằm ngay trên nút", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-cta")).toHaveTextContent(
      "Cấp 5 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 4",
    )
  })

  it("★ trần = 4: nút KHÔNG disabled — một nút tắt cứng sẽ nhốt user trong modal closable={false}", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-cta")).not.toBeDisabled()
  })

  it("★ trần = 4: bấm nút VẪN ghi tốt nghiệp, toast «sắp ra mắt», và KHÔNG vào Cấp 5", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    fireEvent.click(screen.getByTestId("cap4-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap5Mutate).not.toHaveBeenCalled()
    expect(messageInfo).toHaveBeenCalledWith(
      "Cấp 5 «Lão luyện» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 4",
    )
  })

  it("★ trần = 4: KHÔNG toast khi mutation tốt nghiệp HỎNG (không báo «đã ghi nhận» giả)", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending / failed — no onSuccess */
    })
    render(<GraduationModalCap4 />)
    fireEvent.click(screen.getByTestId("cap4-grad-cta"))
    expect(messageInfo).not.toHaveBeenCalled()
    expect(enterCap5Mutate).not.toHaveBeenCalled()
  })

  it("★ chặn double-submit: nút khoá TRONG LÚC mutation đang bay, và chỉ trong lúc đó", () => {
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    graduatePending.value = true
    const { rerender } = render(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-cta")).toBeDisabled()

    graduatePending.value = false
    rerender(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-cta")).not.toBeDisabled()
  })

  it('★ trần ≥ 5: bấm "Vào Cấp 5" ghi tốt nghiệp Cấp 4 rồi vào thẳng Cấp 5', () => {
    flags.CAP_MAX_ENABLED = 5
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap4 />)
    expect(screen.getByTestId("cap4-grad-cta")).not.toHaveTextContent(/sắp ra mắt/)
    fireEvent.click(screen.getByText("Vào Cấp 5 «Lão luyện» →"))
    expect(graduateMutate).toHaveBeenCalled()
    expect(enterCap5Mutate).toHaveBeenCalledTimes(1)
    expect(messageInfo).not.toHaveBeenCalled()
  })

  it("★ trần ≥ 5: does NOT enter Cấp 5 before the Cấp 4 graduation actually succeeds", () => {
    flags.CAP_MAX_ENABLED = 5
    useCap4ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap4 />)
    fireEvent.click(screen.getByText("Vào Cấp 5 «Lão luyện» →"))
    expect(enterCap5Mutate).not.toHaveBeenCalled()
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

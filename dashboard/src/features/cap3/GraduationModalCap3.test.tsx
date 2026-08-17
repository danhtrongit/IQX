import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap3Progress } from "./types"

const {
  useCap3ProgressMock,
  graduateMutate,
  graduatePending,
  messageInfo,
  enterCap4Mutate,
  flags,
} = vi.hoisted(() => ({
  // Mutable so Khối 3 + dòng CTA can be asserted on BOTH sides of the trần cấp.
  flags: { CAP_MAX_ENABLED: 3 },
  useCap3ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  // Mutable so a test can put the mutation "in flight" and prove the CTA
  // re-opens the moment it settles (a permanent lock would trap a 3/3 user).
  graduatePending: { value: false },
  messageInfo: vi.fn(),
  enterCap4Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useGraduateCap3: () => ({ mutate: graduateMutate, isPending: graduatePending.value }),
}))

// Getter (not a plain value): the modal must read the trần at RENDER time.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

// Cấp 4 — concrete-file import (NOT the `@/features/cap4` barrel). Spy canh CẢ
// hai chiều: có `POST /cap4/enter` khi Cấp 4 mở, và tuyệt đối KHÔNG có khi trần
// còn ở 3 (nếu không server sẽ có một hàng `cap4_progress` THẬT cho một cấp
// user không thể vào).
vi.mock("@/features/cap4/hooks", () => ({
  useEnterCap4: () => ({ mutate: enterCap4Mutate, isPending: false }),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

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
    // Trần thật của repo lúc viết test này = 3 (Cấp 4 chưa mở). Mỗi test tự đặt
    // lại nếu muốn thử phía bên kia.
    flags.CAP_MAX_ENABLED = 3
    graduatePending.value = false
    useCap3ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    messageInfo.mockReset()
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

  it("renders khối 1 + khối 2 VERBATIM (spec §3)", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)

    // Khối 1 — Ghi nhận
    expect(screen.getByText(/Bạn đã đạt \+5% với kỷ luật vững/)).toBeInTheDocument()
    expect(screen.getByText("mua bao nhiêu cho mỗi lệnh")).toBeInTheDocument()
    expect(
      screen.getByText(/Bạn không còn mua theo cảm hứng hay tất tay một mã\./),
    ).toBeInTheDocument()

    // Khối 2 — Định vị
    expect(screen.getByText(/Nhưng có một câu hỏi bạn chưa trả lời được/)).toBeInTheDocument()
    expect(screen.getByText("phán đoán đúng")).toBeInTheDocument()
    expect(screen.getByText("may mắn")).toBeInTheDocument()
    expect(screen.getByText(/tách quyết định khỏi kết quả/)).toBeInTheDocument()
  })

  it("Khối 3 carries the Cấp 4 tím border class (#a78bfa)", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    expect(document.querySelector(".cap3-grad-block--cap4")).not.toBeNull()
  })

  // ── ★★ Khối 3 phải TRUNG THỰC khi Cấp 4 chưa mở ★★ ────────────────────────
  // Nguyên văn spec §3 nói ở thì HIỆN TẠI ("Từ giờ: Cấp 4 «Thuần thục».") trong
  // khi `DauTruongPage` sẽ trả user về ĐÚNG shell Cấp 3 ngay sau đó. Cùng cách
  // xử lý mà `GraduationModalCap1`/`GraduationModalCap2` đã dùng.
  it("★ Khối 3 does not claim Cấp 4 has started while the trần is below 4", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    const khoi3 = screen.getByTestId("cap3-grad-khoi3")
    expect(khoi3).not.toHaveTextContent("Từ giờ: Cấp 4 «Thuần thục».")
    expect(khoi3).toHaveTextContent(/Cấp 4 «Thuần thục» chưa ra mắt/)
    // Vẫn được nói Cấp 4 SẼ có gì — miễn là ở thì tương lai.
    expect(khoi3).toHaveTextContent(/Khi Cấp 4 mở/)
  })

  it("★ Khối 3 restores the verbatim spec §3 wording the moment the trần reaches 4", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    const khoi3 = screen.getByTestId("cap3-grad-khoi3")
    expect(within(khoi3).getByText("Từ giờ: Cấp 4 «Thuần thục».")).toBeInTheDocument()
    expect(khoi3).toHaveTextContent(
      /quyết định đúng-thắng, đúng-thua, sai-thắng, sai-thua/,
    )
    expect(khoi3).not.toHaveTextContent(/chưa ra mắt/)
    // ...và dòng "sắp ra mắt" dưới CTA tự biến mất cùng lúc.
    expect(screen.getByTestId("cap3-grad-cta")).not.toHaveTextContent(/sắp ra mắt/)
  })

  // ── ★★ Khi trần cấp còn ở 3 (Cấp 4 chưa mở) ★★ ────────────────────────────
  it("★ the CTA says «sắp ra mắt» right on the button while the trần is below 4", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    expect(screen.getByTestId("cap3-grad-cta")).toHaveTextContent(/sắp ra mắt/)
  })

  it("★ the CTA is NOT disabled — a disabled button would trap the user in a closable={false} modal", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    const cta = screen.getByTestId("cap3-grad-cta")
    expect(cta).toBeEnabled()
    expect(cta).not.toHaveAttribute("disabled")
  })

  it("★ chặn double-submit: nút khoá TRONG LÚC mutation đang bay, và chỉ trong lúc đó", () => {
    // `isPending` của TanStack về `false` cả khi mutation lỗi, nên guard này
    // KHÔNG thể nhốt user trong modal `closable={false}`.
    graduatePending.value = true
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    const { unmount } = render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
    expect(graduateMutate).not.toHaveBeenCalled()
    unmount()

    graduatePending.value = false
    render(<GraduationModalCap3 />)
    const cta = screen.getByTestId("cap3-grad-cta")
    expect(cta).toBeEnabled()
    fireEvent.click(cta)
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("★ clicking it STILL records the graduation, toasts «sắp ra mắt» and enters NO Cấp 4", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("sắp ra mắt"))
    expect(enterCap4Mutate).not.toHaveBeenCalled()
  })

  it("★ does not toast when the graduation mutation FAILS (no false «đã ghi nhận» signal)", () => {
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementationOnce(
      (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error("network"))
      },
    )
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
    expect(messageInfo).not.toHaveBeenCalled()
  })

  // ── ★★ Cấp 4 ĐANG MỞ (trần ≥ 4) ★★ ────────────────────────────────────────
  it('★ clicking "Vào Cấp 4" graduates Cấp 3 and REALLY enters Cấp 4 once the trần reaches 4', () => {
    flags.CAP_MAX_ENABLED = 4
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap4Mutate).toHaveBeenCalledTimes(1)
    expect(messageInfo).not.toHaveBeenCalled()
  })

  it("★ does not enter Cấp 4 when the graduation mutation FAILS", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementationOnce(
      (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error("network"))
      },
    )
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
    expect(enterCap4Mutate).not.toHaveBeenCalled()
  })

  it("does NOT enter Cấp 4 before the Cấp 3 graduation actually succeeds", () => {
    flags.CAP_MAX_ENABLED = 4
    useCap3ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementation(() => {
      /* pending — no onSuccess */
    })
    render(<GraduationModalCap3 />)
    fireEvent.click(screen.getByTestId("cap3-grad-cta"))
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

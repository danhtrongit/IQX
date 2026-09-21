import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap2Progress } from "./types"

const {
  useCap2ProgressMock,
  graduateMutate,
  graduatePending,
  messageInfo,
  enterCap3Mutate,
  flags,
} = vi.hoisted(() => ({
  // Mutable so Khối 3 + dòng CTA can be asserted on BOTH sides of the trần cấp.
  flags: { CAP_MAX_ENABLED: 2 },
  useCap2ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  // Mutable so a test can put the mutation "in flight" and prove the CTA
  // re-opens the moment it settles (a permanent lock would trap a 1/1 user).
  graduatePending: { value: false },
  messageInfo: vi.fn(),
  enterCap3Mutate: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useGraduateCap2: () => ({ mutate: graduateMutate, isPending: graduatePending.value }),
}))

// Getter (not a plain value): the modal must read the trần at RENDER time.
vi.mock("@/features/cap1/capFlags", () => ({
  get CAP_MAX_ENABLED() {
    return flags.CAP_MAX_ENABLED
  },
}))

// Cấp 3 — concrete-file import (NOT the `@/features/cap3` barrel). Spy canh CẢ
// hai chiều: có `POST /cap3/enter` khi Cấp 3 mở, và tuyệt đối KHÔNG có khi trần
// còn ở 2.
vi.mock("@/features/cap3/hooks", () => ({
  useEnterCap3: () => ({ mutate: enterCap3Mutate, isPending: false }),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModalCap2, isGraduationReadyCap2 } from "./GraduationModalCap2"

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

/**
 * Hàng "đủ điều kiện tốt nghiệp" = ĐÚNG MỘT nhiệm vụ xong.
 *
 * ★ Ba con số 🛑/🎯/✅ đặt KHÁC 0 và KHÁC nhau có chủ ý: nếu màn tốt nghiệp
 * (hoặc `isGraduationReadyCap2`) còn đọc chúng, bài canh dưới sẽ thấy.
 */
function readyProgress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return makeProgress({
    task_1_done_at: "t",
    so_lenh_co_cl_tp: 10,
    so_lan_cat_lo_dung: 31,
    so_lan_chot_loi_dung: 42,
    so_lan_thuc_hien_dung: 73,
    ...overrides,
  })
}

describe("isGraduationReadyCap2", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap2(null)).toBe(false)
    expect(isGraduationReadyCap2(undefined)).toBe(false)
  })

  it("is false while ① is not done — ① is the whole gate", () => {
    expect(isGraduationReadyCap2(readyProgress({ task_1_done_at: null }))).toBe(false)
  })

  it("is true once 1/1 nhiệm vụ is done", () => {
    expect(isGraduationReadyCap2(readyProgress())).toBe(true)
  })

  // ★★ Cùng cái bẫy `cap0/types.ts`/`cap1/types.ts` đã ghi, và lần này chính
  // `task_2_done_at` là cột VỪA BỊ XOÁ khỏi server: một wire shape cũ còn sót
  // nó KHÔNG được tính thành nhiệm vụ thứ 2.
  it("★ leftover task_2/3/4/5_done_at from an old wire shape never counts as a nhiệm vụ", () => {
    const stale = {
      ...readyProgress({ task_1_done_at: null }),
      task_2_done_at: "t",
      task_3_done_at: "t",
      task_4_done_at: "t",
      task_5_done_at: "t",
    } as unknown as Cap2Progress
    expect(isGraduationReadyCap2(stale)).toBe(false)
  })

  // ★ Ba con số 🛑/🎯/✅ là SỐ MÔ TẢ — chúng không mở cổng tốt nghiệp nào.
  it("★ the 🛑/🎯/✅ analytics counters do NOT gate graduation either way", () => {
    expect(
      isGraduationReadyCap2(
        readyProgress({
          so_lan_cat_lo_dung: 0,
          so_lan_chot_loi_dung: 0,
          so_lan_thuc_hien_dung: 0,
        }),
      ),
    ).toBe(true)
    expect(
      isGraduationReadyCap2(
        makeProgress({ so_lan_thuc_hien_dung: 99, so_lan_cat_lo_dung: 99 }),
      ),
    ).toBe(false)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(
      isGraduationReadyCap2(readyProgress({ graduated_at: "2026-07-21T00:00:00Z" })),
    ).toBe(false)
  })
})

describe("GraduationModalCap2", () => {
  beforeEach(() => {
    useCap2ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    graduatePending.value = false
    messageInfo.mockReset()
    enterCap3Mutate.mockReset()
    // Mặc định = trần THẬT của sản phẩm hiện tại (Cấp 3 CHƯA mở).
    flags.CAP_MAX_ENABLED = 2
  })

  it("does not render when 1/1 isn't met", () => {
    useCap2ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModalCap2 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

it("shows the badge and next-level action without the removed narrative blocks", () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(document.querySelectorAll(".cap0-grad-block")).toHaveLength(0)
    expect(screen.getByRole("button", { name: /Vào cấp 3: Bản lĩnh/ })).toBeEnabled()
  })

  // ── ★★ Khối 3 phải TRUNG THỰC khi Cấp 3 chưa mở ★★ ────────────────────────
  // Nguyên văn spec §13 nói ở thì HIỆN TẠI ("Từ giờ: Cấp 3 «Bản lĩnh».") trong
  // khi dòng dưới CTA nói "Cấp 3 sắp ra mắt" — cùng một màn hình tự mâu thuẫn.
  // ĐÚNG cái xử lý mà `GraduationModalCap1` đang dùng cho Khối 3 của nó.

  // ── ★★ Khi trần cấp còn ở 2 (Cấp 3 chưa mở) ★★ ────────────────────────────
  // Modal này `closable={false}` và chỉ tự đóng khi `graduated_at` có giá trị,
  // nên một nút `disabled` sẽ NHỐT VĨNH VIỄN mọi user đã xong nhiệm vụ (lỗi đã
  // phải sửa 2 lần trên codebase này). Nút PHẢI bấm được, PHẢI ghi tốt nghiệp,
  // và chỉ nói thẳng "sắp ra mắt".
  it("★ the CTA says «sắp ra mắt» right on the button while the trần is below 3", () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)
    expect(screen.getByTestId("cap2-grad-cta")).toHaveTextContent(/sắp ra mắt/)
  })

  it("★ the CTA is NOT disabled — a disabled button would trap the user in a closable={false} modal", () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)
    const cta = screen.getByTestId("cap2-grad-cta")
    expect(cta).toBeEnabled()
    expect(cta).not.toHaveAttribute("disabled")
  })

  it("★ chặn double-submit: nút khoá TRONG LÚC mutation đang bay, và chỉ trong lúc đó", () => {
    // `isPending` của TanStack về `false` cả khi mutation lỗi, nên guard này
    // KHÔNG thể nhốt user trong modal `closable={false}` — nó chỉ chặn cú click
    // thứ hai lúc request chưa về.
    graduatePending.value = true
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    const { unmount } = render(<GraduationModalCap2 />)
    fireEvent.click(screen.getByTestId("cap2-grad-cta"))
    expect(graduateMutate).not.toHaveBeenCalled()
    unmount()

    graduatePending.value = false
    render(<GraduationModalCap2 />)
    const cta = screen.getByTestId("cap2-grad-cta")
    expect(cta).toBeEnabled()
    fireEvent.click(cta)
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("★ clicking it STILL records the graduation, toasts «sắp ra mắt» and enters NO Cấp 3", () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)
    fireEvent.click(screen.getByTestId("cap2-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("sắp ra mắt"))
    expect(enterCap3Mutate).not.toHaveBeenCalled()
  })

  it("★ does not toast when the graduation mutation FAILS (no false «đã ghi nhận» signal)", () => {
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementationOnce(
      () => {
        /* ★ Hỏng THẬT = react-query không gọi `onSuccess`. Component chỉ
           truyền `{ onSuccess }` cho `mutate`, nên KHÔNG có `onError` nào để
           gọi — bản trước gọi `opts.onError` vào khoảng không và chỉ chứng
           minh chính cái mock của nó. */
      },
    )
    render(<GraduationModalCap2 />)
    fireEvent.click(screen.getByTestId("cap2-grad-cta"))
    expect(messageInfo).not.toHaveBeenCalled()
  })

  // ── ★★ Cấp 3 ĐANG MỞ (trần ≥ 3) ★★ ────────────────────────────────────────
  it('★ clicking "Vào Cấp 3" graduates Cấp 2 and REALLY enters Cấp 3 once the trần reaches 3', () => {
    flags.CAP_MAX_ENABLED = 3
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap2 />)
    fireEvent.click(screen.getByTestId("cap2-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap3Mutate).toHaveBeenCalledTimes(1)
    // No "sắp ra mắt" placeholder toast — the user is routed into Cấp 3 by
    // `DauTruongPage` off the same invalidated progress query.
    expect(messageInfo).not.toHaveBeenCalled()
  })

  it("★ does not enter Cấp 3 when the graduation mutation FAILS", () => {
    flags.CAP_MAX_ENABLED = 3
    useCap2ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementationOnce(
      () => {
        /* ★ Hỏng THẬT = react-query không gọi `onSuccess`. Component chỉ
           truyền `{ onSuccess }` cho `mutate`, nên KHÔNG có `onError` nào để
           gọi — bản trước gọi `opts.onError` vào khoảng không và chỉ chứng
           minh chính cái mock của nó. */
      },
    )
    render(<GraduationModalCap2 />)
    fireEvent.click(screen.getByTestId("cap2-grad-cta"))
    expect(enterCap3Mutate).not.toHaveBeenCalled()
  })

  // ★★ Màn tốt nghiệp KHÔNG được ghi công việc user không làm — đúng lỗi màn
  // tốt nghiệp Cấp 0 từng mắc và Cấp 1/2 đã phải canh bằng test. Cấp 2 giờ chỉ
  // đo MỘT việc: đặt cắt lỗ/chốt lời cho 10 lệnh.

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap2ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    render(<GraduationModalCap2 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

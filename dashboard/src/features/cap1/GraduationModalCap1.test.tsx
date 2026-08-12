import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap1Progress } from "./types"

const {
  useCap1ProgressMock,
  graduateMutate,
  graduatePending,
  enterCap2Mutate,
  messageInfo,
  navigateMock,
  flags,
} = vi.hoisted(() => ({
  // Mutable so Khối 3 + dòng CTA can be asserted in BOTH states of the công tắc.
  flags: { CAP_2_PLUS_ENABLED: false },
  useCap1ProgressMock: vi.fn(),
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  // Mutable so a test can put the mutation "in flight" and prove the CTA still
  // isn't disabled (a `disabled={graduate.isPending}` would bite here).
  graduatePending: { value: false },
  enterCap2Mutate: vi.fn(),
  messageInfo: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useGraduateCap1: () => ({ mutate: graduateMutate, isPending: graduatePending.value }),
}))

// Getter (not a plain value): the modal must read the flag at RENDER time.
vi.mock("./capFlags", () => ({
  get CAP_2_PLUS_ENABLED() {
    return flags.CAP_2_PLUS_ENABLED
  },
}))

// ★ Cấp 2-8 TẠM TẮT: `GraduationModalCap1` không còn gọi `useEnterCap2` nữa.
// Spy vẫn giữ ở đây để test canh được rằng KHÔNG có `POST /cap2/enter` nào bị
// bắn ra (nếu ai đó nối lại dây, `vi.mock` này vẫn hoạt động và test sẽ đỏ).
vi.mock("@/features/cap2/hooks", () => ({
  useEnterCap2: () => ({ mutate: enterCap2Mutate, isPending: false }),
}))

// ★ "does not navigate" — mock `useNavigate` để chứng minh nút CTA không điều
// hướng đi đâu (kể cả khi sau này có ai thêm `navigate(...)` vào onClick).
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

// Chỉ stub `Message` (toast "sắp ra mắt") — giữ nguyên Modal thật.
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

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
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
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
    so_lenh_thuc_chien: 10,
    ...overrides,
  })
}

describe("isGraduationReadyCap1", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReadyCap1(null)).toBe(false)
    expect(isGraduationReadyCap1(undefined)).toBe(false)
  })

  it("is false when fewer than 5/5 tasks are done", () => {
    expect(isGraduationReadyCap1(readyProgress({ task_5_done_at: null }))).toBe(false)
    expect(isGraduationReadyCap1(readyProgress({ task_4_done_at: null }))).toBe(false)
  })

  it("is true once 5/5 tasks are done", () => {
    expect(isGraduationReadyCap1(readyProgress())).toBe(true)
  })

  // ★ Cùng cái bẫy `cap0/types.ts` đã ghi: một wire shape cũ còn sót
  // `task_6_done_at` không được tính là nhiệm vụ thứ 6 — hành trình chỉ còn 5.
  it("★ ignores a leftover task_6_done_at from the old 6-nhiệm-vụ wire shape", () => {
    const stale = {
      ...readyProgress({ task_5_done_at: null }),
      task_6_done_at: "t",
    } as unknown as Cap1Progress
    expect(isGraduationReadyCap1(stale)).toBe(false)
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
    graduatePending.value = false
    enterCap2Mutate.mockReset()
    messageInfo.mockReset()
    navigateMock.mockReset()
    flags.CAP_2_PLUS_ENABLED = false
  })

  it("does not render when 5/5 isn't met", () => {
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
    expect(screen.getByText("5/5 nhiệm vụ · 10 lệnh Thực chiến")).toBeInTheDocument()

    // Khối 1 — Ghi nhận
    expect(screen.getByText(/Bạn đã đi qua 10 lệnh Thực chiến đầu tiên/)).toBeInTheDocument()
    expect(screen.getByText("Bạn không còn vào lệnh cảm tính.")).toBeInTheDocument()

    // ★ Khối 1 không được ghi công nhiệm vụ đã bị bỏ («Xem lại danh mục» —
    // đúng lỗi màn tốt nghiệp Cấp 0 từng mắc).
    expect(screen.getByTestId("cap1-grad-khoi1").textContent).not.toMatch(
      /[Xx]em lại danh mục|nhìn lại danh mục/,
    )

    // Khối 2 — Định vị
    expect(screen.getByText(/Nhưng biết mua thôi chưa đủ/)).toBeInTheDocument()
    expect(
      screen.getByText(
        "đặt cắt lỗ / chốt lời có cơ sở, và thực hiện đúng cam kết của chính mình",
      ),
    ).toBeInTheDocument()

    // Button
    expect(screen.getByTestId("cap1-grad-cta")).toHaveTextContent("Vào Cấp 2 «Kỷ luật» →")

    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
  })

  // ── ★★ Khối 3 phải TRUNG THỰC khi Cấp 2 chưa mở ★★ ────────────────────────
  // Nguyên văn spec §3 nói ở thì HIỆN TẠI ("Từ giờ: Cấp 2 «Kỷ luật».", "Bạn sẽ
  // có thêm: …") trong khi dòng dưới CTA nói "Cấp 2 sắp ra mắt" — cùng một màn
  // hình tự mâu thuẫn. Khi `CAP_2_PLUS_ENABLED = false`, Khối 3 phải nói đúng
  // sự thật; khi bật lại, nguyên văn spec quay về mà không phải sửa dòng nào.
  it("★ Khối 3 does not claim Cấp 2 has started while CAP_2_PLUS_ENABLED is false", () => {
    flags.CAP_2_PLUS_ENABLED = false
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)
    const khoi3 = screen.getByTestId("cap1-grad-khoi3")
    expect(khoi3).not.toHaveTextContent("Từ giờ: Cấp 2 «Kỷ luật».")
    expect(khoi3).not.toHaveTextContent(/^.*Bạn sẽ có thêm: chuỗi lệnh kỷ luật/)
    expect(khoi3).toHaveTextContent(/Cấp 2 «Kỷ luật» chưa ra mắt/)
    // Vẫn được nói Cấp 2 SẼ có gì — miễn là ở thì tương lai, không phải "từ giờ".
    expect(khoi3).toHaveTextContent(/Khi Cấp 2 mở/)
  })

  it("★ Khối 3 restores the verbatim spec §3 wording the moment the flag flips back on", () => {
    flags.CAP_2_PLUS_ENABLED = true
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)
    const khoi3 = screen.getByTestId("cap1-grad-khoi3")
    expect(within(khoi3).getByText("Từ giờ: Cấp 2 «Kỷ luật».")).toBeInTheDocument()
    expect(khoi3).toHaveTextContent(
      "Form Kế hoạch thêm 2 phần: Cắt lỗ và Chốt lời — với 2 cách đặt có cơ sở. Bạn sẽ có thêm: chuỗi lệnh kỷ luật · điểm kỷ luật hằng ngày · cảnh báo khi giá chạm cắt lỗ.",
    )
    expect(khoi3).not.toHaveTextContent(/chưa ra mắt/)
    // ...và dòng "sắp ra mắt" dưới CTA tự biến mất cùng lúc.
    expect(screen.getByTestId("cap1-grad-cta")).not.toHaveTextContent(/sắp ra mắt/)
  })

  // ── ★★ CẤP 2 TẠM TẮT ★★ ───────────────────────────────────────────────────
  // Modal này `closable={false}` và chỉ tự đóng khi `graduated_at` có giá trị,
  // nên một nút `disabled` sẽ NHỐT VĨNH VIỄN mọi user đã xong 5/5 (lỗi đã phải
  // sửa 2 lần trên codebase này). Nút PHẢI bấm được, PHẢI ghi tốt nghiệp, và
  // chỉ nói thẳng "sắp ra mắt".
  it("★ the CTA says «sắp ra mắt» right on the button", () => {
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)
    expect(screen.getByTestId("cap1-grad-cta")).toHaveTextContent(/sắp ra mắt/)
  })

  it("★ the CTA is NOT disabled — a disabled button would trap every 5/5 user in a closable={false} modal", () => {
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)
    const cta = screen.getByTestId("cap1-grad-cta")
    expect(cta).toBeEnabled()
    expect(cta).not.toHaveAttribute("disabled")
  })

  it("★ chặn double-submit: nút khoá TRONG LÚC mutation đang bay, và chỉ trong lúc đó", () => {
    // `isPending` của TanStack về `false` cả khi mutation lỗi, nên guard này
    // KHÔNG thể nhốt user trong modal `closable={false}` — nó chỉ chặn cú
    // click thứ hai lúc request chưa về. Bỏ nó đi thì double-click bắn hai
    // lần `POST /cap1/graduate`. Cấp 6/7 giữ guard này, Cấp 1 phải giống.
    graduatePending.value = true
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    const { unmount } = render(<GraduationModalCap1 />)
    fireEvent.click(screen.getByTestId("cap1-grad-cta"))
    expect(graduateMutate).not.toHaveBeenCalled()
    unmount()

    // Mutation xong (kể cả khi hỏng) → nút mở lại, user không bị kẹt.
    graduatePending.value = false
    render(<GraduationModalCap1 />)
    const cta = screen.getByTestId("cap1-grad-cta")
    expect(cta).toBeEnabled()
    fireEvent.click(cta)
    expect(graduateMutate).toHaveBeenCalledTimes(1)
  })

  it("★ clicking it STILL records the graduation, toasts «sắp ra mắt», enters NO Cấp 2 and navigates nowhere", () => {
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModalCap1 />)
    fireEvent.click(screen.getByTestId("cap1-grad-cta"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("sắp ra mắt"))
    expect(enterCap2Mutate).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★ does not toast when the graduation mutation FAILS (no false «đã ghi nhận» signal)", () => {
    useCap1ProgressMock.mockReturnValue({ data: readyProgress() })
    graduateMutate.mockImplementationOnce(
      (_vars?: unknown, opts?: { onError?: (e: unknown) => void }) => {
        opts?.onError?.(new Error("network"))
      },
    )
    render(<GraduationModalCap1 />)
    fireEvent.click(screen.getByTestId("cap1-grad-cta"))
    expect(messageInfo).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap1ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    render(<GraduationModalCap1 />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

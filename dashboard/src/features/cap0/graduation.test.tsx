import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap0ProgressMock, graduateMutate, messageInfo } = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  // Mirror react-query's real `mutate(variables, options)` shape — by
  // default synchronously invoke `onSuccess` (the happy path).
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  messageInfo: vi.fn(),
}))

// `GraduationModal` only needs `useCap0Progress` + `useGraduate` — mock
// `./hooks` directly (same pattern as `Cap0TradingPage.test.tsx`/
// `debrief.test.tsx`) so no QueryClient/http-client setup is needed here.
vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
  useGraduate: () => ({ mutate: graduateMutate, isPending: false }),
}))

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModal, isGraduationReady } from "./GraduationModal"

function makeProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    entered_at: "2026-07-21T00:00:00Z",
    virtual_balance_init: 250_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    task_6_done_at: null,
    task1_star_clicked: false,
    task5_sl_typed: false,
    task6_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/** All 6 tasks done + both behaviour gates — the spec §9 open condition. */
function readyProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    task_6_done_at: "t",
    task5_sl_typed: true,
    task6_debrief_done: true,
    ...overrides,
  })
}

// ── isGraduationReady (spec §9 open condition) ──────────────────────────────
describe("isGraduationReady", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReady(null)).toBe(false)
    expect(isGraduationReady(undefined)).toBe(false)
  })

  it("is false when tasks aren't all 6 done yet, even with both gates true", () => {
    expect(
      isGraduationReady(
        makeProgress({ task5_sl_typed: true, task6_debrief_done: true, task_6_done_at: null }),
      ),
    ).toBe(false)
  })

  it("is false when 6/6 but task5_sl_typed is missing", () => {
    expect(isGraduationReady(readyProgress({ task5_sl_typed: false }))).toBe(false)
  })

  it("is false when 6/6 but task6_debrief_done is missing", () => {
    expect(isGraduationReady(readyProgress({ task6_debrief_done: false }))).toBe(false)
  })

  it("is true once 6/6 + both gates are met", () => {
    expect(isGraduationReady(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(isGraduationReady(readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }))).toBe(false)
  })
})

// ── GraduationModal (spec §9 3 khối + button) ───────────────────────────────
describe("GraduationModal", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    messageInfo.mockReset()
  })

  it("does not render when the 6/6+2-gate condition isn't met", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    render(<GraduationModal />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header + 3 khối (verbatim §9 copy) + button once ready", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModal />)

    // Header
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 0 · NHẬP MÔN")).toBeInTheDocument()
    expect(screen.getByText("6/6 nhiệm vụ · 2/2 cổng hành vi")).toBeInTheDocument()

    // Khối 1 — Ghi nhận
    expect(
      screen.getByText(/Bạn đã đi trọn Cấp 0 «Nhập môn»/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Phần lớn người mua cổ phiếu ngoài kia chưa từng làm điều cuối cùng\./),
    ).toBeInTheDocument()

    // Khối 2 — Định vị trung thực
    expect(screen.getByText(/Nói thẳng: bạn đã biết/)).toBeInTheDocument()
    expect(screen.getByText("CÁCH CHƠI")).toBeInTheDocument()
    expect(screen.getByText("CHƠI GIỎI")).toBeInTheDocument()
    expect(screen.getByText(/'chọn mã nào'/)).toBeInTheDocument()

    // Khối 3 — Chuyển chế độ (viền xanh)
    expect(screen.getByText("Từ giờ: chế độ THỰC CHIẾN.")).toBeInTheDocument()
    expect(screen.getByText(/T\+2,5 ngày/)).toBeInTheDocument()

    // Button
    expect(screen.getByText("Vào Cấp 1 «Học việc» →")).toBeInTheDocument()
  })

  it("renders the 120px glowing badge (spec §12 n=0, fill=1 — \"vừa đúc xong\")", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModal />)
    // Arco's `Modal` renders its content via a portal into `document.body`
    // (outside RTL's `container`), so query the document directly — same
    // reason other Cap0 modal tests use `screen` rather than `container`.
    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
  })

  it('clicking "Vào Cấp 1" calls useGraduate().mutate and toasts a Cấp 1 placeholder', () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    render(<GraduationModal />)
    fireEvent.click(screen.getByText("Vào Cấp 1 «Học việc» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(messageInfo).toHaveBeenCalledWith(expect.stringContaining("Cấp 1"))
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap0ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    render(<GraduationModal />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

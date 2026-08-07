import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap0ProgressMock,
  usePremiumStatusMock,
  graduateMutate,
  enterCap1Mutate,
  messageInfo,
  navigateMock,
} = vi.hoisted(() => ({
  useCap0ProgressMock: vi.fn(),
  // Defaults to a premium user so the many pre-existing tests below (all
  // written before the premium-honest fix) keep exercising the ORIGINAL
  // spec §9 verbatim copy without every one of them needing to opt in.
  usePremiumStatusMock: vi.fn(() => ({ isPremium: true, isLoading: false })),
  // Mirror react-query's real `mutate(variables, options)` shape — by
  // default synchronously invoke `onSuccess` (the happy path).
  graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.()
  }),
  enterCap1Mutate: vi.fn(),
  messageInfo: vi.fn(),
  navigateMock: vi.fn(),
}))

// `GraduationModal` only needs `useCap0Progress` + `useGraduate` — mock
// `./hooks` directly (same pattern as `Cap0TradingPage.test.tsx`/
// `debrief.test.tsx`) so no QueryClient/http-client setup is needed here.
vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
  useGraduate: () => ({ mutate: graduateMutate, isPending: false }),
}))

// Task FE3 — the premium "Vào Cấp 1" branch now also fires the idempotent
// `POST /cap1/enter` (concrete-file import, see `GraduationModal.tsx`'s own
// comment on why not the `@/features/cap1` barrel).
vi.mock("@/features/cap1/hooks", () => ({
  useEnterCap1: () => ({ mutate: enterCap1Mutate, isPending: false }),
}))

// Premium-honest mode fix — `GraduationModal` now reads `usePremiumStatus`
// to decide which Khối 3 copy + CTA to show (see `types.ts#tradingModeFor`).
vi.mock("@/features/premium", () => ({
  usePremiumStatus: (...a: unknown[]) => usePremiumStatusMock(...a),
}))

// Same fix also added a `useNavigate()` call (free-graduate CTA routes to
// `/nang-cap`) — spy on it the same way `Cap0TradingPage.test.tsx` does,
// keeping the real `MemoryRouter` so the component still has Router context.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return { ...actual, Message: { ...actual.Message, info: messageInfo } }
})

import { GraduationModal, isGraduationReady } from "./GraduationModal"

/**
 * Kept wrapped in `MemoryRouter` (and `useNavigate` kept spied) so the tests
 * below can assert the modal NO LONGER navigates anywhere — Cấp 1 is free, so
 * the free-graduate CTA enters Cấp 1 rather than routing to `/nang-cap`.
 */
function renderModal() {
  return render(
    <MemoryRouter>
      <GraduationModal />
    </MemoryRouter>,
  )
}

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
    task1_star_clicked: false,
    task5_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/** All 5 tasks done + THE behaviour gate — the spec v3.0 §9 open condition. */
function readyProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    task5_debrief_done: true,
    ...overrides,
  })
}

// ── isGraduationReady (spec §9 open condition) ──────────────────────────────
describe("isGraduationReady", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReady(null)).toBe(false)
    expect(isGraduationReady(undefined)).toBe(false)
  })

  it("is false when tasks aren't all 5 done yet, even with the gate true", () => {
    expect(
      isGraduationReady(makeProgress({ task5_debrief_done: true, task_5_done_at: null })),
    ).toBe(false)
  })

  it("★ is false when 5/5 but task5_debrief_done is missing — the ONE gate of Cấp 0", () => {
    expect(isGraduationReady(readyProgress({ task5_debrief_done: false }))).toBe(false)
  })

  it("★ does NOT require task1_star_clicked — a recorded fact, never a gate (spec v3.0 §9)", () => {
    expect(isGraduationReady(readyProgress({ task1_star_clicked: false }))).toBe(true)
  })

  it("is true once 5/5 + the debrief gate are met", () => {
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
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: true, isLoading: false })
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap1Mutate.mockReset()
    messageInfo.mockReset()
    navigateMock.mockReset()
  })

  it("does not render when the 5/5 + 1-gate condition isn't met", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders the header + 3 khối (verbatim §9 copy) + button once ready (premium graduate)", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()

    // Header
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 0 · NHẬP MÔN")).toBeInTheDocument()
    // ★ Spec v3.0 §9's sub-line is just "5/5 nhiệm vụ" — the "2/2 cổng hành
    // vi" half is gone with the second gate it counted.
    expect(screen.getByText("5/5 nhiệm vụ")).toBeInTheDocument()
    expect(screen.queryByText(/cổng hành vi/)).not.toBeInTheDocument()
    expect(screen.queryByText(/6\/6/)).not.toBeInTheDocument()

    // Khối 1 — Ghi nhận (verbatim spec v3.0 §9)
    expect(
      screen.getByText(/Bạn đã đi trọn Cấp 0 «Nhập môn»/),
    ).toBeInTheDocument()
    expect(screen.getByText("đi trọn một vòng đời lệnh hoàn chỉnh")).toBeInTheDocument()
    expect(
      screen.getByText(/\(mua → nắm giữ → theo dõi → bán → kết sổ\)/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Phần lớn người mua cổ phiếu ngoài kia còn không biết mình đang nắm gì\./),
    ).toBeInTheDocument()

    // Khối 2 — Định vị trung thực (verbatim spec v3.0 §9)
    expect(screen.getByText(/Nói thẳng: bạn đã biết/)).toBeInTheDocument()
    expect(screen.getByText("CÁCH CHƠI")).toBeInTheDocument()
    expect(screen.getByText("CHƠI GIỎI")).toBeInTheDocument()
    expect(
      screen.getByText(/dạy bạn chọn lý do mua có cơ sở cho từng lệnh, từ chính dữ liệu 6 lớp phân tích/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Cấp 2 dạy đặt cắt lỗ\/chốt lời và kỷ luật thực hiện\./),
    ).toBeInTheDocument()

    // Khối 3 — Chuyển chế độ (viền xanh)
    expect(screen.getByText("Từ giờ: chế độ THỰC CHIẾN.")).toBeInTheDocument()
    expect(screen.getByText(/T\+2,5 ngày/)).toBeInTheDocument()

    // Button
    expect(screen.getByText("Vào Cấp 1 «Học việc» →")).toBeInTheDocument()
  })

  // ★ The LAST surviving cắt-lỗ claim in Cấp 0. v2.2's Khối 1 congratulated the
  // user for having "đi trọn 2 vòng lệnh có kế hoạch, tự tay đặt ngưỡng cắt lỗ
  // của mình" — under v3.0 BOTH halves are false: Cấp 0 asks for exactly one
  // round trip and has no cắt lỗ field at all. Congratulating someone for work
  // the product never let them do is the worst place to be wrong.
  it("★ never credits the user with a 2nd vòng lệnh or a cắt lỗ they were never asked to set", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()

    expect(screen.queryByText(/2 vòng lệnh/)).not.toBeInTheDocument()
    expect(screen.queryByText(/tự tay đặt ngưỡng cắt lỗ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/chưa từng làm điều cuối cùng/)).not.toBeInTheDocument()
    // Khối 2's old "lập kế hoạch thật sự" / "'chọn mã nào'" wording is replaced
    // by §9's own — the level teaches choosing a lý do, not writing a plan.
    expect(screen.queryByText(/'chọn mã nào'/)).not.toBeInTheDocument()
  })

  it("renders the 120px glowing badge (spec §12 n=0, fill=1 — \"vừa đúc xong\")", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()
    // Arco's `Modal` renders its content via a portal into `document.body`
    // (outside RTL's `container`), so query the document directly — same
    // reason other Cap0 modal tests use `screen` rather than `container`.
    const svg = document.querySelector(".cap0-grad-badge-wrap svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("width")).toBe("120")
  })

  it('clicking "Vào Cấp 1" (premium graduate) calls useGraduate().mutate, then enters Cấp 1 (Task FE3 — Cấp 1 is live, replaces the old placeholder toast)', () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()
    fireEvent.click(screen.getByText("Vào Cấp 1 «Học việc» →"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(enterCap1Mutate).toHaveBeenCalledTimes(1)
    // No placeholder toast anymore, and no navigation — the page swap into
    // Cap1TradingPage is driven by `DauTruongPage` re-reading the SAME
    // `useCap0Progress` query this mutation just invalidated.
    expect(messageInfo).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (progress refetch)", () => {
    useCap0ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

// ── GraduationModal — free (non-premium) graduate ───────────────────────────
// TWO separate truths, previously conflated into one false claim:
//   • The MODE is premium-gated. A free user's orders stay `san_tap`/T+0
//     forever regardless of `graduated_at` (`VirtualTradingService.place_order`:
//     `mode = "thuc_chien" if is_premium else "san_tap"`), so this screen must
//     NOT promise "chế độ THỰC CHIẾN" to them — see `types.ts#tradingModeFor`.
//   • Cấp 1 the LEVEL is FREE. `backend/app/api/v1/endpoints/cap1.py` states it
//     verbatim ("Cap 1 is FREE: all endpoints use `CurrentUser`... NOT
//     `PremiumUser`") and `DauTruongPage`'s Cấp 1 entry effect is not premium-
//     gated either. Sending a free graduate to `/nang-cap` paywalled a level
//     they already had access to, so they could never proceed.
describe("GraduationModal — free (non-premium) graduate", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    usePremiumStatusMock.mockReset()
    usePremiumStatusMock.mockReturnValue({ isPremium: false, isLoading: false })
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap1Mutate.mockReset()
    messageInfo.mockReset()
    navigateMock.mockReset()
  })

  it("does NOT claim THỰC CHIẾN (the mode really is premium-gated)", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()

    // Khối 1/2 stay verbatim (spec §9) regardless of tier.
    expect(screen.getByText(/Bạn đã đi trọn Cấp 0 «Nhập môn»/)).toBeInTheDocument()
    expect(screen.getByText(/Nói thẳng: bạn đã biết/)).toBeInTheDocument()

    // Khối 3 must NOT contain the "Từ giờ: chế độ THỰC CHIẾN" promise.
    expect(screen.queryByText("Từ giờ: chế độ THỰC CHIẾN.")).not.toBeInTheDocument()
    // It still names Thực chiến as the Premium feature it genuinely is.
    expect(screen.getByText(/dành cho tài khoản Premium/)).toBeInTheDocument()
    // ...and is honest that they stay on sân tập.
    expect(screen.getByText(/SÂN TẬP/)).toBeInTheDocument()
  })

  it("does NOT tell a free graduate that Cấp 1 needs Premium — Cấp 1 shipped FREE", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()

    // The old copy said Thực chiến "và Cấp 1" were both behind Premium, and
    // told the user to upgrade in order to "bước vào Cấp 1". Both are false.
    expect(screen.queryByText(/Nâng cấp để mở khoá/)).not.toBeInTheDocument()
    expect(screen.queryByText(/bước vào Cấp 1/)).not.toBeInTheDocument()
    // Instead Khối 3 says plainly that Cấp 1 is open now.
    expect(screen.getByText(/Cấp 1 «Học việc» mở ngay/)).toBeInTheDocument()
  })

  it("the CTA enters Cấp 1 for a free graduate too — no paywall button", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()
    expect(screen.queryByText("Nâng cấp Premium →")).not.toBeInTheDocument()
    expect(screen.getByText("Vào Cấp 1 «Học việc» →")).toBeInTheDocument()
  })

  it("clicking it records the graduation AND enters Cấp 1, and does NOT navigate to /nang-cap", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()
    fireEvent.click(screen.getByText("Vào Cấp 1 «Học việc» →"))

    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    // The whole point of the fix: a free graduate proceeds into Cấp 1 instead
    // of being bounced to the upgrade page for a level they already have.
    expect(enterCap1Mutate).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
    expect(messageInfo).not.toHaveBeenCalled()
  })

  it("still closes itself once graduated_at comes back (one-way trip, same as premium)", () => {
    useCap0ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

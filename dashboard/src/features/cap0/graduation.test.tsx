import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap0ProgressMock, graduateMutate, enterCap1Mutate, messageInfo, navigateMock } = vi.hoisted(
  () => ({
    useCap0ProgressMock: vi.fn(),
    // Mirror react-query's real `mutate(variables, options)` shape — by
    // default synchronously invoke `onSuccess` (the happy path).
    graduateMutate: vi.fn((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    }),
    enterCap1Mutate: vi.fn(),
    messageInfo: vi.fn(),
    navigateMock: vi.fn(),
  }),
)

// `GraduationModal` only needs `useCap0Progress` + `useGraduate` — mock
// `./hooks` directly (same pattern as `Cap0TradingPage.test.tsx`/
// `debrief.test.tsx`) so no QueryClient/http-client setup is needed here.
vi.mock("./hooks", () => ({
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
  useGraduate: () => ({ mutate: graduateMutate, isPending: false }),
}))

// The CTA also fires the idempotent `POST /cap1/enter` (concrete-file import,
// see `GraduationModal.tsx`'s own comment on why not the `@/features/cap1` barrel).
vi.mock("@/features/cap1/hooks", () => ({
  useEnterCap1: () => ({ mutate: enterCap1Mutate, isPending: false }),
}))

// Spy on `useNavigate` the same way `Cap0TradingPage.test.tsx` does, keeping
// the real `MemoryRouter` so the component still has Router context — the
// tests below assert the modal never navigates (an old version bounced free
// graduates to `/nang-cap`).
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
    virtual_balance_init: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task4_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/** All 4 tasks done + THE behaviour gate — the §9 open condition. */
function readyProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task4_debrief_done: true,
    ...overrides,
  })
}

// ── isGraduationReady (spec §9 open condition) ──────────────────────────────
describe("isGraduationReady", () => {
  it("is false for null/undefined progress", () => {
    expect(isGraduationReady(null)).toBe(false)
    expect(isGraduationReady(undefined)).toBe(false)
  })

  it("is false when tasks aren't all 4 done yet, even with the gate true", () => {
    expect(
      isGraduationReady(makeProgress({ task4_debrief_done: true, task_4_done_at: null })),
    ).toBe(false)
  })

  it("★ is false when 4/4 but task4_debrief_done is missing — the ONE gate of Cấp 0", () => {
    expect(isGraduationReady(readyProgress({ task4_debrief_done: false }))).toBe(false)
  })

  // ★ Mẫu số là 4. Một progress row chỉ có ①②③ (3/4) + cổng hành vi KHÔNG được
  // mở màn tốt nghiệp — nếu nó mở, `Cap0Service.graduate` sẽ 409 sau lưng một
  // modal `closable={false}` và user kẹt vĩnh viễn.
  it("★ is false at 3/4 + gate — the denominator is FOUR, and ④ is the Kết sổ itself", () => {
    expect(
      isGraduationReady(readyProgress({ task_4_done_at: null, task4_debrief_done: true })),
    ).toBe(false)
  })

  it("is true once 4/4 + the debrief gate are met", () => {
    expect(isGraduationReady(readyProgress())).toBe(true)
  })

  it("is false once already graduated — a one-way trip, doesn't re-open", () => {
    expect(isGraduationReady(readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }))).toBe(false)
  })
})

// ── GraduationModal (header + huy hiệu + CTA — 3 khối copy đã bỏ) ───────────
describe("GraduationModal", () => {
  beforeEach(() => {
    useCap0ProgressMock.mockReset()
    graduateMutate.mockReset()
    graduateMutate.mockImplementation((_vars?: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    enterCap1Mutate.mockReset()
    messageInfo.mockReset()
    navigateMock.mockReset()
  })

  it("does not render when the 4/4 + 1-gate condition isn't met", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

  it("renders header + CTA once ready — and NO copy blocks", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()

    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("CẤP 0 · NHẬP MÔN")).toBeInTheDocument()
    // ★ Mẫu số phải theo `TOTAL_TASKS`: 4 kể từ khi Chặng 2 bị bỏ.
    expect(screen.getByText("4/4 nhiệm vụ")).toBeInTheDocument()
    expect(screen.queryByText("5/5 nhiệm vụ")).not.toBeInTheDocument()

    // ★ Ba khối copy §9 (Ghi nhận / Định vị / Chuyển chế độ) đã bỏ theo yêu
    // cầu điều chỉnh — không còn khối nào, kể cả nhánh premium/free.
    expect(document.querySelector(".cap0-grad-block")).toBeNull()
    expect(screen.queryByText(/Bạn đã đi trọn Cấp 0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Nói thẳng/)).not.toBeInTheDocument()
    expect(screen.queryByText(/THỰC CHIẾN/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Premium/)).not.toBeInTheDocument()

    // Button — chữ mới theo yêu cầu điều chỉnh.
    expect(screen.getByText("Vào cấp 1: Học việc")).toBeInTheDocument()
    expect(screen.queryByText("Vào Cấp 1 «Học việc» →")).not.toBeInTheDocument()
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

  it("clicking the CTA records the graduation, enters Cấp 1, and does NOT navigate or toast", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()
    fireEvent.click(screen.getByText("Vào cấp 1: Học việc"))
    expect(graduateMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    // Cấp 1 is FREE — every graduate proceeds into it; the page swap into
    // `Cap1TradingPage` is driven by `DauTruongPage` re-reading the SAME
    // `useCap0Progress` query this mutation just invalidated.
    expect(enterCap1Mutate).toHaveBeenCalledTimes(1)
    expect(messageInfo).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("closes itself once graduated_at comes back (one-way trip)", () => {
    useCap0ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

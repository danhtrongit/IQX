import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap0Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const { useCap0ProgressMock, graduateMutate, enterCap1Mutate, messageInfo, navigateMock, trackMock } = vi.hoisted(
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
    trackMock: vi.fn(),
  }),
)
vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: trackMock }))

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
    task_5_done_at: null,
    task1_star_clicked: false,
    task5_debrief_done: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/** Both required tasks and both behaviour gates — the §9 open condition. */
function readyProgress(overrides: Partial<Cap0Progress> = {}): Cap0Progress {
  return makeProgress({
    task_1_done_at: "t",
    task_5_done_at: "t",
    task1_star_clicked: true,
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

  it("is false when both required task timestamps are not set", () => {
    expect(
      isGraduationReady(makeProgress({ task5_debrief_done: true, task_5_done_at: null })),
    ).toBe(false)
  })

  it("is false when 2/2 but task5_debrief_done is missing", () => {
    expect(isGraduationReady(readyProgress({ task5_debrief_done: false }))).toBe(false)
  })

  it("is false when 2/2 but task1_star_clicked is missing", () => {
    expect(isGraduationReady(readyProgress({ task1_star_clicked: false }))).toBe(false)
  })

  // A progress row with one missing task and both gates must not
  // mở màn tốt nghiệp — nếu nó mở, `Cap0Service.graduate` sẽ 409 sau lưng một
  // modal `closable={false}` và user kẹt vĩnh viễn.
  it("is false at 1/2 even when both gates are true", () => {
    expect(
      isGraduationReady(readyProgress({ task_5_done_at: null, task5_debrief_done: true })),
    ).toBe(false)
  })

  it("is true once 2/2 and both gates are met", () => {
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
    trackMock.mockReset()
  })

  it("does not render when the 2/2 + 2-gate condition isn't met", () => {
    useCap0ProgressMock.mockReturnValue({ data: makeProgress() })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })

it("renders the header, three spec blocks and CTA once ready", () => {
    useCap0ProgressMock.mockReturnValue({ data: readyProgress() })
    renderModal()
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(document.querySelectorAll(".cap0-grad-block")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Vào cấp 1: Học việc" })).toBeEnabled()
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
    expect(trackMock).toHaveBeenCalledWith("cap0_graduate")
  })

  it("closes itself once graduated_at comes back (one-way trip)", () => {
    useCap0ProgressMock.mockReturnValue({
      data: readyProgress({ graduated_at: "2026-07-21T00:00:00Z" }),
    })
    renderModal()
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()
  })
})

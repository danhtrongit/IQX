import { render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap1Progress } from "./types"

const {
  useAuthMock,
  useCap0ProgressMock,
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap4ProgressMock,
  useCap5ProgressMock,
  useCap6ProgressMock,
  useCap7ProgressMock,
  useCap8ProgressMock,
  enterCap1Mutate,
  enterCap2Mutate,
  enterCap3Mutate,
  enterCap4Mutate,
  enterCap5Mutate,
  enterCap6Mutate,
  enterCap7Mutate,
  enterCap8Mutate,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useCap0ProgressMock: vi.fn(),
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useCap3ProgressMock: vi.fn(),
  useCap4ProgressMock: vi.fn(),
  useCap5ProgressMock: vi.fn(),
  useCap6ProgressMock: vi.fn(),
  useCap7ProgressMock: vi.fn(),
  useCap8ProgressMock: vi.fn(),
  enterCap1Mutate: vi.fn(),
  enterCap2Mutate: vi.fn(),
  enterCap3Mutate: vi.fn(),
  enterCap4Mutate: vi.fn(),
  enterCap5Mutate: vi.fn(),
  enterCap6Mutate: vi.fn(),
  enterCap7Mutate: vi.fn(),
  enterCap8Mutate: vi.fn(),
}))

vi.mock("@/features/auth", () => ({ useAuth: () => useAuthMock() }))

vi.mock("@/features/cap0", () => ({
  Cap0TradingPage: () => <div data-testid="cap0-page" />,
  useCap0Progress: (...a: unknown[]) => useCap0ProgressMock(...a),
}))

vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useEnterCap1: () => ({ mutate: enterCap1Mutate, isPending: false }),
}))

vi.mock("./Cap1TradingPage", () => ({
  Cap1TradingPage: () => <div data-testid="cap1-page" />,
}))

// Cấp 2 is live (Task FE4) — concrete-file import (NOT the `@/features/cap2`
// barrel, same anti-cycle rationale documented elsewhere in this delivery).
vi.mock("@/features/cap2/hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useEnterCap2: () => ({ mutate: enterCap2Mutate, isPending: false }),
}))

vi.mock("@/features/cap2/Cap2TradingPage", () => ({
  Cap2TradingPage: () => <div data-testid="cap2-page" />,
}))

// Cấp 3 is live (Task FE3) — concrete-file imports, same anti-cycle rationale.
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useEnterCap3: () => ({ mutate: enterCap3Mutate, isPending: false }),
}))

vi.mock("@/features/cap3/Cap3TradingPage", () => ({
  Cap3TradingPage: () => <div data-testid="cap3-page" />,
}))

// Cấp 4 is live (Cấp 4 Task FE3) — concrete-file imports, same anti-cycle rationale.
vi.mock("@/features/cap4/hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
  useEnterCap4: () => ({ mutate: enterCap4Mutate, isPending: false }),
}))

vi.mock("@/features/cap4/Cap4TradingPage", () => ({
  Cap4TradingPage: () => <div data-testid="cap4-page" />,
}))

// Cấp 5 is live (Cấp 5 Task FE3) — concrete-file imports, same anti-cycle rationale.
vi.mock("@/features/cap5/hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
  useEnterCap5: () => ({ mutate: enterCap5Mutate, isPending: false }),
}))

vi.mock("@/features/cap5/Cap5TradingPage", () => ({
  Cap5TradingPage: () => <div data-testid="cap5-page" />,
}))

// Cấp 6 is live (Cấp 6 Task FE3) — concrete-file imports, same anti-cycle rationale.
vi.mock("@/features/cap6/hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
  useEnterCap6: () => ({ mutate: enterCap6Mutate, isPending: false }),
}))

vi.mock("@/features/cap6/Cap6TradingPage", () => ({
  Cap6TradingPage: () => <div data-testid="cap6-page" />,
}))

// Cấp 7 is live (Cấp 7 Task FE3) — concrete-file imports, same anti-cycle rationale.
vi.mock("@/features/cap7/hooks", () => ({
  useCap7Progress: (...a: unknown[]) => useCap7ProgressMock(...a),
  useEnterCap7: () => ({ mutate: enterCap7Mutate, isPending: false }),
}))

vi.mock("@/features/cap7/Cap7TradingPage", () => ({
  Cap7TradingPage: () => <div data-testid="cap7-page" />,
}))

// Cấp 8 is live (Cấp 8 Task FE3) — concrete-file imports, same anti-cycle
// rationale. ★ This is the LAST level: there is no Cấp 9 page to route on to.
vi.mock("@/features/cap8/hooks", () => ({
  useCap8Progress: (...a: unknown[]) => useCap8ProgressMock(...a),
  useEnterCap8: () => ({ mutate: enterCap8Mutate, isPending: false }),
}))

vi.mock("@/features/cap8/Cap8TradingPage", () => ({
  Cap8TradingPage: () => <div data-testid="cap8-page" />,
}))

import { CAP_2_PLUS_ENABLED, DauTruongPage } from "./DauTruongPage"

function fakeCap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
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
    task_6_done_at: null,
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
    so_lan_xem_danh_muc: 0,
    so_lenh_thuc_chien: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeCap2Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-07-26T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    chuoi_current: 0,
    chuoi_record: 0,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeCap3Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-07-29T00:00:00Z",
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

function fakeCap4Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p4",
    user_id: "u1",
    entered_at: "2026-07-31T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 0,
    vu_khi_lop: null,
    diem_mu_lop: null,
    ty_le_thang_dong_thuan_cao: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeCap5Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p5",
    user_id: "u1",
    entered_at: "2026-08-21T00:00:00Z",
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

function fakeCap6Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p6",
    user_id: "u1",
    entered_at: "2026-09-11T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doi_chieu: 0,
    so_kieu_da_gap: 0,
    ty_le_thang_khop: 0,
    ty_le_thang_lech: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeCap7Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p7",
    user_id: "u1",
    entered_at: "2026-10-02T00:00:00Z",
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

function fakeCap8Progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "p8",
    user_id: "u1",
    entered_at: "2026-11-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_kiem_tra: 0,
    so_lan_mua_bat_chap_canh_bao: 0,
    // ★ `null` = chưa tính được, KHÔNG phải 0 — xem `cap8/types.ts`.
    don_nganh_max_pct: null,
    tong_rui_ro_pct: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    so_lan_co_canh_bao: 0,
    bat_chap_gan_day: 0,
    cua_so_gan_day: 15,
    so_lenh_da_ket_so: 0,
    ...overrides,
  }
}

/**
 * Every level ABOVE Cấp 1 — the `useCapNProgress` query hook and the
 * `enterCapN` mutation for N = 2…8. The temporary switch must silence ALL of
 * them, so the assertions below loop over this table instead of naming eight
 * levels by hand (a new level added to `DauTruongPage` only has to be added
 * here once).
 */
const CAP_2_PLUS_QUERIES = () => [
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap4ProgressMock,
  useCap5ProgressMock,
  useCap6ProgressMock,
  useCap7ProgressMock,
  useCap8ProgressMock,
]

const CAP_2_PLUS_ENTERS = () => [
  enterCap2Mutate,
  enterCap3Mutate,
  enterCap4Mutate,
  enterCap5Mutate,
  enterCap6Mutate,
  enterCap7Mutate,
  enterCap8Mutate,
]

describe("DauTruongPage — progression routing (Task FE3 + FE4 + Cấp 3/4/5/6/7/8 FE3)", () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    useCap0ProgressMock.mockReset()
    useCap1ProgressMock.mockReset()
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap4ProgressMock.mockReset()
    useCap4ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap5ProgressMock.mockReset()
    useCap5ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap6ProgressMock.mockReset()
    useCap6ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap7ProgressMock.mockReset()
    useCap7ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap8ProgressMock.mockReset()
    useCap8ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    enterCap8Mutate.mockReset()
    enterCap7Mutate.mockReset()
    enterCap1Mutate.mockReset()
    enterCap2Mutate.mockReset()
    enterCap3Mutate.mockReset()
    enterCap4Mutate.mockReset()
    enterCap5Mutate.mockReset()
    enterCap6Mutate.mockReset()
  })

  it("shows a spinner while auth is still loading", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
  })

  it("renders Cap0TradingPage when not authenticated (guest — zero behaviour change)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap0-page")).toBeInTheDocument()
  })

  it("shows a spinner while Cấp 0 progress is still loading (authenticated)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
  })

  it("renders Cap0TradingPage when Cấp 0 is not graduated yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: { graduated_at: null }, isFetched: true })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap0-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
    expect(enterCap1Mutate).not.toHaveBeenCalled()
  })

  it("shows a spinner once Cấp 0 is graduated but Cấp 1 progress hasn't resolved yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
  })

  it("renders Cap1TradingPage + calls POST /cap1/enter once when Cấp 0 is graduated and Cấp 1 hasn't been entered yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    expect(enterCap1Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap1TradingPage WITHOUT re-entering when Cấp 1 progress already exists (not graduated)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(enterCap1Mutate).not.toHaveBeenCalled()
  })

  // ── ★★ CÔNG TẮC TẠM TẮT CẤP 2-8 (`CAP_2_PLUS_ENABLED`) ★★ ─────────────────
  // Sản phẩm tạm chỉ mở Cấp 0 + Cấp 1. Code Cấp 2-8 VẪN CÒN NGUYÊN, chỉ bị một
  // công tắc duy nhất trong `DauTruongPage.tsx` chặn lại. Các test dưới đây
  // canh chính cái công tắc đó: routing DỪNG ở `Cap1TradingPage`, và KHÔNG một
  // request `/cap2..8/*` nào được bắn ra ở BẤT KỲ trạng thái nào.
  function cap1GraduatedMocks() {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("★ keeps a cap1-GRADUATED user on Cap1TradingPage (never Cấp 2) while Cấp 2-8 are off", () => {
    cap1GraduatedMocks()
    useCap2ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap2-page")).not.toBeInTheDocument()
  })

  it("★ fires NO /cap2..8 request at all for a cap1-graduated user (no enter, no progress query)", () => {
    cap1GraduatedMocks()
    render(<DauTruongPage />)
    for (const useProgress of CAP_2_PLUS_QUERIES()) {
      expect(useProgress).toHaveBeenCalled()
      for (const call of useProgress.mock.calls) expect(call[0]).toBe(false)
    }
    for (const enterMutate of CAP_2_PLUS_ENTERS()) {
      expect(enterMutate).not.toHaveBeenCalled()
    }
  })

  it("★ fires NO /cap2..8 request in ANY auth/progress state", () => {
    const states: Array<() => void> = [
      // guest
      () => {
        useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false })
        useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
        useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
      },
      // auth still loading
      () => {
        useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true })
        useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
        useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
      },
      // Cấp 0 chưa tốt nghiệp
      () => {
        useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
        useCap0ProgressMock.mockReturnValue({ data: { graduated_at: null }, isFetched: true })
        useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
      },
      // Cấp 1 đang học
      () => {
        useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
        useCap0ProgressMock.mockReturnValue({
          data: { graduated_at: "2026-07-21T00:00:00Z" },
          isFetched: true,
        })
        useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress(), isFetched: true })
      },
      // Cấp 1 đã tốt nghiệp
      cap1GraduatedMocks,
    ]

    for (const setState of states) {
      for (const useProgress of CAP_2_PLUS_QUERIES()) useProgress.mockClear()
      for (const enterMutate of CAP_2_PLUS_ENTERS()) enterMutate.mockClear()
      setState()
      const { unmount } = render(<DauTruongPage />)
      for (const useProgress of CAP_2_PLUS_QUERIES()) {
        for (const call of useProgress.mock.calls) expect(call[0]).toBe(false)
      }
      for (const enterMutate of CAP_2_PLUS_ENTERS()) {
        expect(enterMutate).not.toHaveBeenCalled()
      }
      unmount()
    }
  })

  it("★ defensive: even with Cấp 2-8 progress rows ALREADY graduated, the user still lands on Cap1TradingPage", () => {
    cap1GraduatedMocks()
    useCap2ProgressMock.mockReturnValue({
      data: fakeCap2Progress({ graduated_at: "2026-07-28T00:00:00Z" }),
      isFetched: true,
    })
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ graduated_at: "2026-07-30T00:00:00Z" }),
      isFetched: true,
    })
    useCap4ProgressMock.mockReturnValue({
      data: fakeCap4Progress({ graduated_at: "2026-08-20T00:00:00Z" }),
      isFetched: true,
    })
    useCap5ProgressMock.mockReturnValue({
      data: fakeCap5Progress({ graduated_at: "2026-09-10T00:00:00Z" }),
      isFetched: true,
    })
    useCap6ProgressMock.mockReturnValue({
      data: fakeCap6Progress({ graduated_at: "2026-10-01T00:00:00Z" }),
      isFetched: true,
    })
    useCap7ProgressMock.mockReturnValue({
      data: fakeCap7Progress({ graduated_at: "2026-11-01T00:00:00Z" }),
      isFetched: true,
    })
    useCap8ProgressMock.mockReturnValue({
      data: fakeCap8Progress({ graduated_at: "2026-12-01T00:00:00Z" }),
      isFetched: true,
    })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    for (const id of ["cap2", "cap3", "cap4", "cap5", "cap6", "cap7", "cap8"]) {
      expect(screen.queryByTestId(`${id}-page`)).not.toBeInTheDocument()
    }
  })

  // ★★ Toàn bộ chuỗi Cấp 2 → Cấp 8 bên dưới là hành vi ĐÚNG khi công tắc bật
  // lại. Giữ nguyên, KHÔNG xoá: `describe.runIf` tự động cho chúng chạy trở lại
  // ngay khi `CAP_2_PLUS_ENABLED` đổi thành `true` — đó chính là bước "bật lại
  // Cấp 2-8" và test đã sẵn sàng canh nó.
  describe.runIf(CAP_2_PLUS_ENABLED)("chuỗi Cấp 2 → Cấp 8 (chỉ chạy khi CAP_2_PLUS_ENABLED)", () => {
  it("shows a spinner once Cấp 1 is graduated but Cấp 2 progress hasn't resolved yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    useCap2ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-page")).not.toBeInTheDocument()
  })

  it("renders Cap2TradingPage + calls POST /cap2/enter once when Cấp 1 is graduated and Cấp 2 hasn't been entered yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    useCap2ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap2-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap1-page")).not.toBeInTheDocument()
    expect(enterCap2Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap2TradingPage WITHOUT re-entering when Cấp 2 progress already exists (not graduated)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap2-page")).toBeInTheDocument()
    expect(enterCap2Mutate).not.toHaveBeenCalled()
  })

  it("does not query Cấp 2 progress (nor enter it) while Cấp 1 hasn't graduated yet", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: { graduated_at: "2026-07-21T00:00:00Z" }, isFetched: true })
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap1-page")).toBeInTheDocument()
    expect(enterCap2Mutate).not.toHaveBeenCalled()
  })

  // ── Cấp 2 → Cấp 3 (this delivery) ─────────────────────────────────────────
  function cap2GraduatedMocks() {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    useCap2ProgressMock.mockReturnValue({
      data: fakeCap2Progress({ graduated_at: "2026-07-28T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("shows a spinner once Cấp 2 is graduated but Cấp 3 progress hasn't resolved yet", () => {
    cap2GraduatedMocks()
    useCap3ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap2-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap3-page")).not.toBeInTheDocument()
  })

  it("renders Cap3TradingPage + calls POST /cap3/enter once when Cấp 2 is graduated and Cấp 3 hasn't been entered yet", () => {
    cap2GraduatedMocks()
    useCap3ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap3-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap2-page")).not.toBeInTheDocument()
    expect(enterCap3Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap3TradingPage WITHOUT re-entering when Cấp 3 progress already exists", () => {
    cap2GraduatedMocks()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap3-page")).toBeInTheDocument()
    expect(enterCap3Mutate).not.toHaveBeenCalled()
  })

  it("does not query Cấp 4 progress (nor enter it) while Cấp 3 hasn't graduated yet", () => {
    cap2GraduatedMocks()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap3-page")).toBeInTheDocument()
    expect(useCap4ProgressMock).toHaveBeenCalledWith(false)
    expect(enterCap4Mutate).not.toHaveBeenCalled()
  })

  // ── Cấp 3 → Cấp 4 (this delivery) ─────────────────────────────────────────
  function cap3GraduatedMocks() {
    cap2GraduatedMocks()
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ graduated_at: "2026-07-30T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("shows a spinner once Cấp 3 is graduated but Cấp 4 progress hasn't resolved yet", () => {
    cap3GraduatedMocks()
    useCap4ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap3-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap4-page")).not.toBeInTheDocument()
  })

  it("renders Cap4TradingPage + calls POST /cap4/enter once when Cấp 3 is graduated and Cấp 4 hasn't been entered yet", () => {
    cap3GraduatedMocks()
    useCap4ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap4-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap3-page")).not.toBeInTheDocument()
    expect(enterCap4Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap4TradingPage WITHOUT re-entering when Cấp 4 progress already exists", () => {
    cap3GraduatedMocks()
    useCap4ProgressMock.mockReturnValue({ data: fakeCap4Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap4-page")).toBeInTheDocument()
    expect(enterCap4Mutate).not.toHaveBeenCalled()
  })

  it("does not query Cấp 5 progress (nor enter it) while Cấp 4 hasn't graduated yet", () => {
    cap3GraduatedMocks()
    useCap4ProgressMock.mockReturnValue({ data: fakeCap4Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap4-page")).toBeInTheDocument()
    expect(useCap5ProgressMock).toHaveBeenCalledWith(false)
    expect(enterCap5Mutate).not.toHaveBeenCalled()
  })

  // ── Cấp 4 → Cấp 5 (this delivery) ─────────────────────────────────────────
  function cap4GraduatedMocks() {
    cap3GraduatedMocks()
    useCap4ProgressMock.mockReturnValue({
      data: fakeCap4Progress({ graduated_at: "2026-08-20T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("shows a spinner once Cấp 4 is graduated but Cấp 5 progress hasn't resolved yet", () => {
    cap4GraduatedMocks()
    useCap5ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap4-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-page")).not.toBeInTheDocument()
  })

  it("renders Cap5TradingPage + calls POST /cap5/enter once when Cấp 4 is graduated and Cấp 5 hasn't been entered yet", () => {
    cap4GraduatedMocks()
    useCap5ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap5-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap4-page")).not.toBeInTheDocument()
    expect(enterCap5Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap5TradingPage WITHOUT re-entering when Cấp 5 progress already exists", () => {
    cap4GraduatedMocks()
    useCap5ProgressMock.mockReturnValue({ data: fakeCap5Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap5-page")).toBeInTheDocument()
    expect(enterCap5Mutate).not.toHaveBeenCalled()
  })

  it("does not query Cấp 6 progress (nor enter it) while Cấp 5 hasn't graduated yet", () => {
    cap4GraduatedMocks()
    useCap5ProgressMock.mockReturnValue({ data: fakeCap5Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap5-page")).toBeInTheDocument()
    expect(useCap6ProgressMock).toHaveBeenCalledWith(false)
    expect(enterCap6Mutate).not.toHaveBeenCalled()
  })

  // ── Cấp 5 → Cấp 6 (this delivery) ─────────────────────────────────────────
  function cap5GraduatedMocks() {
    cap4GraduatedMocks()
    useCap5ProgressMock.mockReturnValue({
      data: fakeCap5Progress({ graduated_at: "2026-09-10T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("shows a spinner once Cấp 5 is graduated but Cấp 6 progress hasn't resolved yet", () => {
    cap5GraduatedMocks()
    useCap6ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap5-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-page")).not.toBeInTheDocument()
  })

  it("renders Cap6TradingPage + calls POST /cap6/enter once when Cấp 5 is graduated and Cấp 6 hasn't been entered yet", () => {
    cap5GraduatedMocks()
    useCap6ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap6-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-page")).not.toBeInTheDocument()
    expect(enterCap6Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap6TradingPage WITHOUT re-entering when Cấp 6 progress already exists", () => {
    cap5GraduatedMocks()
    useCap6ProgressMock.mockReturnValue({ data: fakeCap6Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap6-page")).toBeInTheDocument()
    expect(enterCap6Mutate).not.toHaveBeenCalled()
  })

  it("does not query Cấp 7 progress (nor enter it) while Cấp 6 hasn't graduated yet", () => {
    cap5GraduatedMocks()
    useCap6ProgressMock.mockReturnValue({ data: fakeCap6Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap6-page")).toBeInTheDocument()
    expect(useCap7ProgressMock).toHaveBeenCalledWith(false)
    expect(enterCap7Mutate).not.toHaveBeenCalled()
  })

  // ── Cấp 6 → Cấp 7 (this delivery) ─────────────────────────────────────────
  function cap6GraduatedMocks() {
    cap5GraduatedMocks()
    useCap6ProgressMock.mockReturnValue({
      data: fakeCap6Progress({ graduated_at: "2026-10-01T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("shows a spinner once Cấp 6 is graduated but Cấp 7 progress hasn't resolved yet", () => {
    cap6GraduatedMocks()
    useCap7ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap6-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap7-page")).not.toBeInTheDocument()
  })

  it("renders Cap7TradingPage + calls POST /cap7/enter once when Cấp 6 is graduated and Cấp 7 hasn't been entered yet", () => {
    cap6GraduatedMocks()
    useCap7ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap7-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-page")).not.toBeInTheDocument()
    expect(enterCap7Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap7TradingPage WITHOUT re-entering when Cấp 7 progress already exists", () => {
    cap6GraduatedMocks()
    useCap7ProgressMock.mockReturnValue({ data: fakeCap7Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap7-page")).toBeInTheDocument()
    expect(enterCap7Mutate).not.toHaveBeenCalled()
  })

  it("does not query Cấp 8 progress (nor enter it) while Cấp 7 hasn't graduated yet", () => {
    cap6GraduatedMocks()
    useCap7ProgressMock.mockReturnValue({ data: fakeCap7Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap7-page")).toBeInTheDocument()
    expect(useCap8ProgressMock).toHaveBeenCalledWith(false)
    expect(enterCap8Mutate).not.toHaveBeenCalled()
  })

  // ── Cấp 7 → Cấp 8 (this delivery — the LAST level of the program) ─────────
  function cap7GraduatedMocks() {
    cap6GraduatedMocks()
    useCap7ProgressMock.mockReturnValue({
      data: fakeCap7Progress({ graduated_at: "2026-11-01T00:00:00Z" }),
      isFetched: true,
    })
  }

  it("shows a spinner once Cấp 7 is graduated but Cấp 8 progress hasn't resolved yet", () => {
    cap7GraduatedMocks()
    useCap8ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.queryByTestId("cap7-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap8-page")).not.toBeInTheDocument()
  })

  it("renders Cap8TradingPage + calls POST /cap8/enter once when Cấp 7 is graduated and Cấp 8 hasn't been entered yet", () => {
    cap7GraduatedMocks()
    useCap8ProgressMock.mockReturnValue({ data: null, isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap8-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap7-page")).not.toBeInTheDocument()
    expect(enterCap8Mutate).toHaveBeenCalledTimes(1)
  })

  it("renders Cap8TradingPage WITHOUT re-entering when Cấp 8 progress already exists", () => {
    cap7GraduatedMocks()
    useCap8ProgressMock.mockReturnValue({ data: fakeCap8Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap8-page")).toBeInTheDocument()
    expect(enterCap8Mutate).not.toHaveBeenCalled()
  })

  // ★★ TERMINAL BRANCH. Cấp 8 is the last level of the program — a user who has
  // already graduated it still lands on `Cap8TradingPage`, because there is no
  // Cấp 9 page to send them to. Falling back to a lower cấp's shell (or a
  // spinner) here would demote a graduate of the whole 0-8 arc.
  it("★ still renders Cap8TradingPage when Cấp 8 is ALREADY graduated (no Cấp 9 exists)", () => {
    cap7GraduatedMocks()
    useCap8ProgressMock.mockReturnValue({
      data: fakeCap8Progress({ graduated_at: "2026-12-01T00:00:00Z" }),
      isFetched: true,
    })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap8-page")).toBeInTheDocument()
    expect(screen.queryByTestId("cap7-page")).not.toBeInTheDocument()
    expect(enterCap8Mutate).not.toHaveBeenCalled()
  })

  it("keeps rendering Cap2TradingPage (and never enters Cấp 3) while Cấp 2 hasn't graduated", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    useCap0ProgressMock.mockReturnValue({
      data: { graduated_at: "2026-07-21T00:00:00Z" },
      isFetched: true,
    })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress(), isFetched: true })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap2-page")).toBeInTheDocument()
    expect(enterCap3Mutate).not.toHaveBeenCalled()
  })
  })
})

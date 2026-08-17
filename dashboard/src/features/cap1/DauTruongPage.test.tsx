import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap1Progress } from "./types"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"

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

import { CAP_MAX_ENABLED, DauTruongPage } from "./DauTruongPage"

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
    so_ly_do_da_dung: 0,
    so_lenh_ly_do_ung_ho: 0,
    so_lenh_thuc_chien: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/**
 * ★★ FIXTURE PHẢI GÕ ĐÚNG KIỂU WIRE, VÀ PHẢI CÓ THỨ THẬT SỰ CHECK NÓ.
 *
 * Bản trước gõ `Record<string, unknown>` và lệch kép so với wire (còn
 * `task_3/4_done_at` + 3 cột `chuoi_*` đã bị DROP, thiếu cả 4 counter của mô
 * hình 2 nhiệm vụ) mà KHÔNG gì đỏ lên. Một bản sau đó gõ kiểu thật nhưng dán
 * kèm lời hứa "vitest bắt ngay lần lệch sau" — sai: `tsconfig.app.json`
 * exclude `*.test.tsx`, và vitest transpile bằng esbuild không hề check kiểu.
 *
 * Nay lời hứa đó có thật: `tsconfig.test.json` (được `tsc -b` chạy qua
 * `tsconfig.json#references`) typecheck toàn bộ file test.
 *
 * ★ `base` được KHAI BÁO KIỂU RỜI, không phải `return { ...fields, ...overrides }`:
 * spread trong object literal TẮT excess-property check của TypeScript, nên
 * một trường ĐÃ BỊ BỎ khỏi wire (đúng ca `chuoi_current`) vẫn lọt. Gán vào một
 * biến có kiểu tường minh là chỗ duy nhất bắt được nó.
 */
function fakeCap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  const base: Cap2Progress = {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-07-26T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
  }
  return { ...base, ...overrides }
}

/** Xem `fakeCap2Progress` — cùng lý do gõ kiểu thật + `base` khai báo rời. */
function fakeCap3Progress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  const base: Cap3Progress = {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-07-29T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 250_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    // ★ `null` = chưa biết, KHÔNG phải 0 — xem `cap3/types.ts`.
    diem_ky_luat_tb_cap3: null,
    graduated_at: null,
    time_to_graduate_hours: null,
  }
  return { ...base, ...overrides }
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
 * Mỗi cấp trên Cấp 1 → hook `useCapNProgress` + mutation `enterCapN` của nó
 * (N = 2…8). Một cấp mới chỉ phải khai báo ở đây đúng một lần.
 */
const PROGRESS_MOCK_BY_LEVEL: Record<number, ReturnType<typeof vi.fn>> = {
  2: useCap2ProgressMock,
  3: useCap3ProgressMock,
  4: useCap4ProgressMock,
  5: useCap5ProgressMock,
  6: useCap6ProgressMock,
  7: useCap7ProgressMock,
  8: useCap8ProgressMock,
}

const ENTER_MOCK_BY_LEVEL: Record<number, ReturnType<typeof vi.fn>> = {
  2: enterCap2Mutate,
  3: enterCap3Mutate,
  4: enterCap4Mutate,
  5: enterCap5Mutate,
  6: enterCap6Mutate,
  7: enterCap7Mutate,
  8: enterCap8Mutate,
}

/**
 * ★ Mọi cấp NẰM TRÊN trần — tập phải im lặng tuyệt đối (không progress query,
 * không enter). Suy ra TỪ `CAP_MAX_ENABLED` chứ không liệt kê tay, nên nâng
 * trần là tập này tự co lại và các test dưới đây tự canh đúng cấp mới.
 */
const ABOVE_CEILING_LEVELS = () =>
  [2, 3, 4, 5, 6, 7, 8].filter((n) => n > CAP_MAX_ENABLED)

const ABOVE_CEILING_QUERIES = () => ABOVE_CEILING_LEVELS().map((n) => PROGRESS_MOCK_BY_LEVEL[n])
const ABOVE_CEILING_ENTERS = () => ABOVE_CEILING_LEVELS().map((n) => ENTER_MOCK_BY_LEVEL[n])

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

  /**
   * ★★ HẾT PHIÊN GIỮA CHỪNG — không được lặng lẽ tụt về shell Cấp 0.
   *
   * `shared/http/client.ts` xoá token và bắn `auth:logout` khi refresh hỏng;
   * handler trong `auth-context.tsx` chỉ `setUser(null)` — không modal, không
   * thông báo. Với `if (!isAuthenticated) return <Cap0TradingPage />`, người
   * đang ở Cấp 3 thấy màn hình đổi ngay sang badge «CẤP 0 · NHẬP MÔN», thanh
   * hành trình về 0/4, panel Đặt lệnh thành Sân tập — và tin rằng mình vừa bị
   * xoá sạch tiến trình 3 cấp (server vẫn giữ nguyên), không có gì chỉ họ cách
   * đăng nhập lại.
   */
  it("★★ phiên hết hạn giữa chừng → màn báo hết phiên + lối đăng nhập lại, KHÔNG tụt về Cấp 0", () => {
    const setShowAuthModal = vi.fn()
    const setAuthModalTab = vi.fn()
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      setShowAuthModal,
      setAuthModalTab,
    })
    useCap0ProgressMock.mockReturnValue({ data: { graduated_at: "2026-07-20T00:00:00Z" }, isFetched: true })
    useCap1ProgressMock.mockReturnValue({
      data: fakeCap1Progress({ graduated_at: "2026-07-25T00:00:00Z" }),
      isFetched: true,
    })
    const { rerender } = render(<DauTruongPage />)
    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()

    // Token hết hạn: `auth:logout` → `isAuthenticated` thành false.
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      setShowAuthModal,
      setAuthModalTab,
    })
    rerender(<DauTruongPage />)

    expect(screen.queryByTestId("cap0-page")).not.toBeInTheDocument()
    const box = screen.getByTestId("dau-truong-session-expired")
    expect(box).toHaveTextContent(/Phiên đăng nhập đã hết hạn/)
    // Phải nói rõ tiến trình KHÔNG mất.
    expect(box).toHaveTextContent(/vẫn được giữ nguyên/)

    fireEvent.click(screen.getByText("Đăng nhập lại"))
    expect(setAuthModalTab).toHaveBeenCalledWith("login")
    expect(setShowAuthModal).toHaveBeenCalledWith(true)
  })

  it("khách chưa từng đăng nhập vẫn thấy Cấp 0 (không phải màn hết phiên)", () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false })
    useCap0ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    useCap1ProgressMock.mockReturnValue({ data: undefined, isFetched: false })
    render(<DauTruongPage />)
    expect(screen.getByTestId("cap0-page")).toBeInTheDocument()
    expect(screen.queryByTestId("dau-truong-session-expired")).not.toBeInTheDocument()
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

  // ── ★★ TRẦN CẤP (`CAP_MAX_ENABLED`) ★★ ────────────────────────────────────
  // Code Cấp 2-8 CÒN NGUYÊN; một con số duy nhất trong `capFlags.ts` quyết định
  // chương trình mở tới đâu. Các test dưới đây canh chính cái trần đó, và chúng
  // suy ra "cấp nào phải im lặng" TỪ `CAP_MAX_ENABLED` — nâng trần là chúng tự
  // canh đúng cấp mới, không phải sửa dòng nào.
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

  it("★ every level ABOVE the trần stays silent for a cap1-graduated user (no enter, no progress query)", () => {
    cap1GraduatedMocks()
    render(<DauTruongPage />)
    for (const useProgress of ABOVE_CEILING_QUERIES()) {
      expect(useProgress).toHaveBeenCalled()
      for (const call of useProgress.mock.calls) expect(call[0]).toBe(false)
    }
    for (const enterMutate of ABOVE_CEILING_ENTERS()) {
      expect(enterMutate).not.toHaveBeenCalled()
    }
  })

  it("★ every level ABOVE the trần stays silent in ANY auth/progress state", () => {
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
      for (const useProgress of ABOVE_CEILING_QUERIES()) useProgress.mockClear()
      for (const enterMutate of ABOVE_CEILING_ENTERS()) enterMutate.mockClear()
      setState()
      const { unmount } = render(<DauTruongPage />)
      for (const useProgress of ABOVE_CEILING_QUERIES()) {
        for (const call of useProgress.mock.calls) expect(call[0]).toBe(false)
      }
      for (const enterMutate of ABOVE_CEILING_ENTERS()) {
        expect(enterMutate).not.toHaveBeenCalled()
      }
      unmount()
    }
  })

  /** Mọi cấp 2-8 đều đã có hàng progress `graduated_at` — trạng thái xấu nhất
   *  cho một cái trần: nếu routing chỉ nhìn `graduated_at` thì user bay thẳng
   *  lên Cấp 8. */
  function allLevelsGraduatedMocks() {
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
  }

  it("★ defensive: even with EVERY cấp 2-8 already graduated, the user never goes past the trần", () => {
    allLevelsGraduatedMocks()
    render(<DauTruongPage />)
    // Đúng shell của cấp trần, và KHÔNG một shell nào cao hơn.
    expect(screen.getByTestId(`cap${CAP_MAX_ENABLED}-page`)).toBeInTheDocument()
    for (const n of ABOVE_CEILING_LEVELS()) {
      expect(screen.queryByTestId(`cap${n}-page`)).not.toBeInTheDocument()
    }
  })

  // ★★ NHÁNH TERMINAL của trần: một user ĐÃ TỐT NGHIỆP đúng cấp trần vẫn ở lại
  // shell của chính cấp đó — KHÔNG spinner, KHÔNG tụt xuống cấp dưới. Đây là
  // trạng thái mà mọi user vượt hết chương trình hiện tại sẽ sống trong đó cho
  // tới lần nâng trần kế tiếp, nên nó phải là một màn hình dùng được.
  it("★ a user who graduated the trần-level stays on that level's own shell (never demoted, never a spinner)", () => {
    allLevelsGraduatedMocks()
    render(<DauTruongPage />)
    expect(screen.getByTestId(`cap${CAP_MAX_ENABLED}-page`)).toBeInTheDocument()
    for (let n = 0; n < CAP_MAX_ENABLED; n++) {
      expect(screen.queryByTestId(`cap${n}-page`)).not.toBeInTheDocument()
    }
  })

  // ★★ Chuỗi Cấp 2 → Cấp 8 bên dưới là hành vi ĐÚNG của TỪNG cấp khi cấp đó
  // được mở. Mỗi cấp có `describe.runIf(CAP_MAX_ENABLED >= N)` riêng, nên nâng
  // trần thêm 1 là đúng một khối test tự sống dậy — không phải sửa, không phải
  // xoá, và không thể lỡ tay bật một cấp mà quên canh nó.
  describe("chuỗi Cấp 2 → Cấp 8 — mỗi cấp tự chạy khi trần đủ cao", () => {
    describe.runIf(CAP_MAX_ENABLED >= 2)("Cấp 1 → Cấp 2", () => {
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

    describe.runIf(CAP_MAX_ENABLED >= 3)("Cấp 2 → Cấp 3", () => {
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

    })
  // ── Cấp 3 → Cấp 4 (this delivery) ─────────────────────────────────────────
  function cap3GraduatedMocks() {
    cap2GraduatedMocks()
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ graduated_at: "2026-07-30T00:00:00Z" }),
      isFetched: true,
    })
  }

    describe.runIf(CAP_MAX_ENABLED >= 4)("Cấp 3 → Cấp 4", () => {
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

    })
  // ── Cấp 4 → Cấp 5 (this delivery) ─────────────────────────────────────────
  function cap4GraduatedMocks() {
    cap3GraduatedMocks()
    useCap4ProgressMock.mockReturnValue({
      data: fakeCap4Progress({ graduated_at: "2026-08-20T00:00:00Z" }),
      isFetched: true,
    })
  }

    describe.runIf(CAP_MAX_ENABLED >= 5)("Cấp 4 → Cấp 5", () => {
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

    })
  // ── Cấp 5 → Cấp 6 (this delivery) ─────────────────────────────────────────
  function cap5GraduatedMocks() {
    cap4GraduatedMocks()
    useCap5ProgressMock.mockReturnValue({
      data: fakeCap5Progress({ graduated_at: "2026-09-10T00:00:00Z" }),
      isFetched: true,
    })
  }

    describe.runIf(CAP_MAX_ENABLED >= 6)("Cấp 5 → Cấp 6", () => {
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

    })
  // ── Cấp 6 → Cấp 7 (this delivery) ─────────────────────────────────────────
  function cap6GraduatedMocks() {
    cap5GraduatedMocks()
    useCap6ProgressMock.mockReturnValue({
      data: fakeCap6Progress({ graduated_at: "2026-10-01T00:00:00Z" }),
      isFetched: true,
    })
  }

    describe.runIf(CAP_MAX_ENABLED >= 7)("Cấp 6 → Cấp 7", () => {
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

    })
  // ── Cấp 7 → Cấp 8 (this delivery — the LAST level of the program) ─────────
  function cap7GraduatedMocks() {
    cap6GraduatedMocks()
    useCap7ProgressMock.mockReturnValue({
      data: fakeCap7Progress({ graduated_at: "2026-11-01T00:00:00Z" }),
      isFetched: true,
    })
  }

    describe.runIf(CAP_MAX_ENABLED >= 8)("Cấp 7 → Cấp 8", () => {
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
    })
  })
})

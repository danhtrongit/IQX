vi.mock("@/features/journey-identity/JourneyIdentityStage", () => ({
  JourneyIdentityStage: ({ level }: { level: number }) => <div data-testid="journey-identity-stage" data-level={level} />,
}))
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap6Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap6ProgressMock,
  useDiemKyLuatMock,
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  graduateCap6Mutate,
  enterCap6Mutate,
  enterCap7Mutate,
  setKhauViMutate,
  recordCap1TradeMock,
  recordCap2TradeMock,
  recordCap2ScoreMock,
  recordCap3TradeMock,
  recordCap4TradeMock,
  recordCap5TradeMock,
  recordCap6TradeMock,
  fetchNguonSanKetsoMock,
  getCap6PlanMock,
  trackJourneyEventMock,
  navigateMock,
  messageSuccess,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useCap3ProgressMock: vi.fn(),
  useCap6ProgressMock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  graduateCap6Mutate: vi.fn(),
  enterCap6Mutate: vi.fn(),
  enterCap7Mutate: vi.fn(),
  setKhauViMutate: vi.fn(),
  recordCap1TradeMock: vi.fn(),
  recordCap2TradeMock: vi.fn(),
  recordCap2ScoreMock: vi.fn(),
  recordCap3TradeMock: vi.fn(),
  recordCap4TradeMock: vi.fn(),
  recordCap5TradeMock: vi.fn(),
  recordCap6TradeMock: vi.fn(),
  fetchNguonSanKetsoMock: vi.fn(),
  getCap6PlanMock: vi.fn(),
  trackJourneyEventMock: vi.fn(),
  navigateMock: vi.fn(),
  messageSuccess: vi.fn(),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: messageSuccess, error: vi.fn(), info: vi.fn() },
  }
})

// Terminal children are the EXISTING, untouched dashboard components — stub them
// (mirrors `cap5/Cap5TradingPage.test.tsx`). The stub fires the SAME buses the
// real `TradingPanel` fires: cap1→cap4 + cap6 on a BUY, and ALL SIX on a SELL.
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <RightSidebarStub />,
  RightToolbar: ({ onActionClick }: { onActionClick?: (id: string) => void }) => (
    <button data-testid="right-toolbar" onClick={() => onActionClick?.("ai-insight")}>
      AI Phân tích
    </button>
  ),
}))

// 5 lớp MÂU THUẪN (≥1 Ủng hộ + ≥1 Ngược chiều) → lệnh này đi qua bước Đối chiếu.
const DOC_5_LOP = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "bad",
  dinh_gia: "ok",
} as const

const AI_5_LOP = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "ok",
  dinh_gia: "neu",
} as const

function RightSidebarStub() {
  const { onOrderFilled: cap1OnOrderFilled, isCap1Active } = useCap1Events()
  const { onOrderFilled: cap2OnOrderFilled, isCap2Active } = useCap2Events()
  const { onOrderFilled: cap3OnOrderFilled, isCap3Active } = useCap3Events()
  const { onOrderFilled: cap4OnOrderFilled, isCap4Active } = useCap4Events()
  const { onOrderFilled: cap5OnOrderFilled, isCap5Active } = useCap5Events()
  const { onOrderFilled: cap6OnOrderFilled, isCap6Active } = useCap6Events()
  const fireLowerBuy = (symbol: string, orderId: string, withDoc5Lop: boolean) => {
    cap1OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      lyDo: "dong_tien",
      trangThaiLucDat: "ung_ho",
      vungMua: 60_000,
    })
    cap2OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      phuongPhapSlTp: "ho_tro_khang_cu",
      catLo: 58_000,
      chotLoi: 65_000,
    })
    cap3OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      khauVi: "can_bang",
      mucTuTin: 3,
      cachKhoiLuong: "linh_hoat",
      khoiLuong: 300,
      pctVon: 18,
    })
    cap4OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      ...(withDoc5Lop
        ? {
            doc5Lop: { ...DOC_5_LOP },
            ai5Lop: { ...AI_5_LOP },
            soLopDongThuan: 3,
            soLopKhacAi: 2,
          }
        : {}),
    })
    cap5OnOrderFilled?.({ symbol, side: "buy", quantity: 300, price: 60_000, orderId })
  }
  return (
    <div data-testid="right-sidebar">
      <span data-testid="bus-spy">
        {`${isCap1Active}-${isCap2Active}-${isCap3Active}-${isCap4Active}-${isCap5Active}-${isCap6Active}`}
      </span>
      <button
        data-testid="fire-buy"
        onClick={() => {
          fireLowerBuy("VNM", "buy-1", true)
          cap6OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            // ★ Cấp 6 «Bậc thầy» — ảnh chụp bảng mâu thuẫn lúc MUA (spec §8).
            conflictLevel: "nghiem",
            coMauThuan: true,
            phuQuyetKichHoat: true,
            lopPhuQuyetXau: ["tin_tuc"],
            pheUngHo: ["ky_thuat", "dong_tien"],
            pheNguoc: ["tin_tuc"],
          })
        }}
      >
        fire buy (có đối chiếu)
      </button>
      <button
        data-testid="fire-buy-no-conflict"
        onClick={() => {
          fireLowerBuy("SSI", "buy-3", true)
          // Không mâu thuẫn → `TradingPanel` KHÔNG gửi khối Đối chiếu.
          cap6OnOrderFilled?.({
            symbol: "SSI",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-3",
            // Không có bảng mâu thuẫn ⇒ Kết sổ bỏ hẳn khối nhận định.
            coMauThuan: false,
          })
        }}
      >
        fire buy (không đối chiếu)
      </button>
      <button
        data-testid="fire-buy-no-doc5lop"
        onClick={() => {
          fireLowerBuy("HPG", "buy-2", false)
          cap6OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-2",
          })
        }}
      >
        fire buy without đọc 5 lớp
      </button>
      <button
        data-testid="fire-sell"
        onClick={() => {
          const sellEvent = {
            symbol: "VNM",
            side: "sell" as const,
            quantity: 300,
            price: 65_500,
            orderId: "sell-1",
          }
          cap1OnOrderFilled?.(sellEvent)
          cap2OnOrderFilled?.(sellEvent)
          cap3OnOrderFilled?.(sellEvent)
          cap4OnOrderFilled?.(sellEvent)
          cap5OnOrderFilled?.(sellEvent)
          cap6OnOrderFilled?.(sellEvent)
        }}
      >
        fire sell
      </button>
      <button
        data-testid="fire-sell-ssi"
        onClick={() => {
          const sellEvent = {
            symbol: "SSI",
            side: "sell" as const,
            quantity: 300,
            price: 61_000,
            orderId: "sell-3",
          }
          cap1OnOrderFilled?.(sellEvent)
          cap6OnOrderFilled?.(sellEvent)
        }}
      >
        fire sell SSI
      </button>
      <button
        data-testid="fire-sell-hpg"
        onClick={() => {
          const sellEvent = {
            symbol: "HPG",
            side: "sell" as const,
            quantity: 300,
            price: 61_000,
            orderId: "sell-2",
          }
          cap1OnOrderFilled?.(sellEvent)
          cap6OnOrderFilled?.(sellEvent)
        }}
      >
        fire sell HPG
      </button>
      <button
        data-testid="fire-sell-reload"
        onClick={() =>
          cap6OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 300,
            price: 65_500,
            orderId: "sell-reload-1",
            buyOrderId: "buy-server-1",
          })
        }
      >
        fire sell after reload
      </button>
      <button
        data-testid="fire-sell-reload-twice"
        onClick={() => {
          const event = {
            symbol: "VNM",
            side: "sell" as const,
            quantity: 300,
            price: 65_500,
            orderId: "sell-reload-1",
            buyOrderId: "buy-server-1",
          }
          cap6OnOrderFilled?.(event)
          cap6OnOrderFilled?.(event)
        }}
      >
        fire same sell twice
      </button>
    </div>
  )
}

// ★★ `AiInsightSymbolModal` nạp briefing bằng `lazy()` và bọc nó trong
// `PremiumGate` (endpoint AI Insight là premium-only). Stub cả hai để bài dưới
// CHỨNG MINH bản đọc thật sự dựng ra trong shell cấp — "không navigate" một
// mình không đủ: một chunk lỗi/đổi tên vẫn thoả điều kiện đó.
vi.mock("@/features/stock/ai-insight", () => ({
  AiInsightBriefing: ({ symbol }: { symbol: string }) => (
    <div data-testid="ai-briefing">{symbol}</div>
  ),
}))

vi.mock("@/features/premium/hooks", () => ({
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))

vi.mock("@/features/navigation", () => ({
  TrialBanner: () => <div data-testid="trial-banner" />,
  Header: () => <div data-testid="header" />,
  MarketBar: () => <div data-testid="market-bar" />,
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}))

vi.mock("@/features/cap1/hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useRecordKetso: () => ({ mutate: vi.fn(), mutateAsync: recordKetsoCap1Async }),
}))
vi.mock("@/features/cap1/tradeLog", () => ({
  useCap1TradeLog: () => ({ trades: [], record: recordCap1TradeMock }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
  useDiemKyLuat: (...a: unknown[]) => useDiemKyLuatMock(...a),
}))
vi.mock("@/features/cap2/tradeLogCap2", () => ({
  useCap2TradeLog: () => ({
    trades: [],
    scores: [],
    record: recordCap2TradeMock,
    recordScore: recordCap2ScoreMock,
  }),
}))
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useSetKhauVi: () => ({ mutate: setKhauViMutate, isPending: false }),
  useEnterCap3: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/cap3/tradeLogCap3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap3/tradeLogCap3")>()
  return { ...actual, useCap3TradeLog: () => ({ trades: [], record: recordCap3TradeMock }) }
})
vi.mock("@/features/cap4/tradeLogCap4", () => ({
  useCap4TradeLog: () => ({ trades: [], record: recordCap4TradeMock }),
}))
vi.mock("@/features/cap5/hooks", () => ({
  useCap5Progress: () => ({ data: null }),
}))
vi.mock("@/features/cap5/nguonSanKetso", () => ({
  fetchNguonSanKetso: (...args: unknown[]) => fetchNguonSanKetsoMock(...args),
}))
vi.mock("@/features/cap5/tradeLogCap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5/tradeLogCap5")>()
  return { ...actual, useCap5TradeLog: () => ({ trades: [], record: recordCap5TradeMock }) }
})

// Cấp 6's own hooks + API + trade log.
vi.mock("./hooks", () => ({
  useCap6Progress: (...a: unknown[]) => useCap6ProgressMock(...a),
  useEnterCap6: () => ({ mutate: enterCap6Mutate, isPending: false }),
  useGraduateCap6: () => ({
    mutate: graduateCap6Mutate,
    isPending: false,
    isError: false,
  }),
  // ★ Cấp 6 «Bậc thầy»: `KetsoModalCap6` đọc lại hàng đã lưu của lệnh qua hook
  // này. Ở đây KHÔNG có dữ liệu → modal dùng đúng ảnh chụp trang này dựng từ bus,
  // tức chính thứ các bài dưới đang kiểm.
  useKehoachMauThuanCap6: () => ({ data: undefined, isPending: false, isError: false }),
}))
vi.mock("@/shared/analytics/journey", () => ({
  trackJourneyEvent: (...args: unknown[]) => trackJourneyEventMock(...args),
}))
vi.mock("./api", () => ({
  cap6Api: { getPlan: (...args: unknown[]) => getCap6PlanMock(...args) },
}))
// Guard module: the final-level graduation flow must never call into it.
vi.mock("@/features/cap7/hooks", () => ({
  useEnterCap7: () => ({ mutate: enterCap7Mutate, isPending: false }),
}))
vi.mock("./tradeLogCap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tradeLogCap6")>()
  return { ...actual, useCap6TradeLog: () => ({ trades: [], record: recordCap6TradeMock }) }
})

import { Cap6TradingPage } from "./Cap6TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "@/features/cap2/Cap2Context"
import { useCap3Events } from "@/features/cap3/Cap3Context"
import { useCap4Events } from "@/features/cap4/Cap4Context"
import { useCap5Events } from "@/features/cap5/Cap5Context"
import { useCap6Events } from "./Cap6Context"

function fakeCap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 61,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
    task_3_done_at:
      overrides.task_3_done_at === undefined ? "t" : overrides.task_3_done_at,
  }
}

function fakeCap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-01-06T00:00:00Z",
    task_1_done_at: "t",
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: "2026-01-20T00:00:00Z",
    time_to_graduate_hours: 80,
    ...overrides,
  }
}

function fakeCap3Progress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-01-21T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: "t",
    task_2_done_at: "t",
    so_lenh_quan_ly_von: 10,
    muc_tu_tin_da_dung: [1, 2, 3],
    so_muc_tu_tin_da_dung: 3,
    so_lenh_cap3: 18,
    lai_pct_cap3: 6.4,
    diem_ky_luat_tb_cap3: 84,
    graduated_at: "2026-02-10T00:00:00Z",
    time_to_graduate_hours: 120,
    ...overrides,
  }
}

function fakeCap6Progress(overrides: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    id: "p6",
    user_id: "u1",
    entered_at: "2026-04-01T00:00:00Z",
    so_lan_xu_ly_nhat_quan: 1,
    so_lan_xu_ly_veto_nhat_quan: 0,
    muc_tieu_nhat_quan: 3,
    tong_lai_lenh_cap6_pct: null,
    da_xem_tour_mauthuan: true,
    dat_nhiem_vu: false,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeDiemKyLuat(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-04-01",
    co_giao_dich: false,
    co_tinh_huong: false,
    diem: null,
    xep_loai: null,
    giai_thich: "Ngày không đặt lệnh nào.",
    thanh_phan: null,
    ...overrides,
  }
}

function cap6Plan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-server-1",
    order_id: "buy-server-1",
    symbol: "VNM",
    quantity: 300,
    bought_at: "2026-09-12T02:00:00Z",
    gia_vao: 60_000,
    lyDo: "dong_tien",
    trangThai_luc_dat: "ung_ho",
    vung_mua: 60_000,
    phuong_phap_sl_tp: "ho_tro_khang_cu",
    cat_lo: 58_000,
    chot_loi: 65_000,
    khau_vi: "can_bang",
    muc_tu_tin: 3,
    cach_khoi_luong: "khau_vi_tu_tin",
    khoi_luong: 300,
    pct_von: 18,
    doc_5_lop: null,
    ai_5_lop: null,
    so_lop_dong_thuan: null,
    so_lop_khac_ai: null,
    source_known: true,
    from_watchlist: true,
    tu_san_ma: true,
    hunt_filter: "dinh",
    hunt_filter_ten: "Vượt đỉnh",
    hunt_signal: "Vượt đỉnh 20 phiên",
    first_hunted_at: "2026-09-08T02:00:00Z",
    so_phien_trong_watchlist: 3,
    so_lop_luc_vao: null,
    so_lop_da_cham_luc_vao: 5,
    consensus_captured_at_entry: "2026-09-12T01:59:00Z",
    entry_snapshot_at: "2026-09-12T02:00:00Z",
    giai_thich: "Mã này được săn từ bộ lọc Vượt đỉnh.",
    ly_do_thieu_so_lop: null,
    canh_bao_nguon_moi_hon: null,
    had_conflict: true,
    conflict_level: "nghiem",
    conflict_level_ten: "Nghiêm trọng",
    had_veto: true,
    veto_layers: ["tin_tuc"],
    veto_layers_ten: ["Tin tức"],
    support_layers: ["ky_thuat", "dong_tien"],
    opposing_layers: ["tin_tuc"],
    neutral_layers: ["noi_bo"],
    conflict_snapshot_session_date: "2026-09-12",
    conflict_snapshot_at: "2026-09-12T02:00:00Z",
    nhat_quan: false,
    ...overrides,
  }
}

function renderCap6(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

/** Mở Kết sổ Cấp 6 cho lệnh mẫu (buy VNM có đối chiếu → sell VNM). */
async function openKetso() {
  fireEvent.click(screen.getByTestId("fire-buy"))
  fireEvent.click(screen.getByTestId("fire-sell"))
  await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
}

describe("Cap6TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress() })
    useCap6ProgressMock.mockReset()
    useCap6ProgressMock.mockReturnValue({ data: fakeCap6Progress() })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: fakeDiemKyLuat(), isLoading: false })
    recordKetsoCap1Async.mockReset()
    recordKetsoCap1Async.mockResolvedValue({ id: "ks1" })
    recordKetsoCap2Mutate.mockReset()
    graduateCap6Mutate.mockReset()
    enterCap6Mutate.mockReset()
    enterCap7Mutate.mockReset()
    setKhauViMutate.mockReset()
    recordCap1TradeMock.mockReset()
    recordCap2TradeMock.mockReset()
    recordCap2ScoreMock.mockReset()
    recordCap3TradeMock.mockReset()
    recordCap4TradeMock.mockReset()
    recordCap5TradeMock.mockReset()
    recordCap6TradeMock.mockReset()
    fetchNguonSanKetsoMock.mockReset()
    fetchNguonSanKetsoMock.mockResolvedValue({
      huntFilter: null,
      huntSoPhienCho: null,
      huntSoLopLucVao: null,
      huntNguonChuaBiet: false,
    })
    getCap6PlanMock.mockReset()
    getCap6PlanMock.mockResolvedValue(cap6Plan())
    trackJourneyEventMock.mockReset()
    navigateMock.mockReset()
    messageSuccess.mockReset()
    window.localStorage.clear()
  })

  it("renders identity in the main slot and preserves the functional panels", () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.getByTestId("journey-identity-stage")).toHaveAttribute("data-level", "6")
    expect(screen.queryByTestId("center-panel")).not.toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as the lower cấp shells", () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 6 · BẬC THẦY" label and the THỰC CHIẾN mode badge', () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.getByText("CẤP 6 · BẬC THẦY")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("keeps ALL SIX buses active (cộng dồn — Cấp 1 … Cấp 6)", () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.getByTestId("bus-spy")).toHaveTextContent("true-true-true-true-true-true")
  })

  it("POSTs /cap6/enter idempotently on mount (without it /cap6/kehoach 404s)", () => {
    renderCap6(<Cap6TradingPage />)
    expect(enterCap6Mutate).toHaveBeenCalledTimes(1)
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap6TradingPage />
          <PanelSpy />
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId("panel-spy")).toHaveTextContent("journey")

    rerender(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <PanelSpy />
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId("panel-spy")).not.toHaveTextContent("journey")
  })

  it("still mounts the MANDATORY KhauViModal (Cấp 3 §5.2 applies at Cấp 6 too)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderCap6(<Cap6TradingPage />)
    expect(screen.getByText("Chọn khẩu vị rủi ro")).toBeInTheDocument()
  })

  // ── Kết sổ chỉ lưu khi user đóng modal, sau khi đã chọn cảm xúc ─────────────
  describe("thời điểm ghi Kết sổ", () => {
    it("không POST cảm xúc null trước khi mở modal; modal sở hữu lần ghi duy nhất", async () => {
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy"))
      fireEvent.click(screen.getByTestId("fire-sell"))

      await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      fireEvent.click(screen.getByTestId("cap6-ketso-close"))
      await waitFor(() =>
        expect(recordKetsoCap1Async).toHaveBeenCalledWith({
          order_id: "sell-1",
          cam_xuc: null,
        }),
      )
    })

    it("KHÔNG kết sổ Cấp 1 (và không mở modal) cho lệnh bán không có lệnh mua theo dõi", () => {
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })

    /**
     * ★★ CỔNG CỨNG CẤP 4 ĐÃ ĐƯỢC NHẤC Ở CẤP 6 «BẬC THẦY».
     *
     * Panel Cấp 6 THAY khối "Đọc 5 lớp" bằng bảng mâu thuẫn (spec §5.2), nên
     * `doc5Lop` LUÔN rỗng. Giữ điều kiện `isDoc5LopComplete` lại là KHÔNG BAO GIỜ
     * mở Kết sổ cho bất kỳ lệnh nào — tức mọi lệnh đã bán biến mất khỏi mọi sổ
     * sách. Bài này canh đúng chiều ngược lại.
     */
    it("★ lệnh KHÔNG có bản chấm 5 lớp VẪN kết sổ được (khối đó đã bị thay)", async () => {
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy-no-doc5lop"))
      fireEvent.click(screen.getByTestId("fire-sell-hpg"))
      await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
    })
  })

  it("a BUY then SELL opens Kết sổ Cấp 6 with the inherited khối + khối nhận định", async () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    await openKetso()

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    // Chồng khối Cấp 1-5 mặc định THU GỌN ở Kết sổ Cấp 6 — mở ra để kiểm.
    fireEvent.click(screen.getByTestId("cap6-ketso-kethua-toggle"))
    expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58.000")
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toHaveTextContent("Cân bằng")
    // Cấp 5 cũ («phân loại 4 ô») đã nghỉ hưu → khối đó KHÔNG còn ở Kết sổ Cấp 6.
    expect(screen.queryByTestId("cap5-phanloai")).not.toBeInTheDocument()
    // … cộng khối MỚI của Cấp 6 «Bậc thầy».
    expect(screen.getByTestId("cap6-ketso-nhandinh")).toBeInTheDocument()
  })

  it("resolves the inherited Cấp 5 source from the tracked BUY order id", async () => {
    renderCap6(<Cap6TradingPage />)
    await openKetso()

    expect(fetchNguonSanKetsoMock).toHaveBeenCalledWith("VNM", "buy-1")
  })

  describe("reload-safe Kết sổ", () => {
    it("hydrates every cumulative block from the exact matched BUY snapshot", async () => {
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell-reload"))

      await waitFor(() => expect(getCap6PlanMock).toHaveBeenCalledWith("buy-server-1"))
      expect(await screen.findByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
      fireEvent.click(screen.getByTestId("cap6-ketso-kethua-toggle"))
      expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58.000")
      expect(screen.getByTestId("cap3-ketso-quanlyvon")).toHaveTextContent("Cân bằng")
      expect(screen.getByTestId("cap6-ketso-ungho")).toHaveTextContent("Kỹ thuật")
      expect(screen.getByTestId("cap6-ketso-nguoc")).toHaveTextContent("Tin tức")
      expect(screen.getByTestId("cap6-ketso-muc")).toHaveTextContent("Nghiêm trọng")
      expect(screen.getByTestId("cap5-ketso-coach")).toBeInTheDocument()
      expect(fetchNguonSanKetsoMock).not.toHaveBeenCalled()
    })

    it("keeps Kết sổ closed when a required inherited commitment is partial", async () => {
      getCap6PlanMock.mockResolvedValue(cap6Plan({ phuong_phap_sl_tp: null }))
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell-reload"))

      await waitFor(() => expect(getCap6PlanMock).toHaveBeenCalled())
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })

    it("preserves unknown source and conflict states without inventing negatives", async () => {
      getCap6PlanMock.mockResolvedValue(
        cap6Plan({
          source_known: false,
          from_watchlist: null,
          hunt_filter: null,
          ai_5_lop: null,
          had_conflict: null,
          conflict_level: null,
          had_veto: null,
          veto_layers: null,
          support_layers: null,
          opposing_layers: null,
          neutral_layers: null,
          conflict_snapshot_session_date: null,
          conflict_snapshot_at: null,
          nhat_quan: null,
        }),
      )
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell-reload"))

      expect(await screen.findByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
      expect(screen.queryByTestId("cap5-ketso-coach")).not.toBeInTheDocument()
      expect(screen.queryByTestId("cap6-ketso-nhandinh")).not.toBeInTheDocument()
      expect(screen.getByTestId("cap6-ketso-mauthuan-chua-biet")).toHaveTextContent(
        "không suy đoán",
      )
    })

    it("deduplicates concurrent and replayed delivery of the same SELL", async () => {
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell-reload-twice"))

      expect(await screen.findByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
      expect(getCap6PlanMock).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByTestId("fire-sell-reload-twice"))
      await waitFor(() => expect(getCap6PlanMock).toHaveBeenCalledTimes(1))
      expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    })

    it("rejects a snapshot for a different symbol", async () => {
      getCap6PlanMock.mockResolvedValue(cap6Plan({ symbol: "SSI" }))
      renderCap6(<Cap6TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell-reload"))

      await waitFor(() => expect(getCap6PlanMock).toHaveBeenCalled())
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })
  })

  it("tracks a conflict order with bounded scalar fields", async () => {
    renderCap6(<Cap6TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))

    await waitFor(() =>
      expect(trackJourneyEventMock).toHaveBeenCalledWith("cap6_order_with_conflict", {
        symbol: "VNM",
        level: "nghiem",
        volume_pct: 18,
      }),
    )
  })

  it("dựng khối nhận định từ ảnh chụp bus lúc MUA (hai phe + mức + phủ quyết)", async () => {
    renderCap6(<Cap6TradingPage />)
    await openKetso()

    expect(screen.getByTestId("cap6-ketso-ungho")).toHaveTextContent(
      "🎯 Kỹ thuật · 💰 Dòng tiền",
    )
    expect(screen.getByTestId("cap6-ketso-nguoc")).toHaveTextContent("📰 Tin tức")
    expect(screen.getByTestId("cap6-ketso-veto-tin_tuc")).toHaveTextContent("PHỦ QUYẾT")
    expect(screen.getByTestId("cap6-ketso-muc")).toHaveTextContent("🔴 Nghiêm trọng")
  })

  it("★ khối lượng + tự tin lấy từ CHÍNH cột Cấp 3 của lệnh, không bịa", async () => {
    renderCap6(<Cap6TradingPage />)
    await openKetso()
    const hd = screen.getByTestId("cap6-ketso-hanhdong")
    expect(hd).toHaveTextContent("18% vốn")
    expect(hd).toHaveTextContent("tự tin")
  })

  it("a lệnh with NO conflict opens Kết sổ WITHOUT khối nhận định (spec §8)", async () => {
    renderCap6(<Cap6TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-no-conflict"))
    fireEvent.click(screen.getByTestId("fire-sell-ssi"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    expect(screen.queryByTestId("cap6-ketso-nhandinh")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap6-ketso-lech")).not.toBeInTheDocument()
  })

  it("closing Kết sổ forwards the record into the Cấp 1-5 trade logs", async () => {
    renderCap6(<Cap6TradingPage />)
    await openKetso()
    fireEvent.click(screen.getByTestId("cap6-ketso-close"))

    await waitFor(() => expect(recordCap6TradeMock).toHaveBeenCalledTimes(1))
    expect(recordCap1TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap2TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap3TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap4TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap5TradeMock).toHaveBeenCalledTimes(1)

    const rec = recordCap5TradeMock.mock.calls[0][0] as Record<string, unknown>
    expect(rec.orderId).toBe("sell-1")
    // The SAME superset record goes into every lower log.
    expect(recordCap1TradeMock.mock.calls[0][0]).toBe(rec)
    expect(recordCap4TradeMock.mock.calls[0][0]).toBe(rec)
  })

  it("records today's điểm kỷ luật into the shared score log once a real score resolves", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 91, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap6(<Cap6TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({
      ngay: "2026-04-01",
      diem: 91,
      xepLoai: "xanh",
    })
  })

  it("mounts GraduationModalCap6 at 3/3 consistent events regardless of veto count", () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap6ProgressMock.mockReturnValue({
      data: fakeCap6Progress({ so_lan_xu_ly_nhat_quan: 2, so_lan_xu_ly_veto_nhat_quan: 2 }),
    })
    renderCap6(<Cap6TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap6ProgressMock.mockReturnValue({
      data: fakeCap6Progress({ so_lan_xu_ly_nhat_quan: 3, so_lan_xu_ly_veto_nhat_quan: 0 }),
    })
    renderCap6(<Cap6TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    // Spec bổ sung: Cấp 6 hoàn thành lộ trình, không mở cấp mới.
    const cta = screen.getByTestId("cap6-grad-cta")
    expect(cta).toHaveTextContent("Đang ghi nhận…")
    expect(cta).toBeDisabled()
    expect(graduateCap6Mutate).toHaveBeenCalledTimes(1)
    expect(enterCap7Mutate).not.toHaveBeenCalled()
    expect(cta.textContent).not.toContain("Đọc sổ lệnh")
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting mở bản đọc AI NGAY TRONG trang cấp — KHÔNG điều hướng', async () => {
    renderCap6(<Cap6TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    // ★★ KHÔNG còn rời trang cấp: bản đọc 6 lớp mở NGAY TRONG shell (ô nhập mã
    // nhường chỗ cho briefing). Xem `features/dau-truong/AiInsightModal`.
    // Phải canh chính briefing hiện ra, không chỉ "không navigate".
    await waitFor(() => expect(screen.getByTestId("ai-briefing")).toHaveTextContent("VCB"))
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
  })
})

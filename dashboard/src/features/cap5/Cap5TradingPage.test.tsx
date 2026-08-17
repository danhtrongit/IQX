import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap5Progress, VerdictGoiY } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap5ProgressMock,
  useDiemKyLuatMock,
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  recordKetsoCap5Async,
  graduateCap5Mutate,
  setKhauViMutate,
  recordCap1TradeMock,
  recordCap2TradeMock,
  recordCap2ScoreMock,
  recordCap3TradeMock,
  recordCap4TradeMock,
  recordCap5TradeMock,
  verdictQuery,
  navigateMock,
  messageSuccess,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useCap3ProgressMock: vi.fn(),
  useCap5ProgressMock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  recordKetsoCap5Async: vi.fn(),
  graduateCap5Mutate: vi.fn(),
  setKhauViMutate: vi.fn(),
  recordCap1TradeMock: vi.fn(),
  recordCap2TradeMock: vi.fn(),
  recordCap2ScoreMock: vi.fn(),
  recordCap3TradeMock: vi.fn(),
  recordCap4TradeMock: vi.fn(),
  recordCap5TradeMock: vi.fn(),
  verdictQuery: { current: {} as Record<string, unknown> },
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
// (mirrors `cap4/Cap4TradingPage.test.tsx`). The stub fires the SAME buses the
// real `TradingPanel` fires: cap1+cap2+cap3+cap4 on a BUY, and ALL FIVE on a
// SELL (see `TradingPanel.tsx` — Cấp 5's Kết sổ listens to its OWN bus).
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <RightSidebarStub />,
  RightToolbar: ({ onActionClick }: { onActionClick?: (id: string) => void }) => (
    <button data-testid="right-toolbar" onClick={() => onActionClick?.("ai-insight")}>
      AI Phân tích
    </button>
  ),
}))

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
  const { onOrderFilled: cap5OnOrderFilled, onVerdictSettled, isCap5Active } = useCap5Events()
  return (
    <div data-testid="right-sidebar">
      <span data-testid="bus-spy">
        {`${isCap1Active}-${isCap2Active}-${isCap3Active}-${isCap4Active}-${isCap5Active}`}
      </span>
      <button
        data-testid="fire-buy"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            lyDo: "dong_tien",
            trangThaiLucDat: "ung_ho",
            vungMua: 60_000,
          })
          cap2OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            phuongPhapSlTp: "ho_tro_khang_cu",
            catLo: 58_000,
            chotLoi: 65_000,
          })
          cap3OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            khauVi: "can_bang",
            mucTuTin: 3,
            cachKhoiLuong: "linh_hoat",
            khoiLuong: 300,
            pctVon: 18,
          })
          cap4OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            doc5Lop: { ...DOC_5_LOP },
            ai5Lop: { ...AI_5_LOP },
            soLopDongThuan: 3,
            soLopKhacAi: 2,
          })
          cap5OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
          })
        }}
      >
        fire buy
      </button>
      <button
        data-testid="fire-buy-no-doc5lop"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 100,
            price: 30_000,
            orderId: "buy-2",
            lyDo: "dong_tien",
            trangThaiLucDat: "ung_ho",
            vungMua: 30_000,
          })
          cap2OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 100,
            price: 30_000,
            orderId: "buy-2",
            phuongPhapSlTp: "ho_tro_khang_cu",
            catLo: 29_000,
            chotLoi: 33_000,
          })
          cap3OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 100,
            price: 30_000,
            orderId: "buy-2",
            khauVi: "can_bang",
            mucTuTin: 2,
            cachKhoiLuong: "linh_hoat",
            khoiLuong: 100,
            pctVon: 5,
          })
          // Cổng cứng Cấp 4 chưa qua → `TradingPanel` KHÔNG gửi doc5Lop.
          cap4OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 100,
            price: 30_000,
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
        }}
      >
        fire sell
      </button>
      <button
        data-testid="fire-sell-hpg"
        onClick={() => {
          const sellEvent = {
            symbol: "HPG",
            side: "sell" as const,
            quantity: 100,
            price: 31_000,
            orderId: "sell-2",
          }
          cap1OnOrderFilled?.(sellEvent)
          cap5OnOrderFilled?.(sellEvent)
        }}
      >
        fire sell HPG
      </button>
      <button
        data-testid="fire-verdict-settled"
        onClick={() => onVerdictSettled?.("dung", false)}
      >
        fire verdict settled
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
// Cấp 3's hooks stay in play at Cấp 5 (khẩu vị bắt buộc + nhật ký lệnh).
// `useEnterCap3` is needed because this page reuses `computeKetsoFlagsCap2` from
// `cap2/Cap2TradingPage`, whose module also pulls in `GraduationModalCap2`.
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useSetKhauVi: () => ({ mutate: setKhauViMutate, isPending: false }),
  useEnterCap3: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/cap3/tradeLogCap3", () => ({
  useCap3TradeLog: () => ({ trades: [], record: recordCap3TradeMock }),
}))
vi.mock("@/features/cap4/tradeLogCap4", () => ({
  useCap4TradeLog: () => ({ trades: [], record: recordCap4TradeMock }),
}))
// `GraduationModalCap5` now enters Cấp 6 for real (Cấp 6 Task FE3) — same
// concrete-file mock `Cap4TradingPage.test.tsx` uses for `useEnterCap5`.
vi.mock("@/features/cap6/hooks", () => ({
  useEnterCap6: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Cấp 5's own hooks + trade log.
vi.mock("./hooks", () => ({
  useCap5Progress: (...a: unknown[]) => useCap5ProgressMock(...a),
  useGraduateCap5: () => ({ mutate: graduateCap5Mutate, isPending: false }),
  useThachThucCap5: () => ({ data: undefined }),
  useVerdictGoiY: () => verdictQuery.current,
  useRecordKetsoCap5: () => ({ mutateAsync: recordKetsoCap5Async, isPending: false }),
}))
vi.mock("./tradeLogCap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tradeLogCap5")>()
  return { ...actual, useCap5TradeLog: () => ({ trades: [], record: recordCap5TradeMock }) }
})

import { Cap5TradingPage } from "./Cap5TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "@/features/cap2/Cap2Context"
import { useCap3Events } from "@/features/cap3/Cap3Context"
import { useCap4Events } from "@/features/cap4/Cap4Context"
import { useCap5Events } from "./Cap5Context"

function fakeCap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 61,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
  }
}

function fakeCap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-01-06T00:00:00Z",
    task_1_done_at: "t",
    task_2_done_at: "t",
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
    task_3_done_at: "t",
    so_lenh_cap3: 18,
    lai_pct_cap3: 6.4,
    diem_ky_luat_tb_cap3: 84,
    graduated_at: "2026-02-10T00:00:00Z",
    time_to_graduate_hours: 120,
    ...overrides,
  }
}

function fakeCap5Progress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p5",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_phan_loai: 3,
    so_lan_dung_ngoai_da_cham: 1,
    ty_le_quyet_dinh_dung: 66,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeDiemKyLuat(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-03-01",
    co_giao_dich: false,
    co_tinh_huong: false,
    diem: null,
    xep_loai: null,
    giai_thich: "Ngày không đặt lệnh nào.",
    thanh_phan: null,
    ...overrides,
  }
}

function fakeVerdict(overrides: Partial<VerdictGoiY> = {}): VerdictGoiY {
  return {
    order_id: "sell-1",
    verdict: "dung",
    giai_thich: "Lệnh này theo đúng kế hoạch + kỷ luật của bạn.",
    signals: [
      { ma: "co_so", ten: "Cơ sở khi đặt lệnh", dat: true, giai_thich: "4/5 lớp Ủng hộ lúc đặt" },
    ],
    pnl_pct: 9.2,
    thang: true,
    o_4_du_kien: "dung_thang",
    ...overrides,
  }
}

function renderCap5(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

/** Mở Kết sổ Cấp 5 cho lệnh mẫu (buy VNM → sell VNM), chờ modal hiện. */
async function openKetso() {
  fireEvent.click(screen.getByTestId("fire-buy"))
  fireEvent.click(screen.getByTestId("fire-sell"))
  await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
}

describe("Cap5TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress() })
    useCap5ProgressMock.mockReset()
    useCap5ProgressMock.mockReturnValue({ data: fakeCap5Progress() })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: fakeDiemKyLuat(), isLoading: false })
    recordKetsoCap1Async.mockReset()
    recordKetsoCap1Async.mockResolvedValue({ id: "ks1" })
    recordKetsoCap2Mutate.mockReset()
    recordKetsoCap5Async.mockReset()
    recordKetsoCap5Async.mockResolvedValue({
      id: "k5",
      order_id: "sell-1",
      pnl_pct: 9.2,
      verdict_he: "dung",
      verdict_user: "dung",
      verdict_provenance: null,
      o_4: "dung_thang",
      ly_do_sua: null,
    })
    graduateCap5Mutate.mockReset()
    setKhauViMutate.mockReset()
    recordCap1TradeMock.mockReset()
    recordCap2TradeMock.mockReset()
    recordCap2ScoreMock.mockReset()
    recordCap3TradeMock.mockReset()
    recordCap4TradeMock.mockReset()
    recordCap5TradeMock.mockReset()
    verdictQuery.current = { data: fakeVerdict(), isPending: false, isError: false }
    navigateMock.mockReset()
    messageSuccess.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    renderCap5(<Cap5TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as the lower cấp shells", () => {
    renderCap5(<Cap5TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 5 · LÃO LUYỆN" label and the THỰC CHIẾN mode badge', () => {
    renderCap5(<Cap5TradingPage />)
    expect(screen.getByText("CẤP 5 · LÃO LUYỆN")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("keeps the Cấp 1 + 2 + 3 + 4 + 5 buses ALL active (cộng dồn)", () => {
    renderCap5(<Cap5TradingPage />)
    expect(screen.getByTestId("bus-spy")).toHaveTextContent("true-true-true-true-true")
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap5TradingPage />
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

  it("still mounts the MANDATORY KhauViModal (Cấp 3 §5.2 applies at Cấp 5 too)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderCap5(<Cap5TradingPage />)
    expect(screen.getByText("Chọn khẩu vị rủi ro")).toBeInTheDocument()
  })

  // ── PRIORITY #1: thứ tự POST /cap1/ketso ↔ mở Kết sổ Cấp 5 ────────────────
  describe("thứ tự kết sổ (hàng order_ketso phải có TRƯỚC khi mở Kết sổ Cấp 5)", () => {
    it("POST /cap1/ketso cho lệnh vừa bán TRƯỚC khi modal Cấp 5 mở", async () => {
      let releasePreflight: (() => void) | null = null
      recordKetsoCap1Async.mockImplementation(
        () =>
          new Promise((resolve) => {
            releasePreflight = () => resolve({ id: "ks1" })
          }),
      )
      renderCap5(<Cap5TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy"))
      fireEvent.click(screen.getByTestId("fire-sell"))

      // Đã gọi kết sổ Cấp 1 cho ĐÚNG lệnh bán này …
      expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "sell-1", cam_xuc: null })
      // … và modal CHƯA mở khi call đó còn treo (nếu mở trước thì
      // `GET /cap5/verdict` + `POST /cap5/ketso` sẽ 404 và user bị kẹt).
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

      releasePreflight!()
      await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    })

    it("lệnh đã kết sổ Cấp 1 trước đó (409) vẫn mở được Kết sổ Cấp 5", async () => {
      recordKetsoCap1Async.mockRejectedValue(new Error("Lệnh này đã kết sổ"))
      renderCap5(<Cap5TradingPage />)
      await openKetso()
      expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    })

    it("KHÔNG kết sổ Cấp 1 (và không mở modal) cho lệnh bán không có lệnh mua theo dõi", () => {
      renderCap5(<Cap5TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })

    it("KHÔNG kết sổ Cấp 1 cho lệnh chưa chấm đủ 5 lớp (cổng cứng Cấp 4)", () => {
      renderCap5(<Cap5TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy-no-doc5lop"))
      fireEvent.click(screen.getByTestId("fire-sell-hpg"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })
  })

  it("a BUY then SELL on the same symbol opens Kết sổ Cấp 5 with every inherited khối + khối 4 ô", async () => {
    renderCap5(<Cap5TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    await openKetso()

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    // Cấp 1 + 2 + 3 + 4 content still there (cộng dồn) …
    expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58,000")
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toHaveTextContent("Cân bằng")
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc")).toHaveAttribute("data-diff", "true")
    // … plus Cấp 5's own khối phân loại 4 ô.
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-phanloai-verdict-he").textContent).toMatch(/QUYẾT ĐỊNH ĐÚNG/)
  })

  it("closing Kết sổ forwards the record into the Cấp 1, 2, 3 AND 4 trade logs", async () => {
    renderCap5(<Cap5TradingPage />)
    await openKetso()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(screen.getByTestId("cap5-ketso-close"))

    await waitFor(() => expect(recordCap5TradeMock).toHaveBeenCalledTimes(1))
    expect(recordKetsoCap5Async).toHaveBeenCalledWith({
      order_id: "sell-1",
      verdict_user: "dung",
      ly_do_sua: null,
    })
    expect(recordCap1TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap2TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap3TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap4TradeMock).toHaveBeenCalledTimes(1)

    const rec = recordCap4TradeMock.mock.calls[0][0]
    expect(rec.orderId).toBe("sell-1")
    expect(rec.o4).toBe("dung_thang")
    expect(rec.mucTuTin).toBe(3)
    expect(rec.doc_5_lop).toEqual(DOC_5_LOP)
    // The SAME superset record goes into every lower log.
    expect(recordCap1TradeMock.mock.calls[0][0]).toBe(rec)
    expect(recordCap3TradeMock.mock.calls[0][0]).toBe(rec)
  })

  it("records today's điểm kỷ luật into the shared score log once a real score resolves", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 91, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap5(<Cap5TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({
      ngay: "2026-03-01",
      diem: 91,
      xepLoai: "xanh",
    })
  })

  it("registers a handler for cap5Events.onVerdictSettled (spec §8 — nothing else listens)", () => {
    renderCap5(<Cap5TradingPage />)
    fireEvent.click(screen.getByTestId("fire-verdict-settled"))
    expect(messageSuccess).toHaveBeenCalledTimes(1)
    expect(messageSuccess.mock.calls[0][0]).toMatch(/quyết định đúng/i)
  })

  it("mounts GraduationModalCap5 (hidden until 3/3 nhiệm vụ)", () => {
    renderCap5(<Cap5TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap5ProgressMock.mockReturnValue({
      data: fakeCap5Progress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        so_lenh_phan_loai: 24,
        so_lan_dung_ngoai_da_cham: 6,
        ty_le_quyet_dinh_dung: 75,
      }),
    })
    renderCap5(<Cap5TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("Vào Cấp 6 «Đối chiếu» →")).toBeInTheDocument()
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting mở bản đọc AI NGAY TRONG trang cấp — KHÔNG điều hướng', async () => {
    renderCap5(<Cap5TradingPage />)
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

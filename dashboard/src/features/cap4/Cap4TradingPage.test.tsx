import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap4ProgressMock,
  useDiemKyLuatMock,
  recordKetsoCap1Mutate,
  recordKetsoCap2Mutate,
  completeCap4TaskMutate,
  graduateCap4Mutate,
  setKhauViMutate,
  recordCap1TradeMock,
  recordCap2TradeMock,
  recordCap2ScoreMock,
  recordCap3TradeMock,
  recordCap4TradeMock,
  navigateMock,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useCap3ProgressMock: vi.fn(),
  useCap4ProgressMock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Mutate: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  completeCap4TaskMutate: vi.fn(),
  graduateCap4Mutate: vi.fn(),
  setKhauViMutate: vi.fn(),
  recordCap1TradeMock: vi.fn(),
  recordCap2TradeMock: vi.fn(),
  recordCap2ScoreMock: vi.fn(),
  recordCap3TradeMock: vi.fn(),
  recordCap4TradeMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

// Terminal children are the EXISTING, untouched dashboard components — stub
// them (mirrors `cap3/Cap3TradingPage.test.tsx`). The stub fires the SAME buses
// the real `TradingPanel` fires: cap1+cap2+cap3+cap4 on a BUY, and all four on
// a SELL (see `TradingPanel.tsx` — FE1 gave Cấp 3 + Cấp 4 their own sell event).
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
  return (
    <div data-testid="right-sidebar">
      <span data-testid="bus-spy">{`${isCap1Active}-${isCap2Active}-${isCap3Active}-${isCap4Active}`}</span>
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
          cap2OnOrderFilled?.(sellEvent)
          cap3OnOrderFilled?.(sellEvent)
          cap4OnOrderFilled?.(sellEvent)
        }}
      >
        fire sell HPG
      </button>
    </div>
  )
}

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
  useRecordKetso: () => ({ mutate: recordKetsoCap1Mutate }),
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
// Cấp 3's hooks stay in play at Cấp 4 (khẩu vị bắt buộc + nhật ký lệnh).
// `useEnterCap3` is needed because this page reuses `computeKetsoFlagsCap2`
// from `cap2/Cap2TradingPage`, whose module also pulls in `GraduationModalCap2`.
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useSetKhauVi: () => ({ mutate: setKhauViMutate, isPending: false }),
  useEnterCap3: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/cap3/tradeLogCap3", () => ({
  useCap3TradeLog: () => ({ trades: [], record: recordCap3TradeMock }),
}))

// Cấp 4's own hooks + trade log.
vi.mock("./hooks", () => ({
  useCap4Progress: (...a: unknown[]) => useCap4ProgressMock(...a),
  useCompleteCap4Task: () => ({ mutate: completeCap4TaskMutate }),
  useGraduateCap4: () => ({ mutate: graduateCap4Mutate, isPending: false }),
  useThachThucCap4: () => ({ data: undefined }),
  useVuKhiDiemMu: () => ({ data: undefined }),
}))
vi.mock("./tradeLogCap4", () => ({
  useCap4TradeLog: () => ({ trades: [], record: recordCap4TradeMock }),
}))
// `GraduationModalCap4` (mounted below) now really enters Cấp 5 on success.
vi.mock("@/features/cap5/hooks", () => ({
  useEnterCap5: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { Cap4TradingPage } from "./Cap4TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "@/features/cap2/Cap2Context"
import { useCap3Events } from "@/features/cap3/Cap3Context"
import { useCap4Events } from "./Cap4Context"

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
    so_lenh_thuc_chien: 42,
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
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    chuoi_current: 6,
    chuoi_record: 8,
    last_chuoi_reset_at: null,
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

function fakeCap4Progress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "p4",
    user_id: "u1",
    entered_at: "2026-02-11T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 4,
    vu_khi_lop: null,
    diem_mu_lop: null,
    ty_le_thang_dong_thuan_cao: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeDiemKyLuat(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-02-11",
    co_giao_dich: false,
    co_tinh_huong: false,
    diem: null,
    xep_loai: null,
    giai_thich: "Ngày không đặt lệnh nào.",
    thanh_phan: null,
    ...overrides,
  }
}

function renderCap4(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

describe("Cap4TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress() })
    useCap4ProgressMock.mockReset()
    useCap4ProgressMock.mockReturnValue({ data: fakeCap4Progress() })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: fakeDiemKyLuat(), isLoading: false })
    recordKetsoCap1Mutate.mockReset()
    recordKetsoCap2Mutate.mockReset()
    completeCap4TaskMutate.mockReset()
    graduateCap4Mutate.mockReset()
    setKhauViMutate.mockReset()
    recordCap1TradeMock.mockReset()
    recordCap2TradeMock.mockReset()
    recordCap2ScoreMock.mockReset()
    recordCap3TradeMock.mockReset()
    recordCap4TradeMock.mockReset()
    navigateMock.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as the lower cấp shells", () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 4 · THUẦN THỤC" label and the THỰC CHIẾN mode badge', () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.getByText("CẤP 4 · THUẦN THỤC")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("keeps the Cấp 1 + 2 + 3 + 4 buses ALL active (cộng dồn)", () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.getByTestId("bus-spy")).toHaveTextContent("true-true-true-true")
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap4TradingPage />
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

  it("still mounts the MANDATORY KhauViModal (Cấp 3 §5.2 applies at Cấp 4 too)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderCap4(<Cap4TradingPage />)
    expect(screen.getByText("Chọn khẩu vị rủi ro")).toBeInTheDocument()
  })

  it("does NOT show the KhauViModal once khẩu vị đã đặt", () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.queryByText("Chọn khẩu vị rủi ro")).not.toBeInTheDocument()
  })

  it("a BUY then SELL on the same symbol opens Kết sổ Cấp 4 with doc5Lop + ai5Lop populated", () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-buy"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    // Cấp 1 + 2 + 3 content still there (cộng dồn) …
    expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58,000")
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toHaveTextContent("Cân bằng")
    // … plus Cấp 4's own bảng "Đọc 5 lớp — nhìn lại", fed off the Cấp 4 BUY bus.
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc-ban")).toHaveTextContent("Ngược chiều")
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc-ai")).toHaveTextContent("Ủng hộ")
    // Lớp đọc khác AI được nổi bật (tím) — trung tính, không "sai".
    expect(screen.getByTestId("cap4-ketso-lr-tin_tuc")).toHaveAttribute("data-diff", "true")
    expect(screen.getByTestId("cap4-ketso-lr-dong_tien")).toHaveAttribute("data-diff", "false")
    expect(screen.getByTestId("cap4-ketso-doc5lop-sum")).toHaveTextContent("Đồng thuận: 3/5")
  })

  it("a SELL with no tracked BUY does not open Kết sổ", () => {
    renderCap4(<Cap4TradingPage />)
    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("a BUY whose đọc 5 lớp never resolved does not open Kết sổ Cấp 4 (hard gate upstream)", () => {
    renderCap4(<Cap4TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-no-doc5lop"))
    fireEvent.click(screen.getByTestId("fire-sell-hpg"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  // NOTE: the Cấp 4 write is owned by `KetsoModalCap4` itself, so the page must
  // NOT record it a second time — hence exactly 1 Cấp 4 call, and the Cấp 4
  // record (a superset) forwarded into the Cấp 1/2/3 logs.
  it("closing Kết sổ records the closed trade into the Cấp 1, 2, 3 AND 4 trade logs", () => {
    renderCap4(<Cap4TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))
    fireEvent.click(screen.getByTestId("fire-sell"))
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "sell-1" }),
    )
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "sell-1" }),
    )
    expect(completeCap4TaskMutate).toHaveBeenCalledWith(2)
    expect(recordCap4TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap1TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap2TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap3TradeMock).toHaveBeenCalledTimes(1)

    const rec = recordCap4TradeMock.mock.calls[0][0]
    expect(rec.orderId).toBe("sell-1")
    expect(rec.mucTuTin).toBe(3)
    expect(rec.doc_5_lop).toEqual(DOC_5_LOP)
    expect(rec.ai_5_lop).toEqual(AI_5_LOP)
    expect(rec.so_lop_dong_thuan).toBe(3)
    expect(rec.so_lop_khac_ai).toBe(2)
    // The SAME superset record goes into the lower logs.
    expect(recordCap3TradeMock.mock.calls[0][0]).toBe(rec)
  })

  it("records today's điểm kỷ luật into the shared score log once a real score resolves", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 88, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap4(<Cap4TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({
      ngay: "2026-02-11",
      diem: 88,
      xepLoai: "xanh",
    })
  })

  it("mounts GraduationModalCap4 (hidden until 3/3 nhiệm vụ)", () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap4ProgressMock.mockReturnValue({
      data: fakeCap4Progress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        so_lenh_doc_du_5lop: 22,
        vu_khi_lop: "dong_tien",
        diem_mu_lop: "tin_tuc",
        ty_le_thang_dong_thuan_cao: 64,
      }),
    })
    renderCap4(<Cap4TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByText("Vào Cấp 5 «Lão luyện» →")).toBeInTheDocument()
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting navigates', () => {
    renderCap4(<Cap4TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VCB")
  })
})

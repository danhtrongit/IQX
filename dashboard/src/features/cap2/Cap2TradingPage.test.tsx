import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useDiemKyLuatMock,
  recordKetsoCap1Mutate,
  recordKetsoCap2Mutate,
  graduateCap2Mutate,
  recordCap2TradeMock,
  recordCap2ScoreMock,
  recordCap1TradeMock,
  navigateMock,
  enterCap3Mutate,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Mutate: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  graduateCap2Mutate: vi.fn(),
  recordCap2TradeMock: vi.fn(),
  recordCap2ScoreMock: vi.fn(),
  recordCap1TradeMock: vi.fn(),
  navigateMock: vi.fn(),
  enterCap3Mutate: vi.fn(),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

// Terminal children (CenterPanel/RightSidebar/RightToolbar) are the EXISTING,
// untouched dashboard components — stub them (mirrors
// `Cap1TradingPage.test.tsx`). `RightSidebar`'s stub fires BOTH the Cấp 1 AND
// Cấp 2 event buses for a buy/sell — mirroring exactly what the real
// `TradingPanel` does (it notifies both buses for the same fill, since Cấp 2
// wraps Cấp 1's Form Kế hoạch — see `TradingPanel.tsx` lines ~410-459).
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <RightSidebarStub />,
  RightToolbar: ({ onActionClick }: { onActionClick?: (id: string) => void }) => (
    <button data-testid="right-toolbar" onClick={() => onActionClick?.("ai-insight")}>
      AI Phân tích
    </button>
  ),
}))

function RightSidebarStub() {
  const { onOrderFilled: cap1OnOrderFilled } = useCap1Events()
  const { onOrderFilled: cap2OnOrderFilled } = useCap2Events()
  return (
    <div data-testid="right-sidebar">
      <button
        data-testid="fire-buy"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 100,
            price: 60_000,
            orderId: "buy-1",
            lyDo: "dong_tien",
            trangThaiLucDat: "ung_ho",
            vungMua: 60_000,
          })
          cap2OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 100,
            price: 60_000,
            orderId: "buy-1",
            phuongPhapSlTp: "ho_tro_khang_cu",
            catLo: 58_000,
            chotLoi: 65_000,
          })
        }}
      >
        fire buy
      </button>
      <button
        data-testid="fire-sell"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 65_500,
            orderId: "sell-1",
          })
          cap2OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 65_500,
            orderId: "sell-1",
          })
        }}
      >
        fire sell
      </button>
      <button
        data-testid="fire-sell-cut-loss"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 57_000,
            orderId: "sell-2",
          })
          cap2OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 57_000,
            orderId: "sell-2",
          })
        }}
      >
        fire sell cut loss
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

// Cấp 1 pieces used directly by Cap2Terminal/KetsoModalCap2 — concrete paths
// (NOT the `@/features/cap1` barrel, same anti-cycle convention
// `KetsoModalCap2.tsx` already established).
vi.mock("@/features/cap1/hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useRecordKetso: () => ({ mutate: recordKetsoCap1Mutate }),
}))
vi.mock("@/features/cap1/tradeLog", () => ({
  useCap1TradeLog: () => ({ trades: [], record: recordCap1TradeMock }),
}))

// Cấp 2's own hooks + trade log.
vi.mock("./hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useGraduateCap2: () => ({ mutate: graduateCap2Mutate, isPending: false }),
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
  useDiemKyLuat: (...a: unknown[]) => useDiemKyLuatMock(...a),
}))
vi.mock("./tradeLogCap2", () => ({
  useCap2TradeLog: () => ({
    trades: [],
    scores: [],
    record: recordCap2TradeMock,
    recordScore: recordCap2ScoreMock,
  }),
}))

// `GraduationModalCap2` now REALLY enters Cấp 3 on graduation (Cấp 3 Task FE3)
// — stub that mutation so this page's tests need no QueryClient.
vi.mock("@/features/cap3/hooks", () => ({
  useEnterCap3: () => ({ mutate: enterCap3Mutate, isPending: false }),
}))

import { Cap2TradingPage, computeKetsoFlagsCap2 } from "./Cap2TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "./Cap2Context"

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
    so_lenh_thuc_chien: 10,
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
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    chuoi_current: 0,
    chuoi_record: 0,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function fakeDiemKyLuat(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-01-06",
    co_giao_dich: false,
    co_tinh_huong: false,
    diem: null,
    xep_loai: null,
    giai_thich: "Ngày không đặt lệnh nào.",
    thanh_phan: null,
    ...overrides,
  }
}

function renderCap2(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

describe("Cap2TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: fakeDiemKyLuat(), isLoading: false })
    recordKetsoCap1Mutate.mockReset()
    recordKetsoCap2Mutate.mockReset()
    graduateCap2Mutate.mockReset()
    recordCap2TradeMock.mockReset()
    recordCap2ScoreMock.mockReset()
    recordCap1TradeMock.mockReset()
    navigateMock.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    renderCap2(<Cap2TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as DashboardPage/Cap1TradingPage", () => {
    renderCap2(<Cap2TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 2 · KỶ LUẬT" label and the THỰC CHIẾN mode badge', () => {
    renderCap2(<Cap2TradingPage />)
    expect(screen.getByText("CẤP 2 · KỶ LUẬT")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap2TradingPage />
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

  it("a BUY then SELL fill on the same symbol opens Kết sổ Cấp 2 (reconciled against the buy-time kế hoạch + SL/TP)", () => {
    renderCap2(<Cap2TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-buy"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    // Reconciled against the tracked buy (kế hoạch's lý do label) + the SL/TP
    // commitment tracked from the Cấp 2 buy event.
    expect(screen.getByText("💰 Dòng tiền")).toBeInTheDocument()
    const camket = screen.getByTestId("cap2-ketso-camket")
    expect(camket).toHaveTextContent("58,000")
    expect(camket).toHaveTextContent("65,000")
  })

  it('a sell that never touched the SL/TP commitment does not open Kết sổ (no tracked buy for the symbol)', () => {
    renderCap2(<Cap2TradingPage />)
    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it('closing Kết sổ posts BOTH /cap1/ketso and /cap2/ketso, and records BOTH trade logs', () => {
    renderCap2(<Cap2TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))
    fireEvent.click(screen.getByTestId("fire-sell"))
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    expect(recordKetsoCap1Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "sell-1" }),
    )
    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "sell-1" }),
    )
    expect(recordCap1TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap2TradeMock).toHaveBeenCalledTimes(1)
    const cap2Record = recordCap2TradeMock.mock.calls[0][0]
    expect(cap2Record.orderId).toBe("sell-1")
    expect(cap2Record.lyDo).toBe("dong_tien")
    // Clean order (chốt lời đúng, no vi phạm) → all 4 flags false.
    expect(cap2Record.chamSlKhongCat).toBe(false)
    expect(cap2Record.nhoiLenhKhiLo).toBe(false)
  })

  it("a sell that touches the cắt lỗ commitment records cham_SL_cat_dung_phien_ke on /cap2/ketso", () => {
    renderCap2(<Cap2TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))
    fireEvent.click(screen.getByTestId("fire-sell-cut-loss"))
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))

    expect(recordKetsoCap2Mutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "sell-2", cham_SL_cat_dung_phien_ke: true }),
    )
  })

  it("records today's điểm kỷ luật into the Cấp 2 score log once useDiemKyLuat resolves a real score", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 90, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap2(<Cap2TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({ ngay: "2026-01-06", diem: 90, xepLoai: "xanh" })
  })

  it("does NOT record a score while there is no real điểm to show (diem null)", () => {
    renderCap2(<Cap2TradingPage />)
    expect(recordCap2ScoreMock).not.toHaveBeenCalled()
  })

  it("mounts GraduationModalCap2 (hidden until 5/5 nhiệm vụ)", () => {
    renderCap2(<Cap2TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap2ProgressMock.mockReturnValue({
      data: fakeCap2Progress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        so_lenh_co_cl_tp: 0,
        so_lan_cat_lo_dung: 0,
        so_lan_chot_loi_dung: 0,
        so_lan_thuc_hien_dung: 0,
        chuoi_current: 20,
        chuoi_record: 20,
      }),
    })
    renderCap2(<Cap2TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting a valid symbol mở bản đọc AI NGAY TRONG trang cấp — KHÔNG điều hướng', () => {
    renderCap2(<Cap2TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    // ★★ KHÔNG còn rời trang cấp: bản đọc 6 lớp mở NGAY TRONG shell (ô nhập mã
    // nhường chỗ cho briefing). Xem `features/dau-truong/AiInsightModal`.
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
  })
})

describe("computeKetsoFlagsCap2 (spec §1 — best-effort client-side approximation)", () => {
  it("cắt lỗ đúng phiên: exit at/below cắt lỗ, held ≤1 phiên", () => {
    const flags = computeKetsoFlagsCap2({
      entryPrice: 60_000,
      exitPrice: 57_000,
      catLo: 58_000,
      soPhienGiu: 0,
    })
    expect(flags.cham_SL_cat_dung_phien_ke).toBe(true)
    expect(flags.cham_SL_khong_cat).toBe(false)
    expect(flags.ban_som_khi_lo_nhe).toBe(false)
  })

  it("cắt lỗ chậm: exit at/below cắt lỗ, held >1 phiên", () => {
    const flags = computeKetsoFlagsCap2({
      entryPrice: 60_000,
      exitPrice: 57_000,
      catLo: 58_000,
      soPhienGiu: 3,
    })
    expect(flags.cham_SL_khong_cat).toBe(true)
    expect(flags.cham_SL_cat_dung_phien_ke).toBe(false)
    expect(flags.giu_cham_SL_bao_nhieu_phien).toBe(2)
  })

  it("bán sớm khi lỗ nhẹ: loss between 0 and −2%, chưa chạm cắt lỗ", () => {
    const flags = computeKetsoFlagsCap2({
      entryPrice: 60_000,
      exitPrice: 59_400, // -1.0%
      catLo: 58_000,
      soPhienGiu: 0,
    })
    expect(flags.ban_som_khi_lo_nhe).toBe(true)
    expect(flags.cham_SL_khong_cat).toBe(false)
    expect(flags.cham_SL_cat_dung_phien_ke).toBe(false)
  })

  it("a loss deeper than −2% that hasn't touched cắt lỗ is NOT bán sớm (spec's own >−2% boundary)", () => {
    const flags = computeKetsoFlagsCap2({
      entryPrice: 60_000,
      exitPrice: 58_500, // -2.5%, still above catLo=58,000
      catLo: 58_000,
      soPhienGiu: 0,
    })
    expect(flags.ban_som_khi_lo_nhe).toBe(false)
  })

  it("a profitable exit sets no vi phạm flags at all", () => {
    const flags = computeKetsoFlagsCap2({
      entryPrice: 60_000,
      exitPrice: 65_000,
      catLo: 58_000,
      soPhienGiu: 2,
    })
    expect(flags.cham_SL_khong_cat).toBe(false)
    expect(flags.cham_SL_cat_dung_phien_ke).toBe(false)
    expect(flags.ban_som_khi_lo_nhe).toBe(false)
    expect(flags.cham_TP_giu_lam_hut).toBe(false)
    expect(flags.nhoi_lenh_khi_lo).toBe(false)
  })

  it("cham_TP_giu_lam_hut and nhoi_lenh_khi_lo are always false (documented client-side gap — need intraday/multi-order history this component doesn't have)", () => {
    const flags = computeKetsoFlagsCap2({
      entryPrice: 60_000,
      exitPrice: 65_500,
      catLo: 58_000,
      soPhienGiu: 1,
    })
    expect(flags.cham_TP_giu_lam_hut).toBe(false)
    expect(flags.nhoi_lenh_khi_lo).toBe(false)
  })
})

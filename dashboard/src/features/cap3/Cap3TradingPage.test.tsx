import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "@/features/cap2/types"
import type { Cap3Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useDiemKyLuatMock,
  recordKetsoCap1Mutate,
  recordKetsoCap2Mutate,
  completeCap3TaskMutate,
  graduateCap3Mutate,
  setKhauViMutate,
  recordCap1TradeMock,
  recordCap2TradeMock,
  recordCap2ScoreMock,
  recordCap3TradeMock,
  navigateMock,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useCap3ProgressMock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Mutate: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  completeCap3TaskMutate: vi.fn(),
  graduateCap3Mutate: vi.fn(),
  setKhauViMutate: vi.fn(),
  recordCap1TradeMock: vi.fn(),
  recordCap2TradeMock: vi.fn(),
  recordCap2ScoreMock: vi.fn(),
  recordCap3TradeMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

// Terminal children are the EXISTING, untouched dashboard components — stub
// them (mirrors `cap2/Cap2TradingPage.test.tsx`). The stub fires the SAME buses
// the real `TradingPanel` fires: cap1+cap2+cap3 on a BUY, cap1+cap2 ONLY on a
// SELL (see `TradingPanel.tsx` — it never notifies the Cấp 3 bus on sell).
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
  const { onOrderFilled: cap1OnOrderFilled, isCap1Active } = useCap1Events()
  const { onOrderFilled: cap2OnOrderFilled, isCap2Active } = useCap2Events()
  const { onOrderFilled: cap3OnOrderFilled, isCap3Active } = useCap3Events()
  return (
    <div data-testid="right-sidebar">
      <span data-testid="bus-spy">{`${isCap1Active}-${isCap2Active}-${isCap3Active}`}</span>
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
        }}
      >
        fire buy
      </button>
      <button
        data-testid="fire-buy-no-quanlyvon"
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
        }}
      >
        fire buy without quản lý vốn
      </button>
      <button
        data-testid="fire-sell"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 300,
            price: 65_500,
            orderId: "sell-1",
          })
          cap2OnOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 300,
            price: 65_500,
            orderId: "sell-1",
          })
        }}
      >
        fire sell
      </button>
      <button
        data-testid="fire-sell-hpg"
        onClick={() => {
          cap1OnOrderFilled?.({
            symbol: "HPG",
            side: "sell",
            quantity: 100,
            price: 31_000,
            orderId: "sell-2",
          })
          cap2OnOrderFilled?.({
            symbol: "HPG",
            side: "sell",
            quantity: 100,
            price: 31_000,
            orderId: "sell-2",
          })
        }}
      >
        fire sell HPG
      </button>
    </div>
  )
}

// ★★ Header/MarketBar stubs EXPOSE the escape-hatch props: the real
// `SymbolSearch`/`MarketBar` fall back to `navigate('/co-phieu/:sym')` when
// they are not given a handler, which is exactly the bug this file guards.
vi.mock("@/features/navigation", () => ({
  TrialBanner: () => <div data-testid="trial-banner" />,
  Header: ({ onSymbolSelect }: { onSymbolSelect?: (s: string) => void }) => (
    <button data-testid="header" onClick={() => onSymbolSelect?.("ACB")}>
      header
    </button>
  ),
  MarketBar: ({ onSymbolClick }: { onSymbolClick?: (s: string) => void }) => (
    <button data-testid="market-bar" onClick={() => onSymbolClick?.("HPG")}>
      market-bar
    </button>
  ),
  Footer: () => <div data-testid="footer" />,
}))

// `AiInsightSymbolModal` loads the briefing with `lazy()` — stub the chunk so
// the test can PROVE the reading actually renders inside the shell (a name
// change or a chunk-load failure must not pass as "didn't navigate").
vi.mock("@/features/stock/ai-insight", () => ({
  AiInsightBriefing: ({ symbol }: { symbol: string }) => (
    <div data-testid="ai-briefing">{symbol}</div>
  ),
}))

// `AiInsightSymbolModal` bọc briefing trong `PremiumGate` (endpoint là
// premium-only) — cho user premium ở bài này để đo đúng thứ đang canh: bản đọc
// dựng trong shell chứ không phải một trang khác.
vi.mock("@/features/premium/hooks", () => ({
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))

vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: "u1" },
    setShowAuthModal: () => {},
    setAuthModalTab: () => {},
  }),
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

// Cấp 3's own hooks + trade log.
vi.mock("./hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useCompleteCap3Task: () => ({ mutate: completeCap3TaskMutate }),
  useGraduateCap3: () => ({ mutate: graduateCap3Mutate, isPending: false }),
  useSetKhauVi: () => ({ mutate: setKhauViMutate, isPending: false }),
  useThachThuc: () => ({ data: undefined }),
  // Needed because this page reuses `computeKetsoFlagsCap2` from
  // `cap2/Cap2TradingPage`, whose module also pulls in `GraduationModalCap2`
  // (which now enters Cấp 3).
  useEnterCap3: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("./tradeLogCap3", () => ({
  useCap3TradeLog: () => ({ trades: [], record: recordCap3TradeMock }),
}))
// `GraduationModalCap3` (mounted below) now really enters Cấp 4 on success.
vi.mock("@/features/cap4/hooks", () => ({
  useEnterCap4: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { Cap3TradingPage } from "./Cap3TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "@/features/cap2/Cap2Context"
import { useCap3Events } from "./Cap3Context"

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
    so_lenh_thuc_chien: 30,
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

function fakeDiemKyLuat(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-01-21",
    co_giao_dich: false,
    co_tinh_huong: false,
    diem: null,
    xep_loai: null,
    giai_thich: "Ngày không đặt lệnh nào.",
    thanh_phan: null,
    ...overrides,
  }
}

function renderCap3(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

describe("Cap3TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress() })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: fakeDiemKyLuat(), isLoading: false })
    recordKetsoCap1Mutate.mockReset()
    recordKetsoCap2Mutate.mockReset()
    completeCap3TaskMutate.mockReset()
    graduateCap3Mutate.mockReset()
    setKhauViMutate.mockReset()
    recordCap1TradeMock.mockReset()
    recordCap2TradeMock.mockReset()
    recordCap2ScoreMock.mockReset()
    recordCap3TradeMock.mockReset()
    navigateMock.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as Cap1TradingPage/Cap2TradingPage", () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 3 · BẢN LĨNH" label and the THỰC CHIẾN mode badge', () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.getByText("CẤP 3 · BẢN LĨNH")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("keeps the Cấp 1 + Cấp 2 + Cấp 3 buses ALL active (cộng dồn)", () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.getByTestId("bus-spy")).toHaveTextContent("true-true-true")
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap3TradingPage />
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

  it("mounts the MANDATORY KhauViModal on first entry (khẩu vị chưa đặt)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderCap3(<Cap3TradingPage />)
    expect(screen.getByText("Chọn khẩu vị rủi ro")).toBeInTheDocument()
  })

  it("does NOT show the KhauViModal once khẩu vị đã đặt", () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.queryByText("Chọn khẩu vị rủi ro")).not.toBeInTheDocument()
  })

  it("a BUY then SELL on the same symbol opens Kết sổ Cấp 3 with the quản lý vốn block", () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-buy"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    // Cấp 1 + Cấp 2 content still there (cộng dồn) …
    expect(screen.getByText("💰 Dòng tiền")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58,000")
    // … plus Cấp 3's own khối Quản lý vốn, fed from the BUY-time event.
    const quanLyVon = screen.getByTestId("cap3-ketso-quanlyvon")
    expect(quanLyVon).toHaveTextContent("Cân bằng")
    expect(quanLyVon).toHaveTextContent("300")
  })

  it("a SELL with no tracked BUY does not open Kết sổ", () => {
    renderCap3(<Cap3TradingPage />)
    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  it("a BUY whose quản lý vốn never resolved does not open Kết sổ Cấp 3 (hard gate upstream)", () => {
    renderCap3(<Cap3TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-no-quanlyvon"))
    fireEvent.click(screen.getByTestId("fire-sell-hpg"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
  })

  // NOTE: the Cấp 3 write is owned by `KetsoModalCap3` itself (documented in
  // that module: "Modal ĐÃ tự ghi vào nhật ký Cấp 3"), so the page must NOT
  // record it a second time — hence exactly 1 call, with the full quản lý vốn
  // payload khối ⑦/⑧ need.
  it("closing Kết sổ records the closed trade into the Cấp 1, Cấp 2 AND Cấp 3 trade logs", () => {
    renderCap3(<Cap3TradingPage />)
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
    expect(recordCap3TradeMock).toHaveBeenCalledTimes(1)
    const rec = recordCap3TradeMock.mock.calls[0][0]
    expect(rec.orderId).toBe("sell-1")
    expect(rec.mucTuTin).toBe(3)
    expect(rec.cachKhoiLuong).toBe("linh_hoat")
    expect(rec.khoiLuong).toBe(300)
    expect(rec.pctVon).toBe(18)
  })

  it("records today's điểm kỷ luật into the shared score log once a real score resolves", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 88, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap3(<Cap3TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({
      ngay: "2026-01-21",
      diem: 88,
      xepLoai: "xanh",
    })
  })

  it("mounts GraduationModalCap3 (hidden until 3/3 nhiệm vụ)", () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        so_lenh_cap3: 16,
        lai_pct_cap3: 6.4,
        diem_ky_luat_tb_cap3: 84,
      }),
    })
    renderCap3(<Cap3TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
  })

  /**
   * ★★ BA LỐI THOÁT của Cấp 3 — cấp shell DUY NHẤT từng bị bỏ sót khi trần cấp
   * lên 3. Kịch bản thật: user đang điền khối Quản lý vốn (khẩu vị + tự tin +
   * khối lượng) rồi gõ một mã vào ô tìm kiếm trên Header → bị ném sang
   * `/co-phieu/:sym`, mất trắng form + tab Hành trình + badge cấp, không có nút
   * quay lại.
   */
  it("★★ gõ mã ở ô tìm kiếm trên Header đổi mã TẠI CHỖ — không rời shell Cấp 3", () => {
    renderCap3(<Cap3TradingPage />)
    fireEvent.click(screen.getByTestId("header"))
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByText("CẤP 3 · BẢN LĨNH")).toBeInTheDocument()
  })

  it("★★ bấm cụm giá trên MarketBar đổi mã TẠI CHỖ — không rời shell Cấp 3", () => {
    renderCap3(<Cap3TradingPage />)
    fireEvent.click(screen.getByTestId("market-bar"))
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByText("CẤP 3 · BẢN LĨNH")).toBeInTheDocument()
  })

  it('★★ "AI Phân tích" → nhập mã → bản đọc AI dựng NGAY TRONG shell Cấp 3, KHÔNG điều hướng', async () => {
    renderCap3(<Cap3TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))

    // Không chỉ "không navigate": briefing phải THẬT SỰ hiện ra trong shell.
    await waitFor(() => expect(screen.getByTestId("ai-briefing")).toHaveTextContent("VCB"))
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByText("CẤP 3 · BẢN LĨNH")).toBeInTheDocument()
  })
})

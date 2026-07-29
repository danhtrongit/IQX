import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  recordKetsoMutate,
  graduateMutate,
  navigateMock,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  recordKetsoMutate: vi.fn(),
  graduateMutate: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

// Terminal children (CenterPanel/RightSidebar/RightToolbar) are the EXISTING,
// untouched dashboard components — stub them (mirrors
// `Cap0TradingPage.test.tsx`). `RightSidebar`'s stub exposes buttons wired to
// the REAL Cap1 event bus's `onOrderFilled` so tests can simulate a BUY→SELL
// round trip without the real trading terminal.
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
  const { onOrderFilled } = useCap1Events()
  return (
    <div data-testid="right-sidebar">
      <button
        data-testid="fire-buy"
        onClick={() =>
          onOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 100,
            price: 60_000,
            orderId: "buy-1",
            lyDo: "dong_tien",
            trangThaiLucDat: "ung_ho",
            vungMua: 60_000,
          })
        }
      >
        fire buy
      </button>
      <button
        data-testid="fire-sell"
        onClick={() =>
          onOrderFilled?.({
            symbol: "VNM",
            side: "sell",
            quantity: 100,
            price: 65_000,
            orderId: "sell-1",
          })
        }
      >
        fire sell
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

// FE3/FE1/FE2 hooks — mocked so this test controls progress state without a
// real QueryClient/API. Shared by `Cap1Terminal` (progress), `GraduationModalCap1`
// (progress + graduate) and `KetsoModalCap1` (record ketso).
vi.mock("./hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useGraduateCap1: () => ({ mutate: graduateMutate, isPending: false }),
  useRecordKetso: () => ({ mutate: recordKetsoMutate, isPending: false }),
}))

// Cấp 2 is live (Task FE4) — `GraduationModalCap1` now fires `useEnterCap2`
// on success. Mocked here (this file only exercises Cấp 1's own page wiring,
// not Cấp 2's entry) with no real QueryClient in this render tree.
vi.mock("@/features/cap2/hooks", () => ({
  useEnterCap2: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { Cap1TradingPage } from "./Cap1TradingPage"
import { useCap1Events } from "./Cap1Context"

function fakeProgress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
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

function renderCap1(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

describe("Cap1TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeProgress() })
    recordKetsoMutate.mockReset()
    graduateMutate.mockReset()
    navigateMock.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    renderCap1(<Cap1TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as DashboardPage (TrialBanner/Header/MarketBar/Footer)", () => {
    renderCap1(<Cap1TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 1 · HỌC VIỆC" label and the THỰC CHIẾN mode badge', () => {
    renderCap1(<Cap1TradingPage />)
    expect(screen.getByText("CẤP 1 · HỌC VIỆC")).toBeInTheDocument()
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
          <Cap1TradingPage />
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

  it('a BUY then SELL fill on the same symbol opens Kết sổ Cấp 1 (reconciled against the buy-time kế hoạch)', () => {
    renderCap1(<Cap1TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-buy"))
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("fire-sell"))
    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    // Reconciled against the tracked buy (kế hoạch's lý do label).
    expect(screen.getByText("💰 Dòng tiền")).toBeInTheDocument()
  })

  it('closing Kết sổ calls useRecordKetso().mutate for the SELL order id', () => {
    renderCap1(<Cap1TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))
    fireEvent.click(screen.getByTestId("fire-sell"))
    fireEvent.click(screen.getByText("Đóng kết sổ ✓"))
    expect(recordKetsoMutate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "sell-1" }),
    )
  })

  it("mounts GraduationModalCap1 (hidden until 6/6 nhiệm vụ)", () => {
    renderCap1(<Cap1TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap1ProgressMock.mockReturnValue({
      data: fakeProgress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        task_4_done_at: "t",
        task_5_done_at: "t",
        task_6_done_at: "t",
        so_lenh_thuc_chien: 10,
      }),
    })
    renderCap1(<Cap1TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting a valid symbol navigates', () => {
    renderCap1(<Cap1TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VCB")
  })
})

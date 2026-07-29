import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React, { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cấp 1 wiring inside `TradingPanel`/`OrderEntry` (Task FE1):
 *  - `isCap1Active` hides the Cấp 0 5-chip block and renders `PlanFormCap1` +
 *    `AiThanhTra` instead.
 *  - Cổng cứng (spec §4): MUA disabled until (lý do chosen) AND (vùng mua > 0).
 *  - On a successful BUY fill → `useRecordKehoach().mutate` with the AI Thanh
 *    tra verdict captured at pick time.
 *  - Sổ lệnh bid/ask stays hidden inside Cấp 1 (spec §0).
 *
 * `@/features/cap1`'s hooks + `PlanFormCap1`/`AiThanhTra` are mocked here
 * (lightweight fakes) so this file only exercises `TradingPanel`'s OWN
 * wiring — `PlanFormCap1`/`AiThanhTra`'s internals are covered by their own
 * unit tests. `isKehoachValid`/`verdictToTrangThai` are the REAL
 * implementations (via `importOriginal`) since `TradingPanel` calls them
 * directly.
 */

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: vi.fn() }),
}))

const priceData = {
  symbol: "VNM",
  exchange: "HOSE",
  closePrice: 62.4,
  referencePrice: 61.8,
  ceilingPrice: 67.9,
  floorPrice: 59.3,
  priceChange: 0.6,
  percentChange: 0.97,
  totalVolume: 1,
  totalValue: 1,
  foreignBuy: 0,
  foreignSell: 0,
  bid: [{ price: 61.8, volume: 100 }],
  ask: [{ price: 62.4, volume: 200 }],
}
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: priceData, isLoading: false }),
}))

const placeOrderMock = vi.fn(() =>
  Promise.resolve({
    id: "order-1",
    symbol: "VNM",
    side: "BUY",
    quantity: 100,
    price: 62_400,
    total: 6_240_000,
    status: "FILLED",
  }),
)
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: placeOrderMock, isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }) }))
vi.mock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: true, isLoading: false }) }))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

// `@/features/cap0` stays REAL (unmocked) — no `Cap0Provider` wraps these
// tests, so `useCap0Events()` naturally returns the no-op bus
// (`isCap0Active: false`) and the C0 chip block never renders regardless.
// Still needs the ky client mocked (cap0's hooks import it).
const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))

const recordKehoachMock = vi.fn()
const onLyDoPickedMock = vi.fn()
const onOrderFilledMock = vi.fn()
const onDocChiTietClickedMock = vi.fn()
let isCap1ActiveFlag = true

vi.mock("@/features/cap1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap1")>()
  return {
    ...actual,
    useCap1Events: () => ({
      isCap1Active: isCap1ActiveFlag,
      onLyDoPicked: onLyDoPickedMock,
      onOrderFilled: onOrderFilledMock,
      onDocChiTietClicked: onDocChiTietClickedMock,
      registerHandlers: vi.fn(),
    }),
    useRecordKehoach: () => ({ mutate: recordKehoachMock, isPending: false }),
    PlanFormCap1: (props: {
      lyDo: string | null
      onLyDoChange: (l: string) => void
      vungMua: number | null
      onVungMuaChange: (v: number | null) => void
    }) => (
      <div data-testid="plan-form-cap1-mock">
        <button type="button" onClick={() => props.onLyDoChange("dong_tien")}>
          PICK_LY_DO
        </button>
        <input
          aria-label="vung-mua-mock"
          value={props.vungMua ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value)
            props.onVungMuaChange(e.target.value === "" || Number.isNaN(n) ? null : n)
          }}
        />
      </div>
    ),
    AiThanhTra: (props: {
      lyDo: string
      onVerdict?: (v: string, snapshot: Record<string, unknown>) => void
    }) => {
      useEffect(() => {
        props.onVerdict?.("ung_ho", { mock: true, lyDo: props.lyDo })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <div data-testid="ai-thanh-tra-mock">{`AiThanhTra:${props.lyDo}`}</div>
    },
  }
})

import { TradingPanel } from "./TradingPanel"

/** Arco's `Button` renders its label in an inner `<span>` — the `disabled`
 *  attribute lives on the outer `<button>`, which jest-dom's `toBeDisabled`
 *  needs directly (it doesn't climb to a disabled ANCESTOR button). */
function submitButton(): HTMLElement {
  return screen.getByText("ĐẶT LỆNH MUA").closest("button") as HTMLElement
}

function renderPanel() {
  get.mockReturnValue({ json: () => Promise.resolve(null) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TradingPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  placeOrderMock.mockClear()
  recordKehoachMock.mockClear()
  onLyDoPickedMock.mockClear()
  onOrderFilledMock.mockClear()
  onDocChiTietClickedMock.mockClear()
  isCap1ActiveFlag = true
})

describe("TradingPanel — Cấp 1 wiring (Task FE1)", () => {
  it("renders PlanFormCap1 (not the Cấp 0 chips) and hides sổ lệnh bid/ask when isCap1Active", () => {
    renderPanel()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.queryByText("KẾ HOẠCH")).not.toBeInTheDocument()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  it("does NOT render PlanFormCap1/AiThanhTra when isCap1Active is false (normal trading unaffected)", () => {
    isCap1ActiveFlag = false
    renderPanel()
    expect(screen.queryByTestId("plan-form-cap1-mock")).not.toBeInTheDocument()
    expect(submitButton()).not.toBeDisabled()
  })

  it("cổng cứng: MUA is disabled until a lý do is picked (vùng mua already defaults to giá hiện tại)", () => {
    renderPanel()
    expect(submitButton()).toBeDisabled()

    fireEvent.click(screen.getByText("PICK_LY_DO"))
    expect(onLyDoPickedMock).toHaveBeenCalledWith("dong_tien")
    expect(submitButton()).not.toBeDisabled()
  })

  it("cổng cứng: MUA re-disables if vùng mua is cleared after a lý do is picked", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    expect(submitButton()).not.toBeDisabled()

    fireEvent.change(screen.getByLabelText("vung-mua-mock"), { target: { value: "" } })
    expect(submitButton()).toBeDisabled()
  })

  it("clicking MUA while gated does not place an order", () => {
    renderPanel()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("on a successful BUY fill, records the Form Kế hoạch via useRecordKehoach with the AI Thanh tra verdict captured at pick time", async () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    await waitFor(() => expect(screen.getByTestId("ai-thanh-tra-mock")).toBeInTheDocument())

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(recordKehoachMock).toHaveBeenCalledWith({
        order_id: "order-1",
        lyDo: "dong_tien",
        trangThai_luc_dat: "ung_ho",
        vung_mua: 62_400,
        co_bam_doc_chi_tiet: false,
        snapshot: { mock: true, lyDo: "dong_tien" },
      }),
    )
    expect(onOrderFilledMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", lyDo: "dong_tien", trangThaiLucDat: "ung_ho" }),
    )
  })

  it("on a successful SELL fill, notifies the Cấp 1 event bus WITHOUT lý do/vùng mua (Task FE3 — Kết sổ Cấp 1 wiring)", async () => {
    placeOrderMock.mockResolvedValueOnce({
      id: "order-2",
      symbol: "VNM",
      side: "SELL",
      quantity: 100,
      price: 65_000,
      total: 6_500_000,
      status: "FILLED",
    })
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(onOrderFilledMock).toHaveBeenCalledWith({
        symbol: "VNM",
        side: "sell",
        quantity: 100,
        price: 65_000,
        orderId: "order-2",
      }),
    )
    // A SELL never records a Form Kế hoạch (that's a BUY-only concept).
    expect(recordKehoachMock).not.toHaveBeenCalled()
  })
})

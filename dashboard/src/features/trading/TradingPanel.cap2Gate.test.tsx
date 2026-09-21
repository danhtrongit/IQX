import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cấp 2 wiring inside `TradingPanel`/`OrderEntry` (Task FE1):
 *  - Cấp 1's Form Kế hoạch (lý do + vùng mua + AI Thanh tra) stays 100%
 *    intact; `SlTpBlock` is inserted after Vùng mua.
 *  - Cổng cứng (spec §5.4): MUA disabled unless (Cấp 1's lý do + vùng mua
 *    valid) AND (a SL/TP cách is chosen) — both gates, not either/or.
 *  - On a successful BUY fill → Cấp 1's `/cap1/kehoach` is awaited FIRST,
 *    then Cấp 2's `/cap2/kehoach` with {order_id, phuong_phap_sl_tp, cat_lo,
 *    chot_loi}.
 *  - Sổ lệnh bid/ask is ALWAYS visible inside Cấp 2 (spec §C9), even though
 *    Cấp 1 alone (`isCap1Active`) hides it unconditionally.
 *
 * `@/features/cap1` and `@/features/cap2`'s hooks + components are mocked
 * here (lightweight fakes) so this file only exercises `TradingPanel`'s OWN
 * wiring — `PlanFormCap1`/`AiThanhTra`/`SlTpBlock`'s internals are covered by
 * their own unit tests. `isKehoachValid`/`verdictToTrangThai`/`isSlTpValid`
 * are the REAL implementations (via `importOriginal`) since `TradingPanel`
 * calls them directly.
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
// (`isCap0Active: false`). Still needs the ky client mocked (cap0's hooks
// import it).
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
const recordKehoachAsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "kh1" }))
let isCap1ActiveFlag = true

vi.mock("@/features/cap1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap1")>()
  return {
    ...actual,
    useCap1Events: () => ({
      isCap1Active: isCap1ActiveFlag,
      onLyDoPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      onDocChiTietClicked: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    // Return the explicit "not viewed" value during Cấp 2. TradingPanel must
    // ignore it because the tour is a Cấp 1-only gate.
    useCap1Progress: () => ({ data: { da_xem_tour: isCap2ActiveFlag ? false : true } }),
    useRecordKehoach: () => ({
      mutate: recordKehoachMock,
      mutateAsync: recordKehoachAsyncMock,
      isPending: false,
    }),
    PlanFormCap1: (props: {
      lyDo: string | null
      onLyDoChange: (l: string) => void
      vungMua: number | null
      onVungMuaChange: (v: number | null) => void
      sauLyDo?: React.ReactNode
      truocLyDo?: React.ReactNode
    }) => (
      <div data-testid="plan-form-cap1-mock">
        {props.truocLyDo}
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
        {props.sauLyDo}
      </div>
    ),
    AiThanhTra: () => <div data-testid="ai-thanh-tra-mock" />,
  }
})

const recordKehoachCap2Mock = vi.fn()
const recordKehoachCap2AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc2-1" }))
const onSlTpPickedMock = vi.fn()
const onOrderFilledCap2Mock = vi.fn()
const checkPreBuyAlertMock = vi.fn()
const actOnAlertMock = vi.fn()
const consumeSellIntentMock = vi.fn()
let isCap2ActiveFlag = true
let sellIntent: { symbol: string; method: "market" } | null = null

vi.mock("@/features/cap2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap2")>()
  return {
    ...actual,
    useCap2Events: () => ({
      isCap2Active: isCap2ActiveFlag,
      onSlTpPicked: onSlTpPickedMock,
      onOrderFilled: onOrderFilledCap2Mock,
      registerHandlers: vi.fn(),
      sellIntent,
      prepareSellIntent: vi.fn(),
      consumeSellIntent: consumeSellIntentMock,
    }),
    useRecordKehoachCap2: () => ({
      mutate: recordKehoachCap2Mock,
      mutateAsync: recordKehoachCap2AsyncMock,
      isPending: false,
    }),
    useCheckCap2PreBuyAlert: () => ({
      mutateAsync: checkPreBuyAlertMock,
      isPending: false,
    }),
    useActOnCap2Alert: () => ({
      mutateAsync: actOnAlertMock,
      isPending: false,
    }),
    SlTpBlock: (props: {
      selected: string | null
      onSelect: (m: string, catLo: number, chotLoi: number) => void
    }) => (
      <div data-testid="sltp-block-mock">
        <button type="button" onClick={() => props.onSelect("ho_tro_khang_cu", 60_400, 65_800)}>
          PICK_SLTP
        </button>
        <span>{`selected:${props.selected ?? "none"}`}</span>
      </div>
    ),
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
  recordKehoachAsyncMock.mockClear()
  recordKehoachCap2Mock.mockClear()
  recordKehoachCap2AsyncMock.mockClear()
  onSlTpPickedMock.mockClear()
  onOrderFilledCap2Mock.mockClear()
  checkPreBuyAlertMock.mockReset()
  checkPreBuyAlertMock.mockResolvedValue({
    data_status: "available",
    triggered: false,
    reason: "no_open_position",
    alert: null,
  })
  actOnAlertMock.mockReset()
  actOnAlertMock.mockResolvedValue({ next_step: "none" })
  consumeSellIntentMock.mockReset()
  sellIntent = null
  isCap1ActiveFlag = true
  isCap2ActiveFlag = true
})

describe("TradingPanel — Cấp 2 wiring (Task FE1)", () => {
  it("renders PlanFormCap1 (Cấp 1's form kept 100% intact) AND SlTpBlock when isCap2Active", () => {
    renderPanel()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
  })

  it("does NOT render SlTpBlock when isCap2Active is false (Cấp 1-only unaffected)", () => {
    isCap2ActiveFlag = false
    renderPanel()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.queryByTestId("sltp-block-mock")).not.toBeInTheDocument()
    // Cấp 1's own gate alone still governs — lý do not picked yet → disabled.
    expect(submitButton()).toBeDisabled()
  })

  it("consumes a stop-alert sell intent and opens the form on BÁN with market method", async () => {
    sellIntent = { symbol: "VNM", method: "market" }
    renderPanel()
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "BÁN" })).toHaveAttribute("aria-selected", "true"),
    )
    expect(consumeSellIntentMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText("MP — Thị trường")).toBeInTheDocument()
  })

  it("cổng cứng: MUA stays disabled after picking lý do alone (SL/TP cách not chosen yet)", () => {
    renderPanel()
    expect(submitButton()).toBeDisabled()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    expect(submitButton()).toBeDisabled()
  })

  it("cổng cứng: MUA stays disabled after picking a SL/TP cách alone (lý do not chosen yet)", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    expect(onSlTpPickedMock).toHaveBeenCalledWith("ho_tro_khang_cu", 60_400, 65_800)
    expect(submitButton()).toBeDisabled()
  })

  it("cổng cứng: MUA enables only once BOTH lý do+vùng mua AND a SL/TP cách are set", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    expect(submitButton()).toBeDisabled()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    expect(submitButton()).not.toBeDisabled()
    expect(screen.queryByTestId("cap1-tour-gate")).not.toBeInTheDocument()
  })

  it("clicking MUA while only the SL/TP gate is missing does not place an order", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("on a successful BUY fill, posts Cấp 1's kehoach FIRST (awaited) then Cấp 2's kehoach with order_id/method/cat_lo/chot_loi", async () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    expect(submitButton()).not.toBeDisabled()

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() =>
      expect(checkPreBuyAlertMock).toHaveBeenCalledWith({
        symbol: "VNM",
        idempotency_key: expect.any(String),
        quantity: 100,
        order_type: "market",
        limit_price_vnd: null,
      }),
    )
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    // Cấp 1's kehoach is AWAITED (mutateAsync), not fire-and-forget, so the
    // BE row exists before Cấp 2's kehoach POST (which 404s otherwise).
    await waitFor(() =>
      expect(recordKehoachAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: "order-1", lyDo: "dong_tien" }),
      ),
    )
    await waitFor(() =>
      expect(recordKehoachCap2AsyncMock).toHaveBeenCalledWith({
        order_id: "order-1",
        phuong_phap_sl_tp: "ho_tro_khang_cu",
        cat_lo: 60_400,
        chot_loi: 65_800,
      }),
    )
    // Cấp 1's own fire-and-forget `mutate` is NOT used inside Cấp 2 (the
    // awaited `mutateAsync` path replaces it).
    expect(recordKehoachMock).not.toHaveBeenCalled()
    expect(onOrderFilledCap2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        phuongPhapSlTp: "ho_tro_khang_cu",
        catLo: 60_400,
        chotLoi: 65_800,
      }),
    )
  })

  it("checks nhồi lệnh before the BUY and cancel_buy never places the order", async () => {
    checkPreBuyAlertMock.mockResolvedValue({
      data_status: "available",
      triggered: true,
      reason: "averaging_down",
      alert: {
        id: "alert-buy-1",
        alert_type: "nhoi_lenh",
        symbol: "VNM",
        session_date: "2026-09-15",
        observed_price_vnd: 59_400,
        threshold_price_vnd: 59_300,
        loss_pct: -4.8,
        official_close_session_date: null,
        breach_session_no: 1,
        status: "shown",
        suppression_reason: null,
        escalation: "normal",
        impression_count: 1,
        first_shown_at: null,
        last_shown_at: null,
        action: null,
        acted_at: null,
        priority: "immediate",
        plan_started_at: "2026-09-10T02:00:00Z",
        position_quantity: 100,
        position_avg_cost_vnd: 62_400,
      },
    })
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    expect(await screen.findByTestId("cap2-alert-nhoilenh")).toBeInTheDocument()
    expect(placeOrderMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId("cap2-nhoilenh-cancel"))
    await waitFor(() =>
      expect(actOnAlertMock).toHaveBeenCalledWith({
        alertId: "alert-buy-1",
        action: "cancel_buy",
      }),
    )
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("does not render a suppressed alert, but records proceed_buy to re-enable its type", async () => {
    checkPreBuyAlertMock.mockResolvedValue({
      data_status: "available",
      triggered: true,
      reason: "auto_muted_clean_10",
      alert: {
        id: "alert-muted-1",
        alert_type: "nhoi_lenh",
        symbol: "VNM",
        session_date: "2026-09-15",
        observed_price_vnd: 59_400,
        threshold_price_vnd: 59_300,
        loss_pct: -4.8,
        official_close_session_date: null,
        breach_session_no: 1,
        status: "suppressed",
        suppression_reason: "auto_mute_last_10_clean",
        escalation: null,
        impression_count: 0,
        first_shown_at: null,
        last_shown_at: null,
        action: null,
        acted_at: null,
        priority: "immediate",
        position_quantity: 100,
        position_avg_cost_vnd: 62_400,
        plan_started_at: "2026-09-10T02:00:00Z",
      },
    })
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() =>
      expect(actOnAlertMock).toHaveBeenCalledWith({
        alertId: "alert-muted-1",
        action: "proceed_buy",
      }),
    )
    expect(screen.queryByTestId("cap2-alert-nhoilenh")).not.toBeInTheDocument()
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyPlan: expect.objectContaining({ nhoi_lenh_alert_id: "alert-muted-1" }),
      }),
    )
  })

  it("does not count a session-limit suppression as an ignored alert", async () => {
    checkPreBuyAlertMock.mockResolvedValue({
      data_status: "available",
      triggered: true,
      reason: "session_limit",
      alert: {
        id: "alert-quota-1",
        alert_type: "nhoi_lenh",
        symbol: "VNM",
        session_date: "2026-09-15",
        observed_price_vnd: 59_400,
        threshold_price_vnd: 59_300,
        loss_pct: -4.8,
        official_close_session_date: null,
        breach_session_no: 1,
        status: "suppressed",
        suppression_reason: "session_limit",
        escalation: null,
        impression_count: 0,
        first_shown_at: null,
        last_shown_at: null,
        action: null,
        acted_at: null,
        priority: "immediate",
        position_quantity: 100,
        position_avg_cost_vnd: 62_400,
        plan_started_at: "2026-09-10T02:00:00Z",
      },
    })
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(actOnAlertMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId("cap2-alert-nhoilenh")).not.toBeInTheDocument()
  })

  it("proceed_buy records the alert action then resumes the same BUY without a second preflight", async () => {
    checkPreBuyAlertMock.mockResolvedValueOnce({
      data_status: "available",
      triggered: true,
      reason: "averaging_down",
      alert: {
        id: "alert-buy-2",
        alert_type: "nhoi_lenh",
        symbol: "VNM",
        session_date: "2026-09-15",
        observed_price_vnd: 59_400,
        threshold_price_vnd: 59_300,
        loss_pct: -4.8,
        official_close_session_date: null,
        breach_session_no: 1,
        status: "shown",
        suppression_reason: null,
        escalation: "normal",
        impression_count: 1,
        first_shown_at: null,
        last_shown_at: null,
        action: null,
        acted_at: null,
        priority: "immediate",
        position_quantity: 100,
        position_avg_cost_vnd: 62_400,
        plan_started_at: "2026-09-10T02:00:00Z",
      },
    })
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await screen.findByTestId("cap2-alert-nhoilenh")
    fireEvent.click(screen.getByTestId("cap2-nhoilenh-confirm"))

    await waitFor(() =>
      expect(actOnAlertMock).toHaveBeenCalledWith({
        alertId: "alert-buy-2",
        action: "proceed_buy",
      }),
    )
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(checkPreBuyAlertMock).toHaveBeenCalledTimes(1)
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyPlan: expect.objectContaining({ nhoi_lenh_alert_id: "alert-buy-2" }),
      }),
    )
  })

  it("coalesces rapid double-submit into one idempotent pre-buy check and one BUY", async () => {
    let resolveCheck!: (value: unknown) => void
    checkPreBuyAlertMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    expect(checkPreBuyAlertMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCheck({
        data_status: "available",
        triggered: false,
        reason: "no_open_position",
        alert: null,
      })
    })
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
  })

  it("rechecks when quantity changes while a nhồi-lệnh warning is open", async () => {
    const alert = {
      id: "alert-buy-draft",
      alert_type: "nhoi_lenh",
      symbol: "VNM",
      session_date: "2026-09-15",
      observed_price_vnd: 59_400,
      threshold_price_vnd: 59_300,
      loss_pct: -4.8,
      official_close_session_date: null,
      breach_session_no: 1,
      status: "shown",
      suppression_reason: null,
      escalation: "normal",
      impression_count: 1,
      first_shown_at: null,
      last_shown_at: null,
      action: null,
      acted_at: null,
      priority: "immediate",
      position_quantity: 100,
      position_avg_cost_vnd: 62_400,
      plan_started_at: "2026-09-10T02:00:00Z",
    }
    checkPreBuyAlertMock
      .mockResolvedValueOnce({
        data_status: "available",
        triggered: true,
        reason: "averaging_down",
        alert,
      })
      .mockResolvedValueOnce({
        data_status: "available",
        triggered: false,
        reason: "quota_reached",
        alert: null,
      })
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await screen.findByTestId("cap2-alert-nhoilenh")

    // The warning reflects 100 CP. Changing to 25% creates a different draft,
    // so accepting the old warning cannot bypass a fresh authoritative check.
    fireEvent.click(screen.getByText("25%"))
    fireEvent.click(screen.getByTestId("cap2-nhoilenh-confirm"))
    await waitFor(() => expect(checkPreBuyAlertMock).toHaveBeenCalledTimes(2))
    expect(checkPreBuyAlertMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        symbol: "VNM",
        order_type: "market",
        limit_price_vnd: null,
      }),
    )
    expect(checkPreBuyAlertMock.mock.calls[1]?.[0]?.quantity).not.toBe(100)
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyPlan: expect.not.objectContaining({ nhoi_lenh_alert_id: "alert-buy-draft" }),
      }),
    )
  })

  it("outside Cấp 2 (isCap2Active false), a Cấp 1 BUY fill still uses the fire-and-forget recordKehoach.mutate (no regression)", async () => {
    isCap2ActiveFlag = false
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    expect(submitButton()).not.toBeDisabled()

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(recordKehoachMock).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: "order-1", lyDo: "dong_tien" }),
      ),
    )
    expect(recordKehoachCap2AsyncMock).not.toHaveBeenCalled()
  })

  it("retired bid/ask order book stays absent when isCap2Active", () => {
    renderPanel()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })

  it("sổ lệnh bid/ask stays hidden when isCap2Active is false (Cấp 1-only behaviour unchanged)", () => {
    isCap2ActiveFlag = false
    renderPanel()
    expect(screen.queryByText(/Spread:/)).not.toBeInTheDocument()
  })
})

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cấp 4 wiring inside `TradingPanel`/`OrderEntry` (Task FE1):
 *  - Cấp 1's lý-do FIELD + `AiThanhTra` are HIDDEN and replaced by
 *    `Doc5LopBlock`; Cấp 1's Vùng mua, Cấp 2's SL/TP and Cấp 3's Quản lý vốn
 *    all stay 100% intact.
 *  - Cổng cứng (spec §5.2): MUA stays disabled until all 5 lớp are rated —
 *    ON TOP OF Cấp 1/2/3's existing gates.
 *  - On a BUY fill → `/cap1/kehoach` (with the DERIVED lyDo) → `/cap2/kehoach`
 *    → `/cap3/kehoach` → `/cap4/kehoach`, awaited in order (they all extend
 *    ONE `order_kehoach` row).
 *  - On a SELL fill → Cấp 3 AND Cấp 4 now get their own bus event too (the
 *    known Cấp 3 gap), alongside Cấp 1/Cấp 2's existing ones.
 *
 * Feature components are mocked (lightweight fakes) so this file only
 * exercises `TradingPanel`'s OWN wiring; the pure helpers it calls
 * (`isKehoachValid`, `isSlTpValid`, `isKhoiLuongValid`, `isDoc5LopComplete`,
 * `deriveLyDoForCap1`, `countDongThuan`, `countKhacAi`) are the REAL
 * implementations via `importOriginal`.
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

let orderSide = "BUY"
const placeOrderMock = vi.fn(() =>
  Promise.resolve({
    id: "order-1",
    symbol: "VNM",
    side: orderSide,
    quantity: 100,
    price: 62_400,
    total: 6_240_000,
    status: "FILLED",
  }),
)
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [{ symbol: "VNM", quantity: 1000 }] } }),
  usePlaceOrder: () => ({ mutateAsync: placeOrderMock, isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true, setShowAuthModal: vi.fn() }),
}))
vi.mock("@/features/premium", () => ({
  usePremiumStatus: () => ({ isPremium: true, isLoading: false }),
}))
vi.mock("@/features/watchlist", () => ({
  useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }),
  useSymbolInfo: () => ({ data: undefined }),
}))
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  }
})

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

/* ── Cấp 1 ── */
const recordKehoachMock = vi.fn()
const recordKehoachAsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "kh1" }))
const onOrderFilledCap1Mock = vi.fn()
let planFormProps: { hideLyDo?: boolean } = {}

vi.mock("@/features/cap1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap1")>()
  return {
    ...actual,
    useCap1Events: () => ({
      isCap1Active: true,
      onLyDoPicked: vi.fn(),
      onOrderFilled: onOrderFilledCap1Mock,
      onDocChiTietClicked: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoach: () => ({
      mutate: recordKehoachMock,
      mutateAsync: recordKehoachAsyncMock,
      isPending: false,
    }),
    PlanFormCap1: (props: {
      hideLyDo?: boolean
      lyDo: string | null
      onLyDoChange: (l: string) => void
      vungMua: number | null
      onVungMuaChange: (v: number | null) => void
      sauLyDo?: React.ReactNode
      truocLyDo?: React.ReactNode
    }) => {
      planFormProps = { hideLyDo: props.hideLyDo }
      return (
        <div data-testid="plan-form-cap1-mock">
          {props.truocLyDo}
          {!props.hideLyDo && (
            <button type="button" onClick={() => props.onLyDoChange("dong_tien")}>
              PICK_LY_DO
            </button>
          )}
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
      )
    },
    AiThanhTra: () => <div data-testid="ai-thanh-tra-mock" />,
  }
})

/* ── Cấp 2 ── */
const recordKehoachCap2AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc2-1" }))
const onOrderFilledCap2Mock = vi.fn()

vi.mock("@/features/cap2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap2")>()
  return {
    ...actual,
    useCap2Events: () => ({
      isCap2Active: true,
      onSlTpPicked: vi.fn(),
      onOrderFilled: onOrderFilledCap2Mock,
      registerHandlers: vi.fn(),
    }),
    useRecordKehoachCap2: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap2AsyncMock,
      isPending: false,
    }),
    SlTpBlock: (props: { onSelect: (m: string, catLo: number, chotLoi: number) => void }) => (
      <div data-testid="sltp-block-mock">
        <button type="button" onClick={() => props.onSelect("ho_tro_khang_cu", 60_400, 65_800)}>
          PICK_SLTP
        </button>
      </div>
    ),
  }
})

/* ── Cấp 3 ── */
const recordKehoachCap3AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc3-1" }))
const onOrderFilledCap3Mock = vi.fn()

vi.mock("@/features/cap3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap3")>()
  return {
    ...actual,
    useCap3Events: () => ({
      isCap3Active: true,
      onKhauViPicked: vi.fn(),
      onOrderFilled: onOrderFilledCap3Mock,
      registerHandlers: vi.fn(),
    }),
    useCap3Progress: () => ({
      data: { khau_vi: "can_bang", von_ban_dau: 1_000_000_000 },
    }),
    useRecordKehoachCap3: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap3AsyncMock,
      isPending: false,
    }),
    QuanLyVonBlock: (props: {
      onMucTuTin: (m: number) => void
      onCachKhoiLuong: (c: string) => void
      onKhoiLuong: (kl: number, pct: number) => void
    }) => (
      <div data-testid="quanlyvon-mock">
        <button
          type="button"
          onClick={() => {
            props.onMucTuTin(2)
            props.onCachKhoiLuong("linh_hoat")
            props.onKhoiLuong(200, 12.5)
          }}
        >
          PICK_VON
        </button>
      </div>
    ),
    KhauViModal: () => <div data-testid="khauvi-modal-mock" />,
  }
})

/* ── Cấp 4 ── */
const recordKehoachCap4AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc4-1" }))
const onOrderFilledCap4Mock = vi.fn()
let isCap4ActiveFlag = true

const AI_5_LOP = {
  ky_thuat: "ok",
  dong_tien: "neu",
  noi_bo: "bad",
  tin_tuc: "ok",
  dinh_gia: "ok",
} as const
const LOPS = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"] as const

vi.mock("@/features/cap4", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap4")>()
  return {
    ...actual,
    useCap4Events: () => ({
      isCap4Active: isCap4ActiveFlag,
      onLopRated: vi.fn(),
      onAiRevealed: vi.fn(),
      onOrderFilled: onOrderFilledCap4Mock,
      registerHandlers: vi.fn(),
    }),
    useRecordKehoachCap4: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap4AsyncMock,
      isPending: false,
    }),
    Doc5LopBlock: (props: {
      onRate: (lop: string, n: string) => void
      onAi5Lop?: (ai: Record<string, string>) => void
    }) => (
      <div data-testid="doc5lop-mock">
        <button type="button" onClick={() => props.onRate("ky_thuat", "ok")}>
          RATE_ONE
        </button>
        <button
          type="button"
          onClick={() => {
            for (const lop of LOPS) props.onRate(lop, "ok")
            props.onAi5Lop?.({ ...AI_5_LOP })
          }}
        >
          RATE_ALL
        </button>
      </div>
    ),
  }
})

import { TradingPanel } from "./TradingPanel"

function submitButton(label = "ĐẶT LỆNH MUA"): HTMLElement {
  return screen.getByText(label).closest("button") as HTMLElement
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

/** Satisfy Cấp 2 + Cấp 3's gates (Cấp 4 is cumulative on both). */
function satisfyCap2And3() {
  fireEvent.click(screen.getByText("PICK_SLTP"))
  fireEvent.click(screen.getByText("PICK_VON"))
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  orderSide = "BUY"
  placeOrderMock.mockClear()
  recordKehoachMock.mockClear()
  recordKehoachAsyncMock.mockClear()
  recordKehoachCap2AsyncMock.mockClear()
  recordKehoachCap3AsyncMock.mockClear()
  recordKehoachCap4AsyncMock.mockClear()
  onOrderFilledCap1Mock.mockClear()
  onOrderFilledCap2Mock.mockClear()
  onOrderFilledCap3Mock.mockClear()
  onOrderFilledCap4Mock.mockClear()
  planFormProps = {}
  isCap4ActiveFlag = true
})

describe("TradingPanel — Cấp 4 panel composition (spec §5)", () => {
  it("renders Doc5LopBlock and HIDES Cấp 1's lý-do field + AiThanhTra", () => {
    renderPanel()
    expect(screen.getByTestId("doc5lop-mock")).toBeInTheDocument()
    // Cấp 1's form is still there for Vùng mua — but its lý-do field is hidden.
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(planFormProps.hideLyDo).toBe(true)
    expect(screen.queryByText("PICK_LY_DO")).not.toBeInTheDocument()
    expect(screen.queryByTestId("ai-thanh-tra-mock")).not.toBeInTheDocument()
  })

  it("keeps Cấp 1's Vùng mua, Cấp 2's SL/TP and Cấp 3's Quản lý vốn intact", () => {
    renderPanel()
    expect(screen.getByLabelText("vung-mua-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
    expect(screen.getByTestId("quanlyvon-mock")).toBeInTheDocument()
  })

  it("does NOT render Doc5LopBlock outside Cấp 4 (Cấp 3-only unaffected)", () => {
    isCap4ActiveFlag = false
    renderPanel()
    expect(screen.queryByTestId("doc5lop-mock")).not.toBeInTheDocument()
    expect(planFormProps.hideLyDo).toBeFalsy()
    expect(screen.getByText("PICK_LY_DO")).toBeInTheDocument()
  })
})

describe("TradingPanel — Cấp 4 cổng cứng: chấm đủ 5 lớp (spec §5.2)", () => {
  it("MUA stays disabled with Cấp 2 + Cấp 3 satisfied but only 1/5 lớp rated", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ONE"))
    expect(submitButton()).toBeDisabled()
  })

  it("MUA enables once all 5 lớp are rated (with Cấp 2 + Cấp 3 satisfied)", () => {
    renderPanel()
    satisfyCap2And3()
    expect(submitButton()).toBeDisabled()
    fireEvent.click(screen.getByText("RATE_ALL"))
    expect(submitButton()).not.toBeDisabled()
  })

  it("MUA stays disabled when all 5 lớp are rated but Cấp 3's gate is unmet", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("RATE_ALL"))
    expect(submitButton()).toBeDisabled()
  })

  it("clicking MUA while the 5-lớp gate is unmet does not place an order", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    expect(placeOrderMock).not.toHaveBeenCalled()
  })
})

describe("TradingPanel — Cấp 4 ghi hồ sơ khi lệnh MUA khớp (spec §8)", () => {
  it("posts cap1 → cap2 → cap3 → cap4 kehoach, all awaited, on ONE order_kehoach row", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    // Cấp 1 first (its row is the one the other three extend).
    expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap2AsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap3AsyncMock).toHaveBeenCalledTimes(1)
    expect(
      recordKehoachAsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap4AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
    expect(
      recordKehoachCap3AsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap4AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
  })

  it("sends a DERIVED lyDo to /cap1/kehoach (its column is still NOT NULL)", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1))
    // User rated every lớp 'ok'; AI supports ky_thuat/tin_tuc/dinh_gia — the
    // canonical-order tie-break picks ky_thuat.
    expect(recordKehoachAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "order-1", lyDo: "ky_thuat" }),
    )
  })

  it("ALWAYS posts BOTH JSON blobs to /cap4/kehoach (else so_lop_dong_thuan stays NULL)", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap4AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      doc_5_lop: {
        ky_thuat: "ok",
        dong_tien: "ok",
        noi_bo: "ok",
        tin_tuc: "ok",
        dinh_gia: "ok",
      },
      ai_5_lop: { ...AI_5_LOP },
      // AI reads 3 lớp as Ủng hộ; the user differs on dong_tien + noi_bo.
      so_lop_dong_thuan: 3,
      so_lop_khac_ai: 2,
    })
  })

  it("fires the Cấp 4 bus event with the đọc-5-lớp payload on a BUY fill", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap4Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap4Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "VNM",
        side: "buy",
        orderId: "order-1",
        soLopDongThuan: 3,
        soLopKhacAi: 2,
      }),
    )
  })

  it("does NOT post /cap4/kehoach outside Cấp 4 (no regression for Cấp 3)", async () => {
    isCap4ActiveFlag = false
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LY_DO"))
    satisfyCap2And3()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap3AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap4AsyncMock).not.toHaveBeenCalled()
  })
})

describe("TradingPanel — SELL fill fires every cấp's own bus event (Cấp 3 gap fix)", () => {
  it("fires cap1 + cap2 + cap3 + cap4 onOrderFilled on a SELL fill", async () => {
    orderSide = "SELL"
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(onOrderFilledCap3Mock).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: "VNM", side: "sell", orderId: "order-1" }),
      ),
    )
    expect(onOrderFilledCap4Mock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", side: "sell", orderId: "order-1" }),
    )
    // Cấp 1 + Cấp 2's existing sell events still fire (no regression).
    expect(onOrderFilledCap1Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
    expect(onOrderFilledCap2Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
  })

  it("does not post any kehoach on a SELL fill", async () => {
    orderSide = "SELL"
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap4AsyncMock).not.toHaveBeenCalled()
    expect(recordKehoachAsyncMock).not.toHaveBeenCalled()
  })
})

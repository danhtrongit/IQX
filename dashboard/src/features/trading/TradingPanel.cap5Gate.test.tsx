import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cấp 5 wiring inside `TradingPanel`/`OrderEntry` (Task FE1) — PURELY ADDITIVE
 * (spec §0: "Cấp 5 KHÔNG đổi gì trong panel mua"):
 *  - `DungNgoaiButton` renders ONLY inside a Cấp 5 session, buy-side, and adds
 *    NO gate of its own.
 *  - Every Cấp 1/2/3/4 block + cổng cứng chain + Cấp 3's volume auto-fill
 *    behaves EXACTLY as `TradingPanel.cap4Gate.test.tsx` proves it does at Cấp
 *    4 — this file re-asserts them inside a Cấp 5 session so a regression here
 *    can't hide behind "Cấp 5 is new".
 *  - A BUY/SELL fill fires Cấp 5's bus event ALONGSIDE Cấp 1-4's (Cấp 5 adds no
 *    kế hoạch POST — it has no `/cap5/kehoach`).
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
    }) => {
      planFormProps = { hideLyDo: props.hideLyDo }
      return (
        <div data-testid="plan-form-cap1-mock">
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
      isCap4Active: true,
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

/* ── Cấp 5 ── */
const onOrderFilledCap5Mock = vi.fn()
let isCap5ActiveFlag = true

vi.mock("@/features/cap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5")>()
  return {
    ...actual,
    useCap5Events: () => ({
      isCap5Active: isCap5ActiveFlag,
      onDungNgoai: vi.fn(),
      onVerdictSettled: vi.fn(),
      onOrderFilled: onOrderFilledCap5Mock,
      registerHandlers: vi.fn(),
    }),
    DungNgoaiButton: (props: { symbol: string }) => (
      <div data-testid="dungngoai-mock">{`DUNG_NGOAI_${props.symbol}`}</div>
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

/** Satisfy Cấp 2 + Cấp 3's gates (Cấp 4/5 sit on top of both). */
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
  onOrderFilledCap5Mock.mockClear()
  planFormProps = {}
  isCap5ActiveFlag = true
})

describe("TradingPanel — nút Đứng ngoài chỉ có trong Cấp 5 (spec §5)", () => {
  it("hiện nút Đứng ngoài của mã đang xem trong một phiên Cấp 5", () => {
    renderPanel()
    expect(screen.getByTestId("dungngoai-mock").textContent).toBe("DUNG_NGOAI_VNM")
  })

  it("KHÔNG hiện ngoài Cấp 5 (Cấp 0-4 và giao dịch thường không đổi)", () => {
    isCap5ActiveFlag = false
    renderPanel()
    expect(screen.queryByTestId("dungngoai-mock")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện ở tab BÁN — đứng ngoài là quyết định KHÔNG MUA", () => {
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    expect(screen.queryByTestId("dungngoai-mock")).not.toBeInTheDocument()
  })
})

describe("TradingPanel — Cấp 5 KHÔNG đổi gì trong panel mua (spec §0)", () => {
  it("mọi khối Cấp 1/2/3/4 vẫn nguyên trong phiên Cấp 5", () => {
    renderPanel()
    expect(screen.getByTestId("doc5lop-mock")).toBeInTheDocument()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.getByLabelText("vung-mua-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
    expect(screen.getByTestId("quanlyvon-mock")).toBeInTheDocument()
    // Cấp 4 vẫn ẩn trường lý do của Cấp 1 + AI Thanh tra (không phải Cấp 5 đổi).
    expect(planFormProps.hideLyDo).toBe(true)
    expect(screen.queryByTestId("ai-thanh-tra-mock")).not.toBeInTheDocument()
  })

  it("chuỗi cổng cứng Cấp 1-4 giữ nguyên: thiếu 1 mắt là vẫn khoá", () => {
    renderPanel()
    expect(submitButton()).toBeDisabled()
    // Chỉ Cấp 2 + Cấp 3 → vẫn khoá vì Cấp 4 chưa chấm đủ 5 lớp.
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ONE"))
    expect(submitButton()).toBeDisabled()
  })

  it("mở đúng lúc 4 cổng Cấp 1-4 đủ — Cấp 5 KHÔNG thêm cổng nào", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    expect(submitButton()).not.toBeDisabled()
  })

  it("thiếu cổng Cấp 3 → vẫn khoá dù đã chấm đủ 5 lớp", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("RATE_ALL"))
    expect(submitButton()).toBeDisabled()
  })

  it("tự điền ô Khối lượng của Cấp 3 vẫn chạy (200 cp → giá trị lệnh)", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_VON"))
    // 200 cp × 62,400 = 12,480,000 — ô Khối lượng đã được auto-fill.
    expect(screen.getByText("12,480,000")).toBeInTheDocument()
  })

  it("chuỗi ghi hồ sơ cap1 → cap2 → cap3 → cap4 khi MUA khớp không đổi", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap2AsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap3AsyncMock).toHaveBeenCalledTimes(1)
    expect(
      recordKehoachAsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap4AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
  })
})

describe("TradingPanel — Cấp 5 nhận event lệnh khớp cạnh Cấp 1-4", () => {
  it("bắn cap5Events.onOrderFilled trên lệnh MUA khớp", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap5Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap5Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "VNM",
        side: "buy",
        quantity: 100,
        price: 62_400,
        orderId: "order-1",
      }),
    )
    // Cấp 1-4 vẫn nhận event của mình (không cấp nào bị Cấp 5 chiếm).
    expect(onOrderFilledCap1Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap4Mock).toHaveBeenCalledTimes(1)
  })

  it("bắn cap5Events.onOrderFilled trên lệnh BÁN khớp (mở Kết sổ Cấp 5)", async () => {
    orderSide = "SELL"
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(onOrderFilledCap5Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap5Mock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VNM", side: "sell", orderId: "order-1" }),
    )
    expect(onOrderFilledCap4Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
    expect(onOrderFilledCap1Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
  })

  it("KHÔNG có POST kế hoạch riêng cho Cấp 5 (panel mua không đổi)", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining("cap5"), expect.anything())
  })
})

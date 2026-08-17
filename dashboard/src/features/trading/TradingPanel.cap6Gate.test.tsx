import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cấp 6 wiring inside `TradingPanel`/`OrderEntry` (Task FE1) — PURELY ADDITIVE
 * (spec §0: "Toàn bộ panel Cấp 5 GIỮ NGUYÊN"):
 *  - `DoiChieuBlock` renders ONLY inside a Cấp 6 session, buy-side, and BELOW
 *    Cấp 4's Đọc-5-lớp (its ratings are the conflict source).
 *  - **Cổng cứng only when the ratings CONFLICT** (≥1 Ủng hộ AND ≥1 Ngược
 *    chiều): MUA is blocked until a lớp quyết định + a 1-dòng lý do exist. With
 *    no conflict Cấp 6 adds NO gate at all.
 *  - Every Cấp 1/2/3/4/5 block + cổng cứng chain + Cấp 3's volume auto-fill
 *    behaves EXACTLY as `TradingPanel.cap5Gate.test.tsx` proves at Cấp 5.
 *  - A BUY fill with a conflict posts `/cap6/kehoach` LAST in the kế hoạch chain
 *    (all cấp extend ONE `order_kehoach` row); a SELL fires Cấp 6's bus event.
 */

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VCB", setSymbol: vi.fn() }),
}))

const priceData = {
  symbol: "VCB",
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
    symbol: "VCB",
    side: orderSide,
    quantity: 100,
    price: 62_400,
    total: 6_240_000,
    status: "FILLED",
  }),
)
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: { balance: 250_000_000, pnl: 0, pnlPercent: 0, winRate: 0 } }),
  usePortfolio: () => ({ data: { positions: [{ symbol: "VCB", quantity: 1000 }] } }),
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
/** 5 lớp đã chấm và MÂU THUẪN (≥1 Ủng hộ + ≥1 Ngược chiều) — spec §4's trigger. */
const CONFLICT_5_LOP = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "neu",
  dinh_gia: "bad",
} as const

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
        <button
          type="button"
          onClick={() => {
            for (const lop of LOPS) props.onRate(lop, CONFLICT_5_LOP[lop])
            props.onAi5Lop?.({ ...AI_5_LOP })
          }}
        >
          RATE_CONFLICT
        </button>
      </div>
    ),
  }
})

/* ── Cấp 5 ── */
const onOrderFilledCap5Mock = vi.fn()

vi.mock("@/features/cap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5")>()
  return {
    ...actual,
    useCap5Events: () => ({
      isCap5Active: true,
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

/* ── Cấp 6 ──
   `coMauThuan` + `isDoiChieuValid` stay REAL (the panel's gate is the thing
   under test); only the bus, the mutation and the block itself are stubbed. */
const recordKehoachCap6AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc6-1" }))
const onOrderFilledCap6Mock = vi.fn()
let isCap6ActiveFlag = true
let doiChieuProps: { doc5Lop?: Record<string, string>; symbol?: string } = {}

vi.mock("@/features/cap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap6")>()
  return {
    ...actual,
    useCap6Events: () => ({
      isCap6Active: isCap6ActiveFlag,
      onConflictShown: vi.fn(),
      onLopQuyetDinhPicked: vi.fn(),
      onOrderFilled: onOrderFilledCap6Mock,
      registerHandlers: vi.fn(),
    }),
    useRecordKehoachCap6: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap6AsyncMock,
      isPending: false,
    }),
    DoiChieuBlock: (props: {
      symbol: string
      doc5Lop: Record<string, string>
      onLopQuyetDinh: (lop: string) => void
      onLyDo: (v: string) => void
      onKieuCoPhieu: (k: string) => void
    }) => {
      doiChieuProps = { doc5Lop: props.doc5Lop, symbol: props.symbol }
      return (
        <div data-testid="doichieu-mock">
          <button type="button" onClick={() => props.onLopQuyetDinh("dinh_gia")}>
            PICK_LOP
          </button>
          <button type="button" onClick={() => props.onLyDo("P/B 1.2 — rẻ hơn trung vị")}>
            TYPE_LY_DO
          </button>
          <button type="button" onClick={() => props.onLyDo("   ")}>
            TYPE_BLANK
          </button>
          <button type="button" onClick={() => props.onKieuCoPhieu("dau_co_nho")}>
            PICK_KIEU
          </button>
        </div>
      )
    },
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

/** Satisfy Cấp 2 + Cấp 3's gates (Cấp 4/5/6 sit on top of all of them). */
function satisfyCap2And3() {
  fireEvent.click(screen.getByText("PICK_SLTP"))
  fireEvent.click(screen.getByText("PICK_VON"))
}

/** Satisfy Cấp 6's cổng cứng: a lớp quyết định + a non-blank 1-dòng lý do. */
function satisfyCap6() {
  fireEvent.click(screen.getByText("PICK_LOP"))
  fireEvent.click(screen.getByText("TYPE_LY_DO"))
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
  recordKehoachCap6AsyncMock.mockClear()
  onOrderFilledCap1Mock.mockClear()
  onOrderFilledCap2Mock.mockClear()
  onOrderFilledCap3Mock.mockClear()
  onOrderFilledCap4Mock.mockClear()
  onOrderFilledCap5Mock.mockClear()
  onOrderFilledCap6Mock.mockClear()
  planFormProps = {}
  doiChieuProps = {}
  isCap6ActiveFlag = true
})

describe("TradingPanel — khối Đối chiếu chỉ có trong Cấp 6 (spec §4)", () => {
  it("hiện khối Đối chiếu trong một phiên Cấp 6, kèm mã đang xem", () => {
    renderPanel()
    expect(screen.getByTestId("doichieu-mock")).toBeInTheDocument()
    expect(doiChieuProps.symbol).toBe("VCB")
  })

  it("KHÔNG hiện ngoài Cấp 6 (Cấp 0-5 và giao dịch thường không đổi)", () => {
    isCap6ActiveFlag = false
    renderPanel()
    expect(screen.queryByTestId("doichieu-mock")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện ở tab BÁN — đối chiếu là bước của luồng MUA", () => {
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    expect(screen.queryByTestId("doichieu-mock")).not.toBeInTheDocument()
  })

  it("đứng DƯỚI khối Đọc 5 lớp của Cấp 4 (điểm chấm phải có trước)", () => {
    renderPanel()
    const doc5 = screen.getByTestId("doc5lop-mock")
    const doiChieu = screen.getByTestId("doichieu-mock")
    expect(doc5.compareDocumentPosition(doiChieu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("nhận đúng bản chấm 5 lớp của Cấp 4 làm nguồn mâu thuẫn", () => {
    renderPanel()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    expect(doiChieuProps.doc5Lop).toEqual(CONFLICT_5_LOP)
  })
})

describe("TradingPanel — cổng cứng Cấp 6 CHỈ khi 5 lớp mâu thuẫn (spec §4)", () => {
  it("KHÔNG mâu thuẫn → Cấp 6 KHÔNG thêm cổng nào (mở đúng lúc cổng Cấp 1-4 đủ)", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    expect(submitButton()).not.toBeDisabled()
  })

  it("CÓ mâu thuẫn → khoá MUA tới khi chọn lớp quyết định + ghi lý do", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    expect(submitButton()).toBeDisabled()
    satisfyCap6()
    expect(submitButton()).not.toBeDisabled()
  })

  it("chọn lớp nhưng CHƯA ghi lý do → vẫn khoá (mirror luật 422 của server)", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    fireEvent.click(screen.getByText("PICK_LOP"))
    expect(submitButton()).toBeDisabled()
  })

  it("lý do chỉ toàn khoảng trắng → vẫn khoá", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    fireEvent.click(screen.getByText("PICK_LOP"))
    fireEvent.click(screen.getByText("TYPE_BLANK"))
    expect(submitButton()).toBeDisabled()
  })

  it("ghi lý do nhưng CHƯA chọn lớp → vẫn khoá", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    fireEvent.click(screen.getByText("TYPE_LY_DO"))
    expect(submitButton()).toBeDisabled()
  })

  it("ngoài Cấp 6, 5 lớp mâu thuẫn KHÔNG khoá gì (Cấp 0-5 không đổi)", () => {
    isCap6ActiveFlag = false
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    expect(submitButton()).not.toBeDisabled()
  })

  it("cổng Cấp 6 OR với cổng Cấp 1-4: đủ Cấp 6 nhưng thiếu Cấp 3 → vẫn khoá", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    satisfyCap6()
    expect(submitButton()).toBeDisabled()
  })
})

describe("TradingPanel — Cấp 6 KHÔNG đổi gì của Cấp 1-5 (spec §0)", () => {
  it("mọi khối Cấp 1/2/3/4/5 vẫn nguyên trong phiên Cấp 6", () => {
    renderPanel()
    expect(screen.getByTestId("doc5lop-mock")).toBeInTheDocument()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.getByLabelText("vung-mua-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
    expect(screen.getByTestId("quanlyvon-mock")).toBeInTheDocument()
    expect(screen.getByTestId("dungngoai-mock")).toBeInTheDocument()
    // Cấp 4 vẫn ẩn trường lý do của Cấp 1 + AI Thanh tra (Cấp 6 không chạm).
    expect(planFormProps.hideLyDo).toBe(true)
    expect(screen.queryByTestId("ai-thanh-tra-mock")).not.toBeInTheDocument()
  })

  it("chuỗi cổng cứng Cấp 1-4 giữ nguyên: chấm 1 lớp là vẫn khoá", () => {
    renderPanel()
    expect(submitButton()).toBeDisabled()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ONE"))
    expect(submitButton()).toBeDisabled()
  })

  it("tự điền ô Khối lượng của Cấp 3 vẫn chạy (200 cp → giá trị lệnh)", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_VON"))
    expect(screen.getByText("12,480,000")).toBeInTheDocument()
  })
})

describe("TradingPanel — ghi kế hoạch Cấp 6 sau cùng trong chuỗi", () => {
  it("MUA có mâu thuẫn: cap1 → cap2 → cap3 → cap4 → cap6, cùng 1 order_kehoach", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    satisfyCap6()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap2AsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap3AsyncMock).toHaveBeenCalledTimes(1)
    expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1)
    // Cấp 6 đi SAU Cấp 4 (và sau Cấp 1) — nó chỉ chèn thêm khối vào cùng 1 dòng.
    expect(
      recordKehoachCap4AsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap6AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
    expect(
      recordKehoachAsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap6AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
  })

  it("gửi đúng payload: lớp quyết định + lý do + bản chấm 5 lớp làm dự phòng", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    satisfyCap6()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap6AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      lop_quyet_dinh: "dinh_gia",
      ly_do_doi_chieu: "P/B 1.2 — rẻ hơn trung vị",
      kieu_co_phieu: null,
      lop_mau_thuan: CONFLICT_5_LOP,
    })
  })

  it("kiểu do user chọn CHỈ đi kèm khi user thật sự chọn (mã chưa phân loại)", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    satisfyCap6()
    fireEvent.click(screen.getByText("PICK_KIEU"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap6AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ kieu_co_phieu: "dau_co_nho" }),
    )
  })

  it("MUA KHÔNG mâu thuẫn → KHÔNG ghi kế hoạch Cấp 6 (cột để null)", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap6AsyncMock).not.toHaveBeenCalled()
  })
})

describe("TradingPanel — Cấp 6 nhận event lệnh khớp cạnh Cấp 1-5", () => {
  it("bắn cap6Events.onOrderFilled trên lệnh MUA khớp, kèm khối Đối chiếu", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    satisfyCap6()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap6Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap6Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "VCB",
        side: "buy",
        quantity: 100,
        price: 62_400,
        orderId: "order-1",
        lopQuyetDinh: "dinh_gia",
      }),
    )
    // Cấp 1-5 vẫn nhận event của mình (không cấp nào bị Cấp 6 chiếm).
    expect(onOrderFilledCap1Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap4Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap5Mock).toHaveBeenCalledTimes(1)
  })

  it("bắn cap6Events.onOrderFilled trên lệnh BÁN khớp (mở Kết sổ Cấp 6)", async () => {
    orderSide = "SELL"
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(onOrderFilledCap6Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap6Mock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VCB", side: "sell", orderId: "order-1" }),
    )
    expect(onOrderFilledCap5Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
  })

  it("reset khối Đối chiếu sau khi MUA khớp — lệnh sau phải đối chiếu lại", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_CONFLICT"))
    satisfyCap6()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    // Cấp 4 xoá bản chấm → không còn mâu thuẫn → cổng Cấp 4 khoá lại như cũ.
    await waitFor(() => expect(doiChieuProps.doc5Lop).toEqual({}))
    expect(submitButton()).toBeDisabled()
  })
})

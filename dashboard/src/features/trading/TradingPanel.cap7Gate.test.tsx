import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PhienCap7 } from "@/features/cap7"

/**
 * Cấp 7 wiring inside `TradingPanel`/`OrderEntry` (Task FE1) — PURELY ADDITIVE
 * (spec §0: "Toàn bộ panel Cấp 6 GIỮ NGUYÊN"):
 *  - `DocSoLenhBlock` renders ONLY inside a Cấp 7 session, buy-side, right
 *    before the MUA button — a reading layer over the SAME bid/ask book the
 *    panel already shows (no second subscription, no rebuilt ladder).
 *  - **★ Cấp 7 NEVER gates MUA** (spec §9): reading lực is soft, so nothing it
 *    adds may ever appear in the panel's `disabled` chain — not even when the
 *    cờ cảnh giác is showing.
 *  - Every Cấp 1/2/3/4/5/6 block + cổng cứng chain behaves EXACTLY as
 *    `TradingPanel.cap6Gate.test.tsx` proves at Cấp 6.
 *  - A BUY fill with a reading posts `/cap7/kehoach` LAST in the kế hoạch chain
 *    (all cấp extend ONE `order_kehoach` row); a SELL fires Cấp 7's bus event.
 */

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VCB", setSymbol: vi.fn() }),
}))

/** spec §4's worked example: 1,240,000 dư mua / 640,000 dư bán = 1.9375. */
const BID_THUONG = [
  { price: 62.3, volume: 540_000 },
  { price: 62.2, volume: 400_000 },
  { price: 62.1, volume: 300_000 },
]
const ASK_THUONG = [
  { price: 62.4, volume: 240_000 },
  { price: 62.5, volume: 220_000 },
  { price: 62.6, volume: 180_000 },
]
/** Same book with one wall → the cờ cảnh giác trips. */
const BID_CO_TUONG = [
  { price: 62.3, volume: 240_000 },
  { price: 62.2, volume: 200_000 },
  { price: 62.0, volume: 5_000_000 },
]

let bookBid: { price: number; volume: number }[] = BID_THUONG
let bookAsk: { price: number; volume: number }[] = ASK_THUONG

vi.mock("@/features/market-data", () => ({
  usePrice: () => ({
    data: {
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
      bid: bookBid,
      ask: bookAsk,
    },
    isLoading: false,
  }),
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
    }) => (
      <div data-testid="plan-form-cap1-mock">
        {/* Dùng cho ca "chỉ còn Cấp 1 + Cấp 7" bên dưới (Cấp 4 tắt → không có
            lý do suy ra từ 5 lớp, nên phải chọn tay như Cấp 1 gốc). */}
        <button type="button" onClick={() => props.onLyDoChange("ky_thuat")}>
          PICK_LYDO
        </button>
        <input aria-label="vung-mua-mock" value={props.vungMua ?? ""} readOnly />
      </div>
    ),
    AiThanhTra: () => <div data-testid="ai-thanh-tra-mock" />,
  }
})

/* ── Cấp 2 ── */
const recordKehoachCap2AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc2-1" }))
let isCap2ActiveFlag = true

vi.mock("@/features/cap2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap2")>()
  return {
    ...actual,
    useCap2Events: () => ({
      isCap2Active: isCap2ActiveFlag,
      onSlTpPicked: vi.fn(),
      onOrderFilled: vi.fn(),
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
let isCap3ActiveFlag = true

vi.mock("@/features/cap3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap3")>()
  return {
    ...actual,
    useCap3Events: () => ({
      isCap3Active: isCap3ActiveFlag,
      onKhauViPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useCap3Progress: () => ({ data: { khau_vi: "can_bang", von_ban_dau: 1_000_000_000 } }),
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
      onOrderFilled: vi.fn(),
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
vi.mock("@/features/cap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5")>()
  return {
    ...actual,
    useCap5Events: () => ({
      isCap5Active: true,
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
  }
})

/* ── Cấp 6 ── */
const recordKehoachCap6AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc6-1" }))
const onOrderFilledCap6Mock = vi.fn()
let isCap6ActiveFlag = true

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
    // 5 lớp đều "ok" ở đây → KHÔNG mâu thuẫn → Cấp 6 không thêm cổng nào.
    DoiChieuBlock: () => <div data-testid="doichieu-mock" />,
  }
})

/* ── Cấp 7 ──
   `docSoLenhSnapshot` stays REAL (the number the panel commits is the thing
   under test); only the bus, the phiên query, the mutation and the block's
   rendering are stubbed. */
const recordKehoachCap7AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc7-1" }))
const onOrderFilledCap7Mock = vi.fn()
let isCap7ActiveFlag = true
let docSoLenhProps: { symbol?: string; bid?: unknown[]; ask?: unknown[] } = {}

const QUY_TAC: PhienCap7["quy_tac"] = {
  nguong_cau_ap_dao: 1.5,
  nguong_cung_ap_dao: 1 / 1.5,
  bands: [
    { ma: "cau_ap_dao", ten: "Cầu áp đảo", dieu_kien_text: "Lực ≥ 1.50 : 1", giai_thich: "…" },
    { ma: "can_bang", ten: "Cân bằng", dieu_kien_text: "…", giai_thich: "…" },
    { ma: "cung_ap_dao", ten: "Cung áp đảo", dieu_kien_text: "…", giai_thich: "…" },
  ],
  co_canh_giac_he_so: 3,
  co_canh_giac_min_muc: 3,
  co_canh_giac_copy: "Lệnh treo to chưa chắc là cầu/cung thật…",
  so_phien_cham: 2,
  dead_band_pct: 1,
  cham_giai_thich: "Sau 2 phiên giao dịch…",
}
let phienState: { data: PhienCap7 | undefined; isLoading: boolean; isError: boolean } = {
  data: { trong_phien: true, gio_giao_dich_text: "…", giai_thich: "…", quy_tac: QUY_TAC },
  isLoading: false,
  isError: false,
}

vi.mock("@/features/cap7", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap7")>()
  return {
    ...actual,
    useCap7Events: () => ({
      isCap7Active: isCap7ActiveFlag,
      onLucShown: vi.fn(),
      onLucDoc: vi.fn(),
      onCoShown: vi.fn(),
      onCoHanhVi: vi.fn(),
      onOrderFilled: onOrderFilledCap7Mock,
      registerHandlers: vi.fn(),
    }),
    usePhienCap7: () => phienState,
    useRecordKehoachCap7: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap7AsyncMock,
      isPending: false,
    }),
    DocSoLenhBlock: (props: {
      symbol: string
      bid: unknown[]
      ask: unknown[]
      onDocLuc: (d: string) => void
      onHanhViCo: (h: string) => void
    }) => {
      docSoLenhProps = { symbol: props.symbol, bid: props.bid, ask: props.ask }
      return (
        <div data-testid="docsolenh-mock">
          <button type="button" onClick={() => props.onDocLuc("manh")}>
            DOC_MANH
          </button>
          <button type="button" onClick={() => props.onHanhViCo("cho_xac_nhan")}>
            CHO_XAC_NHAN
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

/** Satisfy every Cấp 1-6 gate (Cấp 7 adds none of its own). */
function satisfyCap1To6() {
  fireEvent.click(screen.getByText("PICK_SLTP"))
  fireEvent.click(screen.getByText("PICK_VON"))
  fireEvent.click(screen.getByText("RATE_ALL"))
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  orderSide = "BUY"
  bookBid = BID_THUONG
  bookAsk = ASK_THUONG
  placeOrderMock.mockClear()
  recordKehoachMock.mockClear()
  recordKehoachAsyncMock.mockClear()
  recordKehoachCap2AsyncMock.mockClear()
  recordKehoachCap3AsyncMock.mockClear()
  recordKehoachCap4AsyncMock.mockClear()
  recordKehoachCap6AsyncMock.mockClear()
  recordKehoachCap7AsyncMock.mockClear()
  onOrderFilledCap1Mock.mockClear()
  onOrderFilledCap6Mock.mockClear()
  onOrderFilledCap7Mock.mockClear()
  docSoLenhProps = {}
  isCap2ActiveFlag = true
  isCap3ActiveFlag = true
  isCap4ActiveFlag = true
  isCap6ActiveFlag = true
  isCap7ActiveFlag = true
  phienState = {
    data: { trong_phien: true, gio_giao_dich_text: "…", giai_thich: "…", quy_tac: QUY_TAC },
    isLoading: false,
    isError: false,
  }
})

describe("TradingPanel — khối Đọc sổ lệnh chỉ có trong Cấp 7 (spec §4)", () => {
  it("hiện khối trong một phiên Cấp 7, kèm mã đang xem", () => {
    renderPanel()
    expect(screen.getByTestId("docsolenh-mock")).toBeInTheDocument()
    expect(docSoLenhProps.symbol).toBe("VCB")
  })

  it("KHÔNG hiện ngoài Cấp 7 (Cấp 0-6 và giao dịch thường không đổi)", () => {
    isCap7ActiveFlag = false
    renderPanel()
    expect(screen.queryByTestId("docsolenh-mock")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện ở tab BÁN — đọc lực là bước của luồng MUA", () => {
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    expect(screen.queryByTestId("docsolenh-mock")).not.toBeInTheDocument()
  })

  it("★ dùng CHÍNH sổ lệnh panel đang có, không dựng lại sổ", () => {
    renderPanel()
    expect(docSoLenhProps.bid).toEqual(BID_THUONG)
    expect(docSoLenhProps.ask).toEqual(ASK_THUONG)
  })

  it("đứng NGAY TRƯỚC nút MUA (spec §4) và sau khối Đối chiếu của Cấp 6", () => {
    renderPanel()
    const doiChieu = screen.getByTestId("doichieu-mock")
    const docSoLenh = screen.getByTestId("docsolenh-mock")
    const submit = submitButton()
    expect(
      doiChieu.compareDocumentPosition(docSoLenh) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      docSoLenh.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe("★ TradingPanel — Cấp 7 KHÔNG BAO GIỜ chặn MUA (spec §9)", () => {
  it("đủ cổng Cấp 1-6 mà CHƯA đọc lực → nút MUA vẫn mở", () => {
    renderPanel()
    satisfyCap1To6()
    expect(submitButton()).not.toBeDisabled()
  })

  it("có cờ cảnh giác mà chưa chọn hành vi → nút MUA vẫn mở", () => {
    bookBid = BID_CO_TUONG
    renderPanel()
    satisfyCap1To6()
    expect(submitButton()).not.toBeDisabled()
  })

  it("sổ quá mỏng (không đọc được lực) → nút MUA vẫn mở", () => {
    bookAsk = []
    renderPanel()
    satisfyCap1To6()
    expect(submitButton()).not.toBeDisabled()
  })

  it("ngoài giờ giao dịch → nút MUA vẫn mở", () => {
    phienState = { ...phienState, data: { ...phienState.data!, trong_phien: false } }
    renderPanel()
    satisfyCap1To6()
    expect(submitButton()).not.toBeDisabled()
  })

  it("chuỗi cổng cứng Cấp 1-6 giữ nguyên: thiếu Cấp 3 là vẫn khoá", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("RATE_ALL"))
    fireEvent.click(screen.getByText("DOC_MANH"))
    expect(submitButton()).toBeDisabled()
  })

  it("mọi khối Cấp 1/2/3/4/5/6 vẫn nguyên trong phiên Cấp 7", () => {
    renderPanel()
    expect(screen.getByTestId("doc5lop-mock")).toBeInTheDocument()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
    expect(screen.getByTestId("quanlyvon-mock")).toBeInTheDocument()
    // Cấp 5 KHÔNG thêm gì vào panel (nút «Đứng ngoài» đã nghỉ hưu cùng Cấp 5 cũ).
    expect(screen.queryByText(/đứng ngoài/i)).not.toBeInTheDocument()
    expect(screen.getByTestId("doichieu-mock")).toBeInTheDocument()
  })
})

describe("TradingPanel — ghi bước đọc lực sau cùng trong chuỗi kế hoạch", () => {
  it("MUA có đọc lực: cap1 → … → cap4 → cap7, cùng 1 order_kehoach", async () => {
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1)
    expect(
      recordKehoachAsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap7AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
    expect(
      recordKehoachCap4AsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap7AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
  })

  it("gửi đúng chỉ số Lực đọc từ sổ + phần user tự đoán", async () => {
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      luc_chi_so: 1.9375,
      luc_doc_user: "manh",
      co_canh_giac_lenh_gia: false,
      hanh_vi_co: null,
    })
  })

  it("CHƯA đọc lực → KHÔNG ghi gì cho Cấp 7 (cột để null)", async () => {
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).not.toHaveBeenCalled()
  })

  it("★ ngoài giờ giao dịch → KHÔNG ghi, dù state có sẵn phần đoán", async () => {
    phienState = { ...phienState, data: { ...phienState.data!, trong_phien: false } }
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).not.toHaveBeenCalled()
  })

  it("★ sổ quá mỏng → KHÔNG ghi (không gửi 0 hay vô cực cho server)", async () => {
    bookAsk = []
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).not.toHaveBeenCalled()
  })

  it("chưa hỏi được trạng thái phiên → KHÔNG ghi (không đoán giờ mở cửa)", async () => {
    phienState = { data: undefined, isLoading: false, isError: true }
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).not.toHaveBeenCalled()
  })

  it("★ chỉ còn Cấp 1 + Cấp 7 → kế hoạch Cấp 1 vẫn được AWAIT trước (không 404)", async () => {
    isCap2ActiveFlag = false
    isCap3ActiveFlag = false
    isCap4ActiveFlag = false
    isCap6ActiveFlag = false
    renderPanel()
    fireEvent.click(screen.getByText("PICK_LYDO"))
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1)
    // Không được rơi vào nhánh "bắn rồi quên" — Cấp 7 ghi lên CÙNG dòng đó.
    expect(recordKehoachMock).not.toHaveBeenCalled()
    expect(
      recordKehoachAsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap7AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
  })
})

describe("TradingPanel — cờ cảnh giác đi kèm bước ghi (spec §5)", () => {
  it("có cờ + bấm 'chờ xác nhận' → ghi hanh_vi_co = cho_xac_nhan", async () => {
    bookBid = BID_CO_TUONG
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("CHO_XAC_NHAN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ co_canh_giac_lenh_gia: true, hanh_vi_co: "cho_xac_nhan" }),
    )
  })

  it("★ có cờ mà mua luôn → ghi 'mua_duoi_theo' (ghi lại, KHÔNG chặn)", async () => {
    bookBid = BID_CO_TUONG
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ co_canh_giac_lenh_gia: true, hanh_vi_co: "mua_duoi_theo" }),
    )
  })

  it("★ KHÔNG có cờ → hanh_vi_co phải là null (luật iff của server)", async () => {
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("CHO_XAC_NHAN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ co_canh_giac_lenh_gia: false, hanh_vi_co: null }),
    )
  })
})

describe("TradingPanel — Cấp 7 nhận event lệnh khớp cạnh Cấp 1-6", () => {
  it("bắn cap7Events.onOrderFilled trên lệnh MUA khớp, kèm phần đọc lực", async () => {
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap7Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap7Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "VCB",
        side: "buy",
        quantity: 100,
        price: 62_400,
        orderId: "order-1",
        lucChiSo: 1.9375,
        lucDocUser: "manh",
        coCanhGiac: false,
        hanhViCo: null,
      }),
    )
    // Cấp 1-6 vẫn nhận event của mình (không cấp nào bị Cấp 7 chiếm).
    expect(onOrderFilledCap1Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap6Mock).toHaveBeenCalledTimes(1)
  })

  it("bắn cap7Events.onOrderFilled trên lệnh BÁN khớp (mở Kết sổ Cấp 7)", async () => {
    orderSide = "SELL"
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(onOrderFilledCap7Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap7Mock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VCB", side: "sell", orderId: "order-1" }),
    )
    expect(onOrderFilledCap6Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
  })

  it("reset phần đọc lực sau khi MUA khớp — lệnh sau phải đọc lại", async () => {
    renderPanel()
    satisfyCap1To6()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))

    // Lệnh thứ hai: không bấm DOC_MANH nữa → không còn phần đọc lực nào để ghi.
    satisfyCap1To6()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(2))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1)
  })
})

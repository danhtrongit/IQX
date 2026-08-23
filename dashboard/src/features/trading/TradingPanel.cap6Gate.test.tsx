import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cấp 6 «Bậc thầy» trong `TradingPanel` (spec `demo-trading/LEVEL 6`, mockup
 * `iqx-cap6-datlenh.html`):
 *  - `MauThuanBlock` **THAY** khối "Đọc 5 lớp" của Cấp 4 (spec §5.2 / checklist
 *    §14 dòng 1) — buy-side, đúng chỗ mục "1." của thẻ KẾ HOẠCH.
 *  - Cấp 6 **KHÔNG THÊM CỔNG CỨNG NÀO** (spec §4.2 "nhận định là data, không
 *    cản hành động"), và cổng cứng "chấm đủ 5 lớp" của Cấp 4 được NHẤC — giữ
 *    lại là khoá vĩnh viễn nút MUA vì khối để chấm đã bị thay.
 *  - Lệnh MUA khớp: `POST /cap6/kehoach {order_id, conflict_level}` SAU CÙNG
 *    trong chuỗi kế hoạch (mọi cấp cùng MỘT hàng `order_kehoach`), bọc
 *    `ghiKehoachKhongChiMang`.
 *  - Nút «Không mua lần này» cạnh nút MUA, chỉ khi mã có bảng mâu thuẫn.
 *
 * ★ Cấp 7/8 chưa được dựng lại trên Cấp 6 mới nên chúng GIỮ `DoiChieuBlock` cũ.
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
      onOrderFilled: onOrderFilledCap5Mock,
      registerHandlers: vi.fn(),
    }),
  }
})

/* ── Cấp 6 «Bậc thầy» ──
   `coBangMauThuan` / `lyDoTuMauThuan` / `conflictLevelLabel` giữ NGUYÊN BẢN THẬT
   (hành vi của panel là thứ đang được kiểm); chỉ bus, hai mutation và khối là
   stub. */
const recordKehoachMauThuanAsyncMock = vi.fn<(...a: unknown[]) => unknown>(() =>
  Promise.resolve({ id: "khc6-1" }),
)
const skipAsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ ok: true }))
const onOrderFilledCap6Mock = vi.fn()
const onKhongMuaMock = vi.fn()
let isCap6ActiveFlag = true
let mauThuanData: unknown = undefined
let mauThuanBlockProps: { symbol?: string; nhanDinh?: string | null } = {}

/** Bản đọc mockup GEX: 2 ủng hộ · 2 ngược (cả hai phủ quyết) · 1 trung tính. */
const MAU_THUAN_GEX = {
  co_mau_thuan: true,
  ung_ho: [
    { lop: "ky_thuat", nhan: "Mạnh", bac: 5 },
    { lop: "dong_tien", nhan: "Ủng hộ", bac: 4 },
  ],
  nguoc: [
    { lop: "noi_bo", nhan: "Lãnh đạo bán", bac: 1, la_phu_quyet: true },
    { lop: "tin_tuc", nhan: "Rất tiêu cực", bac: 1, la_phu_quyet: true },
  ],
  trung_tinh: [{ lop: "dinh_gia", nhan: "Trung tính" }],
  phu_quyet_kich_hoat: true,
  lop_phu_quyet_xau: ["noi_bo", "tin_tuc"],
  canh_bao: "Có 2 lớp phủ quyết đang ở mức rất xấu.",
  chua_du_du_lieu: false,
  ly_do_chua_du: null,
}

/** 5 lớp cùng chiều → KHÔNG có bảng mâu thuẫn. */
const MAU_THUAN_KHONG = {
  ...MAU_THUAN_GEX,
  co_mau_thuan: false,
  nguoc: [],
  phu_quyet_kich_hoat: false,
  lop_phu_quyet_xau: [],
  canh_bao: null,
}

vi.mock("@/features/cap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap6")>()
  return {
    ...actual,
    useCap6Events: () => ({
      isCap6Active: isCap6ActiveFlag,
      onConflictShown: vi.fn(),
      onLopQuyetDinhPicked: vi.fn(),
      onMauThuanShown: vi.fn(),
      onNhanDinhPicked: vi.fn(),
      onKhongMua: onKhongMuaMock,
      onOrderFilled: onOrderFilledCap6Mock,
      registerHandlers: vi.fn(),
    }),
    useMauThuanCap6: () => ({ data: mauThuanData, isLoading: false, isError: false }),
    useRecordKehoachCap6: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useRecordKehoachMauThuanCap6: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachMauThuanAsyncMock,
      isPending: false,
    }),
    useSkipCap6: () => ({ mutate: vi.fn(), mutateAsync: skipAsyncMock, isPending: false }),
    MauThuanBlock: (props: {
      symbol: string
      nhanDinh: string | null
      onNhanDinh: (l: string) => void
    }) => {
      mauThuanBlockProps = { symbol: props.symbol, nhanDinh: props.nhanDinh }
      return (
        <div data-testid="mauthuan-mock">
          <button type="button" onClick={() => props.onNhanDinh("nghiem")}>
            RATE_NGHIEM
          </button>
          <button type="button" onClick={() => props.onNhanDinh("nhe")}>
            RATE_NHE
          </button>
        </div>
      )
    },
    DoiChieuBlock: () => <div data-testid="doichieu-mock" />,
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

/** Satisfy Cấp 2 + Cấp 3's gates (Cấp 6 sits on top of both). */
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
  recordKehoachMauThuanAsyncMock.mockClear()
  recordKehoachMauThuanAsyncMock.mockImplementation(() => Promise.resolve({ id: "khc6-1" }))
  skipAsyncMock.mockClear()
  onOrderFilledCap1Mock.mockClear()
  onOrderFilledCap2Mock.mockClear()
  onOrderFilledCap3Mock.mockClear()
  onOrderFilledCap4Mock.mockClear()
  onOrderFilledCap5Mock.mockClear()
  onOrderFilledCap6Mock.mockClear()
  onKhongMuaMock.mockClear()
  planFormProps = {}
  mauThuanBlockProps = {}
  isCap6ActiveFlag = true
  mauThuanData = MAU_THUAN_GEX
})

describe("TradingPanel — khối mâu thuẫn THAY khối Đọc 5 lớp (spec §5.2)", () => {
  it("hiện MauThuanBlock trong phiên Cấp 6, kèm mã đang xem", () => {
    renderPanel()
    expect(screen.getByTestId("mauthuan-mock")).toBeInTheDocument()
    expect(mauThuanBlockProps.symbol).toBe("VCB")
  })

  it("ẨN khối Đọc 5 lớp của Cấp 4 và ẨN khối Đối chiếu cũ", () => {
    renderPanel()
    // Neo dương tính: khối THAY THẾ thật sự đã render.
    expect(screen.getByTestId("mauthuan-mock")).toBeInTheDocument()
    expect(screen.queryByTestId("doc5lop-mock")).not.toBeInTheDocument()
    expect(screen.queryByTestId("doichieu-mock")).not.toBeInTheDocument()
  })

  it("ngoài Cấp 6: khối Đọc 5 lớp của Cấp 4 quay lại, khối mâu thuẫn vắng", () => {
    isCap6ActiveFlag = false
    renderPanel()
    expect(screen.getByTestId("doc5lop-mock")).toBeInTheDocument()
    expect(screen.queryByTestId("mauthuan-mock")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện ở tab BÁN — đây là bước của luồng MUA", () => {
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    expect(screen.queryByTestId("mauthuan-mock")).not.toBeInTheDocument()
  })

  it("mọi khối Cấp 1/2/3 vẫn nguyên (spec §0 GIỮ NGUYÊN)", () => {
    renderPanel()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
    expect(screen.getByTestId("quanlyvon-mock")).toBeInTheDocument()
  })
})

describe("TradingPanel — Cấp 6 «Bậc thầy» KHÔNG thêm cổng cứng nào (spec §4.2)", () => {
  it("cổng cứng 'chấm đủ 5 lớp' của Cấp 4 được NHẤC — không thì MUA khoá vĩnh viễn", () => {
    renderPanel()
    satisfyCap2And3()
    expect(submitButton()).not.toBeDisabled()
  })

  it("chưa chọn mức nhận định nào vẫn đặt được lệnh", () => {
    renderPanel()
    satisfyCap2And3()
    expect(mauThuanBlockProps.nhanDinh).toBeNull()
    expect(submitButton()).not.toBeDisabled()
  })

  it("cổng Cấp 2/Cấp 3 thì GIỮ NGUYÊN: thiếu chúng là vẫn khoá", () => {
    renderPanel()
    expect(submitButton()).toBeDisabled()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    expect(submitButton()).toBeDisabled()
    fireEvent.click(screen.getByText("PICK_VON"))
    expect(submitButton()).not.toBeDisabled()
  })
})

describe("TradingPanel — lý do Cấp 1 suy từ bản đọc SERVER, không bịa", () => {
  it("đọc được bản 5 lớp → trường lý do của Cấp 1 vẫn ẩn (mockup không vẽ nó)", () => {
    renderPanel()
    expect(planFormProps.hideLyDo).toBe(true)
  })

  it("KHÔNG đọc được gì → trường lý do HIỆN LẠI để user tự khai", () => {
    mauThuanData = undefined
    renderPanel()
    expect(planFormProps.hideLyDo).toBe(false)
  })

  it("cả ba phe rỗng → cũng hiện lại trường lý do (không đắp lớp mặc định)", () => {
    mauThuanData = { ...MAU_THUAN_GEX, ung_ho: [], nguoc: [], trung_tinh: [] }
    renderPanel()
    expect(planFormProps.hideLyDo).toBe(false)
  })
})

describe("TradingPanel — ghi mức nhận định sau cùng trong chuỗi kế hoạch", () => {
  it("MUA có mâu thuẫn + đã nhận định: cap1 → cap2 → cap3 → cap6, cùng 1 order_kehoach", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_NGHIEM"))
    fireEvent.click(submitButton())
    await waitFor(() => expect(recordKehoachMauThuanAsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachMauThuanAsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      conflict_level: "nghiem",
    })
    // ★ Cấp 4 KHÔNG còn ghi gì: khối tự chấm của nó đã bị thay.
    expect(recordKehoachCap4AsyncMock).not.toHaveBeenCalled()
    const order = [
      recordKehoachAsyncMock.mock.invocationCallOrder[0],
      recordKehoachCap2AsyncMock.mock.invocationCallOrder[0],
      recordKehoachCap3AsyncMock.mock.invocationCallOrder[0],
      recordKehoachMauThuanAsyncMock.mock.invocationCallOrder[0],
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("chưa chọn mức nhận định → KHÔNG ghi gì cho Cấp 6", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(submitButton())
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalled())
    expect(recordKehoachMauThuanAsyncMock).not.toHaveBeenCalled()
  })

  it("mã KHÔNG có mâu thuẫn → KHÔNG ghi gì cho Cấp 6 dù đã chọn một mức", async () => {
    mauThuanData = MAU_THUAN_KHONG
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_NHE"))
    fireEvent.click(submitButton())
    await waitFor(() => expect(placeOrderMock).toHaveBeenCalled())
    expect(recordKehoachMauThuanAsyncMock).not.toHaveBeenCalled()
  })

  it("★ POST lỗi KHÔNG nuốt event bus (ghiKehoachKhongChiMang)", async () => {
    recordKehoachMauThuanAsyncMock.mockImplementation(() => Promise.reject(new Error("500")))
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_NGHIEM"))
    fireEvent.click(submitButton())
    await waitFor(() => expect(onOrderFilledCap6Mock).toHaveBeenCalled())
    // Mọi bus cấp dưới cũng phải nhận được lệnh đã khớp.
    expect(onOrderFilledCap1Mock).toHaveBeenCalled()
    expect(onOrderFilledCap5Mock).toHaveBeenCalled()
  })
})

describe("TradingPanel — event lệnh khớp mang theo khối mâu thuẫn", () => {
  it("gửi nhận định + hai phe + cờ phủ quyết", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_NGHIEM"))
    fireEvent.click(submitButton())
    await waitFor(() => expect(onOrderFilledCap6Mock).toHaveBeenCalled())
    expect(onOrderFilledCap6Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "VCB",
        side: "buy",
        orderId: "order-1",
        conflictLevel: "nghiem",
        coMauThuan: true,
        phuQuyetKichHoat: true,
        lopPhuQuyetXau: ["noi_bo", "tin_tuc"],
        pheUngHo: ["ky_thuat", "dong_tien"],
        pheNguoc: ["noi_bo", "tin_tuc"],
      }),
    )
  })

  it("reset mức nhận định sau khi MUA khớp — lệnh sau phải nhận định lại", async () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_NGHIEM"))
    expect(mauThuanBlockProps.nhanDinh).toBe("nghiem")
    fireEvent.click(submitButton())
    await waitFor(() => expect(mauThuanBlockProps.nhanDinh).toBeNull())
  })
})

describe("TradingPanel — nút «Không mua lần này» (spec §7)", () => {
  it("hiện cạnh nút MUA khi mã có bảng mâu thuẫn", () => {
    renderPanel()
    const row = screen.getByTestId("cap6-khong-mua").parentElement as HTMLElement
    expect(row).toHaveClass("op-actions")
    expect(row).toContainElement(submitButton())
  })

  it("mã KHÔNG có mâu thuẫn → KHÔNG có nút", () => {
    mauThuanData = MAU_THUAN_KHONG
    renderPanel()
    // Neo dương tính: panel THẬT SỰ đã render (nút MUA vẫn đó).
    expect(submitButton()).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-khong-mua")).not.toBeInTheDocument()
  })

  it("tab BÁN → KHÔNG có nút", () => {
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    expect(submitButton("ĐẶT LỆNH BÁN")).toBeInTheDocument()
    expect(screen.queryByTestId("cap6-khong-mua")).not.toBeInTheDocument()
  })

  it("bấm khi ĐÃ nhận định: ghi nhận + POST /cap6/skip với đúng mức", async () => {
    renderPanel()
    fireEvent.click(screen.getByText("RATE_NGHIEM"))
    fireEvent.click(screen.getByTestId("cap6-khong-mua"))
    expect(onKhongMuaMock).toHaveBeenCalledWith("VCB", "nghiem")
    await waitFor(() =>
      expect(skipAsyncMock).toHaveBeenCalledWith({ symbol: "VCB", conflict_level: "nghiem" }),
    )
    const note = screen.getByTestId("cap6-khong-mua-note")
    expect(note).toHaveTextContent("Nghiêm trọng")
    expect(note).toHaveTextContent("chọn đứng ngoài")
  })

  it("bấm khi CHƯA nhận định: nói thẳng là chưa chọn mức, KHÔNG POST", () => {
    renderPanel()
    fireEvent.click(screen.getByTestId("cap6-khong-mua"))
    expect(onKhongMuaMock).toHaveBeenCalledWith("VCB", null)
    expect(skipAsyncMock).not.toHaveBeenCalled()
    expect(screen.getByTestId("cap6-khong-mua-note")).toHaveTextContent(
      "chưa chọn mức nhận định nào",
    )
  })

  it("bấm lần nữa = đổi ý, thu lại ghi nhận trên màn", () => {
    renderPanel()
    fireEvent.click(screen.getByText("RATE_NHE"))
    fireEvent.click(screen.getByTestId("cap6-khong-mua"))
    expect(screen.getByTestId("cap6-khong-mua")).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByTestId("cap6-khong-mua"))
    expect(screen.getByTestId("cap6-khong-mua")).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByTestId("cap6-khong-mua-note")).not.toBeInTheDocument()
  })

  it("KHÔNG khoá nút ĐẶT LỆNH MUA — «không mua» chỉ là ghi nhận", () => {
    renderPanel()
    satisfyCap2And3()
    fireEvent.click(screen.getByText("RATE_NGHIEM"))
    fireEvent.click(screen.getByTestId("cap6-khong-mua"))
    expect(submitButton()).not.toBeDisabled()
  })
})

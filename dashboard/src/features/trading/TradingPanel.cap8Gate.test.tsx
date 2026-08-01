import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PhienCap7 } from "@/features/cap7"
import type { KiemTraCap8 } from "@/features/cap8"

/**
 * Cấp 8 wiring inside `TradingPanel`/`OrderEntry` (Task FE1) — PURELY ADDITIVE
 * (spec §0: "Toàn bộ panel Cấp 7 GIỮ NGUYÊN"):
 *  - `KiemTraDanhMucBlock` renders ONLY inside a Cấp 8 session, buy-side, right
 *    before the MUA button.
 *  - **★ Cấp 8 NEVER gates MUA** (spec §9/§C8: cảnh báo MỀM) — nothing it adds
 *    may ever appear in the panel's `disabled` chain, not even when every
 *    warning is firing and the user has pressed nothing.
 *  - Every Cấp 1/2/3/4/5/6/7 block + cổng cứng chain behaves EXACTLY as
 *    `TradingPanel.cap7Gate.test.tsx` proves at Cấp 7.
 *  - A BUY fill posts `/cap8/kehoach` LAST in the kế hoạch chain (all cấp extend
 *    ONE `order_kehoach` row) with a `hanh_vi_canh_bao` that AGREES with what
 *    actually fired; a SELL fires Cấp 8's bus event.
 *  - **★ A 400 from `/cap8/kehoach` is NON-FATAL.** The buy has already
 *    happened by then, and the server legitimately rejects when the portfolio
 *    moved between the check and its own re-derivation. It must not throw, must
 *    not block, and above all must not swallow the shared order-filled events —
 *    if it did, NO cấp's Kết sổ would open.
 */

const { setSymbolMock, messageErrorMock } = vi.hoisted(() => ({
  setSymbolMock: vi.fn(),
  messageErrorMock: vi.fn(),
}))

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VCB", setSymbol: setSymbolMock }),
}))

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
      bid: BID_THUONG,
      ask: ASK_THUONG,
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
      error: messageErrorMock,
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
const recordKehoachAsyncMock = vi.fn(() => Promise.resolve({ id: "kh1" }))
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
    PlanFormCap1: (props: { onLyDoChange: (l: string) => void; vungMua: number | null }) => (
      <div data-testid="plan-form-cap1-mock">
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
const recordKehoachCap2AsyncMock = vi.fn(() => Promise.resolve({ id: "khc2-1" }))

vi.mock("@/features/cap2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap2")>()
  return {
    ...actual,
    useCap2Events: () => ({
      isCap2Active: true,
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
const recordKehoachCap3AsyncMock = vi.fn(() => Promise.resolve({ id: "khc3-1" }))

vi.mock("@/features/cap3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap3")>()
  return {
    ...actual,
    useCap3Events: () => ({
      isCap3Active: true,
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
            props.onKhoiLuong(800, 12.5)
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
const recordKehoachCap4AsyncMock = vi.fn(() => Promise.resolve({ id: "khc4-1" }))
const LOPS = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"] as const

vi.mock("@/features/cap4", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap4")>()
  return {
    ...actual,
    useCap4Events: () => ({
      isCap4Active: true,
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
            props.onAi5Lop?.({
              ky_thuat: "ok",
              dong_tien: "neu",
              noi_bo: "bad",
              tin_tuc: "ok",
              dinh_gia: "ok",
            })
          }}
        >
          RATE_ALL
        </button>
        {/* Cùng khối, nhưng chấm CÓ MÂU THUẪN (≥1 Ủng hộ + ≥1 Ngược chiều) — đó
            là điều kiện duy nhất làm bước Đối chiếu của Cấp 6 tồn tại, nên cũng
            là điều kiện duy nhất để `/cap6/kehoach` được gọi. */}
        <button
          type="button"
          onClick={() => {
            props.onRate("ky_thuat", "ok")
            props.onRate("dong_tien", "ok")
            props.onRate("noi_bo", "bad")
            props.onRate("tin_tuc", "bad")
            props.onRate("dinh_gia", "neu")
            props.onAi5Lop?.({
              ky_thuat: "ok",
              dong_tien: "neu",
              noi_bo: "bad",
              tin_tuc: "ok",
              dinh_gia: "ok",
            })
          }}
        >
          RATE_MAU_THUAN
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
    DungNgoaiButton: () => <div data-testid="dungngoai-mock" />,
  }
})

/* ── Cấp 6 ── */
const recordKehoachCap6AsyncMock = vi.fn(() => Promise.resolve({ id: "khc6-1" }))
const onOrderFilledCap6Mock = vi.fn()

vi.mock("@/features/cap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap6")>()
  return {
    ...actual,
    useCap6Events: () => ({
      isCap6Active: true,
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
      onLopQuyetDinh: (lop: string) => void
      onLyDo: (lyDo: string) => void
    }) => (
      <div data-testid="doichieu-mock">
        <button
          type="button"
          onClick={() => {
            props.onLopQuyetDinh("ky_thuat")
            props.onLyDo("Tin lớp kỹ thuật vì nền giá vừa xác nhận.")
          }}
        >
          PICK_DOICHIEU
        </button>
      </div>
    ),
  }
})

/* ── Cấp 7 ── */
const recordKehoachCap7AsyncMock = vi.fn(() => Promise.resolve({ id: "khc7-1" }))
const onOrderFilledCap7Mock = vi.fn()

const QUY_TAC_CAP7: PhienCap7["quy_tac"] = {
  nguong_cau_ap_dao: 1.5,
  nguong_cung_ap_dao: 1 / 1.5,
  bands: [
    { ma: "cau_ap_dao", ten: "Cầu áp đảo", dieu_kien_text: "Lực ≥ 1.50 : 1", giai_thich: "…" },
    { ma: "can_bang", ten: "Cân bằng", dieu_kien_text: "…", giai_thich: "…" },
    { ma: "cung_ap_dao", ten: "Cung áp đảo", dieu_kien_text: "…", giai_thich: "…" },
  ],
  co_canh_giac_he_so: 3,
  co_canh_giac_min_muc: 3,
  co_canh_giac_copy: "…",
  so_phien_cham: 2,
  dead_band_pct: 1,
  cham_giai_thich: "…",
}

vi.mock("@/features/cap7", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap7")>()
  return {
    ...actual,
    useCap7Events: () => ({
      isCap7Active: true,
      onLucShown: vi.fn(),
      onLucDoc: vi.fn(),
      onCoShown: vi.fn(),
      onCoHanhVi: vi.fn(),
      onOrderFilled: onOrderFilledCap7Mock,
      registerHandlers: vi.fn(),
    }),
    usePhienCap7: () => ({
      data: { trong_phien: true, gio_giao_dich_text: "…", giai_thich: "…", quy_tac: QUY_TAC_CAP7 },
      isLoading: false,
      isError: false,
    }),
    useRecordKehoachCap7: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap7AsyncMock,
      isPending: false,
    }),
    DocSoLenhBlock: (props: { onDocLuc: (d: string) => void }) => (
      <div data-testid="docsolenh-mock">
        <button type="button" onClick={() => props.onDocLuc("manh")}>
          DOC_MANH
        </button>
      </div>
    ),
  }
})

/* ── Cấp 8 ──
   `hanhViCanhBaoToSend` + `giamKhoiLuong` stay REAL (they decide the value the
   panel commits and the volume it writes back — the things under test); only the
   bus, the check query, the mutation and the block's rendering are stubbed. */
const recordKehoachCap8AsyncMock = vi.fn(() => Promise.resolve({ id: "khc8-1" }))
const onOrderFilledCap8Mock = vi.fn()
let isCap8ActiveFlag = true
let kiemTraProps: {
  symbol?: string
  khoiLuong?: number
  gia?: number
  catLo?: number | null
} = {}

const CO_CANH_BAO = {
  symbol: "VCB",
  khoi_luong: 100,
  nganh: "Ngân hàng",
  canh_bao: [{ ma: "don_nganh", ten: "Dồn ngành", text: "Dồn ngành Ngân hàng: 46.0%…" }],
  don_nganh_pct_sau: 46,
  tuong_quan: { symbol: "MBB", he_so: 0.82 },
  tuong_quan_canh_bao: false,
  tuong_quan_du_lieu: true,
  tong_rui_ro_pct_sau: 17,
  so_vi_the_thieu_cat_lo: 2,
} as unknown as KiemTraCap8

const KHONG_CANH_BAO = {
  ...CO_CANH_BAO,
  canh_bao: [],
  don_nganh_pct_sau: 22,
} as unknown as KiemTraCap8

let kiemTraState: { data: KiemTraCap8 | undefined; isLoading: boolean; isError: boolean } = {
  data: CO_CANH_BAO,
  isLoading: false,
  isError: false,
}

/**
 * ★ `null` = kết quả kiểm tra đã BẮT KỊP lệnh đang soạn (mock echo lại đúng mã +
 * khối lượng được hỏi) — trạng thái bình thường, sau khi debounce lắng.
 *
 * Đặt một giá trị vào đây để mô phỏng CỬA SỔ DEBOUNCE 400 ms của
 * `useKiemTraCap8`: user vừa đổi mã / đổi khối lượng, nhưng phản hồi đang giữ
 * vẫn tả LỆNH TRƯỚC. Mỗi bài dùng nó chỉ lệch ĐÚNG MỘT chiều (mã, hoặc khối
 * lượng) so với lệnh đang soạn, để biết chắc cổng nào đang chặn.
 */
let kiemTraLatch: { symbol: string; khoiLuong: number } | null = null

vi.mock("@/features/cap8", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap8")>()
  return {
    ...actual,
    useCap8Events: () => ({
      isCap8Active: isCap8ActiveFlag,
      onCheckShown: vi.fn(),
      onCheckHanhVi: vi.fn(),
      onOrderFilled: onOrderFilledCap8Mock,
      registerHandlers: vi.fn(),
    }),
    useKiemTraCap8: (input: { symbol: string; khoiLuong: number }) => {
      if (!kiemTraState.data) return kiemTraState
      const tra = kiemTraLatch ?? { symbol: input.symbol, khoiLuong: input.khoiLuong }
      return {
        ...kiemTraState,
        data: { ...kiemTraState.data, symbol: tra.symbol, khoi_luong: tra.khoiLuong },
      }
    },
    useRecordKehoachCap8: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap8AsyncMock,
      isPending: false,
    }),
    KiemTraDanhMucBlock: (props: {
      symbol: string
      khoiLuong: number
      gia: number
      catLo: number | null
      onHanhVi: (h: string) => void
      onGiamKhoiLuong: () => void
      onChonMaKhac: () => void
    }) => {
      kiemTraProps = {
        symbol: props.symbol,
        khoiLuong: props.khoiLuong,
        gia: props.gia,
        catLo: props.catLo,
      }
      return (
        <div data-testid="kiemtra-mock">
          <button
            type="button"
            onClick={() => {
              props.onHanhVi("giam_kl")
              props.onGiamKhoiLuong()
            }}
          >
            GIAM_KL
          </button>
          <button
            type="button"
            onClick={() => {
              props.onHanhVi("chon_ma_khac")
              props.onChonMaKhac()
            }}
          >
            CHON_MA_KHAC
          </button>
          <button type="button" onClick={() => props.onHanhVi("van_mua")}>
            VAN_MUA
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

/** Satisfy every Cấp 1-7 gate (Cấp 8 adds none of its own). */
function satisfyCap1To7() {
  fireEvent.click(screen.getByText("PICK_SLTP"))
  fireEvent.click(screen.getByText("PICK_VON"))
  fireEvent.click(screen.getByText("RATE_ALL"))
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  orderSide = "BUY"
  isCap8ActiveFlag = true
  kiemTraProps = {}
  kiemTraState = { data: CO_CANH_BAO, isLoading: false, isError: false }
  kiemTraLatch = null
  placeOrderMock.mockClear()
  messageErrorMock.mockClear()
  setSymbolMock.mockClear()
  recordKehoachMock.mockClear()
  recordKehoachAsyncMock.mockClear()
  recordKehoachCap2AsyncMock.mockClear()
  recordKehoachCap3AsyncMock.mockClear()
  recordKehoachCap4AsyncMock.mockClear()
  recordKehoachCap6AsyncMock.mockClear()
  recordKehoachCap7AsyncMock.mockClear()
  recordKehoachCap8AsyncMock.mockClear()
  // ★ `mockClear` KHÔNG gỡ implementation: một bài dùng `mockRejectedValue` sẽ để
  // lại lời hứa hỏng đó cho mọi bài sau nếu không đặt lại ở đây.
  recordKehoachAsyncMock.mockResolvedValue({ id: "kh1" })
  recordKehoachCap2AsyncMock.mockResolvedValue({ id: "khc2-1" })
  recordKehoachCap3AsyncMock.mockResolvedValue({ id: "khc3-1" })
  recordKehoachCap4AsyncMock.mockResolvedValue({ id: "khc4-1" })
  recordKehoachCap6AsyncMock.mockResolvedValue({ id: "khc6-1" })
  recordKehoachCap7AsyncMock.mockResolvedValue({ id: "khc7-1" })
  recordKehoachCap8AsyncMock.mockResolvedValue({ id: "khc8-1" })
  onOrderFilledCap1Mock.mockClear()
  onOrderFilledCap5Mock.mockClear()
  onOrderFilledCap6Mock.mockClear()
  onOrderFilledCap7Mock.mockClear()
  onOrderFilledCap8Mock.mockClear()
})

describe("TradingPanel — khối Kiểm tra danh mục chỉ có trong Cấp 8 (spec §4)", () => {
  it("hiện khối trong một phiên Cấp 8, kèm mã đang xem", () => {
    renderPanel()
    expect(screen.getByTestId("kiemtra-mock")).toBeInTheDocument()
    expect(kiemTraProps.symbol).toBe("VCB")
  })

  it("KHÔNG hiện ngoài Cấp 8 (Cấp 0-7 và giao dịch thường không đổi)", () => {
    isCap8ActiveFlag = false
    renderPanel()
    expect(screen.queryByTestId("kiemtra-mock")).not.toBeInTheDocument()
  })

  it("KHÔNG hiện ở tab BÁN — kiểm tra danh mục là bước của luồng MUA", () => {
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    expect(screen.queryByTestId("kiemtra-mock")).not.toBeInTheDocument()
  })

  it("đứng NGAY TRƯỚC nút MUA (spec §4) và sau khối Đọc sổ lệnh của Cấp 7", () => {
    renderPanel()
    const docSoLenh = screen.getByTestId("docsolenh-mock")
    const kiemTra = screen.getByTestId("kiemtra-mock")
    const submit = submitButton()
    expect(
      docSoLenh.compareDocumentPosition(kiemTra) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(kiemTra.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("★ truyền khối lượng + giá + cắt lỗ của CHÍNH lệnh đang soạn", () => {
    renderPanel()
    satisfyCap1To7()
    // Cấp 3 tự điền 800 CP; Cấp 2 đặt cắt lỗ 60,400.
    expect(kiemTraProps.khoiLuong).toBe(800)
    expect(kiemTraProps.gia).toBe(62_400)
    expect(kiemTraProps.catLo).toBe(60_400)
  })

  it("★ chưa đặt cắt lỗ → truyền null, KHÔNG truyền 0 (0 là 'không rủi ro')", () => {
    renderPanel()
    expect(kiemTraProps.catLo).toBeNull()
  })
})

describe("★ TradingPanel — Cấp 8 KHÔNG BAO GIỜ chặn MUA (spec §9/§C8)", () => {
  it("đủ cổng Cấp 1-7, có cảnh báo mà CHƯA bấm gì → nút MUA vẫn mở", () => {
    renderPanel()
    satisfyCap1To7()
    expect(submitButton()).not.toBeDisabled()
  })

  it("bước kiểm tra lỗi → nút MUA vẫn mở (xuống nước MỞ, không nhốt user)", () => {
    kiemTraState = { data: undefined, isLoading: false, isError: true }
    renderPanel()
    satisfyCap1To7()
    expect(submitButton()).not.toBeDisabled()
  })

  it("bước kiểm tra đang tải → nút MUA vẫn mở", () => {
    kiemTraState = { data: undefined, isLoading: true, isError: false }
    renderPanel()
    satisfyCap1To7()
    expect(submitButton()).not.toBeDisabled()
  })

  it("chuỗi cổng cứng Cấp 1-7 giữ nguyên: thiếu Cấp 3 là vẫn khoá", () => {
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("RATE_ALL"))
    expect(submitButton()).toBeDisabled()
  })

  it("mọi khối Cấp 1/2/3/4/5/6/7 vẫn nguyên trong phiên Cấp 8", () => {
    renderPanel()
    expect(screen.getByTestId("doc5lop-mock")).toBeInTheDocument()
    expect(screen.getByTestId("plan-form-cap1-mock")).toBeInTheDocument()
    expect(screen.getByTestId("sltp-block-mock")).toBeInTheDocument()
    expect(screen.getByTestId("quanlyvon-mock")).toBeInTheDocument()
    expect(screen.getByTestId("dungngoai-mock")).toBeInTheDocument()
    expect(screen.getByTestId("doichieu-mock")).toBeInTheDocument()
    expect(screen.getByTestId("docsolenh-mock")).toBeInTheDocument()
  })
})

describe("TradingPanel — 'Giảm khối lượng' và 'Chọn mã khác'", () => {
  it("★ Giảm khối lượng sửa CHÍNH ô Khối lượng của Cấp 3, giữ luật lô 100", () => {
    renderPanel()
    satisfyCap1To7()
    expect(kiemTraProps.khoiLuong).toBe(800)
    fireEvent.click(screen.getByText("GIAM_KL"))
    expect(kiemTraProps.khoiLuong).toBe(400)
    expect(kiemTraProps.khoiLuong! % 100).toBe(0)
  })

  it("★ khối lượng đã giảm KHÔNG bị auto-fill của Cấp 3 ghi đè lại", () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("GIAM_KL"))
    // Cấp 3 render lại và gọi onKhoiLuong(800) — ô phải GIỮ 400.
    fireEvent.click(screen.getByText("PICK_VON"))
    expect(kiemTraProps.khoiLuong).toBe(400)
  })

  it("★ Chọn mã khác KHÔNG đẩy mã rỗng qua terminal dùng chung", () => {
    // Mã rỗng không phải một trạng thái nào trong terminal: `CenterPanel` →
    // `TVChart` key toàn bộ effect khởi tạo theo `symbol`, nên một `setSymbol("")`
    // huỷ + dựng lại widget TradingView trên một mã không phân giải được, rồi huỷ
    // + dựng lại lần nữa khi bước chọn mã trả mã về. Bước chọn mã được mở từ
    // event `onCheckHanhVi("chon_ma_khac")` của bus Cấp 8 thay vì từ mã rỗng.
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("CHON_MA_KHAC"))
    expect(setSymbolMock).not.toHaveBeenCalled()
  })

  it("★ bấm 'Chọn mã khác' rồi vẫn mua CHÍNH mã đó → ghi 'van_mua'", async () => {
    // Cảnh báo bật trên VCB → «Chọn mã khác» → user quay lại và mua VCB Y NGUYÊN.
    // Ghi 'chon_ma_khac' ở đây là miễn cho lệnh một lần "mua bất chấp" ở nhiệm vụ
    // ②, in "bạn: Chọn mã khác ✓" ở Kết sổ và để coach khen một điều chỉnh KHÔNG
    // HỀ XẢY RA.
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("CHON_MA_KHAC"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "van_mua",
    })
    expect(onOrderFilledCap8Mock).toHaveBeenCalledWith(
      expect.objectContaining({ hanhViCanhBao: "van_mua" }),
    )
  })
})

describe("TradingPanel — ghi bước Kiểm tra danh mục sau cùng trong chuỗi kế hoạch", () => {
  it("MUA: cap1 → … → cap7 → cap8, cùng 1 order_kehoach", async () => {
    renderPanel()
    satisfyCap1To7()
    // Đọc lực để Cấp 7 cũng có khối của nó — mới so được thứ tự cap7 → cap8.
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1)
    expect(
      recordKehoachAsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap8AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
    expect(
      recordKehoachCap7AsyncMock.mock.invocationCallOrder[0] <
        recordKehoachCap8AsyncMock.mock.invocationCallOrder[0],
    ).toBe(true)
  })

  it("★ CÓ cảnh báo mà user mua thẳng → ghi 'van_mua' (KHÔNG 'khong_canh_bao')", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "van_mua",
    })
  })

  it("★ KHÔNG cảnh báo nào → ghi 'khong_canh_bao' (server 400 nếu ghi 'van_mua')", async () => {
    kiemTraState = { data: KHONG_CANH_BAO, isLoading: false, isError: false }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "khong_canh_bao",
    })
  })

  it("có cảnh báo + bấm 'Giảm khối lượng' → ghi 'giam_kl'", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("GIAM_KL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ hanh_vi_canh_bao: "giam_kl" }),
    )
  })

  it("★ lựa chọn còn sót từ lệnh có cảnh báo KHÔNG được dính sang lệnh sạch", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("VAN_MUA"))
    // Danh mục đổi giữa chừng → lệnh này không còn cảnh báo nào.
    kiemTraState = { data: KHONG_CANH_BAO, isLoading: false, isError: false }
    // Buộc panel render lại với kết quả kiểm tra MỚI (lựa chọn cũ vẫn còn trong
    // state — đó chính là cái bẫy đang được kiểm chứng).
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("MUA"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ hanh_vi_canh_bao: "khong_canh_bao" }),
    )
  })

  it("chưa kiểm tra được (lỗi) → KHÔNG ghi gì cho Cấp 8 (cột để null)", async () => {
    kiemTraState = { data: undefined, isLoading: false, isError: true }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).not.toHaveBeenCalled()
    // …và lệnh vẫn được đặt bình thường.
    expect(placeOrderMock).toHaveBeenCalledTimes(1)
  })

  it("ngoài Cấp 8 → KHÔNG ghi gì cho Cấp 8", async () => {
    isCap8ActiveFlag = false
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).not.toHaveBeenCalled()
  })
})

describe("★★ TradingPanel — kết quả kiểm tra phải nói về ĐÚNG lệnh đang đặt", () => {
  it("★ phản hồi còn tả MÃ KHÁC (cửa sổ debounce) → KHÔNG ghi khối Cấp 8", async () => {
    // `useKiemTraCap8` debounce 400 ms + cache 30 s: ngay sau khi đổi mã, phản hồi
    // đang giữ vẫn là của mã trước. Không có cổng cứng nào reset khi đổi mã, nên
    // nút MUA đã mở sẵn.
    kiemTraLatch = { symbol: "HPG", khoiLuong: 800 }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).not.toHaveBeenCalled()
    // …và lệnh vẫn khớp bình thường, chỉ là khối Cấp 8 để trống.
    expect(placeOrderMock).toHaveBeenCalledTimes(1)
  })

  it("★ phản hồi của mã khác KHÔNG được lên bus (Kết sổ sẽ kể ngành của mã đó)", async () => {
    kiemTraLatch = { symbol: "HPG", khoiLuong: 800 }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    const event = onOrderFilledCap8Mock.mock.calls[0][0] as Record<string, unknown>
    expect(event.symbol).toBe("VCB")
    expect(event.nganh).toBeUndefined()
    expect(event.donNganhPct).toBeUndefined()
    expect(event.tongRuiRoPct).toBeUndefined()
    expect(event.danhMucCanhBao).toBeUndefined()
    expect(event.hanhViCanhBao).toBeUndefined()
  })

  it("★ phản hồi còn tả KHỐI LƯỢNG KHÁC → KHÔNG ghi khối Cấp 8", async () => {
    // Chỉ lệch ĐÚNG một chiều so với bài trên: cùng mã VCB, khác khối lượng (Cấp
    // 3 tự điền 800 CP, phản hồi còn của 400 CP) — con số dồn ngành/rủi ro của
    // một lệnh 400 CP không mô tả một lệnh 800 CP.
    kiemTraLatch = { symbol: "VCB", khoiLuong: 400 }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).not.toHaveBeenCalled()
    expect(placeOrderMock).toHaveBeenCalledTimes(1)
  })

  it("phản hồi khớp cả mã lẫn khối lượng → ghi bình thường (đối chứng)", async () => {
    kiemTraLatch = { symbol: "VCB", khoiLuong: 800 }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
  })

  it("★ tương quan CHƯA TÍNH ĐƯỢC không được lên bus dù cờ cảnh báo bật", async () => {
    // `tuong_quan_du_lieu: false` = chưa đủ dữ liệu. Nếu chỉ xét
    // `tuong_quan_canh_bao`, Kết sổ sẽ in "MBB (~0.00)" — một hệ số server KHÔNG
    // tính được, hiện ra thành một con số.
    kiemTraState = {
      data: {
        ...CO_CANH_BAO,
        tuong_quan_canh_bao: true,
        tuong_quan_du_lieu: false,
      } as unknown as KiemTraCap8,
      isLoading: false,
      isError: false,
    }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap8Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tuongQuanCaoVoi: null }),
    )
  })

  it("tương quan tính được + cờ bật → vẫn lên bus (đối chứng)", async () => {
    kiemTraState = {
      data: {
        ...CO_CANH_BAO,
        tuong_quan_canh_bao: true,
        tuong_quan_du_lieu: true,
      } as unknown as KiemTraCap8,
      isLoading: false,
      isError: false,
    }
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap8Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tuongQuanCaoVoi: { symbol: "MBB", he_so: 0.82 } }),
    )
  })
})

describe("★★ TradingPanel — 'Giảm khối lượng' phải ghi được kể cả khi nó làm tắt cảnh báo", () => {
  it("★ giảm KL làm cảnh báo tắt → vẫn ghi 'giam_kl' kèm canh_bao_da_hien", async () => {
    // Giảm khối lượng CHÍNH LÀ thứ làm cảnh báo tắt: server suy lại theo lệnh đã
    // giảm sẽ không thấy cảnh báo nào và từ chối 'giam_kl'. Nếu FE hạ xuống
    // 'khong_canh_bao', một lệnh mà user ĐÃ NGHE lời được ghi thành "danh mục
    // không có cảnh báo nào" — nhánh coach khen người tuân thủ không bao giờ với
    // tới được.
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("GIAM_KL"))
    // Lần kiểm tra sau khi giảm (800 → 400 CP) sạch cảnh báo.
    kiemTraState = { data: KHONG_CANH_BAO, isLoading: false, isError: false }
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("MUA"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "giam_kl",
      canh_bao_da_hien: ["don_nganh"],
    })
  })

  it("★ Kết sổ kể lại đúng cảnh báo user đã thấy, không phải bản sau điều chỉnh", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("GIAM_KL"))
    kiemTraState = { data: KHONG_CANH_BAO, isLoading: false, isError: false }
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("MUA"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap8Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        danhMucCanhBao: ["don_nganh"],
        hanhViCanhBao: "giam_kl",
      }),
    )
  })

  it("★ 'Vẫn mua' KHÔNG kèm canh_bao_da_hien (server tự suy lại là nguồn đúng)", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("VAN_MUA"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "van_mua",
    })
  })
})

describe("★★ TradingPanel — 400 từ /cap8/kehoach là KHÔNG CHÍ MẠNG", () => {
  it("★ lỗi ghi Cấp 8 KHÔNG nuốt event lệnh khớp của bất kỳ cấp nào", async () => {
    // Danh mục dịch chuyển giữa lúc kiểm tra và lúc server suy lại → 400. Lệnh
    // MUA thì ĐÃ khớp rồi. Nếu lỗi này thoát ra, chuỗi onOrderFilled bên dưới bị
    // bỏ qua và KHÔNG Kết sổ của cấp nào mở được nữa.
    recordKehoachCap8AsyncMock.mockRejectedValue(new Error("400: mâu thuẫn cảnh báo"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap1Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap5Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap6Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap7Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1)
  })

  it("★ lỗi ghi Cấp 8 KHÔNG hiện lỗi lên mặt user (lệnh đã khớp rồi)", async () => {
    recordKehoachCap8AsyncMock.mockRejectedValue(new Error("400: mâu thuẫn cảnh báo"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    expect(messageErrorMock).not.toHaveBeenCalled()
  })

  it("★ lỗi ghi Cấp 8 KHÔNG chặn reset form cho lệnh sau", async () => {
    recordKehoachCap8AsyncMock.mockRejectedValue(new Error("400"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))

    // Form đã reset → cổng cứng Cấp 4 (5 lớp) khoá lại như một lệnh mới.
    expect(submitButton()).toBeDisabled()
  })
})

/**
 * ★★★ CÙNG MỘT HIỂM HOẠ, CHO CẢ TÁM CẤP.
 *
 * Cấp 8 được bọc `try/catch` từ đầu, nhưng `/cap1/kehoach` … `/cap7/kehoach` thì
 * không: một 500/timeout ở BẤT KỲ cái nào trong số đó ném lỗi ra `catch` của
 * `handleSubmit` → user thấy "Đặt lệnh MUA VCB thất bại" cho một lệnh ĐÃ khớp,
 * form không reset, và toàn bộ chuỗi `onOrderFilled` bị bỏ qua. Không có
 * `onOrderFilled` thì trang không ghi lệnh mua này vào `lastBuyBySymbolRef`, nên
 * khi user bán, Kết sổ của MỌI cấp lặng lẽ không mở (`if (!buy) return`) và lệnh
 * không bao giờ vào nhật ký.
 */
describe("★★★ TradingPanel — MỘT lần ghi kế hoạch hỏng KHÔNG được nuốt bus của cấp nào", () => {
  /** Mọi bus phải bắn đúng 1 lần cho lệnh MUA vừa khớp. */
  async function expectMoiBusVanBan() {
    await waitFor(() => expect(onOrderFilledCap1Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap5Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap6Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap7Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1)
    expect(messageErrorMock).not.toHaveBeenCalled()
  }

  it("★ /cap6/kehoach 500 → mọi bus vẫn bắn, không toast lỗi", async () => {
    recordKehoachCap6AsyncMock.mockRejectedValue(new Error("500: ghi đối chiếu hỏng"))
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("PICK_VON"))
    fireEvent.click(screen.getByText("RATE_MAU_THUAN"))
    fireEvent.click(screen.getByText("PICK_DOICHIEU"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    await expectMoiBusVanBan()
  })

  it("★ /cap6/kehoach 500 → các cấp SAU nó vẫn được ghi", async () => {
    recordKehoachCap6AsyncMock.mockRejectedValue(new Error("500"))
    renderPanel()
    fireEvent.click(screen.getByText("PICK_SLTP"))
    fireEvent.click(screen.getByText("PICK_VON"))
    fireEvent.click(screen.getByText("RATE_MAU_THUAN"))
    fireEvent.click(screen.getByText("PICK_DOICHIEU"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
  })

  it("★ /cap7/kehoach timeout → mọi bus vẫn bắn, không toast lỗi", async () => {
    recordKehoachCap7AsyncMock.mockRejectedValue(new Error("timeout"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    await expectMoiBusVanBan()
  })

  it("★ /cap7/kehoach timeout → khối Cấp 8 sau nó vẫn được ghi", async () => {
    recordKehoachCap7AsyncMock.mockRejectedValue(new Error("timeout"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
  })

  it("★ /cap1/kehoach 500 (gốc của cả chuỗi) → mọi bus vẫn bắn", async () => {
    recordKehoachAsyncMock.mockRejectedValue(new Error("500"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1))
    await expectMoiBusVanBan()
  })

  it("★ /cap2/kehoach 500 → mọi bus vẫn bắn", async () => {
    recordKehoachCap2AsyncMock.mockRejectedValue(new Error("500"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap2AsyncMock).toHaveBeenCalledTimes(1))
    await expectMoiBusVanBan()
  })

  it("★ /cap3/kehoach 500 → mọi bus vẫn bắn", async () => {
    recordKehoachCap3AsyncMock.mockRejectedValue(new Error("500"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap3AsyncMock).toHaveBeenCalledTimes(1))
    await expectMoiBusVanBan()
  })

  it("★ /cap4/kehoach 500 → mọi bus vẫn bắn", async () => {
    recordKehoachCap4AsyncMock.mockRejectedValue(new Error("500"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap4AsyncMock).toHaveBeenCalledTimes(1))
    await expectMoiBusVanBan()
  })

  it("★ /cap7/kehoach hỏng cũng KHÔNG chặn reset form cho lệnh sau", async () => {
    recordKehoachCap7AsyncMock.mockRejectedValue(new Error("timeout"))
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))

    expect(submitButton()).toBeDisabled()
  })
})

describe("TradingPanel — Cấp 8 nhận event lệnh khớp cạnh Cấp 1-7", () => {
  it("bắn cap8Events.onOrderFilled trên lệnh MUA khớp, kèm khối kiểm tra", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap8Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "VCB",
        side: "buy",
        quantity: 100,
        price: 62_400,
        orderId: "order-1",
        donNganhPct: 46,
        tongRuiRoPct: 17,
        danhMucCanhBao: ["don_nganh"],
        hanhViCanhBao: "van_mua",
      }),
    )
    expect(onOrderFilledCap1Mock).toHaveBeenCalledTimes(1)
    expect(onOrderFilledCap7Mock).toHaveBeenCalledTimes(1)
  })

  it("bắn cap8Events.onOrderFilled trên lệnh BÁN khớp (mở Kết sổ Cấp 8)", async () => {
    orderSide = "SELL"
    renderPanel()
    fireEvent.click(screen.getByText("BÁN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH BÁN"))

    await waitFor(() => expect(onOrderFilledCap8Mock).toHaveBeenCalledTimes(1))
    expect(onOrderFilledCap8Mock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "VCB", side: "sell", orderId: "order-1" }),
    )
    expect(onOrderFilledCap7Mock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "sell", orderId: "order-1" }),
    )
  })

  it("reset lựa chọn Cấp 8 sau khi MUA khớp — lệnh sau phải quyết lại", async () => {
    renderPanel()
    satisfyCap1To7()
    fireEvent.click(screen.getByText("GIAM_KL"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))

    satisfyCap1To7()
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(2))
    // Lệnh thứ hai: không bấm gì → 'van_mua', không còn dính 'giam_kl' của lệnh trước.
    expect(recordKehoachCap8AsyncMock.mock.calls[1][0]).toEqual({
      order_id: "order-1",
      hanh_vi_canh_bao: "van_mua",
    })
  })
})

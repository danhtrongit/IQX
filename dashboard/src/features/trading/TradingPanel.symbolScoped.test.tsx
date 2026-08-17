import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import type { PhienCap7 } from "@/features/cap7"
import type { KiemTraCap8 } from "@/features/cap8"

/**
 * ★★ MỘT LỰA CHỌN CHỈ NÓI VỀ MÃ NÓ ĐƯỢC ĐƯA RA CHO.
 *
 * `TradingPanel` giữ bước Đối chiếu (Cấp 6), bước Đọc sổ lệnh (Cấp 7) và bước
 * Kiểm tra danh mục (Cấp 8) trong state của CHÍNH nó, còn mã thì do
 * `SymbolProvider` của terminal dùng chung nắm. Đổi mã KHÔNG unmount panel và
 * KHÔNG reset chuỗi cổng cứng Cấp 1-4, nên nếu các lựa chọn ấy không gắn theo mã
 * thì chúng theo nguyên vẹn sang mã mới — và được ghi vào hồ sơ như một lời khai
 * user CHƯA BAO GIỜ nói ra về mã đó:
 *
 *  · Cấp 7 «đọc lực» của mã cũ được server chấm bằng diễn biến giá của mã MỚI;
 *  · Cấp 7 «Tôi hiểu — chờ xác nhận» thổi thẳng vào điều kiện tốt nghiệp ②
 *    (`so_lan_khong_duoi_theo_co`);
 *  · Cấp 6 «kiểu cổ phiếu» dự phòng của mã cũ được ghi cho mã mới;
 *  · Cấp 8 «Giảm khối lượng» ghi cho một lệnh chưa hề giảm gì.
 *
 * ★ File này KHÔNG mock `useSymbol` thành hằng số — nó dùng CHÍNH
 * `SymbolProvider` thật, nên các bài dưới đây đi đúng con đường đổi mã của
 * terminal (kể cả đường VỀ LẠI mã cũ).
 */

const { messageErrorMock } = vi.hoisted(() => ({ messageErrorMock: vi.fn() }))

/** Sổ lệnh có MỘT mức phình bất thường → cờ cảnh giác của Cấp 7 bật. */
const BID_CO = [
  { price: 62.3, volume: 3_000_000 },
  { price: 62.2, volume: 100_000 },
  { price: 62.1, volume: 100_000 },
]
const ASK_CO = [
  { price: 62.4, volume: 100_000 },
  { price: 62.5, volume: 100_000 },
  { price: 62.6, volume: 100_000 },
]

vi.mock("@/features/market-data", () => ({
  usePrice: (symbol: string) => ({
    data: {
      symbol,
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
      bid: BID_CO,
      ask: ASK_CO,
    },
    isLoading: false,
  }),
}))

const placeOrderMock = vi.fn(() =>
  Promise.resolve({
    id: "order-1",
    symbol: "VCB",
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
const recordKehoachAsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "kh1" }))
vi.mock("@/features/cap1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap1")>()
  return {
    ...actual,
    useCap1Events: () => ({
      isCap1Active: true,
      onLyDoPicked: vi.fn(),
      onOrderFilled: vi.fn(),
      onDocChiTietClicked: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    useRecordKehoach: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachAsyncMock,
      isPending: false,
    }),
    PlanFormCap1: () => <div data-testid="plan-form-cap1-mock" />,
    AiThanhTra: () => <div data-testid="ai-thanh-tra-mock" />,
  }
})

/* ── Cấp 2 ── */
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
      mutateAsync: vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc2-1" })),
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
      mutateAsync: vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc3-1" })),
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
      mutateAsync: vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc4-1" })),
      isPending: false,
    }),
    // Chấm CÓ MÂU THUẪN — điều kiện duy nhất làm bước Đối chiếu của Cấp 6 tồn tại.
    Doc5LopBlock: (props: {
      onRate: (lop: string, n: string) => void
      onAi5Lop?: (ai: Record<string, string>) => void
    }) => (
      <div data-testid="doc5lop-mock">
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
vi.mock("@/features/cap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5")>()
  return {
    ...actual,
    useCap5Events: () => ({
      isCap5Active: true,
      onDungNgoai: vi.fn(),
      onVerdictSettled: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    DungNgoaiButton: () => <div data-testid="dungngoai-mock" />,
  }
})

/* ── Cấp 6 ── */
const recordKehoachCap6AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc6-1" }))
vi.mock("@/features/cap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap6")>()
  return {
    ...actual,
    useCap6Events: () => ({
      isCap6Active: true,
      onConflictShown: vi.fn(),
      onLopQuyetDinhPicked: vi.fn(),
      onOrderFilled: vi.fn(),
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
      onKieuCoPhieu: (kieu: string) => void
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
        {/* Lối dự phòng: chỉ hiện khi server KHÔNG phân loại được kiểu từ ngành. */}
        <button type="button" onClick={() => props.onKieuCoPhieu("chu_ky")}>
          PICK_KIEU
        </button>
      </div>
    ),
  }
})

/* ── Cấp 7 ── */
const recordKehoachCap7AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc7-1" }))
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
      onOrderFilled: vi.fn(),
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
    DocSoLenhBlock: (props: {
      docLuc: string | null
      onDocLuc: (d: string) => void
      hanhViCo: string | null
      onHanhViCo: (h: string) => void
    }) => (
      <div data-testid="docsolenh-mock">
        <button type="button" onClick={() => props.onDocLuc("manh")}>
          DOC_MANH
        </button>
        <button type="button" onClick={() => props.onHanhViCo("cho_xac_nhan")}>
          CHO_XAC_NHAN
        </button>
        <span data-testid="cap7-doc-luc">{props.docLuc ?? "—"}</span>
        <span data-testid="cap7-hanh-vi-co">{props.hanhViCo ?? "—"}</span>
      </div>
    ),
  }
})

/* ── Cấp 8 ── */
const recordKehoachCap8AsyncMock = vi.fn<(...a: unknown[]) => unknown>(() => Promise.resolve({ id: "khc8-1" }))
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
  so_vi_the_thieu_cat_lo: 0,
} as unknown as KiemTraCap8

vi.mock("@/features/cap8", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap8")>()
  return {
    ...actual,
    useCap8Events: () => ({
      isCap8Active: true,
      onCheckShown: vi.fn(),
      onCheckHanhVi: vi.fn(),
      onOrderFilled: vi.fn(),
      registerHandlers: vi.fn(),
    }),
    // Kết quả kiểm tra luôn BẮT KỊP lệnh đang soạn (mã + khối lượng đang hỏi) —
    // cửa sổ debounce có bài riêng ở `TradingPanel.cap8Gate.test.tsx`.
    useKiemTraCap8: (input: { symbol: string; khoiLuong: number }) => ({
      data: { ...CO_CANH_BAO, symbol: input.symbol, khoi_luong: input.khoiLuong },
      isLoading: false,
      isError: false,
    }),
    useRecordKehoachCap8: () => ({
      mutate: vi.fn(),
      mutateAsync: recordKehoachCap8AsyncMock,
      isPending: false,
    }),
    KiemTraDanhMucBlock: (props: {
      hanhVi: string | null
      onHanhVi: (h: string) => void
      onGiamKhoiLuong: () => void
      onChonMaKhac: () => void
    }) => (
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
        <span data-testid="cap8-hanh-vi">{props.hanhVi ?? "—"}</span>
      </div>
    ),
  }
})

import { TradingPanel } from "./TradingPanel"

/** Đổi mã đúng cách terminal làm: qua `SymbolProvider` dùng chung. */
function DoiMa() {
  const { symbol, setSymbol } = useSymbol()
  return (
    <div>
      <span data-testid="ma-dang-xem">{symbol}</span>
      <button type="button" onClick={() => setSymbol("HPG")}>
        XEM_HPG
      </button>
      <button type="button" onClick={() => setSymbol("VCB")}>
        XEM_VCB
      </button>
    </div>
  )
}

function renderPanel() {
  get.mockReturnValue({ json: () => Promise.resolve(null) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SymbolProvider symbol="VCB">
        <DoiMa />
        <TradingPanel />
      </SymbolProvider>
    </QueryClientProvider>,
  )
}

/**
 * Mở đủ chuỗi cổng cứng Cấp 1-4 + bước Đối chiếu Cấp 6.
 *
 * ★ KHÔNG cái nào trong số này gắn theo mã — đó chính là lý do cái bẫy tồn tại:
 * đổi mã xong, nút MUA vẫn mở sẵn cho mã mới.
 */
function moCongCung() {
  fireEvent.click(screen.getByText("PICK_SLTP"))
  fireEvent.click(screen.getByText("PICK_VON"))
  fireEvent.click(screen.getByText("RATE_MAU_THUAN"))
  fireEvent.click(screen.getByText("PICK_DOICHIEU"))
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  placeOrderMock.mockClear()
  messageErrorMock.mockClear()
  recordKehoachAsyncMock.mockClear()
  recordKehoachCap6AsyncMock.mockClear()
  recordKehoachCap7AsyncMock.mockClear()
  recordKehoachCap8AsyncMock.mockClear()
})

describe("★★ TradingPanel — bước đọc lực Cấp 7 KHÔNG theo user sang mã khác", () => {
  it("đối chứng: đọc lực rồi mua CHÍNH mã đó → có ghi khối đọc lực", async () => {
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ luc_doc_user: "manh" }),
    )
  })

  it("★ đọc lực trên VCB rồi đổi sang HPG → HPG KHÔNG ghi khối đọc lực nào", async () => {
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("XEM_HPG"))
    // Bản đọc của mã cũ phải biến mất khỏi khối ngay khi đổi mã.
    expect(screen.getByTestId("cap7-doc-luc")).toHaveTextContent("—")

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachAsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).not.toHaveBeenCalled()
  })

  it("★ 'Tôi hiểu — chờ xác nhận' của VCB KHÔNG được ghi cho lệnh HPG", async () => {
    // Đây là lời khai nuôi điều kiện tốt nghiệp ② (`so_lan_khong_duoi_theo_co`):
    // nói hộ user một câu họ chưa từng nói về HPG là tự chế ra một chân tốt nghiệp.
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("CHO_XAC_NHAN"))
    fireEvent.click(screen.getByText("XEM_HPG"))
    expect(screen.getByTestId("cap7-hanh-vi-co")).toHaveTextContent("—")

    // Đọc lại sổ cho HPG (bước đọc lực là của mã mới), rồi mua.
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ co_canh_giac_lenh_gia: true, hanh_vi_co: "mua_duoi_theo" }),
    )
  })

  it("đối chứng: 'chờ xác nhận' cho CHÍNH mã đang mua thì vẫn được ghi", async () => {
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("DOC_MANH"))
    fireEvent.click(screen.getByText("CHO_XAC_NHAN"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap7AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap7AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ hanh_vi_co: "cho_xac_nhan" }),
    )
  })
})

describe("★★ TradingPanel — kiểu cổ phiếu Cấp 6 KHÔNG theo user sang mã khác", () => {
  it("đối chứng: chọn kiểu rồi mua CHÍNH mã đó → kiểu được gửi lên", async () => {
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("PICK_KIEU"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap6AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ kieu_co_phieu: "chu_ky" }),
    )
  })

  it("★ kiểu chọn cho VCB KHÔNG được gửi kèm lệnh HPG", async () => {
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("PICK_KIEU"))
    fireEvent.click(screen.getByText("XEM_HPG"))
    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))

    await waitFor(() => expect(recordKehoachCap6AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap6AsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ kieu_co_phieu: null }),
    )
  })
})

describe("★★ TradingPanel — lựa chọn trước cảnh báo Cấp 8 KHÔNG theo user sang mã khác", () => {
  it("★ 'Giảm khối lượng' trên VCB KHÔNG được ghi cho lệnh HPG", async () => {
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("GIAM_KL"))
    fireEvent.click(screen.getByText("XEM_HPG"))
    expect(screen.getByTestId("cap8-hanh-vi")).toHaveTextContent("—")

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    // Không kèm `canh_bao_da_hien`: lệnh HPG này chưa hề được điều chỉnh gì.
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "van_mua",
    })
  })

  it("★ «Chọn mã khác» rồi QUAY LẠI chính mã đó → ghi 'van_mua'", async () => {
    // Đường về đúng nút "Quay lại mã trước đó" của bước chọn mã: mã cũ trở lại,
    // lệnh mua KHÔNG hề đổi. Ghi 'chon_ma_khac' ở đây là ghi nhận một điều chỉnh
    // chưa từng xảy ra — và miễn cho lệnh một lần "mua bất chấp" của nhiệm vụ ②.
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("CHON_MA_KHAC"))
    fireEvent.click(screen.getByText("XEM_HPG"))
    fireEvent.click(screen.getByText("XEM_VCB"))
    expect(screen.getByTestId("ma-dang-xem")).toHaveTextContent("VCB")
    expect(screen.getByTestId("cap8-hanh-vi")).toHaveTextContent("—")

    fireEvent.click(screen.getByText("ĐẶT LỆNH MUA"))
    await waitFor(() => expect(recordKehoachCap8AsyncMock).toHaveBeenCalledTimes(1))
    expect(recordKehoachCap8AsyncMock).toHaveBeenCalledWith({
      order_id: "order-1",
      hanh_vi_canh_bao: "van_mua",
    })
  })

  it("★ «Chọn mã khác» KHÔNG bao giờ đẩy mã rỗng qua terminal dùng chung", () => {
    // `CenterPanel` → `TVChart` key toàn bộ effect khởi tạo theo `symbol`: một mã
    // rỗng huỷ + dựng lại widget TradingView trên một mã không phân giải được.
    renderPanel()
    moCongCung()
    fireEvent.click(screen.getByText("CHON_MA_KHAC"))
    expect(screen.getByTestId("ma-dang-xem")).toHaveTextContent("VCB")
  })
})

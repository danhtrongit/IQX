import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import { useSymbol } from "@/shared/contexts/symbol-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { VerdictGoiY } from "@/features/cap5/types"
import type { GoiYCap6 } from "@/features/cap6/types"
import type { PhienCap7 } from "@/features/cap7/types"
import type { Cap8Progress } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap8ProgressMock,
  usePhienCap7Mock,
  useDiemKyLuatMock,
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  recordKetsoCap5Async,
  completeCap6TaskMutate,
  completeCap7TaskMutate,
  completeCap8TaskMutate,
  graduateCap8Mutate,
  enterCap8Mutate,
  setKhauViMutate,
  recordCap1TradeMock,
  recordCap2TradeMock,
  recordCap2ScoreMock,
  recordCap3TradeMock,
  recordCap4TradeMock,
  recordCap5TradeMock,
  recordCap6TradeMock,
  recordCap7TradeMock,
  getGoiYMock,
  verdictQuery,
  navigateMock,
  messageSuccess,
} = vi.hoisted(() => ({
  useCap1ProgressMock: vi.fn(),
  useCap2ProgressMock: vi.fn(),
  useCap3ProgressMock: vi.fn(),
  useCap8ProgressMock: vi.fn(),
  usePhienCap7Mock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  recordKetsoCap5Async: vi.fn(),
  completeCap6TaskMutate: vi.fn(),
  completeCap7TaskMutate: vi.fn(),
  completeCap8TaskMutate: vi.fn(),
  graduateCap8Mutate: vi.fn(),
  enterCap8Mutate: vi.fn(),
  setKhauViMutate: vi.fn(),
  recordCap1TradeMock: vi.fn(),
  recordCap2TradeMock: vi.fn(),
  recordCap2ScoreMock: vi.fn(),
  recordCap3TradeMock: vi.fn(),
  recordCap4TradeMock: vi.fn(),
  recordCap5TradeMock: vi.fn(),
  recordCap6TradeMock: vi.fn(),
  recordCap7TradeMock: vi.fn(),
  getGoiYMock: vi.fn(),
  verdictQuery: { current: {} as Record<string, unknown> },
  navigateMock: vi.fn(),
  messageSuccess: vi.fn(),
}))

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock("@arco-design/web-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arco-design/web-react")>()
  return {
    ...actual,
    Message: { ...actual.Message, success: messageSuccess, error: vi.fn(), info: vi.fn() },
  }
})

// Terminal children are the EXISTING, untouched dashboard components — stub them
// (mirrors `cap7/Cap7TradingPage.test.tsx`). The stub fires the SAME buses the
// real `TradingPanel` fires: cap1→cap4 + cap6 + cap7 + cap8 on a BUY, and ALL
// EIGHT on a SELL. It also owns the `setSymbol("")` that Cấp 8's `Chọn mã khác`
// performs, because that is the panel's side effect, not the block's.
vi.mock("@/features/dashboard", () => ({
  CenterPanel: () => <div data-testid="center-panel" />,
  RightSidebar: () => <RightSidebarStub />,
  RightToolbar: ({ onActionClick }: { onActionClick?: (id: string) => void }) => (
    <button data-testid="right-toolbar" onClick={() => onActionClick?.("ai-insight")}>
      AI Phân tích
    </button>
  ),
}))

// 5 lớp MÂU THUẪN (≥1 Ủng hộ + ≥1 Ngược chiều) → lệnh này đi qua bước Đối chiếu.
const DOC_5_LOP = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "bad",
  dinh_gia: "ok",
} as const

const AI_5_LOP = {
  ky_thuat: "ok",
  dong_tien: "ok",
  noi_bo: "neu",
  tin_tuc: "ok",
  dinh_gia: "neu",
} as const

function RightSidebarStub() {
  const { onOrderFilled: cap1OnOrderFilled, isCap1Active } = useCap1Events()
  const { onOrderFilled: cap2OnOrderFilled, isCap2Active } = useCap2Events()
  const { onOrderFilled: cap3OnOrderFilled, isCap3Active } = useCap3Events()
  const { onOrderFilled: cap4OnOrderFilled, isCap4Active } = useCap4Events()
  const { onOrderFilled: cap5OnOrderFilled, isCap5Active } = useCap5Events()
  const { onOrderFilled: cap6OnOrderFilled, isCap6Active } = useCap6Events()
  const { onOrderFilled: cap7OnOrderFilled, isCap7Active } = useCap7Events()
  const { onOrderFilled: cap8OnOrderFilled, isCap8Active } = useCap8Events()
  const { symbol, setSymbol } = useSymbol()

  const fireLowerBuy = (sym: string, orderId: string, withDoc5Lop: boolean) => {
    cap1OnOrderFilled?.({
      symbol: sym,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      lyDo: "dong_tien",
      trangThaiLucDat: "ung_ho",
      vungMua: 60_000,
    })
    cap2OnOrderFilled?.({
      symbol: sym,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      phuongPhapSlTp: "ho_tro_khang_cu",
      catLo: 58_000,
      chotLoi: 65_000,
    })
    cap3OnOrderFilled?.({
      symbol: sym,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      khauVi: "can_bang",
      mucTuTin: 3,
      cachKhoiLuong: "linh_hoat",
      khoiLuong: 300,
      pctVon: 18,
    })
    cap4OnOrderFilled?.({
      symbol: sym,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      ...(withDoc5Lop
        ? {
            doc5Lop: { ...DOC_5_LOP },
            ai5Lop: { ...AI_5_LOP },
            soLopDongThuan: 3,
            soLopKhacAi: 2,
          }
        : {}),
    })
    cap5OnOrderFilled?.({ symbol: sym, side: "buy", quantity: 300, price: 60_000, orderId })
    cap6OnOrderFilled?.({
      symbol: sym,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      kieuCoPhieu: null,
      lopQuyetDinh: "dinh_gia",
      lyDoDoiChieu: "P/B rẻ, tin xấu chỉ ngắn hạn",
      lopMauThuan: { ...DOC_5_LOP },
    })
    cap7OnOrderFilled?.({
      symbol: sym,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      lucChiSo: 1.94,
      lucDocUser: "manh",
      coCanhGiac: false,
      hanhViCo: null,
    })
  }

  const fireSell = (sym: string, orderId: string, price: number) => {
    const sellEvent = { symbol: sym, side: "sell" as const, quantity: 300, price, orderId }
    cap1OnOrderFilled?.(sellEvent)
    cap2OnOrderFilled?.(sellEvent)
    cap3OnOrderFilled?.(sellEvent)
    cap4OnOrderFilled?.(sellEvent)
    cap5OnOrderFilled?.(sellEvent)
    cap6OnOrderFilled?.(sellEvent)
    cap7OnOrderFilled?.(sellEvent)
    cap8OnOrderFilled?.(sellEvent)
  }

  return (
    <div data-testid="right-sidebar">
      <span data-testid="bus-spy">
        {`${isCap1Active}-${isCap2Active}-${isCap3Active}-${isCap4Active}-${isCap5Active}-${isCap6Active}-${isCap7Active}-${isCap8Active}`}
      </span>
      <span data-testid="symbol-spy">{symbol}</span>
      {/* Cấp 8's `Chọn mã khác` — FE1 wires exactly this `setSymbol("")`. */}
      <button data-testid="chon-ma-khac" onClick={() => setSymbol("")}>
        chọn mã khác
      </button>
      <button
        data-testid="fire-buy"
        onClick={() => {
          fireLowerBuy("VNM", "buy-1", true)
          cap8OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            donNganhPct: 46,
            nganh: "Ngân hàng",
            tuongQuanCaoVoi: { symbol: "MBB", he_so: 0.82 },
            tongRuiRoPct: 17,
            soViTheThieuCatLo: 2,
            danhMucCanhBao: ["don_nganh"],
            hanhViCanhBao: "giam_kl",
          })
        }}
      >
        fire buy (có cảnh báo, đã giảm KL)
      </button>
      <button
        data-testid="fire-buy-chua-tinh"
        onClick={() => {
          fireLowerBuy("SSI", "buy-chua", true)
          // Bước kiểm tra CHẠY nhưng server không tính được thước đo nào (chưa
          // định giá được danh mục / chưa đủ lịch sử giá).
          cap8OnOrderFilled?.({
            symbol: "SSI",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-chua",
            donNganhPct: null,
            nganh: null,
            tuongQuanCaoVoi: null,
            tongRuiRoPct: null,
            danhMucCanhBao: [],
            hanhViCanhBao: "khong_canh_bao",
          })
        }}
      >
        fire buy (chưa tính được)
      </button>
      <button
        data-testid="fire-buy-du-cat-lo"
        onClick={() => {
          fireLowerBuy("FPT", "buy-du", true)
          cap8OnOrderFilled?.({
            symbol: "FPT",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-du",
            donNganhPct: 12,
            nganh: "Công nghệ",
            tuongQuanCaoVoi: null,
            tongRuiRoPct: 9,
            soViTheThieuCatLo: 0,
            danhMucCanhBao: [],
            hanhViCanhBao: "khong_canh_bao",
          })
        }}
      >
        fire buy (mọi vị thế đã có cắt lỗ)
      </button>
      <button
        data-testid="fire-buy-no-kiemtra"
        onClick={() => {
          // Mua mà bước Kiểm tra danh mục không chạy được (degrade OPEN) →
          // `TradingPanel` KHÔNG gắn khối Cấp 8 nào.
          fireLowerBuy("HPG", "buy-2", true)
          cap8OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-2",
          })
        }}
      >
        fire buy without kiểm tra
      </button>
      <button
        data-testid="fire-buy-vnm-again-no-kiemtra"
        onClick={() => {
          // CÙNG mã VNM, lệnh mua thứ hai, lần này bước kiểm tra không chạy.
          fireLowerBuy("VNM", "buy-1b", true)
          cap8OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1b",
          })
        }}
      >
        fire buy VNM again (không kiểm tra)
      </button>
      <button
        data-testid="fire-buy-no-doc5lop"
        onClick={() => {
          fireLowerBuy("VIC", "buy-3", false)
          cap8OnOrderFilled?.({
            symbol: "VIC",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-3",
          })
        }}
      >
        fire buy without đọc 5 lớp
      </button>
      <button data-testid="fire-sell" onClick={() => fireSell("VNM", "sell-1", 65_500)}>
        fire sell
      </button>
      <button data-testid="fire-sell-ssi" onClick={() => fireSell("SSI", "sell-chua", 61_000)}>
        fire sell SSI
      </button>
      <button data-testid="fire-sell-fpt" onClick={() => fireSell("FPT", "sell-du", 61_000)}>
        fire sell FPT
      </button>
      <button data-testid="fire-sell-hpg" onClick={() => fireSell("HPG", "sell-2", 61_000)}>
        fire sell HPG
      </button>
      <button data-testid="fire-sell-vic" onClick={() => fireSell("VIC", "sell-3", 61_000)}>
        fire sell VIC
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

vi.mock("@/features/cap1/hooks", () => ({
  useCap1Progress: (...a: unknown[]) => useCap1ProgressMock(...a),
  useRecordKetso: () => ({ mutate: vi.fn(), mutateAsync: recordKetsoCap1Async }),
}))
vi.mock("@/features/cap1/tradeLog", () => ({
  useCap1TradeLog: () => ({ trades: [], record: recordCap1TradeMock }),
}))
vi.mock("@/features/cap2/hooks", () => ({
  useCap2Progress: (...a: unknown[]) => useCap2ProgressMock(...a),
  useRecordKetsoCap2: () => ({ mutate: recordKetsoCap2Mutate }),
  useDiemKyLuat: (...a: unknown[]) => useDiemKyLuatMock(...a),
}))
vi.mock("@/features/cap2/tradeLogCap2", () => ({
  useCap2TradeLog: () => ({
    trades: [],
    scores: [],
    record: recordCap2TradeMock,
    recordScore: recordCap2ScoreMock,
  }),
}))
vi.mock("@/features/cap3/hooks", () => ({
  useCap3Progress: (...a: unknown[]) => useCap3ProgressMock(...a),
  useSetKhauVi: () => ({ mutate: setKhauViMutate, isPending: false }),
  useEnterCap3: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/cap3/tradeLogCap3", () => ({
  useCap3TradeLog: () => ({ trades: [], record: recordCap3TradeMock }),
}))
vi.mock("@/features/cap4/tradeLogCap4", () => ({
  useCap4TradeLog: () => ({ trades: [], record: recordCap4TradeMock }),
}))
vi.mock("@/features/cap5/hooks", () => ({
  useCap5Progress: () => ({ data: null }),
  useVerdictGoiY: () => verdictQuery.current,
  useRecordKetsoCap5: () => ({ mutateAsync: recordKetsoCap5Async, isPending: false }),
}))
vi.mock("@/features/cap5/tradeLogCap5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap5/tradeLogCap5")>()
  return { ...actual, useCap5TradeLog: () => ({ trades: [], record: recordCap5TradeMock }) }
})
vi.mock("@/features/cap6/hooks", () => ({
  useCap6Progress: () => ({ data: null }),
  useCompleteCap6Task: () => ({ mutate: completeCap6TaskMutate, isPending: false }),
}))
vi.mock("@/features/cap6/tradeLogCap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap6/tradeLogCap6")>()
  return { ...actual, useCap6TradeLog: () => ({ trades: [], record: recordCap6TradeMock }) }
})
vi.mock("@/features/cap6/api", () => ({
  cap6Api: { getGoiY: (...a: unknown[]) => getGoiYMock(...a) },
}))
vi.mock("@/features/cap7/hooks", () => ({
  usePhienCap7: (...a: unknown[]) => usePhienCap7Mock(...a),
  useCompleteCap7Task: () => ({ mutate: completeCap7TaskMutate, isPending: false }),
}))
vi.mock("@/features/cap7/tradeLogCap7", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap7/tradeLogCap7")>()
  return { ...actual, useCap7TradeLog: () => ({ trades: [], record: recordCap7TradeMock }) }
})

// Cấp 8's own hooks.
vi.mock("./hooks", () => ({
  useCap8Progress: (...a: unknown[]) => useCap8ProgressMock(...a),
  useEnterCap8: () => ({ mutate: enterCap8Mutate, isPending: false }),
  useCompleteCap8Task: () => ({ mutate: completeCap8TaskMutate, isPending: false }),
  useGraduateCap8: () => ({ mutate: graduateCap8Mutate, isPending: false }),
  useThachThucCap8: () => ({ data: undefined }),
}))

import { Cap8TradingPage } from "./Cap8TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "@/features/cap2/Cap2Context"
import { useCap3Events } from "@/features/cap3/Cap3Context"
import { useCap4Events } from "@/features/cap4/Cap4Context"
import { useCap5Events } from "@/features/cap5/Cap5Context"
import { useCap6Events } from "@/features/cap6/Cap6Context"
import { useCap7Events } from "@/features/cap7/Cap7Context"
import { useCap8Events } from "./Cap8Context"

function fakeCap1Progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    task_6_done_at: "t",
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lan_xem_danh_muc: 3,
    so_lenh_thuc_chien: 88,
    graduated_at: "2026-01-05T00:00:00Z",
    time_to_graduate_hours: 40,
    ...overrides,
  }
}

function fakeCap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p2",
    user_id: "u1",
    entered_at: "2026-01-06T00:00:00Z",
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    task_4_done_at: "t",
    task_5_done_at: "t",
    chuoi_current: 6,
    chuoi_record: 8,
    last_chuoi_reset_at: null,
    graduated_at: "2026-01-20T00:00:00Z",
    time_to_graduate_hours: 80,
    ...overrides,
  }
}

function fakeCap3Progress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "p3",
    user_id: "u1",
    entered_at: "2026-01-21T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: "t",
    task_2_done_at: "t",
    task_3_done_at: "t",
    so_lenh_cap3: 18,
    lai_pct_cap3: 6.4,
    diem_ky_luat_tb_cap3: 84,
    graduated_at: "2026-02-10T00:00:00Z",
    time_to_graduate_hours: 120,
    ...overrides,
  }
}

function fakeCap8Progress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return {
    id: "p8",
    user_id: "u1",
    entered_at: "2026-11-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_kiem_tra: 4,
    so_lan_mua_bat_chap_canh_bao: 1,
    don_nganh_max_pct: null,
    tong_rui_ro_pct: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    so_lan_co_canh_bao: 2,
    bat_chap_gan_day: 1,
    cua_so_gan_day: 15,
    so_lenh_da_ket_so: 3,
    ...overrides,
  }
}

function fakePhien(overrides: Partial<PhienCap7> = {}): PhienCap7 {
  return {
    trong_phien: true,
    gio_giao_dich_text: "09:00-11:30 và 13:00-14:45 các ngày trong tuần",
    giai_thich: "Đang trong giờ giao dịch — sổ lệnh đang sống.",
    quy_tac: {
      nguong_cau_ap_dao: 1.5,
      nguong_cung_ap_dao: 1 / 1.5,
      bands: [
        {
          ma: "cau_ap_dao",
          ten: "Cầu áp đảo",
          dieu_kien_text: "Lực ≥ 1.50 : 1",
          giai_thich: "Bên mua xếp hàng dày hơn hẳn.",
        },
        {
          ma: "can_bang",
          ten: "Cân bằng",
          dieu_kien_text: "0.67 : 1 < Lực < 1.50 : 1",
          giai_thich: "Hai bên xấp xỉ nhau.",
        },
        {
          ma: "cung_ap_dao",
          ten: "Cung áp đảo",
          dieu_kien_text: "Lực ≤ 0.67 : 1",
          giai_thich: "Bên bán xếp hàng dày hơn hẳn.",
        },
      ],
      co_canh_giac_he_so: 3,
      co_canh_giac_min_muc: 3,
      co_canh_giac_copy: "Lệnh treo to chưa chắc là cầu/cung thật.",
      so_phien_cham: 2,
      dead_band_pct: 1,
      cham_giai_thich: "Sau 2 phiên giao dịch kể từ ngày bạn mua, hệ lấy giá đóng cửa thật.",
    },
    ...overrides,
  }
}

function fakeDiemKyLuat(overrides: Partial<DiemKyLuat> = {}): DiemKyLuat {
  return {
    ngay: "2026-11-02",
    co_giao_dich: false,
    co_tinh_huong: false,
    diem: null,
    xep_loai: null,
    giai_thich: "Ngày không đặt lệnh nào.",
    thanh_phan: null,
    ...overrides,
  }
}

function fakeVerdict(overrides: Partial<VerdictGoiY> = {}): VerdictGoiY {
  return {
    order_id: "sell-1",
    verdict: "dung",
    giai_thich: "Lệnh này theo đúng kế hoạch + kỷ luật của bạn.",
    signals: [
      { ma: "co_so", ten: "Cơ sở khi đặt lệnh", dat: true, giai_thich: "4/5 lớp Ủng hộ lúc đặt" },
    ],
    pnl_pct: 9.2,
    thang: true,
    o_4_du_kien: "dung_thang",
    ...overrides,
  }
}

function fakeGoiY(overrides: Partial<GoiYCap6> = {}): GoiYCap6 {
  return {
    symbol: "VNM",
    nganh: "Hàng tiêu dùng",
    kieu: "phong_thu",
    kieu_ten: "Phòng thủ / tiêu dùng",
    lop_uu_tien: ["dinh_gia", "noi_bo"],
    lop_uu_tien_ten: ["Định giá", "Nội bộ"],
    lop_it_tin: ["ky_thuat"],
    lop_it_tin_ten: ["Kỹ thuật"],
    giai_thich: "Ít biến động; giá trị + nội bộ ổn định.",
    ...overrides,
  }
}

function renderCap8(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

/** Mở Kết sổ Cấp 8 cho lệnh mẫu (buy VNM có kiểm tra danh mục → sell VNM). */
async function openKetso() {
  fireEvent.click(screen.getByTestId("fire-buy"))
  fireEvent.click(screen.getByTestId("fire-sell"))
  await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
}

describe("Cap8TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress() })
    useCap8ProgressMock.mockReset()
    useCap8ProgressMock.mockReturnValue({ data: fakeCap8Progress() })
    usePhienCap7Mock.mockReset()
    usePhienCap7Mock.mockReturnValue({ data: fakePhien() })
    useDiemKyLuatMock.mockReset()
    useDiemKyLuatMock.mockReturnValue({ data: fakeDiemKyLuat(), isLoading: false })
    recordKetsoCap1Async.mockReset()
    recordKetsoCap1Async.mockResolvedValue({ id: "ks1" })
    recordKetsoCap2Mutate.mockReset()
    recordKetsoCap5Async.mockReset()
    recordKetsoCap5Async.mockResolvedValue({
      id: "k5",
      order_id: "sell-1",
      pnl_pct: 9.2,
      verdict_he: "dung",
      verdict_user: "dung",
      verdict_provenance: null,
      o_4: "dung_thang",
      ly_do_sua: null,
    })
    completeCap6TaskMutate.mockReset()
    completeCap7TaskMutate.mockReset()
    completeCap8TaskMutate.mockReset()
    graduateCap8Mutate.mockReset()
    enterCap8Mutate.mockReset()
    setKhauViMutate.mockReset()
    recordCap1TradeMock.mockReset()
    recordCap2TradeMock.mockReset()
    recordCap2ScoreMock.mockReset()
    recordCap3TradeMock.mockReset()
    recordCap4TradeMock.mockReset()
    recordCap5TradeMock.mockReset()
    recordCap6TradeMock.mockReset()
    recordCap7TradeMock.mockReset()
    getGoiYMock.mockReset()
    getGoiYMock.mockResolvedValue(fakeGoiY())
    verdictQuery.current = { data: fakeVerdict(), isPending: false, isError: false }
    navigateMock.mockReset()
    messageSuccess.mockReset()
    window.localStorage.clear()
  })

  it("renders the reused terminal children (CenterPanel/RightSidebar/RightToolbar)", () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as the lower cấp shells", () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 8 · QUẢN TRỊ RỦI RO DANH MỤC" label and the THỰC CHIẾN mode badge', () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.getByText("CẤP 8 · QUẢN TRỊ RỦI RO DANH MỤC")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  // ★★ Cộng dồn: bỏ SÓT một provider nào cũng làm khối của cấp đó biến mất khỏi
  // panel đặt lệnh — đúng thứ spec §0 nói phải "GIỮ NGUYÊN".
  it("★ keeps ALL EIGHT buses active (cộng dồn — Cấp 1 … Cấp 8)", () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.getByTestId("bus-spy")).toHaveTextContent(
      "true-true-true-true-true-true-true-true",
    )
  })

  // ★★ Không có nó thì `GET /cap8/kiem-tra` + `POST /cap8/kehoach` 404 và mọi
  // phiên đều mở ra với dòng "chưa chạy được bước Kiểm tra danh mục".
  it("POSTs /cap8/enter idempotently on mount (without it /cap8/kiem-tra 404s)", () => {
    renderCap8(<Cap8TradingPage />)
    expect(enterCap8Mutate).toHaveBeenCalledTimes(1)
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap8TradingPage />
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

  it("still mounts the MANDATORY KhauViModal (Cấp 3 §5.2 applies at Cấp 8 too)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderCap8(<Cap8TradingPage />)
    expect(screen.getByText("Chọn khẩu vị rủi ro")).toBeInTheDocument()
  })

  // ── Thứ tự kết sổ (giữ nguyên bản sửa của Cấp 5/6/7) ───────────────────────
  describe("thứ tự kết sổ (hàng order_ketso phải có TRƯỚC khi mở Kết sổ Cấp 8)", () => {
    it("★ POST /cap1/ketso cho lệnh vừa bán TRƯỚC khi modal Cấp 8 mở", async () => {
      let releasePreflight: (() => void) | null = null
      recordKetsoCap1Async.mockImplementation(
        () =>
          new Promise((resolve) => {
            releasePreflight = () => resolve({ id: "ks1" })
          }),
      )
      renderCap8(<Cap8TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy"))
      fireEvent.click(screen.getByTestId("fire-sell"))

      expect(recordKetsoCap1Async).toHaveBeenCalledWith({ order_id: "sell-1", cam_xuc: null })
      // Flush EVERY other pending microtask (incl. `GET /cap6/goi-y` resolving) —
      // the modal must still be closed, because only the Cấp 1 kết sổ gates it.
      // Without this flush the assertion would also pass for a fire-and-forget
      // `/cap1/ketso`, which is exactly the bug this test exists to catch.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()

      releasePreflight!()
      await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    })

    it("lệnh đã kết sổ Cấp 1 trước đó (409) vẫn mở được Kết sổ Cấp 8", async () => {
      recordKetsoCap1Async.mockRejectedValue(new Error("Lệnh này đã kết sổ"))
      renderCap8(<Cap8TradingPage />)
      await openKetso()
      expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    })

    it("KHÔNG kết sổ Cấp 1 (và không mở modal) cho lệnh bán không có lệnh mua theo dõi", () => {
      renderCap8(<Cap8TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })

    it("KHÔNG kết sổ Cấp 1 cho lệnh chưa chấm đủ 5 lớp (cổng cứng Cấp 4 giữ nguyên)", () => {
      renderCap8(<Cap8TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy-no-doc5lop"))
      fireEvent.click(screen.getByTestId("fire-sell-vic"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })
  })

  it("a BUY then SELL opens Kết sổ Cấp 8 with every inherited khối + khối Kiểm tra danh mục", async () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    await openKetso()

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58,000")
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toHaveTextContent("Cân bằng")
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-doichieu")).toBeInTheDocument()
    expect(screen.getByTestId("cap7-ketso-docluc")).toBeInTheDocument()
    // … plus Cấp 8's own khối "Kiểm tra danh mục — nhìn lại".
    expect(screen.getByTestId("cap8-ketso-kiemtra")).toBeInTheDocument()
  })

  it("the khối replays the buy-time check: cảnh báo, xử lý, ngành, tương quan, tổng rủi ro", async () => {
    renderCap8(<Cap8TradingPage />)
    await openKetso()

    // `⚠ {cảnh báo} · bạn: {xử lý} ✓` — nhãn cảnh báo dùng CHÍNH bảng của backend.
    const lucMua = screen.getByTestId("cap8-ketso-lucmua")
    expect(lucMua).toHaveTextContent("Dồn ngành")
    expect(lucMua).toHaveTextContent("bạn: Giảm khối lượng")
    // ★ Tên ngành THẬT của lệnh, không phải chỗ trống "Ngành của mã".
    expect(screen.getByTestId("cap8-ketso-donnganh")).toHaveTextContent("Ngân hàng 46% danh mục")
    expect(screen.getByTestId("cap8-ketso-tuongquan")).toHaveTextContent("MBB (~0.82)")
    expect(screen.getByTestId("cap8-ketso-tongruiro")).toHaveTextContent("17%")
  })

  // ★★ Cấp 8 dạy đúng một điều: CHƯA BIẾT ≠ BẰNG 0. Một `?? 0` ở chỗ dựng khối
  // sẽ in "Ngành của mã 0% danh mục" / "0%" cho một phép đo chưa bao giờ chạy.
  it("★ a measure the server could NOT compute stays «chưa tính được» — never 0%", async () => {
    renderCap8(<Cap8TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-chua-tinh"))
    fireEvent.click(screen.getByTestId("fire-sell-ssi"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())

    const donNganh = screen.getByTestId("cap8-ketso-donnganh")
    expect(donNganh).toHaveTextContent("hệ chưa ghi lại được")
    expect(donNganh.textContent).not.toMatch(/0%/)
    const tong = screen.getByTestId("cap8-ketso-tongruiro")
    expect(tong).toHaveTextContent("chưa tính được")
    expect(tong.textContent).not.toMatch(/0%/)
    // Không có cặp nào vượt ngưỡng → hàng tương quan bị bỏ hẳn (KHÔNG in "0.00").
    expect(screen.queryByTestId("cap8-ketso-tuongquan")).not.toBeInTheDocument()
  })

  // ★★ `so_vi_the_thieu_cat_lo` KHÔNG được `?? 0`: "0" ở đây là lời khẳng định
  // "mọi vị thế lúc đó đều đã có cắt lỗ" — một câu không ai có cơ sở để nói khi
  // hệ chỉ đơn giản là không ghi lại con số đó.
  it("★ an unrecorded «vị thế thiếu cắt lỗ» says so — it never claims every stop was set", async () => {
    renderCap8(<Cap8TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-chua-tinh"))
    fireEvent.click(screen.getByTestId("fire-sell-ssi"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())

    const caveat = screen.getByTestId("cap8-ketso-caveat")
    expect(caveat).toHaveTextContent("Hệ chưa ghi lại được")
    expect(caveat.textContent).not.toMatch(/đều đã có cắt lỗ/)
  })

  it("a REAL count of vị thế thiếu cắt lỗ is reported as-is", async () => {
    renderCap8(<Cap8TradingPage />)
    await openKetso()
    expect(screen.getByTestId("cap8-ketso-caveat")).toHaveTextContent(
      "2 vị thế chưa có cắt lỗ",
    )
  })

  // Đối cực của test trên: một `0` THẬT (server đã đo và mọi vị thế đều có cắt
  // lỗ) phải đi qua nguyên vẹn, không bị biến thành "chưa ghi lại được".
  it("a REAL zero (every position had a stop) is reported as the fact it is", async () => {
    renderCap8(<Cap8TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-du-cat-lo"))
    fireEvent.click(screen.getByTestId("fire-sell-fpt"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())

    const caveat = screen.getByTestId("cap8-ketso-caveat")
    expect(caveat).toHaveTextContent("Mọi vị thế lúc đó đều đã có cắt lỗ")
    expect(caveat.textContent).not.toMatch(/chưa ghi lại được/)
  })

  it("a lệnh whose Kiểm tra danh mục never ran omits the khối entirely (degrade OPEN)", async () => {
    renderCap8(<Cap8TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-no-kiemtra"))
    fireEvent.click(screen.getByTestId("fire-sell-hpg"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    expect(screen.queryByTestId("cap8-ketso-kiemtra")).not.toBeInTheDocument()
  })

  // ★ Cùng MỘT mã, mua lần 2 mà bước kiểm tra không chạy: `lastBuyBySymbolRef`
  // được key theo mã nên bản ghi cũ vẫn nằm đó. Nếu handler Cấp 1 kế thừa
  // (`?? existing`) thay vì reset, cảnh báo của lệnh TRƯỚC sẽ bị gán cho một lệnh
  // chưa từng được kiểm tra.
  it("★ a previous lệnh's Kiểm tra danh mục never leaks onto the NEXT lệnh of the same mã", async () => {
    renderCap8(<Cap8TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))
    fireEvent.click(screen.getByTestId("fire-buy-vnm-again-no-kiemtra"))
    fireEvent.click(screen.getByTestId("fire-sell"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    expect(screen.queryByTestId("cap8-ketso-kiemtra")).not.toBeInTheDocument()
  })

  it("still resolves the Đối chiếu block from the SERVER's gợi ý (Cấp 6 kế thừa)", async () => {
    renderCap8(<Cap8TradingPage />)
    await openKetso()
    expect(getGoiYMock).toHaveBeenCalledWith("VNM")
    expect(screen.getByTestId("cap6-ketso-kieu")).toHaveTextContent("Phòng thủ / tiêu dùng")
  })

  it("still names the Cấp 7 band from the SERVER's quy_tac (Cấp 7 kế thừa)", async () => {
    renderCap8(<Cap8TradingPage />)
    await openKetso()
    expect(screen.getByTestId("cap7-ketso-luc")).toHaveTextContent("Cầu áp đảo")
  })

  it("closing Kết sổ forwards the record into the Cấp 1-6 trade logs", async () => {
    renderCap8(<Cap8TradingPage />)
    await openKetso()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(screen.getByTestId("cap8-ketso-close"))

    await waitFor(() => expect(recordCap7TradeMock).toHaveBeenCalledTimes(1))
    expect(recordCap1TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap2TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap3TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap4TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap5TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap6TradeMock).toHaveBeenCalledTimes(1)

    const rec = recordCap6TradeMock.mock.calls[0][0]
    expect(rec.orderId).toBe("sell-1")
    // The SAME superset record goes into every lower log.
    expect(recordCap1TradeMock.mock.calls[0][0]).toBe(rec)
    expect(recordCap5TradeMock.mock.calls[0][0]).toBe(rec)
  })

  it("records today's điểm kỷ luật into the shared score log once a real score resolves", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 91, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap8(<Cap8TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({
      ngay: "2026-11-02",
      diem: 91,
      xepLoai: "xanh",
    })
  })

  it("never records a fabricated 0 điểm kỷ luật for a day with no score", () => {
    renderCap8(<Cap8TradingPage />)
    expect(recordCap2ScoreMock).not.toHaveBeenCalled()
  })

  it("mounts GraduationModalCap8 — the program's finale (hidden until 3/3)", () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap8ProgressMock.mockReturnValue({
      data: fakeCap8Progress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        so_lenh_kiem_tra: 18,
        tong_rui_ro_pct: 14,
        don_nganh_max_pct: 31,
      }),
    })
    renderCap8(<Cap8TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    expect(screen.getByTestId("cap8-grad-tronmach")).toHaveTextContent("Trọn mạch Nhập môn → đây.")
    // ★ Cấp cuối: KHÔNG có nút vào cấp sau.
    expect(screen.getByTestId("cap8-grad-cta")).toHaveTextContent("Xem hồ sơ hành trình")
  })

  // ── Cấp 8 «Chọn mã khác» (spec §4) ────────────────────────────────────────
  // ★★ FE1's `Chọn mã khác` chỉ `setSymbol("")`. Không có bước chọn mã ở đây thì
  // user rơi vào một terminal KHÔNG có mã nào — đúng vào lúc họ vừa làm điều an
  // toàn hơn mà hệ vừa gợi ý.
  describe("«Chọn mã khác» — trạng thái không còn mã nào", () => {
    it("★ opens a symbol picker when the panel clears the symbol", () => {
      renderCap8(<Cap8TradingPage />)
      expect(screen.queryByTestId("cap8-chon-ma")).not.toBeInTheDocument()

      fireEvent.click(screen.getByTestId("chon-ma-khac"))
      expect(screen.getByTestId("cap8-chon-ma")).toBeInTheDocument()
      expect(screen.getByTestId("symbol-spy")).toHaveTextContent("")
    })

    it("picking a mã sets it and closes the picker", () => {
      renderCap8(<Cap8TradingPage />)
      fireEvent.click(screen.getByTestId("chon-ma-khac"))
      fireEvent.change(screen.getByPlaceholderText("VD: HPG"), { target: { value: "hpg" } })
      fireEvent.click(screen.getByTestId("cap8-chon-ma-ok"))

      expect(screen.getByTestId("symbol-spy")).toHaveTextContent("HPG")
      expect(screen.queryByTestId("cap8-chon-ma")).not.toBeInTheDocument()
    })

    it("refuses a mã that is not a listed stock (index codes are not tradeable)", () => {
      renderCap8(<Cap8TradingPage />)
      fireEvent.click(screen.getByTestId("chon-ma-khac"))
      fireEvent.change(screen.getByPlaceholderText("VD: HPG"), { target: { value: "VNINDEX" } })
      expect(screen.getByTestId("cap8-chon-ma-ok")).toBeDisabled()
      fireEvent.click(screen.getByTestId("cap8-chon-ma-ok"))
      expect(screen.getByTestId("symbol-spy")).toHaveTextContent("")
    })

    // ★★ Không bao giờ nhốt user: huỷ thì quay lại ĐÚNG mã đang xem trước đó.
    it("★ cancelling restores the previous mã instead of trapping the user", () => {
      renderCap8(<Cap8TradingPage />)
      expect(screen.getByTestId("symbol-spy")).toHaveTextContent("VNM")
      fireEvent.click(screen.getByTestId("chon-ma-khac"))
      fireEvent.click(screen.getByTestId("cap8-chon-ma-huy"))

      expect(screen.getByTestId("symbol-spy")).toHaveTextContent("VNM")
      expect(screen.queryByTestId("cap8-chon-ma")).not.toBeInTheDocument()
    })
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting navigates', () => {
    renderCap8(<Cap8TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VCB")
  })
})

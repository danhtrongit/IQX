import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider, useSidebar } from "@/shared/contexts/sidebar-context"
import type { Cap1Progress } from "@/features/cap1/types"
import type { Cap2Progress, DiemKyLuat } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { VerdictGoiY } from "@/features/cap5/types"
import type { GoiYCap6 } from "@/features/cap6/types"
import type { Cap7Progress, PhienCap7 } from "./types"

// ── Mocks ────────────────────────────────────────────────────────────────────
const {
  useCap1ProgressMock,
  useCap2ProgressMock,
  useCap3ProgressMock,
  useCap7ProgressMock,
  usePhienCap7Mock,
  useDiemKyLuatMock,
  recordKetsoCap1Async,
  recordKetsoCap2Mutate,
  recordKetsoCap5Async,
  completeCap6TaskMutate,
  completeCap7TaskMutate,
  graduateCap7Mutate,
  enterCap7Mutate,
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
  useCap7ProgressMock: vi.fn(),
  usePhienCap7Mock: vi.fn(),
  useDiemKyLuatMock: vi.fn(),
  recordKetsoCap1Async: vi.fn(),
  recordKetsoCap2Mutate: vi.fn(),
  recordKetsoCap5Async: vi.fn(),
  completeCap6TaskMutate: vi.fn(),
  completeCap7TaskMutate: vi.fn(),
  graduateCap7Mutate: vi.fn(),
  enterCap7Mutate: vi.fn(),
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
// (mirrors `cap6/Cap6TradingPage.test.tsx`). The stub fires the SAME buses the
// real `TradingPanel` fires: cap1→cap4 + cap6 + cap7 on a BUY, and ALL SEVEN on
// a SELL.
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

  const fireLowerBuy = (symbol: string, orderId: string, withDoc5Lop: boolean) => {
    cap1OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      lyDo: "dong_tien",
      trangThaiLucDat: "ung_ho",
      vungMua: 60_000,
    })
    cap2OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      phuongPhapSlTp: "ho_tro_khang_cu",
      catLo: 58_000,
      chotLoi: 65_000,
    })
    cap3OnOrderFilled?.({
      symbol,
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
      symbol,
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
    cap5OnOrderFilled?.({ symbol, side: "buy", quantity: 300, price: 60_000, orderId })
    cap6OnOrderFilled?.({
      symbol,
      side: "buy",
      quantity: 300,
      price: 60_000,
      orderId,
      kieuCoPhieu: null,
      lopQuyetDinh: "dinh_gia",
      lyDoDoiChieu: "P/B rẻ, tin xấu chỉ ngắn hạn",
      lopMauThuan: { ...DOC_5_LOP },
    })
  }

  const fireSell = (symbol: string, orderId: string, price: number) => {
    const sellEvent = { symbol, side: "sell" as const, quantity: 300, price, orderId }
    cap1OnOrderFilled?.(sellEvent)
    cap2OnOrderFilled?.(sellEvent)
    cap3OnOrderFilled?.(sellEvent)
    cap4OnOrderFilled?.(sellEvent)
    cap5OnOrderFilled?.(sellEvent)
    cap6OnOrderFilled?.(sellEvent)
    cap7OnOrderFilled?.(sellEvent)
  }

  return (
    <div data-testid="right-sidebar">
      <span data-testid="bus-spy">
        {`${isCap1Active}-${isCap2Active}-${isCap3Active}-${isCap4Active}-${isCap5Active}-${isCap6Active}-${isCap7Active}`}
      </span>
      <button
        data-testid="fire-buy"
        onClick={() => {
          fireLowerBuy("VNM", "buy-1", true)
          cap7OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1",
            lucChiSo: 1.94,
            lucDocUser: "manh",
            coCanhGiac: false,
            hanhViCo: null,
          })
        }}
      >
        fire buy (có đọc lực)
      </button>
      <button
        data-testid="fire-buy-co"
        onClick={() => {
          fireLowerBuy("SSI", "buy-co", true)
          cap7OnOrderFilled?.({
            symbol: "SSI",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-co",
            lucChiSo: 0.42,
            lucDocUser: "yeu",
            coCanhGiac: true,
            hanhViCo: "cho_xac_nhan",
          })
        }}
      >
        fire buy (có cờ, chờ xác nhận)
      </button>
      <button
        data-testid="fire-buy-no-docluc"
        onClick={() => {
          fireLowerBuy("HPG", "buy-2", true)
          // Mua ngoài giờ / sổ quá mỏng → `TradingPanel` KHÔNG gắn khối đọc lực.
          cap7OnOrderFilled?.({
            symbol: "HPG",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-2",
          })
        }}
      >
        fire buy without đọc lực
      </button>
      <button
        data-testid="fire-buy-vnm-again-no-docluc"
        onClick={() => {
          // CÙNG mã VNM, lệnh mua thứ hai, lần này KHÔNG đọc lực (mua ngoài giờ).
          fireLowerBuy("VNM", "buy-1b", true)
          cap7OnOrderFilled?.({
            symbol: "VNM",
            side: "buy",
            quantity: 300,
            price: 60_000,
            orderId: "buy-1b",
          })
        }}
      >
        fire buy VNM again (không đọc lực)
      </button>
      <button
        data-testid="fire-buy-no-doc5lop"
        onClick={() => {
          fireLowerBuy("VIC", "buy-3", false)
          cap7OnOrderFilled?.({
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
      <button data-testid="fire-sell-ssi" onClick={() => fireSell("SSI", "sell-co", 61_000)}>
        fire sell SSI
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
  // `KetsoModalCap7` đọc lại khối Đối chiếu của lệnh qua hook này — không dữ
  // liệu ở đây → modal dùng đúng khối trang này dựng (thứ các test dưới kiểm).
  useKehoachCap6: () => ({ data: undefined, isPending: false, isError: false }),
}))
vi.mock("@/features/cap6/tradeLogCap6", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/cap6/tradeLogCap6")>()
  return { ...actual, useCap6TradeLog: () => ({ trades: [], record: recordCap6TradeMock }) }
})
vi.mock("@/features/cap6/api", () => ({
  cap6Api: { getGoiY: (...a: unknown[]) => getGoiYMock(...a) },
}))

// Cấp 7's own hooks + trade log.
vi.mock("./hooks", () => ({
  useCap7Progress: (...a: unknown[]) => useCap7ProgressMock(...a),
  usePhienCap7: (...a: unknown[]) => usePhienCap7Mock(...a),
  useEnterCap7: () => ({ mutate: enterCap7Mutate, isPending: false }),
  useCompleteCap7Task: () => ({ mutate: completeCap7TaskMutate, isPending: false }),
  useGraduateCap7: () => ({ mutate: graduateCap7Mutate, isPending: false }),
  useThachThucCap7: () => ({ data: undefined }),
  // `KetsoModalCap7` đọc lại khối đọc lực (đã chấm) của lệnh qua hook này —
  // không dữ liệu ở đây → modal dùng đúng khối `buildDocLucCap7` dựng lúc mua.
  useKehoachCap7: () => ({ data: undefined, isPending: false, isError: false }),
}))
// Cấp 8 «Quản trị rủi ro danh mục» đã ship (Cấp 8 Task FE3): `GraduationModalCap7`
// — mounted by this page — gọi `useEnterCap8` để vào Cấp 8 THẬT. Mock nó ở đây,
// đúng như `Cap6TradingPage.test.tsx` mock `@/features/cap7/hooks` khi Cấp 7 lên
// sóng; nếu không, hook thật chạy và đòi một `QueryClientProvider`.
vi.mock("@/features/cap8/hooks", () => ({
  useEnterCap8: () => ({ mutate: enterCap8Mutate, isPending: false }),
}))
vi.mock("./tradeLogCap7", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tradeLogCap7")>()
  return { ...actual, useCap7TradeLog: () => ({ trades: [], record: recordCap7TradeMock }) }
})

import { Cap7TradingPage } from "./Cap7TradingPage"
import { useCap1Events } from "@/features/cap1/Cap1Context"
import { useCap2Events } from "@/features/cap2/Cap2Context"
import { useCap3Events } from "@/features/cap3/Cap3Context"
import { useCap4Events } from "@/features/cap4/Cap4Context"
import { useCap5Events } from "@/features/cap5/Cap5Context"
import { useCap6Events } from "@/features/cap6/Cap6Context"
import { useCap7Events } from "./Cap7Context"

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
    so_ly_do_da_dung: 5,
    so_lenh_ly_do_ung_ho: 3,
    so_lenh_thuc_chien: 74,
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
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
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

function fakeCap7Progress(overrides: Partial<Cap7Progress> = {}): Cap7Progress {
  return {
    id: "p7",
    user_id: "u1",
    entered_at: "2026-08-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_luc: 4,
    so_lan_khong_duoi_theo_co: 1,
    ty_le_doc_luc_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    trong_phien: true,
    so_lenh_da_cham: 0,
    so_lenh_chua_cham: 4,
    so_lan_gap_co: 2,
    so_lan_mua_duoi_theo: 1,
    so_phien_cham: 2,
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
    ngay: "2026-08-01",
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

function renderCap7(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/dau-truong"]}>{ui}</MemoryRouter>)
}

/** Mở Kết sổ Cấp 7 cho lệnh mẫu (buy VNM có đọc lực → sell VNM). */
async function openKetso() {
  fireEvent.click(screen.getByTestId("fire-buy"))
  fireEvent.click(screen.getByTestId("fire-sell"))
  await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
}

describe("Cap7TradingPage", () => {
  beforeEach(() => {
    useCap1ProgressMock.mockReset()
    useCap1ProgressMock.mockReturnValue({ data: fakeCap1Progress() })
    useCap2ProgressMock.mockReset()
    useCap2ProgressMock.mockReturnValue({ data: fakeCap2Progress() })
    useCap3ProgressMock.mockReset()
    useCap3ProgressMock.mockReturnValue({ data: fakeCap3Progress() })
    useCap7ProgressMock.mockReset()
    useCap7ProgressMock.mockReturnValue({ data: fakeCap7Progress() })
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
    graduateCap7Mutate.mockReset()
    enterCap7Mutate.mockReset()
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
    renderCap7(<Cap7TradingPage />)
    expect(screen.getByTestId("center-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("right-toolbar")).toBeInTheDocument()
  })

  it("renders the SAME surrounding chrome as the lower cấp shells", () => {
    renderCap7(<Cap7TradingPage />)
    expect(screen.getByTestId("trial-banner")).toBeInTheDocument()
    expect(screen.getByTestId("header")).toBeInTheDocument()
    expect(screen.getByTestId("market-bar")).toBeInTheDocument()
    expect(screen.getByTestId("footer")).toBeInTheDocument()
  })

  it('shows the "CẤP 7 · ĐỌC SỔ LỆNH" label and the THỰC CHIẾN mode badge', () => {
    renderCap7(<Cap7TradingPage />)
    expect(screen.getByText("CẤP 7 · ĐỌC SỔ LỆNH")).toBeInTheDocument()
    expect(screen.getByText("THỰC CHIẾN")).toBeInTheDocument()
  })

  it("★ keeps ALL SEVEN buses active (cộng dồn — Cấp 1 … Cấp 7)", () => {
    renderCap7(<Cap7TradingPage />)
    expect(screen.getByTestId("bus-spy")).toHaveTextContent(
      "true-true-true-true-true-true-true",
    )
  })

  it("POSTs /cap7/enter idempotently on mount (without it /cap7/kehoach 404s)", () => {
    renderCap7(<Cap7TradingPage />)
    expect(enterCap7Mutate).toHaveBeenCalledTimes(1)
  })

  it("defaults the sidebar to the journey panel on mount, restores previous panel on unmount", () => {
    function PanelSpy() {
      const { activePanel } = useSidebar()
      return <div data-testid="panel-spy">{activePanel}</div>
    }
    const { rerender } = render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <SidebarProvider defaultPanel="news">
          <Cap7TradingPage />
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

  it("still mounts the MANDATORY KhauViModal (Cấp 3 §5.2 applies at Cấp 7 too)", () => {
    useCap3ProgressMock.mockReturnValue({
      data: fakeCap3Progress({ khau_vi_da_dat: false, khau_vi: null }),
    })
    renderCap7(<Cap7TradingPage />)
    expect(screen.getByText("Chọn khẩu vị rủi ro")).toBeInTheDocument()
  })

  // ── Thứ tự kết sổ (giữ nguyên bản sửa của Cấp 5/6) ─────────────────────────
  describe("thứ tự kết sổ (hàng order_ketso phải có TRƯỚC khi mở Kết sổ Cấp 7)", () => {
    it("★ POST /cap1/ketso cho lệnh vừa bán TRƯỚC khi modal Cấp 7 mở", async () => {
      let releasePreflight: (() => void) | null = null
      recordKetsoCap1Async.mockImplementation(
        () =>
          new Promise((resolve) => {
            releasePreflight = () => resolve({ id: "ks1" })
          }),
      )
      renderCap7(<Cap7TradingPage />)
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

    it("lệnh đã kết sổ Cấp 1 trước đó (409) vẫn mở được Kết sổ Cấp 7", async () => {
      recordKetsoCap1Async.mockRejectedValue(new Error("Lệnh này đã kết sổ"))
      renderCap7(<Cap7TradingPage />)
      await openKetso()
      expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    })

    it("KHÔNG kết sổ Cấp 1 (và không mở modal) cho lệnh bán không có lệnh mua theo dõi", () => {
      renderCap7(<Cap7TradingPage />)
      fireEvent.click(screen.getByTestId("fire-sell"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })

    it("KHÔNG kết sổ Cấp 1 cho lệnh chưa chấm đủ 5 lớp (cổng cứng Cấp 4 giữ nguyên)", () => {
      renderCap7(<Cap7TradingPage />)
      fireEvent.click(screen.getByTestId("fire-buy-no-doc5lop"))
      fireEvent.click(screen.getByTestId("fire-sell-vic"))
      expect(recordKetsoCap1Async).not.toHaveBeenCalled()
      expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    })
  })

  it("a BUY then SELL opens Kết sổ Cấp 7 with every inherited khối + khối Đọc sổ lệnh", async () => {
    renderCap7(<Cap7TradingPage />)
    expect(screen.queryByText(/KẾT SỔ LỆNH/)).not.toBeInTheDocument()
    await openKetso()

    expect(screen.getByText("KẾT SỔ LỆNH · #1 · THỰC CHIẾN")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-ketso-camket")).toHaveTextContent("58,000")
    expect(screen.getByTestId("cap3-ketso-quanlyvon")).toHaveTextContent("Cân bằng")
    expect(screen.getByTestId("cap4-ketso-doc5lop")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-phanloai")).toBeInTheDocument()
    expect(screen.getByTestId("cap6-ketso-doichieu")).toBeInTheDocument()
    // … plus Cấp 7's own khối "Đọc sổ lệnh — nhìn lại".
    expect(screen.getByTestId("cap7-ketso-docluc")).toBeInTheDocument()
  })

  it("the khối names the band from the SERVER's quy_tac + the user's own reading", async () => {
    renderCap7(<Cap7TradingPage />)
    await openKetso()
    const luc = screen.getByTestId("cap7-ketso-luc")
    // 1.94 ≥ nguong_cau_ap_dao (1.5) → "Cầu áp đảo" — tên của server, không phải
    // một nhãn FE tự đặt.
    expect(luc).toHaveTextContent("Cầu áp đảo")
    expect(luc).toHaveTextContent("Cầu mạnh")
  })

  it("★ a freshly-bought lệnh is «chưa tới hạn chấm» — NEVER a verdict", async () => {
    renderCap7(<Cap7TradingPage />)
    await openKetso()
    const dienBien = screen.getByTestId("cap7-ketso-dienbien").textContent!
    expect(dienBien).toContain("chưa tới hạn chấm")
    // Số phiên chấm là của server (`quy_tac.so_phien_cham` = 2), không phải 0.
    expect(dienBien).toContain("2 phiên")
    expect(dienBien).not.toContain("ĐÚNG")
    expect(dienBien).not.toContain("SAI")
    // Không phán quyết ⇒ cũng không có đoạn coach nào đoán hộ.
    expect(screen.queryByTestId("cap7-ketso-coach")).not.toBeInTheDocument()
  })

  it("a lệnh có cờ shows the hành vi, and NEVER calls the resting order fake", async () => {
    renderCap7(<Cap7TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-co"))
    fireEvent.click(screen.getByTestId("fire-sell-ssi"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())

    const co = screen.getByTestId("cap7-ketso-co")
    expect(co.textContent!.toLowerCase()).toContain("chờ xác nhận")
    expect(co.textContent).not.toMatch(/lệnh giả/i)
    // ★ BE không lưu mức nào kích cờ → copy bỏ hẳn cụm "ở {giá}", không bịa giá.
    expect(co.textContent).not.toMatch(/ ở \d/)
  })

  it("a lệnh with NO đọc lực opens Kết sổ WITHOUT the Đọc-sổ-lệnh block (spec §4 SOFT)", async () => {
    renderCap7(<Cap7TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy-no-docluc"))
    fireEvent.click(screen.getByTestId("fire-sell-hpg"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    expect(screen.queryByTestId("cap7-ketso-docluc")).not.toBeInTheDocument()
  })

  // ★ Cùng MỘT mã, mua lần 2 mà không đọc lực: `lastBuyBySymbolRef` được key theo
  // mã nên bản ghi cũ vẫn nằm đó. Nếu handler Cấp 1 kế thừa (`?? existing`) thay
  // vì reset, lần đọc của lệnh TRƯỚC sẽ bị gán cho một lệnh user không hề đọc gì.
  it("★ a previous lệnh's đọc lực never leaks onto the NEXT lệnh of the same mã", async () => {
    renderCap7(<Cap7TradingPage />)
    fireEvent.click(screen.getByTestId("fire-buy"))
    fireEvent.click(screen.getByTestId("fire-buy-vnm-again-no-docluc"))
    fireEvent.click(screen.getByTestId("fire-sell"))
    await waitFor(() => expect(screen.getByText(/KẾT SỔ LỆNH/)).toBeInTheDocument())
    expect(screen.queryByTestId("cap7-ketso-docluc")).not.toBeInTheDocument()
  })

  it("still resolves the Đối chiếu block from the SERVER's gợi ý (Cấp 6 kế thừa)", async () => {
    renderCap7(<Cap7TradingPage />)
    await openKetso()
    expect(getGoiYMock).toHaveBeenCalledWith("VNM")
    expect(screen.getByTestId("cap6-ketso-kieu")).toHaveTextContent("Phòng thủ / tiêu dùng")
    expect(screen.getByTestId("cap6-ketso-khop")).toHaveTextContent("khớp gợi ý cho kiểu này")
  })

  it("closing Kết sổ forwards the record into the Cấp 1-6 trade logs", async () => {
    renderCap7(<Cap7TradingPage />)
    await openKetso()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    fireEvent.click(screen.getByTestId("cap7-ketso-close"))

    await waitFor(() => expect(recordCap7TradeMock).toHaveBeenCalledTimes(1))
    expect(recordCap1TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap2TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap3TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap4TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap5TradeMock).toHaveBeenCalledTimes(1)
    expect(recordCap6TradeMock).toHaveBeenCalledTimes(1)

    const rec = recordCap6TradeMock.mock.calls[0][0]
    expect(rec.orderId).toBe("sell-1")
    expect(rec.lucDocUser).toBe("manh")
    expect(rec.lucChiSo).toBe(1.94)
    // ★ Chưa chấm ⇒ `docLucDung` là null, KHÔNG phải false.
    expect(rec.docLucDung).toBeNull()
    // The SAME superset record goes into every lower log.
    expect(recordCap1TradeMock.mock.calls[0][0]).toBe(rec)
    expect(recordCap5TradeMock.mock.calls[0][0]).toBe(rec)
  })

  it("records today's điểm kỷ luật into the shared score log once a real score resolves", () => {
    useDiemKyLuatMock.mockReturnValue({
      data: fakeDiemKyLuat({ co_giao_dich: true, co_tinh_huong: true, diem: 91, xep_loai: "xanh" }),
      isLoading: false,
    })
    renderCap7(<Cap7TradingPage />)
    expect(recordCap2ScoreMock).toHaveBeenCalledWith({
      ngay: "2026-08-01",
      diem: 91,
      xepLoai: "xanh",
    })
  })

  it("mounts GraduationModalCap7 (hidden until 3/3 nhiệm vụ)", () => {
    renderCap7(<Cap7TradingPage />)
    expect(screen.queryByText("HOÀN THÀNH")).not.toBeInTheDocument()

    useCap7ProgressMock.mockReturnValue({
      data: fakeCap7Progress({
        task_1_done_at: "t",
        task_2_done_at: "t",
        task_3_done_at: "t",
        so_lenh_doc_luc: 21,
        so_lan_khong_duoi_theo_co: 5,
        ty_le_doc_luc_dung: 61,
        so_lenh_da_cham: 18,
        so_lenh_chua_cham: 3,
      }),
    })
    renderCap7(<Cap7TradingPage />)
    expect(screen.getByText("HOÀN THÀNH")).toBeInTheDocument()
    // "CẤP 7 · ĐỌC SỔ LỆNH" also labels the top bar — scope to the modal's khối.
    expect(screen.getByTestId("cap7-grad-khoi3")).toHaveTextContent(
      "Cấp 8 «Quản trị rủi ro danh mục»",
    )
  })

  it('clicking "AI Phân tích" opens the AI Insight symbol-picker modal, and submitting navigates', () => {
    renderCap7(<Cap7TradingPage />)
    expect(screen.queryByText("Phân tích AI cho 1 mã cổ phiếu")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("right-toolbar"))
    expect(screen.getByText("Phân tích AI cho 1 mã cổ phiếu")).toBeInTheDocument()

    const input = screen.getByPlaceholderText("VD: VCB")
    fireEvent.change(input, { target: { value: "VCB" } })
    fireEvent.click(screen.getByText("Phân tích"))
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VCB")
  })
})

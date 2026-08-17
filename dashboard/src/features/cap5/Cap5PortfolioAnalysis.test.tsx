import { render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * HARNESS (documented choice) — mock 2 hook query, KHÔNG dựng
 * QueryClientProvider/AuthProvider.
 *
 * `Cap5PortfolioAnalysis` render `Cap4PortfolioAnalysis` bên trong, và component
 * đó gọi `useVuKhiDiemMu()` (auth-gated TanStack query). Thay vì bọc provider
 * thật rồi phụ thuộc vào việc query bị `enabled: false`, test mock đúng 2 module
 * hook — cùng cách `Cap4PortfolioAnalysis.test.tsx` mock `./hooks` của nó, và
 * cùng tiền lệ `vi.mock("@/features/cap1/hooks", …)` ở cap0. Nhờ vậy test điều
 * khiển được cả 3 trạng thái query của khối ⑬ (pending / error / có dữ liệu) mà
 * không có network, không cần provider. Các component Cấp 1-3 là thuần trình bày
 * (không hook nào) nên không cần mock gì thêm.
 */
const { dungNgoai } = vi.hoisted(() => ({
  dungNgoai: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  useDanhSachDungNgoai: () => dungNgoai.current,
}))
vi.mock("@/features/cap4/hooks", () => ({
  useVuKhiDiemMu: () => ({ data: undefined, isPending: true, isError: false }),
}))

import { Cap5PortfolioAnalysis } from "./Cap5PortfolioAnalysis"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import type { Cap5Progress, DungNgoaiItem, DungNgoaiList, O4 } from "./types"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"

const NOW = new Date("2026-07-31T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap5TradeRecord> = {}): Cap5TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 4,
    pnlVnd: 400_000,
    closedAt: "2026-07-25T10:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    ai_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    so_lop_dong_thuan: 5,
    so_lop_khac_ai: 0,
    o4: "dung_thang",
    verdictHe: "dung",
    verdictUser: "dung",
    ...overrides,
  }
}

function tradesInO(o4: O4, n: number, extra: Partial<Cap5TradeRecord> = {}): Cap5TradeRecord[] {
  const thang = o4 === "dung_thang" || o4 === "sai_thang"
  const verdict = o4 === "dung_thang" || o4 === "dung_thua" ? "dung" : "sai"
  return Array.from({ length: n }, () =>
    trade({
      o4,
      verdictHe: verdict,
      verdictUser: verdict,
      pnlPct: thang ? 6 : -4,
      pnlVnd: thang ? 600_000 : -400_000,
      ...extra,
    }),
  )
}

function cap2Progress(): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: "2026-05-02T00:00:00Z",
    time_to_graduate_hours: 12,
  }
}

function cap3Progress(): Cap3Progress {
  return {
    id: "c3p",
    user_id: "u1",
    entered_at: "2026-05-03T00:00:00Z",
    khau_vi_da_dat: true,
    khau_vi: "can_bang",
    von_ban_dau: 100_000_000,
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_cap3: 0,
    lai_pct_cap3: 0,
    diem_ky_luat_tb_cap3: 0,
    graduated_at: "2026-06-01T00:00:00Z",
    time_to_graduate_hours: 20,
  }
}

function cap4Progress(): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    ty_le_thang_dong_thuan_cao: 64,
    graduated_at: "2026-07-01T00:00:00Z",
    time_to_graduate_hours: 30,
  }
}

function cap5Progress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "c5p",
    user_id: "u1",
    entered_at: "2026-07-02T00:00:00Z",
    task_1_done_at: "2026-07-03T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_phan_loai: 25,
    so_lan_dung_ngoai_da_cham: 4,
    ty_le_quyet_dinh_dung: 72,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

let dnSeq = 0

function dnItem(overrides: Partial<DungNgoaiItem> = {}): DungNgoaiItem {
  dnSeq += 1
  return {
    id: `dn${dnSeq}`,
    symbol: "VNM",
    decided_at: "2026-07-20T02:00:00Z",
    reason: "dinh_gia_dat",
    ly_do_ten: "Định giá đang đắt",
    gia_luc_dung_ngoai: 60_000,
    han_cham_date: "2026-07-27",
    da_toi_han: true,
    cham_at: "2026-07-27T09:00:00Z",
    gia_sau_5_phien: 58_800,
    ket_qua: "ne_dung",
    ket_qua_ten: "Né đúng",
    pct_thay_doi: -2,
    giai_thich: "Giá giảm 2.0% sau 5 phiên — nước đứng ngoài hợp lý.",
    ...overrides,
  }
}

/** Dữ liệu ⑬ của mockup spec §6: né đúng 4 · né hụt 1 · chưa tới hạn 2. */
function dnList(overrides: Partial<DungNgoaiList> = {}): DungNgoaiList {
  return {
    so_lan: 7,
    so_ne_dung: 4,
    so_ne_hut: 1,
    so_trung_tinh: 0,
    so_chua_toi_han: 2,
    so_lan_da_cham: 5,
    du_de_phan_tich: true,
    so_lan_toi_thieu_phan_tich: 3,
    ly_do_hay_dung: { ma: "dinh_gia_dat", ten: "Định giá đang đắt", so_lan: 3 },
    so_phien_cham: 5,
    nguong_ne_dung_pct: 2,
    nguong_ne_hut_pct: 5,
    giai_thich:
      "Đứng ngoài được chấm bằng GIÁ THẬT sau 5 phiên, không phải bằng cảm nhận. Vùng giữa 2-5% là trung tính để không phạt oan.",
    items: [
      dnItem({ symbol: "VNM", ket_qua: "ne_dung", ket_qua_ten: "Né đúng", pct_thay_doi: -2 }),
      dnItem({
        symbol: "HPG",
        reason: "cho_vung_mua_tot_hon",
        ly_do_ten: "Chờ vùng mua tốt hơn",
        ket_qua: "ne_hut",
        ket_qua_ten: "Né hụt",
        pct_thay_doi: 7.4,
        giai_thich: "Giá tăng 7.4% sau 5 phiên — đã bỏ lỡ.",
      }),
      dnItem({
        symbol: "FPT",
        da_toi_han: false,
        cham_at: null,
        gia_sau_5_phien: null,
        ket_qua: null,
        ket_qua_ten: null,
        pct_thay_doi: null,
        han_cham_date: "2026-08-05",
        giai_thich: "Chưa tới hạn chấm.",
      }),
    ],
    ...overrides,
  }
}

beforeEach(() => {
  dungNgoai.current = { data: dnList(), isPending: false, isError: false }
})

function renderPage(
  trades: Cap5TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[] = [],
  cap5: Cap5Progress | null = cap5Progress(),
) {
  return render(
    <Cap5PortfolioAnalysis
      trades={trades}
      dailyScores={dailyScores}
      cap2Progress={cap2Progress()}
      cap3Progress={cap3Progress()}
      cap4Progress={cap4Progress()}
      cap5Progress={cap5}
      now={NOW}
    />,
  )
}

describe("Cap5PortfolioAnalysis — giữ MỌI khối Cấp 1-4 (cộng dồn)", () => {
  it("render lại nguyên các khối của Cap4PortfolioAnalysis (và Cấp 1-3 bên trong)", () => {
    // ≥5 lệnh: khối ② của Cấp 2 chỉ hiện khi đủ mẫu (dưới đó nó là khối "hidden").
    renderPage(
      [...tradesInO("dung_thang", 4), ...tradesInO("sai_thua", 2, { chamSlKhongCat: true })],
      [{ ngay: "2026-07-28", diem: 88, xepLoai: "xanh" }],
    )
    // Cấp 2 / Cấp 1
    expect(screen.getByTestId("cap2-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi2")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi3")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi4")).toBeInTheDocument()
    // ★ Cấp 2 mô hình 2 nhiệm vụ chỉ còn 4 khối — «Điểm kỷ luật 30 ngày»,
    // «Phân loại vi phạm theo tuần» và «Phát hiện từ ghi chú» đã bỏ hẳn.
    expect(screen.queryByTestId("cap2-pa-khoi5")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-pa-khoi6")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-pa-khoi7")).not.toBeInTheDocument()
    // Cấp 3
    expect(screen.getByTestId("cap3-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi7")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi8")).toBeInTheDocument()
    // Cấp 4
    expect(screen.getByTestId("cap4-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi9")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi10")).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi11")).toBeInTheDocument()
  })

  it("khối ① Cấp 5 nêu số lệnh phân loại + tỷ lệ quyết định đúng (số của server)", () => {
    renderPage([])
    const khoi1 = within(screen.getByTestId("cap5-pa-khoi1"))
    expect(khoi1.getByText(/Cấp 5 «Lão luyện»/)).toBeInTheDocument()
    expect(khoi1.getByText(/25 lệnh/)).toBeInTheDocument()
    expect(khoi1.getByText(/4 nước đứng ngoài đã được chấm/)).toBeInTheDocument()
    expect(khoi1.getByText(/72%/)).toBeInTheDocument()
    expect(khoi1.getByText(/mốc nhiệm vụ ③: 70%/)).toBeInTheDocument()
  })

  it("chưa vào Cấp 5 → nói rõ chưa có dữ liệu, không bịa số 0", () => {
    renderPage([], [], null)
    expect(
      within(screen.getByTestId("cap5-pa-khoi1")).getByText(/Chưa có hồ sơ Cấp 5/),
    ).toBeInTheDocument()
  })
})

describe("Cap5PortfolioAnalysis — ⑫ ma trận quyết định", () => {
  it("2 hàng verdict × 2 cột kết quả + tổng mỗi hàng, đúng bộ số của spec", () => {
    renderPage([
      ...tradesInO("dung_thang", 12),
      ...tradesInO("dung_thua", 6),
      ...tradesInO("sai_thang", 3),
      ...tradesInO("sai_thua", 4),
    ])
    const khoi12 = within(screen.getByTestId("cap5-pa-khoi12"))
    expect(khoi12.getByTestId("cap5-pa-khoi12-header").textContent).toMatch(/25 LỆNH/)

    const hangDung = within(khoi12.getByTestId("cap5-pa-khoi12-row-dung"))
    expect(hangDung.getByText("QĐ ĐÚNG")).toBeInTheDocument()
    expect(hangDung.getByTestId("cap5-pa-khoi12-cell-dung_thang").textContent).toBe("12 (48%)")
    expect(hangDung.getByTestId("cap5-pa-khoi12-cell-dung_thua").textContent).toBe("6 (24%)")
    expect(hangDung.getByTestId("cap5-pa-khoi12-total-dung").textContent).toBe("18 (72%)")

    const hangSai = within(khoi12.getByTestId("cap5-pa-khoi12-row-sai"))
    expect(hangSai.getByTestId("cap5-pa-khoi12-cell-sai_thang").textContent).toBe("3 (12%)")
    expect(hangSai.getByTestId("cap5-pa-khoi12-cell-sai_thua").textContent).toBe("4 (16%)")
    expect(hangSai.getByTestId("cap5-pa-khoi12-total-sai").textContent).toBe("7 (28%)")
  })

  it("hiện tỷ lệ quyết định đúng CẠNH tỷ lệ thắng — 2 thước đo khác nhau", () => {
    renderPage([
      ...tradesInO("dung_thang", 12),
      ...tradesInO("dung_thua", 6),
      ...tradesInO("sai_thang", 3),
      ...tradesInO("sai_thua", 4),
    ])
    const khoi12 = within(screen.getByTestId("cap5-pa-khoi12"))
    expect(khoi12.getByTestId("cap5-pa-khoi12-tyle-dung").textContent).toBe("72%")
    expect(khoi12.getByTestId("cap5-pa-khoi12-tyle-thang").textContent).toBe("60%")
  })

  it("Sai-Thắng ≥3 → phát hiện là CẢNH BÁO (class riêng), kèm vi phạm thật", () => {
    renderPage([
      ...tradesInO("dung_thang", 4),
      ...tradesInO("sai_thang", 3, { chamSlKhongCat: true }),
    ])
    const phatHien = screen.getByTestId("cap5-pa-khoi12-phathien")
    expect(phatHien.textContent).toMatch(/3 lệnh thắng dù làm sai quy trình/)
    expect(phatHien.textContent).toMatch(/cắt lỗ chậm/)
    expect(phatHien.className).toMatch(/cap5-pa-phathien--canhbao/)
  })

  it("Đúng-Thua cao → câu «đó là thị trường, không phải lỗi bạn», KHÔNG cảnh báo", () => {
    renderPage([...tradesInO("dung_thang", 2), ...tradesInO("dung_thua", 5)])
    const phatHien = screen.getByTestId("cap5-pa-khoi12-phathien")
    expect(phatHien.textContent).toMatch(/Đó là thị trường, không phải lỗi bạn/)
    expect(phatHien.className).not.toMatch(/canhbao/)
  })

  it("mặc định → so tỷ lệ quyết định đúng với tỷ lệ thắng trong cùng một câu", () => {
    renderPage([
      ...tradesInO("dung_thang", 6),
      ...tradesInO("dung_thua", 2),
      ...tradesInO("sai_thua", 2),
    ])
    const phatHien = screen.getByTestId("cap5-pa-khoi12-phathien")
    expect(phatHien.textContent).toMatch(/Tỷ lệ quyết định đúng 80%/)
    expect(phatHien.textContent).toMatch(/tỷ lệ thắng 60%/)
  })

  it("chưa phân loại lệnh nào → ô hiện «—», KHÔNG in 0%, kèm ghi chú trung thực", () => {
    renderPage([trade({ o4: null, verdictHe: null, verdictUser: null })])
    const khoi12 = within(screen.getByTestId("cap5-pa-khoi12"))
    expect(khoi12.getByTestId("cap5-pa-khoi12-cell-dung_thang").textContent).toBe("—")
    expect(khoi12.getByTestId("cap5-pa-khoi12-total-dung").textContent).toBe("—")
    expect(khoi12.getByTestId("cap5-pa-khoi12-tyle-dung").textContent).toBe("—")
    expect(khoi12.queryByTestId("cap5-pa-khoi12-phathien")).not.toBeInTheDocument()
    expect(khoi12.getByTestId("cap5-pa-khoi12-note").textContent).toMatch(
      /Chưa có lệnh nào được phân loại/,
    )
  })

  it("dưới ngưỡng 3 lệnh → số thật vẫn hiện nhưng nhắc là chưa đủ để kết luận", () => {
    renderPage(tradesInO("dung_thang", 2))
    const khoi12 = within(screen.getByTestId("cap5-pa-khoi12"))
    expect(khoi12.getByTestId("cap5-pa-khoi12-cell-dung_thang").textContent).toBe("2 (100%)")
    expect(khoi12.queryByTestId("cap5-pa-khoi12-phathien")).not.toBeInTheDocument()
    expect(khoi12.getByTestId("cap5-pa-khoi12-note").textContent).toMatch(/Cần ít nhất 3 lệnh/)
    expect(khoi12.getByTestId("cap5-pa-khoi12-chuadu").textContent).toMatch(/chưa đủ để kết luận/)
  })

  it("có lệnh chưa phân loại → nói rõ đã loại bao nhiêu lệnh khỏi ma trận", () => {
    renderPage([
      ...tradesInO("dung_thang", 3),
      trade({ o4: null, verdictHe: null, verdictUser: null }),
      trade({ o4: null, verdictHe: null, verdictUser: null }),
    ])
    expect(screen.getByTestId("cap5-pa-khoi12-chuaphanloai").textContent).toMatch(/2 lệnh/)
  })

  it("nêu THẲNG rằng số server có thể lệch số ma trận (không che con số thấp hơn)", () => {
    renderPage(tradesInO("dung_thang", 3))
    const server = screen.getByTestId("cap5-pa-khoi12-server")
    expect(server.textContent).toMatch(/Hệ thống chốt tỷ lệ quyết định đúng 72%/)
    expect(server.textContent).toMatch(/hai con số có thể lệch/)
  })

  it("giải thích §C12c nêu nguồn verdict + luật 0% tính là thua", () => {
    renderPage(tradesInO("dung_thang", 3))
    const giaiThich = screen.getByTestId("cap5-pa-khoi12-giaithich").textContent ?? ""
    expect(giaiThich).toMatch(/verdict bạn chốt/)
    expect(giaiThich).toMatch(/0% tính là THUA/)
  })
})

describe("Cap5PortfolioAnalysis — ⑬ nhật ký đứng ngoài (dữ liệu SERVER)", () => {
  it("tiêu đề nêu số lần + 4 con số né đúng/né hụt/trung tính/chưa tới hạn", () => {
    renderPage([])
    const khoi13 = within(screen.getByTestId("cap5-pa-khoi13"))
    expect(khoi13.getByTestId("cap5-pa-khoi13-header").textContent).toMatch(/7 LẦN/)
    const counts = khoi13.getByTestId("cap5-pa-khoi13-counts").textContent ?? ""
    expect(counts).toMatch(/Né đúng: 4/)
    expect(counts).toMatch(/Né hụt: 1/)
    expect(counts).toMatch(/Trung tính: 0/)
    expect(counts).toMatch(/Chưa tới hạn: 2/)
  })

  it("nêu lý do hay dùng kèm số lần (số của server)", () => {
    renderPage([])
    expect(screen.getByTestId("cap5-pa-khoi13-lydo").textContent).toMatch(
      /Định giá đang đắt.*3 lần/,
    )
  })

  it("liệt kê từng lần ĐÃ CHẤM: mã · lý do · kết quả · % giá sau 5 phiên", () => {
    renderPage([])
    const list = within(screen.getByTestId("cap5-pa-khoi13-list"))
    const items = list.getAllByTestId(/^cap5-pa-khoi13-item-/)
    expect(items).toHaveLength(2)

    const neDung = within(items[0])
    expect(neDung.getByText("VNM")).toBeInTheDocument()
    expect(neDung.getByText("Định giá đang đắt")).toBeInTheDocument()
    expect(neDung.getByText("Né đúng")).toBeInTheDocument()
    expect(neDung.getByText("−2.0% sau 5 phiên")).toBeInTheDocument()

    const neHut = within(items[1])
    expect(neHut.getByText("HPG")).toBeInTheDocument()
    expect(neHut.getByText("Né hụt")).toBeInTheDocument()
    expect(neHut.getByText("+7.4% sau 5 phiên")).toBeInTheDocument()
  })

  it("nước chưa tới hạn KHÔNG vào danh sách đã chấm, chỉ được đếm + nêu hạn", () => {
    renderPage([])
    const list = within(screen.getByTestId("cap5-pa-khoi13-list"))
    expect(list.queryByText("FPT")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap5-pa-khoi13-chuatoihan").textContent).toMatch(/FPT/)
  })

  it("nêu ngưỡng chấm của server (§C12c) + giải thích nguyên văn của server", () => {
    renderPage([])
    const nguong = screen.getByTestId("cap5-pa-khoi13-nguong").textContent ?? ""
    expect(nguong).toMatch(/Chấm sau 5 phiên/)
    expect(nguong).toMatch(/≤ \+2%/)
    expect(nguong).toMatch(/≥ \+5%/)
    expect(screen.getByTestId("cap5-pa-khoi13-giaithich").textContent).toMatch(/GIÁ THẬT/)
  })

  it("chưa đủ 3 lần đã chấm → CHỈ đếm, ẩn thống kê né đúng/hụt + lý do hay dùng", () => {
    dungNgoai.current = {
      data: dnList({
        so_lan: 2,
        so_lan_da_cham: 1,
        so_ne_dung: 1,
        so_ne_hut: 0,
        so_chua_toi_han: 1,
        du_de_phan_tich: false,
      }),
      isPending: false,
      isError: false,
    }
    renderPage([])
    const khoi13 = within(screen.getByTestId("cap5-pa-khoi13"))
    expect(khoi13.queryByTestId("cap5-pa-khoi13-counts")).not.toBeInTheDocument()
    expect(khoi13.queryByTestId("cap5-pa-khoi13-lydo")).not.toBeInTheDocument()
    expect(khoi13.getByTestId("cap5-pa-khoi13-chuadu").textContent).toMatch(
      /Cần thêm 2 nước đứng ngoài đã tới hạn/,
    )
  })

  it("chưa ghi nước nào → nhắc dùng nút đứng ngoài, KHÔNG in số 0 như đã đo", () => {
    dungNgoai.current = {
      data: dnList({
        so_lan: 0,
        so_lan_da_cham: 0,
        so_ne_dung: 0,
        so_ne_hut: 0,
        so_chua_toi_han: 0,
        du_de_phan_tich: false,
        ly_do_hay_dung: null,
        items: [],
      }),
      isPending: false,
      isError: false,
    }
    renderPage([])
    const khoi13 = within(screen.getByTestId("cap5-pa-khoi13"))
    expect(khoi13.getByTestId("cap5-pa-khoi13-note").textContent).toMatch(
      /Bạn chưa ghi nước đứng ngoài nào/,
    )
    expect(khoi13.queryByTestId("cap5-pa-khoi13-counts")).not.toBeInTheDocument()
  })

  it("đang tải → ghi chú, không render danh sách nào", () => {
    dungNgoai.current = { data: undefined, isPending: true, isError: false }
    renderPage([])
    const khoi13 = within(screen.getByTestId("cap5-pa-khoi13"))
    expect(khoi13.getByTestId("cap5-pa-khoi13-note").textContent).toMatch(/Đang tải/)
    expect(khoi13.queryByTestId("cap5-pa-khoi13-list")).not.toBeInTheDocument()
  })

  it("lỗi tải → nói thẳng chưa lấy được số, KHÔNG tính lại ở client", () => {
    dungNgoai.current = { data: undefined, isPending: false, isError: true }
    renderPage([])
    const khoi13 = within(screen.getByTestId("cap5-pa-khoi13"))
    expect(khoi13.getByTestId("cap5-pa-khoi13-note").textContent).toMatch(/Chưa lấy được/)
    expect(khoi13.queryByTestId("cap5-pa-khoi13-counts")).not.toBeInTheDocument()
    expect(khoi13.queryByTestId("cap5-pa-khoi13-list")).not.toBeInTheDocument()
  })
})

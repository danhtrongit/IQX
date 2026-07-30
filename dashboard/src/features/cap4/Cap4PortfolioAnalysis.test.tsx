import { render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/** Trạng thái hook `useVuKhiDiemMu` — khối ⑨ đọc THẲNG từ server, nên test
 * điều khiển đúng 3 trạng thái query (pending / error / có dữ liệu). */
const { vuKhi } = vi.hoisted(() => ({
  vuKhi: { current: {} as Record<string, unknown> },
}))
vi.mock("./hooks", () => ({
  useVuKhiDiemMu: () => vuKhi.current,
}))

import { Cap4PortfolioAnalysis } from "./Cap4PortfolioAnalysis"
import type { Cap4TradeRecord } from "./tradeLogCap4"
import type { Cap4Progress, LopWinRate, VuKhiDiemMuCap4 } from "./types"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"

const NOW = new Date("2026-07-30T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap4TradeRecord> = {}): Cap4TradeRecord {
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
    ...overrides,
  }
}

function tradesForBand(
  soLopDongThuan: number,
  n: number,
  wins: number,
  extra: Partial<Cap4TradeRecord> = {},
): Cap4TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({
      so_lop_dong_thuan: soLopDongThuan,
      pnlPct: i < wins ? 6 : -4,
      pnlVnd: i < wins ? 600_000 : -400_000,
      ...extra,
    }),
  )
}

function tradesKhacAi(n: number, wins: number): Cap4TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({
      so_lop_khac_ai: 1,
      pnlPct: i < wins ? 6 : -4,
      pnlVnd: i < wins ? 600_000 : -400_000,
    }),
  )
}

function lopRow(overrides: Partial<LopWinRate> & Pick<LopWinRate, "lop">): LopWinRate {
  return {
    ten: "Dòng tiền",
    n_orders: 10,
    n_wins: 8,
    win_rate: 80,
    nhan: "vu_khi",
    giai_thich: "Khi bạn tự đọc lớp Dòng tiền là Ủng hộ: 8/10 lệnh đã đóng thắng (80.0%).",
    ...overrides,
  }
}

/** Dữ liệu ⑨ của mockup `iqx-cap4-phantich-danhmuc.html` (server đã sắp xếp). */
function vuKhiData(overrides: Partial<VuKhiDiemMuCap4> = {}): VuKhiDiemMuCap4 {
  return {
    lop: [
      lopRow({ lop: "dong_tien", ten: "Dòng tiền", n_orders: 10, n_wins: 8, win_rate: 80 }),
      lopRow({
        lop: "ky_thuat",
        ten: "Kỹ thuật",
        n_orders: 13,
        n_wins: 8,
        win_rate: 62,
        nhan: null,
        giai_thich: "Khi bạn tự đọc lớp Kỹ thuật là Ủng hộ: 8/13 lệnh đã đóng thắng (62.0%).",
      }),
      lopRow({
        lop: "dinh_gia",
        ten: "Định giá",
        n_orders: 12,
        n_wins: 7,
        win_rate: 58,
        nhan: null,
        giai_thich: "Khi bạn tự đọc lớp Định giá là Ủng hộ: 7/12 lệnh đã đóng thắng (58.0%).",
      }),
      lopRow({
        lop: "noi_bo",
        ten: "Nội bộ",
        n_orders: 2,
        n_wins: 1,
        win_rate: 50,
        nhan: "chua_du_du_lieu",
        giai_thich:
          "Khi bạn tự đọc lớp Nội bộ là Ủng hộ: 1/2 lệnh đã đóng thắng (50.0%). Chưa đủ dữ liệu để kết luận — cần ít nhất 3 lệnh đã đóng cho lớp này.",
      }),
      lopRow({
        lop: "tin_tuc",
        ten: "Tin tức",
        n_orders: 5,
        n_wins: 2,
        win_rate: 40,
        nhan: "diem_mu",
        giai_thich:
          "Khi bạn tự đọc lớp Tin tức là Ủng hộ: 2/5 lệnh đã đóng thắng (40.0%). Dưới 50% — đây là điểm mù, xem lại cách bạn đọc lớp này.",
      }),
    ],
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    so_lenh_toi_thieu: 3,
    nguong_vu_khi: 70,
    nguong_diem_mu: 50,
    giai_thich:
      "Đo bằng KẾT QUẢ THẬT của thị trường, không phải độ khớp AI: với mỗi lớp, lấy các lệnh đã đóng mà bạn tự đọc lớp đó là Ủng hộ rồi tính % lệnh thắng.",
    ...overrides,
  }
}

function cap2Progress(): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: "2026-05-01T00:00:00Z",
    chuoi_current: 4,
    chuoi_record: 6,
    last_chuoi_reset_at: null,
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

function cap4Progress(overrides: Partial<Cap4Progress> = {}): Cap4Progress {
  return {
    id: "c4p",
    user_id: "u1",
    entered_at: "2026-06-02T00:00:00Z",
    task_1_done_at: "2026-06-03T00:00:00Z",
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_doc_du_5lop: 22,
    vu_khi_lop: "dong_tien",
    diem_mu_lop: "tin_tuc",
    ty_le_thang_dong_thuan_cao: 64,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

beforeEach(() => {
  vuKhi.current = { data: vuKhiData(), isPending: false, isError: false }
})

function renderPage(
  trades: Cap4TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[] = [],
  cap4 : Cap4Progress | null = cap4Progress(),
) {
  return render(
    <Cap4PortfolioAnalysis
      trades={trades}
      dailyScores={dailyScores}
      cap2Progress={cap2Progress()}
      cap3Progress={cap3Progress()}
      cap4Progress={cap4}
      now={NOW}
    />,
  )
}

describe("Cap4PortfolioAnalysis — giữ mọi khối Cấp 1-3 (cộng dồn)", () => {
  it("render lại nguyên các khối của Cap3PortfolioAnalysis (và của Cấp 1-2 bên trong)", () => {
    renderPage([...tradesForBand(5, 4, 3), ...tradesForBand(0, 4, 1)], [
      { ngay: "2026-07-20", diem: 85, xepLoai: "xanh" },
    ])
    expect(screen.getByTestId("cap2-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi2")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi3")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi4")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi5")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi6")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi7")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi7")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-pa-khoi8")).toBeInTheDocument()
  })

  it("khối ① Cấp 4 nêu số lệnh đọc đủ 5 lớp + vũ khí/điểm mù (số của server)", () => {
    renderPage([])
    const header = within(screen.getByTestId("cap4-pa-khoi1"))
    expect(header.getByText(/Cấp 4 «Thuần thục»/)).toBeInTheDocument()
    expect(header.getByText(/22 lệnh/)).toBeInTheDocument()
    expect(header.getByText(/💰 Dòng tiền/)).toBeInTheDocument()
    expect(header.getByText(/📰 Tin tức/)).toBeInTheDocument()
  })

  it("chưa vào Cấp 4 → nói rõ chưa có dữ liệu, không bịa số 0", () => {
    renderPage([], [], null)
    const header = within(screen.getByTestId("cap4-pa-khoi1"))
    expect(header.getByText(/Chưa có hồ sơ Cấp 4/)).toBeInTheDocument()
  })
})

describe("Cap4PortfolioAnalysis — ⑨ vũ khí & điểm mù (dữ liệu SERVER)", () => {
  it("render 5 lớp theo thứ tự server trả về, kèm n_wins/n_orders + % thắng", () => {
    renderPage([])
    const khoi9 = screen.getByTestId("cap4-pa-khoi9")
    expect(within(khoi9).getByText(/Bạn đọc lớp nào chuẩn nhất/i)).toBeInTheDocument()

    const rows = within(khoi9).getAllByTestId(/^cap4-pa-khoi9-row-/)
    expect(rows.map((r) => r.getAttribute("data-lop"))).toEqual([
      "dong_tien",
      "ky_thuat",
      "dinh_gia",
      "noi_bo",
      "tin_tuc",
    ])

    const dongTien = within(screen.getByTestId("cap4-pa-khoi9-row-dong_tien"))
    expect(dongTien.getByText(/💰 Dòng tiền/)).toBeInTheDocument()
    expect(dongTien.getByText("80%")).toBeInTheDocument()
    expect(dongTien.getByText("8/10 lệnh")).toBeInTheDocument()
    expect(dongTien.getByText("vũ khí")).toBeInTheDocument()
  })

  it("lớp <50% mang nhãn điểm mù; lớp chưa đủ lệnh KHÔNG mang nhãn nào", () => {
    renderPage([])
    const tinTuc = within(screen.getByTestId("cap4-pa-khoi9-row-tin_tuc"))
    expect(tinTuc.getByText("điểm mù")).toBeInTheDocument()
    const noiBo = within(screen.getByTestId("cap4-pa-khoi9-row-noi_bo"))
    expect(noiBo.queryByText("điểm mù")).not.toBeInTheDocument()
    expect(noiBo.queryByText("vũ khí")).not.toBeInTheDocument()
    // Dùng testid: "chưa đủ dữ liệu" xuất hiện ở CẢ nhãn và câu giải thích của
    // server, nên `getByText` trần sẽ khớp 2 phần tử.
    expect(noiBo.getByTestId("cap4-pa-khoi9-chuadu").textContent).toMatch(/chưa đủ dữ liệu/i)
  })

  it("mỗi lớp kèm giải thích của server (§C12c) + giải thích chung", () => {
    renderPage([])
    expect(
      within(screen.getByTestId("cap4-pa-khoi9-row-tin_tuc")).getByText(/đây là điểm mù/),
    ).toBeInTheDocument()
    expect(screen.getByTestId("cap4-pa-khoi9-giaithich").textContent).toMatch(
      /KẾT QUẢ THẬT của thị trường/,
    )
  })

  it("lớp chưa có lệnh nào → % thắng hiện «—», KHÔNG in 0%", () => {
    vuKhi.current = {
      data: vuKhiData({
        lop: [
          lopRow({
            lop: "noi_bo",
            ten: "Nội bộ",
            n_orders: 0,
            n_wins: 0,
            win_rate: null,
            nhan: "chua_du_du_lieu",
            giai_thich: "Chưa có lệnh nào đã đóng mà bạn tự đọc lớp Nội bộ là Ủng hộ.",
          }),
        ],
        vu_khi_lop: null,
        diem_mu_lop: null,
      }),
      isPending: false,
      isError: false,
    }
    renderPage([])
    const noiBo = within(screen.getByTestId("cap4-pa-khoi9-row-noi_bo"))
    expect(noiBo.getByText("—")).toBeInTheDocument()
    expect(noiBo.queryByText("0%")).not.toBeInTheDocument()
  })

  it("đang tải → ghi chú, không render hàng nào", () => {
    vuKhi.current = { data: undefined, isPending: true, isError: false }
    renderPage([])
    const khoi9 = within(screen.getByTestId("cap4-pa-khoi9"))
    expect(khoi9.getByTestId("cap4-pa-khoi9-note").textContent).toMatch(/Đang tải/)
    expect(khoi9.queryAllByTestId(/^cap4-pa-khoi9-row-/)).toHaveLength(0)
  })

  it("lỗi tải → nói thẳng chưa lấy được số, KHÔNG tính lại ở client", () => {
    vuKhi.current = { data: undefined, isPending: false, isError: true }
    renderPage([])
    const khoi9 = within(screen.getByTestId("cap4-pa-khoi9"))
    expect(khoi9.getByTestId("cap4-pa-khoi9-note").textContent).toMatch(/Chưa lấy được/)
    expect(khoi9.queryAllByTestId(/^cap4-pa-khoi9-row-/)).toHaveLength(0)
  })
})

describe("Cap4PortfolioAnalysis — ⑩ đọc toàn cảnh có giúp chọn lệnh tốt hơn", () => {
  it("3 dải đồng thuận kèm tỷ lệ thắng + số lệnh, và phát hiện khi đủ dữ liệu", () => {
    renderPage([...tradesForBand(5, 4, 4), ...tradesForBand(3, 4, 2), ...tradesForBand(0, 4, 1)])
    const khoi10 = within(screen.getByTestId("cap4-pa-khoi10"))
    const cao = within(khoi10.getByTestId("cap4-pa-khoi10-row-cao"))
    expect(cao.getByText("4-5 lớp ủng hộ")).toBeInTheDocument()
    expect(cao.getByText("100%")).toBeInTheDocument()
    expect(cao.getByText("4")).toBeInTheDocument()
    const thap = within(khoi10.getByTestId("cap4-pa-khoi10-row-thap"))
    expect(thap.getByText("25%")).toBeInTheDocument()
    expect(khoi10.getByTestId("cap4-pa-khoi10-phathien").textContent).toMatch(
      /Đọc toàn cảnh có hiệu quả/,
    )
  })

  it("thiếu dữ liệu → ghi chú thay vì kết luận", () => {
    renderPage(tradesForBand(5, 4, 3))
    const khoi10 = within(screen.getByTestId("cap4-pa-khoi10"))
    expect(khoi10.queryByTestId("cap4-pa-khoi10-phathien")).not.toBeInTheDocument()
    expect(khoi10.getByTestId("cap4-pa-khoi10-note").textContent).toMatch(/Cần ít nhất 3 lệnh/)
  })

  it("có lệnh chưa lộ AI → nói rõ đã loại bao nhiêu lệnh khỏi bảng", () => {
    renderPage([
      ...tradesForBand(5, 3, 3),
      trade({ so_lop_dong_thuan: null, ai_5_lop: null, so_lop_khac_ai: null }),
    ])
    expect(screen.getByTestId("cap4-pa-khoi10-excluded").textContent).toMatch(/1 lệnh/)
  })

  it("giải thích nêu rõ đồng thuận đếm theo đánh giá AI (§C12c)", () => {
    renderPage([])
    expect(screen.getByTestId("cap4-pa-khoi10-giaithich").textContent).toMatch(
      /AI đánh giá Ủng hộ/,
    )
  })
})

describe("Cap4PortfolioAnalysis — ⑪ góc nhìn riêng của bạn", () => {
  it("3 số: lần khác AI · bạn đúng · AI đúng + phát hiện trung thực", () => {
    renderPage(tradesKhacAi(12, 7))
    const khoi11 = within(screen.getByTestId("cap4-pa-khoi11"))
    expect(khoi11.getByTestId("cap4-pa-khoi11-khacai").textContent).toBe("12")
    expect(khoi11.getByTestId("cap4-pa-khoi11-bandung").textContent).toBe("7")
    expect(khoi11.getByTestId("cap4-pa-khoi11-aidung").textContent).toBe("5")
    expect(khoi11.getByTestId("cap4-pa-khoi11-phathien").textContent).toMatch(
      /Trực giác riêng của bạn đang có cơ sở/,
    )
  })

  it("AI đúng nhiều hơn → nhắc thẳng, không xu nịnh", () => {
    renderPage(tradesKhacAi(12, 3))
    const khoi11 = within(screen.getByTestId("cap4-pa-khoi11"))
    expect(khoi11.getByTestId("cap4-pa-khoi11-phathien").textContent).toMatch(/phần lớn AI đúng/)
  })

  it("chưa đủ lệnh khác AI → ghi chú, không phát hiện", () => {
    renderPage(tradesKhacAi(2, 2))
    const khoi11 = within(screen.getByTestId("cap4-pa-khoi11"))
    expect(khoi11.queryByTestId("cap4-pa-khoi11-phathien")).not.toBeInTheDocument()
    expect(khoi11.getByTestId("cap4-pa-khoi11-note").textContent).toMatch(/Cần ít nhất 5 lệnh/)
  })
})

import { render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import { Cap3PortfolioAnalysis } from "./Cap3PortfolioAnalysis"
import type { Cap3TradeRecord } from "./tradeLogCap3"
import type { Cap3Progress, MucTuTin } from "./types"

const NOW = new Date("2026-07-29T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap3TradeRecord> = {}): Cap3TradeRecord {
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
    ghiChuNhinLai: null,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    ...overrides,
  }
}

function tradesFor(
  mucTuTin: MucTuTin,
  n: number,
  wins: number,
  extra: Partial<Cap3TradeRecord> = {},
): Cap3TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({ mucTuTin, pnlPct: i < wins ? 6 : -4, pnlVnd: i < wins ? 600_000 : -400_000, ...extra }),
  )
}

function cap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
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
    ...overrides,
  }
}

function cap3Progress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
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
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPage(
  trades: Cap3TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[] = [],
  cap3 = cap3Progress(),
) {
  return render(
    <Cap3PortfolioAnalysis
      trades={trades}
      dailyScores={dailyScores}
      cap2Progress={cap2Progress()}
      cap3Progress={cap3}
      now={NOW}
    />,
  )
}

describe("Cap3PortfolioAnalysis — giữ mọi khối Cấp 1-2 (cộng dồn)", () => {
  it("render lại nguyên các khối của Cap2PortfolioAnalysis", () => {
    renderPage([...tradesFor(3, 4, 3), ...tradesFor(1, 4, 1)], [
      { ngay: "2026-07-20", diem: 85, xepLoai: "xanh" },
    ])
    // Khối 1/2 (delegated Cấp 1) + khối 3-7 (Cấp 2) đều còn.
    expect(screen.getByTestId("cap2-pa-khoi1")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi2")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi3")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-khoi4")).toBeInTheDocument()
    // ★ Cấp 2 mô hình 2 nhiệm vụ chỉ còn 4 khối — «Điểm kỷ luật 30 ngày»,
    // «Phân loại vi phạm theo tuần» và «Phát hiện từ ghi chú» đã bỏ hẳn.
    expect(screen.queryByTestId("cap2-pa-khoi5")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-pa-khoi6")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap2-pa-khoi7")).not.toBeInTheDocument()
  })

  it("khối ① Cấp 3 hiện khẩu vị rủi ro đang dùng (spec §8)", () => {
    renderPage([])
    const header = within(screen.getByTestId("cap3-pa-khoi1"))
    expect(header.getByText(/Cấp 3 «Bản lĩnh»/)).toBeInTheDocument()
    expect(header.getByText(/Khẩu vị: Cân bằng \(trần 20% vốn\/lệnh\)/)).toBeInTheDocument()
  })

  it("chưa đặt khẩu vị → nói rõ chưa đặt, không bịa mức mặc định", () => {
    renderPage([], [], cap3Progress({ khau_vi: null, khau_vi_da_dat: false }))
    const header = within(screen.getByTestId("cap3-pa-khoi1"))
    expect(header.getByText(/Chưa đặt khẩu vị rủi ro/)).toBeInTheDocument()
    expect(header.queryByText(/trần 20%/)).not.toBeInTheDocument()
  })
})

describe("Cap3PortfolioAnalysis — khối ⑦ thắng/thua theo mức tự tin", () => {
  it("hiện 3 hàng (Cao/Vừa/Thấp) kèm số lệnh, tỷ lệ thắng, lãi/lỗ TB", () => {
    renderPage([...tradesFor(3, 4, 4), ...tradesFor(2, 3, 2), ...tradesFor(1, 4, 1)])
    const khoi7 = within(screen.getByTestId("cap3-pa-khoi7"))
    expect(khoi7.getByText(/Thắng\/thua theo mức tự tin/i)).toBeInTheDocument()
    const cao = within(khoi7.getByTestId("cap3-pa-khoi7-row-3"))
    expect(cao.getByText("⭐⭐⭐ Cao")).toBeInTheDocument()
    expect(cao.getByText("4")).toBeInTheDocument()
    expect(cao.getByText("100%")).toBeInTheDocument()
    expect(cao.getByText("+6.0%")).toBeInTheDocument()
    const thap = within(khoi7.getByTestId("cap3-pa-khoi7-row-1"))
    expect(thap.getByText("25%")).toBeInTheDocument()
    expect(thap.getByText("−1.5%")).toBeInTheDocument()
  })

  it('phát hiện "đáng tin" khi tự tin cao thắng hơn hẳn', () => {
    renderPage([...tradesFor(3, 4, 4), ...tradesFor(1, 4, 1)])
    const khoi7 = within(screen.getByTestId("cap3-pa-khoi7"))
    expect(khoi7.getByTestId("cap3-pa-khoi7-phathien").textContent).toMatch(/đáng tin/)
  })

  it("mức chưa đủ lệnh: hiện dấu chưa đủ dữ liệu thay vì kết luận", () => {
    renderPage(tradesFor(2, 1, 1))
    const khoi7 = within(screen.getByTestId("cap3-pa-khoi7"))
    const vua = within(khoi7.getByTestId("cap3-pa-khoi7-row-2"))
    expect(vua.getByText(/chưa đủ/i)).toBeInTheDocument()
    expect(khoi7.queryByTestId("cap3-pa-khoi7-phathien")).not.toBeInTheDocument()
    expect(khoi7.getByTestId("cap3-pa-khoi7-note").textContent).toMatch(/Cần ít nhất 3 lệnh/)
  })

  it("mức không có lệnh nào: ô số hiện — (không phải 0%)", () => {
    renderPage(tradesFor(3, 3, 2))
    const thap = within(screen.getByTestId("cap3-pa-khoi7-row-1"))
    expect(thap.getAllByText("—").length).toBeGreaterThan(0)
    expect(thap.queryByText("0%")).not.toBeInTheDocument()
  })
})

describe("Cap3PortfolioAnalysis — khối ⑧ khối lượng có đi theo tự tin không", () => {
  it("hiện KL TB, %vốn TB và cách hay dùng theo từng mức", () => {
    renderPage([
      ...tradesFor(3, 3, 2, { khoiLuong: 1_100, pctVon: 19 }),
      ...tradesFor(2, 3, 2, { khoiLuong: 640, pctVon: 15 }),
      ...tradesFor(1, 3, 1, { khoiLuong: 410, pctVon: 10, cachKhoiLuong: "ky_luat" }),
    ])
    const khoi8 = within(screen.getByTestId("cap3-pa-khoi8"))
    expect(khoi8.getByText(/Khối lượng có đi theo tự tin/i)).toBeInTheDocument()
    const cao = within(khoi8.getByTestId("cap3-pa-khoi8-row-3"))
    expect(cao.getByText("1,100")).toBeInTheDocument()
    expect(cao.getByText("19%")).toBeInTheDocument()
    expect(cao.getByText(/Khẩu vị × tự tin/)).toBeInTheDocument()
    const thap = within(khoi8.getByTestId("cap3-pa-khoi8-row-1"))
    expect(thap.getByText(/Chia đều theo khẩu vị/)).toBeInTheDocument()
    expect(khoi8.getByTestId("cap3-pa-khoi8-phathien").textContent).toMatch(/đúng hướng/)
  })

  it("khối lượng phẳng → gợi ý dùng Cách 1", () => {
    renderPage([
      ...tradesFor(3, 3, 2, { khoiLuong: 300, pctVon: 20, cachKhoiLuong: "ky_luat" }),
      ...tradesFor(1, 3, 1, { khoiLuong: 300, pctVon: 20, cachKhoiLuong: "ky_luat" }),
    ])
    const khoi8 = within(screen.getByTestId("cap3-pa-khoi8"))
    expect(khoi8.getByTestId("cap3-pa-khoi8-phathien").textContent).toMatch(/chưa đi theo tự tin/)
  })

  it("thiếu dữ liệu → ghi chú thay vì kết luận", () => {
    renderPage(tradesFor(3, 3, 2))
    const khoi8 = within(screen.getByTestId("cap3-pa-khoi8"))
    expect(khoi8.queryByTestId("cap3-pa-khoi8-phathien")).not.toBeInTheDocument()
    expect(khoi8.getByTestId("cap3-pa-khoi8-note").textContent).toMatch(/Cần ít nhất 3 lệnh/)
  })

  it("không có lệnh nào: cả 2 khối mới vẫn render với ghi chú thiếu dữ liệu", () => {
    renderPage([])
    expect(
      within(screen.getByTestId("cap3-pa-khoi7")).getByTestId("cap3-pa-khoi7-note").textContent,
    ).toMatch(/Chưa có lệnh/)
    expect(
      within(screen.getByTestId("cap3-pa-khoi8")).getByTestId("cap3-pa-khoi8-note"),
    ).toBeInTheDocument()
  })
})

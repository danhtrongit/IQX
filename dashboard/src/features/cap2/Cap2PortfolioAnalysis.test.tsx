import { render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"
import { Cap2PortfolioAnalysis } from "./Cap2PortfolioAnalysis"
import type { Cap2DailyScoreRecord, Cap2TradeRecord } from "./portfolioAnalysisCap2"
import type { Cap2Progress } from "./types"

const NOW = new Date("2026-07-29T12:00:00Z")

function trade(overrides: Partial<Cap2TradeRecord> = {}): Cap2TradeRecord {
  return {
    orderId: "o",
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 1,
    pnlVnd: 1,
    closedAt: "2026-07-25T10:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    ghiChuNhinLai: null,
    ...overrides,
  }
}

function dailyScore(overrides: Partial<Cap2DailyScoreRecord> = {}): Cap2DailyScoreRecord {
  return { ngay: "2026-07-01", diem: 80, xepLoai: "xanh", ...overrides }
}

function progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    chuoi_current: 0,
    chuoi_record: 0,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("Cap2PortfolioAnalysis — Khối 1 (Cấp 2 label, spec §12)", () => {
  it("labels Khối 1 with 'Cấp 2 «Kỷ luật»' (not Cấp 1's label)", () => {
    render(<Cap2PortfolioAnalysis trades={[]} dailyScores={[]} progress={progress()} now={NOW} />)
    expect(screen.getByText(/Cấp 2 «Kỷ luật»/)).toBeInTheDocument()
  })

  it("shows Khối 1 win/loss stats computed from trades", () => {
    const trades = [
      trade({ orderId: "1", pnlVnd: 100 }),
      trade({ orderId: "2", pnlVnd: 100 }),
      trade({ orderId: "3", pnlVnd: -100 }),
    ]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi1 = screen.getByTestId("cap2-pa-khoi1")
    expect(within(khoi1).getByText(/3 lệnh Thực chiến/)).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — Khối 2 bảng thắng/thua (delegated, unchanged threshold)", () => {
  it("<5 lệnh: hides Khối 2 with the fallback note", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    expect(screen.queryByTestId("cap2-pa-khoi2")).not.toBeInTheDocument()
    expect(screen.getByText(/Cần ≥5 lệnh/)).toBeInTheDocument()
  })

  it(">=5 lệnh: shows Khối 2 bảng thắng/thua", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    expect(screen.getByTestId("cap2-pa-khoi2")).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — Khối 3 vi phạm theo 4 loại (§12 adjustment)", () => {
  it("renders the 4 loại vi phạm with counts", () => {
    const trades = [
      trade({ orderId: "1", closedAt: "2026-07-20T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "2", closedAt: "2026-07-21T10:00:00Z", chamTpGiuLamHut: true }),
    ]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi3 = screen.getByTestId("cap2-pa-khoi3")
    expect(within(khoi3).getByText(/Cắt lỗ chậm/)).toBeInTheDocument()
    expect(within(khoi3).getByText(/Chốt lời hụt/)).toBeInTheDocument()
    expect(within(khoi3).getByText(/Bán sớm khi lỗ nhẹ/)).toBeInTheDocument()
    expect(within(khoi3).getByText(/Nhồi lệnh khi lỗ/)).toBeInTheDocument()
  })

  it("shows an honest note when there is no trade in the last 30 days", () => {
    render(<Cap2PortfolioAnalysis trades={[]} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi3 = screen.getByTestId("cap2-pa-khoi3")
    expect(within(khoi3).getByText(/Chưa có lệnh/)).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — Khối 4 cửa sổ 20 lệnh (§12 adjustment)", () => {
  it("shows the not-yet-full-window note under 20 trades", () => {
    const trades = [trade({ orderId: "1" })]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi4 = screen.getByTestId("cap2-pa-khoi4")
    expect(within(khoi4).getByText(/Cần đủ 20 lệnh/)).toBeInTheDocument()
  })

  it("shows the graduation-ready note once the server says 2/2 nhiệm vụ are done", () => {
    render(
      <Cap2PortfolioAnalysis
        trades={[]}
        dailyScores={[]}
        progress={progress({ task_1_done_at: "2026-07-01T00:00:00Z", task_2_done_at: "2026-07-01T00:00:00Z" })}
        now={NOW}
      />,
    )
    const khoi4 = screen.getByTestId("cap2-pa-khoi4")
    expect(within(khoi4).getByText(/Đủ điều kiện lên Cấp 3/)).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — Khối 5 điểm kỷ luật 30 ngày", () => {
  it("shows avg7/avg30 and the Xanh/Vàng/Đỏ distribution", () => {
    const dailyScores = [
      ...Array.from({ length: 5 }, (_, i) => dailyScore({ ngay: `2026-07-0${i + 1}`, diem: 90, xepLoai: "xanh" })),
      ...Array.from({ length: 3 }, (_, i) => dailyScore({ ngay: `2026-07-1${i}`, diem: 75, xepLoai: "vang" })),
      ...Array.from({ length: 2 }, (_, i) => dailyScore({ ngay: `2026-07-2${i}`, diem: 60, xepLoai: "do" })),
    ]
    render(<Cap2PortfolioAnalysis trades={[]} dailyScores={dailyScores} progress={progress()} now={NOW} />)
    const khoi5 = screen.getByTestId("cap2-pa-khoi5")
    expect(within(khoi5).getByTestId("cap2-pa-khoi5-avg7")).toBeInTheDocument()
    expect(within(khoi5).getByTestId("cap2-pa-khoi5-avg30")).toBeInTheDocument()
    expect(within(khoi5).getByText("5")).toBeInTheDocument() // xanh count
  })

  it("shows an honest insufficient-data note with <7 days of history", () => {
    const dailyScores = [dailyScore({ ngay: "2026-07-01" }), dailyScore({ ngay: "2026-07-02" })]
    render(<Cap2PortfolioAnalysis trades={[]} dailyScores={dailyScores} progress={progress()} now={NOW} />)
    const khoi5 = screen.getByTestId("cap2-pa-khoi5")
    expect(within(khoi5).getByText(/Mới có 2 ngày/)).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — Khối 6 phân loại vi phạm theo tuần", () => {
  it("shows the weekly trend note", () => {
    const trades = [
      trade({ orderId: "w0", closedAt: "2026-07-02T10:00:00Z" }),
      trade({ orderId: "w1", closedAt: "2026-07-13T10:00:00Z" }),
      trade({ orderId: "w2", closedAt: "2026-07-17T10:00:00Z" }),
      trade({ orderId: "w3", closedAt: "2026-07-24T10:00:00Z" }),
    ]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi6 = screen.getByTestId("cap2-pa-khoi6")
    expect(within(khoi6).getByText(/Không có vi phạm/)).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — Khối 7 phát hiện từ ghi chú", () => {
  it("shows the insufficient-ghi-chú note under 3 ghi chú", () => {
    render(<Cap2PortfolioAnalysis trades={[]} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi7 = screen.getByTestId("cap2-pa-khoi7")
    expect(within(khoi7).getByText(/Cần ít nhất 3 ghi chú/)).toBeInTheDocument()
  })

  it("shows a detected reflection insight once >=3 ghi chú qualify", () => {
    const trades = [
      trade({ orderId: "1", chamSlKhongCat: true, ghiChuNhinLai: "sợ mất lãi nên bán" }),
      trade({ orderId: "2", chamSlKhongCat: true, ghiChuNhinLai: "cứ tiếc nên giữ lại" }),
      trade({ orderId: "3", chamSlKhongCat: true, ghiChuNhinLai: "muốn chờ hồi thêm chút" }),
    ]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    const khoi7 = screen.getByTestId("cap2-pa-khoi7")
    expect(within(khoi7).getByText(/loss aversion điển hình/)).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — mẫu tự phát hiện (tối đa 3 trên 12 mẫu)", () => {
  it("renders up to 3 mẫu when they fire", () => {
    const trades = [
      trade({ orderId: "1", closedAt: "2026-07-20T10:00:00Z", lyDo: "noi_bo", chamSlKhongCat: true }),
      trade({ orderId: "2", closedAt: "2026-07-21T10:00:00Z", lyDo: "noi_bo", chamSlKhongCat: true }),
      trade({ orderId: "3", closedAt: "2026-07-22T10:00:00Z", lyDo: "noi_bo", chamSlKhongCat: true }),
      trade({ orderId: "4", closedAt: "2026-07-23T10:00:00Z", lyDo: "noi_bo", nhoiLenhKhiLo: true }),
      trade({ orderId: "5", closedAt: "2026-07-24T10:00:00Z", lyDo: "noi_bo", nhoiLenhKhiLo: true }),
    ]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    const mauSection = screen.getByTestId("cap2-pa-mau")
    expect(within(mauSection).getByTestId("cap2-pa-mau-mau9_loai_pho_bien")).toBeInTheDocument()
  })

  it("shows an insufficient-data note when no mẫu fires (delegates Cấp 1's <3-trades note here)", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    expect(screen.getByTestId("cap2-pa-mau-empty")).toBeInTheDocument()
  })

  it("shows the Cấp-2-specific fallback note when Cấp 1's own note is null but nothing fires", () => {
    // >=5 trades so Cấp 1's mauInsufficientNote is its generic "no pattern" text
    // (not the <3-trades one), and nothing about them qualifies any of the 12 mẫu.
    const trades = Array.from({ length: 5 }, (_, i) =>
      trade({ orderId: String(i), lyDo: "ky_thuat", trangThaiLucDat: "trung_tinh", pnlVnd: i % 2 === 0 ? 100 : -100 }),
    )
    render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={progress()} now={NOW} />)
    expect(screen.getByTestId("cap2-pa-mau-empty")).toBeInTheDocument()
  })
})

describe("Cap2PortfolioAnalysis — degrades gracefully", () => {
  it("does not throw with null progress and empty data", () => {
    expect(() =>
      render(<Cap2PortfolioAnalysis trades={[]} dailyScores={[]} progress={null} now={NOW} />),
    ).not.toThrow()
  })
})

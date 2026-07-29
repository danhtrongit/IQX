import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"
import { Cap1PortfolioAnalysis } from "./Cap1PortfolioAnalysis"
import type { Cap1Progress } from "./types"
import type { Cap1TradeRecord } from "./tradeLog"

function progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-03-15T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "2026-03-15T00:00:00Z",
    task_2_done_at: "2026-03-16T00:00:00Z",
    task_3_done_at: null,
    task_4_done_at: "2026-04-01T00:00:00Z",
    task_5_done_at: null,
    task_6_done_at: null,
    so_ly_do_da_dung: 3,
    so_lenh_ly_do_ung_ho: 3,
    so_lan_xem_danh_muc: 2,
    so_lenh_thuc_chien: 10,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function trade(overrides: Partial<Cap1TradeRecord>): Cap1TradeRecord {
  return {
    orderId: "o",
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 1,
    pnlVnd: 1,
    closedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

describe("Cap1PortfolioAnalysis (spec §7 — 4 khối)", () => {
  it("renders Khối 1 hồ sơ tổng quan", () => {
    const trades = [
      trade({ orderId: "1", pnlVnd: 100 }),
      trade({ orderId: "2", pnlVnd: 100 }),
      trade({ orderId: "3", pnlVnd: -100 }),
      trade({ orderId: "4", pnlVnd: 100 }),
      trade({ orderId: "5", pnlVnd: -100 }),
    ]
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.getByText(/HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN/)).toBeInTheDocument()
    expect(screen.getByText(/Cấp 1 «Học việc»/)).toBeInTheDocument()
    expect(screen.getByText(/Tỷ lệ thắng: 60%/)).toBeInTheDocument()
    expect(screen.getByText(/3 lãi \/ 2 lỗ/)).toBeInTheDocument()
  })

  it("renders Khối 4 tiến trình 6 nhiệm vụ with the done/pending state from progress", () => {
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[]} />)
    expect(screen.getByText("6 NHIỆM VỤ CẤP 1")).toBeInTheDocument()
    expect(screen.getByText(/Lệnh đầu có kế hoạch/)).toBeInTheDocument()
    expect(screen.getByText(/10 lệnh/)).toBeInTheDocument()
  })

  it("<5 lệnh: hides Khối 2 and shows the fallback note", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.queryByText("BẢNG THẮNG/THUA THEO 5 LÝ DO")).not.toBeInTheDocument()
    expect(screen.getByText(/Cần ≥5 lệnh/)).toBeInTheDocument()
  })

  it(">=5 lệnh: shows Khối 2 bảng thắng/thua", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.getByText("BẢNG THẮNG/THUA THEO 5 LÝ DO")).toBeInTheDocument()
  })

  it("renders Khối 3 độ phủ 5 lý do", () => {
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[]} />)
    expect(screen.getByText(/ĐỘ PHỦ 5 LÝ DO/)).toBeInTheDocument()
    expect(screen.getByText(/CHỌN LÝ DO CÓ CƠ SỞ/)).toBeInTheDocument()
  })

  it("fires Mẫu 1 (Vũ khí riêng) when its condition is met", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) => trade({ orderId: `w${i}`, lyDo: "dong_tien", pnlVnd: 100 })),
      trade({ orderId: "l1", lyDo: "dong_tien", pnlVnd: -100 }),
    ]
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.getByText(/Bạn thắng nhiều nhất khi mua vì/)).toBeInTheDocument()
  })

  it("shows the graduation CTA once 6/6 nhiệm vụ are done", () => {
    const p = progress({
      task_1_done_at: "x",
      task_2_done_at: "x",
      task_3_done_at: "x",
      task_4_done_at: "x",
      task_5_done_at: "x",
      task_6_done_at: "x",
    })
    render(<Cap1PortfolioAnalysis progress={p} trades={[]} />)
    expect(screen.getByText(/ĐỦ điều kiện lên Cấp 2/)).toBeInTheDocument()
  })

  it("degrades gracefully with null progress (not entered yet)", () => {
    expect(() => render(<Cap1PortfolioAnalysis progress={null} trades={[]} />)).not.toThrow()
  })
})

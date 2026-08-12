import { render, screen, within } from "@testing-library/react"
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
    so_ly_do_da_dung: 3,
    so_lenh_ly_do_ung_ho: 3,
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
  it("titles the 4 khối with the mockup's circled numerals + wording", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.getByText("① Hồ sơ tổng quan")).toBeInTheDocument()
    expect(screen.getByText("② Thắng / thua theo 5 lý do")).toBeInTheDocument()
    expect(screen.getByText("③ Độ phủ 5 lý do + Chọn lý do có cơ sở")).toBeInTheDocument()
    expect(screen.getByText("④ Tiến trình 5 nhiệm vụ")).toBeInTheDocument()
    expect(screen.getByText("🔍 Mẫu hệ thống phát hiện (về lý do)")).toBeInTheDocument()
  })

  it("does NOT render the mockup's page header (this is a sidebar panel)", () => {
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[]} />)
    expect(screen.queryByText(/Quay lại Nắm giữ/)).not.toBeInTheDocument()
  })

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

  it("renders Khối 4 tiến trình 5 nhiệm vụ with the done/pending state from progress", () => {
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[]} />)
    expect(screen.getByText("④ Tiến trình 5 nhiệm vụ")).toBeInTheDocument()
    expect(screen.getByText(/Lệnh đầu có kế hoạch/)).toBeInTheDocument()
    expect(screen.getByText(/10 lệnh/)).toBeInTheDocument()
    // 5 dòng — nhiệm vụ «Xem lại danh mục» đã bị bỏ khỏi khối này.
    expect(screen.getByTestId("cap1-pa-task-5")).toBeInTheDocument()
    expect(screen.queryByTestId("cap1-pa-task-6")).not.toBeInTheDocument()
    expect(screen.queryByText(/Xem lại danh mục/)).not.toBeInTheDocument()
    expect(screen.getByText("3/5")).toBeInTheDocument()
  })

  // ★ Dòng tổng kết cuối Khối 4 (spec §7 "Còn 2 lý do · 1 lần xem lại · 3 lệnh
  // nữa…") không được đòi user cái "lần xem lại" mà hành trình không còn tính.
  it("★ the Khối 4 foot line no longer asks for «lần xem lại»", () => {
    // spec §7 nêu ví dụ "Còn 2 lý do · 1 lần xem lại · 3 lệnh nữa để lên Cấp 2."
    // — cùng dữ liệu đó, vế "1 lần xem lại" phải biến mất.
    render(
      <Cap1PortfolioAnalysis
        progress={progress({ so_ly_do_da_dung: 3, so_lenh_thuc_chien: 7 })}
        trades={[]}
      />,
    )
    const foot = screen.getByText(/^Còn .* để lên Cấp 2\.$/)
    expect(foot).toHaveTextContent("Còn 2 lý do · 3 lệnh nữa để lên Cấp 2.")
    expect(foot).not.toHaveTextContent(/xem lại/)
  })

  it("<5 lệnh: hides Khối 2 and shows the fallback note", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.queryByText("② Thắng / thua theo 5 lý do")).not.toBeInTheDocument()
    expect(screen.getByText(/Cần ≥5 lệnh/)).toBeInTheDocument()
  })

  // ★ MỘT ký hiệu tiền cho cả sản phẩm: mockup (và `cap0/DebriefModal`) dùng
  // `đ` dính liền số — không phải `₫` cách một dấu cách. Hai glyph tiền trong
  // cùng một sản phẩm đọc như hai đơn vị khác nhau.
  it("★ formats VND with the mockups' «đ», never « ₫»", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) =>
        trade({ orderId: `w${i}`, lyDo: "dong_tien", pnlVnd: 250_000 }),
      ),
      trade({ orderId: "l1", lyDo: "dong_tien", pnlVnd: -50_000 }),
    ]
    const { container } = render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.getByText("+950,000đ")).toBeInTheDocument()
    expect(container.textContent).not.toContain("₫")
  })

  it(">=5 lệnh: shows Khối 2 bảng thắng/thua", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    expect(screen.getByText("② Thắng / thua theo 5 lý do")).toBeInTheDocument()
    // Column headers stay spec §7's wording.
    expect(screen.getByText("Số lệnh")).toBeInTheDocument()
    expect(screen.getByText("Tỷ lệ thắng")).toBeInTheDocument()
  })

  it("renders Khối 3 độ phủ 5 lý do + chọn lý do có cơ sở", () => {
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[]} />)
    expect(screen.getByText("③ Độ phủ 5 lý do + Chọn lý do có cơ sở")).toBeInTheDocument()
    expect(screen.getByText(/Đã dùng 0\/5/)).toBeInTheDocument()
    expect(screen.getByText(/Lệnh có lý do ✅ Ủng hộ lúc đặt/)).toBeInTheDocument()
  })

  it("fires Mẫu 1 (Vũ khí riêng) — icon + bold lead + body, «good» variant", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) => trade({ orderId: `w${i}`, lyDo: "dong_tien", pnlVnd: 100 })),
      trade({ orderId: "l1", lyDo: "dong_tien", pnlVnd: -100 }),
    ]
    render(<Cap1PortfolioAnalysis progress={progress()} trades={trades} />)
    const mau = screen.getByTestId("cap1-mau-vu_khi_rieng")
    expect(within(mau).getByText("🎯")).toBeInTheDocument()
    expect(within(mau).getByText("Vũ khí riêng").tagName).toBe("B")
    expect(within(mau).getByText(/Bạn thắng nhiều nhất khi mua vì/)).toBeInTheDocument()
    expect(mau.className).toContain("border-up/25")
  })

  it("renders Mẫu 3 (Cơ sở đáng giá) with the «info» variant", () => {
    const ungHo = Array.from({ length: 4 }, (_, i) =>
      trade({ orderId: `u${i}`, trangThaiLucDat: "ung_ho", lyDo: "ky_thuat", pnlVnd: 100 }),
    )
    const others = Array.from({ length: 4 }, (_, i) =>
      trade({ orderId: `o${i}`, trangThaiLucDat: "trung_tinh", lyDo: "tin_tuc", pnlVnd: -100 }),
    )
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[...ungHo, ...others]} />)
    const mau = screen.getByTestId("cap1-mau-co_so_dang_gia")
    expect(within(mau).getByText("Cơ sở đáng giá").tagName).toBe("B")
    expect(mau.className).toContain("rgb(var(--primary-6))")
  })

  it("keeps the honest empty state when no mẫu fires", () => {
    render(<Cap1PortfolioAnalysis progress={progress()} trades={[]} />)
    expect(screen.getByText("🔍 Mẫu hệ thống phát hiện (về lý do)")).toBeInTheDocument()
    expect(screen.getByText(/lệnh nữa để hệ thống tìm mẫu riêng của bạn/)).toBeInTheDocument()
  })

  it("shows the graduation CTA once 5/5 nhiệm vụ are done", () => {
    const p = progress({
      task_1_done_at: "x",
      task_2_done_at: "x",
      task_3_done_at: "x",
      task_4_done_at: "x",
      task_5_done_at: "x",
    })
    render(<Cap1PortfolioAnalysis progress={p} trades={[]} />)
    expect(screen.getByText(/ĐỦ điều kiện lên Cấp 2/)).toBeInTheDocument()
  })

  it("degrades gracefully with null progress (not entered yet)", () => {
    expect(() => render(<Cap1PortfolioAnalysis progress={null} trades={[]} />)).not.toThrow()
  })
})

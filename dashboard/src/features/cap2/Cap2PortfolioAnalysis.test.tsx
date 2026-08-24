import { render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"
import { Cap2PortfolioAnalysis } from "./Cap2PortfolioAnalysis"
import type { Cap2TradeRecord } from "./portfolioAnalysisCap2"
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

function progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-03-01T00:00:00Z",
    task_1_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

function renderPa(p: Cap2Progress | null, trades: Cap2TradeRecord[] = []) {
  return render(<Cap2PortfolioAnalysis trades={trades} dailyScores={[]} progress={p} now={NOW} />)
}

// ── ① Hồ sơ tổng quan ───────────────────────────────────────────────────────

describe("Cap2PortfolioAnalysis — ① Hồ sơ tổng quan", () => {
  it("labels the block with 'Cấp 2 «Kỷ luật»' (not Cấp 1's label) + lệnh count + entered date", () => {
    renderPa(progress(), [trade({ orderId: "1" })])
    const khoi1 = screen.getByTestId("cap2-pa-khoi1")
    expect(within(khoi1).getByText(/Cấp 2 «Kỷ luật»/)).toBeInTheDocument()
    expect(within(khoi1).getByText(/1 lệnh/)).toBeInTheDocument()
  })

  it("shows the win-rate stat computed from trades", () => {
    const trades = [
      trade({ orderId: "1", pnlVnd: 100 }),
      trade({ orderId: "2", pnlVnd: 100 }),
      trade({ orderId: "3", pnlVnd: -100 }),
    ]
    renderPa(progress(), trades)
    expect(screen.getByTestId("cap2-pa-winrate")).toHaveTextContent("67%")
    expect(screen.getByTestId("cap2-pa-khoi1")).toHaveTextContent("2 lãi / 1 lỗ")
  })

  // ── ★★ Hai ô thống kê MỚI của Cấp 2 ★★ ────────────────────────────────────
  it("★ adds the «Đã đặt CL/CL» n/10 box and the «Thực hiện đúng» box", () => {
    renderPa(progress({ so_lenh_co_cl_tp: 10, so_lan_thuc_hien_dung: 2 }))
    const khoi1 = screen.getByTestId("cap2-pa-khoi1")
    expect(within(khoi1).getByText("Đã đặt CL/CL")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-slp-orders")).toHaveTextContent("10/10")
    expect(within(khoi1).getByText("Thực hiện đúng")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-exec-total")).toHaveTextContent("2")
    expect(within(khoi1).getByText("khi giá chạm mốc")).toBeInTheDocument()
  })

  /**
   * ★★ Ở trang của cấp CAO HƠN (`host`), `so_lan_thuc_hien_dung` vẫn là con số
   * cộng dồn TỪ CẤP 2 (server chỉ chặn cận dưới `closed_at >= cap2.entered_at`)
   * — trong khi tiêu đề ngay trên nó ghi nhãn + ngày của cấp đang xem. Không
   * nói rõ phạm vi thì user Cấp 3 chưa đóng lệnh nào đọc thành "đã làm đúng 7
   * lần trong Cấp 3".
   */
  it("★★ ở trang cấp cao hơn, ô «Thực hiện đúng» nói rõ là số CỘNG DỒN từ Cấp 2", () => {
    render(
      <Cap2PortfolioAnalysis
        trades={[]}
        dailyScores={[]}
        progress={progress({ so_lan_thuc_hien_dung: 7 })}
        now={NOW}
        host={{ levelLabel: "Cấp 3 «Bản lĩnh»", sinceIso: "2026-08-17T00:00:00Z" }}
      />,
    )
    expect(screen.getByTestId("cap2-pa-exec-total")).toHaveTextContent("7")
    expect(screen.getByTestId("cap2-pa-exec-total-scope")).toHaveTextContent(
      "cộng dồn từ Cấp 2",
    )
  })

  it("ở trang Phân tích của chính Cấp 2 thì KHÔNG có chú thích cộng dồn (thừa)", () => {
    renderPa(progress({ so_lan_thuc_hien_dung: 2 }))
    expect(screen.getByTestId("cap2-pa-exec-total-scope")).toHaveTextContent("khi giá chạm mốc")
    expect(screen.getByTestId("cap2-pa-exec-total-scope")).not.toHaveTextContent("cộng dồn")
  })

  it("★ ① carries NO discipline score and NO chuỗi — those left Cấp 2 for good", () => {
    renderPa(progress({ so_lenh_co_cl_tp: 10, so_lan_thuc_hien_dung: 2 }))
    const khoi1 = screen.getByTestId("cap2-pa-khoi1")
    expect(khoi1.textContent).not.toMatch(/[Đđ]iểm kỷ luật|[Cc]huỗi/)
  })

  it("shows an honest empty state instead of a fake 0% win rate", () => {
    renderPa(progress())
    expect(screen.getByTestId("cap2-pa-winrate")).toHaveTextContent("—")
    expect(screen.getByTestId("cap2-pa-khoi1")).toHaveTextContent("chưa có lệnh đã đóng")
  })
})

// ── ② Thắng / thua theo 5 lý do ─────────────────────────────────────────────

describe("Cap2PortfolioAnalysis — ② Thắng / thua theo 5 lý do", () => {
  it("<5 lệnh: hides the table with the fallback note", () => {
    renderPa(progress(), [trade({ orderId: "1" }), trade({ orderId: "2" })])
    expect(screen.queryByTestId("cap2-pa-khoi2")).not.toBeInTheDocument()
    expect(screen.getByText(/Cần ≥5 lệnh/)).toBeInTheDocument()
  })

  it(">=5 lệnh: shows the table, flagged «giữ từ Cấp 1» per the mockup", () => {
    renderPa(progress(), Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) })))
    const khoi2 = screen.getByTestId("cap2-pa-khoi2")
    expect(khoi2).toBeInTheDocument()
    expect(within(khoi2).getByText("(giữ từ Cấp 1)")).toBeInTheDocument()
  })

  /**
   * ★ MỘT ký hiệu tiền cho cả sản phẩm — bài canh này là bản sao của
   * `cap1/Cap1PortfolioAnalysis.test.tsx` ("formats VND with the mockups' «đ»,
   * never « ₫»"). Cấp 2 chép nhầm ` ₫` (glyph khác + dấu cách) vào cột Lãi/lỗ.
   */
  it("★ cột Lãi/lỗ dùng «đ» dính số, không bao giờ « ₫»", () => {
    const { container } = renderPa(
      progress(),
      Array.from({ length: 5 }, (_, i) =>
        trade({ orderId: String(i), lyDo: "dong_tien", pnlVnd: 250_000 }),
      ),
    )
    expect(within(screen.getByTestId("cap2-pa-khoi2")).getByText("+1,250,000đ")).toBeInTheDocument()
    expect(container.textContent).not.toContain("₫")
  })
})

// ── ③ Độ phủ 5 lý do ───────────────────────────────────────────────────────

describe("Cap2PortfolioAnalysis — ③ Độ phủ 5 lý do", () => {
  it("★ block ③ is the 5-lý-do coverage strip, NOT the old danh sách vi phạm", () => {
    renderPa(progress(), [
      trade({ orderId: "1", lyDo: "dong_tien" }),
      trade({ orderId: "2", lyDo: "ky_thuat" }),
    ])
    const khoi3 = screen.getByTestId("cap2-pa-khoi3")
    expect(within(khoi3).getByText("③ Độ phủ 5 lý do")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-coverage-count")).toHaveTextContent("2/5")
    // Dải 5 icon, những lý do chưa dùng bị mờ (mockup `opacity:.25`).
    expect(screen.getByTestId("cap2-pa-coverage-dong_tien").className).not.toContain(
      "cap2-pa-coverage-off",
    )
    expect(screen.getByTestId("cap2-pa-coverage-dinh_gia").className).toContain(
      "cap2-pa-coverage-off",
    )
    // ...và tuyệt đối không còn 4 loại vi phạm ở đây.
    expect(khoi3.textContent).not.toMatch(/Cắt lỗ chậm|Chốt lời hụt|Nhồi lệnh/)
  })
})

// ── ④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào ─────────────────────────

describe("Cap2PortfolioAnalysis — ④ cơ chế cắt lỗ / chốt lời (mới ở Cấp 2)", () => {
  it("★ renders the three exec boxes 🛑 / 🎯 / ✅ with the server counts", () => {
    renderPa(
      progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 2 }),
    )
    const khoi4 = screen.getByTestId("cap2-pa-khoi4")
    expect(
      within(khoi4).getByText("④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào"),
    ).toBeInTheDocument()
    expect(within(khoi4).getByText("mới ở Cấp 2")).toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-exec-catlo")).toHaveTextContent("1")
    expect(screen.getByTestId("cap2-pa-exec-chotloi")).toHaveTextContent("1")
    expect(screen.getByTestId("cap2-pa-exec-tong")).toHaveTextContent("2")
    expect(within(khoi4).getAllByText(/lần cắt lỗ/).length).toBeGreaterThan(0)
    expect(within(khoi4).getAllByText(/lần chốt lời/).length).toBeGreaterThan(0)
    expect(within(khoi4).getByText(/tổng lần/)).toBeInTheDocument()
  })

  it("★ shows the «cả hai cơ chế» pattern note once both mechanisms have fired", () => {
    renderPa(
      progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 2 }),
    )
    expect(screen.getByTestId("cap2-pa-pat-good")).toHaveTextContent(/Bạn đã làm quen cả hai cơ chế/)
    expect(screen.queryByTestId("cap2-pa-pat-empty")).not.toBeInTheDocument()
  })

  it("★ at 0/0 shows the honest empty note and NO congratulation", () => {
    renderPa(progress())
    expect(screen.queryByTestId("cap2-pa-pat-good")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap2-pa-pat-empty")).toHaveTextContent(
      /Chưa có lần nào giá chạm mốc/,
    )
  })

  it("★ the «Cấp 2 chỉ giúp làm quen cơ chế» note is always visible", () => {
    renderPa(progress())
    expect(screen.getByTestId("cap2-pa-pat-info")).toHaveTextContent(
      /Rèn kỷ luật sâu hơn — bám kế hoạch qua thời gian — sẽ đến ở các cấp sau/,
    )
    // "làm quen cơ chế" là phần in đậm của mockup.
    expect(
      within(screen.getByTestId("cap2-pa-pat-info")).getByText("làm quen cơ chế").tagName,
    ).toBe("STRONG")
  })

  it("renders without a progress row at all (degrades to zeros, never crashes)", () => {
    renderPa(null)
    expect(screen.getByTestId("cap2-pa-exec-tong")).toHaveTextContent("0")
    expect(screen.getByTestId("cap2-pa-slp-orders")).toHaveTextContent("0/10")
  })
})

// ── ★★ Các khối của mô hình 5 nhiệm vụ đã BIẾN MẤT ★★ ──────────────────────

describe("Cap2PortfolioAnalysis — khối của mô hình cũ", () => {
  it("★ renders EXACTLY the mockup's 4 khối — no khối 5/6/7, no mẫu tự phát hiện", () => {
    renderPa(
      progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 2 }),
      Array.from({ length: 6 }, (_, i) => trade({ orderId: String(i), chamSlKhongCat: i % 2 === 0 })),
    )
    for (const id of ["cap2-pa-khoi1", "cap2-pa-khoi2", "cap2-pa-khoi3", "cap2-pa-khoi4"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    for (const id of ["cap2-pa-khoi5", "cap2-pa-khoi6", "cap2-pa-khoi7", "cap2-pa-mau"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    }
  })

  it("★ never shows điểm kỷ luật, cửa sổ 20 lệnh, or vi-phạm wording anywhere", () => {
    const { container } = renderPa(
      progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1 }),
      Array.from({ length: 6 }, (_, i) => trade({ orderId: String(i), nhoiLenhKhiLo: true })),
    )
    expect(container.textContent).not.toMatch(
      /ĐIỂM KỶ LUẬT|CỬA SỔ 20 LỆNH|DANH SÁCH VI PHẠM|REFLECTION|MẪU TỰ PHÁT HIỆN/i,
    )
  })
})

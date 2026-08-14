import { describe, expect, it } from "vitest"
import {
  computeCap2PortfolioAnalysis,
  computeSlTpUsageCap2,
  SL_TP_ORDERS_TARGET,
  type Cap2TradeRecord,
} from "./portfolioAnalysisCap2"
import type { Cap2Progress } from "./types"

// ── fixtures ────────────────────────────────────────────────────────────────

/** Reference "now" — giữ lại để chứng minh không khối nào còn phụ thuộc ngày. */
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
    entered_at: "2026-01-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

// ── ①②③ — uỷ quyền xuống Cấp 1 ─────────────────────────────────────────────

describe("computeCap2PortfolioAnalysis — khối ①②③ uỷ quyền Cấp 1", () => {
  it("computes ① hồ sơ tổng quan from trades (same shape as Cấp 1)", () => {
    const trades = [
      trade({ orderId: "1", pnlVnd: 100 }),
      trade({ orderId: "2", pnlVnd: 100 }),
      trade({ orderId: "3", pnlVnd: -100 }),
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.khoi1.totalTrades).toBe(3)
    expect(result.khoi1.wins).toBe(2)
    expect(result.khoi1.losses).toBe(1)
  })

  it("hides ② with <5 trades, same threshold as Cấp 1", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.hideKhoi2).toBe(true)
    expect(result.khoi2HiddenNote).toContain("Cần ≥5 lệnh")
  })

  it("shows ② bảng thắng/thua with >=5 trades", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.hideKhoi2).toBe(false)
    expect(result.khoi2).toHaveLength(5)
  })

  it("★ ③ độ phủ 5 lý do comes back from Cấp 1's own compute", () => {
    const trades = [
      trade({ orderId: "1", lyDo: "dong_tien" }),
      trade({ orderId: "2", lyDo: "ky_thuat" }),
      trade({ orderId: "3", lyDo: "tin_tuc" }),
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.khoi3.usedCount).toBe(3)
    expect(result.khoi3.coverage.dong_tien).toBe(true)
    expect(result.khoi3.coverage.dinh_gia).toBe(false)
  })
})

// ── ★★ Các khối của mô hình 5 nhiệm vụ đã BỎ HẲN ★★ ────────────────────────

describe("computeCap2PortfolioAnalysis — khối của mô hình cũ đã bỏ", () => {
  it("★ returns EXACTLY the 4 khối the mockup draws — nothing from the vi-phạm era", () => {
    const result = computeCap2PortfolioAnalysis([trade()], [], progress(), NOW)
    expect(Object.keys(result).sort()).toEqual(
      ["hideKhoi2", "khoi1", "khoi2", "khoi2HiddenNote", "khoi3", "khoi4"].sort(),
    )
    const stale = result as unknown as Record<string, unknown>
    // Điểm kỷ luật 30 ngày · vi phạm theo tuần · phát hiện từ ghi chú · mẫu 9-12.
    expect(stale.khoi5).toBeUndefined()
    expect(stale.khoi6).toBeUndefined()
    expect(stale.khoi7).toBeUndefined()
    expect(stale.mauPhatHien).toBeUndefined()
  })

  it("★ ③ is the 5-lý-do coverage now, NOT the old danh sách vi phạm", () => {
    const trades = [trade({ orderId: "1", chamSlKhongCat: true, nhoiLenhKhiLo: true })]
    const result = computeCap2PortfolioAnalysis(trades, [], progress(), NOW)
    expect(result.khoi3).toHaveProperty("coverage")
    expect(result.khoi3).not.toHaveProperty("rows")
    expect(result.khoi3).not.toHaveProperty("totalViPham")
  })
})

// ── ④ — «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào» ──────────────────────

describe("computeSlTpUsageCap2 — khối ④", () => {
  it("reads the 🛑/🎯/✅ counts straight off the server progress row", () => {
    const usage = computeSlTpUsageCap2(
      progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 2 }),
    )
    expect(usage.catLoDung).toBe(1)
    expect(usage.chotLoiDung).toBe(1)
    expect(usage.tongDung).toBe(2)
  })

  it("★ «Đã đặt CL/CL» is capped at the 10-lệnh target (server keeps counting past it)", () => {
    expect(computeSlTpUsageCap2(progress({ so_lenh_co_cl_tp: 6 })).soLenhCoSlTp).toBe(6)
    expect(computeSlTpUsageCap2(progress({ so_lenh_co_cl_tp: 47 })).soLenhCoSlTp).toBe(
      SL_TP_ORDERS_TARGET,
    )
  })

  it("★ praises BOTH mechanisms only when both were actually used, with the real counts", () => {
    const usage = computeSlTpUsageCap2(
      progress({ so_lan_cat_lo_dung: 3, so_lan_chot_loi_dung: 2, so_lan_thuc_hien_dung: 5 }),
    )
    expect(usage.patternNote).toContain("cả hai cơ chế")
    expect(usage.patternNote).toContain("3 lần cắt lỗ")
    expect(usage.patternNote).toContain("2 lần chốt lời")
    expect(usage.emptyNote).toBeNull()
  })

  it("★ does NOT claim both mechanisms when only cắt lỗ has fired", () => {
    const usage = computeSlTpUsageCap2(
      progress({ so_lan_cat_lo_dung: 2, so_lan_chot_loi_dung: 0, so_lan_thuc_hien_dung: 2 }),
    )
    expect(usage.patternNote).not.toContain("cả hai cơ chế")
    expect(usage.patternNote).toContain("chưa lần nào giá chạm chốt lời")
    expect(usage.emptyNote).toBeNull()
  })

  it("★ does NOT claim both mechanisms when only chốt lời has fired", () => {
    const usage = computeSlTpUsageCap2(
      progress({ so_lan_cat_lo_dung: 0, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 1 }),
    )
    expect(usage.patternNote).not.toContain("cả hai cơ chế")
    expect(usage.patternNote).toContain("chưa lần nào giá chạm cắt lỗ")
  })

  it("★ says nothing flattering at 0/0 — an honest empty state instead of a made-up pattern", () => {
    const usage = computeSlTpUsageCap2(progress())
    expect(usage.patternNote).toBeNull()
    expect(usage.emptyNote).toContain("Chưa có lần nào giá chạm mốc")
    // ...và không đổ lỗi cho user: con số này do thị trường quyết định.
    expect(usage.emptyNote).toContain("không phải việc bạn cố làm cho có")
  })

  it("★ degrades to zeros (never crashes) when there is no progress row yet", () => {
    const usage = computeSlTpUsageCap2(null)
    expect(usage.catLoDung).toBe(0)
    expect(usage.chotLoiDung).toBe(0)
    expect(usage.tongDung).toBe(0)
    expect(usage.soLenhCoSlTp).toBe(0)
    expect(usage.emptyNote).not.toBeNull()
  })

  it("★ the «Cấp 2 chỉ giúp làm quen cơ chế» note is ALWAYS present — including at 0/0", () => {
    for (const p of [null, progress(), progress({ so_lan_cat_lo_dung: 5 })]) {
      expect(computeSlTpUsageCap2(p).scopeNote).toContain("làm quen cơ chế")
      expect(computeSlTpUsageCap2(p).scopeNote).toContain("các cấp sau")
    }
  })

  it("computeCap2PortfolioAnalysis wires khối ④ from the same compute", () => {
    const result = computeCap2PortfolioAnalysis(
      [],
      [],
      progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 2 }),
      NOW,
    )
    expect(result.khoi4).toEqual(
      computeSlTpUsageCap2(
        progress({ so_lan_cat_lo_dung: 1, so_lan_chot_loi_dung: 1, so_lan_thuc_hien_dung: 2 }),
      ),
    )
  })
})

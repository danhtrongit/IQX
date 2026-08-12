import { describe, expect, it } from "vitest"
import { computeCap1PortfolioAnalysis } from "./portfolioAnalysis"
import type { Cap1Progress } from "./types"
import type { Cap1TradeRecord } from "./tradeLog"

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

function progress(overrides: Partial<Cap1Progress> = {}): Cap1Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-01-01T00:00:00Z",
    da_xem_tour: true,
    task_1_done_at: "2026-01-01T00:00:00Z",
    task_2_done_at: "2026-01-01T00:00:00Z",
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    so_ly_do_da_dung: 2,
    so_lenh_ly_do_ung_ho: 1,
    so_lenh_thuc_chien: 2,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

describe("computeCap1PortfolioAnalysis — threshold (spec §7 '<5 lệnh')", () => {
  it("hides Khối 2 with <5 trades", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    expect(result.hideKhoi2).toBe(true)
    expect(result.khoi2HiddenNote).toContain("Cần ≥5 lệnh")
    expect(result.khoi2HiddenNote).toContain("2")
  })

  it("shows Khối 2 with >=5 trades", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    const result = computeCap1PortfolioAnalysis(trades, progress())
    expect(result.hideKhoi2).toBe(false)
    expect(result.khoi2HiddenNote).toBeNull()
  })
})

describe("computeCap1PortfolioAnalysis — Khối 1 hồ sơ tổng quan", () => {
  it("computes total/winRate/wins-losses/preferred lý do", () => {
    const trades = [
      trade({ orderId: "1", lyDo: "dong_tien", pnlVnd: 100 }),
      trade({ orderId: "2", lyDo: "dong_tien", pnlVnd: 100 }),
      trade({ orderId: "3", lyDo: "dong_tien", pnlVnd: -100 }),
      trade({ orderId: "4", lyDo: "ky_thuat", pnlVnd: 100 }),
      trade({ orderId: "5", lyDo: "noi_bo", pnlVnd: -100 }),
    ]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    expect(result.khoi1.totalTrades).toBe(5)
    expect(result.khoi1.wins).toBe(3)
    expect(result.khoi1.losses).toBe(2)
    expect(result.khoi1.winRate).toBe(60)
    expect(result.khoi1.preferredLyDo).toBe("dong_tien")
    expect(result.khoi1.preferredLyDoCount).toBe(3)
  })

  it("returns nulls/zeros gracefully with no trades", () => {
    const result = computeCap1PortfolioAnalysis([], progress())
    expect(result.khoi1.totalTrades).toBe(0)
    expect(result.khoi1.winRate).toBeNull()
    expect(result.khoi1.preferredLyDo).toBeNull()
  })
})

describe("computeCap1PortfolioAnalysis — Khối 2 bảng thắng/thua theo 5 lý do", () => {
  it("labels ✅ for >=65% win rate with >=5 trades, sorted by total pnl desc", () => {
    const winners = Array.from({ length: 4 }, (_, i) =>
      trade({ orderId: `w${i}`, lyDo: "dong_tien", pnlVnd: 1000 }),
    )
    const oneLoss = trade({ orderId: "l1", lyDo: "dong_tien", pnlVnd: -100 })
    const other = trade({ orderId: "o1", lyDo: "ky_thuat", pnlVnd: 5000 })
    const result = computeCap1PortfolioAnalysis([...winners, oneLoss, other], progress())
    const row = result.khoi2.find((r) => r.lyDo === "dong_tien")!
    expect(row.count).toBe(5)
    expect(row.winRate).toBe(80)
    expect(row.badge).toBe("✅")
    // sorted by total pnl desc: dong_tien totalPnlVnd = 4*1000-100=3900, ky_thuat=5000
    expect(result.khoi2[0].lyDo).toBe("ky_thuat")
    expect(result.khoi2[1].lyDo).toBe("dong_tien")
  })

  it("labels ❌ for <=35% win rate with >=3 trades", () => {
    const losers = Array.from({ length: 3 }, (_, i) => trade({ orderId: `l${i}`, lyDo: "tin_tuc", pnlVnd: -100 }))
    const result = computeCap1PortfolioAnalysis(
      [...losers, trade({ orderId: "pad1" }), trade({ orderId: "pad2" })],
      progress(),
    )
    const row = result.khoi2.find((r) => r.lyDo === "tin_tuc")!
    expect(row.winRate).toBe(0)
    expect(row.badge).toBe("❌")
  })

  it("labels ⚠ for 35-50% win rate with >=5 trades", () => {
    const trades = [
      trade({ orderId: "1", lyDo: "dinh_gia", pnlVnd: 100 }),
      trade({ orderId: "2", lyDo: "dinh_gia", pnlVnd: 100 }),
      trade({ orderId: "3", lyDo: "dinh_gia", pnlVnd: -100 }),
      trade({ orderId: "4", lyDo: "dinh_gia", pnlVnd: -100 }),
      trade({ orderId: "5", lyDo: "dinh_gia", pnlVnd: -100 }),
    ]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    const row = result.khoi2.find((r) => r.lyDo === "dinh_gia")!
    expect(row.winRate).toBe(40)
    expect(row.badge).toBe("⚠")
  })

  it("does not label rows with <3 trades", () => {
    const trades = [
      trade({ orderId: "1", lyDo: "noi_bo", pnlVnd: 100 }),
      trade({ orderId: "2", lyDo: "noi_bo", pnlVnd: 100 }),
      ...Array.from({ length: 3 }, (_, i) => trade({ orderId: `p${i}`, lyDo: "dong_tien" })),
    ]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    const row = result.khoi2.find((r) => r.lyDo === "noi_bo")!
    expect(row.count).toBe(2)
    expect(row.badge).toBeNull()
  })

  it("always includes all 5 lý do rows even with zero trades for some", () => {
    const result = computeCap1PortfolioAnalysis(
      Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i), lyDo: "ky_thuat" })),
      progress(),
    )
    expect(result.khoi2).toHaveLength(5)
  })
})

describe("computeCap1PortfolioAnalysis — Khối 3 độ phủ + lý do có cơ sở", () => {
  it("marks coverage true only for lý do actually used", () => {
    const trades = [trade({ orderId: "1", lyDo: "dong_tien" }), trade({ orderId: "2", lyDo: "tin_tuc" })]
    const result = computeCap1PortfolioAnalysis(trades, progress({ so_ly_do_da_dung: 2 }))
    expect(result.khoi3.coverage.dong_tien).toBe(true)
    expect(result.khoi3.coverage.tin_tuc).toBe(true)
    expect(result.khoi3.coverage.ky_thuat).toBe(false)
    expect(result.khoi3.coverage.noi_bo).toBe(false)
    expect(result.khoi3.coverage.dinh_gia).toBe(false)
    expect(result.khoi3.usedCount).toBe(2)
  })

  it("reads ungHoCount/task4Done from progress (server-authoritative, no client gap)", () => {
    const result = computeCap1PortfolioAnalysis(
      [],
      progress({ so_lenh_ly_do_ung_ho: 3, task_4_done_at: "2026-07-01T00:00:00Z" }),
    )
    expect(result.khoi3.ungHoCount).toBe(3)
    expect(result.khoi3.task4Done).toBe(true)
  })
})

describe("computeCap1PortfolioAnalysis — Khối 4 tiến trình 5 nhiệm vụ", () => {
  it("counts tasks done from progress and flags ready-to-graduate at 5/5", () => {
    const result = computeCap1PortfolioAnalysis([], progress())
    expect(result.khoi4.tasksDone).toBe(2)
    expect(result.khoi4.readyToGraduate).toBe(false)
    expect(result.khoi4.tasks).toHaveLength(5)
    expect(result.khoi4.tasks[0]).toMatchObject({ no: 1, done: true })
    expect(result.khoi4.tasks[2]).toMatchObject({ no: 3, done: false })
    // ★ ⑤ là «10 lệnh Thực chiến» (nhiệm vụ ⑥ cũ) — «Xem lại danh mục» đã bị bỏ.
    expect(result.khoi4.tasks[4]).toMatchObject({ no: 5, label: "10 lệnh", progressText: "2/10" })
    expect(result.khoi4.tasks.map((t) => t.label)).not.toContain("Xem lại danh mục")
  })

  it("ready to graduate once 5/5 tasks are done", () => {
    const p = progress({
      task_1_done_at: "x",
      task_2_done_at: "x",
      task_3_done_at: "x",
      task_4_done_at: "x",
      task_5_done_at: "x",
    })
    const result = computeCap1PortfolioAnalysis([], p)
    expect(result.khoi4.tasksDone).toBe(5)
    expect(result.khoi4.readyToGraduate).toBe(true)
  })
})

describe("computeCap1PortfolioAnalysis — null progress (not entered / not loaded)", () => {
  it("degrades to a fully-empty, non-throwing result", () => {
    expect(() => computeCap1PortfolioAnalysis([], null)).not.toThrow()
    const result = computeCap1PortfolioAnalysis([], null)
    expect(result.khoi4.tasksDone).toBe(0)
    expect(result.khoi3.ungHoCount).toBe(0)
  })
})

// ── 3 mẫu tự phát hiện (spec §7) ─────────────────────────────────────────────
describe("computeCap1PortfolioAnalysis — mẫu 1 Vũ khí riêng", () => {
  it("fires when a lý do has >=5 trades and >=65% win rate", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) => trade({ orderId: `w${i}`, lyDo: "dong_tien", pnlVnd: 100 })),
      trade({ orderId: "l1", lyDo: "dong_tien", pnlVnd: -100 }),
    ]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    const mau = result.mauPhatHien.find((m) => m.id === "vu_khi_rieng")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("💰 Dòng tiền")
    expect(mau!.text).toContain("4/5")
  })

  it("does not fire below the 65% win-rate threshold", () => {
    const trades = [
      ...Array.from({ length: 3 }, (_, i) => trade({ orderId: `w${i}`, lyDo: "dong_tien", pnlVnd: 100 })),
      ...Array.from({ length: 2 }, (_, i) => trade({ orderId: `l${i}`, lyDo: "dong_tien", pnlVnd: -100 })),
    ]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    expect(result.mauPhatHien.find((m) => m.id === "vu_khi_rieng")).toBeUndefined()
  })
})

describe("computeCap1PortfolioAnalysis — mẫu 2 Điểm mù", () => {
  it("fires when a lý do has >=3 trades and <=35% win rate", () => {
    const trades = [
      trade({ orderId: "1", lyDo: "tin_tuc", pnlVnd: -100 }),
      trade({ orderId: "2", lyDo: "tin_tuc", pnlVnd: -100 }),
      trade({ orderId: "3", lyDo: "tin_tuc", pnlVnd: -100 }),
    ]
    const result = computeCap1PortfolioAnalysis(trades, progress())
    const mau = result.mauPhatHien.find((m) => m.id === "diem_mu")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("📰 Tin tức")
    expect(mau!.text).toContain("3/3")
  })
})

describe("computeCap1PortfolioAnalysis — mẫu 3 Cơ sở đáng giá", () => {
  it("fires when ✅ trades win >=15pp more than non-✅ trades (each group >=3)", () => {
    const ungHo = [
      trade({ orderId: "u1", lyDo: "ky_thuat", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
      trade({ orderId: "u2", lyDo: "ky_thuat", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
      trade({ orderId: "u3", lyDo: "ky_thuat", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
    ]
    const others = [
      trade({ orderId: "o1", lyDo: "ky_thuat", trangThaiLucDat: "trung_tinh", pnlVnd: -100 }),
      trade({ orderId: "o2", lyDo: "ky_thuat", trangThaiLucDat: "can_chu_y", pnlVnd: -100 }),
      trade({ orderId: "o3", lyDo: "ky_thuat", trangThaiLucDat: "nguoc_chieu", pnlVnd: -100 }),
    ]
    const result = computeCap1PortfolioAnalysis([...ungHo, ...others], progress())
    const mau = result.mauPhatHien.find((m) => m.id === "co_so_dang_gia")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("100%")
    expect(mau!.text).toContain("0%")
  })

  it("does not fire below 3 trades per group", () => {
    const ungHo = [
      trade({ orderId: "u1", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
      trade({ orderId: "u2", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
    ]
    const others = [
      trade({ orderId: "o1", trangThaiLucDat: "trung_tinh", pnlVnd: -100 }),
      trade({ orderId: "o2", trangThaiLucDat: "trung_tinh", pnlVnd: -100 }),
    ]
    const result = computeCap1PortfolioAnalysis([...ungHo, ...others], progress())
    expect(result.mauPhatHien.find((m) => m.id === "co_so_dang_gia")).toBeUndefined()
  })
})

describe("computeCap1PortfolioAnalysis — mẫu tối đa 2 hiện cùng lúc + fallback note", () => {
  it("caps mauPhatHien at 2 even when all 3 conditions match", () => {
    const strong = Array.from({ length: 4 }, (_, i) =>
      trade({ orderId: `s${i}`, lyDo: "dong_tien", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
    )
    const weak = Array.from({ length: 3 }, (_, i) =>
      trade({ orderId: `w${i}`, lyDo: "tin_tuc", trangThaiLucDat: "trung_tinh", pnlVnd: -100 }),
    )
    const result = computeCap1PortfolioAnalysis([...strong, ...weak], progress())
    expect(result.mauPhatHien.length).toBeLessThanOrEqual(2)
  })

  it("shows an insufficient-data note when no mẫu fires", () => {
    const result = computeCap1PortfolioAnalysis(
      [trade({ orderId: "1" }), trade({ orderId: "2" })],
      progress(),
    )
    expect(result.mauPhatHien).toHaveLength(0)
    expect(result.mauInsufficientNote).not.toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import {
  computeCap2PortfolioAnalysis,
  computeKhoi5Cap2,
  computeKhoi6Cap2,
  computeKhoi7Cap2,
  type Cap2DailyScoreRecord,
  type Cap2TradeRecord,
} from "./portfolioAnalysisCap2"
import type { Cap2Progress } from "./types"

// ── fixtures ────────────────────────────────────────────────────────────────

/** Reference "now" for every date-relative test (Wed 2026-07-29). */
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
    entered_at: "2026-01-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    task_4_done_at: null,
    task_5_done_at: null,
    chuoi_current: 0,
    chuoi_record: 0,
    last_chuoi_reset_at: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

// ── Cấp 1's blocks still present (delegation) ────────────────────────────────

describe("computeCap2PortfolioAnalysis — Cấp 1's Khối 1/2 still present via delegation", () => {
  it("computes Khối 1 hồ sơ tổng quan from trades (same shape as Cấp 1)", () => {
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

  it("hides Khối 2 with <5 trades, same threshold as Cấp 1", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.hideKhoi2).toBe(true)
    expect(result.khoi2HiddenNote).toContain("Cần ≥5 lệnh")
  })

  it("shows Khối 2 bảng thắng/thua with >=5 trades", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.hideKhoi2).toBe(false)
    expect(result.khoi2).toHaveLength(5)
  })
})

// ── Khối 3 — vi phạm theo 4 loại (Cấp 2 adjustment) ──────────────────────────

describe("computeCap2PortfolioAnalysis — Khối 3 vi phạm theo 4 loại (30 ngày)", () => {
  it("counts each of the 4 loại vi phạm within the last 30 days", () => {
    const trades = [
      trade({ orderId: "1", closedAt: "2026-07-20T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "2", closedAt: "2026-07-21T10:00:00Z", chamTpGiuLamHut: true }),
      trade({ orderId: "3", closedAt: "2026-07-22T10:00:00Z", banSomKhiLoNhe: true }),
      trade({ orderId: "4", closedAt: "2026-07-23T10:00:00Z", nhoiLenhKhiLo: true }),
      trade({ orderId: "5", closedAt: "2026-07-24T10:00:00Z" }), // clean
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.khoi3.totalTrades).toBe(5)
    expect(result.khoi3.totalViPham).toBe(4)
    const byLoai = Object.fromEntries(result.khoi3.rows.map((r) => [r.loai, r.count]))
    expect(byLoai.cat_lo_cham).toBe(1)
    expect(byLoai.chot_loi_hut).toBe(1)
    expect(byLoai.ban_som_khi_lo).toBe(1)
    expect(byLoai.nhoi_lenh).toBe(1)
  })

  it("excludes trades older than 30 days", () => {
    const trades = [trade({ orderId: "old", closedAt: "2026-05-01T00:00:00Z", chamSlKhongCat: true })]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.khoi3.totalTrades).toBe(0)
    expect(result.khoi3.totalViPham).toBe(0)
  })

  it("gives an honest note when no trades exist in the 30-day window", () => {
    const result = computeCap2PortfolioAnalysis([], [], null, NOW)
    expect(result.khoi3.note).toContain("Chưa có lệnh")
  })
})

// ── Khối 4 — cửa sổ 20 lệnh (Cấp 2 adjustment) ───────────────────────────────

describe("computeCap2PortfolioAnalysis — Khối 4 cửa sổ 20 lệnh", () => {
  it("reports an honest not-yet-full-window note under 20 trades", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: String(i) }))
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.khoi4.hasFullWindow).toBe(false)
    expect(result.khoi4.note).toContain("Cần đủ 20 lệnh")
    expect(result.khoi4.note).toContain("5/20")
  })

  it("computes violationsInWindow over only the last 20 trades once full", () => {
    // 22 trades: the 2 oldest have violations that must NOT count.
    const old1 = trade({ orderId: "old1", closedAt: "2026-01-01T00:00:00Z", chamSlKhongCat: true })
    const old2 = trade({ orderId: "old2", closedAt: "2026-01-02T00:00:00Z", nhoiLenhKhiLo: true })
    const recent = Array.from({ length: 20 }, (_, i) =>
      trade({
        orderId: `r${i}`,
        closedAt: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        chamSlKhongCat: i < 2, // exactly 2 violations inside the window
      }),
    )
    const trades = [old1, old2, ...recent]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.khoi4.hasFullWindow).toBe(true)
    expect(result.khoi4.windowSize).toBe(20)
    expect(result.khoi4.violationsInWindow).toBe(2)
  })

  it("readyToGraduate reflects the server's task_5_done_at (authoritative), not the client log", () => {
    const trades = [trade({ orderId: "1" })] // far fewer than 20 in the client log
    const result = computeCap2PortfolioAnalysis(trades, [], progress({ task_5_done_at: "2026-07-01T00:00:00Z" }), NOW)
    expect(result.khoi4.readyToGraduate).toBe(true)
    expect(result.khoi4.note).toContain("Đủ điều kiện lên Cấp 3")
  })

  it("readyToGraduate is false when task_5 isn't done yet", () => {
    const result = computeCap2PortfolioAnalysis([], [], progress(), NOW)
    expect(result.khoi4.readyToGraduate).toBe(false)
  })
})

// ── Khối 5 — điểm kỷ luật 30 ngày ─────────────────────────────────────────────

describe("computeKhoi5Cap2 — điểm kỷ luật 30 ngày", () => {
  it("computes avg7/avg30 from a 10-day fixture (ascending 71..80)", () => {
    const series = Array.from({ length: 10 }, (_, i) =>
      dailyScore({ ngay: `2026-07-${String(i + 1).padStart(2, "0")}`, diem: 71 + i, xepLoai: "vang" }),
    )
    const result = computeKhoi5Cap2(series)
    // last 7 = days 4..10 = 74..80 -> exact average 77
    expect(result.avg7).toBe(77)
    // all 10 = 71..80 -> average 75.5 -> rounds to 76
    expect(result.avg30).toBe(76)
  })

  it("computes the Xanh/Vàng/Đỏ distribution over the series", () => {
    const series = [
      ...Array.from({ length: 5 }, (_, i) => dailyScore({ ngay: `2026-07-${10 + i}`, xepLoai: "xanh" })),
      ...Array.from({ length: 3 }, (_, i) => dailyScore({ ngay: `2026-07-${20 + i}`, xepLoai: "vang" })),
      ...Array.from({ length: 2 }, (_, i) => dailyScore({ ngay: `2026-07-${25 + i}`, xepLoai: "do" })),
    ]
    const result = computeKhoi5Cap2(series)
    expect(result.distribution).toEqual({ xanh: 5, vang: 3, do: 2 })
  })

  it("keeps only the most recent 30 entries (caps series at 30)", () => {
    const series = Array.from({ length: 35 }, (_, i) =>
      dailyScore({ ngay: `day-${String(i + 1).padStart(2, "0")}`, diem: 80 }),
    )
    const result = computeKhoi5Cap2(series)
    expect(result.series).toHaveLength(30)
    expect(result.series[0].ngay).toBe("day-06")
  })

  it("gives an honest insufficient-data note with 0 days of history", () => {
    const result = computeKhoi5Cap2([])
    expect(result.avg7).toBeNull()
    expect(result.avg30).toBeNull()
    expect(result.insufficientNote).not.toBeNull()
  })

  it("gives an honest insufficient-data note with <7 days of history", () => {
    const series = Array.from({ length: 3 }, (_, i) => dailyScore({ ngay: `2026-07-0${i + 1}` }))
    const result = computeKhoi5Cap2(series)
    expect(result.insufficientNote).toContain("3 ngày")
  })

  it("has no insufficient-data note once >=7 days exist", () => {
    const series = Array.from({ length: 7 }, (_, i) => dailyScore({ ngay: `2026-07-0${i + 1}` }))
    const result = computeKhoi5Cap2(series)
    expect(result.insufficientNote).toBeNull()
  })
})

// ── Khối 6 — phân loại vi phạm theo tuần ──────────────────────────────────────

describe("computeKhoi6Cap2 — phân loại vi phạm theo tuần (4 tuần x 4 loại)", () => {
  it("groups vi phạm into 4 weekly buckets by loại, oldest to newest", () => {
    const trades = [
      trade({ orderId: "w0a", closedAt: "2026-07-02T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "w0b", closedAt: "2026-07-03T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "w1", closedAt: "2026-07-13T10:00:00Z", nhoiLenhKhiLo: true }),
      trade({ orderId: "w2", closedAt: "2026-07-17T10:00:00Z", banSomKhiLoNhe: true }),
      trade({ orderId: "w3", closedAt: "2026-07-24T10:00:00Z" }), // clean
    ]
    const result = computeKhoi6Cap2(trades, NOW)
    expect(result.weeks).toHaveLength(4)
    expect(result.weeks[0].counts.cat_lo_cham).toBe(2)
    expect(result.weeks[0].total).toBe(2)
    expect(result.weeks[1].counts.nhoi_lenh).toBe(1)
    expect(result.weeks[2].counts.ban_som_khi_lo).toBe(1)
    expect(result.weeks[3].total).toBe(0)
  })

  it("flags 'cải thiện' when the 2 most recent weeks have fewer vi phạm than the 2 oldest", () => {
    const trades = [
      trade({ orderId: "w0a", closedAt: "2026-07-02T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "w0b", closedAt: "2026-07-03T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "w1", closedAt: "2026-07-13T10:00:00Z", nhoiLenhKhiLo: true }),
      trade({ orderId: "w2", closedAt: "2026-07-17T10:00:00Z", banSomKhiLoNhe: true }),
      trade({ orderId: "w3", closedAt: "2026-07-24T10:00:00Z" }),
    ]
    const result = computeKhoi6Cap2(trades, NOW)
    expect(result.trend).toBe("cai_thien")
  })

  it("flags 'xấu đi' when the 2 most recent weeks have more vi phạm than the 2 oldest", () => {
    const trades = [
      trade({ orderId: "w0", closedAt: "2026-07-02T10:00:00Z" }),
      trade({ orderId: "w1", closedAt: "2026-07-13T10:00:00Z" }),
      trade({ orderId: "w2a", closedAt: "2026-07-17T10:00:00Z", chamTpGiuLamHut: true }),
      trade({ orderId: "w2b", closedAt: "2026-07-20T10:00:00Z", chamTpGiuLamHut: true }),
      trade({ orderId: "w3a", closedAt: "2026-07-23T10:00:00Z", nhoiLenhKhiLo: true }),
      trade({ orderId: "w3b", closedAt: "2026-07-24T10:00:00Z", nhoiLenhKhiLo: true }),
      trade({ orderId: "w3c", closedAt: "2026-07-26T10:00:00Z", nhoiLenhKhiLo: true }),
    ]
    const result = computeKhoi6Cap2(trades, NOW)
    expect(result.trend).toBe("xau_di")
  })

  it("flags 'ổn định' when there are enough trades but zero vi phạm anywhere", () => {
    const trades = [
      trade({ orderId: "w0", closedAt: "2026-07-02T10:00:00Z" }),
      trade({ orderId: "w1", closedAt: "2026-07-13T10:00:00Z" }),
      trade({ orderId: "w2", closedAt: "2026-07-17T10:00:00Z" }),
      trade({ orderId: "w3", closedAt: "2026-07-24T10:00:00Z" }),
    ]
    const result = computeKhoi6Cap2(trades, NOW)
    expect(result.trend).toBe("on_dinh")
    expect(result.trendNote).toContain("Không có vi phạm")
  })

  it("flags 'không đủ dữ liệu' with too few trades in the 4-week window to call a trend", () => {
    const trades = [
      trade({ orderId: "w2", closedAt: "2026-07-17T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "w3", closedAt: "2026-07-24T10:00:00Z" }),
    ]
    const result = computeKhoi6Cap2(trades, NOW)
    expect(result.trend).toBe("khong_du_du_lieu")
    expect(result.trendNote).toContain("Cần thêm dữ liệu")
  })
})

// ── Khối 7 — phát hiện từ ghi chú ─────────────────────────────────────────────

describe("computeKhoi7Cap2 — phát hiện từ ghi chú (cần ≥3 ghi chú nhìn lại)", () => {
  it("gives an honest insufficient-data note with <3 ghi chú", () => {
    const trades = [
      trade({ orderId: "1", chamSlKhongCat: true, ghiChuNhinLai: "sợ mất lãi nên bán" }),
      trade({ orderId: "2", chamSlKhongCat: true, ghiChuNhinLai: "cứ tiếc nên giữ lại" }),
    ]
    const result = computeKhoi7Cap2(trades, NOW)
    expect(result.insights).toHaveLength(0)
    expect(result.insufficientNote).toContain("2")
  })

  it("detects the loss_aversion pattern once >=3 matching ghi chú exist", () => {
    const trades = [
      trade({ orderId: "1", chamSlKhongCat: true, ghiChuNhinLai: "sợ mất lãi nên bán" }),
      trade({ orderId: "2", chamSlKhongCat: true, ghiChuNhinLai: "cứ tiếc nên giữ lại" }),
      trade({ orderId: "3", chamSlKhongCat: true, ghiChuNhinLai: "muốn chờ hồi thêm chút" }),
    ]
    const result = computeKhoi7Cap2(trades, NOW)
    const insight = result.insights.find((i) => i.patternId === "loss_aversion")
    expect(insight).toBeDefined()
    expect(insight!.matchedCount).toBe(3)
    expect(insight!.text).toContain("3/3")
  })

  it("detects the chi_so_hoa pattern from 'thị trường'/'VN-Index' keywords", () => {
    const trades = [
      trade({ orderId: "1", chamSlKhongCat: true, ghiChuNhinLai: "Thị trường giảm mạnh hôm đó" }),
      trade({ orderId: "2", chamSlKhongCat: true, ghiChuNhinLai: "VN-Index giảm sâu nên tôi bán" }),
      trade({ orderId: "3", chamSlKhongCat: true, ghiChuNhinLai: "toàn thị trường đỏ lửa" }),
    ]
    const result = computeKhoi7Cap2(trades, NOW)
    const insight = result.insights.find((i) => i.patternId === "chi_so_hoa")
    expect(insight).toBeDefined()
    expect(insight!.matchedCount).toBe(3)
  })

  it("ignores ghi chú on trades that are not vi phạm", () => {
    const trades = [
      trade({ orderId: "1", chamSlKhongCat: true, ghiChuNhinLai: "sợ mất lãi nên bán" }),
      trade({ orderId: "2", chamSlKhongCat: true, ghiChuNhinLai: "cứ tiếc nên giữ lại" }),
      trade({ orderId: "3", chamSlKhongCat: true, ghiChuNhinLai: "muốn chờ hồi thêm chút" }),
      trade({ orderId: "4", ghiChuNhinLai: "toàn thị trường đỏ lửa" }), // clean, must be ignored
    ]
    const result = computeKhoi7Cap2(trades, NOW)
    expect(result.totalNotes).toBe(3)
    expect(result.insights.find((i) => i.patternId === "chi_so_hoa")).toBeUndefined()
  })

  it("ignores trades outside the last 4 weeks", () => {
    const trades = [
      trade({ orderId: "1", closedAt: "2026-01-01T00:00:00Z", chamSlKhongCat: true, ghiChuNhinLai: "sợ mất lãi" }),
      trade({ orderId: "2", closedAt: "2026-01-02T00:00:00Z", chamSlKhongCat: true, ghiChuNhinLai: "cứ tiếc" }),
      trade({ orderId: "3", closedAt: "2026-01-03T00:00:00Z", chamSlKhongCat: true, ghiChuNhinLai: "chờ hồi" }),
    ]
    const result = computeKhoi7Cap2(trades, NOW)
    expect(result.totalNotes).toBe(0)
    expect(result.insufficientNote).not.toBeNull()
  })
})

// ── mẫu 9-12 + max 3 across all 12 ───────────────────────────────────────────

describe("computeCap2PortfolioAnalysis — mẫu 9 loại vi phạm phổ biến nhất", () => {
  it("fires when 1 loại chiếm >=50% of >=5 vi phạm in 30 ngày", () => {
    const trades = [
      trade({ orderId: "1", closedAt: "2026-07-20T10:00:00Z", lyDo: "noi_bo", chamSlKhongCat: true }),
      trade({ orderId: "2", closedAt: "2026-07-21T10:00:00Z", lyDo: "noi_bo", chamSlKhongCat: true }),
      trade({ orderId: "3", closedAt: "2026-07-22T10:00:00Z", lyDo: "noi_bo", chamSlKhongCat: true }),
      trade({ orderId: "4", closedAt: "2026-07-23T10:00:00Z", lyDo: "noi_bo", nhoiLenhKhiLo: true }),
      trade({ orderId: "5", closedAt: "2026-07-24T10:00:00Z", lyDo: "noi_bo", nhoiLenhKhiLo: true }),
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    const mau = result.mauPhatHien.find((m) => m.id === "mau9_loai_pho_bien")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("Cắt lỗ chậm")
    expect(mau!.text).toContain("60%")
  })

  it("does not fire below 5 total vi phạm", () => {
    const trades = [
      trade({ orderId: "1", closedAt: "2026-07-20T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "2", closedAt: "2026-07-21T10:00:00Z", chamSlKhongCat: true }),
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.mauPhatHien.find((m) => m.id === "mau9_loai_pho_bien")).toBeUndefined()
  })
})

describe("computeCap2PortfolioAnalysis — mẫu 10 cách chọn hay bẻ kế hoạch", () => {
  it("fires when 1 lý do has >=30% vi phạm rate with >=5 trades", () => {
    const worst = Array.from({ length: 5 }, (_, i) =>
      trade({
        orderId: `w${i}`,
        lyDo: "ky_thuat",
        closedAt: "2026-07-20T10:00:00Z",
        chamSlKhongCat: i < 2, // 2/5 = 40%
      }),
    )
    const others = Array.from({ length: 5 }, (_, i) =>
      trade({ orderId: `o${i}`, lyDo: "dong_tien", closedAt: "2026-07-21T10:00:00Z" }),
    )
    const result = computeCap2PortfolioAnalysis([...worst, ...others], [], null, NOW)
    const mau = result.mauPhatHien.find((m) => m.id === "mau10_ly_do_be_ke_hoach")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("Kỹ thuật")
    expect(mau!.text).toContain("40%")
  })

  it("does not fire below the 30% rate threshold", () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade({ orderId: `w${i}`, lyDo: "ky_thuat" }))
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.mauPhatHien.find((m) => m.id === "mau10_ly_do_be_ke_hoach")).toBeUndefined()
  })
})

describe("computeCap2PortfolioAnalysis — mẫu 11 ngày trong tuần", () => {
  it("fires when >=60% of >=5 vi phạm land on the same weekday (Friday example from spec)", () => {
    const trades = [
      trade({ orderId: "f1", closedAt: "2026-07-03T10:00:00Z", chamSlKhongCat: true }), // Fri
      trade({ orderId: "f2", closedAt: "2026-07-17T10:00:00Z", chamSlKhongCat: true }), // Fri
      trade({ orderId: "f3", closedAt: "2026-07-24T10:00:00Z", chamSlKhongCat: true }), // Fri
      trade({ orderId: "o1", closedAt: "2026-07-01T10:00:00Z", chamSlKhongCat: true }), // Wed
      trade({ orderId: "o2", closedAt: "2026-07-02T10:00:00Z", chamSlKhongCat: true }), // Thu
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    const mau = result.mauPhatHien.find((m) => m.id === "mau11_ngay_trong_tuan")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("3/5")
    expect(mau!.text).toContain("Thứ Sáu")
  })

  it("does not fire below the 60% share threshold", () => {
    const trades = [
      trade({ orderId: "f1", closedAt: "2026-07-03T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "f2", closedAt: "2026-07-17T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "o1", closedAt: "2026-07-01T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "o2", closedAt: "2026-07-02T10:00:00Z", chamSlKhongCat: true }),
      trade({ orderId: "o3", closedAt: "2026-07-06T10:00:00Z", chamSlKhongCat: true }),
    ]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.mauPhatHien.find((m) => m.id === "mau11_ngay_trong_tuan")).toBeUndefined()
  })
})

describe("computeCap2PortfolioAnalysis — mẫu 12 điểm kỷ luật xu hướng", () => {
  it("fires 'cải thiện' when 7-day avg is >=5pts above the 30-day avg, with >=14 days of data", () => {
    const recent7 = Array.from({ length: 7 }, (_, i) => dailyScore({ ngay: `2026-07-2${3 + i}`, diem: 90 }))
    const older23 = Array.from({ length: 23 }, (_, i) =>
      dailyScore({ ngay: `2026-06-${String(1 + i).padStart(2, "0")}`, diem: 70 }),
    )
    const result = computeCap2PortfolioAnalysis([], [...older23, ...recent7], null, NOW)
    const mau = result.mauPhatHien.find((m) => m.id === "mau12_xu_huong")
    expect(mau).toBeDefined()
    expect(mau!.text).toContain("cải thiện")
  })

  it("does not fire below 14 days of history", () => {
    const series = Array.from({ length: 10 }, (_, i) => dailyScore({ ngay: `2026-07-${10 + i}`, diem: 70 + i * 5 }))
    const result = computeCap2PortfolioAnalysis([], series, null, NOW)
    expect(result.mauPhatHien.find((m) => m.id === "mau12_xu_huong")).toBeUndefined()
  })
})

describe("computeCap2PortfolioAnalysis — tối đa 3 mẫu hiện cùng lúc trên tổng 12 mẫu", () => {
  it("caps mauPhatHien at 3 and orders by priority even when 4+ mẫu qualify", () => {
    // mẫu 3 (co_so_dang_gia, delegated from Cấp 1): ung_ho wins vs. others losses.
    const mau3Trades = [
      trade({ orderId: "u1", lyDo: "dinh_gia", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
      trade({ orderId: "u2", lyDo: "dinh_gia", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
      trade({ orderId: "u3", lyDo: "dinh_gia", trangThaiLucDat: "ung_ho", pnlVnd: 100 }),
      trade({ orderId: "o1", lyDo: "dinh_gia", trangThaiLucDat: "trung_tinh", pnlVnd: -100 }),
      trade({ orderId: "o2", lyDo: "dinh_gia", trangThaiLucDat: "can_chu_y", pnlVnd: -100 }),
      trade({ orderId: "o3", lyDo: "dinh_gia", trangThaiLucDat: "nguoc_chieu", pnlVnd: -100 }),
    ]
    // mẫu 9 + mẫu 10 (same 5 trades qualify both: 3/5 cat_lo_cham = 60% share of
    // vi phạm, AND lý do noi_bo has 5/5 = 100% vi phạm rate) — spread across
    // 5 distinct weekdays so mẫu 11 does NOT also fire.
    const mau9and10Trades = [
      trade({ orderId: "n1", lyDo: "noi_bo", closedAt: "2026-07-20T10:00:00Z", chamSlKhongCat: true }), // Mon
      trade({ orderId: "n2", lyDo: "noi_bo", closedAt: "2026-07-21T10:00:00Z", chamSlKhongCat: true }), // Tue
      trade({ orderId: "n3", lyDo: "noi_bo", closedAt: "2026-07-22T10:00:00Z", chamSlKhongCat: true }), // Wed
      trade({ orderId: "n4", lyDo: "noi_bo", closedAt: "2026-07-23T10:00:00Z", nhoiLenhKhiLo: true, pnlVnd: -1 }), // Thu
      trade({ orderId: "n5", lyDo: "noi_bo", closedAt: "2026-07-24T10:00:00Z", nhoiLenhKhiLo: true, pnlVnd: 1 }), // Fri
    ]
    const trades = [...mau3Trades, ...mau9and10Trades]

    // mẫu 12 improving.
    const recent7 = Array.from({ length: 7 }, (_, i) => dailyScore({ ngay: `2026-07-2${3 + i}`, diem: 90 }))
    const older23 = Array.from({ length: 23 }, (_, i) =>
      dailyScore({ ngay: `2026-06-${String(1 + i).padStart(2, "0")}`, diem: 70 }),
    )
    const dailyScores = [...older23, ...recent7]

    const result = computeCap2PortfolioAnalysis(trades, dailyScores, null, NOW)

    // All 4 (mẫu 12, mẫu 9, mẫu 3, mẫu 10) individually qualify...
    expect(result.mauPhatHien.length).toBeLessThanOrEqual(3)
    // ...but only the top-3 by priority survive the cap, in priority order.
    expect(result.mauPhatHien.map((m) => m.id)).toEqual([
      "mau12_xu_huong",
      "mau9_loai_pho_bien",
      "co_so_dang_gia",
    ])
  })

  it("shows an insufficient-data note when no mẫu (of all 12) fires", () => {
    const trades = [trade({ orderId: "1" }), trade({ orderId: "2" })]
    const result = computeCap2PortfolioAnalysis(trades, [], null, NOW)
    expect(result.mauPhatHien).toHaveLength(0)
    expect(result.mauInsufficientNote).not.toBeNull()
  })
})

// ── null-safety ───────────────────────────────────────────────────────────────

describe("computeCap2PortfolioAnalysis — null progress / empty data", () => {
  it("degrades to a fully-empty, non-throwing result", () => {
    expect(() => computeCap2PortfolioAnalysis([], [], null, NOW)).not.toThrow()
    const result = computeCap2PortfolioAnalysis([], [], null, NOW)
    expect(result.khoi1.totalTrades).toBe(0)
    expect(result.khoi4.readyToGraduate).toBe(false)
    expect(result.khoi5.avg7).toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import type { Cap2Progress } from "@/features/cap2/types"
import {
  computeCap3Khoi7TuTin,
  computeCap3Khoi8KhoiLuong,
  computeCap3PortfolioAnalysis,
  KHOI7_MIN_TRADES_PER_MUC,
} from "./portfolioAnalysisCap3"
import type { Cap3TradeRecord } from "./tradeLogCap3"
import type { Cap3Progress, MucTuTin } from "./types"

let seq = 0

function trade(overrides: Partial<Cap3TradeRecord> = {}): Cap3TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 4,
    pnlVnd: 400_000,
    closedAt: "2026-07-10T00:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    ...overrides,
  }
}

/** N lệnh cùng mức tự tin: `wins` lệnh lãi `winPct`, còn lại lỗ `lossPct`. */
function tradesFor(
  mucTuTin: MucTuTin,
  n: number,
  wins: number,
  extra: Partial<Cap3TradeRecord> = {},
  winPct = 6,
  lossPct = -4,
): Cap3TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    trade({ mucTuTin, pnlPct: i < wins ? winPct : lossPct, ...extra }),
  )
}

function cap2Progress(overrides: Partial<Cap2Progress> = {}): Cap2Progress {
  return {
    id: "c2p",
    user_id: "u1",
    entered_at: "2026-05-01T00:00:00Z",
    // 2/2 nhiệm vụ Cấp 2 — hàng progress của một người ĐÃ tốt nghiệp Cấp 2
    // (`graduated_at` bên dưới), nên khối 4 uỷ quyền phải báo đủ điều kiện.
    task_1_done_at: "2026-06-01T00:00:00Z",
    task_2_done_at: "2026-06-01T00:00:00Z",
    so_lenh_co_cl_tp: 0,
    so_lan_cat_lo_dung: 0,
    so_lan_chot_loi_dung: 0,
    so_lan_thuc_hien_dung: 0,
    chuoi_current: 3,
    chuoi_record: 5,
    last_chuoi_reset_at: null,
    graduated_at: "2026-06-02T00:00:00Z",
    time_to_graduate_hours: 10,
    ...overrides,
  }
}

function cap3Progress(overrides: Partial<Cap3Progress> = {}): Cap3Progress {
  return {
    id: "c3p",
    user_id: "u1",
    entered_at: "2026-06-03T00:00:00Z",
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

describe("computeCap3Khoi7TuTin — ⑦ thắng/thua theo mức tự tin", () => {
  it("always returns 3 hàng, ordered ⭐⭐⭐ Cao → ⭐⭐ Vừa → ⭐ Thấp", () => {
    const khoi7 = computeCap3Khoi7TuTin([])
    expect(khoi7.rows.map((r) => r.mucTuTin)).toEqual([3, 2, 1])
    expect(khoi7.rows.map((r) => r.label)).toEqual(["⭐⭐⭐ Cao", "⭐⭐ Vừa", "⭐ Thấp"])
  })

  it("no trades at all → mọi hàng count 0, tỷ lệ thắng/lãi TB là null (không bịa 0%)", () => {
    const khoi7 = computeCap3Khoi7TuTin([])
    for (const row of khoi7.rows) {
      expect(row.count).toBe(0)
      expect(row.winRate).toBeNull()
      expect(row.avgPnlPct).toBeNull()
      expect(row.insufficient).toBe(true)
    }
    expect(khoi7.phatHien).toBeNull()
    expect(khoi7.insufficientNote).toMatch(/Chưa có lệnh/)
  })

  it("counts số lệnh, tỷ lệ thắng và lãi/lỗ TB per mức", () => {
    const khoi7 = computeCap3Khoi7TuTin([
      ...tradesFor(3, 4, 3, {}, 6, -4), // 3 thắng / 4 → 75%, TB = (3*6 − 4)/4 = 3.5
      ...tradesFor(1, 4, 1, {}, 2, -2), // 1 thắng / 4 → 25%, TB = (2 − 3*2)/4 = −1
    ])
    const cao = khoi7.rows.find((r) => r.mucTuTin === 3)!
    const thap = khoi7.rows.find((r) => r.mucTuTin === 1)!
    expect(cao.count).toBe(4)
    expect(cao.winRate).toBe(75)
    expect(cao.avgPnlPct).toBe(3.5)
    expect(thap.count).toBe(4)
    expect(thap.winRate).toBe(25)
    expect(thap.avgPnlPct).toBe(-1)
    expect(khoi7.totalTrades).toBe(8)
  })

  it("marks a mức with fewer than the minimum trades as insufficient (số thật, chưa đủ để kết luận)", () => {
    const khoi7 = computeCap3Khoi7TuTin(tradesFor(2, KHOI7_MIN_TRADES_PER_MUC - 1, 1))
    const vua = khoi7.rows.find((r) => r.mucTuTin === 2)!
    expect(vua.count).toBe(KHOI7_MIN_TRADES_PER_MUC - 1)
    expect(vua.winRate).not.toBeNull()
    expect(vua.insufficient).toBe(true)
  })

  it('tự tin cao thắng hơn hẳn → phát hiện "đáng tin" kèm cả 2 con số', () => {
    const khoi7 = computeCap3Khoi7TuTin([
      ...tradesFor(3, 4, 4), // 100%
      ...tradesFor(1, 4, 1), // 25%
    ])
    expect(khoi7.phatHien).toMatch(/đáng tin/)
    expect(khoi7.phatHien).toContain("100%")
    expect(khoi7.phatHien).toContain("25%")
    expect(khoi7.insufficientNote).toBeNull()
  })

  it('tự tin cao thắng ÍT hơn → phát hiện "Cẩn thận" (quá tự tin)', () => {
    const khoi7 = computeCap3Khoi7TuTin([
      ...tradesFor(3, 4, 1), // 25%
      ...tradesFor(1, 4, 4), // 100%
    ])
    expect(khoi7.phatHien).toMatch(/Cẩn thận/)
    expect(khoi7.phatHien).toMatch(/⭐⭐⭐ Cao/)
  })

  it("chênh lệch nhỏ → nói thẳng là chưa đủ khác biệt, KHÔNG kết luận", () => {
    const khoi7 = computeCap3Khoi7TuTin([
      ...tradesFor(3, 4, 2), // 50%
      ...tradesFor(1, 4, 2), // 50%
    ])
    expect(khoi7.phatHien).toMatch(/chưa khác biệt rõ/)
    expect(khoi7.phatHien).not.toMatch(/đáng tin/)
  })

  it("thiếu lệnh ở một trong 2 cực → không phát hiện, ghi rõ còn thiếu bao nhiêu", () => {
    const khoi7 = computeCap3Khoi7TuTin([...tradesFor(3, 5, 4), ...tradesFor(1, 1, 0)])
    expect(khoi7.phatHien).toBeNull()
    expect(khoi7.insufficientNote).toContain(`${KHOI7_MIN_TRADES_PER_MUC}`)
    expect(khoi7.insufficientNote).toMatch(/Cao 5/)
    expect(khoi7.insufficientNote).toMatch(/Thấp 1/)
  })
})

describe("computeCap3Khoi8KhoiLuong — ⑧ khối lượng có đi theo tự tin không", () => {
  it("no trades → 3 hàng rỗng, không con số bịa, có ghi chú thiếu dữ liệu", () => {
    const khoi8 = computeCap3Khoi8KhoiLuong([])
    expect(khoi8.rows.map((r) => r.mucTuTin)).toEqual([3, 2, 1])
    for (const row of khoi8.rows) {
      expect(row.avgKhoiLuong).toBeNull()
      expect(row.avgPctVon).toBeNull()
      expect(row.cachHayDung).toBeNull()
      expect(row.insufficient).toBe(true)
    }
    expect(khoi8.theoTuTin).toBeNull()
    expect(khoi8.phatHien).toBeNull()
    expect(khoi8.insufficientNote).not.toBeNull()
  })

  it("tính khối lượng TB, % vốn TB và cách hay dùng theo từng mức", () => {
    const khoi8 = computeCap3Khoi8KhoiLuong([
      trade({ mucTuTin: 3, khoiLuong: 1_000, pctVon: 20, cachKhoiLuong: "linh_hoat" }),
      trade({ mucTuTin: 3, khoiLuong: 1_200, pctVon: 18, cachKhoiLuong: "linh_hoat" }),
      trade({ mucTuTin: 3, khoiLuong: 1_100, pctVon: 19, cachKhoiLuong: "ky_luat" }),
    ])
    const cao = khoi8.rows.find((r) => r.mucTuTin === 3)!
    expect(cao.count).toBe(3)
    expect(cao.avgKhoiLuong).toBe(1_100)
    expect(cao.avgPctVon).toBe(19)
    expect(cao.cachHayDung).toBe("linh_hoat")
    expect(cao.cachHayDungLabel).toMatch(/tự tin/)
  })

  it('khối lượng tăng dần theo tự tin → phát hiện "đúng hướng" kèm số 2 cực', () => {
    const khoi8 = computeCap3Khoi8KhoiLuong([
      ...tradesFor(3, 3, 3, { khoiLuong: 1_100, pctVon: 19 }),
      ...tradesFor(2, 3, 2, { khoiLuong: 640, pctVon: 15 }),
      ...tradesFor(1, 3, 1, { khoiLuong: 410, pctVon: 10 }),
    ])
    expect(khoi8.theoTuTin).toBe(true)
    expect(khoi8.phatHien).toMatch(/đúng hướng/)
    expect(khoi8.phatHien).toContain("19%")
    expect(khoi8.phatHien).toContain("10%")
    expect(khoi8.phatHien).toContain("1,100")
    expect(khoi8.phatHien).toContain("410")
  })

  it("khối lượng không đi theo tự tin (cách kỷ luật, phẳng) → gợi ý dùng Cách 1", () => {
    const khoi8 = computeCap3Khoi8KhoiLuong([
      ...tradesFor(3, 3, 2, { khoiLuong: 300, pctVon: 20, cachKhoiLuong: "ky_luat" }),
      ...tradesFor(1, 3, 1, { khoiLuong: 300, pctVon: 20, cachKhoiLuong: "ky_luat" }),
    ])
    expect(khoi8.theoTuTin).toBe(false)
    expect(khoi8.phatHien).toMatch(/chưa đi theo tự tin/)
    expect(khoi8.phatHien).toMatch(/Cách 1/)
  })

  it("tự tin cao lại mua ÍT hơn tự tin thấp → vẫn là 'chưa đi theo tự tin'", () => {
    const khoi8 = computeCap3Khoi8KhoiLuong([
      ...tradesFor(3, 3, 2, { khoiLuong: 200, pctVon: 8 }),
      ...tradesFor(1, 3, 1, { khoiLuong: 800, pctVon: 25 }),
    ])
    expect(khoi8.theoTuTin).toBe(false)
  })

  it("mức Vừa phá vỡ thứ tự (Vừa mua nhiều hơn Cao) → không kết luận tăng dần", () => {
    const khoi8 = computeCap3Khoi8KhoiLuong([
      ...tradesFor(3, 3, 2, { khoiLuong: 900, pctVon: 18 }),
      ...tradesFor(2, 3, 2, { khoiLuong: 1_400, pctVon: 28 }),
      ...tradesFor(1, 3, 1, { khoiLuong: 400, pctVon: 10 }),
    ])
    expect(khoi8.theoTuTin).toBe(false)
  })

  it("thiếu dữ liệu ở 1 cực → không kết luận, ghi rõ thiếu", () => {
    const khoi8 = computeCap3Khoi8KhoiLuong(tradesFor(3, 5, 3, { khoiLuong: 900, pctVon: 18 }))
    expect(khoi8.theoTuTin).toBeNull()
    expect(khoi8.phatHien).toBeNull()
    expect(khoi8.insufficientNote).toMatch(/Thấp 0/)
  })
})

describe("computeCap3PortfolioAnalysis — delegation to Cấp 2 (cộng dồn)", () => {
  const now = new Date("2026-07-15T00:00:00Z")

  it("keeps every Cấp 1-2 khối (①②③④) by delegating to computeCap2PortfolioAnalysis", () => {
    const trades = [
      ...tradesFor(3, 4, 3, { closedAt: "2026-07-01T00:00:00Z" }),
      ...tradesFor(1, 4, 1, { closedAt: "2026-07-02T00:00:00Z" }),
    ]
    const result = computeCap3PortfolioAnalysis(
      trades,
      [{ ngay: "2026-07-01", diem: 90, xepLoai: "xanh" }],
      cap2Progress(),
      cap3Progress(),
      now,
    )
    // Khối 1/2 delegated from Cấp 1 through Cấp 2.
    expect(result.khoi1.totalTrades).toBe(8)
    expect(result.khoi2).toHaveLength(5)
    // ③ độ phủ 5 lý do + ④ cơ chế cắt lỗ/chốt lời — 4 khối của mô hình 2 nhiệm
    // vụ, không còn khối vi phạm/điểm kỷ luật/ghi chú nào để giữ.
    expect(result.khoi3.usedCount).toBeGreaterThan(0)
    expect(result.khoi4.tongDung).toBe(0)
    expect(result.khoi4.scopeNote).toContain("làm quen cơ chế")
    const stale = result as unknown as Record<string, unknown>
    expect(stale.khoi5).toBeUndefined()
    expect(stale.khoi6).toBeUndefined()
    expect(stale.mauPhatHien).toBeUndefined()
  })

  it("adds khối ⑦ + ⑧ under distinct keys (no clash with Cấp 2's khoi7 ghi chú)", () => {
    const result = computeCap3PortfolioAnalysis(
      [...tradesFor(3, 4, 4), ...tradesFor(1, 4, 1)],
      [],
      cap2Progress(),
      cap3Progress(),
      now,
    )
    expect(result.khoi7TuTin.rows).toHaveLength(3)
    expect(result.khoi8KhoiLuong.rows).toHaveLength(3)
    // Cấp 2's old «khoi7 ghi chú» is gone with the 5-nhiệm-vụ model, so ⑦/⑧
    // keep their distinct keys with nothing left to clash against.
    expect((result as unknown as Record<string, unknown>).khoi7).toBeUndefined()
    expect(result.khoi7TuTin.phatHien).toMatch(/đáng tin/)
  })

  it("surfaces khẩu vị đang dùng for khối ① (spec §8)", () => {
    const result = computeCap3PortfolioAnalysis(
      [],
      [],
      null,
      cap3Progress({ khau_vi: "tan_cong" }),
      now,
    )
    expect(result.khauVi).toBe("tan_cong")
    expect(result.khauViPct).toBe(30)
  })

  it("khẩu vị null khi chưa đặt (không bịa mức mặc định)", () => {
    const result = computeCap3PortfolioAnalysis([], [], null, null, now)
    expect(result.khauVi).toBeNull()
    expect(result.khauViPct).toBeNull()
  })

  it("⑦/⑧ dùng TOÀN BỘ nhật ký Cấp 3 (không cửa sổ thời gian)", () => {
    const old = tradesFor(3, 3, 3, { closedAt: "2026-04-01T00:00:00Z" })
    const recent = tradesFor(1, 3, 0, { closedAt: "2026-07-14T00:00:00Z" })
    const result = computeCap3PortfolioAnalysis(
      [...old, ...recent],
      [],
      cap2Progress(),
      cap3Progress(),
      now,
    )
    // Khối ① (uỷ quyền Cấp 1 qua Cấp 2) đếm cả 6 — mô hình 2 nhiệm vụ không
    // còn khối nào cắt theo cửa sổ 30 ngày.
    expect(result.khoi1.totalTrades).toBe(6)
    // Khối ⑦ sees all 6 (the Cấp 3 log only starts at Cấp 3 anyway).
    expect(result.khoi7TuTin.totalTrades).toBe(6)
  })
})

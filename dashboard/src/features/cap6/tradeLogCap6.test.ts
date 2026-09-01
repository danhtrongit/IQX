import { beforeEach, describe, expect, it } from "vitest"
import {
  appendCap6TradeRecord,
  readCap6TradeLog,
  type Cap6TradeRecord,
} from "./tradeLogCap6"

/**
 * Nhật ký lệnh đã đóng của Cấp 6 — nguồn DUY NHẤT của khối ⑭ (không có endpoint
 * nào liệt kê từng lệnh kèm kiểu × lớp quyết định). Mirror `tradeLogCap5.ts`.
 */
function record(overrides: Partial<Cap6TradeRecord> = {}): Cap6TradeRecord {
  return {
    orderId: "o1",
    lyDo: "dinh_gia",
    trangThaiLucDat: "ung_ho",
    pnlPct: 5.3,
    pnlVnd: 318_000,
    closedAt: "2026-07-25T00:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 200,
    pctVon: 15,
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "bad" },
    ai_5_lop: null,
    so_lop_dong_thuan: null,
    so_lop_khac_ai: null,
    huntFilter: null,
    huntSoPhienCho: null,
    huntSoLopLucVao: null,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("tradeLogCap6", () => {
  it("preserves inherited Cấp 1-5 evidence", () => {
    appendCap6TradeRecord("u1", record())
    const [rec] = readCap6TradeLog("u1")
    expect(rec.huntFilter).toBeNull()
  })

  it("de-dupes by orderId", () => {
    appendCap6TradeRecord("u1", record())
    appendCap6TradeRecord("u1", record({ pnlPct: -2 }))
    const log = readCap6TradeLog("u1")
    expect(log).toHaveLength(1)
    expect(log[0].pnlPct).toBe(-2)
  })

  it("separates users and tolerates missing or malformed storage", () => {
    appendCap6TradeRecord("u1", record())
    expect(readCap6TradeLog("u2")).toEqual([])
    window.localStorage.setItem("iqx_cap6_trades_u3", "{{{")
    expect(readCap6TradeLog("u3")).toEqual([])
  })
})

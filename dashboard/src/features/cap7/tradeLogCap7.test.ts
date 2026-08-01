import { beforeEach, describe, expect, it } from "vitest"
import {
  appendCap7TradeRecord,
  readCap7TradeLog,
  type Cap7TradeRecord,
} from "./tradeLogCap7"

/**
 * Nhật ký lệnh đã đóng của Cấp 7 — nguồn DUY NHẤT của xu hướng ở khối ⑯ và của
 * phép so hai nhóm cờ ở khối ⑰ (BE Cấp 7 chỉ trả state tổng hợp, không liệt kê
 * từng lệnh kèm `dien_bien_pct` × `hanh_vi_co`). Mirror `tradeLogCap6.ts`.
 */
function record(overrides: Partial<Cap7TradeRecord> = {}): Cap7TradeRecord {
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
    o4: "dung_thang",
    verdictHe: "dung",
    verdictUser: "dung",
    kieuCoPhieu: "ngan_hang",
    lopQuyetDinh: "dinh_gia",
    khopGoiY: true,
    lucChiSo: 1.94,
    lucBand: "cau_ap_dao",
    lucDocUser: "manh",
    docLucDung: true,
    dienBienPct: 1.2,
    coCanhGiac: false,
    hanhViCo: null,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("tradeLogCap7", () => {
  it("ghi rồi đọc lại được đủ 7 trường Cấp 7", () => {
    appendCap7TradeRecord("u1", record())
    const [rec] = readCap7TradeLog("u1")
    expect(rec.lucChiSo).toBe(1.94)
    expect(rec.lucBand).toBe("cau_ap_dao")
    expect(rec.lucDocUser).toBe("manh")
    expect(rec.docLucDung).toBe(true)
    expect(rec.dienBienPct).toBe(1.2)
    expect(rec.coCanhGiac).toBe(false)
    expect(rec.hanhViCo).toBeNull()
  })

  it("giữ nguyên các trường Cấp 1-6 (bản ghi là SIÊU TẬP, không thay thế)", () => {
    appendCap7TradeRecord("u1", record())
    const [rec] = readCap7TradeLog("u1")
    expect(rec.khopGoiY).toBe(true)
    expect(rec.o4).toBe("dung_thang")
    expect(rec.lyDo).toBe("dinh_gia")
  })

  it("de-dupe theo orderId (re-mount không đếm 2 lần)", () => {
    appendCap7TradeRecord("u1", record())
    appendCap7TradeRecord("u1", record({ docLucDung: false }))
    const log = readCap7TradeLog("u1")
    expect(log).toHaveLength(1)
    expect(log[0].docLucDung).toBe(false)
  })

  it("lệnh chưa tới hạn chấm ghi docLucDung = null, KHÔNG quy về false", () => {
    appendCap7TradeRecord("u1", record({ docLucDung: null, dienBienPct: null }))
    const [rec] = readCap7TradeLog("u1")
    expect(rec.docLucDung).toBeNull()
    expect(rec.dienBienPct).toBeNull()
  })

  it("tách theo user + không throw khi storage rỗng/hỏng", () => {
    appendCap7TradeRecord("u1", record())
    expect(readCap7TradeLog("u2")).toEqual([])
    window.localStorage.setItem("iqx_cap7_trades_u3", "{{{")
    expect(readCap7TradeLog("u3")).toEqual([])
  })
})

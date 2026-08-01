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
    o4: "dung_thang",
    verdictHe: "dung",
    verdictUser: "dung",
    kieuCoPhieu: "ngan_hang",
    lopQuyetDinh: "dinh_gia",
    khopGoiY: true,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("tradeLogCap6", () => {
  it("ghi rồi đọc lại được 3 trường Cấp 6", () => {
    appendCap6TradeRecord("u1", record())
    const [rec] = readCap6TradeLog("u1")
    expect(rec.kieuCoPhieu).toBe("ngan_hang")
    expect(rec.lopQuyetDinh).toBe("dinh_gia")
    expect(rec.khopGoiY).toBe(true)
  })

  it("de-dupe theo orderId (re-mount không đếm 2 lần)", () => {
    appendCap6TradeRecord("u1", record())
    appendCap6TradeRecord("u1", record({ khopGoiY: false }))
    const log = readCap6TradeLog("u1")
    expect(log).toHaveLength(1)
    expect(log[0].khopGoiY).toBe(false)
  })

  it("lệnh không có đối chiếu ghi cả 3 trường là null (KHÔNG suy ra lệch)", () => {
    appendCap6TradeRecord(
      "u1",
      record({ orderId: "o2", kieuCoPhieu: null, lopQuyetDinh: null, khopGoiY: null }),
    )
    const [rec] = readCap6TradeLog("u1")
    expect(rec.khopGoiY).toBeNull()
    expect(rec.lopQuyetDinh).toBeNull()
  })

  it("tách theo user + không throw khi storage rỗng/hỏng", () => {
    appendCap6TradeRecord("u1", record())
    expect(readCap6TradeLog("u2")).toEqual([])
    window.localStorage.setItem("iqx_cap6_trades_u3", "{{{")
    expect(readCap6TradeLog("u3")).toEqual([])
  })
})

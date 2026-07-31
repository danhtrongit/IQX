import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import {
  appendCap5TradeRecord,
  readCap5TradeLog,
  useCap5TradeLog,
  type Cap5TradeRecord,
} from "./tradeLogCap5"

const trade1: Cap5TradeRecord = {
  orderId: "o1",
  lyDo: "tin_tuc",
  trangThaiLucDat: "ung_ho",
  pnlPct: 5.3,
  pnlVnd: 318_000,
  closedAt: "2026-07-01T00:00:00Z",
  chamSlKhongCat: false,
  chamTpGiuLamHut: false,
  banSomKhiLoNhe: false,
  nhoiLenhKhiLo: false,
  khauVi: "can_bang",
  mucTuTin: 2,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 200,
  pctVon: 15,
  doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "ok", dinh_gia: "ok" },
  ai_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "neu", tin_tuc: "bad", dinh_gia: "ok" },
  so_lop_dong_thuan: 4,
  so_lop_khac_ai: 1,
  o4: "dung_thang",
  verdictHe: "dung",
  verdictUser: "dung",
}

const trade2: Cap5TradeRecord = {
  orderId: "o2",
  lyDo: "ky_thuat",
  trangThaiLucDat: "trung_tinh",
  pnlPct: -2.5,
  pnlVnd: -400_000,
  closedAt: "2026-07-02T00:00:00Z",
  chamSlKhongCat: true,
  chamTpGiuLamHut: false,
  banSomKhiLoNhe: false,
  nhoiLenhKhiLo: false,
  khauVi: "than_trong",
  mucTuTin: 1,
  cachKhoiLuong: "ky_luat",
  khoiLuong: 300,
  pctVon: 10,
  doc_5_lop: { ky_thuat: "ok", dong_tien: "bad" },
  ai_5_lop: null,
  so_lop_dong_thuan: null,
  so_lop_khac_ai: null,
  o4: null,
  verdictHe: null,
  verdictUser: null,
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("readCap5TradeLog / appendCap5TradeRecord", () => {
  it("returns an empty array when nothing has been recorded yet", () => {
    expect(readCap5TradeLog("user-1")).toEqual([])
  })

  it("appends and persists a record", () => {
    appendCap5TradeRecord("user-1", trade1)
    expect(readCap5TradeLog("user-1")).toEqual([trade1])
  })

  it("accumulates multiple distinct orders", () => {
    appendCap5TradeRecord("user-1", trade1)
    appendCap5TradeRecord("user-1", trade2)
    expect(readCap5TradeLog("user-1")).toEqual([trade1, trade2])
  })

  it("de-dupes by orderId — recording the same order twice replaces, not duplicates", () => {
    appendCap5TradeRecord("user-1", trade1)
    appendCap5TradeRecord("user-1", { ...trade1, o4: "sai_thang", verdictUser: "sai" })
    const log = readCap5TradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].o4).toBe("sai_thang")
    expect(log[0].verdictUser).toBe("sai")
  })

  it("scopes the log per user — user-2 sees nothing from user-1", () => {
    appendCap5TradeRecord("user-1", trade1)
    expect(readCap5TradeLog("user-2")).toEqual([])
  })

  it("keeps the 4-ô fields verbatim (khối ⑫ đọc từ đây)", () => {
    appendCap5TradeRecord("user-1", trade1)
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.o4).toBe("dung_thang")
    expect(rec.verdictHe).toBe("dung")
    expect(rec.verdictUser).toBe("dung")
  })

  it("giữ verdict hệ RIÊNG với verdict user (user đảo verdict vẫn tra được gốc)", () => {
    appendCap5TradeRecord("user-1", { ...trade1, verdictHe: "dung", verdictUser: "sai", o4: "sai_thang" })
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.verdictHe).toBe("dung")
    expect(rec.verdictUser).toBe("sai")
    expect(rec.o4).toBe("sai_thang")
  })

  it("giữ null cho lệnh chưa phân loại (KHÔNG quy về một ô nào)", () => {
    appendCap5TradeRecord("user-1", trade2)
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.o4).toBeNull()
    expect(rec.verdictHe).toBeNull()
    expect(rec.verdictUser).toBeNull()
  })

  it("keeps every inherited Cấp 1/2/3/4 field so các khối cũ vẫn tính được", () => {
    appendCap5TradeRecord("user-1", trade2)
    const [rec] = readCap5TradeLog("user-1")
    expect(rec.lyDo).toBe("ky_thuat")
    expect(rec.chamSlKhongCat).toBe(true)
    expect(rec.mucTuTin).toBe(1)
    expect(rec.cachKhoiLuong).toBe("ky_luat")
    expect(rec.khoiLuong).toBe(300)
    expect(rec.pctVon).toBe(10)
    expect(rec.khauVi).toBe("than_trong")
    expect(rec.pnlPct).toBe(-2.5)
    expect(rec.pnlVnd).toBe(-400_000)
    expect(rec.closedAt).toBe("2026-07-02T00:00:00Z")
    expect(rec.doc_5_lop).toEqual({ ky_thuat: "ok", dong_tien: "bad" })
  })

  it("uses a Cấp-5-only storage key (does not read/write Cấp 4's log)", () => {
    appendCap5TradeRecord("user-1", trade1)
    expect(window.localStorage.getItem("iqx_cap5_trades_user-1")).not.toBeNull()
    expect(window.localStorage.getItem("iqx_cap4_trades_user-1")).toBeNull()
  })

  it("degrades to an empty list when stored JSON is not an array", () => {
    window.localStorage.setItem("iqx_cap5_trades_user-1", '{"nope":1}')
    expect(readCap5TradeLog("user-1")).toEqual([])
  })
})

describe("useCap5TradeLog", () => {
  it("reads the current user's trade log on mount", () => {
    appendCap5TradeRecord("user-1", trade1)
    const { result } = renderHook(() => useCap5TradeLog())
    expect(result.current.trades).toEqual([trade1])
  })

  it("record() appends and updates the hook's returned trades", () => {
    const { result } = renderHook(() => useCap5TradeLog())
    expect(result.current.trades).toEqual([])
    act(() => result.current.record(trade2))
    expect(result.current.trades).toEqual([trade2])
    expect(readCap5TradeLog("user-1")).toEqual([trade2])
  })

  it("record() twice with the same orderId keeps one entry", () => {
    const { result } = renderHook(() => useCap5TradeLog())
    act(() => result.current.record(trade1))
    act(() => result.current.record({ ...trade1, pnlPct: 7 }))
    expect(result.current.trades).toHaveLength(1)
    expect(result.current.trades[0].pnlPct).toBe(7)
  })
})

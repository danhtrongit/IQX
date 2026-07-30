import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import {
  appendCap4TradeRecord,
  readCap4TradeLog,
  useCap4TradeLog,
  type Cap4TradeRecord,
} from "./tradeLogCap4"

const trade1: Cap4TradeRecord = {
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
  doc_5_lop: {
    ky_thuat: "ok",
    dong_tien: "ok",
    noi_bo: "neu",
    tin_tuc: "ok",
    dinh_gia: "ok",
  },
  ai_5_lop: {
    ky_thuat: "ok",
    dong_tien: "ok",
    noi_bo: "neu",
    tin_tuc: "bad",
    dinh_gia: "ok",
  },
  so_lop_dong_thuan: 4,
  so_lop_khac_ai: 1,
}

const trade2: Cap4TradeRecord = {
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
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("readCap4TradeLog / appendCap4TradeRecord", () => {
  it("returns an empty array when nothing has been recorded yet", () => {
    expect(readCap4TradeLog("user-1")).toEqual([])
  })

  it("appends and persists a record", () => {
    appendCap4TradeRecord("user-1", trade1)
    expect(readCap4TradeLog("user-1")).toEqual([trade1])
  })

  it("accumulates multiple distinct orders", () => {
    appendCap4TradeRecord("user-1", trade1)
    appendCap4TradeRecord("user-1", trade2)
    expect(readCap4TradeLog("user-1")).toEqual([trade1, trade2])
  })

  it("de-dupes by orderId — recording the same order twice replaces, not duplicates", () => {
    appendCap4TradeRecord("user-1", trade1)
    appendCap4TradeRecord("user-1", { ...trade1, so_lop_khac_ai: 2 })
    const log = readCap4TradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].so_lop_khac_ai).toBe(2)
  })

  it("scopes the log per user — user-2 sees nothing from user-1", () => {
    appendCap4TradeRecord("user-1", trade1)
    expect(readCap4TradeLog("user-2")).toEqual([])
  })

  it("keeps the đọc-5-lớp fields verbatim (khối ⑩/⑪ đọc từ đây)", () => {
    appendCap4TradeRecord("user-1", trade1)
    const [rec] = readCap4TradeLog("user-1")
    expect(rec.doc_5_lop).toEqual(trade1.doc_5_lop)
    expect(rec.ai_5_lop).toEqual(trade1.ai_5_lop)
    expect(rec.so_lop_dong_thuan).toBe(4)
    expect(rec.so_lop_khac_ai).toBe(1)
  })

  it("giữ null cho lệnh chưa lộ AI (KHÔNG quy về 0 — 0 là một con số khác)", () => {
    appendCap4TradeRecord("user-1", trade2)
    const [rec] = readCap4TradeLog("user-1")
    expect(rec.ai_5_lop).toBeNull()
    expect(rec.so_lop_dong_thuan).toBeNull()
    expect(rec.so_lop_khac_ai).toBeNull()
  })

  it("keeps every inherited Cấp 1/2/3 field so các khối cũ vẫn tính được", () => {
    appendCap4TradeRecord("user-1", trade2)
    const [rec] = readCap4TradeLog("user-1")
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
  })

  it("uses a Cấp-4-only storage key (does not read/write Cấp 3's log)", () => {
    appendCap4TradeRecord("user-1", trade1)
    expect(window.localStorage.getItem("iqx_cap4_trades_user-1")).not.toBeNull()
    expect(window.localStorage.getItem("iqx_cap3_trades_user-1")).toBeNull()
  })

  it("degrades to an empty list when stored JSON is not an array", () => {
    window.localStorage.setItem("iqx_cap4_trades_user-1", '{"nope":1}')
    expect(readCap4TradeLog("user-1")).toEqual([])
  })
})

describe("useCap4TradeLog", () => {
  it("reads the current user's trade log on mount", () => {
    appendCap4TradeRecord("user-1", trade1)
    const { result } = renderHook(() => useCap4TradeLog())
    expect(result.current.trades).toEqual([trade1])
  })

  it("record() appends and updates the hook's returned trades", () => {
    const { result } = renderHook(() => useCap4TradeLog())
    expect(result.current.trades).toEqual([])
    act(() => result.current.record(trade2))
    expect(result.current.trades).toEqual([trade2])
    expect(readCap4TradeLog("user-1")).toEqual([trade2])
  })

  it("record() twice with the same orderId keeps one entry", () => {
    const { result } = renderHook(() => useCap4TradeLog())
    act(() => result.current.record(trade1))
    act(() => result.current.record({ ...trade1, pnlPct: 7 }))
    expect(result.current.trades).toHaveLength(1)
    expect(result.current.trades[0].pnlPct).toBe(7)
  })
})

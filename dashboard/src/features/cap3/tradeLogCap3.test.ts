import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import {
  appendCap3TradeRecord,
  readCap3TradeLog,
  useCap3TradeLog,
  type Cap3TradeRecord,
} from "./tradeLogCap3"

const trade1: Cap3TradeRecord = {
  orderId: "o1",
  lyDo: "dong_tien",
  trangThaiLucDat: "ung_ho",
  pnlPct: 5.8,
  pnlVnd: 1_200_000,
  closedAt: "2026-07-01T00:00:00Z",
  chamSlKhongCat: false,
  chamTpGiuLamHut: false,
  banSomKhiLoNhe: false,
  nhoiLenhKhiLo: false,
  khauVi: "can_bang",
  mucTuTin: 3,
  cachKhoiLuong: "linh_hoat",
  khoiLuong: 1_100,
  pctVon: 19,
}

const trade2: Cap3TradeRecord = {
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
  khauVi: "can_bang",
  mucTuTin: 1,
  cachKhoiLuong: "ky_luat",
  khoiLuong: 300,
  pctVon: 10,
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("readCap3TradeLog / appendCap3TradeRecord", () => {
  it("returns an empty array when nothing has been recorded yet", () => {
    expect(readCap3TradeLog("user-1")).toEqual([])
  })

  it("appends and persists a record", () => {
    appendCap3TradeRecord("user-1", trade1)
    expect(readCap3TradeLog("user-1")).toEqual([trade1])
  })

  it("accumulates multiple distinct orders", () => {
    appendCap3TradeRecord("user-1", trade1)
    appendCap3TradeRecord("user-1", trade2)
    expect(readCap3TradeLog("user-1")).toEqual([trade1, trade2])
  })

  it("de-dupes by orderId — recording the same order twice replaces, not duplicates", () => {
    appendCap3TradeRecord("user-1", trade1)
    appendCap3TradeRecord("user-1", { ...trade1, pctVon: 20 })
    const log = readCap3TradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].pctVon).toBe(20)
  })

  it("scopes the log per user — user-2 sees nothing from user-1", () => {
    appendCap3TradeRecord("user-1", trade1)
    expect(readCap3TradeLog("user-2")).toEqual([])
  })

  it("keeps the quản lý vốn fields verbatim (khối ⑦/⑧ đọc từ đây)", () => {
    appendCap3TradeRecord("user-1", trade1)
    const [rec] = readCap3TradeLog("user-1")
    expect(rec.mucTuTin).toBe(3)
    expect(rec.cachKhoiLuong).toBe("linh_hoat")
    expect(rec.khoiLuong).toBe(1_100)
    expect(rec.pctVon).toBe(19)
    expect(rec.khauVi).toBe("can_bang")
  })

  it("keeps the inherited Cấp 1/2 fields (lý do + 4 cờ vi phạm) so Cấp 2's blocks still compute", () => {
    appendCap3TradeRecord("user-1", trade2)
    const [rec] = readCap3TradeLog("user-1")
    expect(rec.lyDo).toBe("ky_thuat")
    expect(rec.chamSlKhongCat).toBe(true)
  })

  it("uses a Cấp-3-only storage key (does not read/write Cấp 2's log)", () => {
    appendCap3TradeRecord("user-1", trade1)
    expect(window.localStorage.getItem("iqx_cap3_trades_user-1")).not.toBeNull()
    expect(window.localStorage.getItem("iqx_cap2_trades_user-1")).toBeNull()
  })

  it("degrades to an empty list when stored JSON is not an array", () => {
    window.localStorage.setItem("iqx_cap3_trades_user-1", '{"nope":1}')
    expect(readCap3TradeLog("user-1")).toEqual([])
  })
})

describe("useCap3TradeLog", () => {
  it("reads the current user's trade log on mount", () => {
    appendCap3TradeRecord("user-1", trade1)
    const { result } = renderHook(() => useCap3TradeLog())
    expect(result.current.trades).toEqual([trade1])
  })

  it("record() appends and updates the hook's returned trades", () => {
    const { result } = renderHook(() => useCap3TradeLog())
    expect(result.current.trades).toEqual([])
    act(() => result.current.record(trade2))
    expect(result.current.trades).toEqual([trade2])
    expect(readCap3TradeLog("user-1")).toEqual([trade2])
  })

  it("record() twice with the same orderId keeps one entry", () => {
    const { result } = renderHook(() => useCap3TradeLog())
    act(() => result.current.record(trade1))
    act(() => result.current.record({ ...trade1, pnlPct: 7 }))
    expect(result.current.trades).toHaveLength(1)
    expect(result.current.trades[0].pnlPct).toBe(7)
  })
})

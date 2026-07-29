import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import {
  appendCap2ScoreRecord,
  appendCap2TradeRecord,
  readCap2ScoreLog,
  readCap2TradeLog,
  useCap2TradeLog,
} from "./tradeLogCap2"
import type { Cap2DailyScoreRecord, Cap2TradeRecord } from "./portfolioAnalysisCap2"

const trade1: Cap2TradeRecord = {
  orderId: "o1",
  lyDo: "dong_tien",
  trangThaiLucDat: "ung_ho",
  pnlPct: 5,
  pnlVnd: 100_000,
  closedAt: "2026-07-01T00:00:00Z",
  chamSlKhongCat: false,
  chamTpGiuLamHut: false,
  banSomKhiLoNhe: false,
  nhoiLenhKhiLo: false,
}
const trade2: Cap2TradeRecord = {
  orderId: "o2",
  lyDo: "ky_thuat",
  trangThaiLucDat: "trung_tinh",
  pnlPct: -3,
  pnlVnd: -50_000,
  closedAt: "2026-07-02T00:00:00Z",
  chamSlKhongCat: true,
  chamTpGiuLamHut: false,
  banSomKhiLoNhe: false,
  nhoiLenhKhiLo: false,
  ghiChuNhinLai: "sợ mất lãi nên bán",
}

const score1: Cap2DailyScoreRecord = { ngay: "2026-07-01", diem: 90, xepLoai: "xanh" }
const score2: Cap2DailyScoreRecord = { ngay: "2026-07-02", diem: 60, xepLoai: "do" }

beforeEach(() => {
  window.localStorage.clear()
})

describe("readCap2TradeLog / appendCap2TradeRecord", () => {
  it("returns an empty array when nothing has been recorded yet", () => {
    expect(readCap2TradeLog("user-1")).toEqual([])
  })

  it("appends and persists a record", () => {
    appendCap2TradeRecord("user-1", trade1)
    expect(readCap2TradeLog("user-1")).toEqual([trade1])
  })

  it("accumulates multiple distinct orders", () => {
    appendCap2TradeRecord("user-1", trade1)
    appendCap2TradeRecord("user-1", trade2)
    expect(readCap2TradeLog("user-1")).toEqual([trade1, trade2])
  })

  it("de-dupes by orderId — recording the same order twice replaces, not duplicates", () => {
    appendCap2TradeRecord("user-1", trade1)
    appendCap2TradeRecord("user-1", { ...trade1, pnlPct: 6 })
    const log = readCap2TradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].pnlPct).toBe(6)
  })

  it("scopes the log per user — user-2 sees nothing from user-1", () => {
    appendCap2TradeRecord("user-1", trade1)
    expect(readCap2TradeLog("user-2")).toEqual([])
  })

  it("keeps the vi phạm flags and ghi chú nhìn lại verbatim", () => {
    appendCap2TradeRecord("user-1", trade2)
    const log = readCap2TradeLog("user-1")
    expect(log[0].chamSlKhongCat).toBe(true)
    expect(log[0].ghiChuNhinLai).toBe("sợ mất lãi nên bán")
  })
})

describe("readCap2ScoreLog / appendCap2ScoreRecord", () => {
  it("returns an empty array when nothing has been recorded yet", () => {
    expect(readCap2ScoreLog("user-1")).toEqual([])
  })

  it("appends and persists a score", () => {
    appendCap2ScoreRecord("user-1", score1)
    expect(readCap2ScoreLog("user-1")).toEqual([score1])
  })

  it("accumulates multiple distinct ngày", () => {
    appendCap2ScoreRecord("user-1", score1)
    appendCap2ScoreRecord("user-1", score2)
    expect(readCap2ScoreLog("user-1")).toEqual([score1, score2])
  })

  it("de-dupes by ngày — recording the same day twice replaces (score updates through the day)", () => {
    appendCap2ScoreRecord("user-1", score1)
    appendCap2ScoreRecord("user-1", { ...score1, diem: 72, xepLoai: "vang" })
    const log = readCap2ScoreLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].diem).toBe(72)
    expect(log[0].xepLoai).toBe("vang")
  })

  it("scopes the log per user", () => {
    appendCap2ScoreRecord("user-1", score1)
    expect(readCap2ScoreLog("user-2")).toEqual([])
  })
})

describe("useCap2TradeLog", () => {
  it("reads the current user's trade + score log on mount", () => {
    appendCap2TradeRecord("user-1", trade1)
    appendCap2ScoreRecord("user-1", score1)
    const { result } = renderHook(() => useCap2TradeLog())
    expect(result.current.trades).toEqual([trade1])
    expect(result.current.scores).toEqual([score1])
  })

  it("record() appends and updates the hook's returned trades", () => {
    const { result } = renderHook(() => useCap2TradeLog())
    expect(result.current.trades).toEqual([])
    act(() => result.current.record(trade2))
    expect(result.current.trades).toEqual([trade2])
    expect(readCap2TradeLog("user-1")).toEqual([trade2])
  })

  it("recordScore() appends and updates the hook's returned scores", () => {
    const { result } = renderHook(() => useCap2TradeLog())
    expect(result.current.scores).toEqual([])
    act(() => result.current.recordScore(score2))
    expect(result.current.scores).toEqual([score2])
    expect(readCap2ScoreLog("user-1")).toEqual([score2])
  })
})

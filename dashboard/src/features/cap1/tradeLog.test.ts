import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import { appendTradeRecord, readTradeLog, useCap1TradeLog, type Cap1TradeRecord } from "./tradeLog"

const rec1: Cap1TradeRecord = {
  orderId: "o1",
  lyDo: "dong_tien",
  trangThaiLucDat: "ung_ho",
  pnlPct: 5,
  pnlVnd: 100_000,
  closedAt: "2026-07-01T00:00:00Z",
}
const rec2: Cap1TradeRecord = {
  orderId: "o2",
  lyDo: "ky_thuat",
  trangThaiLucDat: "trung_tinh",
  pnlPct: -3,
  pnlVnd: -50_000,
  closedAt: "2026-07-02T00:00:00Z",
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("readTradeLog / appendTradeRecord", () => {
  it("returns an empty array when nothing has been recorded yet", () => {
    expect(readTradeLog("user-1")).toEqual([])
  })

  it("appends and persists a record", () => {
    appendTradeRecord("user-1", rec1)
    expect(readTradeLog("user-1")).toEqual([rec1])
  })

  it("accumulates multiple distinct orders", () => {
    appendTradeRecord("user-1", rec1)
    appendTradeRecord("user-1", rec2)
    expect(readTradeLog("user-1")).toEqual([rec1, rec2])
  })

  it("de-dupes by orderId — recording the same order twice replaces, not duplicates", () => {
    appendTradeRecord("user-1", rec1)
    appendTradeRecord("user-1", { ...rec1, cam_xuc: undefined, pnlPct: 6 } as Cap1TradeRecord)
    const log = readTradeLog("user-1")
    expect(log).toHaveLength(1)
    expect(log[0].pnlPct).toBe(6)
  })

  it("scopes the log per user — user-2 sees nothing from user-1", () => {
    appendTradeRecord("user-1", rec1)
    expect(readTradeLog("user-2")).toEqual([])
  })
})

describe("useCap1TradeLog", () => {
  it("reads the current user's trade log on mount", () => {
    appendTradeRecord("user-1", rec1)
    const { result } = renderHook(() => useCap1TradeLog())
    expect(result.current.trades).toEqual([rec1])
  })

  it("record() appends and updates the hook's returned trades", () => {
    const { result } = renderHook(() => useCap1TradeLog())
    expect(result.current.trades).toEqual([])
    act(() => result.current.record(rec2))
    expect(result.current.trades).toEqual([rec2])
    expect(readTradeLog("user-1")).toEqual([rec2])
  })
})

import { describe, expect, it } from "vitest"
import { findRetroDebrief, type RetroDebriefOrder } from "./retroDebrief"

/**
 * Fixture builder for a `VTOrder`-shaped row (only the fields
 * `findRetroDebrief` actually reads — see `RetroDebriefOrder`).
 */
function ord(o: Partial<RetroDebriefOrder> = {}): RetroDebriefOrder {
  return {
    symbol: "VNM",
    side: "BUY",
    quantity: 100,
    price: 61800,
    status: "FILLED",
    createdAt: "2026-07-21T02:00:00Z",
    ...o,
  }
}

const BUY = ord({ side: "BUY", price: 61800, createdAt: "2026-07-21T02:00:00Z" })
const SELL = ord({ side: "SELL", price: 63000, createdAt: "2026-07-21T06:00:00Z" })

describe("findRetroDebrief — no closed round trip → null", () => {
  it("returns null for undefined / null / empty history", () => {
    expect(findRetroDebrief(undefined)).toBeNull()
    expect(findRetroDebrief(null)).toBeNull()
    expect(findRetroDebrief([])).toBeNull()
  })

  it("returns null when the user has only ever BOUGHT (no sell = no round trip closed)", () => {
    expect(findRetroDebrief([BUY, ord({ symbol: "HPG", price: 30000 })])).toBeNull()
  })

  it("returns null when the only SELL is not FILLED (pending / cancelled / rejected)", () => {
    for (const status of ["PENDING", "CANCELLED", "REJECTED", "EXPIRED"]) {
      expect(findRetroDebrief([BUY, ord({ ...SELL, status })])).toBeNull()
    }
  })

  it("returns null when a FILLED sell has no matching FILLED buy for the SAME symbol", () => {
    // Bought VNM, sold HPG — nothing to reconcile the HPG exit against, and we
    // must NOT invent an entry price (that would fabricate a 0% P&L).
    expect(findRetroDebrief([BUY, ord({ ...SELL, symbol: "HPG" })])).toBeNull()
  })

  it("returns null when the only same-symbol buy is NOT filled", () => {
    expect(findRetroDebrief([ord({ ...BUY, status: "PENDING" }), SELL])).toBeNull()
  })

  it("returns null when the only same-symbol buy happened AFTER the sell", () => {
    // Mirrors the backend's `created_at <= sell.created_at` constraint
    // (`Cap1Service._find_matching_buy`) — a later buy is a different, still
    // open position, not this sell's entry.
    expect(
      findRetroDebrief([ord({ ...BUY, createdAt: "2026-07-21T08:00:00Z" }), SELL]),
    ).toBeNull()
  })
})

describe("findRetroDebrief — a closed round trip", () => {
  it("reconciles the most recent FILLED sell against its matching FILLED buy", () => {
    const result = findRetroDebrief([SELL, BUY])
    expect(result).toEqual({
      n: 1,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 61800,
      exitPrice: 63000,
    })
  })

  // ★ v3.0 removed cắt lỗ/chốt lời from Cấp 0 entirely, so a Kết sổ carries no
  // threshold fields at all — live or reconstructed. This used to be a
  // "reconstruction can't know them" caveat; now it is a level-wide invariant.
  it("★ carries NO sl/tp keys — Cấp 0 has no cắt lỗ/chốt lời to carry", () => {
    const result = findRetroDebrief([SELL, BUY])
    expect(result).not.toBeNull()
    expect(Object.keys(result!).sort()).toEqual([
      "entryPrice",
      "exitPrice",
      "n",
      "quantity",
      "symbol",
    ])
  })

  it("uses the MOST RECENT filled sell, and numbers it #N by how many filled sells exist", () => {
    const orders: RetroDebriefOrder[] = [
      ord({ side: "SELL", price: 70000, createdAt: "2026-07-24T06:00:00Z" }), // 2nd sell
      ord({ side: "BUY", price: 65000, createdAt: "2026-07-24T02:00:00Z" }), // its buy
      ord({ side: "SELL", price: 63000, createdAt: "2026-07-21T06:00:00Z" }), // 1st sell
      ord({ side: "BUY", price: 61800, createdAt: "2026-07-21T02:00:00Z" }),
    ]
    expect(findRetroDebrief(orders)).toEqual({
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 65000,
      exitPrice: 70000,
    })
  })

  it("picks the LATEST same-symbol buy at/before the sell (single-lot approximation, same as the backend)", () => {
    const orders: RetroDebriefOrder[] = [
      SELL,
      ord({ side: "BUY", price: 62500, createdAt: "2026-07-21T05:00:00Z" }), // nearest before the sell
      ord({ side: "BUY", price: 61800, createdAt: "2026-07-21T02:00:00Z" }), // older
    ]
    expect(findRetroDebrief(orders)?.entryPrice).toBe(62500)
  })

  it("does not let ANOTHER symbol's buy become the entry price", () => {
    const orders: RetroDebriefOrder[] = [
      SELL,
      ord({ symbol: "HPG", side: "BUY", price: 30000, createdAt: "2026-07-21T05:00:00Z" }),
      BUY,
    ]
    expect(findRetroDebrief(orders)?.entryPrice).toBe(61800)
  })

  it("does not count non-FILLED sells toward #N", () => {
    const orders: RetroDebriefOrder[] = [
      ord({ side: "SELL", status: "CANCELLED", createdAt: "2026-07-25T06:00:00Z" }),
      SELL,
      BUY,
    ]
    expect(findRetroDebrief(orders)?.n).toBe(1)
  })

  it("does not depend on the input being pre-sorted (backend returns desc, but do not trust it)", () => {
    // Deliberately ASCENDING order — the newest sell is now LAST.
    const orders: RetroDebriefOrder[] = [
      ord({ side: "BUY", price: 61800, createdAt: "2026-07-21T02:00:00Z" }),
      ord({ side: "SELL", price: 63000, createdAt: "2026-07-21T06:00:00Z" }),
      ord({ side: "BUY", price: 65000, createdAt: "2026-07-24T02:00:00Z" }),
      ord({ side: "SELL", price: 70000, createdAt: "2026-07-24T06:00:00Z" }),
    ]
    expect(findRetroDebrief(orders)).toEqual({
      n: 2,
      symbol: "VNM",
      quantity: 100,
      entryPrice: 65000,
      exitPrice: 70000,
    })
  })

  it("matches symbols case-insensitively and reports the sell's own quantity", () => {
    const orders: RetroDebriefOrder[] = [
      ord({ symbol: "vnm", side: "SELL", quantity: 50, price: 63000, createdAt: "2026-07-21T06:00:00Z" }),
      ord({ symbol: "VNM", side: "BUY", quantity: 100, price: 61800 }),
    ]
    const result = findRetroDebrief(orders)
    expect(result?.entryPrice).toBe(61800)
    expect(result?.quantity).toBe(50)
  })

  it("tolerates lowercase status/side strings off the wire", () => {
    const orders: RetroDebriefOrder[] = [
      ord({ side: "sell" as "SELL", status: "filled", price: 63000, createdAt: "2026-07-21T06:00:00Z" }),
      ord({ side: "buy" as "BUY", status: "filled", price: 61800 }),
    ]
    expect(findRetroDebrief(orders)?.entryPrice).toBe(61800)
  })
})

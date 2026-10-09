import { describe, expect, it } from "vitest"

import type { CatalogEntry, ShopState } from "./shop-api"
import {
  deriveCardState,
  formatLedgerTime,
  formatSignedXu,
  formatXu,
  hasVerifiedAsset,
  ledgerRowLabel,
  newIdempotencyKey,
  ownedEntries,
  storeEntries,
} from "./shop-model"
import { ledgerItem, createShopBackend } from "./shop-test-support"

async function shop(options: Parameters<typeof createShopBackend>[0]): Promise<ShopState> {
  return (await createShopBackend(options).handle("/shop")) as ShopState
}

function entry(state: ShopState, id: string): CatalogEntry {
  const found = state.catalog.find((item) => item.mascot_id === id)
  if (!found) throw new Error(`no ${id}`)
  return found
}

describe("card state matrix (Shop spec 3.2)", () => {
  it.each([
    [499, "short"],
    [500, "buy"],
    [501, "buy"],
    [0, "short"],
  ])("a mascot that is not owned with %i xu is %s", async (balance, expected) => {
    const state = await shop({ balance })
    expect(deriveCardState(entry(state, "thanh_long"), state)).toBe(expected)
  })

  it("owned but not selected is Sử dụng, selected is Đang sử dụng, whatever the balance", async () => {
    const state = await shop({ balance: 0, owned: ["bach_ho", "thanh_long"], active: "bach_ho" })
    expect(deriveCardState(entry(state, "thanh_long"), state)).toBe("owned")
    expect(deriveCardState(entry(state, "bach_ho"), state)).toBe("active")
    const switched = await shop({ balance: 0, owned: ["bach_ho", "thanh_long"], active: "thanh_long" })
    expect(deriveCardState(entry(switched, "thanh_long"), switched)).toBe("active")
    expect(deriveCardState(entry(switched, "bach_ho"), switched)).toBe("owned")
  })

  it("Bạch Hổ is never for sale: not in the store tab, always in the owned tab", async () => {
    const state = await shop({ balance: 9_999 })
    expect(storeEntries(state).map((item) => item.mascot_id)).toEqual(["thanh_long", "loc_huou", "phung_hoang", "kim_quy"])
    expect(ownedEntries(state).map((item) => item.mascot_id)).toEqual(["bach_ho"])
    expect(entry(state, "bach_ho").price_xu).toBe(0)
  })

  it("keeps bought mascots in the store tab and lists them in the owned tab in catalog order", async () => {
    const state = await shop({ owned: ["bach_ho", "kim_quy", "thanh_long"] })
    expect(storeEntries(state)).toHaveLength(4)
    expect(ownedEntries(state).map((item) => item.mascot_id)).toEqual(["bach_ho", "thanh_long", "kim_quy"])
  })

  it("never opens buy or use for a mascot whose asset mapping does not match the renderer", async () => {
    const state = await shop({ balance: 5_000, owned: ["bach_ho", "thanh_long"] })
    const broken = { ...entry(state, "kim_quy"), asset_root: "/assets/mascots-2d/v2/other" }
    const brokenOwned = { ...entry(state, "thanh_long"), asset_root: "/assets/mascots-2d/v2/nope" }
    expect(hasVerifiedAsset(broken)).toBe(false)
    expect(deriveCardState(broken, state)).toBe("unavailable")
    expect(deriveCardState(brokenOwned, state)).toBe("unavailable")
    expect(hasVerifiedAsset(entry(state, "phung_hoang"))).toBe(true)
  })
})

describe("formatting", () => {
  it("formats xu as integers with vi-VN grouping and signs deltas with real minus", () => {
    expect(formatXu(7_100)).toBe("7.100")
    expect(formatSignedXu(100)).toBe("+100")
    expect(formatSignedXu(-500)).toBe("−500")
    expect(formatSignedXu(0)).toBe("0")
  })

  it("shows ledger times in the IQX time zone, not the browser's", () => {
    expect(formatLedgerTime("2026-10-07T18:30:00.000Z")).toEqual({ date: "8/10/2026", time: "01:30" })
    expect(formatLedgerTime("not a date")).toEqual({ date: "—", time: "" })
  })
})

describe("ledger labels", () => {
  const names = new Map([["ch01-l01", "RSI"], ["technical:rsi", "RSI"]])

  it("names the lesson for a reward and the mascot for a purchase", () => {
    expect(ledgerRowLabel(ledgerItem(1, { label: { lesson_key: "technical:rsi", lesson_id: "ch01-l01", mascot_id: null, mascot_name: null } }), names)).toEqual({ title: "Hoàn thành bài RSI", detail: null })
    expect(ledgerRowLabel(ledgerItem(2, { kind: "mascot_purchase", delta: -500, label: { lesson_key: null, lesson_id: null, mascot_id: "thanh_long", mascot_name: "Thanh Long" } }), names)).toEqual({ title: "Mua Thanh Long", detail: null })
    expect(ledgerRowLabel(ledgerItem(3, { kind: "mascot_purchase", delta: -500, label: { lesson_key: null, lesson_id: null, mascot_id: "kim_quy", mascot_name: null } }), undefined).title).toBe("Mua Kim Quy")
  })

  it("keeps a reward readable before the lesson names arrive", () => {
    expect(ledgerRowLabel(ledgerItem(4, { label: { lesson_key: "technical:macd", lesson_id: "ch01-l02", mascot_id: null, mascot_name: null } }), undefined)).toEqual({ title: "Hoàn thành bài học", detail: "ch01-l02" })
  })
})

describe("idempotency keys", () => {
  it("are unique and satisfy the server's key format", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(50)
    for (const key of keys) {
      expect(key).toMatch(/^[A-Za-z0-9._:-]+$/)
      expect(key.length).toBeGreaterThanOrEqual(8)
      expect(key.length).toBeLessThanOrEqual(128)
    }
  })
})

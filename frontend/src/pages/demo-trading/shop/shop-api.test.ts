import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"
import {
  classifyActivateError,
  classifyPurchaseError,
  parseLedgerPage,
  parsePurchaseResult,
  parseShopState,
  type ShopState,
} from "./shop-api"
import { apiError, createShopBackend } from "./shop-test-support"

async function validState(): Promise<ShopState> {
  return (await createShopBackend().handle("/shop")) as ShopState
}

describe("response checks", () => {
  it("accepts a real Shop state", async () => {
    const state = await validState()
    expect(parseShopState(state).wallet.balance).toBe(500)
  })

  it.each([
    ["an empty object", () => ({})],
    ["a missing wallet", (state: ShopState) => ({ ...state, wallet: undefined })],
    ["a fractional balance", (state: ShopState) => ({ ...state, wallet: { ...state.wallet, balance: 1.5 } })],
    ["a negative balance", (state: ShopState) => ({ ...state, wallet: { ...state.wallet, balance: -1 } })],
    ["a non-numeric balance", (state: ShopState) => ({ ...state, wallet: { ...state.wallet, balance: "500" } })],
    ["no owned list", (state: ShopState) => ({ ...state, owned: null })],
    ["an unnamed catalog entry", (state: ShopState) => ({ ...state, catalog: [{ ...state.catalog[0], name: "" }] })],
    ["a zero revision", (state: ShopState) => ({ ...state, active: { ...state.active, revision: 0 } })],
  ])("refuses %s instead of showing 0 xu or nothing owned", async (_label, mutate) => {
    const state = await validState()
    expect(() => parseShopState(mutate(state))).toThrow(ApiError)
  })

  it("refuses malformed ledger pages and purchase results", () => {
    expect(() => parseLedgerPage({ items: [{ id: "1" }], next_cursor: null })).toThrow(ApiError)
    expect(() => parseLedgerPage({ items: [], next_cursor: 5 })).toThrow(ApiError)
    expect(() => parsePurchaseResult({ status: "maybe" })).toThrow(ApiError)
  })
})

describe("purchase error classification", () => {
  it("reads INSUFFICIENT_XU details", () => {
    expect(classifyPurchaseError(apiError(409, "INSUFFICIENT_XU", "x", [{ balance_xu: 120, price_xu: 500, shortfall_xu: 380 }]))).toEqual({ kind: "insufficient", balance: 120, price: 500 })
  })

  it("reads PRICE_CHANGED and CATALOG_CHANGED, MASCOT_NOT_FOR_SALE and IDEMPOTENCY_KEY_REUSED", () => {
    expect(classifyPurchaseError(apiError(409, "PRICE_CHANGED", "x", [{ current_price_xu: 600 }]))).toEqual({ kind: "price_changed", currentPrice: 600 })
    expect(classifyPurchaseError(apiError(409, "CATALOG_CHANGED", "x"))).toEqual({ kind: "catalog_changed" })
    expect(classifyPurchaseError(apiError(409, "MASCOT_NOT_FOR_SALE", "x"))).toEqual({ kind: "not_for_sale" })
    expect(classifyPurchaseError(apiError(409, "IDEMPOTENCY_KEY_REUSED", "x"))).toEqual({ kind: "key_reused" })
  })

  it("treats network errors, aborts and server faults as outcome unknown, never as a failure", () => {
    expect(classifyPurchaseError(new TypeError("Failed to fetch"))).toEqual({ kind: "unknown_outcome" })
    expect(classifyPurchaseError(new DOMException("aborted", "AbortError"))).toEqual({ kind: "unknown_outcome" })
    expect(classifyPurchaseError(apiError(500, "INTERNAL_ERROR", "x"))).toEqual({ kind: "unknown_outcome" })
    expect(classifyPurchaseError(apiError(503, "SERVICE_UNAVAILABLE", "x"))).toEqual({ kind: "unknown_outcome" })
    expect(classifyPurchaseError(apiError(502, "BAD_GATEWAY", "x"))).toEqual({ kind: "unknown_outcome" })
  })

  it("keeps other refusals as the server's message", () => {
    expect(classifyPurchaseError(apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ"))).toEqual({ kind: "rejected", message: "Dữ liệu không hợp lệ" })
  })
})

describe("activation error classification", () => {
  it("separates a revision conflict from a missing ownership", () => {
    expect(classifyActivateError(apiError(409, "REVISION_CONFLICT", "x"))).toEqual({ kind: "revision_conflict" })
    expect(classifyActivateError(apiError(409, "MASCOT_NOT_OWNED", "x"))).toEqual({ kind: "not_owned" })
    expect(classifyActivateError(apiError(422, "VALIDATION_ERROR", "bad"))).toEqual({ kind: "other", message: "bad" })
    expect(classifyActivateError(new TypeError("Failed to fetch")).kind).toBe("other")
  })
})

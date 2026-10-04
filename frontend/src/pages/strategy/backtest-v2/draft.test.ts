import { describe, expect, it } from "vitest"

import {
  changedIndicators,
  draftErrors,
  draftReducer,
  hasBuyRules,
  initialDraft,
  isDirty,
  type DraftState,
} from "./draft"
import { MA, REGISTRY, RSI, sharedState } from "./test-fixtures"

function fresh(): DraftState {
  const state = sharedState()
  return initialDraft(state.saved_revision, state.config.indicators)
}

const templates = { ma: { buy: MA.buy, sell: MA.sell }, rsi: { buy: RSI.buy, sell: RSI.sell } }
const registryById = Object.fromEntries(REGISTRY.indicators.map((item) => [item.id, item]))

describe("Backtest v2 draft reducer", () => {
  it("keeps Buy and Sell independent: params and operators of one side never touch the other", () => {
    let state = fresh()
    state = draftReducer(state, { type: "param", id: "ma", side: "buy", key: "period", value: 50 })
    state = draftReducer(state, { type: "op", id: "ma", side: "buy", ruleIndex: 0, op: "<" })

    expect(state.draft.ma!.buy.params.period).toBe(50)
    expect(state.draft.ma!.buy.rules[0]!.op).toBe("<")
    expect(state.draft.ma!.sell).toEqual(state.saved.ma!.sell)

    state = draftReducer(state, { type: "param", id: "ma", side: "sell", key: "period", value: 30 })
    expect(state.draft.ma!.sell.params.period).toBe(30)
    expect(state.draft.ma!.buy.params.period).toBe(50)
    // Saved revision is untouched until the server confirms a save.
    expect(state.saved.ma!.buy.params.period).toBe(20)
  })

  it("rejects operators outside allowed_ops", () => {
    const state = draftReducer(fresh(), { type: "op", id: "ma", side: "buy", ruleIndex: 0, op: "∈" })
    expect(state.draft.ma!.buy.rules[0]!.op).toBe(">")
    expect(isDirty(state)).toBe(false)
  })

  it("Đặt lại resets only the current tab to registry defaults and keeps enabled flags", () => {
    let state = fresh()
    state = draftReducer(state, { type: "param", id: "ma", side: "buy", key: "period", value: 50 })
    state = draftReducer(state, { type: "param", id: "ma", side: "sell", key: "period", value: 30 })
    state = draftReducer(state, { type: "set_enabled", id: "ma", side: "sell", enabled: false })
    state = draftReducer(state, { type: "tab", side: "buy" })
    state = draftReducer(state, { type: "reset_tab", templates })

    expect(state.draft.ma!.buy.params.period).toBe(20)
    expect(state.draft.ma!.sell.params.period).toBe(30)
    expect(state.draft.ma!.sell.enabled).toBe(false)
    expect(state.draft.ma!.master_enabled).toBe(true)

    state = draftReducer(state, { type: "tab", side: "sell" })
    state = draftReducer(state, { type: "reset_tab", templates })
    expect(state.draft.ma!.sell.params.period).toBe(20)
  })

  it("Hủy discards the draft back to the saved revision", () => {
    let state = draftReducer(fresh(), { type: "param", id: "ma", side: "buy", key: "period", value: 50 })
    expect(isDirty(state)).toBe(true)
    state = draftReducer(state, { type: "cancel" })
    expect(isDirty(state)).toBe(false)
    expect(state.draft).toEqual(state.saved)
  })

  it("applies switch semantics: adding a side turns master ON, turning off both turns master OFF", () => {
    let state = draftReducer(fresh(), { type: "add", id: "rsi", side: "sell" })
    expect(state.draft.rsi!.master_enabled).toBe(true)
    expect(state.draft.rsi!.sell.enabled).toBe(true)

    state = draftReducer(state, { type: "set_enabled", id: "ma", side: "buy", enabled: false })
    expect(state.draft.ma!.master_enabled).toBe(true)
    state = draftReducer(state, { type: "set_enabled", id: "ma", side: "sell", enabled: false })
    expect(state.draft.ma!.master_enabled).toBe(false)
    // Children keep their params when the master goes OFF.
    expect(state.draft.ma!.buy.params.period).toBe(20)
  })

  it("param edits never flip a master that is OFF", () => {
    const state = draftReducer(fresh(), { type: "param", id: "rsi", side: "buy", key: "level", value: 25 })
    expect(state.draft.rsi!.master_enabled).toBe(false)
  })

  it("patches only changed indicators and validates field ranges", () => {
    let state = draftReducer(fresh(), { type: "param", id: "rsi", side: "buy", key: "period", value: 500 })
    expect(Object.keys(changedIndicators(state))).toEqual(["rsi"])
    expect(draftErrors(state, registryById)).toEqual({ "rsi.buy.period": "Chu kỳ RSI: 2–100." })

    state = draftReducer(state, { type: "param", id: "rsi", side: "buy", key: "period", value: 10.5 })
    expect(draftErrors(state, registryById)["rsi.buy.period"]).toBe("Chu kỳ RSI: cần là số nguyên.")
  })

  it("rebase after a 409 adopts the newer saved revision but keeps the user's edits", () => {
    let state = draftReducer(fresh(), { type: "param", id: "ma", side: "buy", key: "period", value: 50 })
    const newer = sharedState().config.indicators
    newer.rsi!.master_enabled = true
    state = draftReducer(state, { type: "rebase", revision: 4, indicators: newer })
    expect(state.revision).toBe(4)
    expect(state.draft.ma!.buy.params.period).toBe(50)
    expect(state.draft.rsi!.master_enabled).toBe(true)
    expect(Object.keys(changedIndicators(state))).toEqual(["ma"])
  })

  it("requires an active Buy side before running", () => {
    const state = fresh()
    expect(hasBuyRules(state.saved)).toBe(true)
    const off = draftReducer(state, { type: "set_enabled", id: "ma", side: "buy", enabled: false })
    expect(hasBuyRules(off.draft)).toBe(false)
  })
})

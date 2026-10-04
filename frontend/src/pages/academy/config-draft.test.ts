import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import {
  buildIndicatorConfig,
  configFieldErrors,
  createDraft,
  draftErrors,
  fieldErrorFor,
  resetDraftSide,
  savedIndicatorConfig,
} from "./config-draft"
import { RSI, sharedConfigFixture } from "./test-fixtures"

describe("academy config draft", () => {
  it("falls back to the registry template with master OFF when never saved", () => {
    const saved = savedIndicatorConfig(undefined, RSI)
    expect(saved.master_enabled).toBe(false)
    expect(saved.buy.params).toEqual({ period: 14, level: 30 })
    expect("field_overrides" in saved.buy).toBe(false)
  })

  it("Đặt lại restores only the current side's params and operators", () => {
    const saved = savedIndicatorConfig(sharedConfigFixture(), RSI)
    let draft = createDraft(saved)
    draft = { ...draft, buy: { enabled: false, params: { period: "20", level: "25" }, ops: { r1: ">", r2: "<" } }, sell: { ...draft.sell, params: { period: "9", level: "80" } } }
    const reset = resetDraftSide(draft, saved, "buy")
    expect(reset.buy).toEqual({ enabled: false, params: { period: "14", level: "30" }, ops: { r1: "<", r2: ">" } })
    expect(reset.sell.params).toEqual({ period: "9", level: "80" })
  })

  it("keeps Buy and Sell params independent and validates per-side registry bounds", () => {
    const saved = savedIndicatorConfig(sharedConfigFixture(), RSI)
    const draft = createDraft(saved)
    draft.buy.params.level = "60"
    draft.sell.params.level = "60"
    const errors = draftErrors(RSI, draft)
    expect(errors.buy.level).toContain("từ 10 đến 49")
    expect(errors.sell.level).toBeUndefined()
    draft.buy.params.period = "14.5"
    expect(draftErrors(RSI, draft).buy.period).toContain("số nguyên")
  })

  it("never flips master on param edits, turns master OFF when both sides are OFF", () => {
    const saved = savedIndicatorConfig(sharedConfigFixture(), RSI)
    const draft = createDraft(saved)
    draft.buy.params.level = "25"
    expect(buildIndicatorConfig(saved, draft, false)).toMatchObject({ master_enabled: false, buy: { params: { level: 25 } }, sell: { params: { level: 70 } } })
    const on = { ...saved, master_enabled: true }
    const bothOff = { buy: { ...draft.buy, enabled: false }, sell: { ...draft.sell, enabled: false } }
    expect(buildIndicatorConfig(on, bothOff, false).master_enabled).toBe(false)
    expect(buildIndicatorConfig(saved, draft, true).master_enabled).toBe(true)
  })

  it("applies operator changes only within allowed_ops", () => {
    const saved = savedIndicatorConfig(sharedConfigFixture(), RSI)
    const draft = createDraft(saved)
    draft.buy.ops.r1 = ">"
    draft.buy.ops.r2 = "∈"
    const built = buildIndicatorConfig(saved, draft, false)
    expect(built.buy.rules.map(rule => rule.op)).toEqual([">", ">"])
  })

  it("reads 422 validation details and maps them to side fields", () => {
    const error = new ApiError("Cấu hình không hợp lệ", 422, { code: "CONFIG_INVALID", details: [{ path: "indicators.rsi.sell.params.level", message: "Ngưỡng quá mua phải từ 51" }] })
    const errors = configFieldErrors(error)
    expect(fieldErrorFor(errors, "sell", "level")).toBe("Ngưỡng quá mua phải từ 51")
    expect(fieldErrorFor(errors, "buy", "level")).toBeNull()
  })
})

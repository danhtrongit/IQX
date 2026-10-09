import { describe, expect, it } from "vitest"

import { makeRun, makeState, rsiForm } from "./practice.fixtures"
import {
  HOLD_ERROR,
  formatRatioPercent,
  frameAt,
  operandLabel,
  parseNumberText,
  resetSide,
  ruleSideLabels,
  toConfig,
  toFormState,
  validatePracticeForm,
} from "./practice-model"

const spec = rsiForm()
const base = () => toFormState(makeState().draft)

describe("form state", () => {
  it("round-trips a config and never invents a number from half-typed text", () => {
    const form = base()
    expect(toConfig(form, spec)).toEqual(makeState().draft)
    expect(toConfig({ ...form, hold: "" }, spec)).toBeNull()
    expect(toConfig({ ...form, buy: { ...form.buy, params: { ...form.buy.params, period: "1e" } } }, spec)).toBeNull()
    expect(parseNumberText(" 12 ")).toBe(12)
    expect(parseNumberText("")).toBeNull()
  })

  it("Mặc định resets only the params and operators of the side, not enabled, hold or the other side", () => {
    const form = base()
    const edited = {
      buy: { enabled: false, params: { period: "9", level: "20" }, ops: { r1: ">" as const, r2: "<" as const } },
      sell: { enabled: true, params: { period: "7", level: "80" }, ops: { r1: "<" as const, r2: ">" as const } },
      hold: "25",
    }
    const reset = resetSide(edited, spec, "buy")
    expect(reset.buy).toEqual({ enabled: false, params: { period: "14", level: "30" }, ops: { r1: "<", r2: ">" } })
    expect(reset.sell).toEqual(edited.sell)
    expect(reset.hold).toBe("25")
    expect(form.hold).toBe("60")
  })
})

describe("validation (mirrors the server rules)", () => {
  it("accepts the registry defaults", () => {
    const result = validatePracticeForm(base(), spec)
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it.each([
    ["0", true],
    ["1.5", true],
    ["1001", true],
    ["-3", true],
    ["", true],
    ["abc", true],
    ["1", false],
    ["60", false],
    ["1000", false],
  ])("hold %j -> error %s", (hold, expectedError) => {
    const result = validatePracticeForm({ ...base(), hold }, spec)
    expect(result.holdError).toBe(expectedError ? HOLD_ERROR : null)
    expect(result.valid).toBe(!expectedError)
  })

  it("blocks a missing Buy side, an out-of-range, a non-integer and an empty parameter", () => {
    const form = base()
    expect(validatePracticeForm({ ...form, buy: { ...form.buy, enabled: false } }, spec)).toMatchObject({ valid: false, buyOff: true })
    const outOfRange = validatePracticeForm({ ...form, buy: { ...form.buy, params: { ...form.buy.params, level: "55" } } }, spec)
    expect(outOfRange.byPath["buy.params.level"]).toMatch(/10–49/)
    expect(outOfRange.sideHasIssue).toEqual({ buy: true, sell: false })
    const fractional = validatePracticeForm({ ...form, sell: { ...form.sell, params: { ...form.sell.params, period: "14.5" } } }, spec)
    expect(fractional.byPath["sell.params.period"]).toMatch(/số nguyên/)
    const empty = validatePracticeForm({ ...form, buy: { ...form.buy, params: { ...form.buy.params, period: "" } } }, spec)
    expect(empty.paramsValid).toBe(false)
  })

  it("still validates the side that is switched off (the server locks a clean config)", () => {
    const form = base()
    const result = validatePracticeForm({ ...form, sell: { ...form.sell, enabled: false, params: { ...form.sell.params, level: "10" } } }, spec)
    expect(result.valid).toBe(false)
    expect(result.byPath["sell.params.level"]).toBeDefined()
  })
})

describe("labels use the params of the side being edited", () => {
  it("relabels the rule operands as params change", () => {
    const form = base()
    const indicator = { id: "rsi", name: "RSI" }
    const buy = ruleSideLabels(spec.buy.rules[0], indicator, spec.buy.fields, { ...form.buy.params, level: "25" })
    expect(buy).toEqual({ left: "RSI phiên trước", right: "25" })
    expect(operandLabel({ kind: "series", key: "value", offset: 0 }, { id: "ma", name: "MA / SMA" }, [], { period: "20" })).toBe("SMA 20")
    expect(operandLabel({ kind: "series", key: "threshold" }, { id: "volume", name: "Khối lượng" }, [], { mult: "1.5", lookback: "20" })).toBe("1.5 × TB 20 phiên")
  })
})

describe("replay frames", () => {
  const run = makeRun({ plan: [{ buy: 20, sell: 45, reason: "indicator" }, { buy: 100, sell: 160, reason: "max_holding" }, { buy: 400 }] })
  const result = run.result!

  it("at the end it is exactly the server result", () => {
    const frame = frameAt(run, result.last_session)!
    expect(frame.complete).toBe(true)
    expect(frame.totalReturn).toBe(result.kpis.total_return)
    expect(frame.buyCount).toBe(3)
    expect(frame.rows).toHaveLength(3)
    expect(frame.rows[2]).toMatchObject({ holding: true, provisional: true })
  })

  it("mid replay shows only what has happened by then, with a provisional P/L for a held trade", () => {
    const early = frameAt(run, 30)!
    expect(early.buyCount).toBe(1)
    expect(early.rows).toHaveLength(1)
    expect(early.rows[0]).toMatchObject({ holding: true, provisional: true, heldSessions: 10 })
    const afterFirstSell = frameAt(run, 50)!
    expect(afterFirstSell.rows[0]).toMatchObject({ holding: false, sellSession: 45, provisional: false })
    expect(afterFirstSell.closedCount).toBe(1)
    const mid = frameAt(run, 120)!
    expect(mid.buyCount).toBe(2)
    expect(mid.rows.map((row) => row.trade.ordinal)).toEqual([1, 2])
    expect(mid.totalReturn).toBeCloseTo(result.nav[119] / 100_000_000 - 1, 10)
  })

  it("a missing final valuation is not a fake 0%", () => {
    const missing = makeRun({ valuation: "missing" })
    const frame = frameAt(missing, missing.result!.last_session)!
    expect(frame.totalReturn).toBeNull()
    expect(formatRatioPercent(frame.totalReturn)).toBe("—")
    expect(formatRatioPercent(0)).toBe("0,00%")
  })
})

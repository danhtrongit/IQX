import { describe, expect, it } from "vitest"

import { legacyParamMeta, legacyRuleLabel } from "./practice-legacy"
import {
  FORMAT_ERROR,
  HOLD_ERROR,
  configSignature,
  configSummary,
  formatRatioPercent,
  frameAt,
  isLegacyFor,
  legacySideEntries,
  operandLabel,
  parseNumberText,
  previewBodyOf,
  resetSide,
  ruleSideLabels,
  toConfig,
  toFormState,
  validatePracticeForm,
  type PracticeFormState,
} from "./practice-model"
import { legacyRsiConfig, makeChart, makeLegacyRun, makeRun, rowsConfig, rowsForm, volumeConfig, volumeForm } from "./practice.fixtures"

const rsi = rowsForm("rsi")
const volume = volumeForm()
const rsiForm = (): PracticeFormState => toFormState(rsi.defaults, rsi)
const setRow = (form: PracticeFormState, side: "buy" | "sell", index: number, values: Record<string, string>, enabled?: boolean): PracticeFormState => {
  const row = form[side].rows[index]!
  return {
    ...form,
    [side]: { ...form[side], rows: form[side].rows.map((item, at) => (at === index ? { ...row, enabled: enabled ?? row.enabled, values: { ...row.values, ...values } } : item)) },
  }
}

describe("form state of a row-based indicator", () => {
  it("lays the rows out in registry order, as text, and round-trips to the stored config", () => {
    const form = rsiForm()
    expect(form.model).toBe("rows")
    expect(form.buy.rows.map((row) => row.id)).toEqual(["rsi.level", "rsi.trend"])
    expect(form.buy.rows[0]).toEqual({ id: "rsi.level", enabled: true, values: { period: "14", op: "<", threshold: "30" } })
    expect(form.sell.rows[0]).toEqual({ id: "rsi.level", enabled: true, values: { period: "14", op: ">", threshold: "70" } })
    expect(toConfig(form, rsi)).toEqual(rsi.defaults)
  })

  it("a row the stored config lacks reads as an empty row that is off; a row out of order is placed by id", () => {
    const config = rowsConfig("rsi")
    config.buy.rules = [config.buy.rules[1]!]
    const form = toFormState(config, rsi)
    expect(form.buy.rows).toHaveLength(2)
    expect(form.buy.rows[0]).toEqual({ id: "rsi.level", enabled: false, values: {} })
    expect(form.buy.rows[1]!.id).toBe("rsi.trend")
    expect(toConfig(form, rsi)).toBeNull()
  })

  it("never invents a number from half-typed text and keeps what was typed verbatim", () => {
    const form = rsiForm()
    expect(toConfig({ ...form, hold: "" }, rsi)).toBeNull()
    expect(toConfig(setRow(form, "buy", 0, { period: "1e" }), rsi)).toBeNull()
    expect(toConfig(setRow(form, "sell", 1, { period: "" }), rsi)).toBeNull()
    expect(toConfig(setRow(form, "buy", 0, { period: "9" }), rsi)?.buy).toMatchObject({ rules: [{ id: "rsi.level", period: 9, op: "<", threshold: 30 }, { id: "rsi.trend", period: 14 }] })
    expect(parseNumberText(" 12 ")).toBe(12)
    expect(parseNumberText("")).toBeNull()
  })

  it.each([
    ["cmf", "cmf.cross", "threshold", "-0.05", -0.05],
    ["cci", "cci.cross", "threshold", "-100", -100],
    ["williams_r", "williams_r.cross", "threshold", "-80", -80],
    ["roc", "roc.cross", "threshold", "-2.5", -2.5],
  ])("%s keeps a negative or decimal %s as typed", (id, rowId, field, typed, stored) => {
    const spec = rowsForm(id)
    const form = setRow(toFormState(spec.defaults, spec), "buy", 0, { [field]: typed })
    expect(form.buy.rows[0]!.values[field]).toBe(typed)
    expect(toConfig(form, spec)?.buy).toMatchObject({ rules: [{ id: rowId, [field]: stored }] })
    expect(validatePracticeForm(form, spec).valid).toBe(true)
  })

  it("an edit to one row never touches another row or the other tab", () => {
    const form = rsiForm()
    const edited = setRow(form, "buy", 1, { period: "9" })
    expect(edited.buy.rows[0]).toEqual(form.buy.rows[0])
    expect(edited.buy.rows[1]!.values.period).toBe("9")
    expect(edited.sell).toEqual(form.sell)
    expect(edited.hold).toBe(form.hold)
  })

  it("configSignature ignores key order and tells rows apart", () => {
    const config = rowsConfig("rsi")
    const reordered = structuredClone(config)
    reordered.buy.rules[0] = { threshold: 30, op: "<", period: 14, enabled: true, id: "rsi.level" }
    expect(configSignature(reordered)).toBe(configSignature(config))
    reordered.buy.rules[1] = { ...reordered.buy.rules[1]!, period: 9 }
    expect(configSignature(reordered)).not.toBe(configSignature(config))
  })
})

describe("Mặc định", () => {
  it("resets the rows of the side only: not its switch, the other tab nor the hold time", () => {
    let form = rsiForm()
    form = setRow(form, "buy", 0, { period: "9", threshold: "20" }, false)
    form = setRow(form, "sell", 0, { threshold: "80" })
    form = { ...form, hold: "25", buy: { ...form.buy, enabled: false } }
    const reset = resetSide(form, rsi, "buy")
    expect(reset.buy.rows).toEqual(rsiForm().buy.rows)
    expect(reset.buy.enabled).toBe(false)
    expect(reset.sell).toEqual(form.sell)
    expect(reset.hold).toBe("25")
  })

  it("Volume goes back to its params and operators", () => {
    const form = toFormState(volume.defaults, volume)
    const edited: PracticeFormState = { ...form, buy: { ...form.buy, params: { lookback: "40", mult: "2" }, ops: { r1: "<", r2: "<" } } }
    expect(resetSide(edited, volume, "buy").buy).toEqual(form.buy)
  })

  it("does nothing to a run locked in the other format", () => {
    const legacy = toFormState(legacyRsiConfig(), rsi)
    expect(resetSide(legacy, rsi, "buy")).toBe(legacy)
  })
})

describe("validation (mirrors the server rules)", () => {
  it("accepts the registry defaults", () => {
    const result = validatePracticeForm(rsiForm(), rsi)
    expect(result.valid).toBe(true)
    expect(result.previewReady).toBe(true)
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
    const result = validatePracticeForm({ ...rsiForm(), hold }, rsi)
    expect(result.holdError).toBe(expectedError ? HOLD_ERROR : null)
    expect(result.valid).toBe(!expectedError)
  })

  it("names the row and the field in the server's words and flags the tab", () => {
    const form = setRow(rsiForm(), "buy", 1, { period: "1" })
    const result = validatePracticeForm(form, rsi)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([
      { path: "buy.rules.1.period", side: "buy", row: 2, field: "period", message: "Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên." },
    ])
    expect(result.byPath["buy.rules.1.period"]).toBe("Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
    expect(result.sideHasIssue).toEqual({ buy: true, sell: false })
  })

  it("an empty or fractional value is refused, never rounded", () => {
    expect(validatePracticeForm(setRow(rsiForm(), "buy", 0, { period: "" }), rsi).issues[0]).toMatchObject({ row: 1, field: "period" })
    expect(validatePracticeForm(setRow(rsiForm(), "sell", 0, { threshold: "70.5" }), rsi).issues[0]).toMatchObject({
      side: "sell",
      row: 1,
      field: "threshold",
      message: "Bán · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên.",
    })
  })

  it("checks a row that is off and a tab that is off, like the server (a locked config is always clean)", () => {
    const off = setRow(rsiForm(), "sell", 1, { period: "500" }, false)
    const result = validatePracticeForm({ ...off, sell: { ...off.sell, enabled: false } }, rsi)
    expect(result.valid).toBe(false)
    expect(result.byPath["sell.rules.1.period"]).toBeDefined()
    // ...but it never blocks the chart: the chart draws the rows that are ON only.
    expect(result.previewReady).toBe(true)
  })

  it("a row that is ON and invalid also blocks the chart", () => {
    const result = validatePracticeForm(setRow(rsiForm(), "buy", 0, { threshold: "101" }), rsi)
    expect(result.previewReady).toBe(false)
  })

  it("a fast >= slow pair is reported on the fast field", () => {
    const spec = rowsForm("ma_cross")
    const form = toFormState(spec.defaults, spec)
    const result = validatePracticeForm(setRow(form, "buy", 0, { fast: "100", slow: "50" }), spec)
    expect(result.issues[0]).toMatchObject({ row: 1, field: "fast", message: "Mua · dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm." })
  })

  it("needs the Buy tab on to start, and says so", () => {
    const form = rsiForm()
    const result = validatePracticeForm({ ...form, buy: { ...form.buy, enabled: false } }, rsi)
    expect(result).toMatchObject({ valid: false, buyOff: true })
    expect(result.byPath["buy.enabled"]).toBe("Bật điều kiện Mua để bắt đầu.")
    expect(result.sideHasIssue.buy).toBe(false)
  })

  it("Volume keeps its field domains and cross-field rules", () => {
    const form = toFormState(volume.defaults, volume)
    expect(validatePracticeForm(form, volume)).toMatchObject({ valid: true, previewReady: true })
    const outOfRange = validatePracticeForm({ ...form, buy: { ...form.buy, params: { ...form.buy.params, mult: "5" } } }, volume)
    expect(outOfRange.byPath["buy.params.mult"]).toMatch(/0,5–3/)
    expect(outOfRange.sideHasIssue).toEqual({ buy: true, sell: false })
    expect(outOfRange.previewReady).toBe(false)
    const fractional = validatePracticeForm({ ...form, sell: { ...form.sell, params: { ...form.sell.params, lookback: "14.5" } } }, volume)
    expect(fractional.byPath["sell.params.lookback"]).toMatch(/số nguyên/)
    const empty = validatePracticeForm({ ...form, buy: { ...form.buy, params: { ...form.buy.params, lookback: "" } } }, volume)
    expect(empty.previewReady).toBe(false)
    const off = validatePracticeForm({ ...form, sell: { ...form.sell, enabled: false, params: { ...form.sell.params, mult: "9" } } }, volume)
    expect(off.valid).toBe(false)
  })

  it("a run locked in the other format is shown, never started again", () => {
    const form = toFormState(legacyRsiConfig(), rsi)
    expect(form.model).toBe("params")
    const result = validatePracticeForm(form, rsi)
    expect(result.valid).toBe(false)
    expect(result.previewReady).toBe(false)
    expect(result.byPath.format).toBe(FORMAT_ERROR)
    expect(toConfig(form, rsi)).toBeNull()
    expect(previewBodyOf(form, rsi)).toBeNull()
  })
})

describe("chart preview body", () => {
  it("sends every row of both tabs in registry order, as the stored rows", () => {
    expect(previewBodyOf(rsiForm(), rsi)).toEqual({ buy_rows: rsi.defaults.buy.rules, sell_rows: rsi.defaults.sell.rules })
  })

  it("a half-edited row that is OFF is sent with its registry default instead of blocking the chart", () => {
    const form = setRow(rsiForm(), "buy", 1, { period: "" }, false)
    const body = previewBodyOf(form, rsi)
    expect(body?.buy_rows?.[1]).toEqual({ id: "rsi.trend", enabled: false, period: 14, dir: "up" })
    expect(body?.buy_rows?.[0]).toEqual(rsi.defaults.buy.rules[0])
  })

  it("a half-edited row that is ON blocks it (nothing is guessed)", () => {
    expect(previewBodyOf(setRow(rsiForm(), "buy", 1, { period: "" }), rsi)).toBeNull()
  })

  it("Volume sends its side params", () => {
    expect(previewBodyOf(toFormState(volume.defaults, volume), volume)).toEqual({
      buy_params: { lookback: 20, mult: 1 },
      sell_params: { lookback: 20, mult: 1 },
    })
    const form = toFormState(volume.defaults, volume)
    expect(previewBodyOf({ ...form, buy: { ...form.buy, params: { lookback: "", mult: "1" } } }, volume)).toBeNull()
  })
})

describe("Volume form (params)", () => {
  const form = toFormState(volumeConfig(), volume)

  it("round-trips its params and operators", () => {
    expect(form.model).toBe("params")
    expect(form.buy.rows).toEqual([])
    expect(toConfig(form, volume)).toEqual(volume.defaults)
    expect(toConfig({ ...form, buy: { ...form.buy, params: { ...form.buy.params, mult: "1e" } } }, volume)).toBeNull()
  })

  it("relabels the rule operands as params change", () => {
    const labels = ruleSideLabels(volume.buy.rules[1]!, { id: "volume", name: "Khối lượng" }, volume.buy.fields, { ...form.buy.params, mult: "1.5" })
    expect(labels).toEqual({ left: "Khối lượng", right: "1.5 × TB 20 phiên" })
    expect(operandLabel({ kind: "series", key: "close", offset: -1 }, { id: "volume", name: "Khối lượng" }, [], {})).toBe("Giá đóng cửa phiên trước")
  })
})

describe("summaries and labels", () => {
  it("a row config reads as its sentences, ANDed", () => {
    expect(configSummary(rsi.defaults, rsi)).toBe("Mua: RSI 14 < 30 và RSI 14 xu hướng lên | Bán: RSI 14 > 70 và RSI 14 xu hướng xuống")
  })

  it("only the rows that are ON are listed; a tab that is off or without rows says so", () => {
    const config = rowsConfig("rsi", (value) => {
      value.buy.rules[1] = { ...value.buy.rules[1]!, enabled: false }
      value.sell.enabled = false
    })
    expect(configSummary(config, rsi)).toBe("Mua: RSI 14 < 30 | Bán: Tắt")
    const none = rowsConfig("rsi", (value) => {
      value.buy.rules = value.buy.rules.map((row) => ({ ...row, enabled: false }))
    })
    expect(configSummary(none, rsi)).toContain("Mua: Không có điều kiện nào được bật")
  })

  it("a config locked before SPEC V3 keeps its old summary and is flagged", () => {
    const legacy = legacyRsiConfig()
    expect(configSummary(legacy, rsi)).toBe("Mua: 14 / 30 · < · > | Bán: 14 / 70 · > · <")
    expect(isLegacyFor(legacy, rsi)).toBe(true)
    expect(isLegacyFor(rsi.defaults, rsi)).toBe(false)
    // Volume is a params indicator: its config is current, not old.
    expect(isLegacyFor(volume.defaults, volume)).toBe(false)
    expect(isLegacyFor(legacy, null)).toBe(false)
  })

  it("labels the params of an old run from the labels of the old forms", () => {
    expect(legacyParamMeta("rsi", "level")).toEqual({ label: "Ngưỡng RSI", unit: "" })
    expect(legacyParamMeta("rsi", "period")).toEqual({ label: "Chu kỳ RSI", unit: "phiên" })
    expect(legacyParamMeta("rsi", "nope")).toBeNull()
    expect(legacyRuleLabel("r2")).toBe("Điều kiện 2")
    const form = toFormState(legacyRsiConfig(), rsi)
    expect(legacySideEntries("rsi", rsi, "buy", form.buy)).toEqual([
      { label: "Chu kỳ RSI", value: "14 phiên" },
      { label: "Ngưỡng RSI", value: "30" },
      { label: "Điều kiện 1", value: "<" },
      { label: "Điều kiện 2", value: ">" },
    ])
  })
})

describe("replay frames", () => {
  const run = makeRun({ plan: [{ buy: 20, sell: 45, reason: "indicator" }, { buy: 100, sell: 160, reason: "max_holding" }, { buy: 400 }] })
  const result = run.result!
  const closeAt = (session: number) => run.chart!.bars.close[session - run.chart!.first_session]!

  it("at the end it is exactly the server result", () => {
    const frame = frameAt(run, result.last_session)!
    expect(frame.complete).toBe(true)
    expect(frame.totalReturn).toBe(result.kpis.total_return)
    expect(frame.buyCount).toBe(3)
    expect(frame.rows).toHaveLength(3)
    expect(frame.rows[2]).toMatchObject({ holding: true, provisional: true })
    expect(frame.rows[2]!.mark).toEqual({ session: result.last_session, price: result.trades[2]!.mark!.price, marketValue: result.trades[2]!.mark!.market_value })
    expect(frame.rows[0]!.sell).toBe(result.trades[0]!.sell)
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

  it("no look-ahead: a trade still held shows neither its later sell nor the valuation of a later session", () => {
    const trade = result.trades[0]!
    const held = frameAt(run, 30)!.rows[0]!
    // `trade` is the whole-run record (it already holds the sell at Phiên 45 and no mark): the view must not expose it.
    expect(trade.sell?.session).toBe(45)
    expect(held.sell).toBeNull()
    expect(held.sellSession).toBeNull()
    expect(held.sellPrice).toBeNull()
    expect(held.mark).toEqual({ session: 30, price: closeAt(30), marketValue: trade.qty * closeAt(30) })
    expect(held.pnlVnd).toBeCloseTo(trade.qty * closeAt(30) - trade.buy.total_cost, 6)
    // The valuation follows the displayed bar, not the end of the run.
    expect(frameAt(run, 31)!.rows[0]!.mark?.session).toBe(31)
    // The session the sell is signalled on is still "held" (the sell fills at the next open).
    expect(frameAt(run, 44)!.rows[0]!.sell).toBeNull()
    expect(frameAt(run, 45)!.rows[0]!.sell?.session).toBe(45)
  })

  it("a sold trade carries its sell and no valuation", () => {
    const sold = frameAt(run, 50)!.rows[0]!
    expect(sold.sell?.session).toBe(45)
    expect(sold.sell?.reason).toBe("indicator")
    expect(sold.mark).toBeNull()
  })

  it("a missing final valuation is not a fake 0%", () => {
    const missing = makeRun({ valuation: "missing" })
    const frame = frameAt(missing, missing.result!.last_session)!
    expect(frame.totalReturn).toBeNull()
    expect(formatRatioPercent(frame.totalReturn)).toBe("—")
    expect(formatRatioPercent(0)).toBe("0,00%")
  })

  it("a run locked before SPEC V3 is framed the same way", () => {
    const legacy = makeLegacyRun()
    expect(frameAt(legacy, 30)!.rows[0]!.sell).toBeNull()
    expect(frameAt(legacy, legacy.result!.last_session)!.rows).toHaveLength(3)
  })
})

describe("fixtures stay faithful to the contract", () => {
  it("the chart of a row config is keyed per row, the chart of a params config is not", () => {
    const rows = makeChart({ indicatorId: "rsi", config: rowsConfig("rsi") })
    expect(rows.plot.buy.lines.map((line) => line.key)).toEqual(["rsi.level.value"])
    const params = makeChart({ indicatorId: "rsi", config: legacyRsiConfig() })
    expect(params.plot.buy.lines.map((line) => line.key)).toEqual(["value"])
  })
})

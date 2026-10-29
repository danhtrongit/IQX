import { describe, expect, it } from "vitest"

import { buildRegistry, rowsIndicator, rowsOf } from "../test-support"
import {
  buildIndicatorConfig,
  createDraft,
  draftErrors,
  hasDraftErrors,
  isDraftDirty,
  paramError,
  rebaseDraft,
  resetDraftSide,
  sameIndicatorConfig,
  savedIndicatorConfig,
  sideField,
  sideFields,
  templateConfig,
  updateDraftRow,
  type IndicatorDraft,
} from "./draft"
import { masterToggleIntent } from "./master"
import type { IndicatorConfig, ParamsIndicator, SharedConfigState } from "./types"

const registry = buildRegistry()
const rsi = rowsIndicator("rsi", registry)
const volume = registry.find((entry) => entry.id === "volume") as ParamsIndicator

/** Set one value of one row of one tab, the way the form does. */
function edit(draft: IndicatorDraft, side: "buy" | "sell", index: number, key: string, value: string): IndicatorDraft {
  const row = draft[side].rows[index]!
  return updateDraftRow(draft, side, index, { ...row, values: { ...row.values, [key]: value } })
}

describe("registry defaults", () => {
  it("are one row per registry condition with its own values and switch; the tab and the master are OFF", () => {
    const config = templateConfig(rsi)
    expect(config.master_enabled).toBe(false)
    expect(rowsOf(config, "buy")).toEqual({
      enabled: false,
      rules: [
        { id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 30 },
        { id: "rsi.trend", enabled: true, period: 14, dir: "up" },
      ],
    })
    expect(rowsOf(config, "sell").rules[0]).toEqual({ id: "rsi.level", enabled: true, period: 14, op: ">", threshold: 70 })
  })

  it("keep Volume's params and rule templates", () => {
    const config = templateConfig(volume)
    expect(config.buy).toMatchObject({ enabled: false, params: { lookback: 20, mult: 1 } })
    expect(sideFields(volume, "buy").map((field) => field.key)).toEqual(["lookback", "mult"])
    expect(sideFields(rsi, "buy")).toEqual([])
  })

  it("never maps a saved tab in an older format: it reads as the default rows, keeping only the switches", () => {
    const old = { master_enabled: true, buy: { enabled: true, params: { period: 9, level: 25 }, rules: [] }, sell: { enabled: false, params: {}, rules: [] } }
    const state = { config: { indicators: { rsi: old } } } as unknown as SharedConfigState
    const read = savedIndicatorConfig(state, rsi)
    expect(read.master_enabled).toBe(true)
    expect(rowsOf(read, "buy")).toEqual({ ...rowsOf(templateConfig(rsi), "buy"), enabled: true })
    expect(rowsOf(read, "sell").enabled).toBe(false)
  })
})

describe("draft values", () => {
  it("round-trip exactly, negatives and decimals included (CMF -0.05, CCI -100, Williams -80, ROC 5)", () => {
    const cases: [string, number, string, number][] = [
      ["cmf", 0, "threshold", -0.05],
      ["cci", 0, "threshold", -100],
      ["williams_r", 0, "threshold", -80],
      ["roc", 0, "threshold", 5],
      ["bollinger", 0, "mult", 2.5],
    ]
    for (const [id, index, key, value] of cases) {
      const indicator = rowsIndicator(id, registry)
      const saved = templateConfig(indicator)
      let draft = createDraft(saved)
      draft = edit(draft, "buy", index, key, String(value))
      expect(draft.buy.rows[index]!.values[key]).toBe(String(value))
      expect(hasDraftErrors(draftErrors(indicator, draft))).toBe(false)
      const built = buildIndicatorConfig(indicator, saved, draft, false)
      expect(rowsOf(built, "buy").rules[index]![key]).toBe(value)
      // Read back (as after a reload): the same text again.
      expect(createDraft(built).buy.rows[index]!.values[key]).toBe(String(value))
    }
  })

  it("keep enum codes as codes (cross_up), never their labels", () => {
    const cci = rowsIndicator("cci", registry)
    const draft = createDraft(templateConfig(cci))
    expect(draft.buy.rows[0]!.values).toEqual({ period: "20", op: "cross_up", threshold: "-100" })
  })

  it("editing one row never changes another row or the other tab", () => {
    const saved = templateConfig(rsi)
    const draft = edit(createDraft(saved), "buy", 0, "period", "9")
    expect(draft.buy.rows[0]!.values.period).toBe("9")
    expect(draft.buy.rows[1]!.values.period).toBe("14")
    expect(draft.sell).toEqual(createDraft(saved).sell)
    const built = buildIndicatorConfig(rsi, saved, draft, false)
    expect(rowsOf(built, "buy").rules.map((row) => row.period)).toEqual([9, 14])
    expect(rowsOf(built, "sell").rules.map((row) => row.period)).toEqual([14, 14])
  })
})

describe("validation (SPEC V3 §4)", () => {
  it("checks both tabs and every row, on or off, with the server's messages, never repairing the value", () => {
    const macd = rowsIndicator("macd", registry)
    let draft = createDraft(templateConfig(macd))
    draft = edit(draft, "buy", 1, "fast", "30") // row 2 is OFF by default
    draft = edit(draft, "sell", 0, "signal", "1")
    const errors = draftErrors(macd, draft)
    expect(errors.buy.rows.map((error) => error.message)).toEqual(["Mua · dòng 2: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm."])
    expect(errors.buy.rows[0]).toMatchObject({ row: 2, field: "fast", path: "indicators.macd.buy.rules.1.fast" })
    expect(errors.sell.rows.map((error) => error.message)).toEqual(["Bán · dòng 1: Chu kỳ Signal phải từ 2 đến 200, số nguyên."])
    expect(hasDraftErrors(errors)).toBe(true)
    expect(draft.buy.rows[1]!.values.fast).toBe("30")
  })

  it("reports empty, out-of-range, non-integer and off-list values", () => {
    const ma = rowsIndicator("ma", registry)
    const draft = edit(createDraft(templateConfig(ma)), "buy", 0, "period", "7")
    expect(draftErrors(ma, draft).buy.rows[0]!.message).toBe("Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.")

    const empty = edit(createDraft(templateConfig(rsi)), "buy", 1, "period", "")
    expect(draftErrors(rsi, empty).buy.rows[0]!.message).toBe("Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
    const decimal = edit(createDraft(templateConfig(rsi)), "sell", 0, "threshold", "70.5")
    expect(draftErrors(rsi, decimal).sell.rows[0]!.message).toBe("Bán · dòng 1: Ngưỡng RSI phải từ 0 đến 100, số nguyên.")

    const cmf = rowsIndicator("cmf", registry)
    const outside = edit(createDraft(templateConfig(cmf)), "buy", 0, "threshold", "-1.5")
    expect(draftErrors(cmf, outside).buy.rows[0]!.message).toBe("Mua · dòng 1: Ngưỡng CMF phải từ -1 đến 1.")
  })

  it("keeps Volume's param validation", () => {
    const mult = sideField(volume, "buy", "mult")!
    expect(paramError(mult, "1.5")).toBeNull()
    expect(paramError(mult, "")).toMatch(/bắt buộc/)
    const draft = createDraft(templateConfig(volume))
    draft.buy.params.lookback = "1"
    expect(Object.keys(draftErrors(volume, draft).buy.fields)).toEqual(["lookback"])
  })
})

describe("Đặt lại", () => {
  it("restores only the open tab's rows to the registry defaults and keeps its ON/OFF and the other tab", () => {
    const saved = templateConfig(rsi)
    saved.buy.enabled = true
    let draft = createDraft(saved)
    draft = edit(draft, "buy", 0, "threshold", "25")
    draft = updateDraftRow(draft, "buy", 1, { ...draft.buy.rows[1]!, enabled: false })
    draft = edit(draft, "sell", 0, "threshold", "85")

    const reset = resetDraftSide(draft, rsi, "buy")
    expect(reset.buy.rows).toEqual(createDraft(templateConfig(rsi)).buy.rows)
    expect(reset.buy.enabled).toBe(true)
    expect(reset.sell).toEqual(draft.sell)
  })
})

describe("building the PATCH record", () => {
  const withSides = (buy: boolean, sell: boolean, master: boolean): IndicatorConfig => {
    const config = templateConfig(rsi)
    config.master_enabled = master
    config.buy.enabled = buy
    config.sell.enabled = sell
    return config
  }

  it("saves master OFF when both sides end up OFF, whatever the master was", () => {
    const saved = withSides(true, false, true)
    const draft = createDraft(saved)
    draft.buy.enabled = false
    expect(buildIndicatorConfig(rsi, saved, draft, false).master_enabled).toBe(false)
    expect(buildIndicatorConfig(rsi, saved, draft, true).master_enabled).toBe(false)
  })

  it("never turns the master on from editing alone, only when opened from the master switch with a side ON", () => {
    const saved = withSides(false, false, false)
    const draft = createDraft(saved)
    draft.buy.enabled = true
    expect(buildIndicatorConfig(rsi, saved, draft, false).master_enabled).toBe(false)
    expect(buildIndicatorConfig(rsi, saved, draft, true).master_enabled).toBe(true)
  })

  it("sends every row with its id, switch and own values", () => {
    const saved = withSides(true, true, true)
    let draft = createDraft(saved)
    draft = updateDraftRow(draft, "sell", 1, { ...draft.sell.rows[1]!, enabled: false, values: { period: "9", dir: "up" } })
    const built = buildIndicatorConfig(rsi, saved, draft, false)
    expect(built.master_enabled).toBe(true)
    expect(rowsOf(built, "sell").rules).toEqual([
      { id: "rsi.level", enabled: true, period: 14, op: ">", threshold: 70 },
      { id: "rsi.trend", enabled: false, period: 9, dir: "up" },
    ])
    expect(rowsOf(built, "buy").rules).toEqual(rowsOf(saved, "buy").rules)
  })

  it("Volume keeps its params and ignores an operator outside the rule's allowed set", () => {
    const saved = templateConfig(volume)
    const draft = createDraft(saved)
    draft.buy.params.mult = "1.5"
    draft.buy.ops.r1 = "∈"
    const built = buildIndicatorConfig(volume, saved, draft, false)
    expect(built.buy).toMatchObject({ params: { lookback: 20, mult: 1.5 }, rules: [{ id: "r1", op: ">" }, { id: "r2", op: ">" }] })
  })

  it("is unchanged when only the stored key order differs", () => {
    const saved = templateConfig(rsi)
    const reordered = { ...saved, buy: { rules: rowsOf(saved, "buy").rules.map((row) => Object.fromEntries(Object.entries(row).reverse())), enabled: false } } as IndicatorConfig
    expect(sameIndicatorConfig(reordered, buildIndicatorConfig(rsi, reordered, createDraft(reordered), false))).toBe(true)
  })
})

describe("dirty and rebase", () => {
  it("is dirty only when something differs from the saved config", () => {
    const saved = templateConfig(rsi)
    expect(isDraftDirty(createDraft(saved), createDraft(saved))).toBe(false)
    expect(isDraftDirty(createDraft(saved), edit(createDraft(saved), "buy", 0, "threshold", "31"))).toBe(true)
  })

  it("after a conflict keeps what the user changed and takes everything else from the newer config", () => {
    const base = templateConfig(rsi)
    const newer = templateConfig(rsi)
    rowsOf(newer, "sell").rules[0]!.threshold = 85
    rowsOf(newer, "buy").rules[0]!.threshold = 40
    rowsOf(newer, "buy").rules[1]!.period = 21
    const draft = edit(createDraft(base), "buy", 0, "threshold", "35")

    const rebased = rebaseDraft(draft, base, newer)
    expect(rebased.buy.rows[0]!.values.threshold).toBe("35")
    expect(rebased.buy.rows[1]!.values.period).toBe("21")
    expect(rebased.sell.rows[0]!.values.threshold).toBe("85")
  })
})

describe("master switch rules", () => {
  const config = (master: boolean, buy: boolean, sell: boolean) => {
    const value = templateConfig(rsi)
    return { ...value, master_enabled: master, buy: { ...value.buy, enabled: buy }, sell: { ...value.sell, enabled: sell } }
  }

  it("OFF keeps the children", () => {
    expect(masterToggleIntent(config(true, true, false))).toEqual({ kind: "save", config: config(false, true, false) })
  })

  it("ON with a side already ON keeps it and does not enable the other side", () => {
    expect(masterToggleIntent(config(false, false, true))).toEqual({ kind: "save", config: config(true, false, true) })
  })

  it("ON with both sides OFF opens the configuration instead of activating", () => {
    expect(masterToggleIntent(config(false, false, false))).toEqual({ kind: "configure" })
  })
})

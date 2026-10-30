import { describe, expect, it } from "vitest"

import { buildRegistry, rowsIndicator } from "../test-support"
import { createDraft, templateConfig } from "./draft"
import { rowPathOf, validateRowValues, validateSideRows } from "./validate"

const registry = buildRegistry()

/** Server golden strings (backend `conditions/validate.ts`, SPEC V3 §4). */
describe("row validation messages", () => {
  const rows = (id: string) => createDraft(templateConfig(rowsIndicator(id, registry)))

  it("range: `Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.` for empty, out of range or a decimal", () => {
    const rsi = rowsIndicator("rsi", registry)
    for (const text of ["", "1", "201", "14.5", "abc"]) {
      const draft = rows("rsi")
      draft.buy.rows[1]!.values.period = text
      expect(validateSideRows("rsi", rsi.rows, "buy", draft.buy.rows).map((error) => error.message)).toEqual([
        "Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.",
      ])
    }
  })

  it("decimal fields have no `số nguyên` and keep the dot decimal of the registry", () => {
    const bollinger = rowsIndicator("bollinger", registry)
    const draft = rows("bollinger")
    draft.sell.rows[2]!.values.mult = "4"
    expect(validateSideRows("bollinger", bollinger.rows, "sell", draft.sell.rows)[0]).toEqual({
      path: "indicators.bollinger.sell.rules.2.mult", side: "sell", row: 3, field: "mult",
      message: "Bán · dòng 3: Hệ số độ lệch chuẩn phải từ 1 đến 3.5.",
    })
  })

  it("preset periods: `… chỉ chọn 5, 10, 20, 50, 100, 200.`", () => {
    const maCross = rowsIndicator("ma_cross", registry)
    const draft = rows("ma_cross")
    draft.buy.rows[0]!.values.slow = "60"
    expect(validateSideRows("ma_cross", maCross.rows, "buy", draft.buy.rows)[0]!.message).toBe("Mua · dòng 1: Chu kỳ SMA chậm chỉ chọn 5, 10, 20, 50, 100, 200.")
  })

  it("fast >= slow on SMA row 2, EMA row 2, MA Cross and the three MACD rows", () => {
    const cases: [string, number][] = [["ma", 2], ["ema", 2], ["ma_cross", 1], ["macd", 1], ["macd", 2], ["macd", 3]]
    for (const [id, row] of cases) {
      const indicator = rowsIndicator(id, registry)
      const draft = rows(id)
      draft.buy.rows[row - 1]!.values.fast = draft.buy.rows[row - 1]!.values.slow!
      const errors = validateSideRows(id, indicator.rows, "buy", draft.buy.rows)
      expect(errors.map((error) => error.message)).toEqual([`Mua · dòng ${row}: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.`])
      expect(errors[0]!.field).toBe("fast")
    }
  })

  it("does not judge fast < slow while one of them is invalid on its own", () => {
    const macd = rowsIndicator("macd", registry)
    const draft = rows("macd")
    draft.buy.rows[0]!.values.slow = ""
    expect(validateSideRows("macd", macd.rows, "buy", draft.buy.rows).map((error) => error.field)).toEqual(["slow"])
    const outOfRange = rows("macd")
    outOfRange.buy.rows[0]!.values.fast = "300"
    expect(validateSideRows("macd", macd.rows, "buy", outOfRange.buy.rows).map((error) => error.field)).toEqual(["fast"])
  })

  it("rejects an enum code that is not in the options and a step that is not a multiple", () => {
    const cmf = rowsIndicator("cmf", registry)
    expect(validateRowValues(cmf.rows[0]!, { period: 20, op: ">", threshold: 0 }, "buy", 1, "p").map((error) => error.message)).toEqual([
      "Mua · dòng 1: Hướng giao cắt CMF không hợp lệ.",
    ])
    expect(validateRowValues(cmf.rows[0]!, { period: 20, op: "cross_up", threshold: 0.005 }, "buy", 1, "p").map((error) => error.message)).toEqual([
      "Mua · dòng 1: Ngưỡng CMF phải theo bước 0.01.",
    ])
  })

  it("accepts every default row of the 15 indicators, both tabs", () => {
    for (const entry of registry) {
      if (entry.model !== "rows") continue
      const draft = createDraft(templateConfig(entry))
      expect(validateSideRows(entry.id, entry.rows, "buy", draft.buy.rows)).toEqual([])
      expect(validateSideRows(entry.id, entry.rows, "sell", draft.sell.rows)).toEqual([])
    }
  })
})

describe("server paths", () => {
  it("map `indicators.rsi.buy.rules.1.period` to the row and field", () => {
    expect(rowPathOf("indicators.rsi.buy.rules.1.period")).toEqual({ side: "buy", index: 1, field: "period" })
    expect(rowPathOf("indicators.macd.sell.rules.0")).toEqual({ side: "sell", index: 0, field: null })
    expect(rowPathOf("indicators.rsi.buy.params.period")).toBeNull()
    expect(rowPathOf("indicators.rsi")).toBeNull()
  })
})

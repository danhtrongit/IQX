import { describe, expect, it } from "vitest"

import { registryFor } from "../../demo-trading/bot/test-support"
import {
  cellSentence,
  draftsFromItems,
  enabledItemRows,
  enabledItems,
  enabledRows,
  indicatorName,
  newTechnicalDraft,
  rewriteBotMessage,
  technicalFirstError,
  technicalFromDrafts,
  technicalLibrary,
  technicalProblems,
  technicalSummary,
  volumeErrors,
  type RowsDraft,
  type VolumeDraft,
} from "./technical"
import type { TechnicalItem } from "./types"

const registry = registryFor([])
const indicator = (id: string) => registry.indicators.find((entry) => entry.id === id)!
const rows = (id: string) => newTechnicalDraft(indicator(id)) as RowsDraft
const volume = () => newTechnicalDraft(indicator("volume")) as VolumeDraft

describe("library", () => {
  it("lists the 16 indicators of the Bot in 7 groups, in the order of the spec", () => {
    const library = technicalLibrary(registry)
    expect(library.map((group) => group.title)).toEqual(["Đường trung bình", "Động lượng", "Biến động", "Kênh giá", "Xu hướng", "Khối lượng", "Dòng tiền"])
    expect(library.flatMap((group) => group.indicators.map((entry) => entry.id))).toEqual([
      "ma", "ema", "ma_cross", "rsi", "macd", "stochastic", "cci", "roc", "williams_r", "bollinger", "donchian", "dmi", "obv", "volume", "mfi", "cmf",
    ])
    expect(technicalLibrary(undefined)).toEqual([])
  })

  it("names indicators like the Bot, even before the registry is loaded", () => {
    expect(indicatorName("ma", registry)).toBe("MA / SMA")
    expect(indicatorName("cmf")).toBe("Chaikin Money Flow")
    expect(indicatorName("unknown")).toBe("unknown")
  })
})

describe("a card as it is first added", () => {
  it("starts from the Bot's Mua rows and switches", () => {
    const rsi = rows("rsi")
    expect(rsi.rows.map((row) => [row.id, row.enabled, row.values])).toEqual([
      ["rsi.level", true, { period: "14", op: "<", threshold: "30" }],
      ["rsi.trend", true, { period: "14", dir: "up" }],
    ])
    // MACD keeps its two rows that the Bot has off.
    expect(rows("macd").rows.map((row) => [row.id, row.enabled])).toEqual([["macd.signal", true], ["macd.zero", false], ["macd.hist", false]])
  })

  it("starts Khối lượng at N = 20 and k = 1,1 with both rows on >", () => {
    expect(volume()).toMatchObject({ kind: "volume", indicator: "volume", sessions: "20", factor: "1,1", ops: [">", ">"] })
    expect(enabledRows(volume())).toBe(2)
    expect(enabledRows(rows("rsi"))).toBe(2)
    expect(enabledRows({ ...rows("macd") })).toBe(1)
  })
})

describe("checking a card", () => {
  it("uses the Bot's own messages with the Mua prefix replaced by the indicator name", () => {
    const rsi = rows("rsi")
    const bad: RowsDraft = { ...rsi, rows: [{ ...rsi.rows[0]!, values: { ...rsi.rows[0]!.values, period: "1" } }, rsi.rows[1]!] }
    expect(technicalProblems(bad, indicator("rsi")).messages).toEqual(["RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên."])
    expect(technicalProblems(bad, indicator("rsi")).flagged).toEqual([{ row: 1, field: "period" }])
    const macd = rows("macd")
    const fastSlow: RowsDraft = { ...macd, rows: macd.rows.map((row, index) => (index === 0 ? { ...row, values: { ...row.values, fast: "30", slow: "26" } } : row)) }
    expect(technicalProblems(fastSlow, indicator("macd")).messages).toEqual(["MACD · Dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm."])
    expect(rewriteBotMessage("Mua · dòng 3: x", "EMA")).toBe("EMA · Dòng 3: x")
    expect(technicalProblems(rows("rsi"), indicator("rsi")).messages).toEqual([])
  })

  it("checks Khối lượng by the spec: N is an integer 5 to 100, k a multiple of 0,1 from 0,5 to 3", () => {
    expect(volumeErrors(volume())).toEqual({})
    expect(volumeErrors({ ...volume(), sessions: "4" }).sessions).toBe("Số phiên tham chiếu phải từ 5 đến 100, số nguyên.")
    expect(volumeErrors({ ...volume(), sessions: "20,5" }).sessions).toBe("Số phiên tham chiếu phải từ 5 đến 100, số nguyên.")
    expect(volumeErrors({ ...volume(), sessions: "101" }).sessions).toBe("Số phiên tham chiếu phải từ 5 đến 100, số nguyên.")
    expect(volumeErrors({ ...volume(), factor: "0,4" }).factor).toBe("Hệ số khối lượng phải từ 0,5 đến 3.")
    expect(volumeErrors({ ...volume(), factor: "3,1" }).factor).toBe("Hệ số khối lượng phải từ 0,5 đến 3.")
    expect(volumeErrors({ ...volume(), factor: "1,25" }).factor).toBe("Hệ số khối lượng phải theo bước 0,1.")
    expect(volumeErrors({ ...volume(), factor: "0,5" })).toEqual({})
    expect(volumeErrors({ ...volume(), factor: "3" })).toEqual({})
    expect(technicalProblems({ ...volume(), sessions: "3" }, indicator("volume")).messages).toEqual(["Khối lượng · Số phiên tham chiếu phải từ 5 đến 100, số nguyên."])
  })

  it("reports the first message of the first wrong card", () => {
    const rsi = rows("rsi")
    const bad: RowsDraft = { ...rsi, rows: [{ ...rsi.rows[0]!, values: { ...rsi.rows[0]!.values, threshold: "" } }, rsi.rows[1]!] }
    expect(technicalFirstError([rows("macd"), bad, { ...volume(), sessions: "1" }], registry)).toMatch(/^RSI · Dòng 1: /)
    expect(technicalFirstError([rows("macd"), volume()], registry)).toBeNull()
  })
})

describe("definition items", () => {
  it("builds one item per card with every row of the indicator, switched off ones included", () => {
    const macd = rows("macd")
    const items = technicalFromDrafts([macd, volume()], registry)
    expect(items).toHaveLength(2)
    expect((items[0] as { rules: Array<{ id: string; enabled: boolean }> }).rules.map((row) => [row.id, row.enabled])).toEqual([["macd.signal", true], ["macd.zero", false], ["macd.hist", false]])
    expect(items[1]).toEqual({ indicator: "volume", sessions: 20, factor: 1.1, ops: [">", ">"] })
  })

  it("round-trips the cards through the stored items", () => {
    const drafts = [rows("rsi"), volume()]
    const back = draftsFromItems(technicalFromDrafts(drafts, registry))
    expect(back).toEqual(drafts)
    expect(draftsFromItems(null)).toEqual([])
  })

  it("counts only the switched-on rows, Khối lượng as two, and names each indicator in the summary", () => {
    const items = technicalFromDrafts([rows("macd"), rows("rsi"), volume()], registry)
    expect(enabledItemRows(items)).toBe(1 + 2 + 2)
    expect(enabledItems(items).map((item) => item.indicator)).toEqual(["macd", "rsi", "volume"])
    expect(technicalSummary(items, registry)).toEqual(["RSI (2 dòng)", "MACD (1 dòng)", "Khối lượng"])
    const allOff = technicalFromDrafts([{ ...rows("rsi"), rows: rows("rsi").rows.map((row) => ({ ...row, enabled: false })) }], registry)
    expect(technicalSummary(allOff, registry)).toEqual([])
  })
})

describe("what a result cell tested", () => {
  const cell = (partial: Record<string, unknown>) => ({ indicator: "rsi", row_id: "rsi.level", op: "<", params: { period: 14, op: "<", threshold: 30 }, ...partial }) as Parameters<typeof cellSentence>[0]

  it("writes a row in the Bot's own words with the values of that row", () => {
    expect(cellSentence(cell({}), registry)).toBe("RSI 14 < 30")
    expect(cellSentence(cell({ indicator: "macd", row_id: "macd.signal", params: { fast: 12, slow: 26, op: "cross_up", signal: 9 } }), registry)).toBe("MACD 12 / 26 cắt lên Signal 9")
    expect(cellSentence(cell({}), undefined)).toBeNull()
  })

  it("writes the two fixed rows of Khối lượng", () => {
    const params = { lookback: 20, mult: 1.1 }
    const items = [{ indicator: "volume", sessions: 20, factor: 1.1, ops: [">", "<"] }] as TechnicalItem[]
    expect(cellSentence(cell({ indicator: "volume", row_id: "r1", op: ">", params }), registry, items)).toBe("Giá đóng cửa > giá đóng cửa phiên trước")
    expect(cellSentence(cell({ indicator: "volume", row_id: "r2", op: "<", params }), registry, items)).toBe("Khối lượng < 1,1 × khối lượng trung bình 20 phiên trước")
    // A row that could not be evaluated carries no op: the definition has it.
    expect(cellSentence(cell({ indicator: "volume", row_id: "r2", op: null, params }), registry, items)).toBe("Khối lượng < 1,1 × khối lượng trung bình 20 phiên trước")
  })
})

import { describe, expect, it } from "vitest"

import { registryFor } from "../../demo-trading/bot/test-support"
import { metricsFixture } from "../test-support"
import { buildDefinition, conditionCount, criteriaSignature, criteriaSummary, draftsFromFilter, isMetricUsable, marketAndTechnicalFromFilter, referenceColumns, type FilterDraft } from "./definition"
import { emptyMarketDraft } from "./market"
import { newTechnicalDraft, type RowsDraft, type TechnicalDraft } from "./technical"
import type { DraftRule, SavedFilter } from "./types"

const metrics = metricsFixture(["revenue_yoy", "profit_yoy", "eps_yoy", "gross_margin", "net_margin", "roe", "roic"])
const registry = registryFor([])
const rule = (partial: Partial<DraftRule> & Pick<DraftRule, "metric_id">): DraftRule => ({ id: partial.metric_id, period: "ttm", operator: ">", displayValue: "15", ...partial })
const technical = (id: string): TechnicalDraft => newTechnicalDraft(registry.indicators.find((entry) => entry.id === id)!)
const draft = (partial: Partial<FilterDraft> = {}): FilterDraft => ({ rules: [], market: emptyMarketDraft(), technical: [], ...partial })
const build = (value: FilterDraft, name = "Tên") => {
  const built = buildDefinition(value, name, metrics, registry)
  if (!built.ok) throw new Error(built.error)
  return built.definition
}
const error = (value: FilterDraft) => {
  const built = buildDefinition(value, "", metrics, registry)
  return built.ok ? "ok" : built.error
}

describe("definition 4.0", () => {
  it("builds Thị trường, a period per fundamental rule and the technical items, with no filter-wide period", () => {
    const definition = build(draft({
      rules: [rule({ metric_id: "profit_yoy", period: "quarter" }), rule({ metric_id: "roe", period: "year", displayValue: "20" })],
      market: { ...emptyMarketDraft(), exchanges: ["HOSE"], baskets: ["VN30"], capMin: "1000", avgMin: "10" },
      technical: [technical("rsi"), technical("volume")],
    }))
    expect(definition.schema_version).toBe("4.0")
    expect(definition.logic).toBe("AND")
    expect(definition.rules.map((item) => [item.metric_id, item.period, item.value])).toEqual([["profit_yoy", "quarter", 0.15], ["roe", "year", 0.2]])
    expect(definition.market).toEqual({
      exchanges: ["HOSE"], baskets: ["VN30"], statement_groups: [],
      market_cap: { min: 1000, max: null }, avg_value: { sessions: 20, min: 10 }, close_price: { min: null, max: null },
    })
    expect(definition.technical?.map((item) => item.indicator)).toEqual(["rsi", "volume"])
    expect("scope" in definition).toBe(false)
  })

  it("keeps a switched-off technical row in the definition, with its values", () => {
    const rsi = technical("rsi") as RowsDraft
    const off: RowsDraft = { ...rsi, rows: rsi.rows.map((row, index) => (index === 1 ? { ...row, enabled: false } : row)) }
    const definition = build(draft({ technical: [off] }))
    const [item] = definition.technical!
    expect((item as { rules: Array<{ id: string; enabled: boolean }> }).rules.map((row) => [row.id, row.enabled])).toEqual([["rsi.level", true], ["rsi.trend", false]])
  })

  it("refuses an unsupported period, an unopened or not-ready metric and a missing threshold, naming the reason", () => {
    const text = (item: DraftRule) => error(draft({ rules: [item] }))
    expect(text(rule({ metric_id: "roe", period: "quarter" }))).toMatch(/Kỳ đã chọn không được hỗ trợ cho “ROE”/)
    expect(text(rule({ metric_id: "roe", period: null }))).toMatch(/Chọn kỳ tính cho “ROE”/)
    expect(text(rule({ metric_id: "roa" }))).toMatch(/Chưa mở chỉ tiêu “ROA”/)
    expect(text(rule({ metric_id: "eps_yoy", period: "quarter" }))).toMatch(/chưa dùng được/)
    expect(text(rule({ metric_id: "roe", displayValue: "" }))).toMatch(/Nhập ngưỡng cho “ROE”/)
  })

  it("stops the run on the first wrong market value, a technical value, a pending ICB sector, or an indicator list that is not loaded", () => {
    expect(error(draft({ market: { ...emptyMarketDraft(), capMin: "500", capMax: "100" } }))).toMatch(/^Cơ bản · Thị trường: Vốn hóa/)
    expect(error(draft({ market: { ...emptyMarketDraft(), avgSessions: "3" } }))).toBe("Cơ bản · Thị trường: Số phiên phải từ 5 đến 100, số nguyên.")
    const rsi = technical("rsi") as RowsDraft
    const wrong: RowsDraft = { ...rsi, rows: rsi.rows.map((row, index) => (index === 0 ? { ...row, values: { ...row.values, period: "1" } } : row)) }
    expect(error(draft({ technical: [wrong] }))).toBe("RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.")
    expect(error(draft({ market: { ...emptyMarketDraft(), reviewSector: "Ngân hàng" } }))).toBe("Chọn lại ngành: ngành ICB “Ngân hàng” của bộ lọc cũ không còn được hỗ trợ.")
    const withoutRegistry = buildDefinition(draft({ technical: [rsi] }), "", metrics, undefined)
    expect(withoutRegistry.ok ? "ok" : withoutRegistry.error).toMatch(/Chưa tải được định nghĩa các chỉ báo kỹ thuật/)
    // No technical card: the registry is not needed.
    expect(buildDefinition(draft(), "", metrics, undefined).ok).toBe(true)
  })

  it("names the empty run as a scope-only listing, with a default name for an unnamed filter", () => {
    const definition = build(draft(), "  ")
    expect(definition.name).toBe("Bộ lọc chưa lưu")
    expect(definition.rules).toEqual([])
    expect(definition.technical).toEqual([])
    expect(definition.columns).toBeUndefined()
  })

  it("only shows metrics that are learned AND ready as reference columns, at their default period, never repeating a condition, and none without a fundamental condition", () => {
    const columns = referenceColumns(metrics, [rule({ metric_id: "roe" })])
    expect(columns.map((column) => [column.metric_id, column.period])).toEqual([["revenue_yoy", "quarter"], ["profit_yoy", "quarter"], ["gross_margin", "ttm"], ["net_margin", "ttm"]])
    expect(referenceColumns(metrics, [])).toEqual([])
    expect(isMetricUsable(metrics.find((item) => item.id === "eps_yoy")!)).toBe(false)
    expect(isMetricUsable(metrics.find((item) => item.id === "roa")!)).toBe(false)
  })

  it("counts the fundamental conditions plus the switched-on technical rows, Khối lượng as two", () => {
    expect(conditionCount([], [])).toBe(0)
    expect(conditionCount([rule({ metric_id: "roe" })], [technical("rsi"), technical("volume")])).toBe(1 + 2 + 2)
    const rsi = technical("rsi") as RowsDraft
    expect(conditionCount([], [{ ...rsi, rows: rsi.rows.map((row) => ({ ...row, enabled: false })) }])).toBe(0)
  })
})

describe("criteria signature and summary", () => {
  it("compares runs by their criteria: a rename or a column change is not a change, a period, a market choice or a technical value is", () => {
    const a = build(draft({ rules: [rule({ metric_id: "roe", period: "ttm" })] }), "A")
    const b = build(draft({ rules: [rule({ metric_id: "roe", period: "ttm" })] }), "B")
    const c = build(draft({ rules: [rule({ metric_id: "roe", period: "year" })] }), "A")
    const d = build(draft({ rules: [rule({ metric_id: "roe", period: "ttm" })], market: { ...emptyMarketDraft(), exchanges: ["HNX"] } }), "A")
    expect(criteriaSignature(a)).toBe(criteriaSignature(b))
    expect(criteriaSignature(a)).not.toBe(criteriaSignature(c))
    expect(criteriaSignature(a)).not.toBe(criteriaSignature(d))
  })

  it("ignores the order of a multi-choice list and the HSX alias", () => {
    const one = build(draft({ market: { ...emptyMarketDraft(), exchanges: ["HOSE", "HNX"], baskets: ["VN100", "VN30"] } }))
    const two = build(draft({ market: { ...emptyMarketDraft(), exchanges: ["HNX", "HOSE"], baskets: ["VN30", "VN100"] } }))
    expect(criteriaSignature(one)).toBe(criteriaSignature(two))
    expect(criteriaSignature({ ...one, market: { ...one.market, exchanges: ["HSX", "HNX"] } })).toBe(criteriaSignature(one))
  })

  it("leaves a switched-off technical row out of the criteria but sees a switched-on one and its values", () => {
    const rsi = technical("rsi") as RowsDraft
    const base = build(draft({ technical: [rsi] }))
    const trendOff = build(draft({ technical: [{ ...rsi, rows: rsi.rows.map((row, index) => (index === 1 ? { ...row, enabled: false } : row)) }] }))
    expect(criteriaSignature(base)).not.toBe(criteriaSignature(trendOff))
    // Changing the values of a row that is off changes nothing; changing a row that is on does.
    const offAndEdited = build(draft({ technical: [{ ...rsi, rows: rsi.rows.map((row, index) => (index === 1 ? { ...row, enabled: false, values: { ...row.values, period: "21" } } : row)) }] }))
    expect(criteriaSignature(trendOff)).toBe(criteriaSignature(offAndEdited))
    const edited = build(draft({ technical: [{ ...rsi, rows: rsi.rows.map((row, index) => (index === 0 ? { ...row, values: { ...row.values, threshold: "25" } } : row)) }] }))
    expect(criteriaSignature(base)).not.toBe(criteriaSignature(edited))
  })

  it("summarises Thị trường, then the fundamental conditions with their period, then each indicator with its switched-on rows", () => {
    const definition = build(draft({
      rules: [rule({ metric_id: "profit_yoy", period: "quarter" }), rule({ metric_id: "roe", period: "ttm" })],
      market: { ...emptyMarketDraft(), exchanges: ["HOSE"], baskets: ["VN30"], groups: ["thuong"], capMin: "1000", avgMin: "10", priceMin: "10" },
      technical: [technical("rsi"), technical("volume")],
    }))
    expect(criteriaSummary(definition, metrics, registry)).toBe(
      "HOSE · VN30 · Thường · Vốn hóa từ 1.000 tỷ · GTGD TB20 ≥ 10 tỷ · Giá từ 10 nghìn đ · Tăng trưởng LNST (Quý gần nhất) > 15 % · ROE (Bốn quý gần nhất) > 15 % · RSI (2 dòng) · Khối lượng",
    )
    expect(criteriaSummary({ market: build(draft()).market, rules: [], technical: [] }, metrics)).toBe("Chưa áp tiêu chí: toàn bộ doanh nghiệp trong phạm vi")
  })
})

describe("reading a stored filter", () => {
  const stored = (partial: Record<string, unknown>) => ({ id: "f", name: "x", current_version: 1, version: 1, stored_schema_version: "4.0", definition_hash: "h", created_at: "", updated_at: "", legacy_review: null, sector_review: null, ...partial }) as unknown as SavedFilter
  const market = { exchanges: [], baskets: [], statement_groups: [], market_cap: { min: null, max: null }, avg_value: { sessions: 20, min: null }, close_price: { min: null, max: null } }

  it("keeps the stored period of a 2.0 rule it can map and drops it for one that needs review", () => {
    const filter = stored({
      stored_schema_version: "2.0",
      legacy_review: { stored_schema_version: "2.0", legacy_period: "quarter", needs_review: true, rules: [{ rule_id: "a", metric_id: "profit_yoy", legacy_period: "quarter", mapped_period: "quarter", status: "ok", reason: null }, { rule_id: "b", metric_id: "roe", legacy_period: "quarter", mapped_period: "quarter", status: "needs_review", reason: "Cần chọn lại kỳ." }] },
      definition: { schema_version: "4.0", name: "x", logic: "AND", data_mode: "latest_disclosed", market, technical: [], rules: [{ id: "a", metric_id: "profit_yoy", period: "quarter", operator: ">", value: 0.15, api_unit: "ratio" }, { id: "b", metric_id: "roe", period: "quarter", operator: ">", value: 0.15, api_unit: "ratio" }] },
    })
    const drafts = draftsFromFilter(filter)
    expect(drafts.map((item) => item.period)).toEqual(["quarter", null])
    expect(drafts[1]!.review).toBe("Cần chọn lại kỳ.")
    expect(drafts[0]!.displayValue).toBe("15")
  })

  it("loads Thị trường and every technical row, a switched-off one too, as typed", () => {
    const filter = stored({
      definition: {
        schema_version: "4.0", name: "x", logic: "AND", data_mode: "latest_disclosed", rules: [],
        market: { ...market, exchanges: ["HOSE", "HNX"], baskets: ["VNMIDCAP"], market_cap: { min: 1000, max: null }, avg_value: { sessions: 30, min: 5.5 } },
        technical: [
          { indicator: "rsi", rules: [{ id: "rsi.level", enabled: true, period: 14, op: "<", threshold: 30 }, { id: "rsi.trend", enabled: false, period: 21, dir: "up" }] },
          { indicator: "volume", sessions: 25, factor: 1.5, ops: [">", "<"] },
        ],
      },
    })
    const loaded = marketAndTechnicalFromFilter(filter)
    expect(loaded.market).toMatchObject({ exchanges: ["HOSE", "HNX"], baskets: ["VNMIDCAP"], capMin: "1000", avgSessions: "30", avgMin: "5,5", reviewSector: null })
    expect(loaded.technical).toHaveLength(2)
    expect((loaded.technical[0] as RowsDraft).rows.map((row) => [row.id, row.enabled, row.values.period])).toEqual([["rsi.level", true, "14"], ["rsi.trend", false, "21"]])
    expect(loaded.technical[1]).toMatchObject({ kind: "volume", sessions: "25", factor: "1,5", ops: [">", "<"] })
  })

  it("brings back the ICB sector of a 3.0 filter as a flag to choose again, never as a Ngành choice", () => {
    const filter = stored({
      stored_schema_version: "3.0",
      sector_review: { sector: "Ngân hàng" },
      definition: { schema_version: "4.0", name: "x", logic: "AND", data_mode: "latest_disclosed", rules: [], technical: [], market: { ...market, needs_review: "sector", legacy_sector: "Ngân hàng" } },
    })
    const loaded = marketAndTechnicalFromFilter(filter)
    expect(loaded.market.reviewSector).toBe("Ngân hàng")
    expect(loaded.market.groups).toEqual([])
  })
})

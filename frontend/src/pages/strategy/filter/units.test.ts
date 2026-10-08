import { describe, expect, it } from "vitest"

import { metricsFixture } from "../test-support"
import { buildDefinition, criteriaSignature, criteriaSummary, draftsFromFilter, isMetricUsable, referenceColumns } from "./definition"
import type { DraftRule, FilterScope, SavedFilter } from "./types"
import { displayInputText, formatDisplayNumber, parseDisplayInput, toApiValue, toDisplayValue } from "./units"

const metrics = metricsFixture(["revenue_yoy", "profit_yoy", "eps_yoy", "gross_margin", "net_margin", "roe", "roic"])
const scope: FilterScope = { market: "all", sector: "all" }
const rule = (partial: Partial<DraftRule> & Pick<DraftRule, "metric_id">): DraftRule => ({ id: partial.metric_id, period: "ttm", operator: ">", displayValue: "15", ...partial })

describe("unit codec", () => {
  it("converts percent display units to ratios once, without float noise", () => {
    expect(toApiValue(15, "ratio")).toBe(0.15)
    expect(toApiValue(15.5, "ratio")).toBe(0.155)
    expect(toDisplayValue(0.155, "ratio")).toBe(15.5)
    expect(toApiValue(2.5, "lần")).toBe(2.5)
    expect(toDisplayValue(30, "ngày")).toBe(30)
    expect(displayInputText(0.07, "ratio")).toBe("7")
    expect(displayInputText(0.155, "ratio")).toBe("15,5")
  })

  it("reads a threshold with a comma or a dot and refuses anything that is not a number", () => {
    expect(parseDisplayInput("15,5")).toBe(15.5)
    expect(parseDisplayInput(" -3.25 ")).toBe(-3.25)
    expect(parseDisplayInput("")).toBeNull()
    expect(parseDisplayInput("abc")).toBeNull()
    expect(parseDisplayInput("1e3")).toBeNull()
    expect(formatDisplayNumber(8.164965)).toBe("8,16")
    expect(formatDisplayNumber(null)).toBe("—")
  })
})

describe("definition 3.0", () => {
  it("builds a period per rule and never a filter-wide period", () => {
    const built = buildDefinition([rule({ metric_id: "profit_yoy", period: "quarter" }), rule({ metric_id: "roe", period: "year", displayValue: "20" })], scope, "Tên", metrics)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.definition.schema_version).toBe("3.0")
    expect(built.definition.rules.map((item) => [item.metric_id, item.period, item.value])).toEqual([["profit_yoy", "quarter", 0.15], ["roe", "year", 0.2]])
    expect(built.definition.scope).toEqual({ market: "all", sector: "all" })
    expect("period" in built.definition.scope).toBe(false)
  })

  it("refuses an unsupported period, an unopened or not-ready metric and a missing threshold, naming the reason", () => {
    const text = (draft: DraftRule) => {
      const built = buildDefinition([draft], scope, "", metrics)
      return built.ok ? "ok" : built.error
    }
    expect(text(rule({ metric_id: "roe", period: "quarter" }))).toMatch(/Kỳ đã chọn không được hỗ trợ cho “ROE”/)
    expect(text(rule({ metric_id: "roe", period: null }))).toMatch(/Chọn kỳ tính cho “ROE”/)
    expect(text(rule({ metric_id: "roa" }))).toMatch(/Chưa mở chỉ tiêu “ROA”/)
    expect(text(rule({ metric_id: "eps_yoy", period: "quarter" }))).toMatch(/chưa dùng được/)
    expect(text(rule({ metric_id: "roe", displayValue: "" }))).toMatch(/Nhập ngưỡng cho “ROE”/)
  })

  it("names the empty-criteria run as a scope-only listing, with a default name for an unnamed filter", () => {
    const built = buildDefinition([], scope, "  ", metrics)
    expect(built.ok && built.definition.name).toBe("Bộ lọc chưa lưu")
    expect(built.ok && built.definition.rules).toEqual([])
  })

  it("only shows metrics that are learned AND ready as reference columns, at their default period, never repeating a condition", () => {
    const columns = referenceColumns(metrics, [rule({ metric_id: "roe" })])
    expect(columns.map((column) => [column.metric_id, column.period])).toEqual([["revenue_yoy", "quarter"], ["profit_yoy", "quarter"], ["gross_margin", "ttm"], ["net_margin", "ttm"]])
    expect(isMetricUsable(metrics.find((item) => item.id === "eps_yoy")!)).toBe(false)
    expect(isMetricUsable(metrics.find((item) => item.id === "roa")!)).toBe(false)
  })

  it("compares runs by their criteria, so a rename or a column change does not make a result stale but a period does", () => {
    const a = buildDefinition([rule({ metric_id: "roe", period: "ttm" })], scope, "A", metrics)
    const b = buildDefinition([rule({ metric_id: "roe", period: "ttm" })], scope, "B", metrics)
    const c = buildDefinition([rule({ metric_id: "roe", period: "year" })], scope, "A", metrics)
    if (!a.ok || !b.ok || !c.ok) throw new Error("fixture")
    expect(criteriaSignature(a.definition)).toBe(criteriaSignature(b.definition))
    expect(criteriaSignature(a.definition)).not.toBe(criteriaSignature(c.definition))
  })

  it("summarises the criteria with the period of each condition", () => {
    const built = buildDefinition([rule({ metric_id: "profit_yoy", period: "quarter" }), rule({ metric_id: "roe", period: "ttm" })], { market: "HOSE", sector: "Công nghệ" }, "", metrics)
    if (!built.ok) throw new Error("fixture")
    expect(criteriaSummary(built.definition, metrics)).toBe("HOSE · Công nghệ · Tăng trưởng LNST YoY (Quý gần nhất) > 15 % · ROE (Bốn quý gần nhất) > 15 %")
    expect(criteriaSummary({ rules: [], scope }, metrics)).toBe("Chưa áp tiêu chí: toàn bộ doanh nghiệp trong phạm vi")
  })

  it("keeps the stored period of a 2.0 rule it can map and drops it for one that needs review", () => {
    const filter = {
      id: "f", name: "x", current_version: 1, version: 1, stored_schema_version: "2.0", definition_hash: "h", created_at: "", updated_at: "",
      legacy_review: { stored_schema_version: "2.0", legacy_period: "quarter", needs_review: true, rules: [{ rule_id: "a", metric_id: "profit_yoy", legacy_period: "quarter", mapped_period: "quarter", status: "ok", reason: null }, { rule_id: "b", metric_id: "roe", legacy_period: "quarter", mapped_period: "quarter", status: "needs_review", reason: "Cần chọn lại kỳ." }] },
      definition: { schema_version: "3.0", name: "x", logic: "AND", data_mode: "latest_disclosed", scope, rules: [{ id: "a", metric_id: "profit_yoy", period: "quarter", operator: ">", value: 0.15, api_unit: "ratio" }, { id: "b", metric_id: "roe", period: "quarter", operator: ">", value: 0.15, api_unit: "ratio" }] },
    } as unknown as SavedFilter
    const drafts = draftsFromFilter(filter)
    expect(drafts.map((draft) => draft.period)).toEqual(["quarter", null])
    expect(drafts[1]!.review).toBe("Cần chọn lại kỳ.")
    expect(drafts[0]!.displayValue).toBe("15")
  })
})

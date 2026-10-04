import { describe, expect, it } from "vitest"

import { buildDefinition, draftsFromDefinition, isMetricAddable } from "./definition"
import type { ScreenerMetric } from "./types"
import { displayInputText, formatDisplayNumber, metricCell, parseDisplayInput, toApiValue, toDisplayValue } from "./units"

const metric = (over: Partial<ScreenerMetric>): ScreenerMetric => ({
  id: "roe",
  name: "ROE",
  lesson_id: "ch03-l06",
  unit: "%",
  api_unit: "ratio",
  period: "TTM",
  applicability: "all",
  operators: [">", "<"],
  learned: true,
  supported: true,
  unsupported_reason: null,
  ...over,
})

describe("filter unit codec", () => {
  it("sends % thresholds as ratios and reads them back", () => {
    expect(toApiValue(15, "ratio")).toBe(0.15)
    expect(toApiValue(15.5, "ratio")).toBe(0.155)
    expect(toDisplayValue(0.155, "ratio")).toBe(15.5)
    expect(toDisplayValue(0.15, "ratio")).toBe(15)
    expect(toApiValue(-3.2, "ratio")).toBe(-0.032)
    expect(toApiValue(0, "ratio")).toBe(0)
  })

  it("removes floating-point noise from the ×/÷100 conversion", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754.
    expect(toApiValue(0.1 + 0.2, "ratio")).toBe(0.003)
    expect(toDisplayValue(0.07, "ratio")).toBe(7) // 0.07 * 100 = 7.000000000000001
    expect(toDisplayValue(0.0029, "ratio")).toBe(0.29)
    expect(toDisplayValue(toApiValue(33.33, "ratio"), "ratio")).toBe(33.33)
  })

  it("keeps lần / ngày / năm values unchanged", () => {
    expect(toApiValue(1.5, "lần")).toBe(1.5)
    expect(toApiValue(45, "ngày")).toBe(45)
    expect(toApiValue(3, "năm")).toBe(3)
    expect(toDisplayValue(12.25, "lần")).toBe(12.25)
  })

  it("parses comma or dot decimals and rejects empty or garbage input instead of using 0", () => {
    expect(parseDisplayInput("15,5")).toBe(15.5)
    expect(parseDisplayInput(" 15.5 ")).toBe(15.5)
    expect(parseDisplayInput("-2")).toBe(-2)
    expect(parseDisplayInput("")).toBeNull()
    expect(parseDisplayInput("abc")).toBeNull()
    expect(parseDisplayInput("1e400")).toBeNull()
    expect(parseDisplayInput("1,2,3")).toBeNull()
  })

  it("formats display numbers in vi-VN and missing values as an em dash", () => {
    expect(formatDisplayNumber(15.5)).toBe("15,5")
    expect(formatDisplayNumber(null)).toBe("—")
    expect(formatDisplayNumber(Number.NaN)).toBe("—")
    expect(displayInputText(0.155, "ratio")).toBe("15,5")
  })

  it("never renders a non-valid status as 0", () => {
    const base = { unit: "ratio", period: "TTM", available_at: null, source_revision: null }
    expect(metricCell({ ...base, value: 0.2, status: "valid" }, "ratio")).toEqual({ text: "20", badge: null, title: null })
    expect(metricCell({ ...base, value: 0, status: "valid" }, "ratio").text).toBe("0")
    expect(metricCell({ ...base, value: null, status: "missing" }, "ratio")).toMatchObject({ text: "—", badge: "Thiếu dữ liệu" })
    expect(metricCell({ ...base, value: 0, status: "missing" }, "ratio").text).toBe("—")
    expect(metricCell({ ...base, value: null, status: "not_applicable" }, "ratio").badge).toBe("Không áp dụng")
    expect(metricCell({ ...base, value: null, status: "non_positive_base" }, "ratio").badge).toBe("Không đủ cơ sở")
    expect(metricCell({ ...base, value: null, status: "undefined_denominator" }, "lần").badge).toBe("Không đủ cơ sở")
    expect(metricCell({ ...base, value: 5, status: "lower_bound" }, "năm")).toMatchObject({ text: "≥ 5", badge: "Cận dưới" })
    expect(metricCell(undefined, "ratio")).toMatchObject({ text: "—", badge: "Thiếu dữ liệu" })
  })
})

describe("filter definition", () => {
  const metrics = [
    metric({}),
    metric({ id: "pe", name: "P/E", unit: "lần", api_unit: "lần", lesson_id: "ch10-l01" }),
    metric({ id: "pb", name: "P/B", unit: "lần", api_unit: "lần", learned: false }),
    metric({ id: "ccc", name: "CCC", unit: "ngày", api_unit: "ngày", supported: false, unsupported_reason: "Chưa có nguồn" }),
  ]
  const scope = { market: "HOSE", sector: "all", period: "TTM" as const }

  it("only learned and supported metrics are addable", () => {
    expect(metrics.map(isMetricAddable)).toEqual([true, true, false, false])
  })

  it("builds an AND definition with API-unit values", () => {
    const result = buildDefinition(
      [
        { id: "r1", metric_id: "roe", operator: ">", displayValue: "15,5" },
        { id: "r2", metric_id: "pe", operator: "<", displayValue: "12" },
      ],
      scope,
      "  ",
      metrics,
    )
    expect(result).toEqual({
      ok: true,
      definition: {
        schema_version: "2.0",
        name: "Bộ lọc chưa lưu",
        logic: "AND",
        rules: [
          { id: "r1", metric_id: "roe", operator: ">", value: 0.155, api_unit: "ratio" },
          { id: "r2", metric_id: "pe", operator: "<", value: 12, api_unit: "lần" },
        ],
        scope,
      },
    })
  })

  it("rejects empty thresholds, unlearned and unsupported metrics", () => {
    expect(buildDefinition([{ id: "r", metric_id: "roe", operator: ">", displayValue: "" }], scope, "x", metrics).ok).toBe(false)
    expect(buildDefinition([{ id: "r", metric_id: "pb", operator: ">", displayValue: "1" }], scope, "x", metrics).ok).toBe(false)
    expect(buildDefinition([{ id: "r", metric_id: "ccc", operator: ">", displayValue: "1" }], scope, "x", metrics).ok).toBe(false)
  })

  it("allows an empty rule set (scope-only filter)", () => {
    const result = buildDefinition([], scope, "Chỉ phạm vi", metrics)
    expect(result.ok && result.definition.rules).toEqual([])
  })

  it("restores saved thresholds in display units", () => {
    expect(
      draftsFromDefinition({
        schema_version: "2.0",
        name: "x",
        logic: "AND",
        rules: [{ id: "r1", metric_id: "roe", operator: "<", value: 0.155, api_unit: "ratio" }],
        scope,
      }),
    ).toEqual([{ id: "r1", metric_id: "roe", operator: "<", displayValue: "15,5" }])
  })
})

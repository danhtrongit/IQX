/**
 * §7.1.3 "giống tự thiết lập": every seeded Bộ lọc IQX (read from the backend seed, the same JSON the
 * migration inserts) filled by "Dùng" gives the same definition 4.0 and criteriaSignature as a user who
 * adds each item with "+" and types each value.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { registryFor } from "../../demo-trading/bot/test-support"
import type { MetricView } from "../test-support"
import { buildDefinition, criteriaSignature, newRuleId, type FilterDraft } from "./definition"
import { filterDraftFromIqx, iqxFilterCounts, iqxSaveName, isFilterDraftEmpty, withOrigin } from "./iqx"
import { emptyMarketDraft, toggleValue } from "./market"
import { draftRow } from "@/pages/demo-trading/bot/config/draft"
import type { ConditionRow } from "@/pages/demo-trading/bot/config/types"
import { newTechnicalDraft, type TechnicalDraft } from "./technical"
import type { FilterDefinition, MetricId, RowsTechnicalItem, ScreenerMetric, VolumeTechnicalItem } from "./types"
import { displayInputText } from "./units"

type SeedFilter = { slug: string; content: { name: string; definition: FilterDefinition } }
const seed = JSON.parse(readFileSync(resolve(process.cwd(), "../backend/src/modules/iqx-templates/iqx-templates.seed.json"), "utf8")) as {
  filter: SeedFilter[]
}
const registry = registryFor([])

/** The metrics as the screener serves them for the seed: learned, supported, the seed's unit and period. */
function metricsFor(definitions: readonly FilterDefinition[]): ScreenerMetric[] {
  const byId = new Map<string, MetricView>()
  for (const definition of definitions)
    for (const rule of definition.rules) {
      const existing = byId.get(rule.metric_id)
      const periods = new Set([...(existing?.allowed_periods.map((item) => item.id) ?? []), rule.period])
      byId.set(rule.metric_id, {
        id: rule.metric_id,
        name: rule.metric_id,
        lesson_id: null,
        unit: "",
        api_unit: rule.api_unit,
        period: "",
        default_period: "quarter",
        allowed_periods: [...periods].map((id) => ({ id, label: id })),
        readiness: "ready",
        applicability: "all",
        operators: [">", "<"],
        learned: true,
        supported: true,
        unsupported_reason: null,
      } as unknown as MetricView)
    }
  return [...byId.values()] as unknown as ScreenerMetric[]
}
const metrics = metricsFor(seed.filter.map((item) => item.content.definition))
const metricById = new Map(metrics.map((metric) => [metric.id, metric]))

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value).replace(".", ","))

/** A user builds the filter by hand: empty form, toggles, "+" of each metric and indicator, then typing. */
function byHand(definition: FilterDefinition): FilterDraft {
  let market = emptyMarketDraft()
  for (const exchange of definition.market.exchanges ?? []) market = { ...market, exchanges: toggleValue(market.exchanges, exchange) }
  for (const basket of definition.market.baskets ?? []) market = { ...market, baskets: toggleValue(market.baskets, basket) }
  for (const group of definition.market.statement_groups ?? []) market = { ...market, groups: toggleValue(market.groups, group) }
  market = {
    ...market,
    capMin: text(definition.market.market_cap?.min),
    capMax: text(definition.market.market_cap?.max),
    avgSessions: String(definition.market.avg_value?.sessions ?? 20),
    avgMin: text(definition.market.avg_value?.min),
    priceMin: text(definition.market.close_price?.min),
    priceMax: text(definition.market.close_price?.max),
  }
  const rules = definition.rules.map((rule) => {
    const metric = metricById.get(rule.metric_id as MetricId)!
    const added = { id: newRuleId(), metric_id: metric.id, period: metric.default_period, operator: ">" as const, displayValue: "" }
    return { ...added, period: rule.period, operator: rule.operator, displayValue: displayInputText(rule.value, rule.api_unit) }
  })
  const technical: TechnicalDraft[] = (definition.technical ?? []).map((item) => {
    const card = newTechnicalDraft(registry.indicators.find((entry) => entry.id === item.indicator)!)
    if (card.kind === "volume") {
      const volume = item as VolumeTechnicalItem
      return { ...card, sessions: String(volume.sessions), factor: String(volume.factor).replace(".", ","), ops: [volume.ops[0], volume.ops[1]] as typeof card.ops }
    }
    return { ...card, rows: (item as RowsTechnicalItem).rules.map((row) => draftRow(row as ConditionRow)) }
  })
  return { rules, market, technical }
}

const withoutIds = (definition: FilterDefinition) => ({ ...definition, rules: definition.rules.map((rule) => ({ ...rule, id: "" })) })

describe("Bộ lọc IQX filled by Dùng = built by hand (§7.1.3)", () => {
  it.each(seed.filter.map((item) => [item.slug, item] as const))("%s", (_slug, item) => {
    const definition = item.content.definition
    const filled = buildDefinition(filterDraftFromIqx(definition), "", metrics, registry)
    const manual = buildDefinition(byHand(definition), "", metrics, registry)
    expect(filled.ok, filled.ok ? "" : filled.error).toBe(true)
    expect(manual.ok, manual.ok ? "" : manual.error).toBe(true)
    if (!filled.ok || !manual.ok) return
    expect(withoutIds(filled.definition)).toEqual(withoutIds(manual.definition))
    expect(criteriaSignature(filled.definition)).toBe(criteriaSignature(manual.definition))
    // …and it is the seeded filter itself (criteria-wise).
    expect(criteriaSignature(filled.definition)).toBe(criteriaSignature(definition))
    expect(filled.definition.technical).toEqual(definition.technical)
  })

  it("an origin never changes the criteria", () => {
    const definition = seed.filter[0]!.content.definition
    const origin = { type: "iqx_filter" as const, id: "00000000-0000-4000-8000-000000000001", version: 1 }
    const saved = withOrigin(definition, origin)
    expect(saved.origin).toEqual(origin)
    expect(criteriaSignature(saved)).toBe(criteriaSignature(definition))
    expect(withOrigin(definition, null)).not.toHaveProperty("origin")
  })
})

describe("tab IQX helpers", () => {
  it("counts Thị trường, Cơ bản and Kỹ thuật like the cards of the spec", () => {
    const counts = Object.fromEntries(seed.filter.map((item) => [item.slug, iqxFilterCounts(item.content.definition)]))
    expect(counts).toEqual({
      giatri: ["Thị trường 3", "Cơ bản 5"],
      chatluong: ["Thị trường 2", "Cơ bản 5"],
      garp: ["Thị trường 2", "Cơ bản 4"],
      canslim: ["Thị trường 1", "Cơ bản 3", "Kỹ thuật 2"],
      phadinh: ["Thị trường 2", "Kỹ thuật 3"],
      hoiphuc: ["Thị trường 2", "Kỹ thuật 3"],
    })
  })

  it("treats a form as empty only with no condition, no choice and no bound (N of GTGD aside)", () => {
    const empty: FilterDraft = { rules: [], market: emptyMarketDraft(), technical: [] }
    expect(isFilterDraftEmpty(empty)).toBe(true)
    expect(isFilterDraftEmpty({ ...empty, market: { ...emptyMarketDraft(), avgSessions: "30" } })).toBe(true)
    expect(isFilterDraftEmpty({ ...empty, market: { ...emptyMarketDraft(), exchanges: ["HOSE"] } })).toBe(false)
    expect(isFilterDraftEmpty({ ...empty, market: { ...emptyMarketDraft(), priceMax: "50" } })).toBe(false)
    expect(isFilterDraftEmpty(filterDraftFromIqx(seed.filter[4]!.content.definition))).toBe(false)
  })

  it("suggests the save name of §2.3.5", () => {
    expect(iqxSaveName("Giá trị")).toBe("Giá trị (từ Bộ lọc IQX)")
  })
})

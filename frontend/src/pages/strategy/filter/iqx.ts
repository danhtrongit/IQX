/**
 * Bộ lọc IQX (tab IQX §2): a definition 4.0 poured into the SAME drafts the form edits. The rules,
 * Thị trường and Kỹ thuật cards come out exactly as if the user had added each item and typed each
 * value (the "giống tự thiết lập" check of §7.1.3 compares both paths).
 */
import type { IqxFilterOrigin } from "../shared/iqx"
import { newRuleId, type FilterDraft } from "./definition"
import { draftFromMarket, type MarketDraft } from "./market"
import { draftsFromItems } from "./technical"
import type { DraftRule, FilterDefinition, MetricId } from "./types"
import { displayInputText } from "./units"

/** The drafts of the form for a Bộ lọc IQX: a new, unsaved filter (rule ids are new, like "+"). */
export function filterDraftFromIqx(definition: FilterDefinition): FilterDraft {
  const rules: DraftRule[] = definition.rules.map((rule) => ({
    id: newRuleId(),
    metric_id: rule.metric_id as MetricId,
    period: rule.period,
    operator: rule.operator,
    displayValue: displayInputText(rule.value, rule.api_unit),
  }))
  return { rules, market: draftFromMarket(definition.market), technical: draftsFromItems(definition.technical) }
}

/** "Trống" of §2.3.1: no condition, nothing chosen in Sàn/Rổ/Ngành and every bound box empty (N of GTGD aside). */
export function isFilterDraftEmpty(draft: FilterDraft): boolean {
  const market: MarketDraft = draft.market
  return (
    draft.rules.length === 0 &&
    draft.technical.length === 0 &&
    market.exchanges.length === 0 &&
    market.baskets.length === 0 &&
    market.groups.length === 0 &&
    [market.capMin, market.capMax, market.avgMin, market.priceMin, market.priceMax].every((value) => value.trim() === "")
  )
}

/** Labels of a card: `Thị trường N` · `Cơ bản N` · `Kỹ thuật N`, only the groups that have something. */
export function iqxFilterCounts(definition: FilterDefinition): string[] {
  const market = definition.market
  const marketCount =
    [market.exchanges, market.baskets, market.statement_groups].filter((list) => (list?.length ?? 0) > 0).length +
    (market.market_cap?.min != null || market.market_cap?.max != null ? 1 : 0) +
    (market.avg_value?.min != null ? 1 : 0) +
    (market.close_price?.min != null || market.close_price?.max != null ? 1 : 0)
  const technical = definition.technical?.length ?? 0
  return [
    marketCount > 0 ? `Thị trường ${marketCount}` : null,
    definition.rules.length > 0 ? `Cơ bản ${definition.rules.length}` : null,
    technical > 0 ? `Kỹ thuật ${technical}` : null,
  ].filter((label): label is string => label !== null)
}

/** The definition sent by "Lưu bộ lọc": `origin` rides along, never in the criteria (§2.3.5). */
export function withOrigin<T extends object>(definition: T, origin: IqxFilterOrigin | null): T & { origin?: IqxFilterOrigin } {
  return origin ? { ...definition, origin } : definition
}

export const iqxSaveName = (name: string) => `${name} (từ Bộ lọc IQX)`

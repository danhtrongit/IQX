/**
 * Kỹ thuật (Bộ lọc 4.0 §3): the 16 indicators of the Bot (15 row-based + Khối lượng) as condition
 * cards. The definitions, defaults, limits and messages are the Bot's own: rows come from
 * `GET /strategy/registry/technical`, start at the Bot's Mua defaults and are checked by the Bot's
 * `validateSideRows`; only the `Mua · dòng N:` prefix becomes `{Tên} · Dòng N:` because the filter
 * has no Mua/Bán tab. Every number stays the text typed until the definition is built.
 */
import { defaultRows, draftRow, rowFromDraft, type DraftRow } from "@/pages/demo-trading/bot/config/draft"
import type { FlaggedField } from "@/pages/demo-trading/bot/config/condition-rows"
import { rowSentence } from "@/pages/demo-trading/bot/config/labels"
import { isRowsIndicator, type ConditionRow, type RowsIndicator, type TechnicalIndicator, type TechnicalRegistry } from "@/pages/demo-trading/bot/config/types"
import { validateSideRows } from "@/pages/demo-trading/bot/config/validate"

import type { RowsTechnicalItem, TechnicalCell, TechnicalItem, VolumeTechnicalItem } from "./types"
import { parseDisplayInput } from "./units"

/** Groups of the library, in the order of the spec; the ids inside a group follow the mockup. */
export const TECHNICAL_GROUPS: ReadonlyArray<{ title: string; ids: readonly string[] }> = [
  { title: "Đường trung bình", ids: ["ma", "ema", "ma_cross"] },
  { title: "Động lượng", ids: ["rsi", "macd", "stochastic", "cci", "roc", "williams_r"] },
  { title: "Biến động", ids: ["bollinger"] },
  { title: "Kênh giá", ids: ["donchian"] },
  { title: "Xu hướng", ids: ["dmi"] },
  { title: "Khối lượng", ids: ["obv", "volume"] },
  { title: "Dòng tiền", ids: ["mfi", "cmf"] },
]

/** Display names, the same as the Bot registry's, for the places that have no registry at hand (summaries). */
const INDICATOR_NAMES: Readonly<Record<string, string>> = {
  rsi: "RSI",
  macd: "MACD",
  ma: "MA / SMA",
  bollinger: "Bollinger Bands",
  volume: "Khối lượng",
  ema: "EMA",
  ma_cross: "MA Cross",
  dmi: "DMI",
  stochastic: "Stochastic",
  cci: "CCI",
  obv: "OBV",
  mfi: "MFI",
  cmf: "Chaikin Money Flow",
  donchian: "Donchian Channel",
  roc: "ROC",
  williams_r: "Williams %R",
}

export function indicatorName(id: string, registry?: Pick<TechnicalRegistry, "indicators">): string {
  return registry?.indicators.find((entry) => entry.id === id)?.name ?? INDICATOR_NAMES[id] ?? id
}

export function indicatorGroup(id: string): string {
  return TECHNICAL_GROUPS.find((group) => group.ids.includes(id))?.title ?? ""
}

/** The indicators of the library, grouped, in the spec order; an indicator the registry lacks is left out. */
export function technicalLibrary(registry: Pick<TechnicalRegistry, "indicators"> | undefined): Array<{ title: string; indicators: TechnicalIndicator[] }> {
  if (!registry) return []
  const byId = new Map(registry.indicators.map((entry) => [entry.id, entry]))
  return TECHNICAL_GROUPS.map((group) => ({
    title: group.title,
    indicators: group.ids.flatMap((id) => {
      const entry = byId.get(id)
      return entry ? [entry] : []
    }),
  })).filter((group) => group.indicators.length > 0)
}

export type VolumeOp = ">" | "<"
export const VOLUME_OPS: readonly VolumeOp[] = [">", "<"]

export const VOLUME_SESSIONS_DEFAULT = 20
export const VOLUME_SESSIONS_MIN = 5
export const VOLUME_SESSIONS_MAX = 100
/** Spec §3.3: k defaults to 1,1 (the Bot registry stores 1). */
export const VOLUME_FACTOR_DEFAULT = 1.1
export const VOLUME_FACTOR_MIN = 0.5
export const VOLUME_FACTOR_MAX = 3
export const VOLUME_FACTOR_STEP = 0.1

export type RowsDraft = { kind: "rows"; indicator: string; rows: DraftRow[] }
export type VolumeDraft = { kind: "volume"; indicator: "volume"; sessions: string; factor: string; ops: [VolumeOp, VolumeOp] }
export type TechnicalDraft = RowsDraft | VolumeDraft

const decimalText = (value: number): string => String(value).replace(".", ",")

/** The card of an indicator as it is first added: the Bot's Mua rows and switches; Khối lượng N = 20, k = 1,1, both `>`. */
export function newTechnicalDraft(indicator: TechnicalIndicator): TechnicalDraft {
  if (isRowsIndicator(indicator)) {
    return { kind: "rows", indicator: indicator.id, rows: defaultRows(indicator, "buy").map(draftRow) }
  }
  const [first, second] = indicator.buy.rules.map((rule) => (rule.op === "<" ? "<" : ">") as VolumeOp)
  return {
    kind: "volume",
    indicator: "volume",
    sessions: String(indicator.buy.params.lookback ?? VOLUME_SESSIONS_DEFAULT),
    factor: decimalText(VOLUME_FACTOR_DEFAULT),
    ops: [first ?? ">", second ?? ">"],
  }
}

/** Switched-on condition rows of a card; Khối lượng always counts its two rows. */
export function enabledRows(draft: TechnicalDraft): number {
  return draft.kind === "volume" ? 2 : draft.rows.filter((row) => row.enabled).length
}

export function enabledRowTotal(drafts: readonly TechnicalDraft[]): number {
  return drafts.reduce((sum, draft) => sum + enabledRows(draft), 0)
}

export type TechnicalProblems = {
  /** Messages in the order the card shows them. */
  messages: string[]
  /** Fields to mark invalid in the card's rows (rows only). */
  flagged: FlaggedField[]
}

/** `Mua · dòng 2: …` of the Bot validator → `RSI · Dòng 2: …` (the filter has no Mua/Bán tab). */
export function rewriteBotMessage(message: string, name: string): string {
  return message.replace(/^Mua · dòng (\d+): /, `${name} · Dòng $1: `).replace(`${name} Mua`, name)
}

const viNumber = (value: number): string => String(value).replace(".", ",")

export type VolumeErrors = { sessions?: string; factor?: string }

/** Spec §3.5 for Khối lượng, without the `Khối lượng · ` prefix: N is an integer 5 to 100, k a multiple of 0,1 from 0,5 to 3. */
export function volumeErrors(draft: VolumeDraft): VolumeErrors {
  const errors: VolumeErrors = {}
  const sessions = parseDisplayInput(draft.sessions)
  if (sessions === null || !Number.isInteger(sessions) || sessions < VOLUME_SESSIONS_MIN || sessions > VOLUME_SESSIONS_MAX) {
    errors.sessions = `Số phiên tham chiếu phải từ ${VOLUME_SESSIONS_MIN} đến ${VOLUME_SESSIONS_MAX}, số nguyên.`
  }
  const factor = parseDisplayInput(draft.factor)
  if (factor === null || factor < VOLUME_FACTOR_MIN || factor > VOLUME_FACTOR_MAX) {
    errors.factor = `Hệ số khối lượng phải từ ${viNumber(VOLUME_FACTOR_MIN)} đến ${viNumber(VOLUME_FACTOR_MAX)}.`
  } else {
    const steps = (factor - VOLUME_FACTOR_MIN) / VOLUME_FACTOR_STEP
    if (Math.abs(steps - Math.round(steps)) > 1e-6) errors.factor = `Hệ số khối lượng phải theo bước ${viNumber(VOLUME_FACTOR_STEP)}.`
  }
  return errors
}

function volumeProblems(draft: VolumeDraft): TechnicalProblems {
  const errors = volumeErrors(draft)
  return { messages: [errors.sessions, errors.factor].flatMap((message) => (message ? [`Khối lượng · ${message}`] : [])), flagged: [] }
}

/** The Bot's own row validation (every row, on or off), or the Khối lượng checks of spec §3.5. */
export function technicalProblems(draft: TechnicalDraft, indicator: TechnicalIndicator | undefined): TechnicalProblems {
  if (draft.kind === "volume") return volumeProblems(draft)
  if (!indicator || !isRowsIndicator(indicator)) return { messages: [], flagged: [] }
  const errors = validateSideRows(indicator.id, indicator.rows, "buy", draft.rows)
  return {
    messages: errors.map((error) => rewriteBotMessage(error.message, indicator.name)),
    flagged: errors.map((error) => ({ row: error.row, field: error.field })),
  }
}

/** Every message of every card, in card order: what the run button reports first. */
export function technicalFirstError(drafts: readonly TechnicalDraft[], registry: TechnicalRegistry | undefined): string | null {
  for (const draft of drafts) {
    const indicator = registry?.indicators.find((entry) => entry.id === draft.indicator)
    const [first] = technicalProblems(draft, indicator).messages
    if (first) return first
  }
  return null
}

/** Cards → the `technical` list of definition 4.0 (cards with a wrong value are rejected before this). */
export function technicalFromDrafts(drafts: readonly TechnicalDraft[], registry: TechnicalRegistry): TechnicalItem[] {
  const items: TechnicalItem[] = []
  for (const draft of drafts) {
    if (draft.kind === "volume") {
      const item: VolumeTechnicalItem = {
        indicator: "volume",
        sessions: parseDisplayInput(draft.sessions) ?? VOLUME_SESSIONS_DEFAULT,
        factor: parseDisplayInput(draft.factor) ?? VOLUME_FACTOR_DEFAULT,
        ops: [draft.ops[0], draft.ops[1]],
      }
      items.push(item)
      continue
    }
    const indicator = registry.indicators.find((entry) => entry.id === draft.indicator)
    if (!indicator || !isRowsIndicator(indicator)) continue
    const item: RowsTechnicalItem = {
      indicator: indicator.id as RowsTechnicalItem["indicator"],
      rules: indicator.rows.map((definition, index) => rowFromDraft(definition, draft.rows[index] ?? { id: definition.id, enabled: false, values: {} })),
    }
    items.push(item)
  }
  return items
}

function volumeOp(value: unknown): VolumeOp {
  return value === "<" ? "<" : ">"
}

/** Stored `technical` items as cards, every row kept as typed (a switched-off row too). */
export function draftsFromItems(items: readonly TechnicalItem[] | null | undefined): TechnicalDraft[] {
  return (items ?? []).map((item): TechnicalDraft => {
    if (item.indicator === "volume") {
      const volume = item as VolumeTechnicalItem
      return {
        kind: "volume",
        indicator: "volume",
        sessions: String(volume.sessions),
        factor: decimalText(volume.factor),
        ops: [volumeOp(volume.ops?.[0]), volumeOp(volume.ops?.[1])],
      }
    }
    return { kind: "rows", indicator: item.indicator, rows: (item as RowsTechnicalItem).rules.map((rule) => draftRow(rule as ConditionRow)) }
  })
}

/** The indicator definition behind a card (rows only). */
export function rowsIndicatorOf(registry: TechnicalRegistry | undefined, id: string): RowsIndicator | undefined {
  const indicator = registry?.indicators.find((entry) => entry.id === id)
  return indicator && isRowsIndicator(indicator) ? indicator : undefined
}

/** Items that count as criteria: switched-on rows only (Khối lượng always), sorted by indicator. */
export function enabledItems(items: readonly TechnicalItem[] | null | undefined): TechnicalItem[] {
  const out: TechnicalItem[] = []
  for (const item of items ?? []) {
    if (item.indicator === "volume") {
      out.push(item)
      continue
    }
    const rules = (item as RowsTechnicalItem).rules.filter((rule) => rule.enabled === true)
    if (rules.length > 0) out.push({ indicator: item.indicator, rules } as RowsTechnicalItem)
  }
  return out.sort((a, b) => a.indicator.localeCompare(b.indicator))
}

/** Switched-on rows of stored items (Khối lượng counts its two). */
export function enabledItemRows(items: readonly TechnicalItem[] | null | undefined): number {
  return enabledItems(items).reduce((sum, item) => sum + (item.indicator === "volume" ? 2 : (item as RowsTechnicalItem).rules.length), 0)
}

/** `RSI (2 dòng)`, `Khối lượng`: one entry per indicator with something switched on, in the order the Bot lists them. */
export function technicalSummary(items: readonly TechnicalItem[] | null | undefined, registry?: Pick<TechnicalRegistry, "indicators">): string[] {
  const order = TECHNICAL_GROUPS.flatMap((group) => group.ids)
  const position = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  return enabledItems(items)
    .sort((a, b) => position(a.indicator) - position(b.indicator))
    .map((item) => (item.indicator === "volume" ? indicatorName("volume", registry) : `${indicatorName(item.indicator, registry)} (${(item as RowsTechnicalItem).rules.length} dòng)`))
}

/**
 * What a result cell tested, in the Bot's own words: `RSI 14 cắt lên 30` from the registry sentence and
 * the row's own values; Khối lượng has two fixed rows (`Giá nay / trước`, `KL / k×TB N`). `null` when the
 * registry has no sentence for the row (not loaded yet).
 */
export function cellSentence(
  cell: Pick<TechnicalCell, "indicator" | "row_id" | "op" | "params">,
  registry: TechnicalRegistry | undefined,
  items: readonly TechnicalItem[] = [],
): string | null {
  if (cell.indicator === "volume") {
    const volume = items.find((item): item is VolumeTechnicalItem => item.indicator === "volume")
    const first = cell.row_id === "r1"
    const op = cell.op ?? volume?.ops[first ? 0 : 1] ?? ">"
    if (first) return `Giá đóng cửa ${op} giá đóng cửa phiên trước`
    return `Khối lượng ${op} ${viNumber(Number(cell.params.mult))} × khối lượng trung bình ${cell.params.lookback} phiên trước`
  }
  const definition = rowsIndicatorOf(registry, cell.indicator)?.rows.find((row) => row.id === cell.row_id)
  return definition ? rowSentence(definition, cell.params) : null
}

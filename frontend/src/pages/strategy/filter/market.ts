/**
 * Thị trường (Bộ lọc 4.0 §2): sàn, rổ chỉ số, nhóm báo cáo tài chính (Ngành), vốn hóa, giá trị giao
 * dịch bình quân and giá đóng cửa, as the user edits them and as the definition 4.0 carries them.
 *
 * - The draft keeps every number as the text typed (`1.000`, `0,5`); `parseDisplayInput` accepts a
 *   comma as the decimal mark. An empty text is "no filter", never 0; a text that is not a number
 *   is an error, never silently dropped.
 * - Messages are the server's (`marketIssues`), prefixed `Cơ bản · Thị trường: `, so the run button
 *   and the API say the same thing.
 * - A 3.0 filter with an ICB sector comes back flagged (`needs_review: "sector"`): the sector is
 *   evidence only and the filter cannot run or be saved until the user chooses a group again.
 */
import type { MarketScope } from "./types"
import { formatDisplayNumber, parseDisplayInput } from "./units"

export const EXCHANGE_OPTIONS = [
  { value: "HOSE", label: "HOSE" },
  { value: "HNX", label: "HNX" },
  { value: "UPCOM", label: "UPCOM" },
] as const

export const BASKET_OPTIONS = [
  { value: "VN30", label: "VN30" },
  { value: "VN100", label: "VN100" },
  { value: "VNMIDCAP", label: "VNMidcap" },
  { value: "VNSMALLCAP", label: "VNSmallcap" },
  { value: "HNX30", label: "HNX30" },
] as const

/** Nhóm báo cáo tài chính: the statement template, not the ICB sector. */
export const GROUP_OPTIONS = [
  { value: "thuong", label: "Thường" },
  { value: "nh", label: "Ngân hàng" },
  { value: "ck", label: "Chứng khoán" },
  { value: "bh", label: "Bảo hiểm" },
] as const

export const GROUP_LABEL: Readonly<Record<string, string>> = Object.fromEntries(GROUP_OPTIONS.map((option) => [option.value, option.label]))

export const AVG_SESSIONS_DEFAULT = 20
export const AVG_SESSIONS_MIN = 5
export const AVG_SESSIONS_MAX = 100

export const MARKET_ERROR_PREFIX = "Cơ bản · Thị trường: "

export type MarketDraft = {
  exchanges: string[]
  baskets: string[]
  groups: string[]
  /** Vốn hóa, tỷ đồng. */
  capMin: string
  capMax: string
  /** Giá trị giao dịch bình quân: TB `avgSessions` phiên ≥ `avgMin` tỷ đồng. */
  avgSessions: string
  avgMin: string
  /** Giá đóng cửa, nghìn đồng. */
  priceMin: string
  priceMax: string
  /** The ICB sector of a stored 3.0 filter that must be chosen again; `null` when nothing is pending. */
  reviewSector: string | null
}

export function emptyMarketDraft(): MarketDraft {
  return {
    exchanges: [],
    baskets: [],
    groups: [],
    capMin: "",
    capMax: "",
    avgSessions: String(AVG_SESSIONS_DEFAULT),
    avgMin: "",
    priceMin: "",
    priceMax: "",
    reviewSector: null,
  }
}

/** Adds the value to the list, or removes it when it is already there. */
export function toggleValue(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

type Bound = { state: "empty" } | { state: "invalid" } | { state: "number"; value: number }

function bound(text: string): Bound {
  if (text.trim() === "") return { state: "empty" }
  const value = parseDisplayInput(text)
  return value === null ? { state: "invalid" } : { state: "number", value }
}

const valueOf = (item: Bound): number | null => (item.state === "number" ? item.value : null)

export type MarketField = "cap" | "price" | "avg"
export type MarketErrors = Partial<Record<MarketField, string>>

function rangeError(label: "Vốn hóa" | "Giá", negative: string, min: Bound, max: Bound): string | undefined {
  if (min.state === "invalid" || max.state === "invalid") return `${label}: nhập số.`
  const low = valueOf(min)
  const high = valueOf(max)
  if ((low !== null && low < 0) || (high !== null && high < 0)) return negative
  if (low !== null && high !== null && low > high) return `${label}: "từ" phải nhỏ hơn hoặc bằng "đến".`
  return undefined
}

/** The message under each Thị trường field (without the prefix), in the order the run button reports them. */
export function marketErrors(draft: MarketDraft): MarketErrors {
  const errors: MarketErrors = {}
  const cap = rangeError("Vốn hóa", "Vốn hóa không được âm.", bound(draft.capMin), bound(draft.capMax))
  if (cap) errors.cap = cap
  const price = rangeError("Giá", "Giá không được âm.", bound(draft.priceMin), bound(draft.priceMax))
  if (price) errors.price = price
  const sessions = bound(draft.avgSessions)
  const minimum = bound(draft.avgMin)
  if (sessions.state !== "number" || !Number.isInteger(sessions.value) || sessions.value < AVG_SESSIONS_MIN || sessions.value > AVG_SESSIONS_MAX) {
    errors.avg = `Số phiên phải từ ${AVG_SESSIONS_MIN} đến ${AVG_SESSIONS_MAX}, số nguyên.`
  } else if (minimum.state === "invalid" || (minimum.state === "number" && minimum.value < 0)) {
    errors.avg = "Giá trị giao dịch phải là số không âm."
  }
  return errors
}

/** `Cơ bản · Thị trường: Vốn hóa: nhập số.` for the first wrong field, or `null`. */
export function marketFirstError(draft: MarketDraft): string | null {
  const errors = marketErrors(draft)
  const first = errors.cap ?? errors.price ?? errors.avg
  return first ? `${MARKET_ERROR_PREFIX}${first}` : null
}

/** What the run and save buttons say while a 3.0 filter's ICB sector has not been chosen again. */
export function sectorReviewError(sector: string): string {
  return `Chọn lại ngành: ngành ICB “${sector}” của bộ lọc cũ không còn được hỗ trợ.`
}

/** The red line inside the Thị trường block while the sector is pending. */
export function sectorReviewNotice(sector: string): string {
  return `Bộ lọc cũ dùng ngành ICB “${sector}”, không còn được hỗ trợ. Hệ thống không tự đổi: hãy chọn lại Ngành bên dưới.`
}

const inOptionOrder = (values: readonly string[], options: ReadonlyArray<{ value: string }>): string[] =>
  options.map((option) => option.value).filter((value) => values.includes(value))

/** The market block of definition 4.0 for a draft with no error: selections in list order, bounds as numbers or `null`. */
export function marketFromDraft(draft: MarketDraft): MarketScope {
  return {
    exchanges: inOptionOrder(draft.exchanges, EXCHANGE_OPTIONS) as NonNullable<MarketScope["exchanges"]>,
    baskets: inOptionOrder(draft.baskets, BASKET_OPTIONS) as NonNullable<MarketScope["baskets"]>,
    statement_groups: inOptionOrder(draft.groups, GROUP_OPTIONS) as NonNullable<MarketScope["statement_groups"]>,
    market_cap: { min: valueOf(bound(draft.capMin)), max: valueOf(bound(draft.capMax)) },
    avg_value: { sessions: valueOf(bound(draft.avgSessions)) ?? AVG_SESSIONS_DEFAULT, min: valueOf(bound(draft.avgMin)) },
    close_price: { min: valueOf(bound(draft.priceMin)), max: valueOf(bound(draft.priceMax)) },
  }
}

/** Thị trường that restricts nothing (a result saved before 4.0 has no market block). */
export function emptyMarket(): MarketScope {
  return marketFromDraft(emptyMarketDraft())
}

const textOf = (value: number | null | undefined): string => (value === null || value === undefined || !Number.isFinite(value) ? "" : String(value).replace(".", ","))
const listOf = (value: readonly string[] | null | undefined): string[] => (Array.isArray(value) ? [...value] : [])

/** A stored market block as a draft; `HSX` is `HOSE`, an ICB sector flag becomes `reviewSector`. */
export function draftFromMarket(market: MarketScope): MarketDraft {
  return {
    exchanges: inOptionOrder(listOf(market.exchanges).map((value) => (value === "HSX" ? "HOSE" : value)), EXCHANGE_OPTIONS),
    baskets: inOptionOrder(listOf(market.baskets).map((value) => value.toUpperCase()), BASKET_OPTIONS),
    groups: inOptionOrder(listOf(market.statement_groups), GROUP_OPTIONS),
    capMin: textOf(market.market_cap?.min),
    capMax: textOf(market.market_cap?.max),
    avgSessions: String(market.avg_value?.sessions ?? AVG_SESSIONS_DEFAULT),
    avgMin: textOf(market.avg_value?.min),
    priceMin: textOf(market.close_price?.min),
    priceMax: textOf(market.close_price?.max),
    reviewSector: market.needs_review === "sector" ? (market.legacy_sector ?? "") : null,
  }
}

/** Same selection, same bytes: sorted unique lists (`HSX` is `HOSE`), numbers or `null`, no review flag. */
export function canonicalMarket(market: MarketScope): {
  exchanges: string[]
  baskets: string[]
  statement_groups: string[]
  market_cap: { min: number | null; max: number | null }
  avg_value: { sessions: number; min: number | null }
  close_price: { min: number | null; max: number | null }
} {
  const unique = (values: readonly string[] | null | undefined, map: (value: string) => string = (value) => value) => [...new Set(listOf(values).map(map))].sort()
  const number = (value: number | null | undefined): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
  return {
    exchanges: unique(market.exchanges, (value) => (value.toUpperCase() === "HSX" ? "HOSE" : value.toUpperCase())),
    baskets: unique(market.baskets, (value) => value.toUpperCase()),
    statement_groups: unique(market.statement_groups),
    market_cap: { min: number(market.market_cap?.min), max: number(market.market_cap?.max) },
    avg_value: { sessions: number(market.avg_value?.sessions) ?? AVG_SESSIONS_DEFAULT, min: number(market.avg_value?.min) },
    close_price: { min: number(market.close_price?.min), max: number(market.close_price?.max) },
  }
}

function rangeText(label: string, min: number | null, max: number | null, unit: string): string | null {
  if (min === null && max === null) return null
  const shown = (value: number) => formatDisplayNumber(value)
  if (min !== null && max !== null) return `${label} từ ${shown(min)} đến ${shown(max)} ${unit}`
  return min !== null ? `${label} từ ${shown(min)} ${unit}` : `${label} đến ${shown(max as number)} ${unit}`
}

/**
 * Thị trường part of a criteria summary: sàn, rổ, nhóm ngành, khoảng vốn hóa, `GTGD TB{N} ≥ X tỷ`,
 * khoảng giá. A part that restricts nothing is left out.
 */
export function marketSummary(market: MarketScope): string[] {
  const canonical = canonicalMarket(market)
  const basketLabel = (code: string) => BASKET_OPTIONS.find((option) => option.value === code)?.label ?? code
  const parts: Array<string | null> = [
    canonical.exchanges.length > 0 ? canonical.exchanges.join(", ") : null,
    canonical.baskets.length > 0 ? canonical.baskets.map(basketLabel).join(", ") : null,
    canonical.statement_groups.length > 0 ? inOptionOrder(canonical.statement_groups, GROUP_OPTIONS).map((group) => GROUP_LABEL[group] ?? group).join(", ") : null,
    rangeText("Vốn hóa", canonical.market_cap.min, canonical.market_cap.max, "tỷ"),
    canonical.avg_value.min !== null ? `GTGD TB${canonical.avg_value.sessions} ≥ ${formatDisplayNumber(canonical.avg_value.min)} tỷ` : null,
    rangeText("Giá", canonical.close_price.min, canonical.close_price.max, "nghìn đ"),
  ]
  return parts.filter((part): part is string => part !== null)
}

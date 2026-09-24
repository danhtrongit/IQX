/**
 * Market-analysis briefs. The `/latest` endpoints answer with the analysis
 * object directly (no `{ data, meta }` envelope) and are public — the same
 * contract the legacy `market-overview` client consumed.
 */
import { api, ApiError } from "@/lib/api"
import type { MarketReportV2 } from "@/lib/generated/backend-v2"

import type { DailyAnalysis, MarketCharts, MidDayAnalysis, PreMarketAnalysis } from "./types"

type Raw = Record<string, unknown>

const isObject = (value: unknown): value is Raw =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const object = (value: unknown): Raw => isObject(value) ? value : {}
const isString = (value: unknown): value is string => typeof value === "string"
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
function invalid(): never { throw new ApiError("Phản hồi báo cáo thị trường v2 không hợp lệ", 502, "INVALID_MARKET_REPORT") }
const stringFields = (row: Raw, keys: string[]) => keys.every((key) => isString(row[key]))
const numberFields = (row: Raw, keys: string[]) => keys.every((key) => isNumber(row[key]))
const arrayFields = (row: Raw, keys: string[]) => keys.every((key) => Array.isArray(row[key]))

function isMarketReportV2(value: unknown): value is MarketReportV2 {
  if (!isObject(value)) return false
  const row = value
  return typeof row.id === "string" && typeof row.sessionDate === "string" &&
    typeof row.generatedAt === "string" && typeof row.sessionType === "string" &&
    ["daily", "midday", "premarket"].includes(String(row.reportType)) && typeof row.headline === "string" &&
    isObject(row.tagline) && isObject(row.paragraphs) && Array.isArray(row.scenarios) &&
    (row.watchlist === null || Array.isArray(row.watchlist)) &&
    (row.meta === null || isObject(row.meta)) &&
    (row.unexplained === null || isString(row.unexplained))
}

function validNarrative(row: MarketReportV2): boolean {
  const tagline = object(row.tagline)
  const paragraphs = object(row.paragraphs)
  if (row.reportType === "daily") {
    return stringFields(tagline, ["direction", "marker", "text"]) &&
      stringFields(paragraphs, ["structure", "smart_money", "market_health"]) &&
      row.scenarios.every((value) => isObject(value) && stringFields(value, ["direction", "condition_html", "outcome_html"])) &&
      (row.watchlist ?? []).every((value) => isObject(value) && stringFields(value, ["ticker", "reason_html"]) && typeof value.alert === "boolean")
  }
  if (row.reportType === "midday") {
    const structure = object(paragraphs.session_structure)
    const flow = object(paragraphs.money_flow)
    const health = object(paragraphs.market_health)
    return stringFields(tagline, ["text", "color"]) &&
      stringFields(structure, ["status", "content"]) &&
      stringFields(flow, ["status", "content"]) &&
      stringFields(health, ["status", "pending_message", "pending_until"]) &&
      row.scenarios.every((value) => isObject(value) && stringFields(value, ["type", "condition", "outcome", "scope"])) &&
      (row.watchlist ?? []).every((value) => isObject(value) && stringFields(value, ["key", "alert_level", "reason"]))
  }
  return (tagline.text === undefined || isString(tagline.text)) &&
    (paragraphs.world_paragraph === undefined || isString(paragraphs.world_paragraph)) &&
    (row.watchlist ?? []).every((value) => isObject(value) && stringFields(value, ["level", "content"]))
}

const nullableNumber = (value: unknown) => value === undefined || value === null || isNumber(value)
const tickerValues = (value: unknown) => Array.isArray(value) && value.every((item) =>
  isObject(item) && isString(item.ticker) && isNumber(item.value))
const tickerPoints = (value: unknown) => Array.isArray(value) && value.every((item) =>
  isObject(item) && isString(item.ticker) && isNumber(item.points))
const numberArray = (value: unknown) => Array.isArray(value) && value.every(isNumber)

const chartValidators: { [K in keyof MarketCharts]: (value: Raw) => boolean } = {
  breadth: (row) => numberFields(row, ["ceiling", "up", "flat", "down", "floor"]) &&
    stringFields(row, ["ratio_up_down", "classification"]) && nullableNumber(row.pct_above_ma20),
  contribution: (row) => tickerPoints(row.top_negative) && tickerPoints(row.top_positive),
  foreign_detail: (row) => {
    const streak = object(row.streak)
    return numberFields(row, ["total_buy_vnd_billion", "total_sell_vnd_billion"]) &&
      numberFields(streak, ["count"]) && ["buy", "sell", "mixed"].includes(String(streak.direction)) &&
      nullableNumber(streak.last_5d_cumulative) && numberArray(row.last_12_sessions) &&
      tickerValues(row.top_sell) && tickerValues(row.top_buy)
  },
  prop_detail: (row) => numberFields(row, ["total_buy_vnd_billion", "total_sell_vnd_billion", "net_vnd_billion"]) &&
    numberArray(row.last_12_sessions) && tickerValues(row.top_buy) && tickerValues(row.top_sell),
  market_health_detail: (row) => {
    const validCallout = row.callout === undefined || row.callout === null ||
      (isObject(row.callout) && isString(row.callout.text) &&
        ["warning", "positive", "neutral"].includes(String(row.callout.type)))
    const validMa = nullableNumber(row.pct_above_ma20) && nullableNumber(row.pct_above_ma20_change) &&
      nullableNumber(row.pct_above_ma50) && nullableNumber(row.pct_above_ma200) && numberArray(row.trend_20d)
    if (row.indicator_basis === "EMA") {
      return validMa && validCallout && nullableNumber(row.pct_above_ema20) &&
        nullableNumber(row.pct_above_ema20_change) && nullableNumber(row.pct_above_ema50) &&
        numberArray(row.trend_ema20_20d)
    }
    return row.indicator_basis === undefined && validMa && validCallout
  },
  sector_rotation: (row) => Array.isArray(row.sectors_today) && row.sectors_today.every((item) =>
    isObject(item) && isString(item.name) && isNumber(item.pct)),
}

function validChartBlocks(value: unknown, reportType: string): Partial<MarketCharts> | undefined {
  if (!isObject(value)) return undefined
  const blocks: Partial<MarketCharts> = {}
  for (const key of Object.keys(chartValidators) as (keyof MarketCharts)[]) {
    const rawBlock = value[key]
    if (!isObject(rawBlock) || !chartValidators[key](rawBlock)) continue
    if (reportType === "midday" && !["am_session", "eod_previous"].includes(String(rawBlock.data_state))) continue
    // Each block is validated independently. A missing health observation must
    // not suppress today's measured breadth or flow.
    Object.assign(blocks, { [key]: rawBlock })
  }
  return Object.keys(blocks).length > 0 ? blocks : undefined
}

function validPulse(value: unknown): boolean {
  if (!isObject(value)) return false
  const index = object(value.vn_index)
  const breadth = object(value.breadth)
  const liquidity = object(value.liquidity)
  return numberFields(index, ["value", "change", "change_pct"]) &&
    arrayFields(index, ["sparkline"]) &&
    numberFields(breadth, ["up", "down"]) &&
    isNumber(value.foreign_net_billion) &&
    numberFields(liquidity, ["am_value_billion"])
}

/**
 * Adapt the canonical v2 report (camelCase envelope) to the existing view
 * model (snake_case envelope). JSON report blocks are intentionally retained
 * verbatim: generated paragraphs, scenarios, charts and pulse are not lossy
 * DTOs and may contain fields added by the report generator.
 */
export function adaptMarketReport(payload: unknown): DailyAnalysis | MidDayAnalysis | PreMarketAnalysis {
  if (!isMarketReportV2(payload) || !validNarrative(payload)) invalid()
  const raw = payload
  const meta = raw.meta === null ? null : object(raw.meta)
  // The public endpoint historically promoted these blocks beside `meta`; the
  // v2 envelope may also retain them in `meta`. Prefer the explicit report
  // field while accepting either authoritative representation.
  const chartPayload = meta?.charts ?? object(raw).charts
  const reportType = raw.reportType
  return {
    ...raw,
    id: String(raw.id ?? ""),
    session_date: raw.sessionDate,
    generated_at: raw.generatedAt,
    session_type: raw.sessionType,
    session_type_display: typeof meta?.session_type_display === "string" ? meta.session_type_display : null,
    report_type: reportType === "daily" || reportType === "midday" || reportType === "premarket"
      ? reportType
      : undefined,
    headline: String(raw.headline ?? ""),
    tagline: object(raw.tagline),
    paragraphs: object(raw.paragraphs),
    scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
    unexplained: raw.unexplained == null ? null : reportType === "midday"
      ? { title: "Điểm cần xác nhận", content: raw.unexplained }
      : raw.unexplained,
    meta,
    charts: validChartBlocks(chartPayload, reportType),
    pulse: validPulse(meta?.pulse) ? meta?.pulse : undefined,
  } as unknown as DailyAnalysis | MidDayAnalysis | PreMarketAnalysis
}

/** Latest published end-of-day brief. */
export function fetchDailyAnalysis(signal?: AbortSignal) {
  return api<unknown>("/market-analysis/daily/latest", { signal }).then(adaptMarketReport) as Promise<DailyAnalysis>
}

/** Latest published mid-day brief. */
export function fetchMidDayAnalysis(signal?: AbortSignal) {
  return api<unknown>("/market-analysis/midday/latest", { signal }).then(adaptMarketReport) as Promise<MidDayAnalysis>
}

/** Latest published pre-market brief. */
export function fetchPreMarketAnalysis(signal?: AbortSignal) {
  return api<unknown>("/market-analysis/premarket/latest", { signal }).then(adaptMarketReport) as Promise<PreMarketAnalysis>
}

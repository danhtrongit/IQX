import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"
import { DEFAULT_ENABLED_WIDGET_LIST, MARKET_TEMPLATE_FALLBACK, WIDGET_CATALOG } from "./catalog"
import type {
  CommoditiesFxData,
  CommoditiesTab,
  DerivativesSummaryData,
  EventsCalendarData,
  EventsFilter,
  ExchangeCode,
  FeaturedStocksData,
  FeaturedStocksTab,
  ForeignFlowData,
  ForeignFlowType,
  FuturesMaturity,
  FuturesTableData,
  GridItem,
  HeatmapSizeBy,
  HeatmapView,
  IndexChartData,
  IndexChartRange,
  IndexChartSymbol,
  MarketBreadthData,
  MarketHeatmapData,
  MarketLiquidityData,
  MarketNewsData,
  OverviewPage,
  SectorPerfRange,
  SectorPerfTab,
  SectorPerformanceData,
  SectorRotationData,
  Vn30fRange,
  Vn30fVsVn30Data,
  VnIndexImpactData,
  WidgetDataMap,
  WidgetMeta,
  WidgetSlug,
  WidgetStateMap,
  WorldIndicesData,
} from "./types"
import type { WidgetSnapshotMeta } from "./widgets/shared"

type TemplateResponseDto = ApiResponseFor<"GET /api/v2/toan-canh/template">
type ListPagesResponseDto = ApiResponseFor<"GET /api/v2/toan-canh/pages">
type ServerPageDto = ListPagesResponseDto["pages"][number]
type WidgetDataResponseDto = ApiResponseFor<"GET /api/v2/toan-canh/widgets/{widget}">
type WidgetDataQueryDto = NonNullable<
  ApiRequestFor<"GET /api/v2/toan-canh/widgets/{widget}">["query"]
>
type CreatePageBodyDto = ApiRequestFor<"POST /api/v2/toan-canh/pages">["body"]
type UpdatePageBodyDto = ApiRequestFor<"PUT /api/v2/toan-canh/pages/{id}">["body"]

export type MarketOverviewLimits = TemplateResponseDto["limits"]

export interface MarketOverviewTemplateResult {
  templatePage: OverviewPage
  catalog: WidgetMeta[]
  limits: MarketOverviewLimits
}

export interface MarketOverviewPagesListResult {
  pages: OverviewPage[]
  lastActivePageId: string
  maxPages: number
}

export interface CreateMarketOverviewPageInput {
  name?: string
  duplicateFromPageId?: string
  items?: readonly GridItem[]
}

export interface UpdateMarketOverviewPageInput {
  name?: string
  items?: readonly GridItem[]
}

export interface AdaptedWidgetSnapshot<W extends WidgetSlug = WidgetSlug> {
  widget: W
  meta: WidgetSnapshotMeta
  data: WidgetDataMap[W]
}

export const DEFAULT_MARKET_OVERVIEW_LIMITS: MarketOverviewLimits = {
  cols: 12,
  maxHeight: 18,
  maxPageNameLength: 30,
  maxPages: 8,
  maxWidgetsPerPage: 40,
}

export const DEFAULT_TEMPLATE_RESULT: MarketOverviewTemplateResult = {
  templatePage: MARKET_TEMPLATE_FALLBACK,
  catalog: [...DEFAULT_ENABLED_WIDGET_LIST],
  limits: DEFAULT_MARKET_OVERVIEW_LIMITS,
}

const INDEX_SYMBOLS: readonly IndexChartSymbol[] = [
  "VNINDEX",
  "VN30",
  "HNX",
  "UPCOM",
  "VN30F1M",
]
const INDEX_RANGES: readonly IndexChartRange[] = ["intraday", "3m", "1y"]
const EXCHANGES: readonly ExchangeCode[] = ["HOSE", "HNX", "UPCOM"]
const FOREIGN_TYPES: readonly ForeignFlowType[] = ["foreign", "prop"]
const HEATMAP_VIEWS: readonly HeatmapView[] = ["stock", "sector"]
const HEATMAP_SIZES: readonly HeatmapSizeBy[] = ["market_cap", "value"]
const FEATURED_TABS: readonly FeaturedStocksTab[] = [
  "gainers",
  "losers",
  "liquidity",
  "foreign",
  "volume_spike",
]
const SECTOR_RANGES: readonly SectorPerfRange[] = ["1d", "1w", "1m", "ytd"]
const SECTOR_TABS: readonly SectorPerfTab[] = ["price", "flow"]
const VN30F_RANGES: readonly Vn30fRange[] = ["intraday", "1m", "3m"]
const COMMODITIES_TABS: readonly CommoditiesTab[] = [
  "energy_metals",
  "agriculture",
  "gold_fx",
]
const EVENTS_FILTERS: readonly EventsFilter[] = ["all", "cash_dividend", "other"]

function pickAllowed<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback
}

function normalizeExchange(raw: string): ExchangeCode {
  const upper = raw.trim().toUpperCase()
  if (upper === "HNX") return "HNX"
  if (upper === "UPCOM") return "UPCOM"
  return "HOSE"
}

function inferRefPrice(price: number, changePct: number): number {
  const denom = 1 + changePct / 100
  if (!Number.isFinite(price) || !Number.isFinite(changePct) || Math.abs(denom) < 1e-6) {
    return price
  }
  return price / denom
}

function inferFuturesMaturity(displayCode: string, index: number): FuturesMaturity {
  const upper = displayCode.toUpperCase()
  if (upper.endsWith("1M")) return "1M"
  if (upper.endsWith("2M")) return "2M"
  if (upper.endsWith("1Q")) return "1Q"
  if (upper.endsWith("2Q")) return "2Q"
  const byIdx: readonly FuturesMaturity[] = ["1M", "2M", "1Q", "2Q"]
  return byIdx[index] ?? "2Q"
}

function toFiniteOrNaN(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : Number.NaN
}

/**
 * Normalizes any frontend partial state (or backend state record) into a complete,
 * validated frontend `WidgetStateMap[W]`.
 */
export function resolveWidgetState<W extends WidgetSlug>(
  widget: W,
  rawState?: Readonly<Record<string, unknown>>,
): WidgetStateMap[W] {
  const input = rawState ?? {}

  switch (widget) {
    case "index_chart":
      return {
        index: pickAllowed(input.index, INDEX_SYMBOLS, "VNINDEX"),
        range: pickAllowed(input.range, INDEX_RANGES, "intraday"),
      } as WidgetStateMap[W]

    case "foreign_flow":
      return {
        exchange: pickAllowed(input.exchange, EXCHANGES, "HOSE"),
        type: pickAllowed(input.type ?? input.tab, FOREIGN_TYPES, "foreign"),
      } as WidgetStateMap[W]

    case "market_heatmap":
      return {
        view: pickAllowed(input.view ?? input.mode, HEATMAP_VIEWS, "stock"),
        sizeBy: pickAllowed(input.sizeBy, HEATMAP_SIZES, "market_cap"),
      } as WidgetStateMap[W]

    case "featured_stocks": {
      const rawTab = input.tab === "vol_spike" ? "volume_spike" : input.tab
      return {
        tab: pickAllowed(rawTab, FEATURED_TABS, "gainers"),
      } as WidgetStateMap[W]
    }

    case "sector_performance": {
      const rawRange = input.range ?? input.period
      const mappedRange = rawRange === "today" ? "1d" : rawRange
      return {
        range: pickAllowed(mappedRange, SECTOR_RANGES, "1d"),
        tab: pickAllowed(input.tab, SECTOR_TABS, "price"),
      } as WidgetStateMap[W]
    }

    case "vn30f_vs_vn30":
      return {
        range: pickAllowed(input.range, VN30F_RANGES, "intraday"),
      } as WidgetStateMap[W]

    case "commodities_fx": {
      const rawTab = input.tab === "agri" ? "agriculture" : input.tab
      return {
        tab: pickAllowed(rawTab, COMMODITIES_TABS, "energy_metals"),
      } as WidgetStateMap[W]
    }

    case "events_calendar": {
      const rawFilter = input.filter === "cash" ? "cash_dividend" : input.filter
      return {
        filter: pickAllowed(rawFilter, EVENTS_FILTERS, "all"),
      } as WidgetStateMap[W]
    }

    case "market_breadth":
    case "market_liquidity":
    case "vnindex_impact":
    case "sector_rotation":
    case "derivatives_summary":
    case "futures_table":
    case "world_indices":
    case "market_news":
      return {} as WidgetStateMap[W]
  }
}

/** Encodes frontend widget state into backend persistence format (`PUT`/`POST /pages`). */
export function encodeBackendWidgetState<W extends WidgetSlug>(
  widget: W,
  rawState?: Partial<WidgetStateMap[W]>,
): Record<string, string> {
  const resolved = resolveWidgetState(
    widget,
    rawState as Readonly<Record<string, unknown>> | undefined,
  )

  switch (widget) {
    case "index_chart": {
      const s = resolved as WidgetStateMap["index_chart"]
      return { index: s.index, range: s.range }
    }
    case "foreign_flow": {
      const s = resolved as WidgetStateMap["foreign_flow"]
      return { exchange: s.exchange, tab: s.type }
    }
    case "market_heatmap": {
      const s = resolved as WidgetStateMap["market_heatmap"]
      return { mode: s.view, sizeBy: s.sizeBy }
    }
    case "featured_stocks": {
      const s = resolved as WidgetStateMap["featured_stocks"]
      return { tab: s.tab === "volume_spike" ? "vol_spike" : s.tab }
    }
    case "sector_performance": {
      const s = resolved as WidgetStateMap["sector_performance"]
      return { period: s.range === "1d" ? "today" : s.range, tab: s.tab }
    }
    case "vn30f_vs_vn30": {
      const s = resolved as WidgetStateMap["vn30f_vs_vn30"]
      return { range: s.range }
    }
    case "commodities_fx": {
      const s = resolved as WidgetStateMap["commodities_fx"]
      return { tab: s.tab === "agriculture" ? "agri" : s.tab }
    }
    case "events_calendar": {
      const s = resolved as WidgetStateMap["events_calendar"]
      return { filter: s.filter === "cash_dividend" ? "cash" : s.filter }
    }
    case "market_breadth":
    case "market_liquidity":
    case "vnindex_impact":
    case "sector_rotation":
    case "derivatives_summary":
    case "futures_table":
    case "world_indices":
    case "market_news":
      return {}
  }
}

/** Encodes frontend widget state into backend `GET /toan-canh/widgets/{widget}` query parameters. */
export function encodeWidgetQuery<W extends WidgetSlug>(
  widget: W,
  rawState?: Partial<WidgetStateMap[W]>,
): WidgetDataQueryDto {
  const resolved = resolveWidgetState(
    widget,
    rawState as Readonly<Record<string, unknown>> | undefined,
  )

  switch (widget) {
    case "index_chart": {
      const s = resolved as WidgetStateMap["index_chart"]
      return { index: s.index, range: s.range }
    }
    case "foreign_flow": {
      const s = resolved as WidgetStateMap["foreign_flow"]
      return { exchange: s.exchange, tab: s.type }
    }
    case "market_heatmap": {
      const s = resolved as WidgetStateMap["market_heatmap"]
      return { mode: s.view, sizeBy: s.sizeBy }
    }
    case "featured_stocks": {
      const s = resolved as WidgetStateMap["featured_stocks"]
      return { tab: s.tab === "volume_spike" ? "vol_spike" : s.tab }
    }
    case "sector_performance": {
      const s = resolved as WidgetStateMap["sector_performance"]
      return { period: s.range === "1d" ? "today" : s.range, tab: s.tab }
    }
    case "vn30f_vs_vn30": {
      const s = resolved as WidgetStateMap["vn30f_vs_vn30"]
      return { range: s.range }
    }
    case "commodities_fx": {
      const s = resolved as WidgetStateMap["commodities_fx"]
      return { tab: s.tab === "agriculture" ? "agri" : s.tab }
    }
    case "events_calendar": {
      const s = resolved as WidgetStateMap["events_calendar"]
      return { filter: s.filter === "cash_dividend" ? "cash" : s.filter }
    }
    case "market_breadth":
    case "market_liquidity":
    case "vnindex_impact":
    case "sector_rotation":
    case "derivatives_summary":
    case "futures_table":
    case "world_indices":
    case "market_news":
      return {}
  }
}

function adaptServerItems(items: ServerPageDto["items"]): GridItem[] {
  return items.map((item) => ({
    uid: item.uid,
    widget: item.widget,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    state: resolveWidgetState(item.widget, item.state),
  })) as GridItem[]
}

function adaptServerPage(page: ServerPageDto): OverviewPage {
  return {
    version: page.version,
    id: page.id,
    name: page.name,
    order: page.order,
    updatedAt: page.updatedAt,
    items: adaptServerItems(page.items),
  }
}

function serializeItemsForBackend(items: readonly GridItem[]): NonNullable<UpdatePageBodyDto["items"]> {
  return items.map((item) => ({
    uid: item.uid,
    widget: item.widget,
    x: Math.round(item.x),
    y: Math.round(item.y),
    w: Math.round(item.w),
    h: Math.round(item.h),
    state: encodeBackendWidgetState(item.widget, item.state),
  }))
}

/** Adapts any backend widget response envelope to the typed frontend `AdaptedWidgetSnapshot<W>`. */
export function adaptWidgetSnapshot<W extends WidgetSlug>(
  widget: W,
  response: WidgetDataResponseDto,
): AdaptedWidgetSnapshot<W> {
  const meta: WidgetSnapshotMeta = {
    asOf: response.asOf,
    sessionDate: response.sessionDate,
    isMarketOpen: response.isMarketOpen,
    stale: response.stale,
  }

  switch (response.widget) {
    case "index_chart": {
      const d = response.data
      const data: IndexChartData = {
        selectedIndex: d.selected.code,
        range: d.selected.range,
        sessionDate: response.sessionDate,
        isMarketOpen: response.isMarketOpen,
        refPrice: d.selected.refPrice,
        cards: d.cards.map((card) => ({
          code: card.code,
          name: card.name,
          price: card.price,
          refPrice: card.refPrice,
          change: card.change,
          changePct: card.changePct,
          volume: card.volume,
          valueBillion: card.valueBillion,
          volumeUnit: card.code === "VN30F1M" ? "contracts" : "shares",
          sparkline: card.sparkline,
        })),
        series: d.selected.points.map((pt) => ({
          time: pt.t,
          value: pt.v,
          volume: pt.vol,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "market_breadth": {
      const data: MarketBreadthData = {
        sessionDate: response.sessionDate,
        exchanges: response.data.exchanges.map((ex) => {
          const advancingTotal =
            ex.advancingTotal > 0 || ex.advancing === 0
              ? ex.advancingTotal
              : ex.advancing + ex.ceiling
          const decliningTotal =
            ex.decliningTotal > 0 || ex.declining === 0
              ? ex.decliningTotal
              : ex.declining + ex.floor
          const total =
            ex.total > 0 ? ex.total : advancingTotal + ex.unchanged + decliningTotal
          return {
            exchange: ex.exchange,
            advancing: advancingTotal,
            unchanged: ex.unchanged,
            declining: decliningTotal,
            ceiling: ex.ceiling,
            floor: ex.floor,
            total,
          }
        }),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "market_liquidity": {
      const d = response.data
      const data: MarketLiquidityData = {
        exchange: "HOSE",
        sessionDate: response.sessionDate,
        currentValueBillion: d.currentValueBillion,
        pctVsPrevSameTime: d.pctVsPrevSameTime,
        pctVsAvg20SameTime: d.pctVsAvg20SameTime,
        series: d.points.map((pt) => ({
          time: pt.t,
          todayBillion: pt.today,
          prevSessionBillion: pt.prev,
          avg20Billion: pt.avg20,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "foreign_flow": {
      const d = response.data
      const data: ForeignFlowData = {
        exchange: d.exchange,
        type: d.tab,
        sessionDate:
          d.tab === "prop"
            ? (d.sessions.at(-1)?.date ?? response.sessionDate)
            : response.sessionDate,
        isEodOnly: d.tab === "prop",
        supported: d.tab === "prop" ? d.propSupported : true,
        netValueBillion: d.netBillion,
        buyValueBillion: d.buyBillion,
        sellValueBillion: d.sellBillion,
        sessions: d.sessions.map((s) => ({
          date: s.date,
          netValueBillion: s.netBillion,
          buyValueBillion: s.buyBillion,
          sellValueBillion: s.sellBillion,
        })),
        topBuy: d.topBuy.map((item) => ({
          symbol: item.symbol,
          netValueBillion: item.netBillion,
        })),
        topSell: d.topSell.map((item) => ({
          symbol: item.symbol,
          netValueBillion: item.netBillion,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "vnindex_impact": {
      const d = response.data
      const data: VnIndexImpactData = {
        sessionDate: response.sessionDate,
        indexChange: d.indexChange,
        totalPositiveImpact: d.sumUp,
        totalNegativeImpact: d.sumDn,
        gainers: d.positive.map((item) => ({
          symbol: item.symbol,
          impact: item.impact,
          price: item.price,
          refPrice: inferRefPrice(item.price, item.changePct),
          changePct: item.changePct,
        })),
        decliners: d.negative.map((item) => ({
          symbol: item.symbol,
          impact: item.impact,
          price: item.price,
          refPrice: inferRefPrice(item.price, item.changePct),
          changePct: item.changePct,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "market_heatmap": {
      const d = response.data
      const data: MarketHeatmapData = {
        sessionDate: response.sessionDate,
        view: d.mode,
        sizeBy: d.sizeBy,
        sectors: d.sectors.map((sec) => ({
          icbCode: sec.code,
          name: sec.name,
          marketCapBillion: sec.marketCapBillion,
          valueBillion: sec.valueBillion,
          changePct: sec.changePct,
          stocks: sec.stocks.map((st) => ({
            symbol: st.symbol,
            sectorCode: sec.code,
            sectorName: sec.name,
            exchange: normalizeExchange(st.exchange),
            price: st.price,
            refPrice: st.refPrice,
            ceilingPrice: st.ceilingPrice,
            floorPrice: st.floorPrice,
            changePct: st.changePct,
            isCeiling: st.isCeiling,
            isFloor: st.isFloor,
            marketCapBillion: st.marketCapBillion,
            valueBillion: st.valueBillion,
            volume: 0,
          })),
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "featured_stocks": {
      const d = response.data
      const data: FeaturedStocksData = {
        sessionDate: response.sessionDate,
        tab: d.tab === "vol_spike" ? "volume_spike" : d.tab,
        items: d.rows.map((row) => ({
          symbol: row.symbol,
          exchange: normalizeExchange(row.exchange),
          price: row.price,
          refPrice: row.refPrice,
          ceilingPrice: row.ceilingPrice,
          floorPrice: row.floorPrice,
          changePct: row.changePct,
          isCeiling: row.ceilingPrice > 0 && row.price >= row.ceilingPrice - 1e-6,
          isFloor: row.floorPrice > 0 && row.price <= row.floorPrice + 1e-6,
          valueBillion: row.valueBillion,
          foreignNetBillion: row.foreignNetBillion,
          volumeRatio20d: row.volRatio20d,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "sector_performance": {
      const d = response.data
      const data: SectorPerformanceData = {
        sessionDate: response.sessionDate,
        range: d.period === "today" ? "1d" : d.period,
        tab: d.tab,
        sectors: d.rows.map((row) => ({
          icbCode: row.code,
          name: row.name,
          changePct: row.changePct,
          advancing: row.advancing,
          declining: row.declining,
          unchanged: row.unchanged,
          valueBillion: row.valueBillion,
          valueSharePct: row.valueSharePct,
          valueVsAvg20Ratio: row.valueRatio20d,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "sector_rotation": {
      const d = response.data
      const data: SectorRotationData = {
        asOfDate: d.weekEnding || response.sessionDate,
        benchmark: "VNINDEX",
        domain: d.domain,
        sectors: d.sectors.map((sec) => ({
          icbCode: sec.code,
          name: sec.name,
          quadrant: sec.quadrant,
          points: sec.trail.map((pt) => ({
            date: pt.week,
            rsRatio: pt.rsRatio,
            rsMomentum: pt.rsMomentum,
          })),
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "derivatives_summary": {
      const d = response.data
      const vn30Price = toFiniteOrNaN(d.vn30Price)
      const vn30RefPrice =
        d.vn30Price != null && d.vn30Change != null
          ? d.vn30Price - d.vn30Change
          : vn30Price
      const data: DerivativesSummaryData = {
        sessionDate: response.sessionDate,
        contractCode: d.contract,
        vn30fPrice: toFiniteOrNaN(d.price),
        vn30fRefPrice: toFiniteOrNaN(d.refPrice ?? d.price),
        vn30fChangePct: toFiniteOrNaN(d.changePct),
        vn30Price,
        vn30RefPrice,
        vn30ChangePct: toFiniteOrNaN(d.vn30ChangePct),
        basis: toFiniteOrNaN(d.basis),
        volumeContracts: toFiniteOrNaN(d.volume),
        valueBillion: toFiniteOrNaN(d.valueBillion),
        foreignNetContracts: toFiniteOrNaN(d.foreignNetContracts),
        expiryDate: d.expiryDate,
        remainingSessions: d.remainingSessions,
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "vn30f_vs_vn30": {
      const d = response.data
      const data: Vn30fVsVn30Data = {
        sessionDate: response.sessionDate,
        range: d.range,
        latestVn30: toFiniteOrNaN(d.latestVn30),
        latestVn30f: toFiniteOrNaN(d.latestVn30f),
        latestBasis: toFiniteOrNaN(d.latestBasis),
        points: d.points.map((pt) => ({
          time: pt.t,
          vn30: pt.vn30,
          vn30f: pt.vn30f,
          basis: pt.basis,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "futures_table": {
      const d = response.data
      const data: FuturesTableData = {
        sessionDate: response.sessionDate,
        groups: d.groups.map((group) => ({
          underlying: group.underlying,
          spotPrice: toFiniteOrNaN(group.spotPrice),
          contracts: group.contracts.map((contract, idx) => ({
            code: contract.code,
            displayCode: contract.displayCode,
            underlying: group.underlying,
            maturity: inferFuturesMaturity(contract.displayCode, idx),
            expiryDate: contract.expiryDate,
            remainingSessions: contract.remainingSessions,
            price: toFiniteOrNaN(contract.price),
            refPrice: toFiniteOrNaN(contract.refPrice ?? contract.price),
            changePct: toFiniteOrNaN(contract.changePct),
            basis: toFiniteOrNaN(contract.basis),
            volumeContracts: toFiniteOrNaN(contract.volume),
            valueBillion: toFiniteOrNaN(contract.valueBillion),
            foreignNetBillion: toFiniteOrNaN(contract.foreignNetBillion),
          })),
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "world_indices": {
      const d = response.data
      const data: WorldIndicesData = {
        updatedAt: response.asOf,
        items: d.rows.map((row) => ({
          code: row.code,
          name: row.name,
          region: row.country,
          isClosed: !row.isOpen,
          price: toFiniteOrNaN(row.price),
          changePct: toFiniteOrNaN(row.changePct),
          updatedAt: row.updatedAt ?? response.asOf,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "commodities_fx": {
      const d = response.data
      const data: CommoditiesFxData = {
        tab: d.tab === "agri" ? "agriculture" : d.tab,
        updatedAt: response.asOf,
        items: d.rows.map((row) => ({
          code: row.code,
          name: row.name,
          unit: row.unit,
          price: toFiniteOrNaN(row.price),
          changePct: toFiniteOrNaN(row.changePct),
          mappedSectorName: row.mappedSectorName,
          mappedSectorChangePct: row.mappedSectorChangePct,
          updatedAt: response.asOf,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "events_calendar": {
      const d = response.data
      const data: EventsCalendarData = {
        filter: d.filter === "cash" ? "cash_dividend" : d.filter,
        fromDate: response.sessionDate,
        toDate: response.sessionDate,
        items: d.rows.map((row) => ({
          id: row.id,
          exDate: row.exDate,
          symbol: row.symbol,
          price: row.price,
          refPrice:
            row.price != null && row.changePct != null
              ? inferRefPrice(row.price, row.changePct)
              : null,
          type: row.eventType === "cash" ? "cash_dividend" : "other",
          title: row.title,
          cashPerShareVnd: row.cashPerShare,
          dividendYieldPct: row.dividendYieldPct,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }

    case "market_news": {
      const d = response.data
      const data: MarketNewsData = {
        updatedAt: response.asOf,
        enabled: d.enabled,
        items: d.rows.map((row) => ({
          id: row.id,
          slug: row.slug ?? undefined,
          category: row.category,
          title: row.title,
          publishedAt: row.publishedAt,
          source: row.source ?? undefined,
          url: row.url,
        })),
      }
      return { widget, meta, data: data as WidgetDataMap[W] }
    }
  }
}

export async function fetchMarketOverviewTemplate(
  signal?: AbortSignal,
): Promise<MarketOverviewTemplateResult> {
  const response = await requestOperation(
    "GET /api/v2/toan-canh/template",
    {},
    { signal },
  )

  const templatePage: OverviewPage = {
    version: response.version,
    id: response.id,
    name: response.name,
    order: -1,
    readonly: true,
    updatedAt: response.updatedAt,
    items: adaptServerItems(response.items),
  }

  const catalog: WidgetMeta[] =
    response.catalog.length > 0
      ? response.catalog.map((entry) => {
          const local = WIDGET_CATALOG[entry.slug]
          const serverKeywords = entry.keywords
            .split(/\s+/)
            .map((part) => part.trim())
            .filter(Boolean)
          return {
            ...local,
            title: entry.name || local.title,
            group: entry.group,
            defaultW: entry.defaultW,
            defaultH: entry.defaultH,
            minW: entry.minW,
            minH: entry.minH,
            inMarketTemplate: entry.inTemplate,
            keywords: Array.from(new Set([...local.keywords, ...serverKeywords])),
          } as WidgetMeta
        })
      : [...DEFAULT_ENABLED_WIDGET_LIST]

  return {
    templatePage,
    catalog,
    limits: response.limits ?? DEFAULT_MARKET_OVERVIEW_LIMITS,
  }
}

export async function fetchMarketOverviewPages(
  signal?: AbortSignal,
): Promise<MarketOverviewPagesListResult> {
  const response = await requestOperation(
    "GET /api/v2/toan-canh/pages",
    {},
    { signal },
  )
  const pages = response.pages
    .map(adaptServerPage)
    .sort((a, b) => a.order - b.order)

  return {
    pages,
    lastActivePageId: response.lastActivePageId,
    maxPages: response.maxPages,
  }
}

export async function createMarketOverviewPage(
  input: CreateMarketOverviewPageInput,
  signal?: AbortSignal,
): Promise<OverviewPage> {
  const body: CreatePageBodyDto = {}
  if (input.name !== undefined) body.name = input.name
  if (input.duplicateFromPageId !== undefined) {
    body.duplicateFromPageId = input.duplicateFromPageId
  }
  if (input.items !== undefined) {
    body.items = serializeItemsForBackend(input.items)
  }

  const response = await requestOperation(
    "POST /api/v2/toan-canh/pages",
    { body },
    { signal },
  )
  return adaptServerPage(response)
}

export interface PageRequestOptions {
  signal?: AbortSignal
  keepalive?: boolean
}

function normalizePageRequestOptions(
  options?: AbortSignal | PageRequestOptions,
): PageRequestOptions {
  if (!options) return {}
  if (typeof AbortSignal !== "undefined" && options instanceof AbortSignal) {
    return { signal: options }
  }
  return options as PageRequestOptions
}

export async function updateMarketOverviewPage(
  id: string,
  input: UpdateMarketOverviewPageInput,
  options?: AbortSignal | PageRequestOptions,
): Promise<OverviewPage> {
  const body: UpdatePageBodyDto = {}
  if (input.name !== undefined) body.name = input.name
  if (input.items !== undefined) {
    body.items = serializeItemsForBackend(input.items)
  }

  const transport = normalizePageRequestOptions(options)
  const response = await requestOperation(
    "PUT /api/v2/toan-canh/pages/{id}",
    { path: { id }, body },
    { signal: transport.signal, keepalive: transport.keepalive },
  )
  return adaptServerPage(response)
}

export async function deleteMarketOverviewPage(
  id: string,
  options?: AbortSignal | PageRequestOptions,
): Promise<ApiResponseFor<"DELETE /api/v2/toan-canh/pages/{id}">> {
  const transport = normalizePageRequestOptions(options)
  return requestOperation(
    "DELETE /api/v2/toan-canh/pages/{id}",
    { path: { id } },
    { signal: transport.signal, keepalive: transport.keepalive },
  )
}

export async function reorderMarketOverviewPages(
  pageIds: readonly string[],
  signal?: AbortSignal,
): Promise<OverviewPage[]> {
  const response = await requestOperation(
    "PATCH /api/v2/toan-canh/pages/order",
    { body: { pageIds: [...pageIds] } },
    { signal },
  )
  return response.pages.map(adaptServerPage).sort((a, b) => a.order - b.order)
}

export async function updateMarketOverviewPreferences(
  lastActivePageId: string,
  signal?: AbortSignal,
): Promise<ApiResponseFor<"PUT /api/v2/toan-canh/preferences">> {
  return requestOperation(
    "PUT /api/v2/toan-canh/preferences",
    { body: { lastActivePageId } },
    { signal },
  )
}

export async function fetchWidgetSnapshot<W extends WidgetSlug>(
  widget: W,
  state?: Partial<WidgetStateMap[W]>,
  signal?: AbortSignal,
): Promise<AdaptedWidgetSnapshot<W>> {
  const query = encodeWidgetQuery(widget, state)
  const response = await requestOperation(
    "GET /api/v2/toan-canh/widgets/{widget}",
    { path: { widget }, query },
    { signal },
  )
  return adaptWidgetSnapshot(widget, response)
}

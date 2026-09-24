/**
 * Live market snapshot used by the end-of-day pulse bar: index levels and
 * breadth from `/market-data/overview/market-index`, plus foreign flow from
 * `/market-data/overview/foreign/top`. Both answer `{ data, source_url }`.
 *
 * Values are only ever displayed as reported (or as "—" when the upstream has
 * no row for a symbol), never backfilled with zeros that would read as a real
 * index level.
 */
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"

const FAST = 60_000

export interface MarketIndexUI {
  value: number | null
  change: number | null
  changePercent: number | null
  volume: number | null
  valueTraded: number | null
  advance: number | null
  decline: number | null
  unchanged: number | null
  ceiling: number | null
  floor: number | null
}

export interface MarketOverviewUI {
  vnindex: MarketIndexUI
  hnxindex: MarketIndexUI
  upcomindex: MarketIndexUI
  vn30: MarketIndexUI
  marketBreadth: {
    advance: number | null
    decline: number | null
    unchanged: number | null
    ceiling: number | null
    floor: number | null
  }
}

export interface ForeignFlowUI {
  buyValue: number | null
  sellValue: number | null
  netValue: number | null
  topBuy: { symbol: string; value: number }[]
  topSell: { symbol: string; value: number }[]
}

interface ApiMarketIndex {
  symbol?: string
  price?: number | null
  change?: number | null
  change_percent?: number | null
  total_shares?: number | null
  total_value_million_vnd?: number | null
  total_stock_increase?: number | null
  total_stock_decline?: number | null
  total_stock_no_change?: number | null
  total_stock_ceiling?: number | null
  total_stock_floor?: number | null
}

interface ApiForeignTopData {
  net_buy?: { symbol?: string; net_value_vnd?: number | null }[]
  net_sell?: { symbol?: string; net_value_vnd?: number | null }[]
  total_net_buy_vnd?: number | null
  total_net_sell_vnd?: number | null
}

/** Bare array, `{ data }` envelope, or nothing. */
function unwrapData<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) return payload as T
  const data = (payload as { data?: unknown } | null)?.data
  return (data ?? null) as T | null
}

const EMPTY_INDEX: MarketIndexUI = {
  value: null,
  change: null,
  changePercent: null,
  volume: null,
  valueTraded: null,
  advance: null,
  decline: null,
  unchanged: null,
  ceiling: null,
  floor: null,
}

export function toIndexUI(item: ApiMarketIndex): MarketIndexUI {
  return {
    value: item.price ?? null,
    change: item.change ?? null,
    changePercent: item.change_percent ?? null,
    volume: item.total_shares ?? null,
    valueTraded:
      item.total_value_million_vnd == null
        ? null
        : item.total_value_million_vnd * 1_000_000,
    advance: item.total_stock_increase ?? null,
    decline: item.total_stock_decline ?? null,
    unchanged: item.total_stock_no_change ?? null,
    ceiling: item.total_stock_ceiling ?? null,
    floor: item.total_stock_floor ?? null,
  }
}

export function adaptMarketOverview(raw: ApiMarketIndex[]): MarketOverviewUI {
  const find = (symbol: string) =>
    raw.find((item) => item.symbol?.toUpperCase() === symbol.toUpperCase())

  const vnindex = find("VNINDEX")
  const vni = vnindex ? toIndexUI(vnindex) : EMPTY_INDEX
  return {
    vnindex: vni,
    hnxindex: toIndexUI(find("HNXIndex") ?? {}),
    upcomindex: toIndexUI(find("HNXUpcomIndex") ?? {}),
    vn30: toIndexUI(find("VN30") ?? {}),
    marketBreadth: {
      advance: vni.advance,
      decline: vni.decline,
      unchanged: vni.unchanged,
      ceiling: vni.ceiling,
      floor: vni.floor,
    },
  }
}

export function adaptForeignFlow(
  data: ApiForeignTopData | null
): ForeignFlowUI {
  const buyValue = data?.total_net_buy_vnd ?? null
  const sellValue =
    data?.total_net_sell_vnd == null ? null : Math.abs(data.total_net_sell_vnd)
  const toRow = (item: { symbol?: string; net_value_vnd?: number | null }) =>
    item.net_value_vnd == null
      ? null
      : {
          symbol: item.symbol ?? "",
          value: Math.abs(item.net_value_vnd),
        }
  return {
    buyValue,
    sellValue,
    netValue:
      buyValue == null || sellValue == null ? null : buyValue - sellValue,
    topBuy: (data?.net_buy ?? [])
      .slice(0, 10)
      .map(toRow)
      .filter((row): row is { symbol: string; value: number } => row !== null),
    topSell: (data?.net_sell ?? [])
      .slice(0, 10)
      .map(toRow)
      .filter((row): row is { symbol: string; value: number } => row !== null),
  }
}

const EMPTY_FLOW: ForeignFlowUI = {
  buyValue: null,
  sellValue: null,
  netValue: null,
  topBuy: [],
  topSell: [],
}

const INDEX_REQUEST_SYMBOLS = [
  "VNINDEX",
  "VN30",
  "HNXIndex",
  "HNX30",
  "HNXUpcomIndex",
]

/** Index levels + breadth for the Vietnam market. */
export function useMarketOverview() {
  const query = useQuery<MarketOverviewUI>({
    queryKey: ["market-workspace", "overview", "market-index"],
    queryFn: async ({ signal }) => {
      const payload = await api<unknown>(
        `/market-data/overview/market-index?symbols=${INDEX_REQUEST_SYMBOLS.join(",")}`,
        { signal }
      )
      return adaptMarketOverview(unwrapData<ApiMarketIndex[]>(payload) ?? [])
    },
    staleTime: FAST,
    refetchInterval: FAST,
  })
  return {
    data: query.data,
    loading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/** Foreign net buy/sell for today, with the top symbols on each side. */
export function useForeignFlow() {
  const query = useQuery<ForeignFlowUI>({
    queryKey: ["market-workspace", "overview", "foreign-top"],
    queryFn: async ({ signal }) => {
      const payload = await api<unknown>(
        "/market-data/overview/foreign/top?time_frame=ONE_DAY",
        {
          signal,
        }
      )
      return adaptForeignFlow(unwrapData<ApiForeignTopData>(payload))
    },
    staleTime: FAST,
    refetchInterval: FAST,
  })
  return {
    data: query.data,
    loading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export { EMPTY_FLOW, EMPTY_INDEX }

import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import {
  DEFAULT_TEMPLATE_RESULT,
  fetchMarketOverviewPages,
  fetchMarketOverviewTemplate,
  fetchWidgetSnapshot,
  resolveWidgetState,
  type AdaptedWidgetSnapshot,
  type MarketOverviewPagesListResult,
  type MarketOverviewTemplateResult,
} from "./api"
import type { WidgetSlug, WidgetStateMap } from "./types"

const VN_REALTIME_WIDGETS: ReadonlySet<WidgetSlug> = new Set<WidgetSlug>([
  "index_chart",
  "market_breadth",
  "market_liquidity",
  "foreign_flow",
  "vnindex_impact",
  "market_heatmap",
  "featured_stocks",
  "sector_performance",
  "derivatives_summary",
  "vn30f_vs_vn30",
  "futures_table",
])

const GLOBAL_MINUTE_WIDGETS: ReadonlySet<WidgetSlug> = new Set<WidgetSlug>([
  "world_indices",
  "commodities_fx",
])

const EVENTS_NEWS_WIDGETS: ReadonlySet<WidgetSlug> = new Set<WidgetSlug>([
  "events_calendar",
  "market_news",
])

export const marketOverviewKeys = {
  all: ["market-overview"] as const,
  template: ["market-overview", "template"] as const,
  pages: ["market-overview", "pages"] as const,
  widgetPrefix: <W extends WidgetSlug>(widget: W) =>
    ["market-overview", "widget", widget] as const,
  widget: <W extends WidgetSlug>(widget: W, stateKey: string) =>
    ["market-overview", "widget", widget, stateKey] as const,
}

export function serializeWidgetStateKey<W extends WidgetSlug>(
  widget: W,
  state?: Partial<WidgetStateMap[W]>,
): string {
  const resolved = resolveWidgetState(
    widget,
    state as Readonly<Record<string, unknown>> | undefined,
  ) as Record<string, unknown>
  const entries = Object.entries(resolved).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return "default"
  return entries.map(([key, value]) => `${key}=${String(value)}`).join("&")
}

export function isVnRealtimeWidget(widget: WidgetSlug): boolean {
  return VN_REALTIME_WIDGETS.has(widget)
}

export function useMarketOverviewTemplate(): {
  template: MarketOverviewTemplateResult
  isLoading: boolean
  isError: boolean
} {
  const query = useQuery<MarketOverviewTemplateResult>({
    queryKey: marketOverviewKeys.template,
    queryFn: ({ signal }) => fetchMarketOverviewTemplate(signal),
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    template: query.data ?? DEFAULT_TEMPLATE_RESULT,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useMarketOverviewPages(
  enabled: boolean,
): UseQueryResult<MarketOverviewPagesListResult> {
  return useQuery<MarketOverviewPagesListResult>({
    queryKey: marketOverviewKeys.pages,
    queryFn: ({ signal }) => fetchMarketOverviewPages(signal),
    enabled,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

export function useWidgetSnapshot<W extends WidgetSlug>(
  widget: W,
  state: WidgetStateMap[W],
  active: boolean,
): UseQueryResult<AdaptedWidgetSnapshot<W>> {
  const stateKey = serializeWidgetStateKey(widget, state)

  return useQuery<AdaptedWidgetSnapshot<W>>({
    queryKey: marketOverviewKeys.widget(widget, stateKey),
    queryFn: ({ signal }) => fetchWidgetSnapshot(widget, state, signal),
    enabled: active,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    staleTime: VN_REALTIME_WIDGETS.has(widget)
      ? 10_000
      : GLOBAL_MINUTE_WIDGETS.has(widget)
        ? 45_000
        : EVENTS_NEWS_WIDGETS.has(widget)
          ? 5 * 60_000
          : 30 * 60_000,
    refetchInterval: (query) => {
      if (!active) return false
      if (VN_REALTIME_WIDGETS.has(widget)) {
        return query.state.data?.meta.isMarketOpen ? 15_000 : 120_000
      }
      if (GLOBAL_MINUTE_WIDGETS.has(widget)) {
        return 60_000
      }
      if (EVENTS_NEWS_WIDGETS.has(widget)) {
        return 900_000
      }
      if (widget === "sector_rotation") {
        return 3_600_000
      }
      return false
    },
  })
}

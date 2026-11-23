import type { ReactNode } from "react"
import {
  sortFuturesGroups,
  type FuturesPruneRowMeta,
  type RowPruneMeta,
} from "../grid/engine"
import type { WidgetDataMap, WidgetSlug, WidgetStateMap } from "../types"
import type { WidgetBodyProps, WidgetControlsProps } from "./shared"
import {
  ForeignFlowHeaderControls,
  ForeignFlowWidget,
} from "./indices/foreign-flow-widget"
import {
  IndexChartHeaderControls,
  IndexChartWidget,
} from "./indices/index-chart-widget"
import { MarketBreadthWidget } from "./indices/market-breadth-widget"
import { MarketLiquidityWidget } from "./indices/market-liquidity-widget"
import { VnIndexImpactWidget } from "./indices/vnindex-impact-widget"
import { FeaturedStocksWidget } from "./stocks-sectors/featured-stocks-widget"
import {
  MarketHeatmapFooter,
  MarketHeatmapHeaderControls,
  MarketHeatmapWidget,
} from "./stocks-sectors/market-heatmap-widget"
import {
  SectorPerformanceHeaderControls,
  SectorPerformanceWidget,
} from "./stocks-sectors/sector-performance-widget"
import { SectorRotationWidget } from "./stocks-sectors/sector-rotation-widget"
import { CommoditiesFxWidget } from "./derivatives-global/commodities-fx-widget"
import { DerivativesSummaryWidget } from "./derivatives-global/derivatives-summary-widget"
import {
  EventsCalendarHeaderControls,
  EventsCalendarWidget,
} from "./derivatives-global/events-calendar-widget"
import { FuturesTableWidget } from "./derivatives-global/futures-table-widget"
import { MarketNewsWidget } from "./derivatives-global/market-news-widget"
import {
  Vn30fVsVn30HeaderControls,
  Vn30fVsVn30Widget,
} from "./derivatives-global/vn30f-vs-vn30-widget"
import { WorldIndicesWidget } from "./derivatives-global/world-indices-widget"

export interface WidgetRendererEntry<W extends WidgetSlug> {
  readonly renderHeaderControls?: (props: WidgetControlsProps<W>) => ReactNode
  readonly renderBody: (props: WidgetBodyProps<W>) => ReactNode
  readonly renderFooter?: () => ReactNode
  readonly getPruneMeta?: (
    state: WidgetStateMap[W],
    data: WidgetDataMap[W] | undefined,
  ) => RowPruneMeta | undefined
}

export type WidgetRegistry = {
  readonly [K in WidgetSlug]: WidgetRendererEntry<K>
}

export const WIDGET_REGISTRY: WidgetRegistry = {
  index_chart: {
    renderHeaderControls: (props) => <IndexChartHeaderControls {...props} />,
    renderBody: (props) => <IndexChartWidget {...props} />,
  },
  market_breadth: {
    renderBody: (props) => <MarketBreadthWidget {...props} />,
  },
  market_liquidity: {
    renderBody: (props) => <MarketLiquidityWidget {...props} />,
  },
  foreign_flow: {
    renderHeaderControls: (props) => <ForeignFlowHeaderControls {...props} />,
    renderBody: (props) => <ForeignFlowWidget {...props} />,
  },
  vnindex_impact: {
    renderBody: (props) => <VnIndexImpactWidget {...props} />,
    getPruneMeta: (_state, data) => {
      if (!data) return undefined
      return {
        gainerCount: Math.min(8, data.gainers.length),
        declinerCount: Math.min(8, data.decliners.length),
      }
    },
  },
  market_heatmap: {
    renderHeaderControls: (props) => <MarketHeatmapHeaderControls {...props} />,
    renderBody: (props) => <MarketHeatmapWidget {...props} />,
    renderFooter: () => <MarketHeatmapFooter />,
  },
  featured_stocks: {
    renderBody: (props) => <FeaturedStocksWidget {...props} />,
  },
  sector_performance: {
    renderHeaderControls: (props) => <SectorPerformanceHeaderControls {...props} />,
    renderBody: (props) => <SectorPerformanceWidget {...props} />,
    getPruneMeta: (state) => ({ tab: state.tab }),
  },
  sector_rotation: {
    renderBody: (props) => <SectorRotationWidget {...props} />,
  },
  derivatives_summary: {
    renderBody: (props) => <DerivativesSummaryWidget {...props} />,
  },
  vn30f_vs_vn30: {
    renderHeaderControls: (props) => <Vn30fVsVn30HeaderControls {...props} />,
    renderBody: (props) => <Vn30fVsVn30Widget {...props} />,
  },
  futures_table: {
    renderBody: (props) => <FuturesTableWidget {...props} />,
    getPruneMeta: (_state, data) => {
      if (!data) return undefined
      const futuresRows: FuturesPruneRowMeta[] = []
      const sortedGroups = sortFuturesGroups(data.groups)
      for (const group of sortedGroups) {
        futuresRows.push({ underlying: group.underlying, isGroupHeader: true })
        for (const contract of group.contracts) {
          futuresRows.push({
            underlying: contract.underlying,
            isGroupHeader: false,
            maturity: contract.maturity,
          })
        }
      }
      return { futuresRows }
    },
  },
  world_indices: {
    renderBody: (props) => <WorldIndicesWidget {...props} />,
  },
  commodities_fx: {
    renderBody: (props) => <CommoditiesFxWidget {...props} />,
  },
  events_calendar: {
    renderHeaderControls: (props) => <EventsCalendarHeaderControls {...props} />,
    renderBody: (props) => <EventsCalendarWidget {...props} />,
  },
  market_news: {
    renderBody: (props) => <MarketNewsWidget {...props} />,
  },
}

export function getWidgetRenderer<W extends WidgetSlug>(
  widget: W,
): WidgetRendererEntry<W> {
  return WIDGET_REGISTRY[widget]
}

/**
 * Canonical catalog of the 16 "Toàn cảnh thị trường" (market-overview) widgets,
 * the 13-widget read-only "Thị trường" template layout (12 cols × 38 rows),
 * and strict per-widget state sanitization.
 */

export const SYSTEM_TEMPLATE_PAGE_ID = 'thi-truong' as const;
export const SYSTEM_TEMPLATE_PAGE_NAME = 'Thị trường' as const;
export const MARKET_OVERVIEW_SCHEMA_VERSION = 1 as const;

export const MARKET_OVERVIEW_WIDGET_GROUPS = [
  'indices',
  'stocks',
  'sectors',
  'derivatives',
  'global',
  'events_news',
] as const;

export type MarketOverviewWidgetGroup = (typeof MARKET_OVERVIEW_WIDGET_GROUPS)[number];

export const MARKET_OVERVIEW_WIDGET_GROUP_LABELS: Readonly<
  Record<MarketOverviewWidgetGroup, string>
> = {
  indices: 'Chỉ số',
  stocks: 'Cổ phiếu',
  sectors: 'Ngành',
  derivatives: 'Phái sinh',
  global: 'Thế giới',
  events_news: 'Sự kiện và tin',
};

export const MARKET_OVERVIEW_WIDGET_SLUGS = [
  'index_chart',
  'market_breadth',
  'market_liquidity',
  'foreign_flow',
  'vnindex_impact',
  'market_heatmap',
  'featured_stocks',
  'sector_performance',
  'sector_rotation',
  'derivatives_summary',
  'vn30f_vs_vn30',
  'futures_table',
  'world_indices',
  'commodities_fx',
  'events_calendar',
  'market_news',
] as const;

export type MarketOverviewWidgetSlug = (typeof MARKET_OVERVIEW_WIDGET_SLUGS)[number];

export const INDEX_CHART_INDICES = ['VNINDEX', 'VN30', 'HNX', 'UPCOM', 'VN30F1M'] as const;
export type IndexChartIndex = (typeof INDEX_CHART_INDICES)[number];

export const INDEX_CHART_RANGES = ['intraday', '3m', '1y'] as const;
export type IndexChartRange = (typeof INDEX_CHART_RANGES)[number];

export const FOREIGN_FLOW_EXCHANGES = ['HOSE', 'HNX', 'UPCOM'] as const;
export type ForeignFlowExchange = (typeof FOREIGN_FLOW_EXCHANGES)[number];

export const FOREIGN_FLOW_TABS = ['foreign', 'prop'] as const;
export type ForeignFlowTab = (typeof FOREIGN_FLOW_TABS)[number];

export const HEATMAP_MODES = ['stock', 'sector'] as const;
export type HeatmapMode = (typeof HEATMAP_MODES)[number];

export const HEATMAP_SIZE_BY = ['market_cap', 'value'] as const;
export type HeatmapSizeBy = (typeof HEATMAP_SIZE_BY)[number];

export const FEATURED_STOCKS_TABS = [
  'gainers',
  'losers',
  'liquidity',
  'foreign',
  'vol_spike',
] as const;
export type FeaturedStocksTab = (typeof FEATURED_STOCKS_TABS)[number];

export const SECTOR_PERFORMANCE_PERIODS = ['today', '1w', '1m', 'ytd'] as const;
export type SectorPerformancePeriod = (typeof SECTOR_PERFORMANCE_PERIODS)[number];

export const SECTOR_PERFORMANCE_TABS = ['price', 'flow'] as const;
export type SectorPerformanceTab = (typeof SECTOR_PERFORMANCE_TABS)[number];

export const VN30F_VS_VN30_RANGES = ['intraday', '1m', '3m'] as const;
export type Vn30fVsVn30Range = (typeof VN30F_VS_VN30_RANGES)[number];

export const COMMODITIES_FX_TABS = ['energy_metals', 'agri', 'gold_fx'] as const;
export type CommoditiesFxTab = (typeof COMMODITIES_FX_TABS)[number];

export const EVENTS_CALENDAR_FILTERS = ['all', 'cash', 'other'] as const;
export type EventsCalendarFilter = (typeof EVENTS_CALENDAR_FILTERS)[number];

export interface MarketOverviewWidgetStateMap {
  index_chart: { index: IndexChartIndex; range: IndexChartRange };
  market_breadth: Record<string, never>;
  market_liquidity: Record<string, never>;
  foreign_flow: { exchange: ForeignFlowExchange; tab: ForeignFlowTab };
  vnindex_impact: Record<string, never>;
  market_heatmap: { mode: HeatmapMode; sizeBy: HeatmapSizeBy };
  featured_stocks: { tab: FeaturedStocksTab };
  sector_performance: { period: SectorPerformancePeriod; tab: SectorPerformanceTab };
  sector_rotation: Record<string, never>;
  derivatives_summary: Record<string, never>;
  vn30f_vs_vn30: { range: Vn30fVsVn30Range };
  futures_table: Record<string, never>;
  world_indices: Record<string, never>;
  commodities_fx: { tab: CommoditiesFxTab };
  events_calendar: { filter: EventsCalendarFilter };
  market_news: Record<string, never>;
}

export interface MarketOverviewWidgetSpec {
  readonly slug: MarketOverviewWidgetSlug;
  readonly name: string;
  readonly group: MarketOverviewWidgetGroup;
  readonly defaultW: number;
  readonly defaultH: number;
  readonly minW: number;
  readonly minH: number;
  readonly inTemplate: boolean;
  readonly keywords: string;
}

export const MARKET_OVERVIEW_WIDGETS: readonly MarketOverviewWidgetSpec[] = [
  {
    slug: 'index_chart',
    name: 'Biểu đồ chỉ số',
    group: 'indices',
    defaultW: 8,
    defaultH: 9,
    minW: 5,
    minH: 5,
    inTemplate: true,
    keywords: 'vnindex vn30 hnx upcom vn30f1m',
  },
  {
    slug: 'market_breadth',
    name: 'Độ rộng thị trường',
    group: 'indices',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'tăng giảm trần sàn hose hnx upcom',
  },
  {
    slug: 'market_liquidity',
    name: 'Thanh khoản thị trường',
    group: 'indices',
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'giá trị khớp gtgd tb20',
  },
  {
    slug: 'foreign_flow',
    name: 'Khối ngoại và tự doanh',
    group: 'indices',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'nước ngoài NN tự doanh mua bán ròng',
  },
  {
    slug: 'vnindex_impact',
    name: 'Tác động lên VN-Index',
    group: 'indices',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'kéo tăng kéo giảm điểm đóng góp',
  },
  {
    slug: 'market_heatmap',
    name: 'Bản đồ nhiệt thị trường',
    group: 'stocks',
    defaultW: 8,
    defaultH: 8,
    minW: 4,
    minH: 4,
    inTemplate: true,
    keywords: 'heatmap ngành vốn hoá',
  },
  {
    slug: 'featured_stocks',
    name: 'Cổ phiếu nổi bật',
    group: 'stocks',
    defaultW: 4,
    defaultH: 8,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'đột biến khối lượng tăng giảm khối ngoại thanh khoản',
  },
  {
    slug: 'sector_performance',
    name: 'Hiệu suất ngành',
    group: 'sectors',
    defaultW: 6,
    defaultH: 7,
    minW: 4,
    minH: 4,
    inTemplate: true,
    keywords: 'dòng tiền ngành biến động giá',
  },
  {
    slug: 'sector_rotation',
    name: 'Chu kỳ ngành',
    group: 'sectors',
    defaultW: 6,
    defaultH: 7,
    minW: 4,
    minH: 4,
    inTemplate: true,
    keywords: 'xoay vòng RRG dẫn dắt suy yếu tụt hậu cải thiện',
  },
  {
    slug: 'derivatives_summary',
    name: 'Tổng quan phái sinh',
    group: 'derivatives',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'basis đáo hạn phái sinh vn30f1m',
  },
  {
    slug: 'vn30f_vs_vn30',
    name: 'VN30F1M so với VN30',
    group: 'derivatives',
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    inTemplate: false,
    keywords: 'basis phái sinh chênh lệch',
  },
  {
    slug: 'futures_table',
    name: 'Bảng hợp đồng tương lai',
    group: 'derivatives',
    defaultW: 8,
    defaultH: 7,
    minW: 4,
    minH: 3,
    inTemplate: false,
    keywords: 'VN30F VN100F phái sinh đáo hạn',
  },
  {
    slug: 'world_indices',
    name: 'Chỉ số thế giới',
    group: 'global',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'mỹ dow sp500 nasdaq nikkei hang seng',
  },
  {
    slug: 'commodities_fx',
    name: 'Hàng hoá và tỷ giá',
    group: 'global',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'vàng dầu thép urê cao su cà phê usd sjc tỷ giá dxy',
  },
  {
    slug: 'events_calendar',
    name: 'Lịch sự kiện',
    group: 'events_news',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: true,
    keywords: 'cổ tức GDKHQ đại hội cổ đông',
  },
  {
    slug: 'market_news',
    name: 'Tin thị trường',
    group: 'events_news',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 3,
    inTemplate: false,
    keywords: 'tin tức doanh nghiệp thế giới',
  },
] as const;

export const MARKET_OVERVIEW_WIDGET_MAP: ReadonlyMap<
  MarketOverviewWidgetSlug,
  MarketOverviewWidgetSpec
> = new Map(MARKET_OVERVIEW_WIDGETS.map((widget) => [widget.slug, widget]));

export interface MarketOverviewPageItem {
  uid: string;
  widget: MarketOverviewWidgetSlug;
  x: number;
  y: number;
  w: number;
  h: number;
  state: Record<string, string>;
}

/**
 * Curated 13-widget layout for the read-only "Thị trường" tab:
 * exact 12 columns × 38 rows (456 cells), zero overlaps, zero holes.
 */
export const MARKET_TEMPLATE_ITEMS: readonly MarketOverviewPageItem[] = [
  // Row Band 1: y = 0..8 (9 rows)
  {
    uid: 'tpl_index_chart',
    widget: 'index_chart',
    x: 0,
    y: 0,
    w: 8,
    h: 9,
    state: { index: 'VNINDEX', range: 'intraday' },
  },
  {
    uid: 'tpl_market_breadth',
    widget: 'market_breadth',
    x: 8,
    y: 0,
    w: 4,
    h: 3,
    state: {},
  },
  {
    uid: 'tpl_market_liquidity',
    widget: 'market_liquidity',
    x: 8,
    y: 3,
    w: 4,
    h: 6,
    state: {},
  },
  // Row Band 2: y = 9..15 (7 rows)
  {
    uid: 'tpl_foreign_flow',
    widget: 'foreign_flow',
    x: 0,
    y: 9,
    w: 4,
    h: 7,
    state: { exchange: 'HOSE', tab: 'foreign' },
  },
  {
    uid: 'tpl_vnindex_impact',
    widget: 'vnindex_impact',
    x: 4,
    y: 9,
    w: 4,
    h: 7,
    state: {},
  },
  {
    uid: 'tpl_derivatives_summary',
    widget: 'derivatives_summary',
    x: 8,
    y: 9,
    w: 4,
    h: 7,
    state: {},
  },
  // Row Band 3: y = 16..23 (8 rows)
  {
    uid: 'tpl_market_heatmap',
    widget: 'market_heatmap',
    x: 0,
    y: 16,
    w: 8,
    h: 8,
    state: { mode: 'stock', sizeBy: 'market_cap' },
  },
  {
    uid: 'tpl_featured_stocks',
    widget: 'featured_stocks',
    x: 8,
    y: 16,
    w: 4,
    h: 8,
    state: { tab: 'gainers' },
  },
  // Row Band 4: y = 24..30 (7 rows)
  {
    uid: 'tpl_sector_performance',
    widget: 'sector_performance',
    x: 0,
    y: 24,
    w: 6,
    h: 7,
    state: { period: 'today', tab: 'price' },
  },
  {
    uid: 'tpl_sector_rotation',
    widget: 'sector_rotation',
    x: 6,
    y: 24,
    w: 6,
    h: 7,
    state: {},
  },
  // Row Band 5: y = 31..37 (7 rows)
  {
    uid: 'tpl_world_indices',
    widget: 'world_indices',
    x: 0,
    y: 31,
    w: 4,
    h: 7,
    state: {},
  },
  {
    uid: 'tpl_commodities_fx',
    widget: 'commodities_fx',
    x: 4,
    y: 31,
    w: 4,
    h: 7,
    state: { tab: 'energy_metals' },
  },
  {
    uid: 'tpl_events_calendar',
    widget: 'events_calendar',
    x: 8,
    y: 31,
    w: 4,
    h: 7,
    state: { filter: 'all' },
  },
];

export function isMarketOverviewWidgetSlug(value: unknown): value is MarketOverviewWidgetSlug {
  return (
    typeof value === 'string' && MARKET_OVERVIEW_WIDGET_MAP.has(value as MarketOverviewWidgetSlug)
  );
}

export function getWidgetSpec(slug: MarketOverviewWidgetSlug): MarketOverviewWidgetSpec {
  const spec = MARKET_OVERVIEW_WIDGET_MAP.get(slug);
  if (!spec) {
    throw new Error(`Unknown market overview widget slug: ${String(slug)}`);
  }
  return spec;
}

export function isWidgetEnabled(widget: MarketOverviewWidgetSlug, newsEnabled = false): boolean {
  if (widget === 'market_news') {
    return newsEnabled;
  }
  return true;
}

export function getEnabledWidgets(newsEnabled = false): MarketOverviewWidgetSpec[] {
  return MARKET_OVERVIEW_WIDGETS.filter((widget) => isWidgetEnabled(widget.slug, newsEnabled));
}

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return fallback;
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function defaultWidgetState<W extends MarketOverviewWidgetSlug>(
  widget: W,
): MarketOverviewWidgetStateMap[W] {
  return sanitizeWidgetState(widget, {});
}

export function sanitizeWidgetState<W extends MarketOverviewWidgetSlug>(
  widget: W,
  rawState: unknown,
): MarketOverviewWidgetStateMap[W] {
  const input = asRecord(rawState);

  switch (widget) {
    case 'index_chart':
      return {
        index: pickEnum(input.index, INDEX_CHART_INDICES, 'VNINDEX'),
        range: pickEnum(input.range, INDEX_CHART_RANGES, 'intraday'),
      } as MarketOverviewWidgetStateMap[W];

    case 'foreign_flow':
      return {
        exchange: pickEnum(input.exchange, FOREIGN_FLOW_EXCHANGES, 'HOSE'),
        tab: pickEnum(input.tab, FOREIGN_FLOW_TABS, 'foreign'),
      } as MarketOverviewWidgetStateMap[W];

    case 'market_heatmap':
      return {
        mode: pickEnum(input.mode, HEATMAP_MODES, 'stock'),
        sizeBy: pickEnum(input.sizeBy, HEATMAP_SIZE_BY, 'market_cap'),
      } as MarketOverviewWidgetStateMap[W];

    case 'featured_stocks':
      return {
        tab: pickEnum(input.tab, FEATURED_STOCKS_TABS, 'gainers'),
      } as MarketOverviewWidgetStateMap[W];

    case 'sector_performance':
      return {
        period: pickEnum(input.period, SECTOR_PERFORMANCE_PERIODS, 'today'),
        tab: pickEnum(input.tab, SECTOR_PERFORMANCE_TABS, 'price'),
      } as MarketOverviewWidgetStateMap[W];

    case 'vn30f_vs_vn30':
      return {
        range: pickEnum(input.range, VN30F_VS_VN30_RANGES, 'intraday'),
      } as MarketOverviewWidgetStateMap[W];

    case 'commodities_fx':
      return {
        tab: pickEnum(input.tab, COMMODITIES_FX_TABS, 'energy_metals'),
      } as MarketOverviewWidgetStateMap[W];

    case 'events_calendar':
      return {
        filter: pickEnum(input.filter, EVENTS_CALENDAR_FILTERS, 'all'),
      } as MarketOverviewWidgetStateMap[W];

    case 'market_breadth':
    case 'market_liquidity':
    case 'vnindex_impact':
    case 'sector_rotation':
    case 'derivatives_summary':
    case 'futures_table':
    case 'world_indices':
    case 'market_news':
      return {} as MarketOverviewWidgetStateMap[W];
  }
}

/**
 * Zod v4 request/response schemas for "Toàn cảnh thị trường" (market-overview).
 * Every schema is authored to serialize cleanly with
 * `z.toJSONSchema(schema, { target: 'openapi-3.0' })` for OpenAPI & client codegen.
 */
import { z } from 'zod';

import {
  COMMODITIES_FX_TABS,
  EVENTS_CALENDAR_FILTERS,
  FEATURED_STOCKS_TABS,
  FOREIGN_FLOW_EXCHANGES,
  FOREIGN_FLOW_TABS,
  HEATMAP_MODES,
  HEATMAP_SIZE_BY,
  INDEX_CHART_INDICES,
  INDEX_CHART_RANGES,
  MARKET_OVERVIEW_WIDGET_GROUPS,
  MARKET_OVERVIEW_WIDGET_SLUGS,
  SECTOR_PERFORMANCE_PERIODS,
  SECTOR_PERFORMANCE_TABS,
  VN30F_VS_VN30_RANGES,
  type MarketOverviewWidgetSlug,
} from './market-overview.catalog.js';
import { MAX_PAGES_PER_USER } from './market-overview.validation.js';

export const marketOverviewWidgetSlugSchema = z.enum(MARKET_OVERVIEW_WIDGET_SLUGS);
export const marketOverviewWidgetGroupSchema = z.enum(MARKET_OVERVIEW_WIDGET_GROUPS);

export const marketOverviewPageIdParamSchema = z.string().min(1).max(64);

/** Item shape stored/returned on a page. */
export const marketOverviewPageItemSchema = z.object({
  uid: z.string(),
  widget: marketOverviewWidgetSlugSchema,
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
  state: z.record(z.string(), z.string()),
});

export type MarketOverviewPageItemDto = z.infer<typeof marketOverviewPageItemSchema>;

/** Item input accepted from clients (bounds/overlap/state sanitization enforced in service). */
export const marketOverviewPageItemInputSchema = z.object({
  uid: z.string().min(1).max(64),
  widget: marketOverviewWidgetSlugSchema,
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
  state: z.record(z.string(), z.unknown()).optional(),
});

export type MarketOverviewPageItemInputDto = z.infer<typeof marketOverviewPageItemInputSchema>;

export const marketOverviewPageSchema = z.object({
  version: z.number().int(),
  id: z.string(),
  name: z.string(),
  order: z.number().int(),
  items: z.array(marketOverviewPageItemSchema),
  updatedAt: z.string(),
});

export type MarketOverviewPageDto = z.infer<typeof marketOverviewPageSchema>;

export const marketOverviewWidgetCatalogEntrySchema = z.object({
  slug: marketOverviewWidgetSlugSchema,
  name: z.string(),
  group: marketOverviewWidgetGroupSchema,
  groupLabel: z.string(),
  defaultW: z.number().int(),
  defaultH: z.number().int(),
  minW: z.number().int(),
  minH: z.number().int(),
  inTemplate: z.boolean(),
  keywords: z.string(),
  defaultState: z.record(z.string(), z.string()),
});

export type MarketOverviewWidgetCatalogEntryDto = z.infer<
  typeof marketOverviewWidgetCatalogEntrySchema
>;

export const marketOverviewTemplateResponseSchema = z.object({
  version: z.number().int(),
  id: z.literal('thi-truong'),
  name: z.string(),
  readonly: z.literal(true),
  items: z.array(marketOverviewPageItemSchema),
  catalog: z.array(marketOverviewWidgetCatalogEntrySchema),
  groups: z.array(
    z.object({
      id: marketOverviewWidgetGroupSchema,
      label: z.string(),
    }),
  ),
  limits: z.object({
    cols: z.number().int(),
    maxHeight: z.number().int(),
    maxPages: z.number().int(),
    maxWidgetsPerPage: z.number().int(),
    maxPageNameLength: z.number().int(),
  }),
  updatedAt: z.string(),
});

export type MarketOverviewTemplateResponse = z.infer<typeof marketOverviewTemplateResponseSchema>;

export const marketOverviewPagesListResponseSchema = z.object({
  pages: z.array(marketOverviewPageSchema),
  lastActivePageId: z.string(),
  maxPages: z.number().int(),
});

export type MarketOverviewPagesListResponse = z.infer<typeof marketOverviewPagesListResponseSchema>;

export const createMarketOverviewPageSchema = z
  .object({
    name: z.string().optional(),
    duplicateFromPageId: z.string().min(1).max(64).optional(),
    items: z.array(marketOverviewPageItemInputSchema).optional(),
  })
  .strict();

export type CreateMarketOverviewPageInput = z.infer<typeof createMarketOverviewPageSchema>;

export const updateMarketOverviewPageSchema = z
  .object({
    name: z.string().optional(),
    items: z.array(marketOverviewPageItemInputSchema).optional(),
  })
  .strict();

export type UpdateMarketOverviewPageInput = z.infer<typeof updateMarketOverviewPageSchema>;

export const reorderMarketOverviewPagesSchema = z
  .object({
    pageIds: z.array(z.string().min(1).max(64)).max(MAX_PAGES_PER_USER),
  })
  .strict();

export type ReorderMarketOverviewPagesInput = z.infer<typeof reorderMarketOverviewPagesSchema>;

export const reorderMarketOverviewPagesResponseSchema = z.object({
  pages: z.array(marketOverviewPageSchema),
});

export type ReorderMarketOverviewPagesResponse = z.infer<
  typeof reorderMarketOverviewPagesResponseSchema
>;

export const updateMarketOverviewPreferencesSchema = z
  .object({
    lastActivePageId: z.string().min(1).max(64),
  })
  .strict();

export type UpdateMarketOverviewPreferencesInput = z.infer<
  typeof updateMarketOverviewPreferencesSchema
>;

export const marketOverviewPreferencesResponseSchema = z.object({
  lastActivePageId: z.string(),
  updatedAt: z.string(),
});

export type MarketOverviewPreferencesResponse = z.infer<
  typeof marketOverviewPreferencesResponseSchema
>;

export const deleteMarketOverviewPageResponseSchema = z.object({
  deleted: z.boolean(),
  id: z.string(),
  lastActivePageId: z.string(),
});

export type DeleteMarketOverviewPageResponse = z.infer<
  typeof deleteMarketOverviewPageResponseSchema
>;

// ---------------------------------------------------------------------------
// Widget data endpoint params & query schemas
// ---------------------------------------------------------------------------

export const widgetDataParamSchema = z.object({
  widget: marketOverviewWidgetSlugSchema,
});

export type WidgetDataParam = z.infer<typeof widgetDataParamSchema>;

export const widgetDataQuerySchema = z.object({
  index: z.enum(INDEX_CHART_INDICES).optional(),
  range: z.enum(['intraday', '1m', '3m', '1y']).optional(),
  exchange: z.enum(FOREIGN_FLOW_EXCHANGES).optional(),
  tab: z
    .enum([
      'foreign',
      'prop',
      'gainers',
      'losers',
      'liquidity',
      'vol_spike',
      'price',
      'flow',
      'energy_metals',
      'agri',
      'gold_fx',
    ])
    .optional(),
  mode: z.enum(HEATMAP_MODES).optional(),
  sizeBy: z.enum(HEATMAP_SIZE_BY).optional(),
  period: z.enum(SECTOR_PERFORMANCE_PERIODS).optional(),
  filter: z.enum(EVENTS_CALENDAR_FILTERS).optional(),
});

export type WidgetDataQuery = z.infer<typeof widgetDataQuerySchema>;

// ---------------------------------------------------------------------------
// Per-widget strongly-typed data payload schemas (all 16 widgets)
// ---------------------------------------------------------------------------

/** 1. Biểu đồ chỉ số (`index_chart`) */
export const indexChartCardSchema = z.object({
  code: z.enum(INDEX_CHART_INDICES),
  name: z.string(),
  price: z.number(),
  refPrice: z.number(),
  change: z.number(),
  changePct: z.number(),
  volume: z.number(),
  valueBillion: z.number(),
  sparkline: z.array(z.number()),
});

export const indexChartPointSchema = z.object({
  t: z.string(),
  v: z.number(),
  vol: z.number(),
  isUp: z.boolean(),
});

export const indexChartDataSchema = z.object({
  cards: z.array(indexChartCardSchema),
  selected: z.object({
    code: z.enum(INDEX_CHART_INDICES),
    name: z.string(),
    price: z.number(),
    refPrice: z.number(),
    change: z.number(),
    changePct: z.number(),
    volume: z.number(),
    valueBillion: z.number(),
    range: z.enum(INDEX_CHART_RANGES),
    points: z.array(indexChartPointSchema),
  }),
});

export type IndexChartData = z.infer<typeof indexChartDataSchema>;

/** 2. Độ rộng thị trường (`market_breadth`) */
export const marketBreadthExchangeRowSchema = z.object({
  exchange: z.enum(['HOSE', 'HNX', 'UPCOM']),
  ceiling: z.number().int(),
  advancing: z.number().int(),
  unchanged: z.number().int(),
  declining: z.number().int(),
  floor: z.number().int(),
  total: z.number().int(),
  advancingTotal: z.number().int(),
  decliningTotal: z.number().int(),
});

export const marketBreadthDataSchema = z.object({
  exchanges: z.array(marketBreadthExchangeRowSchema),
});

export type MarketBreadthData = z.infer<typeof marketBreadthDataSchema>;

/** 3. Thanh khoản thị trường (`market_liquidity`) */
export const marketLiquidityPointSchema = z.object({
  t: z.string(),
  today: z.number().nullable(),
  prev: z.number().nullable(),
  avg20: z.number().nullable(),
});

export const marketLiquidityDataSchema = z.object({
  exchange: z.enum(['HOSE', 'HNX', 'UPCOM']),
  currentValueBillion: z.number(),
  pctVsPrevSameTime: z.number().nullable(),
  pctVsAvg20SameTime: z.number().nullable(),
  points: z.array(marketLiquidityPointSchema),
});

export type MarketLiquidityData = z.infer<typeof marketLiquidityDataSchema>;

/** 4. Khối ngoại và tự doanh (`foreign_flow`) */
export const foreignFlowSessionSchema = z.object({
  date: z.string(),
  netBillion: z.number(),
  buyBillion: z.number(),
  sellBillion: z.number(),
});

export const foreignFlowTopTickerSchema = z.object({
  symbol: z.string(),
  netBillion: z.number(),
});

export const foreignFlowDataSchema = z.object({
  exchange: z.enum(FOREIGN_FLOW_EXCHANGES),
  tab: z.enum(FOREIGN_FLOW_TABS),
  propSupported: z.boolean(),
  netBillion: z.number(),
  buyBillion: z.number(),
  sellBillion: z.number(),
  sessions: z.array(foreignFlowSessionSchema),
  topBuy: z.array(foreignFlowTopTickerSchema),
  topSell: z.array(foreignFlowTopTickerSchema),
});

export type ForeignFlowData = z.infer<typeof foreignFlowDataSchema>;

/** 5. Tác động lên VN-Index (`vnindex_impact`) */
export const vnindexImpactItemSchema = z.object({
  symbol: z.string(),
  impact: z.number(),
  price: z.number(),
  changePct: z.number(),
});

export const vnindexImpactDataSchema = z.object({
  sumUp: z.number(),
  sumDn: z.number(),
  indexChange: z.number(),
  delta: z.number(),
  positive: z.array(vnindexImpactItemSchema),
  negative: z.array(vnindexImpactItemSchema),
});

export type VnindexImpactData = z.infer<typeof vnindexImpactDataSchema>;

/** 6. Bản đồ nhiệt thị trường (`market_heatmap`) */
export const marketHeatmapStockSchema = z.object({
  symbol: z.string(),
  exchange: z.string(),
  price: z.number(),
  refPrice: z.number(),
  ceilingPrice: z.number(),
  floorPrice: z.number(),
  changePct: z.number(),
  marketCapBillion: z.number(),
  valueBillion: z.number(),
  isCeiling: z.boolean(),
  isFloor: z.boolean(),
});

export const marketHeatmapSectorSchema = z.object({
  code: z.string(),
  name: z.string(),
  changePct: z.number(),
  marketCapBillion: z.number(),
  valueBillion: z.number(),
  stocks: z.array(marketHeatmapStockSchema),
});

export const marketHeatmapDataSchema = z.object({
  mode: z.enum(HEATMAP_MODES),
  sizeBy: z.enum(HEATMAP_SIZE_BY),
  sectors: z.array(marketHeatmapSectorSchema),
});

export type MarketHeatmapData = z.infer<typeof marketHeatmapDataSchema>;

/** 7. Cổ phiếu nổi bật (`featured_stocks`) */
export const featuredStockRowSchema = z.object({
  symbol: z.string(),
  exchange: z.string(),
  price: z.number(),
  refPrice: z.number(),
  ceilingPrice: z.number(),
  floorPrice: z.number(),
  changePct: z.number(),
  valueBillion: z.number(),
  foreignNetBillion: z.number(),
  volRatio20d: z.number().nullable(),
});

export const featuredStocksDataSchema = z.object({
  tab: z.enum(FEATURED_STOCKS_TABS),
  rows: z.array(featuredStockRowSchema),
});

export type FeaturedStocksData = z.infer<typeof featuredStocksDataSchema>;

/** 8. Hiệu suất ngành (`sector_performance`) */
export const sectorPerformanceRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  changePct: z.number(),
  advancing: z.number().int(),
  declining: z.number().int(),
  unchanged: z.number().int(),
  valueSharePct: z.number(),
  valueRatio20d: z.number().nullable(),
  valueBillion: z.number(),
});

export const sectorPerformanceDataSchema = z.object({
  period: z.enum(SECTOR_PERFORMANCE_PERIODS),
  tab: z.enum(SECTOR_PERFORMANCE_TABS),
  rows: z.array(sectorPerformanceRowSchema),
});

export type SectorPerformanceData = z.infer<typeof sectorPerformanceDataSchema>;

/** 9. Chu kỳ ngành (`sector_rotation`) */
export const sectorRotationQuadrantSchema = z.enum([
  'leading',
  'weakening',
  'lagging',
  'improving',
]);

export const sectorRotationTrailPointSchema = z.object({
  week: z.string(),
  rsRatio: z.number(),
  rsMomentum: z.number(),
});

export const sectorRotationSectorSchema = z.object({
  code: z.string(),
  name: z.string(),
  quadrant: sectorRotationQuadrantSchema,
  trail: z.array(sectorRotationTrailPointSchema),
});

export const sectorRotationDataSchema = z.object({
  weekEnding: z.string(),
  domain: z.object({
    minRatio: z.number(),
    maxRatio: z.number(),
    minMomentum: z.number(),
    maxMomentum: z.number(),
  }),
  sectors: z.array(sectorRotationSectorSchema),
});

export type SectorRotationData = z.infer<typeof sectorRotationDataSchema>;

/** 10. Tổng quan phái sinh (`derivatives_summary`) */
export const derivativesSummaryDataSchema = z.object({
  contract: z.string(),
  price: z.number().nullable(),
  refPrice: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  vn30Price: z.number().nullable(),
  vn30Change: z.number().nullable(),
  vn30ChangePct: z.number().nullable(),
  basis: z.number().nullable(),
  volume: z.number().nullable(),
  valueBillion: z.number().nullable(),
  foreignNetContracts: z.number().nullable(),
  expiryDate: z.string(),
  remainingSessions: z.number().int(),
});

export type DerivativesSummaryData = z.infer<typeof derivativesSummaryDataSchema>;

/** 11. VN30F1M so với VN30 (`vn30f_vs_vn30`) */
export const vn30fVsVn30PointSchema = z.object({
  t: z.string(),
  vn30: z.number().nullable(),
  vn30f: z.number().nullable(),
  basis: z.number().nullable(),
});

export const vn30fVsVn30DataSchema = z.object({
  range: z.enum(VN30F_VS_VN30_RANGES),
  latestVn30: z.number().nullable(),
  latestVn30f: z.number().nullable(),
  latestBasis: z.number().nullable(),
  points: z.array(vn30fVsVn30PointSchema),
});

export type Vn30fVsVn30Data = z.infer<typeof vn30fVsVn30DataSchema>;

/** 12. Bảng hợp đồng tương lai (`futures_table`) */
export const futuresContractRowSchema = z.object({
  code: z.string(),
  displayCode: z.string(),
  expiryDate: z.string(),
  remainingSessions: z.number().int(),
  price: z.number().nullable(),
  refPrice: z.number().nullable(),
  changePct: z.number().nullable(),
  basis: z.number().nullable(),
  volume: z.number().nullable(),
  valueBillion: z.number().nullable(),
  foreignNetBillion: z.number().nullable(),
});

export const futuresTableGroupSchema = z.object({
  underlying: z.enum(['VN30', 'VN100']),
  spotPrice: z.number().nullable(),
  spotChangePct: z.number().nullable(),
  contracts: z.array(futuresContractRowSchema),
});

export const futuresTableDataSchema = z.object({
  groups: z.array(futuresTableGroupSchema),
});

export type FuturesTableData = z.infer<typeof futuresTableDataSchema>;

/** 13. Chỉ số thế giới (`world_indices`) */
export const worldIndexRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  country: z.string(),
  isOpen: z.boolean(),
  price: z.number().nullable(),
  changePct: z.number().nullable(),
  updatedAt: z.string().nullable(),
});

export const worldIndicesDataSchema = z.object({
  rows: z.array(worldIndexRowSchema),
});

export type WorldIndicesData = z.infer<typeof worldIndicesDataSchema>;

/** 14. Hàng hoá và tỷ giá (`commodities_fx`) */
export const commodityFxRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  price: z.number().nullable(),
  changePct: z.number().nullable(),
  mappedSectorName: z.string().nullable(),
  mappedSectorChangePct: z.number().nullable(),
});

export const commoditiesFxDataSchema = z.object({
  tab: z.enum(COMMODITIES_FX_TABS),
  rows: z.array(commodityFxRowSchema),
});

export type CommoditiesFxData = z.infer<typeof commoditiesFxDataSchema>;

/** 15. Lịch sự kiện (`events_calendar`) */
export const eventsCalendarRowSchema = z.object({
  id: z.string(),
  exDate: z.string(),
  symbol: z.string(),
  price: z.number().nullable(),
  changePct: z.number().nullable(),
  eventType: z.enum(['cash', 'other']),
  title: z.string(),
  cashPerShare: z.number().nullable(),
  dividendYieldPct: z.number().nullable(),
});

export const eventsCalendarDataSchema = z.object({
  filter: z.enum(EVENTS_CALENDAR_FILTERS),
  rows: z.array(eventsCalendarRowSchema),
});

export type EventsCalendarData = z.infer<typeof eventsCalendarDataSchema>;

/** 16. Tin thị trường (`market_news`) */
export const marketNewsRowSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  url: z.string().nullable(),
  category: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  source: z.string().nullable(),
});

export const marketNewsDataSchema = z.object({
  enabled: z.boolean(),
  rows: z.array(marketNewsRowSchema),
});

export type MarketNewsData = z.infer<typeof marketNewsDataSchema>;

// ---------------------------------------------------------------------------
// Discriminated union widget response envelope
// ---------------------------------------------------------------------------

const widgetEnvelopeBaseFields = {
  asOf: z.string(),
  sessionDate: z.string(),
  isMarketOpen: z.boolean(),
  stale: z.boolean(),
};

export const marketOverviewWidgetResponseSchema = z.discriminatedUnion('widget', [
  z.object({
    widget: z.literal('index_chart'),
    ...widgetEnvelopeBaseFields,
    data: indexChartDataSchema,
  }),
  z.object({
    widget: z.literal('market_breadth'),
    ...widgetEnvelopeBaseFields,
    data: marketBreadthDataSchema,
  }),
  z.object({
    widget: z.literal('market_liquidity'),
    ...widgetEnvelopeBaseFields,
    data: marketLiquidityDataSchema,
  }),
  z.object({
    widget: z.literal('foreign_flow'),
    ...widgetEnvelopeBaseFields,
    data: foreignFlowDataSchema,
  }),
  z.object({
    widget: z.literal('vnindex_impact'),
    ...widgetEnvelopeBaseFields,
    data: vnindexImpactDataSchema,
  }),
  z.object({
    widget: z.literal('market_heatmap'),
    ...widgetEnvelopeBaseFields,
    data: marketHeatmapDataSchema,
  }),
  z.object({
    widget: z.literal('featured_stocks'),
    ...widgetEnvelopeBaseFields,
    data: featuredStocksDataSchema,
  }),
  z.object({
    widget: z.literal('sector_performance'),
    ...widgetEnvelopeBaseFields,
    data: sectorPerformanceDataSchema,
  }),
  z.object({
    widget: z.literal('sector_rotation'),
    ...widgetEnvelopeBaseFields,
    data: sectorRotationDataSchema,
  }),
  z.object({
    widget: z.literal('derivatives_summary'),
    ...widgetEnvelopeBaseFields,
    data: derivativesSummaryDataSchema,
  }),
  z.object({
    widget: z.literal('vn30f_vs_vn30'),
    ...widgetEnvelopeBaseFields,
    data: vn30fVsVn30DataSchema,
  }),
  z.object({
    widget: z.literal('futures_table'),
    ...widgetEnvelopeBaseFields,
    data: futuresTableDataSchema,
  }),
  z.object({
    widget: z.literal('world_indices'),
    ...widgetEnvelopeBaseFields,
    data: worldIndicesDataSchema,
  }),
  z.object({
    widget: z.literal('commodities_fx'),
    ...widgetEnvelopeBaseFields,
    data: commoditiesFxDataSchema,
  }),
  z.object({
    widget: z.literal('events_calendar'),
    ...widgetEnvelopeBaseFields,
    data: eventsCalendarDataSchema,
  }),
  z.object({
    widget: z.literal('market_news'),
    ...widgetEnvelopeBaseFields,
    data: marketNewsDataSchema,
  }),
]);

export type MarketOverviewWidgetResponse = z.infer<typeof marketOverviewWidgetResponseSchema>;

export type MarketOverviewWidgetResponseOf<W extends MarketOverviewWidgetSlug> = Extract<
  MarketOverviewWidgetResponse,
  { widget: W }
>;

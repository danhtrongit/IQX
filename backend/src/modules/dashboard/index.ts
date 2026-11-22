export { DashboardModule } from './dashboard.module.js';
export { DashboardDataController, DashboardSettingsController } from './dashboard.controller.js';
export {
  DASHBOARD_CHAPTERS,
  DASHBOARD_CHART_KINDS,
  DASHBOARD_CHART_NAMES,
  DASHBOARD_CHARTS,
  DASHBOARD_DEFAULT_CHARTS,
  DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY,
  DASHBOARD_DEFAULT_PERIODS,
  DASHBOARD_INDUSTRY_CHAPTERS,
  DASHBOARD_INDUSTRY_CHARTS,
  DASHBOARD_INDUSTRY_COUNTS,
  DASHBOARD_MAX_QUARTERS,
  DASHBOARD_MAX_YEARS,
  DASHBOARD_PERIOD_MODES,
  DASHBOARD_QUARTER_PERIODS,
  DASHBOARD_SCOPES,
  DASHBOARD_YEAR_PERIODS,
  NATIVE_METRIC_IDS,
  PENDING_V3_METRIC_IDS,
  V3_NEW_METRIC_IDS,
  V3_VARIANT_METRIC_KEYS,
  chartFor,
  dashboardDecimals,
  dashboardUnit,
  isDashboardChartName,
} from './dashboard.catalog.js';
export type {
  DashboardChapterInfo,
  DashboardChapterSpec,
  DashboardChartKind,
  DashboardChartSpec,
  DashboardGroupSpec,
  DashboardScope,
  DashboardSubType,
  NativeMetricId,
  PendingV3MetricId,
  V3NewMetricId,
  V3VariantMetricId,
} from './dashboard.catalog.js';
export {
  COMMON_ACADEMY_CHAPTER,
  NEW_NGANH,
  NGANH,
  NGANH_ACADEMY_CHAPTERS,
  NGANH_CHAPTER_TITLES,
  NGANH_LABELS,
  isNganh,
  nganhOf,
} from './dashboard.nganh.js';
export type { IcbCodes, Nganh } from './dashboard.nganh.js';
export { ICB_RETRY_MS, ICB_TTL_MS, IcbDirectory } from './dashboard.icb.js';
export {
  INDUSTRY_MAPPINGS,
  industryConcepts,
  industryFieldMap,
  normalizeIndustryStatements,
} from './dashboard.mapping.js';
export type {
  ConceptKind,
  DashboardConcept,
  IndustryConcept,
  IndustryMapping,
} from './dashboard.mapping.js';
export { NATIVE_METRICS } from './dashboard.native.js';
export type { NativeMetric, NativeValues } from './dashboard.native.js';
export {
  DASHBOARD_DEFAULT_SETTINGS,
  DASHBOARD_MAX_VALUATION_YEARS,
  DashboardService,
  defaultDashboardSettings,
} from './dashboard.service.js';
export type {
  DashboardFundamentalResponse,
  DashboardIndustryResponse,
  DashboardValuationChart,
  DashboardV3Context,
  DashboardValuationResponse,
} from './dashboard.service.js';
export {
  DashboardSettingsRepository,
  type DashboardSettingsStore,
  type StoredDashboardSettings,
} from './dashboard.repository.js';
export {
  REVENUE_LABELS,
  annualStatements,
  buildDashboardChart,
  cccParts,
  displayValue,
  pegValue,
  quarterWindow,
  sliceQuarters,
  sliceYears,
  toBillion,
  yearWindow,
} from './dashboard.series.js';
export type {
  CccParts,
  DashboardChartPayload,
  DashboardContext,
  DashboardFixedData,
  DashboardSeriesData,
  DashboardWindow,
} from './dashboard.series.js';
export * from './dashboard.schemas.js';

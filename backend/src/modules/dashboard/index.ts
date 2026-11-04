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
  chartInIndustry,
  dashboardChart,
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
} from './dashboard.catalog.js';
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

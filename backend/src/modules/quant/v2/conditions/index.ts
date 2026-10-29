/**
 * Indicator conditions V3 (`iqx-rules-4.0`): one definition source (the registry rows), one
 * evaluator and one validator shared by Bot, Backtest, Strategy alerts and Luyện tập.
 */
export { createSeriesCache, type SeriesCache } from './series-cache.js';
export {
  evaluateIndicatorSide,
  evaluateIndicatorSideSeries,
  evaluateRow,
  isParamsSide,
  type IndicatorSideEvaluation,
  type RowEvaluation,
} from './evaluate.js';
export {
  SIDE_LABEL,
  fastSlowMessage,
  optionsMessage,
  rangeMessage,
  rowPrefix,
  validateRow,
  validateSideRows,
} from './validate.js';
export {
  isParamsEntry,
  isRowsEntry,
  renderRowSentence,
  rowDefinition,
  sentenceParts,
  type SentencePart,
} from './definitions.js';
export { defaultConfigV4, defaultIndicatorConfig, defaultRows, defaultSide } from './defaults.js';
export { isCurrentFormat, isHistoricalRuleVersion, isHistoricalSchemaVersion } from './format.js';

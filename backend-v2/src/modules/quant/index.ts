export { QuantModule } from './quant.module.js';
export { QuantService } from './quant.service.js';
export {
  calcIndicators,
  computeIndicators,
  buildFrame,
  latestIndicatorValues,
  ohlcvFromRecords,
} from './indicators.js';
export type { Ohlcv, OhlcvRecord, NumericFrame, IndicatorName } from './indicators.js';
export {
  evalConditionSeries,
  evaluateSeries,
  evaluateLatest,
  validateCondition,
  validateCombination,
  CombinationError,
} from './conditions.js';
export type { Condition, Combination, Logic } from './conditions.js';
export {
  runBacktest,
  sharesFor,
  attachVnIndex,
  maxDrawdown,
  sharpeWithConfidence,
} from './backtest.engine.js';
export {
  runBacktestInWorker,
  backtestWorkerConfig,
  BacktestWorkerError,
} from './backtest.worker-runner.js';
export type {
  RiskConfig,
  BacktestResult,
  BacktestKpis,
  TradeOutput,
  EquityPoint,
} from './backtest.engine.js';
export {
  FACTORS,
  factorLibraryPayload,
  resolveFactor,
  INDICATOR_DISPLAY,
  displayName,
} from './catalog.js';

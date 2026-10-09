/**
 * Bot-v2 technical engine (calculation_version iqx-ta-2.0): pure, deterministic
 * functions with no Nest/DB dependencies. Public surface per CONTRACTS.md §6.
 */
export * from './types.js';
export {
  loadLegacyTechnicalRegistry,
  loadTechnicalRegistry,
  parseLegacyTechnicalRegistry,
  parseTechnicalRegistry,
} from './technical-registry.js';
export { calc, calcLegacy, isCurrentIndicatorId, isFiniteNumber, validBar } from './indicators.js';
export {
  and3,
  evalTree,
  evaluateRule,
  evaluateRuleWithEvidence,
  type TriTreeNode,
} from './rules.js';
export { defaultConfig, effectiveField, indicatorCapability, validateConfig } from './config.js';
export {
  isLegacyConfig,
  mapLegacyConfig,
  removedIndicatorIds,
  type LegacyConfigMapping,
  type LegacyConfigMappingResult,
  type LegacyConfigReview,
  type LegacySideReview,
  type LegacySideStatus,
} from './legacy-config.js';
export { indicatorSideSignals, sideSignals, sideSignalsWithEvidence } from './signals.js';
export { DEFAULT_RUN_OPTIONS, runBacktest } from './backtest.js';
export { EngineRunError, type EngineRunErrorCode } from './errors.js';
export { canonicalJson, configHash, sha256Hex } from './hash.js';

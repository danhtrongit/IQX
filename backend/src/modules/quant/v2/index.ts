/**
 * Bot-v2 technical engine (calculation_version iqx-ta-2.0): pure, deterministic
 * functions with no Nest/DB dependencies. Public surface per CONTRACTS.md §6.
 */
export * from './types.js';
export { loadTechnicalRegistry, parseTechnicalRegistry } from './technical-registry.js';
export { calc, isFiniteNumber, validBar } from './indicators.js';
export { and3, evalTree, evaluateRule, type TriTreeNode } from './rules.js';
export { defaultConfig, effectiveField, indicatorCapability, validateConfig } from './config.js';
export { indicatorSideSignals, sideSignals } from './signals.js';
export { DEFAULT_RUN_OPTIONS, runBacktest } from './backtest.js';
export { EngineRunError, type EngineRunErrorCode } from './errors.js';
export { canonicalJson, configHash, sha256Hex } from './hash.js';

/**
 * Bot-v2 advanced engine (CONTRACTS.md §6b): research runs (Chapter 2) and the
 * multi-symbol portfolio ledger (Chapters 16–18). Pure and deterministic; no
 * Nest/DB dependencies. Inputs are never mutated and nothing here writes the
 * shared config.
 */
export { AdvancedEngineError, type AdvancedEngineErrorCode } from './errors.js';
export { evaluateLogic, logicIndicatorIds, logicSignals, validateLogicNode } from './logic.js';
export {
  SENSITIVITY_MAX_CANDIDATES,
  WALK_FORWARD_CRITERIA,
  dataHash,
  outOfSample,
  sensitivity,
  walkForward,
  type OutOfSampleAttempt,
  type OutOfSampleResult,
  type OutOfSampleSpec,
  type ResearchOptions,
  type SensitivityCandidate,
  type SensitivityGrid,
  type SensitivityResult,
  type WalkForwardCriterion,
  type WalkForwardResult,
  type WalkForwardSpec,
  type WalkForwardTrainCandidate,
  type WalkForwardWindow,
} from './research.js';
export {
  DEFAULT_CORRELATION_LOOKBACK,
  EXIT_PRIORITY,
  RANKING_KEYS,
  SYSTEM_MAX_SYMBOLS,
  runSystem,
  systemCapabilities,
  validateSystemOptions,
  type CorporateAction,
  type ExitReason,
  type LedgerEvent,
  type LedgerEventKind,
  type RankingKey,
  type SystemCanceledOrder,
  type SystemExits,
  type SystemInput,
  type SystemOpenPosition,
  type SystemOptions,
  type SystemProfile,
  type SystemResult,
  type SystemSizing,
  type SystemSymbolData,
  type SystemTrade,
  type UniverseMembership,
} from './system.js';

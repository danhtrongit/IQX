import {
  runBasketBacktest,
  type BacktestResult,
  type BasketBacktestInput,
} from '../strategy-rules/index.js';

/**
 * One basket run (§4.7), everything already resolved by the service: content, store-eligible
 * symbols, the store's columnar series. Structured-clone safe (bigint, typed arrays) so it crosses
 * the worker boundary unchanged.
 */
export type BacktestJob = Omit<BasketBacktestInput, 'signal_cache'>;
export type BacktestJobOutput = BacktestResult;

/** Pure and synchronous: the shared rules module (same code path as the Bot, Q2). */
export function executeBacktestJob(job: BacktestJob): BacktestJobOutput {
  return runBasketBacktest({ ...job, signal_cache: new Map() });
}

export type SerializedJobError = { name: string; code: string | null; message: string };

/** Errors lose their class across `postMessage`; keep name/code/message explicitly. */
export function serializeJobError(error: unknown): SerializedJobError {
  const code =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;
  return {
    name: error instanceof Error ? error.name : 'Error',
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

export class BacktestJobError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    name: string,
  ) {
    super(message);
    this.name = name;
  }
}

export function deserializeJobError(error: SerializedJobError): Error {
  return new BacktestJobError(error.message, error.code, error.name);
}

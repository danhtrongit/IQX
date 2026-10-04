import type { EngineValidationError } from './types.js';

export type EngineRunErrorCode =
  'CONFIG_INVALID' | 'BUY_RULES_REQUIRED' | 'INVALID_OPTIONS' | 'INVALID_BARS' | 'EMPTY_RANGE';

/** Rejection raised by `runBacktest`; `message` is Vietnamese and user-facing. */
export class EngineRunError extends Error {
  readonly code: EngineRunErrorCode;
  readonly errors: EngineValidationError[];

  constructor(code: EngineRunErrorCode, message: string, errors: EngineValidationError[] = []) {
    super(message);
    this.name = 'EngineRunError';
    this.code = code;
    this.errors = errors;
  }
}

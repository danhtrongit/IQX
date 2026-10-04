import type { EngineValidationError } from '../types.js';

export type AdvancedEngineErrorCode =
  | 'GRID_INVALID'
  | 'PATH_INVALID'
  | 'SPLIT_INVALID'
  | 'WALK_FORWARD_INVALID'
  | 'INSUFFICIENT_DATA'
  | 'LOGIC_INVALID'
  | 'SYSTEM_INVALID';

/**
 * Rejection raised by the advanced engine (research + system runs) for
 * request-shape problems; `message` is Vietnamese and user-facing. Config,
 * option and bar problems keep using the core `EngineRunError` codes.
 */
export class AdvancedEngineError extends Error {
  readonly code: AdvancedEngineErrorCode;
  readonly errors: EngineValidationError[];

  constructor(
    code: AdvancedEngineErrorCode,
    message: string,
    errors: EngineValidationError[] = [],
  ) {
    super(message);
    this.name = 'AdvancedEngineError';
    this.code = code;
    this.errors = errors;
  }
}

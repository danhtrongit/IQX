export type ApiErrorOptions = {
  code?: string;
  details?: unknown;
  requestId?: string;
  retryAfter?: number | string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly retryAfter?: number | string;

  constructor(message: string, status: number, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfter = options.retryAfter;
  }
}

export function errorMessage(error: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Network failures, timeouts, 429 and 5xx are worth retrying; other 4xx are not. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 429) return true;
    if (error.status >= 400 && error.status < 500) return false;
    return error.status >= 500 || error.status === 0;
  }
  if (error instanceof Error && error.name === 'AbortError') return false;
  return true;
}

/** react-query `retry` function: at most 2 retries, never 4xx except 429. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isRetryableError(error);
}

import { ApiError, isRetryableError, shouldRetryQuery } from '..';

describe('retry policy', () => {
  it('never retries 4xx except 429', () => {
    for (const s of [400, 401, 403, 404, 409, 422]) expect(isRetryableError(new ApiError('x', s))).toBe(false);
    expect(isRetryableError(new ApiError('x', 429))).toBe(true);
  });
  it('retries 5xx, network errors and unknown errors', () => {
    expect(isRetryableError(new ApiError('x', 500))).toBe(true);
    expect(isRetryableError(new ApiError('x', 503))).toBe(true);
    expect(isRetryableError(new ApiError('x', 0, { code: 'NETWORK_ERROR' }))).toBe(true);
    expect(isRetryableError(new Error('boom'))).toBe(true);
  });
  it('does not retry aborts', () => {
    const e = new Error('a'); e.name = 'AbortError';
    expect(isRetryableError(e)).toBe(false);
  });
  it('shouldRetryQuery caps at 2 retries', () => {
    const e = new ApiError('x', 500);
    expect(shouldRetryQuery(0, e)).toBe(true);
    expect(shouldRetryQuery(1, e)).toBe(true);
    expect(shouldRetryQuery(2, e)).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('x', 404))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ensureRequestId } from '../../src/platform/observability/request-id.js';

describe('request IDs', () => {
  it('accepts bounded safe IDs and preserves the ID within a request', () => {
    const request = { headers: { 'x-request-id': 'iqx.test-123' } };
    expect(ensureRequestId(request)).toBe('iqx.test-123');
    expect(ensureRequestId(request)).toBe('iqx.test-123');
  });
  it.each(['unsafe\nheader', 'x'.repeat(65), ''])('replaces unsafe request IDs', (id) => {
    const request = { headers: { 'x-request-id': id } };
    expect(ensureRequestId(request)).toMatch(/^[a-f0-9-]{36}$/);
  });
});

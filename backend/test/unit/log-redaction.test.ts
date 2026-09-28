import { describe, expect, it } from 'vitest';
import { safeRequestPath } from '../../src/platform/observability/safe-request-path.js';

describe('credential-bearing request URLs', () => {
  it('redacts webhook secrets, media bearer signatures and all query strings', () => {
    expect(safeRequestPath('/api/v2/telegram/webhook/my-secret?x=secret')).toBe(
      '/api/v2/telegram/webhook/[REDACTED]',
    );
    expect(safeRequestPath('/api/v1/telegram/webhook/my-secret')).toBe(
      '/api/v1/telegram/webhook/[REDACTED]',
    );
    expect(safeRequestPath('/api/v2/media/encoded.signature')).toBe('/api/v2/media/[REDACTED]');
    expect(safeRequestPath('/api/v2/auth/reset-password?token=secret')).toBe(
      '/api/v2/auth/reset-password',
    );
    expect(safeRequestPath('/api/v2/instruments/VCB')).toBe('/api/v2/instruments/VCB');
  });
});

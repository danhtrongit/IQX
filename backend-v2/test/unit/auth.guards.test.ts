import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PremiumGuard } from '../../src/modules/auth/premium.guard.js';
import { RolesGuard } from '../../src/modules/auth/roles.guard.js';

describe('RolesGuard', () => {
  it('rejects a non-admin user from an admin endpoint', () => {
    const reflector = { getAllAndOverride: () => ['admin'] };
    const guard = new RolesGuard(reflector as never);
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'user' } }) }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});

describe('PremiumGuard', () => {
  it('uses active effective entitlement grants as the canonical premium source', async () => {
    const reflector = { getAllAndOverride: () => true };
    const query = vi.fn().mockResolvedValue([{ entitled: true }]);
    const guard = new PremiumGuard(reflector as never, { query } as never);
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user-id', role: 'user' } }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain('billing_entitlement_grants');
    expect(query.mock.calls[0]?.[0]).toContain('starts_at <= now()');
  });
});

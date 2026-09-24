import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/index.js';
import { AlertsRepository } from '../../src/modules/alerts/alerts.repository.js';

describe('alert scan entitlement', () => {
  it('scans only admins or users with a currently effective canonical entitlement grant', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repository = new AlertsRepository({ query } as unknown as DatabaseService);

    await repository.listScannableRules();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("u.role = 'admin'");
    expect(sql).toContain('billing_entitlement_grants');
    expect(sql).toContain("g.status = 'active'");
    expect(sql).toContain('g.starts_at <= now()');
    expect(sql).toContain('now() < g.ends_at');
    expect(sql).toContain("u.status = 'active'");
  });
});

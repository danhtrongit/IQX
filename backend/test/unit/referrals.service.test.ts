import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ReferralsService } from '../../src/modules/referrals/referrals.module.js';

const USER_ID = '031c714e-4145-4895-869b-d54c1c5bc86b';

function databaseFor(query: ReturnType<typeof vi.fn>) {
  return {
    transaction: <T>(operation: (client: { query: typeof query }) => Promise<T>) =>
      operation({ query }),
  };
}

describe('ReferralsService enrollment code collisions', () => {
  it('rolls back a unique-code collision and succeeds with a fresh code', async () => {
    const collision = Object.assign(new Error('duplicate referral code'), {
      code: '23505',
      constraint: 'ix_users_referral_code',
    });
    const enrolled = {
      referral_code: 'LS_FRESH',
      referral_partner_kind: 'lead_sale',
      referral_lead_user_id: null,
      referred_by_user_id: null,
      referral_url: '/?ref=LS_FRESH',
    };
    let updateAttempts = 0;
    const query = vi.fn(async (statement: string) => {
      const sql = statement.toLowerCase();
      if (sql.includes('from users')) return [{ id: USER_ID, referral_partner_kind: null }];
      if (sql.includes('update users')) {
        updateAttempts += 1;
        if (updateAttempts === 1) throw collision;
        return [enrolled];
      }
      return [];
    });
    const service = new ReferralsService(databaseFor(query) as never);

    await expect(service.enroll(USER_ID, 'lead_sale')).resolves.toEqual(enrolled);
    const sql = query.mock.calls.map(([statement]) => String(statement).toLowerCase());
    expect(
      sql.filter((statement) => statement.includes('savepoint')).length,
    ).toBeGreaterThanOrEqual(2);
    expect(sql.some((statement) => statement.includes('rollback to savepoint'))).toBe(true);
    expect(sql.some((statement) => statement.includes('release savepoint'))).toBe(true);
    expect(updateAttempts).toBe(2);
  });

  it('returns a controlled service-unavailable error after exhausted collisions and does not audit', async () => {
    const collision = Object.assign(new Error('duplicate referral code'), {
      code: '23505',
      constraint: 'ix_users_referral_code',
    });
    let updateAttempts = 0;
    const query = vi.fn(async (statement: string) => {
      const sql = statement.toLowerCase();
      if (sql.includes('from users')) return [{ id: USER_ID, referral_partner_kind: null }];
      if (sql.includes('update users')) {
        updateAttempts += 1;
        throw collision;
      }
      return [];
    });
    const service = new ReferralsService(databaseFor(query) as never);

    await expect(
      service.enroll(USER_ID, 'lead_sale', null, { adminId: 'admin-id' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateAttempts).toBe(3);
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).toLowerCase().includes('admin_audit_log'),
      ),
    ).toBe(false);
  });
});

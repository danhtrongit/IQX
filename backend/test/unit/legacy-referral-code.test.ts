import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../../src/platform/config/environment.js';
import {
  LEGACY_REFERRAL_CODE_PATTERN,
  resolveLegacyReferralCode,
  resolveReferralCode,
} from '../../src/modules/team-leads/team-lead-policy.js';
import type { SqlClient } from '../../src/platform/database/index.js';

// Admin spec v1.1 §3.6 [DECISION 5]: legacy LS_/CTV_ codes map to the converted team lead until
// LEGACY_REFERRAL_CODE_UNTIL, then stop.
const LEAD_ID = '00000000-0000-4000-8000-0000000000aa';
const POLICY = {
  id: '00000000-0000-4000-8000-0000000000bb',
  lead_user_id: LEAD_ID,
  commission_pct: 40,
  offer_type: 'none',
  offer_days: null,
  offer_version_id: '00000000-0000-4000-8000-0000000000cc',
};
const UNTIL = new Date('2027-01-14T00:00:00+07:00');

function fakeClient(options: { usernameLead?: boolean; legacyLead?: boolean } = {}) {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const client: SqlClient = {
    async query<T extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) {
      calls.push({ sql, values });
      if (sql.includes('from team_lead_policies')) return [POLICY] as unknown as T[];
      if (sql.includes('lower(u.username)'))
        return (options.usernameLead ? [{ user_id: LEAD_ID }] : []) as unknown as T[];
      if (sql.includes('u.referral_code'))
        return (options.legacyLead ? [{ user_id: LEAD_ID }] : []) as unknown as T[];
      throw new Error(`unexpected query ${sql}`);
    },
  };
  return { client, calls };
}

describe('legacy referral codes (DECISION 5)', () => {
  it('recognises the v1.0 code shape in any case only', () => {
    expect(LEGACY_REFERRAL_CODE_PATTERN.test('CTV_0123456789')).toBe(true);
    expect(LEGACY_REFERRAL_CODE_PATTERN.test('ls_abcdef0123')).toBe(true);
    expect(LEGACY_REFERRAL_CODE_PATTERN.test('CTV_012345678')).toBe(false);
    expect(LEGACY_REFERRAL_CODE_PATTERN.test('XY_0123456789')).toBe(false);
    expect(LEGACY_REFERRAL_CODE_PATTERN.test('lead.one')).toBe(false);
  });

  it('maps a legacy code to its converted lead before the deadline, upper-cased', async () => {
    const { client, calls } = fakeClient({ legacyLead: true });
    const resolved = await resolveLegacyReferralCode(client, ' ctv_abcdef0123 ', {
      lock: true,
      legacyUntil: UNTIL,
      now: new Date('2027-01-13T16:59:59Z'),
    });
    expect(resolved).toEqual({ leadUserId: LEAD_ID, policy: POLICY, legacy: true });
    const lookup = calls.find(({ sql }) => sql.includes('u.referral_code'));
    expect(lookup?.values).toEqual(['CTV_ABCDEF0123']);
    expect(lookup?.sql).toContain("p.status = 'active'");
    expect(lookup?.sql).toContain("u.role = 'team_lead'");
    expect(lookup?.sql).toContain('for share of p');
  });

  it('stops at the deadline, without a configured window, and for non-legacy shapes', async () => {
    for (const options of [
      { lock: false, legacyUntil: UNTIL, now: new Date('2027-01-13T17:00:00Z') },
      { lock: false, legacyUntil: null },
      { lock: false },
      { lock: false, legacyUntil: new Date('invalid') },
    ]) {
      const { client, calls } = fakeClient({ legacyLead: true });
      expect(await resolveLegacyReferralCode(client, 'CTV_ABCDEF0123', options)).toBeNull();
      expect(calls).toEqual([]);
    }
    const { client, calls } = fakeClient({ legacyLead: true });
    expect(
      await resolveLegacyReferralCode(client, 'lead.one', { lock: false, legacyUntil: UNTIL }),
    ).toBeNull();
    expect(calls).toEqual([]);
  });

  it('is not used for a username that resolves, and is invalid when no lead matches', async () => {
    const username = fakeClient({ usernameLead: true, legacyLead: true });
    expect(
      await resolveReferralCode(username.client, 'Lead.One', { lock: false, legacyUntil: UNTIL }),
    ).toMatchObject({ legacy: false });
    expect(username.calls.some(({ sql }) => sql.includes('u.referral_code'))).toBe(false);

    const none = fakeClient();
    expect(
      await resolveReferralCode(none.client, 'CTV_ABCDEF0123', {
        lock: false,
        legacyUntil: UNTIL,
        now: new Date('2026-10-16T00:00:00Z'),
      }),
    ).toBeNull();
  });

  it('defaults LEGACY_REFERRAL_CODE_UNTIL to 2027-01-14 +07 and validates overrides', () => {
    expect(parseEnvironment({}).LEGACY_REFERRAL_CODE_UNTIL).toBe('2027-01-14T00:00:00+07:00');
    expect(parseEnvironment({ LEGACY_REFERRAL_CODE_UNTIL: '' }).LEGACY_REFERRAL_CODE_UNTIL).toBe(
      '2027-01-14T00:00:00+07:00',
    );
    expect(
      parseEnvironment({ LEGACY_REFERRAL_CODE_UNTIL: '2026-12-01T00:00:00Z' })
        .LEGACY_REFERRAL_CODE_UNTIL,
    ).toBe('2026-12-01T00:00:00Z');
    expect(() => parseEnvironment({ LEGACY_REFERRAL_CODE_UNTIL: 'next year' })).toThrow(
      'Invalid configuration',
    );
  });
});

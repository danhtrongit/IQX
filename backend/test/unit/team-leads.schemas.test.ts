import { describe, expect, it } from 'vitest';

import {
  teamLeadAppointSchema,
  teamLeadMemberAddSchema,
  teamLeadPolicySchema,
  teamLeadRevokeSchema,
} from '../../src/modules/team-leads/team-leads.schemas.js';

const USER_ID = '031c714e-4145-4895-869b-d54c1c5bc86b';

describe('team-lead request schemas (admin spec v1.1 §3.1, §3.2, §3.4)', () => {
  it('accepts the three offer shapes', () => {
    for (const offer of [
      { offer_type: 'none' },
      { offer_type: 'days', offer_days: 30 },
      { offer_type: 'lifetime', offer_days: null },
    ]) {
      expect(
        teamLeadPolicySchema.safeParse({ commission_pct: 40, reason: 'ok', ...offer }).success,
      ).toBe(true);
    }
  });

  it('rejects offer_days outside a days offer, missing days and unsupported durations', () => {
    for (const offer of [
      { offer_type: 'days' },
      { offer_type: 'days', offer_days: 15 },
      { offer_type: 'none', offer_days: 7 },
      { offer_type: 'lifetime', offer_days: 365 },
    ]) {
      expect(
        teamLeadPolicySchema.safeParse({ commission_pct: 0, reason: 'ok', ...offer }).success,
      ).toBe(false);
    }
  });

  it('requires an integer commission in 0..100', () => {
    for (const commission_pct of [-1, 101, 12.5, '10']) {
      expect(
        teamLeadPolicySchema.safeParse({ commission_pct, offer_type: 'none', reason: 'ok' })
          .success,
      ).toBe(false);
    }
  });

  it('requires a non-blank reason on every mutation', () => {
    expect(
      teamLeadAppointSchema.safeParse({
        user_id: USER_ID,
        commission_pct: 10,
        offer_type: 'none',
        reason: '   ',
      }).success,
    ).toBe(false);
    expect(teamLeadRevokeSchema.safeParse({}).success).toBe(false);
    expect(teamLeadMemberAddSchema.safeParse({ user_id: USER_ID }).success).toBe(false);
    expect(teamLeadMemberAddSchema.safeParse({ user_id: USER_ID, reason: ' x ' })).toMatchObject({
      success: true,
      data: { reason: 'x' },
    });
  });

  it('rejects unknown fields such as a client-chosen lead', () => {
    expect(
      teamLeadMemberAddSchema.safeParse({ user_id: USER_ID, reason: 'x', lead_id: USER_ID })
        .success,
    ).toBe(false);
  });
});

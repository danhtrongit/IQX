import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 §3.3 / §4.1 / §7.1: registration by a team lead's code, the referral-offer
// grant that replaces the trial, the public code check, the lifetime checkout block
// (DECISION 4) and the MRR definition that ignores free offers. Appointment lands in a later
// stage, so a lead is created in SQL exactly as the appointment will leave it.
const PASSWORD = 'System!Passw0rd';
const LIFETIME_END = '9999-12-31T16:59:59.000Z';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type ErrorBody = { error: { code: string } };
type Overview = {
  active_subscribers: number;
  active_paid_count: number;
  active_trial_count: number;
  active_referral_offer_count: number;
  mrr_vnd: number;
  plan_distribution: Array<{ plan_code: string; active_subscriptions: number }>;
};

describe('system acceptance: team-lead referral registration and offers', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let adminToken: string;
  let adminId: string;
  let monthlyPlanId: string;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    const admin = await registerAndLogin(app, 'offer-admin');
    adminId = admin.id;
    await stack.query("update users set role = 'admin' where id = $1", [admin.id]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: admin.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    adminToken = (login.json() as { access_token: string }).access_token;
    const [monthly] = await stack.query<{ id: string }>(
      "select id from premium_plans where code = 'MONTHLY'",
    );
    monthlyPlanId = monthly?.id ?? '';
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  async function makeTeamLead(
    suffix: string,
    offer: { type: 'none' | 'days' | 'lifetime'; days?: number },
  ): Promise<Session> {
    const lead = await registerAndLogin(app, suffix);
    await stack.query(
      "update users set role = 'team_lead', username_change_allowed = false where id = $1",
      [lead.id],
    );
    await stack.query(
      `insert into team_lead_profiles (user_id, status, appointed_by) values ($1, 'active', $2)`,
      [lead.id, adminId],
    );
    await stack.query(
      `insert into team_lead_policies
         (lead_user_id, commission_pct, offer_type, offer_days, reason, created_by)
       values ($1, 20, $2, $3, 'system test', $4)`,
      [lead.id, offer.type, offer.days ?? null, adminId],
    );
    return lead;
  }

  const register = (suffix: string, referralCode?: string) => {
    const identity = testIdentity(suffix);
    return app
      .inject({
        method: 'POST',
        url: '/api/v2/auth/register',
        payload: {
          ...identity,
          password: PASSWORD,
          full_name: `Offer ${suffix}`,
          ...(referralCode === undefined ? {} : { referral_code: referralCode }),
        },
      })
      .then((response) => ({ response, identity }));
  };

  const login = async (identifier: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { access_token: string }).access_token;
  };

  const grantsOf = (userId: string) =>
    stack.query<{
      kind: string;
      plan_code: string;
      starts_at: Date;
      ends_at: Date;
      duration_days: number;
      team_lead_policy_id: string | null;
    }>(
      `select g.kind, p.code as plan_code, g.starts_at, g.ends_at, g.duration_days,
              g.team_lead_policy_id
         from billing_entitlement_grants g join premium_plans p on p.id = g.plan_id
        where g.user_id = $1 order by g.created_at`,
      [userId],
    );

  const checkCode = (code: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v2/auth/referral-codes/${encodeURIComponent(code)}`,
    });

  it('checks codes publicly without revealing the team lead (§4.1)', async () => {
    const lead = await makeTeamLead('offer-check-lead', { type: 'days', days: 30 });
    const valid = await checkCode(lead.username.toUpperCase());
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toStrictEqual({ valid: true, offer_type: 'days', offer_days: 30 });
    expect(valid.body).not.toContain(lead.id);
    expect(valid.body).not.toContain(lead.email);

    for (const code of ['no.such.lead', 'bad code!', 'ctv_0123456789']) {
      const unknown = await checkCode(code);
      expect(unknown.statusCode).toBe(200);
      expect(unknown.json()).toStrictEqual({ valid: false, offer_type: null, offer_days: null });
    }
    // A plain user's username is not a referral code.
    const plain = await registerAndLogin(app, 'offer-check-plain');
    expect((await checkCode(plain.username)).json()).toMatchObject({ valid: false });

    await stack.query(
      `update team_lead_profiles set status = 'revoked', revoked_at = now() where user_id = $1`,
      [lead.id],
    );
    expect((await checkCode(lead.username)).json()).toStrictEqual({
      valid: false,
      offer_type: null,
      offer_days: null,
    });
  });

  it('rejects a bad or revoked code with 422 and creates no account (§7.1)', async () => {
    const unknown = await register('offer-bad-code', 'no.such.lead');
    expect(unknown.response.statusCode).toBe(422);
    expect((unknown.response.json() as ErrorBody).error.code).toBe('REFERRAL_CODE_INVALID');
    const revokedLead = await makeTeamLead('offer-revoked-lead', { type: 'none' });
    await stack.query(
      `update team_lead_profiles set status = 'revoked', revoked_at = now() where user_id = $1`,
      [revokedLead.id],
    );
    const revoked = await register('offer-revoked', revokedLead.username);
    expect(revoked.response.statusCode).toBe(422);
    expect((revoked.response.json() as ErrorBody).error.code).toBe('REFERRAL_CODE_INVALID');
    const created = await stack.query(
      'select id from users where lower(email) in (lower($1), lower($2))',
      [unknown.identity.email, revoked.identity.email],
    );
    expect(created).toHaveLength(0);
  });

  it('joins the group and grants a days offer instead of the trial (§3.3, §7.1)', async () => {
    const lead = await makeTeamLead('offer-days-lead', { type: 'days', days: 30 });
    const { response, identity } = await register(
      'offer-days-member',
      ` ${lead.username.toUpperCase()} `,
    );
    expect(response.statusCode, response.body).toBe(201);
    const member = response.json() as { id: string; role: string };
    expect(member.role).toBe('premium');

    const [group] = await stack.query<{
      group_lead_id: string;
      group_join_via: string;
      group_joined_at: Date | null;
    }>('select group_lead_id, group_join_via, group_joined_at from users where id = $1', [
      member.id,
    ]);
    expect(group).toMatchObject({ group_lead_id: lead.id, group_join_via: 'code' });
    expect(group?.group_joined_at).not.toBeNull();
    const history = await stack.query(
      `select action, lead_user_id, actor_user_id, actor_role from group_membership_history
        where user_id = $1`,
      [member.id],
    );
    expect(history).toEqual([
      { action: 'join_code', lead_user_id: lead.id, actor_user_id: member.id, actor_role: 'user' },
    ]);

    const grants = await grantsOf(member.id);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      kind: 'referral_offer',
      plan_code: 'REFERRAL_OFFER',
      duration_days: 30,
      team_lead_policy_id: expect.any(String),
    });
    const span = grants[0]!.ends_at.getTime() - grants[0]!.starts_at.getTime();
    expect(span).toBe(30 * 86_400_000);

    const audit = await stack.query<{
      admin_user_id: string | null;
      actor_role: string;
      target_id: string;
      payload_after: Record<string, unknown>;
    }>(
      `select admin_user_id, actor_role, target_id, payload_after from admin_audit_log
        where action = 'system.referral_offer_grant' and target_id = $1`,
      [member.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      admin_user_id: null,
      actor_role: 'system',
      payload_after: expect.objectContaining({
        lead_user_id: lead.id,
        offer_type: 'days',
        offer_days: 30,
        source: 'register',
      }),
    });

    const token = await login(identity.username);
    const entitlement = await app.inject({
      method: 'GET',
      url: '/api/v2/premium/me',
      headers: authHeader(token),
    });
    expect(entitlement.statusCode, entitlement.body).toBe(200);
    expect(entitlement.json()).toMatchObject({ is_premium: true, is_trial: false });
  });

  it('keeps the trial when the policy has no offer', async () => {
    const lead = await makeTeamLead('offer-none-lead', { type: 'none' });
    const { response } = await register('offer-none-member', lead.username);
    expect(response.statusCode, response.body).toBe(201);
    const grants = await grantsOf((response.json() as { id: string }).id);
    expect(grants.map((grant) => grant.kind)).toEqual(['trial']);
  });

  it('grants lifetime until 9999 and refuses premium checkout (DECISION 4)', async () => {
    const lead = await makeTeamLead('offer-life-lead', { type: 'lifetime' });
    const { response, identity } = await register('offer-life-member', lead.username);
    expect(response.statusCode, response.body).toBe(201);
    const memberId = (response.json() as { id: string }).id;
    const grants = await grantsOf(memberId);
    expect(grants).toHaveLength(1);
    expect(grants[0]?.kind).toBe('referral_offer');
    expect(grants[0]?.ends_at.toISOString()).toBe(LIFETIME_END);
    expect(grants[0]?.duration_days).toBeGreaterThan(2_000_000);

    const token = await login(identity.email);
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/checkout',
      headers: authHeader(token),
      payload: { plan_id: monthlyPlanId },
    });
    expect(checkout.statusCode).toBe(409);
    expect((checkout.json() as ErrorBody).error.code).toBe('LIFETIME_PREMIUM_ACTIVE');
    expect(
      await stack.query('select id from premium_payment_orders where user_id = $1', [memberId]),
    ).toHaveLength(0);
  });

  it('keeps referral offers out of MRR and plan distribution (§3.3-3)', async () => {
    const overview = async (): Promise<Overview> => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v2/admin/metrics/overview',
        headers: authHeader(adminToken),
      });
      expect(response.statusCode).toBe(200);
      return response.json() as Overview;
    };
    const monthly = (value: Overview) =>
      value.plan_distribution.find((row) => row.plan_code === 'MONTHLY')?.active_subscriptions ?? 0;
    const lead = await makeTeamLead('offer-mrr-lead', { type: 'days', days: 30 });
    const before = await overview();
    expect(before).toHaveProperty('active_referral_offer_count');
    expect(before.plan_distribution.some((row) => row.plan_code === 'REFERRAL_OFFER')).toBe(false);

    // A member whose only grant is an active offer: counted as an offer, never in MRR.
    expect((await register('offer-mrr-member', lead.username)).response.statusCode).toBe(201);
    const afterOffer = await overview();
    expect(afterOffer.active_referral_offer_count).toBe(before.active_referral_offer_count + 1);
    expect(afterOffer.active_subscribers).toBe(before.active_subscribers + 1);
    expect(afterOffer.mrr_vnd).toBe(before.mrr_vnd);
    expect(afterOffer.active_paid_count).toBe(before.active_paid_count);
    expect(afterOffer.active_trial_count).toBe(before.active_trial_count);

    // A paying user with a lifetime offer stacked after the paid grant: the subscription row
    // now points at the offer plan, yet the paid grant that covers today still counts.
    const payer = await registerAndLogin(app, 'offer-mrr-payer');
    await stack.query(
      `update billing_entitlement_grants set status = 'revoked', revoked_at = now()
        where user_id = $1 and kind = 'trial'`,
      [payer.id],
    );
    const granted = await app.inject({
      method: 'POST',
      url: `/api/v2/premium/admin/users/${payer.id}/grant`,
      headers: authHeader(adminToken),
      payload: { plan_id: monthlyPlanId, note: 'paid month' },
    });
    expect(granted.statusCode, granted.body).toBe(201);
    const [policy] = await stack.query<{ id: string; offer_version_id: string }>(
      `select id, offer_version_id from team_lead_policies where lead_user_id = $1`,
      [lead.id],
    );
    const [offerPlan] = await stack.query<{ id: string }>(
      "select id from premium_plans where code = 'REFERRAL_OFFER'",
    );
    await stack.query(
      `insert into billing_entitlement_grants
         (user_id, plan_id, kind, duration_days, starts_at, ends_at, original_ends_at,
          team_lead_policy_id, team_lead_offer_version_id)
       select $1, $2, 'referral_offer', 3000000, max(ends_at), $5::timestamptz, $5::timestamptz, $3, $4
         from billing_entitlement_grants where user_id = $1 and status = 'active'`,
      [payer.id, offerPlan?.id, policy?.id, policy?.offer_version_id, LIFETIME_END],
    );
    await stack.query(
      `update premium_subscriptions set current_plan_id = $2, current_period_end = $3::timestamptz
        where user_id = $1`,
      [payer.id, offerPlan?.id, LIFETIME_END],
    );
    const afterPayer = await overview();
    expect(afterPayer.active_paid_count).toBe(afterOffer.active_paid_count + 1);
    expect(afterPayer.mrr_vnd).toBe(afterOffer.mrr_vnd + 99_000);
    expect(monthly(afterPayer)).toBe(monthly(afterOffer) + 1);
    expect(afterPayer.active_referral_offer_count).toBe(afterOffer.active_referral_offer_count);

    const distribution = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/metrics/plan-distribution',
      headers: authHeader(adminToken),
    });
    const rows = distribution.json() as Overview['plan_distribution'];
    expect(rows.find((row) => row.plan_code === 'MONTHLY')?.active_subscriptions).toBe(
      monthly(afterPayer),
    );
    expect(rows.some((row) => row.plan_code === 'REFERRAL_OFFER')).toBe(false);
  });
});

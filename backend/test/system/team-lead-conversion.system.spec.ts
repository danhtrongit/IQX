import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Client } from 'pg';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 §3.6 [DECISION 5]: migration 0025 converts active Lead sale / CTV partners
// into team leads (CTV 40%, Lead sale 10%, offer none), moves the users they referred into
// their group, and legacy LS_/CTV_ codes keep registering into that group until
// LEGACY_REFERRAL_CODE_UNTIL. The stack migrates an empty users table, so the test seeds v1.0
// partner data and runs the migration body again on it (it is safe to re-run).
const PASSWORD = 'System!Passw0rd';
const MIGRATION = new URL('../../migrations/0025_team_lead_conversion.sql', import.meta.url);

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type OrderRef = { id: string; invoice: string };

const legacyCode = (prefix: 'LS' | 'CTV') =>
  `${prefix}_${randomBytes(5).toString('hex').toUpperCase()}`;

describe('system acceptance: Lead sale / CTV conversion (§3.6, DECISION 5)', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let planId: string;
  let adminToken: string;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    const plans = await app.inject({ method: 'GET', url: '/api/v2/premium/plans' });
    planId = (
      (plans.json() as Array<{ id: string; code: string }>).find(
        (plan) => plan.code === 'MONTHLY',
      ) as { id: string }
    ).id;
    const admin = await registerAndLogin(app, 'conv-admin');
    await stack.query("update users set role = 'admin', is_email_verified = true where id = $1", [
      admin.id,
    ]);
    adminToken = (await login(admin.email)).access_token;
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  async function login(identifier: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier, password: PASSWORD },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { access_token: string; refresh_token: string };
  }

  /** Runs the 0025 body on the current data, collecting its RAISE NOTICE messages. */
  async function runConversion(): Promise<string[]> {
    const sql = await readFile(MIGRATION, 'utf8');
    const notices: string[] = [];
    const client = new Client({ connectionString: stack.databaseUrl });
    client.on('notice', (notice) => notices.push(notice.message ?? ''));
    await client.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      await client.end();
    }
    return notices;
  }

  async function partner(
    suffix: string,
    kind: 'lead_sale' | 'ctv',
    code: string,
    extra: string = '',
  ): Promise<Session> {
    const user = await registerAndLogin(app, suffix);
    await stack.query(
      `update users set referral_partner_kind = $2, referral_code = $3${extra} where id = $1`,
      [user.id, kind, code],
    );
    return user;
  }

  async function referred(suffix: string, by: Session, attributedAt: string | null = null) {
    const user = await registerAndLogin(app, suffix);
    await stack.query(
      `update users set referred_by_user_id = $2,
              referral_attributed_at = coalesce($3::timestamptz, now())
        where id = $1`,
      [user.id, by.id, attributedAt],
    );
    return user;
  }

  async function prepareOrder(user: Session, amount: number): Promise<OrderRef> {
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/checkout',
      headers: authHeader(user.accessToken),
      payload: { plan_id: planId },
    });
    expect(checkout.statusCode, checkout.body).toBe(201);
    const created = checkout.json() as { order_id: string; invoice_number: string };
    await stack.query('update premium_payment_orders set amount_vnd = $2 where id = $1', [
      created.order_id,
      amount,
    ]);
    return { id: created.order_id, invoice: created.invoice_number };
  }

  async function pay(order: OrderRef, amount: number): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/sepay/ipn',
      headers: { 'x-secret-key': 'system-test-sepay-secret' },
      payload: {
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: order.invoice,
          order_amount: String(amount),
          order_currency: 'VND',
          order_status: 'CAPTURED',
        },
        transaction: {
          transaction_id: `conv-${order.id}`,
          transaction_amount: String(amount),
          transaction_currency: 'VND',
          transaction_status: 'APPROVED',
        },
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ message: 'processed' });
  }

  async function ledger(orderId: string) {
    return stack.query<{ commission_type: string; beneficiary_user_id: string; total: string }>(
      `select commission_type, beneficiary_user_id, sum(amount_vnd)::text as total
         from referral_commission_ledger where order_id = $1
        group by commission_type, beneficiary_user_id order by commission_type`,
      [orderId],
    );
  }

  async function groupOf(userId: string) {
    const [row] = await stack.query<{
      role: string;
      group_lead_id: string | null;
      group_join_via: string | null;
      group_joined_at: Date | null;
    }>('select role, group_lead_id, group_join_via, group_joined_at from users where id = $1', [
      userId,
    ]);
    if (!row) throw new Error(`user ${userId} not found`);
    return row;
  }

  function register(suffix: string, referralCode: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      payload: {
        ...testIdentity(suffix),
        password: PASSWORD,
        full_name: `Conversion ${suffix}`,
        referral_code: referralCode,
      },
    });
  }

  async function checkCode(code: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v2/auth/referral-codes/${encodeURIComponent(code)}`,
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { valid: boolean; offer_type: string | null };
  }

  it('converts active partners, groups their referred users and maps legacy codes', async () => {
    // v1.0 partner data. The Lead sale manages the CTV, who was referred by it.
    const lsCode = legacyCode('LS');
    const ctvCode = legacyCode('CTV');
    const ls = await partner('conv-ls', 'lead_sale', lsCode, ", role = 'premium'");
    const ctv = await partner(
      'conv-ctv',
      'ctv',
      ctvCode,
      `, referred_by_user_id = (select id from users where referral_code = '${lsCode}'),
         referral_lead_user_id = (select id from users where referral_code = '${lsCode}'),
         referral_attributed_at = now() - interval '200 days'`,
    );
    // Partners that must be skipped (and listed).
    const inactiveCode = legacyCode('CTV');
    const inactive = await partner('conv-inactive', 'ctv', inactiveCode, ", status = 'suspended'");
    const deleted = await partner(
      'conv-deleted',
      'ctv',
      legacyCode('CTV'),
      ", status = 'deleted', deleted_at = now()",
    );
    const adminPartner = await partner(
      'conv-admin-ls',
      'lead_sale',
      legacyCode('LS'),
      ", role = 'admin'",
    );
    // Already appointed through admin/team-leads before the conversion ran.
    const appointedCode = legacyCode('CTV');
    const appointed = await partner('conv-appointed', 'ctv', appointedCode);
    const appoint = await app.inject({
      method: 'POST',
      url: '/api/v2/admin/team-leads',
      headers: authHeader(adminToken),
      payload: {
        user_id: appointed.id,
        commission_pct: 25,
        offer_type: 'days',
        offer_days: 30,
        reason: 'Bổ nhiệm trước chuyển đổi',
      },
    });
    expect(appoint.statusCode, appoint.body).toBe(201);

    const ctvCustomer = await referred('conv-c1', ctv, '2026-05-01T00:00:00Z');
    const lsCustomer = await referred('conv-c2', ls);
    const deletedCustomer = await referred('conv-c3', ctv);
    await stack.query("update users set status = 'deleted', deleted_at = now() where id = $1", [
      deletedCustomer.id,
    ]);
    const adminCustomer = await referred('conv-c4', ctv);
    await stack.query("update users set role = 'admin' where id = $1", [adminCustomer.id]);
    const orphan = await referred('conv-c5', inactive);
    const grouped = await referred('conv-c6', ctv);
    const addToAppointed = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/team-leads/${appointed.id}/members`,
      headers: authHeader(adminToken),
      payload: { user_id: grouped.id, reason: 'Đã ở nhóm khác' },
    });
    expect(addToAppointed.statusCode, addToAppointed.body).toBe(201);

    // A v1.0 order paid before the conversion, with the v1.0 allocator's ledger rows.
    const legacyOrder = await prepareOrder(ctvCustomer, 100);
    await pay(legacyOrder, 100);
    await stack.query(
      `insert into referral_commission_ledger
         (order_id, beneficiary_user_id, commission_type, amount_vnd, source_amount_vnd)
       values ($1, $2, 'ctv_direct', 40, 100), ($1, $3, 'lead_management', 10, 100)`,
      [legacyOrder.id, ctv.id, ls.id],
    );
    // Before the conversion the legacy code resolves to nobody.
    expect(await checkCode(ctvCode)).toMatchObject({ valid: false });

    const notices = await runConversion();
    const skipped = notices.filter((notice) => notice.includes('skipped'));
    expect(skipped).toHaveLength(4);
    for (const [user, why] of [
      [inactive, 'status suspended'],
      [deleted, 'deleted'],
      [adminPartner, 'admin'],
      [appointed, 'already has a active team lead profile'],
    ] as const) {
      expect(skipped.find((notice) => notice.includes(user.id))).toContain(why);
    }
    expect(notices.at(-1)).toContain('2 partner(s) converted to team leads, 2 referred user(s)');

    // Converted partners: profile, first policy, role and locked username.
    const leads = await stack.query<{
      user_id: string;
      status: string;
      appointed_by: string | null;
      role: string;
      username_change_allowed: boolean;
      group_lead_id: string | null;
      commission_pct: number;
      offer_type: string;
      offer_days: number | null;
      reason: string;
      created_by: string | null;
    }>(
      `select p.user_id, p.status, p.appointed_by, u.role, u.username_change_allowed,
              u.group_lead_id, pol.commission_pct, pol.offer_type, pol.offer_days, pol.reason,
              pol.created_by
         from team_lead_profiles p
         join users u on u.id = p.user_id
         join team_lead_policies pol on pol.lead_user_id = p.user_id
        where p.user_id = any($1::uuid[])`,
      [[ls.id, ctv.id]],
    );
    const expected = {
      status: 'active',
      appointed_by: null,
      role: 'team_lead',
      username_change_allowed: false,
      group_lead_id: null,
      offer_type: 'none',
      offer_days: null,
      reason: 'v1.1 conversion',
      created_by: null,
    };
    expect(leads.find((row) => row.user_id === ls.id)).toEqual({
      ...expected,
      user_id: ls.id,
      commission_pct: 10,
    });
    expect(leads.find((row) => row.user_id === ctv.id)).toEqual({
      ...expected,
      user_id: ctv.id,
      commission_pct: 40,
    });
    // One system appoint audit row per converted partner, visible in the lead history.
    const audits = await stack.query<{
      target_id: string;
      actor_role: string;
      admin_user_id: string | null;
      after: { commission_pct: number; code: string; offer_type: string };
    }>(
      `select target_id, actor_role, admin_user_id, payload_after as after
         from admin_audit_log
        where action = 'team_lead.appoint' and note = 'v1.1 conversion' order by target_id`,
    );
    expect(audits).toHaveLength(2);
    expect(audits.find((row) => row.target_id === ctv.id)).toMatchObject({
      actor_role: 'system',
      admin_user_id: null,
      after: { commission_pct: 40, code: ctv.username, offer_type: 'none' },
    });

    // Skipped partners are untouched; the earlier appointment keeps its own policy.
    for (const user of [inactive, deleted])
      expect((await groupOf(user.id)).role).not.toBe('team_lead');
    expect((await groupOf(adminPartner.id)).role).toBe('admin');
    const appointedPolicies = await stack.query<{ commission_pct: number }>(
      'select commission_pct from team_lead_policies where lead_user_id = $1',
      [appointed.id],
    );
    expect(appointedPolicies).toEqual([{ commission_pct: 25 }]);
    expect(
      await stack.query('select 1 from team_lead_profiles where user_id = any($1::uuid[])', [
        [inactive.id, deleted.id, adminPartner.id],
      ]),
    ).toEqual([]);

    // Referred users joined the converting partner's group, with join_code history.
    expect(await groupOf(ctvCustomer.id)).toEqual({
      role: 'premium',
      group_lead_id: ctv.id,
      group_join_via: 'code',
      group_joined_at: new Date('2026-05-01T00:00:00Z'),
    });
    expect(await groupOf(lsCustomer.id)).toMatchObject({
      group_lead_id: ls.id,
      group_join_via: 'code',
    });
    const history = await stack.query<{ user_id: string; lead_user_id: string; action: string }>(
      `select user_id, lead_user_id, action from group_membership_history
        where reason = 'v1.1 conversion' and actor_role = 'system' and actor_user_id is null
        order by lead_user_id`,
    );
    expect(history).toHaveLength(2);
    expect(history).toEqual(
      expect.arrayContaining([
        { user_id: ctvCustomer.id, lead_user_id: ctv.id, action: 'join_code' },
        { user_id: lsCustomer.id, lead_user_id: ls.id, action: 'join_code' },
      ]),
    );
    // Deleted users, admins, other groups' members and the skipped partner's users stay out.
    expect((await groupOf(deletedCustomer.id)).group_lead_id).toBeNull();
    expect((await groupOf(adminCustomer.id)).group_lead_id).toBeNull();
    expect((await groupOf(orphan.id)).group_lead_id).toBeNull();
    expect((await groupOf(grouped.id)).group_lead_id).toBe(appointed.id);

    // Re-running the conversion changes nothing.
    const counts = () =>
      stack.query<{ profiles: number; policies: number; history: number; audits: number }>(
        `select (select count(*)::int from team_lead_profiles) as profiles,
                (select count(*)::int from team_lead_policies) as policies,
                (select count(*)::int from group_membership_history) as history,
                (select count(*)::int from admin_audit_log) as audits`,
      );
    const before = await counts();
    const rerun = await runConversion();
    expect(rerun.at(-1)).toContain('0 partner(s) converted to team leads, 0 referred user(s)');
    expect(await counts()).toEqual(before);

    // The converted lead works as a team lead: team area and its code card.
    const ctvTokens = await login(ctv.username);
    const me = await app.inject({
      method: 'GET',
      url: '/api/v2/team/me',
      headers: authHeader(ctvTokens.access_token),
    });
    expect(me.statusCode, me.body).toBe(200);
    expect(me.json()).toMatchObject({
      code: ctv.username,
      status: 'active',
      commission_pct: 40,
      offer_type: 'none',
      member_count: 1,
    });
    const card = await app.inject({
      method: 'GET',
      url: '/api/v2/referrals/me',
      headers: authHeader(ctvTokens.access_token),
    });
    expect(card.json()).toEqual({
      is_team_lead: true,
      referral_code: ctv.username,
      referral_url: `/?ref=${ctv.username}`,
      commission_pct: 40,
      offer_type: 'none',
      offer_days: null,
    });

    // DECISION 5: the legacy code (any case) registers into the converted lead's group.
    expect(await checkCode(ctvCode.toLowerCase())).toEqual({
      valid: true,
      offer_type: 'none',
      offer_days: null,
    });
    const viaLegacy = await register('conv-legacy', ` ${ctvCode.toLowerCase()} `);
    expect(viaLegacy.statusCode, viaLegacy.body).toBe(201);
    const legacyMember = (viaLegacy.json() as { id: string }).id;
    expect(await groupOf(legacyMember)).toMatchObject({
      group_lead_id: ctv.id,
      group_join_via: 'code',
    });
    expect(
      await stack.query(
        'select action, actor_role from group_membership_history where user_id = $1',
        [legacyMember],
      ),
    ).toEqual([{ action: 'join_code', actor_role: 'user' }]);
    // A partner that was not converted, or an unknown code, is invalid.
    expect(await checkCode(inactiveCode)).toMatchObject({ valid: false });
    const skippedCode = await register('conv-skipped', inactiveCode);
    expect(skippedCode.statusCode).toBe(422);
    expect((skippedCode.json() as { error: { code: string } }).error.code).toBe(
      'REFERRAL_CODE_INVALID',
    );
    // The earlier appointee's legacy code maps to it too (it is an active team lead).
    expect(await checkCode(appointedCode)).toEqual({
      valid: true,
      offer_type: 'days',
      offer_days: 30,
    });
    // Revoking the converted lead stops its legacy code as well.
    const revoke = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/team-leads/${ls.id}/revoke`,
      headers: authHeader(adminToken),
      payload: { reason: 'Thôi hợp tác' },
    });
    expect(revoke.statusCode, revoke.body).toBe(200);
    expect(await checkCode(lsCode)).toMatchObject({ valid: false });
    expect((await register('conv-revoked', lsCode)).statusCode).toBe(422);
    // A plain user has no code card.
    const plain = await app.inject({
      method: 'GET',
      url: '/api/v2/referrals/me',
      headers: authHeader(ctvCustomer.accessToken),
    });
    expect(plain.json()).toEqual({
      is_team_lead: false,
      referral_code: null,
      referral_url: null,
      commission_pct: null,
      offer_type: null,
      offer_days: null,
    });

    // The pre-conversion order refunds by its legacy types; nothing team_lead_direct appears.
    const refund = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/payments/${legacyOrder.id}/refund`,
      headers: authHeader(adminToken),
      payload: { amount_vnd: 100, reason: 'Hoàn đơn cũ' },
    });
    expect(refund.statusCode, refund.body).toBe(200);
    expect(await ledger(legacyOrder.id)).toEqual([
      { commission_type: 'ctv_direct', beneficiary_user_id: ctv.id, total: '40' },
      { commission_type: 'ctv_direct_reversal', beneficiary_user_id: ctv.id, total: '-40' },
      { commission_type: 'lead_management', beneficiary_user_id: ls.id, total: '10' },
      { commission_type: 'lead_management_reversal', beneficiary_user_id: ls.id, total: '-10' },
    ]);
    // A new order from the converted group earns the single team-lead commission.
    const newOrder = await prepareOrder(ctvCustomer, 1_000);
    await pay(newOrder, 1_000);
    expect(
      await stack.query(
        'select team_lead_id, commission_pct from premium_payment_orders where id = $1',
        [newOrder.id],
      ),
    ).toEqual([{ team_lead_id: ctv.id, commission_pct: 40 }]);
    expect(await ledger(newOrder.id)).toEqual([
      { commission_type: 'team_lead_direct', beneficiary_user_id: ctv.id, total: '400' },
    ]);
  }, 120_000);
});

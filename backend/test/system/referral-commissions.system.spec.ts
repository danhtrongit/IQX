import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 §3.3-4 / §7.4: one team_lead_direct row per paid order, from the
// team_lead_id + commission_pct snapshot taken when the order becomes paid. Appointment lands
// in a later stage, so a lead is created in SQL exactly as the appointment will leave it.
const PASSWORD = 'System!Passw0rd';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type OrderRef = { id: string; invoice: string };

describe('system acceptance: team-lead commission accounting', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let planId: string;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    const plans = await app.inject({ method: 'GET', url: '/api/v2/premium/plans' });
    planId = (
      (plans.json() as Array<{ id: string; code: string }>).find(
        (plan) => plan.code === 'MONTHLY',
      ) as { id: string }
    ).id;
    const admin = await registerAndLogin(app, 'commission-admin');
    adminId = admin.id;
    await stack.query("update users set role = 'admin', is_email_verified = true where id = $1", [
      admin.id,
    ]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: admin.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    adminToken = (login.json() as { access_token: string }).access_token;
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  async function makeTeamLead(suffix: string, commissionPct: number): Promise<Session> {
    const lead = await registerAndLogin(app, suffix);
    await stack.query(
      "update users set role = 'team_lead', username_change_allowed = false where id = $1",
      [lead.id],
    );
    await stack.query(
      `insert into team_lead_profiles (user_id, status, appointed_by) values ($1, 'active', $2)`,
      [lead.id, adminId],
    );
    await setPolicy(lead, commissionPct);
    return lead;
  }

  async function setPolicy(lead: Session, commissionPct: number): Promise<void> {
    await stack.query(
      `insert into team_lead_policies (lead_user_id, commission_pct, offer_type, reason, created_by)
       values ($1, $2, 'none', 'system test', $3)`,
      [lead.id, commissionPct, adminId],
    );
  }

  /** Registers with the lead's username as referral code, then logs in. */
  async function joinByCode(lead: Session, suffix: string): Promise<Session> {
    const identity = testIdentity(suffix);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      payload: {
        ...identity,
        password: PASSWORD,
        full_name: `Member ${suffix}`,
        referral_code: lead.username.toUpperCase(),
      },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: identity.username, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const tokens = login.json() as { access_token: string; refresh_token: string };
    return {
      id: (registered.json() as { id: string }).id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      email: identity.email,
      username: identity.username,
    };
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

  function ipn(order: OrderRef, amount: number, txId: string) {
    return app.inject({
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
          transaction_id: txId,
          transaction_amount: String(amount),
          transaction_currency: 'VND',
          transaction_status: 'APPROVED',
        },
      },
    });
  }

  async function pay(order: OrderRef, amount: number, txId: string): Promise<void> {
    const response = await ipn(order, amount, txId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ message: 'processed' });
  }

  async function snapshot(orderId: string) {
    const [row] = await stack.query<{ team_lead_id: string | null; commission_pct: number | null }>(
      'select team_lead_id, commission_pct from premium_payment_orders where id = $1',
      [orderId],
    );
    return row;
  }

  async function ledger(orderId: string) {
    return stack.query<{
      commission_type: string;
      beneficiary_user_id: string;
      total: string;
      entries: number;
    }>(
      `select commission_type, beneficiary_user_id, sum(amount_vnd)::text as total,
              count(*)::int as entries
         from referral_commission_ledger where order_id = $1
        group by commission_type, beneficiary_user_id order by commission_type`,
      [orderId],
    );
  }

  it('snapshots the pct at payment and keeps it when the policy changes later (§7.4)', async () => {
    const lead = await makeTeamLead('commission-lead-a', 40);
    const member = await joinByCode(lead, 'commission-member-a');

    const first = await prepareOrder(member, 99_000);
    expect(await snapshot(first.id)).toEqual({ team_lead_id: null, commission_pct: null });
    const txId = `commission-a1-${Date.now()}`;
    await pay(first, 99_000, txId);
    expect(await snapshot(first.id)).toEqual({ team_lead_id: lead.id, commission_pct: 40 });
    // Replaying the same IPN is idempotent.
    const replay = await ipn(first, 99_000, txId);
    expect(replay.json()).toMatchObject({ message: 'already_processed' });
    expect(await ledger(first.id)).toEqual([
      {
        commission_type: 'team_lead_direct',
        beneficiary_user_id: lead.id,
        total: '39600',
        entries: 1,
      },
    ]);

    // A commission-only policy edit applies from the next paid order only.
    await setPolicy(lead, 25);
    const second = await prepareOrder(member, 99_999);
    await pay(second, 99_999, `commission-a2-${Date.now()}`);
    expect(await snapshot(first.id)).toEqual({ team_lead_id: lead.id, commission_pct: 40 });
    expect(await snapshot(second.id)).toEqual({ team_lead_id: lead.id, commission_pct: 25 });
    expect(await ledger(second.id)).toEqual([
      {
        commission_type: 'team_lead_direct',
        beneficiary_user_id: lead.id,
        total: '24999',
        entries: 1,
      },
    ]);
    expect(
      await stack.query(
        `select 1 from referral_commission_ledger
          where commission_type in ('ctv_direct', 'lead_management')
            and order_id in ($1, $2)`,
        [first.id, second.id],
      ),
    ).toHaveLength(0);
  }, 60_000);

  it('snapshots mark-paid orders, never free admin grants, and not orders outside a group', async () => {
    const lead = await makeTeamLead('commission-lead-b', 10);
    const member = await joinByCode(lead, 'commission-member-b');
    const order = await prepareOrder(member, 100_000);
    const marked = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/payments/${order.id}/mark-paid`,
      headers: authHeader(adminToken),
      payload: { note: 'commission mark paid' },
    });
    expect(marked.statusCode, marked.body).toBe(200);
    expect(await snapshot(order.id)).toEqual({ team_lead_id: lead.id, commission_pct: 10 });
    expect(await ledger(order.id)).toEqual([
      {
        commission_type: 'team_lead_direct',
        beneficiary_user_id: lead.id,
        total: '10000',
        entries: 1,
      },
    ]);

    const granted = await app.inject({
      method: 'POST',
      url: `/api/v2/premium/admin/users/${member.id}/grant`,
      headers: authHeader(adminToken),
      payload: { plan_id: planId, note: 'free month' },
    });
    expect(granted.statusCode, granted.body).toBe(201);
    const grantOrder = (granted.json() as { id: string }).id;
    expect(await snapshot(grantOrder)).toEqual({ team_lead_id: null, commission_pct: null });
    expect(await ledger(grantOrder)).toEqual([]);

    const outsider = await registerAndLogin(app, 'commission-outsider');
    const outsiderOrder = await prepareOrder(outsider, 100_000);
    await pay(outsiderOrder, 100_000, `commission-outsider-${Date.now()}`);
    expect(await snapshot(outsiderOrder.id)).toEqual({ team_lead_id: null, commission_pct: null });
    expect(await ledger(outsiderOrder.id)).toEqual([]);
  }, 60_000);

  it('earns nothing once the lead is revoked, while the member stays in the group (DECISION 2)', async () => {
    const lead = await makeTeamLead('commission-lead-c', 30);
    const member = await joinByCode(lead, 'commission-member-c');
    await stack.query(
      `update team_lead_profiles set status = 'revoked', revoked_at = now(), revoked_by = $2
        where user_id = $1`,
      [lead.id, adminId],
    );
    const order = await prepareOrder(member, 100_000);
    await pay(order, 100_000, `commission-revoked-${Date.now()}`);
    expect(await snapshot(order.id)).toEqual({ team_lead_id: null, commission_pct: null });
    expect(await ledger(order.id)).toEqual([]);
    const [membership] = await stack.query<{ group_lead_id: string }>(
      'select group_lead_id from users where id = $1',
      [member.id],
    );
    expect(membership?.group_lead_id).toBe(lead.id);
  }, 60_000);

  it('omits zero rows and reverses cumulative odd refunds of the new type exactly', async () => {
    const lead = await makeTeamLead('commission-lead-d', 40);
    for (const amount of [1, 2]) {
      const member = await joinByCode(lead, `commission-tiny-${amount}`);
      const order = await prepareOrder(member, amount);
      await pay(order, amount, `commission-tiny-${amount}-${Date.now()}`);
      expect(await ledger(order.id)).toEqual([]);
    }

    const member = await joinByCode(lead, 'commission-refund');
    const order = await prepareOrder(member, 99);
    await pay(order, 99, `commission-refund-${Date.now()}`);
    for (const amount of [49, 50]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v2/admin/payments/${order.id}/refund`,
        headers: authHeader(adminToken),
        payload: { amount_vnd: amount, reason: `commission refund ${amount}` },
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    expect(await ledger(order.id)).toEqual([
      {
        commission_type: 'team_lead_direct',
        beneficiary_user_id: lead.id,
        total: '39',
        entries: 1,
      },
      {
        commission_type: 'team_lead_direct_reversal',
        beneficiary_user_id: lead.id,
        total: '-39',
        entries: 2,
      },
    ]);
  }, 60_000);

  it('reverses a legacy CTV/Lead order by its legacy types on partial refund (§3.6)', async () => {
    const ctv = await registerAndLogin(app, 'commission-legacy-ctv');
    const legacyLead = await registerAndLogin(app, 'commission-legacy-lead');
    const buyer = await registerAndLogin(app, 'commission-legacy-buyer');
    const order = await prepareOrder(buyer, 100);
    await pay(order, 100, `commission-legacy-${Date.now()}`);
    // Rows as the v1.0 allocator wrote them for an order paid before v1.1.
    await stack.query(
      `insert into referral_commission_ledger
         (order_id, beneficiary_user_id, commission_type, amount_vnd, source_amount_vnd)
       values ($1, $2, 'ctv_direct', 40, 100), ($1, $3, 'lead_management', 10, 100)`,
      [order.id, ctv.id, legacyLead.id],
    );
    for (const amount of [33, 67]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v2/admin/payments/${order.id}/refund`,
        headers: authHeader(adminToken),
        payload: { amount_vnd: amount, reason: `legacy refund ${amount}` },
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    expect(await ledger(order.id)).toEqual([
      { commission_type: 'ctv_direct', beneficiary_user_id: ctv.id, total: '40', entries: 1 },
      {
        commission_type: 'ctv_direct_reversal',
        beneficiary_user_id: ctv.id,
        total: '-40',
        entries: 2,
      },
      {
        commission_type: 'lead_management',
        beneficiary_user_id: legacyLead.id,
        total: '10',
        entries: 1,
      },
      {
        commission_type: 'lead_management_reversal',
        beneficiary_user_id: legacyLead.id,
        total: '-10',
        entries: 2,
      },
    ]);
    const firstReversal = await stack.query<{ commission_type: string; amount_vnd: string }>(
      `select l.commission_type, l.amount_vnd::text
         from referral_commission_ledger l join billing_refunds r on r.id = l.refund_id
        where l.order_id = $1 and r.amount_vnd = 33 order by l.commission_type`,
      [order.id],
    );
    expect(firstReversal).toEqual([
      { commission_type: 'ctv_direct_reversal', amount_vnd: '-13' },
      { commission_type: 'lead_management_reversal', amount_vnd: '-3' },
    ]);
  }, 60_000);
});

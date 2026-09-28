import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;

describe('system acceptance: billing refund ledger and entitlement locking', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let admin: Session;
  let adminToken: string;
  let planId: string;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    admin = await registerAndLogin(app, 'refund-admin');
    await stack.query("update users set role = 'admin', is_email_verified = true where id = $1", [
      admin.id,
    ]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: admin.email, password: 'System!Passw0rd' },
    });
    expect(login.statusCode).toBe(200);
    adminToken = (login.json() as { access_token: string }).access_token;
    const plans = await app.inject({ method: 'GET', url: '/api/v2/premium/plans' });
    planId = (
      (plans.json() as Array<{ id: string; code: string }>).find(
        (plan) => plan.code === 'MONTHLY',
      ) as { id: string }
    ).id;
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  async function pay(user: Session, suffix: string): Promise<string> {
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/checkout',
      headers: authHeader(user.accessToken),
      payload: { plan_id: planId },
    });
    expect(checkout.statusCode).toBe(201);
    const order = checkout.json() as { invoice_number: string; order_id: string };
    const ipn = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/sepay/ipn',
      headers: { 'x-secret-key': 'system-test-sepay-secret' },
      payload: {
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: order.invoice_number,
          order_amount: '99000',
          order_currency: 'VND',
          order_status: 'CAPTURED',
        },
        transaction: {
          transaction_id: `refund-system-${suffix}-${Date.now()}`,
          transaction_amount: '99000',
          transaction_currency: 'VND',
          transaction_status: 'APPROVED',
        },
      },
    });
    expect(ipn.statusCode).toBe(200);
    expect(ipn.json()).toMatchObject({ message: 'processed' });
    return order.order_id;
  }

  it('adds repeated partial refunds numerically and never changes another order grant', async () => {
    const buyer = await registerAndLogin(app, 'refund-buyer');
    const firstOrder = await pay(buyer, 'first');
    const secondOrder = await pay(buyer, 'second');
    const [secondBefore] = await stack.query<{ ends_at: Date; original_ends_at: Date }>(
      `select ends_at, original_ends_at
         from billing_entitlement_grants where order_id = $1`,
      [secondOrder],
    );

    for (const [amount, reason] of [
      [30_000, 'first partial refund'],
      [20_000, 'second partial refund'],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v2/admin/payments/${firstOrder}/refund`,
        headers: authHeader(adminToken),
        payload: { amount_vnd: amount, reason },
      });
      expect(response.statusCode).toBe(200);
    }

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v2/admin/payments/${firstOrder}`,
      headers: authHeader(adminToken),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      amount_vnd: 99_000,
      refunded_amount_vnd: 50_000,
      status: 'partially_refunded',
      currency: 'VND',
    });
    expect(typeof (detail.json() as { refunded_amount_vnd: unknown }).refunded_amount_vnd).toBe(
      'number',
    );

    const [refundLedger] = await stack.query<{ total: string; entries: number }>(
      `select sum(amount_vnd)::text as total, count(*)::int as entries
         from billing_refunds where order_id = $1`,
      [firstOrder],
    );
    expect(refundLedger).toEqual({ total: '50000', entries: 2 });

    const [firstGrant] = await stack.query<{ shortened: boolean }>(
      `select ends_at < original_ends_at as shortened
         from billing_entitlement_grants where order_id = $1`,
      [firstOrder],
    );
    expect(firstGrant?.shortened).toBe(true);
    const [secondAfter] = await stack.query<{ ends_at: Date; original_ends_at: Date }>(
      `select ends_at, original_ends_at
         from billing_entitlement_grants where order_id = $1`,
      [secondOrder],
    );
    expect(new Date(secondAfter!.ends_at).toISOString()).toBe(
      new Date(secondBefore!.ends_at).toISOString(),
    );
    expect(new Date(secondAfter!.original_ends_at).toISOString()).toBe(
      new Date(secondBefore!.original_ends_at).toISOString(),
    );
  }, 60_000);

  it('serializes a concurrent cancel and grant using the same user advisory lock', async () => {
    const buyer = await registerAndLogin(app, 'cancel-grant-race');
    const [subscription] = await stack.query<{ id: string }>(
      `select id from premium_subscriptions where user_id = $1`,
      [buyer.id],
    );
    expect(subscription?.id).toBeTruthy();

    const [cancel, grant] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v2/admin/subscriptions/${subscription!.id}/cancel`,
        headers: authHeader(adminToken),
        payload: { reason: 'concurrency system check' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v2/premium/admin/users/${buyer.id}/grant`,
        headers: authHeader(adminToken),
        payload: { plan_id: planId, note: 'concurrency system check' },
      }),
    ]);
    expect(cancel.statusCode).toBe(200);
    expect([200, 201]).toContain(grant.statusCode);

    const [state] = await stack.query<{ status: string; active_grants: number }>(
      `select s.status,
              count(g.id) filter (
                where g.status = 'active' and g.starts_at <= now() and now() < g.ends_at
              )::int as active_grants
         from premium_subscriptions s
         left join billing_entitlement_grants g on g.user_id = s.user_id
        where s.user_id = $1
        group by s.status`,
      [buyer.id],
    );
    expect(state).toBeDefined();
    expect(state!.status === 'active').toBe(state!.active_grants > 0);
  }, 60_000);
});

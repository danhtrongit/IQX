import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;

describe('system acceptance: referral commission accounting', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let planId: string;
  let adminToken: string;
  let sponsor: Session;
  let lead: Session;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    const plans = await app.inject({ method: 'GET', url: '/api/v2/premium/plans' });
    planId = (
      (plans.json() as Array<{ id: string; code: string }>).find(
        (plan) => plan.code === 'MONTHLY',
      ) as { id: string }
    ).id;
    sponsor = await registerAndLogin(app, 'commission-ctv');
    lead = await registerAndLogin(app, 'commission-lead');
    await stack.query(
      `update users
          set referral_partner_kind = 'ctv'::referral_partner_kind,
              referral_code = 'CTV_SYSTEM_COMMISSION',
              referral_lead_user_id = $2,
              referral_attributed_at = now()
        where id = $1`,
      [sponsor.id, lead.id],
    );
    await stack.query(
      `update users
          set referral_partner_kind = 'lead_sale'::referral_partner_kind,
              referral_code = 'LS_SYSTEM_COMMISSION', referral_attributed_at = now()
        where id = $1`,
      [lead.id],
    );
    const admin = await registerAndLogin(app, 'commission-admin');
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
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  async function prepareOrder(
    user: Session,
    amount: number,
    sponsorId = sponsor.id,
  ): Promise<{ id: string; invoice: string }> {
    await stack.query('update users set referred_by_user_id = $2 where id = $1', [
      user.id,
      sponsorId,
    ]);
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/checkout',
      headers: authHeader(user.accessToken),
      payload: { plan_id: planId },
    });
    expect(checkout.statusCode).toBe(201);
    const created = checkout.json() as { order_id: string; invoice_number: string };
    await stack.query('update premium_payment_orders set amount_vnd = $2 where id = $1', [
      created.order_id,
      amount,
    ]);
    return { id: created.order_id, invoice: created.invoice_number };
  }

  async function pay(order: { id: string; invoice: string }, amount: number, txId: string) {
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
          transaction_id: txId,
          transaction_amount: String(amount),
          transaction_currency: 'VND',
          transaction_status: 'APPROVED',
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ message: 'processed' });
  }

  it('allocates 40/10 exactly, keeps IPN replay idempotent, and allocates mark-paid', async () => {
    const buyer = await registerAndLogin(app, 'commission-ipn');
    const order = await prepareOrder(buyer, 100_000);
    await pay(order, 100_000, `commission-ipn-${Date.now()}`);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/sepay/ipn',
      headers: { 'x-secret-key': 'system-test-sepay-secret' },
      payload: {
        notification_type: 'ORDER_PAID',
        order: {
          order_invoice_number: order.invoice,
          order_amount: '100000',
          order_currency: 'VND',
          order_status: 'CAPTURED',
        },
        transaction: {
          transaction_id: `commission-ipn-${Date.now()}`,
          transaction_amount: '100000',
          transaction_currency: 'VND',
          transaction_status: 'APPROVED',
        },
      },
    });
    expect(replay.statusCode).toBe(200);
    const rows = await stack.query<{ commission_type: string; total: string; entries: number }>(
      `select commission_type, sum(amount_vnd)::text as total, count(*)::int as entries
         from referral_commission_ledger where order_id = $1
        group by commission_type order by commission_type`,
      [order.id],
    );
    expect(rows).toEqual([
      { commission_type: 'ctv_direct', total: '40000', entries: 1 },
      { commission_type: 'lead_management', total: '10000', entries: 1 },
    ]);

    const adminBuyer = await registerAndLogin(app, 'commission-mark-paid');
    const adminOrder = await prepareOrder(adminBuyer, 100_000);
    const marked = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/payments/${adminOrder.id}/mark-paid`,
      headers: authHeader(adminToken),
      payload: { note: 'commission mark paid' },
    });
    expect(marked.statusCode).toBe(200);
    const adminRows = await stack.query<{ commission_type: string; total: string }>(
      `select commission_type, sum(amount_vnd)::text as total
         from referral_commission_ledger where order_id = $1 group by commission_type
        order by commission_type`,
      [adminOrder.id],
    );
    expect(adminRows).toEqual([
      { commission_type: 'ctv_direct', total: '40000' },
      { commission_type: 'lead_management', total: '10000' },
    ]);
  }, 60_000);

  it('omits zero rows for 1/2 VND and reverses cumulative odd refunds exactly', async () => {
    for (const amount of [1, 2]) {
      const buyer = await registerAndLogin(app, `commission-tiny-${amount}`);
      const order = await prepareOrder(buyer, amount);
      await pay(order, amount, `commission-tiny-${amount}-${Date.now()}`);
      const rows = await stack.query<{ entries: number }>(
        'select count(*)::int as entries from referral_commission_ledger where order_id = $1',
        [order.id],
      );
      expect(rows[0]?.entries).toBe(0);
    }

    const buyer = await registerAndLogin(app, 'commission-refund');
    const order = await prepareOrder(buyer, 99);
    await pay(order, 99, `commission-refund-${Date.now()}`);
    for (const amount of [49, 50]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v2/admin/payments/${order.id}/refund`,
        headers: authHeader(adminToken),
        payload: { amount_vnd: amount, reason: `commission refund ${amount}` },
      });
      expect(response.statusCode).toBe(200);
    }
    const rows = await stack.query<{ commission_type: string; total: string; entries: number }>(
      `select commission_type, sum(amount_vnd)::text as total, count(*)::int as entries
         from referral_commission_ledger where order_id = $1
        group by commission_type order by commission_type`,
      [order.id],
    );
    expect(rows).toEqual([
      { commission_type: 'ctv_direct', total: '39', entries: 1 },
      { commission_type: 'ctv_direct_reversal', total: '-39', entries: 2 },
      { commission_type: 'lead_management', total: '9', entries: 1 },
      { commission_type: 'lead_management_reversal', total: '-9', entries: 2 },
    ]);
  }, 60_000);

  it('does not allocate to a deleted sponsor', async () => {
    const deletedSponsor = await registerAndLogin(app, 'commission-deleted');
    await stack.query(
      `update users set referral_partner_kind = 'ctv'::referral_partner_kind,
                       referral_lead_user_id = $2, status = 'deleted', deleted_at = now()
        where id = $1`,
      [deletedSponsor.id, lead.id],
    );
    const buyer = await registerAndLogin(app, 'commission-deleted-buyer');
    await stack.query('update users set referred_by_user_id = $2 where id = $1', [
      buyer.id,
      deletedSponsor.id,
    ]);
    const order = await prepareOrder(buyer, 100_000, deletedSponsor.id);
    await pay(order, 100_000, `commission-deleted-${Date.now()}`);
    const rows = await stack.query<{ entries: number }>(
      'select count(*)::int as entries from referral_commission_ledger where order_id = $1',
      [order.id],
    );
    expect(rows[0]?.entries).toBe(0);
  }, 60_000);
});

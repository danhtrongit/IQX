import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: identity, roles and billing', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('registers, logs in, rotates refresh tokens and logs out', async () => {
    const email = `auth-${Date.now()}@example.test`;
    const password = 'System!Passw0rd';
    const register = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      payload: { email, password, full_name: 'Auth User' },
    });
    expect([200, 201]).toContain(register.statusCode);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const first = login.json() as { access_token: string; refresh_token: string };
    const me = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: authHeader(first.access_token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email, role: 'premium', status: 'active' });

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/refresh',
      payload: { refresh_token: first.refresh_token },
    });
    expect(refresh.statusCode).toBe(200);
    const second = refresh.json() as { access_token: string; refresh_token: string };
    expect(second.refresh_token).not.toBe(first.refresh_token);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/refresh',
      payload: { refresh_token: first.refresh_token },
    });
    expect(replay.statusCode).toBe(401);

    const afterReplay = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: authHeader(second.access_token),
    });
    expect(afterReplay.statusCode).toBe(401);

    const freshLogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email, password },
    });
    expect(freshLogin.statusCode).toBe(200);
    const fresh = freshLogin.json() as { access_token: string; refresh_token: string };

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/logout',
      headers: authHeader(fresh.access_token),
    });
    expect(logout.statusCode).toBe(200);
    const accessAfterLogout = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: authHeader(fresh.access_token),
    });
    expect(accessAfterLogout.statusCode).toBe(401);
    const afterLogout = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/refresh',
      payload: { refresh_token: fresh.refresh_token },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('enforces the admin role granted only by an isolated DB fixture', async () => {
    const user = await registerAndLogin(app, 'role');
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v2/users',
      headers: authHeader(user.accessToken),
    });
    expect(denied.statusCode).toBe(403);
    await stack.query("UPDATE users SET role = 'admin', is_email_verified = true WHERE id = $1", [
      user.id,
    ]);
    const admin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: user.email, password: 'System!Passw0rd' },
    });
    expect(admin.statusCode).toBe(200);
    const token = (admin.json() as { access_token: string }).access_token;
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v2/users',
      headers: authHeader(token),
    });
    expect(allowed.statusCode).not.toBe(403);
    expect(allowed.statusCode).not.toBe(500);
  });

  it('creates a checkout, authenticates an IPN, makes duplicate IPN idempotent and cancels entitlement', async () => {
    const buyer = await registerAndLogin(app, 'billing');
    const plans = await app.inject({ method: 'GET', url: '/api/v2/premium/plans' });
    expect(plans.statusCode).toBe(200);
    const plan = (plans.json() as Array<{ id: string; code: string }>).find(
      (item) => item.code === 'MONTHLY',
    );
    expect(plan).toBeDefined();
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/checkout',
      headers: authHeader(buyer.accessToken),
      payload: { plan_id: plan!.id },
    });
    expect(checkout.statusCode).toBe(201);
    const payment = checkout.json() as { invoice_number: string; order_id: string };
    const payload = {
      notification_type: 'ORDER_PAID',
      order: {
        order_invoice_number: payment.invoice_number,
        order_amount: '99000',
        order_currency: 'VND',
        order_status: 'CAPTURED',
      },
      transaction: {
        transaction_id: `tx-${Date.now()}`,
        transaction_amount: '99000',
        transaction_currency: 'VND',
        transaction_status: 'APPROVED',
      },
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/sepay/ipn',
      headers: { 'x-secret-key': 'system-test-sepay-secret' },
      payload,
    });
    expect(first.statusCode).toBe(200);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v2/premium/sepay/ipn',
      headers: { 'x-secret-key': 'system-test-sepay-secret' },
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    const paidRows = await stack.query<{ status: string; count: string }>(
      'SELECT status, count(*)::text AS count FROM premium_payment_orders WHERE id = $1 GROUP BY status',
      [payment.order_id],
    );
    expect(paidRows).toEqual([{ status: 'paid', count: '1' }]);
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v2/premium/me',
      headers: authHeader(buyer.accessToken),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ is_premium: true });

    const row = (
      await stack.query<{ id: string }>(
        'SELECT id FROM premium_subscriptions WHERE user_id = $1 LIMIT 1',
        [buyer.id],
      )
    )[0];
    expect(row?.id).toBeTruthy();
    const admin = await registerAndLogin(app, 'billing-admin');
    await stack.query("UPDATE users SET role = 'admin', is_email_verified = true WHERE id = $1", [
      admin.id,
    ]);
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: admin.email, password: 'System!Passw0rd' },
    });
    const adminToken = (adminLogin.json() as { access_token: string }).access_token;
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/subscriptions/${row!.id}/cancel`,
      headers: authHeader(adminToken),
      payload: { reason: 'system acceptance cancellation' },
    });
    expect(cancel.statusCode).toBe(200);
    const afterCancel = await app.inject({
      method: 'GET',
      url: '/api/v2/premium/me',
      headers: authHeader(buyer.accessToken),
    });
    expect(afterCancel.statusCode).toBe(200);
    expect(afterCancel.json()).toMatchObject({ is_premium: false });
  });
});

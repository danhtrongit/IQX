import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type JsonObject = Record<string, unknown>;

describe('system acceptance: admin domain', () => {
  let stack: SystemStack;
  let adminToken: string;

  beforeAll(async () => {
    stack = await startSystemStack();
    const admin = await registerAndLogin(stack.app, 'admin-domain');
    await stack.query(
      "update users set role = 'admin', is_email_verified = true, updated_at = now() where id = $1",
      [admin.id],
    );
    const login = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: admin.email, password: 'System!Passw0rd' },
    });
    expect(login.statusCode).toBe(200);
    adminToken = (login.json() as { access_token: string }).access_token;
    const activated = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/account/activate',
      headers: authHeader(adminToken),
    });
    expect([200, 201]).toContain(activated.statusCode);
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('serves every admin read family with real database-backed payloads', async () => {
    const headers = authHeader(adminToken);
    const cases: Array<{
      url: string;
      verify: (body: unknown, headers: Record<string, unknown>) => void;
    }> = [
      {
        url: '/api/v2/admin/metrics/overview',
        verify: (body) =>
          expect(body).toMatchObject({
            total_users: expect.any(Number),
            active_users: expect.any(Number),
            vt_active_accounts: 1,
          }),
      },
      {
        url: '/api/v2/admin/metrics/revenue?days=7',
        verify: (body) => expect(Array.isArray(body)).toBe(true),
      },
      {
        url: '/api/v2/admin/metrics/plan-distribution',
        verify: (body) => expect(Array.isArray(body)).toBe(true),
      },
      {
        url: '/api/v2/premium/admin/plans',
        verify: (body) => {
          expect(Array.isArray(body)).toBe(true);
          expect(body).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'MONTHLY' })]),
          );
        },
      },
      {
        url: '/api/v2/admin/payments',
        verify: (body) => expect(body).toMatchObject({ items: [], total: 0, page: 1 }),
      },
      {
        url: '/api/v2/admin/subscriptions',
        verify: (body) => expect(body).toMatchObject({ items: expect.any(Array), page: 1 }),
      },
      {
        url: '/api/v2/admin/ipn',
        verify: (body) => expect(body).toMatchObject({ items: [], total: 0, page: 1 }),
      },
      {
        url: '/api/v2/admin/audit',
        verify: (body) => expect(body).toMatchObject({ items: expect.any(Array), page: 1 }),
      },
      {
        url: '/api/v2/admin/audit/export?limit=20',
        verify: (body, responseHeaders) => {
          expect(typeof body).toBe('string');
          expect(String(responseHeaders['content-type'])).toContain('text/csv');
        },
      },
      {
        url: '/api/v2/admin/system/status',
        verify: (body) =>
          expect(body).toMatchObject({
            version: '0.2.0',
            environment: 'test',
            scheduler_running: false,
            db_stats: expect.objectContaining({ users: expect.any(Number) }),
          }),
      },
      {
        url: '/api/v2/admin/alerts/indicators',
        verify: (body) =>
          expect(body).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
          ),
      },
      {
        url: '/api/v2/admin/alerts/factor-library',
        verify: (body) => expect(body).toEqual(expect.anything()),
      },
      {
        url: '/api/v2/admin/alerts/signals',
        verify: (body) => expect(Array.isArray(body)).toBe(true),
      },
      {
        url: '/api/v2/admin/vt/config',
        verify: (body) => {
          expect(Number((body as JsonObject).initial_cash_vnd)).toBe(100_000_000);
          expect(body).toMatchObject({ trading_enabled: true });
        },
      },
      {
        url: '/api/v2/admin/vt/accounts',
        verify: (body) => expect(body).toMatchObject({ items: expect.any(Array), page: 1 }),
      },
      {
        url: '/api/v2/admin/users/export',
        verify: (body, responseHeaders) => {
          expect(typeof body).toBe('string');
          expect(String(responseHeaders['content-type'])).toContain('text/csv');
        },
      },
    ];

    for (const testCase of cases) {
      const response = await stack.app.inject({ method: 'GET', url: testCase.url, headers });
      expect(response.statusCode, `${testCase.url}: ${response.body}`).toBe(200);
      const contentType = String(response.headers['content-type'] ?? '');
      const body: unknown = contentType.includes('json') ? response.json() : response.body;
      testCase.verify(body, response.headers as Record<string, unknown>);
    }
  });

  it('performs user create, update, bulk update, 360, history and soft-delete without touching the admin', async () => {
    const headers = authHeader(adminToken);
    const email = `admin-created-${Date.now()}@example.test`;
    const createdResponse = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/users',
      headers,
      payload: {
        email,
        password: 'Created!Passw0rd',
        full_name: 'Created by admin',
        role: 'user',
        status: 'active',
      },
    });
    expect(createdResponse.statusCode, createdResponse.body).toBe(201);
    const created = createdResponse.json() as JsonObject & { id: string };
    expect(created).toMatchObject({ email, role: 'user', status: 'active' });

    const updatedResponse = await stack.app.inject({
      method: 'PATCH',
      url: `/api/v2/users/${created.id}`,
      headers,
      payload: { full_name: 'Updated by admin', is_email_verified: true },
    });
    expect(updatedResponse.statusCode, updatedResponse.body).toBe(200);
    expect(updatedResponse.json()).toMatchObject({
      full_name: 'Updated by admin',
      is_email_verified: true,
    });

    const bulkResponse = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/admin/users/bulk',
      headers,
      payload: { user_ids: [created.id], op: 'set_role', value: 'premium' },
    });
    expect(bulkResponse.statusCode, bulkResponse.body).toBe(201);
    expect(bulkResponse.json()).toMatchObject({ affected: 1, skipped: [], errors: [] });

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/api/v2/users/${created.id}`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: created.id, role: 'premium' });

    const view360 = await stack.app.inject({
      method: 'GET',
      url: `/api/v2/admin/users/${created.id}/360`,
      headers,
    });
    expect(view360.statusCode, view360.body).toBe(200);
    expect(view360.json()).toMatchObject({
      user: expect.objectContaining({ id: created.id, email }),
    });

    const history = await stack.app.inject({
      method: 'GET',
      url: `/api/v2/admin/users/${created.id}/login-history`,
      headers,
    });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json()).toMatchObject({ items: [], total: 0, page: 1 });

    const remove = await stack.app.inject({
      method: 'DELETE',
      url: `/api/v2/users/${created.id}`,
      headers,
    });
    expect(remove.statusCode, remove.body).toBe(200);
    const persisted = await stack.query<{ status: string; deleted_at: Date | null }>(
      'select status, deleted_at from users where id = $1',
      [created.id],
    );
    expect(persisted[0]?.status).toBe('deleted');
    expect(persisted[0]?.deleted_at).toBeTruthy();
  });

  it('returns validation/auth errors, never 500, for malformed or unauthorized admin calls', async () => {
    const noAuth = await stack.app.inject({ method: 'GET', url: '/api/v2/admin/system/status' });
    expect(noAuth.statusCode).toBe(401);

    const invalidMetric = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/admin/metrics/revenue?days=0',
      headers: authHeader(adminToken),
    });
    expect(invalidMetric.statusCode, invalidMetric.body).toBe(422);

    const invalidCreate = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/users',
      headers: authHeader(adminToken),
      payload: { email: 'not-an-email', password: 'weak', full_name: '' },
    });
    expect(invalidCreate.statusCode, invalidCreate.body).toBe(422);
  });
});

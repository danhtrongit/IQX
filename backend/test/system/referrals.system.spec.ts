import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: referrals', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
  });
  afterAll(async () => {
    await stack?.close();
  });

  it('enrolls Lead Sale and CTV, validates hierarchy and idempotency', async () => {
    const admin = await registerAndLogin(app, 'ref-admin');
    await stack.query("update users set role='admin', is_email_verified=true where id=$1", [
      admin.id,
    ]);
    const lead = await registerAndLogin(app, 'ref-lead');
    const ctv = await registerAndLogin(app, 'ref-ctv');
    const headers = authHeader(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v2/auth/login',
          payload: { email: admin.email, password: 'System!Passw0rd' },
        })
      ).json().access_token,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v2/admin/referrals/${ctv.id}/enroll`,
          headers,
          payload: { kind: 'ctv' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v2/admin/referrals/${lead.id}/enroll`,
          headers,
          payload: { kind: 'lead_sale' },
        })
      ).statusCode,
    ).toBe(201);
    const enrolled = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/referrals/${ctv.id}/enroll`,
      headers,
      payload: { kind: 'ctv', lead_user_id: lead.id },
    });
    expect(enrolled.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v2/admin/referrals/${ctv.id}/enroll`,
          headers,
          payload: { kind: 'ctv', lead_user_id: lead.id },
        })
      ).statusCode,
    ).toBe(201);
  });

  it('rejects non-admin access to referral targets', async () => {
    const user = await registerAndLogin(app, 'ref-user');
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/referrals/not-a-uuid',
      headers: authHeader(user.accessToken),
    });
    expect(bad.statusCode).toBe(403);
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/referrals/00000000-0000-4000-8000-000000000000',
      headers: authHeader(user.accessToken),
    });
    expect(missing.statusCode).toBe(403);
  });

  it('attributes signup, audits enrollment, and rejects invalid or disabled referrals', async () => {
    const admin = await registerAndLogin(app, 'ref-attribution-admin');
    await stack.query("update users set role='admin' where id=$1", [admin.id]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email: admin.email, password: 'System!Passw0rd' },
    });
    const headers = authHeader(login.json().access_token as string);
    const ctv = await registerAndLogin(app, 'ref-attribution-ctv');
    const enroll = (userId: string, payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/v2/admin/referrals/${userId}/enroll`,
        headers,
        payload,
      });
    expect((await enroll(admin.id, { kind: 'lead_sale' })).statusCode).toBe(201);
    const enrollment = await enroll(ctv.id, { kind: 'ctv', lead_user_id: admin.id });
    expect(enrollment.statusCode, enrollment.body).toBe(201);
    const profile = enrollment.json() as { referral_code: string; referral_url: string };
    expect(profile).toMatchObject({
      referral_code: expect.stringMatching(/^CTV_[A-F0-9]{10}$/),
      referral_url: `/?ref=${profile.referral_code}`,
      referral_partner_kind: 'ctv',
      referral_lead_user_id: admin.id,
      referred_by_user_id: null,
    });
    const repeat = await enroll(ctv.id, { kind: 'ctv', lead_user_id: admin.id });
    expect(repeat.statusCode).toBe(201);
    expect(repeat.json()).toEqual(profile);
    const audit = await stack.query<{ total: number }>(
      "select count(*)::int as total from admin_audit_log where target_id=$1 and action='referral.enroll'",
      [ctv.id],
    );
    expect(audit[0]?.total).toBe(1);
    const timestamps = await stack.query<{ referral_attributed_at: unknown }>(
      'select referral_attributed_at from users where id=$1',
      [ctv.id],
    );
    expect(timestamps[0]?.referral_attributed_at).toBeNull();

    const signup = (suffix: string, code: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v2/auth/register',
        payload: {
          email: `ref-${suffix}@example.test`,
          password: 'System!Passw0rd',
          full_name: 'Referral customer',
          referral_code: code,
        },
      });
    const buyer = await signup('valid', ` ${profile.referral_code.toLowerCase()} `);
    expect(buyer.statusCode, buyer.body).toBe(201);
    expect(buyer.json()).not.toHaveProperty('referred_by_user_id');
    const attribution = await stack.query<{
      referred_by_user_id: string;
      referral_attributed_at: unknown;
    }>('select referred_by_user_id,referral_attributed_at from users where id=$1', [
      (buyer.json() as { id: string }).id,
    ]);
    expect(attribution[0]?.referred_by_user_id).toBe(ctv.id);
    expect(attribution[0]?.referral_attributed_at).not.toBeNull();
    expect((await signup('unknown', 'CTV_UNKNOWN')).statusCode).toBe(400);
    expect((await signup('malformed', 'bad code!')).statusCode).toBe(422);
    await stack.query("update users set status='inactive' where id=$1", [ctv.id]);
    expect((await signup('inactive', profile.referral_code)).statusCode).toBe(400);
    await stack.query("update users set status='active',deleted_at=now() where id=$1", [ctv.id]);
    expect((await signup('deleted', profile.referral_code)).statusCode).toBe(400);

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/referrals/not-a-uuid',
      headers,
    });
    expect(invalid.statusCode).toBe(400);
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/referrals/00000000-0000-4000-8000-000000000000',
      headers,
    });
    expect(missing.statusCode).toBe(404);
    const candidate = await registerAndLogin(app, 'ref-invalid-lead');
    expect(
      (await enroll(candidate.id, { kind: 'ctv', lead_user_id: candidate.id })).statusCode,
    ).toBe(400);
    expect((await enroll(candidate.id, { kind: 'ctv', lead_user_id: ctv.id })).statusCode).toBe(
      400,
    );
    expect((await enroll(admin.id, { kind: 'ctv', lead_user_id: candidate.id })).statusCode).toBe(
      400,
    );
  });
});

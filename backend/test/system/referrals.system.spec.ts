import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 §3.6: Lead Sale / CTV enrollment is gone (team leads replace it, see
// team-lead-admin.system.spec.ts). Existing partners keep their legacy profile for reading.
describe('system acceptance: legacy referrals', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
  });
  afterAll(async () => {
    await stack?.close();
  });

  it('removes the admin enrollment routes', async () => {
    const admin = await registerAndLogin(app, 'ref-admin');
    await stack.query("update users set role='admin' where id=$1", [admin.id]);
    const headers = authHeader(admin.accessToken);
    const target = await registerAndLogin(app, 'ref-target');
    expect(
      (await app.inject({ method: 'GET', url: `/api/v2/admin/referrals/${target.id}`, headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v2/admin/referrals/${target.id}/enroll`,
          headers,
          payload: { kind: 'lead_sale' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('reads the legacy profile of an existing partner and rejects legacy codes', async () => {
    const partner = await registerAndLogin(app, 'ref-partner');
    const code = `CTV_${Date.now().toString(16).slice(-10).toUpperCase().padStart(10, '0')}`;
    await stack.query(
      `update users set referral_partner_kind = 'ctv', referral_code = $2 where id = $1`,
      [partner.id, code],
    );
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v2/referrals/me',
      headers: authHeader(partner.accessToken),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual({
      referral_code: code,
      referral_partner_kind: 'ctv',
      referred_by_user_id: null,
      referral_lead_user_id: null,
      referral_url: `/?ref=${code}`,
    });

    // Admin spec v1.1 §3.1: a referral code is an active team lead's username. Legacy
    // LS_/CTV_ codes stop resolving until the conversion stage maps them to the converted
    // team lead for the LEGACY_REFERRAL_CODE_UNTIL window (DECISION 5).
    const signup = (suffix: string, referralCode: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v2/auth/register',
        payload: {
          ...testIdentity(`ref-${suffix}`),
          password: 'System!Passw0rd',
          full_name: 'Referral customer',
          referral_code: referralCode,
        },
      });
    const legacy = await signup('legacy', ` ${code.toLowerCase()} `);
    expect(legacy.statusCode, legacy.body).toBe(422);
    expect((legacy.json() as { error: { code: string } }).error.code).toBe('REFERRAL_CODE_INVALID');
    expect((await signup('unknown', 'CTV_UNKNOWN')).statusCode).toBe(422);
    expect((await signup('malformed', 'bad code!')).statusCode).toBe(422);
  });
});

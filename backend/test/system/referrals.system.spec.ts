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
// team-lead-admin.system.spec.ts); 0025 converts active partners into team leads.
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

  it('shows no code card to a non-converted partner and rejects its legacy code', async () => {
    const partner = await registerAndLogin(app, 'ref-partner');
    const code = `CTV_${Date.now().toString(16).slice(-10).toUpperCase().padStart(10, '0')}`;
    await stack.query(
      `update users set referral_partner_kind = 'ctv', referral_code = $2 where id = $1`,
      [partner.id, code],
    );
    // Admin spec v1.1 §3.1: only an active team lead has a code (its username). A partner the
    // 0025 conversion did not turn into a team lead has none (team-lead-conversion spec covers
    // the converted case).
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v2/referrals/me',
      headers: authHeader(partner.accessToken),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual({
      is_team_lead: false,
      referral_code: null,
      referral_url: null,
      commission_pct: null,
      offer_type: null,
      offer_days: null,
    });

    // DECISION 5: a legacy LS_/CTV_ code resolves only to a converted, active team lead.
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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 foundation (stage B1): team_lead role, username, phone, identifier login,
// role guards and the audit actor role. Team-lead appointment itself lands in a later stage,
// so a lead is created here directly in SQL exactly as the appointment will leave it.
const PASSWORD = 'System!Passw0rd';

type ErrorBody = { error: { code: string; details?: Array<{ user_id: string }> } };

describe('system acceptance: team lead foundation (admin spec v1.1)', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    const admin = await registerAndLogin(app, 'tl-admin');
    adminId = admin.id;
    await stack.query("update users set role = 'admin' where id = $1", [admin.id]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: admin.email, password: PASSWORD },
    });
    expect(login.statusCode, login.body).toBe(200);
    adminToken = (login.json() as { access_token: string }).access_token;
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  const register = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/v2/auth/register', payload });
  const errorCode = (body: string) => (JSON.parse(body) as ErrorBody).error.code;

  async function makeTeamLead(suffix: string) {
    const lead = await registerAndLogin(app, suffix);
    await stack.query("update users set role = 'team_lead' where id = $1", [lead.id]);
    await stack.query(
      `insert into team_lead_profiles (user_id, status, appointed_by) values ($1, 'active', $2)`,
      [lead.id, adminId],
    );
    return lead;
  }

  it('registers with a required username and Vietnamese mobile (§2.1, §7.1)', async () => {
    const identity = testIdentity('tl-register');
    const base = { ...identity, password: PASSWORD, full_name: 'Đăng ký' };

    const missingPhone = await register({ ...base, phone_number: undefined });
    expect(missingPhone.statusCode).toBe(422);
    expect(errorCode(missingPhone.body)).toBe('VALIDATION_ERROR');
    const missingUsername = await register({ ...base, username: undefined });
    expect(missingUsername.statusCode).toBe(422);
    const reserved = await register({ ...base, username: 'CTV_0123456789' });
    expect(reserved.statusCode).toBe(422);
    const landline = await register({ ...base, phone_number: '028 3812 3456' });
    expect(landline.statusCode).toBe(400);
    expect(errorCode(landline.body)).toBe('PHONE_INVALID');

    const created = await register({ ...base, username: identity.username.toUpperCase() });
    expect(created.statusCode, created.body).toBe(201);
    const user = created.json() as {
      username: string;
      username_change_allowed: boolean;
      phone_number: string;
    };
    expect(user.username).toBe(identity.username);
    expect(user.username_change_allowed).toBe(false);
    const stored = await stack.query<{ phone_e164: string }>(
      'select phone_e164 from users where username = $1',
      [identity.username],
    );
    expect(stored[0]?.phone_e164).toBe(`+84${identity.phone_number.slice(1)}`);

    const other = testIdentity('tl-register-dup');
    const duplicate = await register({
      ...other,
      username: identity.username.toUpperCase(),
      password: PASSWORD,
      full_name: 'Trùng',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(errorCode(duplicate.body)).toBe('USERNAME_TAKEN');
    const samePhone = await register({
      ...other,
      phone_number: identity.phone_number.replace(/^0/, '+84 '),
      password: PASSWORD,
      full_name: 'Trùng',
    });
    expect(samePhone.statusCode).toBe(409);
    expect(errorCode(samePhone.body)).toBe('PHONE_EXISTS');
    const unknownCode = await register({
      ...other,
      referral_code: 'NOPE_CODE',
      password: PASSWORD,
      full_name: 'Mã sai',
    });
    expect(unknownCode.statusCode).toBe(422);
    expect(errorCode(unknownCode.body)).toBe('REFERRAL_CODE_INVALID');
    const notCreated = await stack.query('select id from users where email = $1', [other.email]);
    expect(notCreated).toHaveLength(0);
  });

  it('logs in by username, email or the legacy email field (§2.1 rule 1)', async () => {
    const user = await registerAndLogin(app, 'tl-login');
    const login = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v2/auth/login', payload });

    expect(
      (await login({ identifier: user.username.toUpperCase(), password: PASSWORD })).statusCode,
    ).toBe(200);
    expect((await login({ identifier: user.email, password: PASSWORD })).statusCode).toBe(200);
    expect((await login({ email: user.email, password: PASSWORD })).statusCode).toBe(200);
    expect(
      (await login({ identifier: user.username, password: 'Wrong!Passw0rd' })).statusCode,
    ).toBe(401);
    expect((await login({ identifier: 'no.such.user', password: PASSWORD })).statusCode).toBe(401);
    expect((await login({ password: PASSWORD })).statusCode).toBe(422);

    const history = await stack.query<{ email: string; success: boolean; user_id: string | null }>(
      `select email, success, user_id from user_login_history
        where user_id = $1 or email = 'no.such.user' order by login_at`,
      [user.id],
    );
    expect(history.filter((row) => row.success)).toHaveLength(4);
    expect(history.find((row) => !row.success && row.user_id === user.id)?.email).toBe(user.email);
    expect(history.find((row) => row.user_id === null)?.email).toBe('no.such.user');
  });

  it('answers username availability case-insensitively (§4.1)', async () => {
    const user = await registerAndLogin(app, 'tl-available');
    const check = (u: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v2/auth/username-available?u=${encodeURIComponent(u)}`,
      });
    const taken = await check(user.username.toUpperCase());
    expect(taken.statusCode).toBe(200);
    expect(taken.json()).toEqual({ available: false });
    expect((await check('free.name.zz9')).json()).toEqual({ available: true });
    expect((await check('ab')).statusCode).toBe(422);
    expect((await check('ls_0123456789')).statusCode).toBe(422);
  });

  it('lets a backfilled account change its username once (DECISION 1)', async () => {
    const user = await registerAndLogin(app, 'tl-rename');
    const other = await registerAndLogin(app, 'tl-rename-other');
    const rename = (token: string, username: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v2/users/me/username',
        headers: authHeader(token),
        payload: { username },
      });

    const fresh = await rename(user.accessToken, 'fresh.rename');
    expect(fresh.statusCode).toBe(422);
    expect(errorCode(fresh.body)).toBe('USERNAME_LOCKED');

    await stack.query('update users set username_change_allowed = true where id = $1', [user.id]);
    const taken = await rename(user.accessToken, other.username.toUpperCase());
    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken.body)).toBe('USERNAME_TAKEN');
    const target = `Renamed.${Date.now().toString(36)}`;
    const changed = await rename(user.accessToken, target);
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json()).toMatchObject({
      username: target.toLowerCase(),
      username_change_allowed: false,
    });
    expect((await rename(user.accessToken, 'second.rename')).statusCode).toBe(422);
    const relogin = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: target.toLowerCase(), password: PASSWORD },
    });
    expect(relogin.statusCode).toBe(200);

    const lead = await makeTeamLead('tl-rename-lead');
    await stack.query('update users set username_change_allowed = true where id = $1', [lead.id]);
    const leadRename = await rename(lead.accessToken, 'lead.rename');
    expect(leadRename.statusCode).toBe(422);
    expect(errorCode(leadRename.body)).toBe('USERNAME_LOCKED');
  });

  it('keeps team_lead out of user create/update/bulk and blocks deactivating a lead (§1.1)', async () => {
    const headers = authHeader(adminToken);
    const lead = await makeTeamLead('tl-guard-lead');
    const member = await registerAndLogin(app, 'tl-guard-member');

    const createLead = await app.inject({
      method: 'POST',
      url: '/api/v2/users',
      headers,
      payload: {
        ...testIdentity('tl-created'),
        password: PASSWORD,
        full_name: 'X',
        role: 'team_lead',
      },
    });
    expect(createLead.statusCode).toBe(422);
    expect(errorCode(createLead.body)).toBe('ROLE_NOT_ASSIGNABLE');
    const { username: _username, ...withoutUsername } = testIdentity('tl-created-2');
    const createNoUsername = await app.inject({
      method: 'POST',
      url: '/api/v2/users',
      headers,
      payload: { ...withoutUsername, password: PASSWORD, full_name: 'X' },
    });
    expect(createNoUsername.statusCode).toBe(422);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v2/users',
      headers,
      payload: {
        ...testIdentity('tl-created-3'),
        phone_number: null,
        password: PASSWORD,
        full_name: 'X',
      },
    });
    expect(created.statusCode, created.body).toBe(201);

    const patch = (id: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `/api/v2/users/${id}`, headers, payload });
    const promote = await patch(member.id, { role: 'team_lead' });
    expect(promote.statusCode).toBe(422);
    expect(errorCode(promote.body)).toBe('ROLE_NOT_ASSIGNABLE');
    const demote = await patch(lead.id, { role: 'premium' });
    expect(errorCode(demote.body)).toBe('ROLE_NOT_ASSIGNABLE');
    const suspend = await patch(lead.id, { status: 'suspended' });
    expect(suspend.statusCode).toBe(422);
    expect(errorCode(suspend.body)).toBe('TEAM_LEAD_ACTIVE');
    const rename = await patch(lead.id, { full_name: 'Trưởng nhóm' });
    expect(rename.statusCode, rename.body).toBe(200);
    const remove = await app.inject({ method: 'DELETE', url: `/api/v2/users/${lead.id}`, headers });
    expect(remove.statusCode).toBe(422);
    expect(errorCode(remove.body)).toBe('TEAM_LEAD_ACTIVE');

    const bulk = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v2/admin/users/bulk', headers, payload });
    const bulkAssign = await bulk({ user_ids: [member.id], op: 'set_role', value: 'team_lead' });
    expect(bulkAssign.statusCode).toBe(422);
    expect(errorCode(bulkAssign.body)).toBe('ROLE_NOT_ASSIGNABLE');
    const bulkDelete = await bulk({ user_ids: [member.id, lead.id], op: 'soft_delete' });
    expect(bulkDelete.statusCode).toBe(422);
    expect((bulkDelete.json() as ErrorBody).error).toMatchObject({
      code: 'TEAM_LEAD_ACTIVE',
      details: [{ user_id: lead.id }],
    });
    const bulkDemote = await bulk({
      user_ids: [member.id, lead.id],
      op: 'set_role',
      value: 'user',
    });
    expect(errorCode(bulkDemote.body)).toBe('ROLE_NOT_ASSIGNABLE');
    const untouched = await stack.query<{ id: string; role: string; status: string }>(
      'select id, role, status from users where id = any($1::uuid[]) order by id',
      [[member.id, lead.id]],
    );
    expect(untouched.find((row) => row.id === lead.id)).toMatchObject({
      role: 'team_lead',
      status: 'active',
    });
    expect(untouched.find((row) => row.id === member.id)?.status).toBe('active');

    const leadOnAdmin = await app.inject({
      method: 'GET',
      url: '/api/v2/admin/metrics/overview',
      headers: authHeader(lead.accessToken),
    });
    expect(leadOnAdmin.statusCode).toBe(403);
    const leadOnUsers = await app.inject({
      method: 'GET',
      url: '/api/v2/users',
      headers: authHeader(lead.accessToken),
    });
    expect(leadOnUsers.statusCode).toBe(403);
  });

  it('lists, sorts, searches and exports usernames, and audits with actor_role', async () => {
    const headers = authHeader(adminToken);
    const user = await registerAndLogin(app, 'tl-listing');
    const search = await app.inject({
      method: 'GET',
      url: `/api/v2/users?search=${encodeURIComponent(user.username)}&sort_by=username&sort_order=asc`,
      headers,
    });
    expect(search.statusCode, search.body).toBe(200);
    expect((search.json() as { items: Array<Record<string, unknown>> }).items).toEqual([
      expect.objectContaining({ id: user.id, username: user.username }),
    ]);
    const csv = await app.inject({
      method: 'GET',
      url: `/api/v2/admin/users/export?search=${encodeURIComponent(user.username)}`,
      headers,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.split('\r\n')[0]).toContain('email,username,full_name');
    expect(csv.body).toContain(user.username);

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/v2/users/${user.id}`,
      headers,
      payload: { full_name: 'Đã sửa' },
    });
    expect(rename.statusCode).toBe(200);
    const audit = await stack.query<{ actor_role: string }>(
      `select actor_role from admin_audit_log where action = 'user.update' and target_id = $1`,
      [user.id],
    );
    expect(audit).toEqual([{ actor_role: 'admin' }]);
    const auditApi = await app.inject({
      method: 'GET',
      url: `/api/v2/admin/audit?actor_role=admin&target_id=${user.id}`,
      headers,
    });
    expect(auditApi.statusCode, auditApi.body).toBe(200);
    expect((auditApi.json() as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
      actor_role: 'admin',
      action: 'user.update',
    });
  });

  it('never rewrites a team_lead role when grants start or end (§1.1 rule 1)', async () => {
    const headers = authHeader(adminToken);
    const lead = await makeTeamLead('tl-billing-lead');
    const plans = await stack.query<{ id: string }>(
      "select id from premium_plans where code = 'MONTHLY'",
    );
    const grant = await app.inject({
      method: 'POST',
      url: `/api/v2/premium/admin/users/${lead.id}/grant`,
      headers,
      payload: { plan_id: plans[0]?.id, note: 'team lead premium' },
    });
    expect([200, 201]).toContain(grant.statusCode);
    const roleAfterGrant = await stack.query<{ role: string }>(
      'select role from users where id = $1',
      [lead.id],
    );
    expect(roleAfterGrant[0]?.role).toBe('team_lead');
    // Premium for a team lead comes from the grant alone (PremiumGuard reads grants).
    const entitlement = await app.inject({
      method: 'GET',
      url: '/api/v2/premium/me',
      headers: authHeader(lead.accessToken),
    });
    expect(entitlement.statusCode, entitlement.body).toBe(200);
    expect(entitlement.json()).toMatchObject({ is_premium: true });

    const subscriptions = await stack.query<{ id: string }>(
      'select id from premium_subscriptions where user_id = $1',
      [lead.id],
    );
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v2/admin/subscriptions/${subscriptions[0]?.id}/cancel`,
      headers,
      payload: { reason: 'team lead cancel regression' },
    });
    expect(cancel.statusCode, cancel.body).toBe(200);
    const roleAfterCancel = await stack.query<{ role: string }>(
      'select role from users where id = $1',
      [lead.id],
    );
    expect(roleAfterCancel[0]?.role).toBe('team_lead');
  });

  it('stores policies append-only with an offer version that ignores commission-only edits (D3)', async () => {
    const lead = await makeTeamLead('tl-policy-lead');
    const member = await registerAndLogin(app, 'tl-policy-member');
    const insertPolicy = (pct: number, type: string, days: number | null) =>
      stack.query<{ id: string; offer_version_id: string }>(
        `insert into team_lead_policies (lead_user_id, commission_pct, offer_type, offer_days, reason)
         values ($1, $2, $3, $4, 'system test') returning id, offer_version_id`,
        [lead.id, pct, type, days],
      );
    const [first] = await insertPolicy(10, 'days', 30);
    const [commissionOnly] = await insertPolicy(25, 'days', 30);
    const [longer] = await insertPolicy(25, 'days', 90);
    expect(commissionOnly?.offer_version_id).toBe(first?.offer_version_id);
    expect(longer?.offer_version_id).not.toBe(first?.offer_version_id);
    await expect(
      stack.query('update team_lead_policies set commission_pct = 1 where id = $1', [first?.id]),
    ).rejects.toThrow(/append-only/);
    await expect(insertPolicy(10, 'days', null)).rejects.toThrow();
    await expect(insertPolicy(101, 'none', null)).rejects.toThrow();

    const plan = await stack.query<{ id: string }>(
      "select id from premium_plans where code = 'REFERRAL_OFFER' and is_active = false",
    );
    expect(plan).toHaveLength(1);
    const offerGrant = (policyId: string | undefined, versionId: string | undefined) =>
      stack.query(
        `insert into billing_entitlement_grants
           (user_id, plan_id, kind, duration_days, starts_at, ends_at, original_ends_at,
            team_lead_policy_id, team_lead_offer_version_id)
         values ($1, $2, 'referral_offer', 30, now(), now() + interval '30 days',
                 now() + interval '30 days', $3, $4)`,
        [member.id, plan[0]?.id, policyId, versionId],
      );
    await offerGrant(first?.id, first?.offer_version_id);
    await expect(offerGrant(commissionOnly?.id, commissionOnly?.offer_version_id)).rejects.toThrow(
      /uq_billing_entitlement_grants_referral_offer/,
    );
    await offerGrant(longer?.id, longer?.offer_version_id);
    await expect(
      stack.query(
        `insert into billing_entitlement_grants
           (user_id, plan_id, kind, duration_days, starts_at, ends_at, original_ends_at)
         values ($1, $2, 'referral_offer', 30, now(), now(), now())`,
        [member.id, plan[0]?.id],
      ),
    ).rejects.toThrow(/ck_billing_entitlement_grants_referral_offer/);

    await expect(
      stack.query("update users set group_lead_id = $1, group_join_via = 'code' where id = $2", [
        lead.id,
        member.id,
      ]),
    ).rejects.toThrow(/ck_users_group_membership/);
    await stack.query(
      "update users set group_lead_id = $1, group_join_via = 'admin', group_joined_at = now() where id = $2",
      [lead.id, member.id],
    );
    await expect(
      stack.query(
        `insert into referral_commission_ledger
           (order_id, beneficiary_user_id, commission_type, amount_vnd, source_amount_vnd)
         values (gen_random_uuid(), $1, 'team_lead_direct', 1, 1)`,
        [lead.id],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('backfills usernames deterministically and reserves legacy code shapes (D1)', async () => {
    const seeds = await stack.query<Record<string, string>>(
      `select iqx_username_seed('Ab@x.test') as short,
              iqx_username_seed('Nguyễn.Văn-A+tag@x.test') as accented,
              iqx_username_seed('+++@x.test') as empty,
              iqx_username_seed('LS_0123456789@x.test') as legacy,
              iqx_username_seed(repeat('a', 40) || '@x.test') as long`,
    );
    expect(seeds[0]).toEqual({
      short: 'ab00',
      accented: 'nguyn.vnatag',
      empty: 'user',
      legacy: 'ls.0123456789',
      long: 'a'.repeat(30),
    });
    await expect(
      stack.query("update users set username = 'ctv_0123456789' where id = $1", [adminId]),
    ).rejects.toThrow(/ck_users_username_format/);
    await expect(
      stack.query("update users set username = 'Upper.Case' where id = $1", [adminId]),
    ).rejects.toThrow(/ck_users_username_format/);
    const nulls = await stack.query<{ total: number }>(
      'select count(*)::int as total from users where username is null',
    );
    expect(nulls[0]?.total).toBe(0);
  });
});

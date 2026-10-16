import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 §3.2 / §3.4 / §4.2: admin/team-leads. Acceptance §7.3 (revoke ends the
// lead's sessions and the code), §7.5 (move = 2 history rows + 1 audit, removal keeps grants)
// and §7.7 (one admin_audit_log row per action, with the right actor_role).
const PASSWORD = 'System!Passw0rd';
const BASE = '/api/v2/admin/team-leads';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type ErrorBody = { error: { code: string } };
type Detail = {
  user: { id: string; username: string; role: string };
  code: string;
  status: string;
  accepting_new_users: boolean;
  policy: {
    id: string;
    commission_pct: number;
    offer_type: string;
    offer_days: number | null;
    offer_version_id: string;
  } | null;
  metrics: {
    member_count: number;
    revenue_30d_vnd: number;
    commission_30d_vnd: number;
    active_free_premium_count: number;
  };
  history: Array<{
    action: string;
    actor_role: string;
    actor: { id: string } | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string | null;
  }>;
};

describe('system acceptance: admin team leads', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let admin: Session;
  let adminHeaders: { authorization: string };

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    admin = await registerAndLogin(app, 'tl-admin');
    await stack.query("update users set role = 'admin' where id = $1", [admin.id]);
    adminHeaders = authHeader(admin.accessToken);
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: Record<string, unknown>,
    headers: { authorization: string } = adminHeaders,
  ) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

  const appoint = (
    userId: string,
    policy: Record<string, unknown> = { commission_pct: 20, offer_type: 'none' },
  ) => call('POST', BASE, { user_id: userId, reason: 'Bổ nhiệm thử', ...policy });

  const addMember = (leadId: string, userId: string, reason = 'Thêm thử') =>
    call('POST', `${BASE}/${leadId}/members`, { user_id: userId, reason });

  const removeMember = (leadId: string, userId: string) =>
    call('POST', `${BASE}/${leadId}/members/${userId}/remove`, { reason: 'Loại thử' });

  const auditRows = (action: string, targetId: string) =>
    stack.query<{
      action: string;
      actor_role: string;
      admin_user_id: string | null;
      target_entity: string;
      payload_before: Record<string, unknown> | null;
      payload_after: Record<string, unknown> | null;
      note: string | null;
    }>(
      `select action, actor_role, admin_user_id, target_entity, payload_before, payload_after, note
         from admin_audit_log where action = $1 and target_id = $2 order by created_at`,
      [action, targetId],
    );

  const historyOf = (userId: string) =>
    stack.query<{ action: string; lead_user_id: string; actor_role: string; reason: string }>(
      `select action, lead_user_id, actor_role, reason from group_membership_history
        where user_id = $1 order by created_at, action desc`,
      [userId],
    );

  const offerGrantsOf = (userId: string) =>
    stack.query<{ id: string; status: string; team_lead_offer_version_id: string }>(
      `select id, status, team_lead_offer_version_id from billing_entitlement_grants
        where user_id = $1 and kind = 'referral_offer' order by created_at`,
      [userId],
    );

  const checkCode = async (code: string) =>
    (
      await app.inject({
        method: 'GET',
        url: `/api/v2/auth/referral-codes/${encodeURIComponent(code)}`,
      })
    ).json() as { valid: boolean };

  it('appoints, validates eligibility and exposes list, detail and lookup (§3.2, §4.2)', async () => {
    const candidate = await registerAndLogin(app, 'tl-appoint');
    const missingReason = await call('POST', BASE, {
      user_id: candidate.id,
      commission_pct: 10,
      offer_type: 'none',
    });
    expect(missingReason.statusCode).toBe(422);
    expect((missingReason.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    for (const policy of [
      { commission_pct: 10, offer_type: 'days' },
      { commission_pct: 10, offer_type: 'none', offer_days: 30 },
      { commission_pct: 10, offer_type: 'days', offer_days: 15 },
      { commission_pct: 101, offer_type: 'none' },
      { commission_pct: 12.5, offer_type: 'none' },
    ]) {
      expect((await appoint(candidate.id, policy)).statusCode).toBe(422);
    }
    expect((await appoint(admin.id)).json()).toMatchObject({
      error: { code: 'USER_NOT_ELIGIBLE' },
    });
    const missing = await appoint('00000000-0000-4000-8000-000000000123');
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as ErrorBody).error.code).toBe('USER_NOT_FOUND');

    const suspended = await registerAndLogin(app, 'tl-suspended');
    await stack.query("update users set status = 'suspended' where id = $1", [suspended.id]);
    const notActive = await appoint(suspended.id);
    expect(notActive.statusCode).toBe(422);
    expect((notActive.json() as ErrorBody).error.code).toBe('USER_NOT_ELIGIBLE');

    const created = await appoint(candidate.id, {
      commission_pct: 25,
      offer_type: 'days',
      offer_days: 30,
    });
    expect(created.statusCode, created.body).toBe(201);
    const detail = created.json() as Detail;
    expect(detail).toMatchObject({
      user: { id: candidate.id, username: candidate.username, role: 'team_lead' },
      code: candidate.username,
      status: 'active',
      accepting_new_users: true,
      policy: { commission_pct: 25, offer_type: 'days', offer_days: 30 },
      metrics: {
        member_count: 0,
        revenue_30d_vnd: 0,
        commission_30d_vnd: 0,
        active_free_premium_count: 0,
      },
    });
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({
      action: 'team_lead.appoint',
      actor_role: 'admin',
      actor: { id: admin.id },
      reason: 'Bổ nhiệm thử',
    });
    const [locked] = await stack.query<{ username_change_allowed: boolean; role: string }>(
      'select username_change_allowed, role from users where id = $1',
      [candidate.id],
    );
    expect(locked).toEqual({ username_change_allowed: false, role: 'team_lead' });
    // The code works at once (§3.2).
    expect(await checkCode(candidate.username.toUpperCase())).toMatchObject({ valid: true });

    const again = await appoint(candidate.id);
    expect(again.statusCode).toBe(409);
    expect((again.json() as ErrorBody).error.code).toBe('TEAM_LEAD_EXISTS');

    const list = await call('GET', `${BASE}?status=active&search=${candidate.username}`);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      items: [
        {
          user: { id: candidate.id },
          code: candidate.username,
          status: 'active',
          member_count: 0,
          commission_pct: 25,
          offer_type: 'days',
          offer_days: 30,
          revenue_30d_vnd: 0,
          commission_30d_vnd: 0,
        },
      ],
    });
    const revokedList = await call('GET', `${BASE}?status=revoked&search=${candidate.username}`);
    expect(revokedList.json()).toMatchObject({ total: 0, items: [] });

    const lookupLead = await call('GET', `${BASE}/lookup?q=${candidate.email.toUpperCase()}`);
    expect(lookupLead.statusCode).toBe(200);
    expect(lookupLead.json()).toMatchObject({
      user: { id: candidate.id },
      team_lead: { status: 'active' },
      appoint: { eligible: false, reason: 'TEAM_LEAD_EXISTS' },
      add_member: { eligible: false, reason: 'TARGET_IS_TEAM_LEAD' },
    });
    const plain = await registerAndLogin(app, 'tl-lookup');
    expect((await call('GET', `${BASE}/lookup?q=${plain.username}`)).json()).toMatchObject({
      user: { id: plain.id },
      team_lead: null,
      group: null,
      appoint: { eligible: true, reason: null },
      add_member: { eligible: true, action: 'add' },
    });
    expect((await call('GET', `${BASE}/lookup?q=no.such.user`)).statusCode).toBe(404);

    expect((await call('GET', `${BASE}/00000000-0000-4000-8000-000000000123`)).statusCode).toBe(
      404,
    );
    expect((await call('GET', `${BASE}/not-a-uuid`)).statusCode).toBe(422);
  });

  it('records policy edits with before/after and refuses no-op edits (§3.2, §3.5)', async () => {
    const lead = await registerAndLogin(app, 'tl-policy');
    expect((await appoint(lead.id, { commission_pct: 10, offer_type: 'none' })).statusCode).toBe(
      201,
    );
    const unchanged = await call('PUT', `${BASE}/${lead.id}/policy`, {
      commission_pct: 10,
      offer_type: 'none',
      reason: 'Không đổi',
    });
    expect(unchanged.statusCode).toBe(422);
    expect((unchanged.json() as ErrorBody).error.code).toBe('POLICY_UNCHANGED');
    const noReason = await call('PUT', `${BASE}/${lead.id}/policy`, {
      commission_pct: 15,
      offer_type: 'none',
    });
    expect(noReason.statusCode).toBe(422);

    const updated = await call('PUT', `${BASE}/${lead.id}/policy`, {
      commission_pct: 15,
      offer_type: 'lifetime',
      reason: 'Tăng hoa hồng',
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((updated.json() as Detail).policy).toMatchObject({
      commission_pct: 15,
      offer_type: 'lifetime',
      offer_days: null,
    });
    const policies = await stack.query(
      'select commission_pct from team_lead_policies where lead_user_id = $1 order by effective_from',
      [lead.id],
    );
    expect(policies).toEqual([{ commission_pct: 10 }, { commission_pct: 15 }]);
    const audit = await auditRows('team_lead.policy_update', lead.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_role: 'admin',
      admin_user_id: admin.id,
      target_entity: 'team_lead',
      note: 'Tăng hoa hồng',
      payload_before: { commission_pct: 10, offer_type: 'none', offer_days: null },
      payload_after: { commission_pct: 15, offer_type: 'lifetime', offer_days: null },
    });
  });

  it('revokes: sessions end, the code stops, the role is recomputed (§3.2, §7.3)', async () => {
    const lead = await registerAndLogin(app, 'tl-revoke');
    expect((await appoint(lead.id)).statusCode).toBe(201);
    const member = await registerAndLogin(app, 'tl-revoke-member');
    expect((await addMember(lead.id, member.id)).statusCode).toBe(201);
    // Fresh session after the role change.
    const session = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: lead.username, password: PASSWORD },
    });
    const tokens = session.json() as { access_token: string; refresh_token: string };
    expect(
      (await call('GET', '/api/v2/users/me', undefined, authHeader(tokens.access_token))).json(),
    ).toMatchObject({ role: 'team_lead' });

    const noReason = await call('POST', `${BASE}/${lead.id}/revoke`, {});
    expect(noReason.statusCode).toBe(422);
    const revoked = await call('POST', `${BASE}/${lead.id}/revoke`, { reason: 'Thôi hợp tác' });
    expect(revoked.statusCode, revoked.body).toBe(200);
    // The registration trial still covers now, so the role falls back to premium.
    expect(revoked.json()).toMatchObject({
      status: 'revoked',
      accepting_new_users: false,
      user: { role: 'premium' },
      metrics: { member_count: 1 },
    });

    const live = await stack.query(
      'select id from refresh_tokens where user_id = $1 and revoked = false',
      [lead.id],
    );
    expect(live).toHaveLength(0);
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/refresh',
      payload: { refresh_token: tokens.refresh_token },
    });
    expect(refresh.statusCode).toBe(401);
    expect(
      (await call('GET', '/api/v2/users/me', undefined, authHeader(tokens.access_token)))
        .statusCode,
    ).toBe(401);

    expect(await checkCode(lead.username)).toMatchObject({ valid: false });
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      payload: {
        ...testIdentity('tl-after-revoke'),
        password: PASSWORD,
        full_name: 'After revoke',
        referral_code: lead.username,
      },
    });
    expect(signup.statusCode).toBe(422);
    expect((signup.json() as ErrorBody).error.code).toBe('REFERRAL_CODE_INVALID');

    // Members keep their group after a revoke (§3.2).
    const [kept] = await stack.query<{ group_lead_id: string }>(
      'select group_lead_id from users where id = $1',
      [member.id],
    );
    expect(kept?.group_lead_id).toBe(lead.id);

    const twice = await call('POST', `${BASE}/${lead.id}/revoke`, { reason: 'Lần hai' });
    expect(twice.statusCode).toBe(409);
    expect((twice.json() as ErrorBody).error.code).toBe('TEAM_LEAD_NOT_ACTIVE');
    const policy = await call('PUT', `${BASE}/${lead.id}/policy`, {
      commission_pct: 30,
      offer_type: 'none',
      reason: 'Sau thôi',
    });
    expect(policy.statusCode).toBe(409);
    expect((policy.json() as ErrorBody).error.code).toBe('TEAM_LEAD_NOT_ACTIVE');
    const add = await addMember(lead.id, (await registerAndLogin(app, 'tl-late')).id);
    expect(add.statusCode).toBe(409);
    expect((add.json() as ErrorBody).error.code).toBe('TEAM_LEAD_NOT_ACTIVE');

    // Without any grant covering now, the role falls back to user.
    const bare = await registerAndLogin(app, 'tl-revoke-bare');
    expect((await appoint(bare.id)).statusCode).toBe(201);
    await stack.query(
      `update billing_entitlement_grants set starts_at = now() - interval '10 days',
              ends_at = now() - interval '1 day' where user_id = $1`,
      [bare.id],
    );
    const bareRevoked = await call('POST', `${BASE}/${bare.id}/revoke`, { reason: 'Hết hạn' });
    expect(bareRevoked.json()).toMatchObject({ user: { role: 'user' } });

    // A revoked lead can be re-appointed on the same profile; the code works again.
    const again = await appoint(lead.id, { commission_pct: 5, offer_type: 'none' });
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json()).toMatchObject({ status: 'active', metrics: { member_count: 1 } });
    expect(await checkCode(lead.username)).toMatchObject({ valid: true });
  });

  it('adds, moves and removes members with history, offers and guards (§3.4, §7.5)', async () => {
    const leadA = await registerAndLogin(app, 'tl-group-a');
    const leadB = await registerAndLogin(app, 'tl-group-b');
    expect(
      (await appoint(leadA.id, { commission_pct: 10, offer_type: 'days', offer_days: 7 }))
        .statusCode,
    ).toBe(201);
    expect((await appoint(leadB.id, { commission_pct: 40, offer_type: 'none' })).statusCode).toBe(
      201,
    );
    const member = await registerAndLogin(app, 'tl-member');
    // End the registration trial so the offer granted on add covers now.
    await stack.query(
      `update billing_entitlement_grants set starts_at = now() - interval '8 days',
              ends_at = now() - interval '1 day' where user_id = $1`,
      [member.id],
    );

    const noReason = await call('POST', `${BASE}/${leadA.id}/members`, { user_id: member.id });
    expect(noReason.statusCode).toBe(422);

    const added = await addMember(leadA.id, member.id);
    expect(added.statusCode, added.body).toBe(201);
    expect(added.json()).toMatchObject({
      action: 'add',
      lead_user_id: leadA.id,
      previous_lead_user_id: null,
      member: { id: member.id, group_join_via: 'admin', role: 'premium' },
      offer_grant: { offer_type: 'days', offer_days: 7 },
    });
    expect(await historyOf(member.id)).toEqual([
      { action: 'add_admin', lead_user_id: leadA.id, actor_role: 'admin', reason: 'Thêm thử' },
    ]);
    const grantsAfterAdd = await offerGrantsOf(member.id);
    expect(grantsAfterAdd).toHaveLength(1);

    const duplicate = await addMember(leadA.id, member.id);
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as ErrorBody).error.code).toBe('ALREADY_IN_GROUP');
    const leadTarget = await addMember(leadA.id, leadB.id);
    expect(leadTarget.statusCode).toBe(422);
    expect((leadTarget.json() as ErrorBody).error.code).toBe('TARGET_IS_TEAM_LEAD');
    const self = await addMember(leadA.id, leadA.id);
    expect((self.json() as ErrorBody).error.code).toBe('TARGET_IS_TEAM_LEAD');
    const adminTarget = await addMember(leadA.id, admin.id);
    expect(adminTarget.statusCode).toBe(422);
    expect((adminTarget.json() as ErrorBody).error.code).toBe('USER_NOT_ELIGIBLE');
    expect((await addMember('00000000-0000-4000-8000-000000000123', member.id)).statusCode).toBe(
      404,
    );

    const lookup = await call('GET', `${BASE}/lookup?q=${member.email}&lead_id=${leadA.id}`);
    expect(lookup.json()).toMatchObject({
      group: { lead_user_id: leadA.id, lead_username: leadA.username, join_via: 'admin' },
      add_member: { eligible: false, reason: 'ALREADY_IN_GROUP' },
    });
    expect(
      (await call('GET', `${BASE}/lookup?q=${member.email}&lead_id=${leadB.id}`)).json(),
    ).toMatchObject({ add_member: { eligible: true, action: 'move' } });

    // §7.5: a move writes exactly move_out + move_in and one group.member_move audit row.
    const moved = await addMember(leadB.id, member.id, 'Chuyển nhóm');
    expect(moved.statusCode, moved.body).toBe(201);
    expect(moved.json()).toMatchObject({
      action: 'move',
      lead_user_id: leadB.id,
      previous_lead_user_id: leadA.id,
      offer_grant: null,
    });
    const history = await historyOf(member.id);
    expect(history.slice(1)).toEqual([
      { action: 'move_out', lead_user_id: leadA.id, actor_role: 'admin', reason: 'Chuyển nhóm' },
      { action: 'move_in', lead_user_id: leadB.id, actor_role: 'admin', reason: 'Chuyển nhóm' },
    ]);
    const moveAudit = await auditRows('group.member_move', leadB.id);
    expect(moveAudit).toHaveLength(1);
    expect(moveAudit[0]).toMatchObject({
      actor_role: 'admin',
      admin_user_id: admin.id,
      target_entity: 'team_lead',
      note: 'Chuyển nhóm',
      payload_before: { member_user_id: member.id, group_lead_id: leadA.id },
      payload_after: { member_user_id: member.id, group_lead_id: leadB.id },
    });

    const membersA = await call('GET', `${BASE}/${leadA.id}/members`);
    expect(membersA.json()).toMatchObject({ total: 0, items: [] });
    const membersB = await call('GET', `${BASE}/${leadB.id}/members?search=${member.username}`);
    expect(membersB.json()).toMatchObject({
      total: 1,
      items: [{ id: member.id, username: member.username, group_join_via: 'admin' }],
    });

    // §7.5 / DECISION 4: removal keeps every grant already received.
    expect((await removeMember(leadA.id, member.id)).statusCode).toBe(404);
    const removed = await removeMember(leadB.id, member.id);
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({ lead_user_id: leadB.id, user_id: member.id });
    const again = await removeMember(leadB.id, member.id);
    expect(again.statusCode).toBe(404);
    expect((again.json() as ErrorBody).error.code).toBe('NOT_IN_GROUP');
    const [afterRemove] = await stack.query<{
      group_lead_id: string | null;
      group_join_via: string | null;
      role: string;
    }>('select group_lead_id, group_join_via, role from users where id = $1', [member.id]);
    expect(afterRemove).toEqual({ group_lead_id: null, group_join_via: null, role: 'premium' });
    const grantsAfterRemove = await offerGrantsOf(member.id);
    expect(grantsAfterRemove).toEqual(
      grantsAfterAdd.map((grant) => ({ ...grant, status: 'active' })),
    );
    expect((await historyOf(member.id)).at(-1)).toMatchObject({
      action: 'remove',
      lead_user_id: leadB.id,
    });

    // DECISION 3: re-joining A after a commission-only edit grants nothing new; changing the
    // offer itself makes a new offer version, granted once on the next add.
    expect(
      (
        await call('PUT', `${BASE}/${leadA.id}/policy`, {
          commission_pct: 12,
          offer_type: 'days',
          offer_days: 7,
          reason: 'Chỉ đổi hoa hồng',
        })
      ).statusCode,
    ).toBe(200);
    const rejoin = await addMember(leadA.id, member.id);
    expect(rejoin.json()).toMatchObject({ action: 'add', offer_grant: null });
    expect(await offerGrantsOf(member.id)).toHaveLength(1);
    expect((await removeMember(leadA.id, member.id)).statusCode).toBe(200);
    expect(
      (
        await call('PUT', `${BASE}/${leadA.id}/policy`, {
          commission_pct: 12,
          offer_type: 'days',
          offer_days: 30,
          reason: 'Đổi ưu đãi',
        })
      ).statusCode,
    ).toBe(200);
    const newOffer = await addMember(leadA.id, member.id);
    expect(newOffer.json()).toMatchObject({ offer_grant: { offer_type: 'days', offer_days: 30 } });
    expect(await offerGrantsOf(member.id)).toHaveLength(2);

    const detailA = (await call('GET', `${BASE}/${leadA.id}`)).json() as Detail;
    expect(detailA.metrics).toMatchObject({ member_count: 1, active_free_premium_count: 1 });
    expect(detailA.history.map((entry) => entry.action)).toEqual([
      'group.member_add',
      'team_lead.policy_update',
      'group.member_remove',
      'group.member_add',
      'team_lead.policy_update',
      'group.member_add',
      'team_lead.appoint',
    ]);
  });

  it('moves an appointee out of its group and audits every action once (§3.1, §7.7)', async () => {
    const leadA = await registerAndLogin(app, 'tl-audit-a');
    expect((await appoint(leadA.id)).statusCode).toBe(201);
    const promoted = await registerAndLogin(app, 'tl-audit-promoted');
    expect((await addMember(leadA.id, promoted.id)).statusCode).toBe(201);

    const appointed = await appoint(promoted.id);
    expect(appointed.statusCode, appointed.body).toBe(201);
    const [group] = await stack.query<{ group_lead_id: string | null }>(
      'select group_lead_id from users where id = $1',
      [promoted.id],
    );
    expect(group?.group_lead_id).toBeNull();
    expect((await historyOf(promoted.id)).map((row) => row.action)).toEqual([
      'add_admin',
      'move_out',
    ]);

    const member = await registerAndLogin(app, 'tl-audit-member');
    expect((await addMember(promoted.id, member.id)).statusCode).toBe(201);
    expect(
      (
        await call('PUT', `${BASE}/${promoted.id}/policy`, {
          commission_pct: 33,
          offer_type: 'none',
          reason: 'Đổi',
        })
      ).statusCode,
    ).toBe(200);
    expect((await removeMember(promoted.id, member.id)).statusCode).toBe(200);
    expect(
      (await call('POST', `${BASE}/${promoted.id}/revoke`, { reason: 'Thôi' })).statusCode,
    ).toBe(200);

    for (const action of [
      'team_lead.appoint',
      'team_lead.policy_update',
      'team_lead.revoke',
      'group.member_add',
      'group.member_remove',
    ]) {
      const rows = await auditRows(action, promoted.id);
      expect(rows, action).toHaveLength(1);
      expect(rows[0], action).toMatchObject({
        actor_role: 'admin',
        admin_user_id: admin.id,
        target_entity: 'team_lead',
      });
    }
    const [appointAudit] = await auditRows('team_lead.appoint', promoted.id);
    expect(appointAudit?.payload_before).toMatchObject({ group_lead_id: leadA.id });
    // No legacy enrollment action is written by the new flows.
    const legacy = await stack.query(
      "select id from admin_audit_log where action = 'referral.enroll' and admin_user_id = $1",
      [admin.id],
    );
    expect(legacy).toHaveLength(0);
  });

  it('keeps admin/team-leads admin-only and drops the legacy enrollment routes', async () => {
    const lead = await registerAndLogin(app, 'tl-guard');
    expect((await appoint(lead.id)).statusCode).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: lead.email, password: PASSWORD },
    });
    const leadHeaders = authHeader((login.json() as { access_token: string }).access_token);
    for (const [method, url] of [
      ['GET', BASE],
      ['GET', `${BASE}/${lead.id}`],
      ['GET', `${BASE}/${lead.id}/members`],
      ['GET', `${BASE}/lookup?q=${lead.username}`],
    ] as const) {
      const response = await call(method, url, undefined, leadHeaders);
      expect(response.statusCode, url).toBe(403);
    }
    const plain = await registerAndLogin(app, 'tl-guard-plain');
    expect((await call('GET', BASE, undefined, authHeader(plain.accessToken))).statusCode).toBe(
      403,
    );
    expect(
      (
        await call(
          'POST',
          `${BASE}/${lead.id}/members`,
          { user_id: plain.id, reason: 'x' },
          leadHeaders,
        )
      ).statusCode,
    ).toBe(403);

    expect((await call('GET', `/api/v2/admin/referrals/${plain.id}`)).statusCode).toBe(404);
    expect(
      (await call('POST', `/api/v2/admin/referrals/${plain.id}/enroll`, { kind: 'lead_sale' }))
        .statusCode,
    ).toBe(404);
  });
});

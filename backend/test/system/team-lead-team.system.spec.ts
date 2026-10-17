import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { loadAcademyContent } from '../../src/modules/academy/academy.content.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Admin spec v1.1 §4.3 `team/*`: the team lead's own area. Acceptance §7.2 (a team lead gets
// 403 on every admin route, 404 for users outside its group, and no parameter reaches another
// group) and §7.6 (results are percentages only, "Chưa kích hoạt" is `activated: false`, the
// Academy tab lists only published chapters), plus the §6 group metrics.
const PASSWORD = 'System!Passw0rd';
const TEAM = '/api/v2/team';
const ADMIN_TEAM_LEADS = '/api/v2/admin/team-leads';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type ErrorBody = { error: { code: string } };
type TeamUser = {
  id: string;
  username: string;
  role: string;
  demo_trading: { activated: boolean; pnl_pct: number | null };
  bot: { activated: boolean; pnl_pct: number | null; as_of: string | null };
  academy: {
    started: boolean;
    completed: number;
    total: number;
    all_done: boolean;
    current_lesson: { lesson_id: string; label: string } | null;
  };
};
type TeamPage = { items: TeamUser[]; total: number; page: number; total_pages: number };
type AcademyLesson = {
  lesson_id: string;
  status: string;
  attempts: number;
  latest_score: number | null;
  max_score: number | null;
  completed_at: string | null;
  is_current: boolean;
};
type User360 = Record<string, unknown> & {
  group: { lead_user_id: string; code: string; join_via: string } | null;
  demo_trading: Record<string, unknown>;
  bot: Record<string, unknown>;
  academy: {
    total: number;
    completed: number;
    current_lesson: { lesson_id: string } | null;
    chapter_exams: { total: number; passed: number };
    chapters: Array<{ no: number; total: number; completed: number; lessons: AcademyLesson[] }>;
  };
};

/** Every key of a JSON value, recursively. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item)]);
}

describe('system acceptance: team lead area (team/*)', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let admin: Session;
  let lead: Session;
  let otherLead: Session;
  let active: Session; // joined by code, Demo + Bot activated, some Academy progress
  let idle: Session; // added by the admin, nothing activated
  let outsider: Session; // in no group
  let otherMember: Session; // in the other lead's group
  let planId: string;

  const adminCall = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      headers: authHeader(admin.accessToken),
      ...(payload ? { payload } : {}),
    });

  const as = (session: Session, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: authHeader(session.accessToken),
      ...(payload ? { payload: payload as Record<string, unknown> } : {}),
    });

  async function appoint(session: Session, commission = 20): Promise<void> {
    const appointed = await adminCall('POST', ADMIN_TEAM_LEADS, {
      user_id: session.id,
      commission_pct: commission,
      offer_type: 'none',
      reason: 'Bổ nhiệm thử',
    });
    expect(appointed.statusCode, appointed.body).toBe(201);
  }

  async function joinByCode(code: string, suffix: string): Promise<Session> {
    const identity = testIdentity(suffix);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      payload: {
        ...identity,
        password: PASSWORD,
        full_name: `Member ${suffix}`,
        referral_code: code,
      },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: identity.username, password: PASSWORD },
    });
    expect(login.statusCode, login.body).toBe(200);
    const tokens = login.json() as { access_token: string; refresh_token: string };
    return {
      id: (registered.json() as { id: string }).id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      email: identity.email,
      username: identity.username,
    };
  }

  beforeAll(async () => {
    stack = await startSystemStack();
    app = stack.app;
    admin = await registerAndLogin(app, 'team-admin');
    await stack.query("update users set role = 'admin' where id = $1", [admin.id]);
    lead = await registerAndLogin(app, 'team-lead');
    otherLead = await registerAndLogin(app, 'team-lead-b');
    await appoint(lead, 20);
    await appoint(otherLead, 10);
    active = await joinByCode(lead.username, 'team-active');
    idle = await registerAndLogin(app, 'team-idle');
    const added = await adminCall('POST', `${ADMIN_TEAM_LEADS}/${lead.id}/members`, {
      user_id: idle.id,
      reason: 'Thêm thử',
    });
    expect(added.statusCode, added.body).toBe(201);
    outsider = await registerAndLogin(app, 'team-outsider');
    otherMember = await joinByCode(otherLead.username, 'team-other');
    const [plan] = await stack.query<{ id: string }>(
      "select id from premium_plans where code = 'MONTHLY'",
    );
    planId = plan?.id ?? '';

    // Demo Trading: 100,000,000 initial, 90,000,000 cash + 1,000 VCB at the stored 12,000 price
    // (+2%), and one simulated order today. Bot: latest complete NAV 95,000,000 (-5%).
    const [account] = await stack.query<{ id: string }>(
      `insert into virtual_trading_accounts
         (user_id, initial_cash_vnd, cash_available_vnd, activated_at)
       values ($1, 100000000, 90000000, now()) returning id`,
      [active.id],
    );
    await stack.query("update symbols set current_price_vnd = 12000 where symbol = 'VCB'");
    await stack.query(
      `insert into virtual_positions (account_id, symbol, quantity_total, quantity_sellable, avg_cost_vnd)
       values ($1, 'VCB', 1000, 1000, 10000)`,
      [account?.id],
    );
    await stack.query(
      `insert into virtual_orders (account_id, user_id, symbol, side, order_type, status, quantity, trading_date)
       values ($1, $2, 'VCB', 'buy', 'market', 'cancelled', 100, current_date)`,
      [account?.id, active.id],
    );
    const [bot] = await stack.query<{ id: string }>(
      `insert into bot_accounts (user_id, initial_cash_vnd, cash_vnd, activated_at)
       values ($1, 100000000, 100000000, now()) returning id`,
      [active.id],
    );
    await stack.query(
      `insert into bot_nav_daily
         (bot_account_id, trading_date, cash_vnd, market_value_vnd, nav_vnd, valuation_complete, created_at)
       values ($1, current_date - 2, 50000000, 45000000, 95000000, true, now()),
              ($1, current_date - 1, 50000000, null, null, false, now())`,
      [bot?.id],
    );
    // Academy: ch01-l01 done, ch01-l02 failed once (2/3), ch01-l03 has an open attempt.
    const content = loadAcademyContent();
    const chapter1 = content.catalog.chapters[0];
    const lessons = chapter1?.published ? chapter1.items : [];
    const [l1, l2, l3] = lessons;
    const attempt = async (lessonId: string, lessonKey: string, status: 'open' | 'submitted') =>
      stack.query(
        `insert into academy_attempts
           (user_id, lesson_id, lesson_key, catalog_version, content_version, questions_version,
            question_ids, option_orders, status, idempotency_key, submitted_at, score, passed)
         values ($1, $2, $3, $4, 'v1', repeat('a', 64), '{q1,q2,q3}', '{}'::jsonb, $5, $6,
                 ${status === 'submitted' ? 'now()' : 'null'},
                 ${status === 'submitted' ? '2' : 'null'},
                 ${status === 'submitted' ? 'false' : 'null'})`,
        [
          active.id,
          lessonId,
          lessonKey,
          content.catalog.catalog_version,
          status,
          `${lessonId}-${status}`,
        ],
      );
    await stack.query(
      `insert into academy_completions
         (user_id, lesson_key, catalog_version, lesson_id, completion_method, completed_at, source)
       values ($1, $2, $3, $4, 'legacy_migration', now() - interval '1 day',
               '{"reward": {"status": "credited", "delta": 5, "balance_after": 5}}'::jsonb)`,
      [active.id, l1?.lesson_key, content.catalog.catalog_version, l1?.id],
    );
    await attempt(l2?.id ?? '', l2?.lesson_key ?? '', 'submitted');
    await attempt(l3?.id ?? '', l3?.lesson_key ?? '', 'open');
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  it('gives a team lead 403 on every admin route and keeps team/* to active team leads (§7.2)', async () => {
    const contract = JSON.parse(
      readFileSync(new URL('../../contracts/openapi-v2.json', import.meta.url), 'utf8'),
    ) as {
      paths: Record<string, Record<string, { 'x-required-roles'?: string[] }>>;
    };
    const adminRoutes = Object.entries(contract.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, operation]) => {
          const roles = operation['x-required-roles'] ?? [];
          return roles.includes('admin') && !roles.includes('team_lead');
        })
        .map(([method]) => ({
          method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          url: path.replace(/\{[^}]+\}/g, outsider.id),
        })),
    );
    expect(adminRoutes.length).toBeGreaterThan(40);
    expect(adminRoutes.some((route) => route.url.startsWith('/api/v2/admin/team-leads'))).toBe(
      true,
    );
    for (const route of adminRoutes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: authHeader(lead.accessToken),
        payload: route.method === 'GET' ? undefined : {},
      });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(403);
    }

    for (const session of [admin, outsider, active]) {
      const response = await as(session, 'GET', `${TEAM}/me`);
      expect(response.statusCode).toBe(403);
      expect((response.json() as ErrorBody).error.code).toBe('INSUFFICIENT_ROLE');
    }

    // A role/profile mismatch never reads a group: the profile must be active too.
    await stack.query(
      "update team_lead_profiles set status = 'revoked', revoked_at = now() where user_id = $1",
      [lead.id],
    );
    try {
      const mismatch = await as(lead, 'GET', `${TEAM}/users`);
      expect(mismatch.statusCode).toBe(403);
      expect((mismatch.json() as ErrorBody).error.code).toBe('TEAM_LEAD_NOT_ACTIVE');
    } finally {
      await stack.query(
        "update team_lead_profiles set status = 'active', revoked_at = null, revoked_by = null where user_id = $1",
        [lead.id],
      );
    }
  }, 120_000);

  it('answers 404 USER_NOT_FOUND outside the group and accepts no group parameter (§7.2)', async () => {
    for (const target of [outsider, otherMember, otherLead, admin, lead]) {
      for (const url of [
        `${TEAM}/users/${target.id}`,
        `${TEAM}/users/${target.id}/login-history`,
      ]) {
        const response = await as(lead, 'GET', url);
        expect(response.statusCode, url).toBe(404);
        expect((response.json() as ErrorBody).error.code).toBe('USER_NOT_FOUND');
      }
      const removed = await as(lead, 'POST', `${TEAM}/users/${target.id}/remove`, {
        reason: 'Không thuộc nhóm',
      });
      expect(removed.statusCode).toBe(404);
      expect((removed.json() as ErrorBody).error.code).toBe('USER_NOT_FOUND');
    }
    const [other] = await stack.query<{ group_lead_id: string }>(
      'select group_lead_id from users where id = $1',
      [otherMember.id],
    );
    expect(other?.group_lead_id).toBe(otherLead.id);

    // Unknown parameters are ignored: the scope always comes from the caller.
    for (const url of [
      `${TEAM}/users?lead_id=${otherLead.id}`,
      `${TEAM}/users?group_lead_id=${otherLead.id}&search=${otherMember.username}`,
    ]) {
      const page = (await as(lead, 'GET', url)).json() as TeamPage;
      expect(page.items.every((item) => [active.id, idle.id].includes(item.id))).toBe(true);
      expect(page.items.some((item) => item.id === otherMember.id)).toBe(false);
    }
    const otherOverview = (
      await as(lead, 'GET', `${TEAM}/metrics/overview?lead_id=${otherLead.id}`)
    ).json() as { total_users: number };
    expect(otherOverview.total_users).toBe(2);

    // A deleted member is out of every team view.
    const ghost = await joinByCode(lead.username, 'team-ghost');
    await stack.query("update users set status = 'deleted', deleted_at = now() where id = $1", [
      ghost.id,
    ]);
    expect((await as(lead, 'GET', `${TEAM}/users/${ghost.id}`)).statusCode).toBe(404);
    const listed = (await as(lead, 'GET', `${TEAM}/users`)).json() as TeamPage;
    expect(listed.items.map((item) => item.id).sort()).toEqual([active.id, idle.id].sort());
  }, 60_000);

  it('reports the code, policy and group metrics of the caller only (§4.3, §6)', async () => {
    const me = (await as(lead, 'GET', `${TEAM}/me`)).json() as Record<string, unknown>;
    expect(me).toMatchObject({
      code: lead.username,
      status: 'active',
      commission_pct: 20,
      offer_type: 'none',
      offer_days: null,
      member_count: 2,
    });
    expect(keysOf(me).some((key) => key.includes('commission_') && key.endsWith('_vnd'))).toBe(
      false,
    );

    // The member's trial is over and it pays a month; an outsider pays too.
    await stack.query(
      `update billing_entitlement_grants set ends_at = now() - interval '1 second',
              original_ends_at = now() - interval '1 second', starts_at = now() - interval '2 days'
        where user_id = any($1::uuid[]) and kind = 'trial'`,
      [[active.id, outsider.id]],
    );
    for (const session of [active, outsider]) {
      const checkout = await as(session, 'POST', '/api/v2/premium/checkout', { plan_id: planId });
      expect(checkout.statusCode, checkout.body).toBe(201);
      const orderId = (checkout.json() as { order_id: string }).order_id;
      const marked = await adminCall('POST', `/api/v2/admin/payments/${orderId}/mark-paid`, {
        note: 'team metrics',
      });
      expect(marked.statusCode, marked.body).toBe(200);
    }

    const overview = (await as(lead, 'GET', `${TEAM}/metrics/overview`)).json() as Record<
      string,
      unknown
    > & { plan_distribution: Array<{ plan_code: string; active_subscriptions: number }> };
    expect(overview).toMatchObject({
      total_users: 2,
      new_users_last_7d: 2,
      active_paid_count: 1,
      mrr_vnd: 99_000,
      revenue_today_vnd: 99_000,
      revenue_last_30d_vnd: 99_000,
      vt_active_accounts: 1,
      vt_orders_today: 1,
    });
    expect(
      overview.plan_distribution.find((plan) => plan.plan_code === 'MONTHLY')?.active_subscriptions,
    ).toBe(1);
    const revenue = (await as(lead, 'GET', `${TEAM}/metrics/revenue?days=7`)).json() as Array<{
      date: string;
      paid_orders: number;
      revenue_vnd: number;
    }>;
    expect(revenue).toHaveLength(7);
    expect(revenue.reduce((sum, day) => sum + day.revenue_vnd, 0)).toBe(99_000);
    expect(revenue.reduce((sum, day) => sum + day.paid_orders, 0)).toBe(1);
    expect((await as(lead, 'GET', `${TEAM}/metrics/revenue?days=0`)).statusCode).toBe(422);

    const otherOverview = (await as(otherLead, 'GET', `${TEAM}/metrics/overview`)).json() as Record<
      string,
      unknown
    >;
    expect(otherOverview).toMatchObject({
      total_users: 1,
      revenue_today_vnd: 0,
      mrr_vnd: 0,
      vt_active_accounts: 0,
      vt_orders_today: 0,
    });
    // The admin overview still covers everyone.
    const all = (await adminCall('GET', '/api/v2/admin/metrics/overview')).json() as {
      revenue_today_vnd: number;
      total_users: number;
    };
    expect(all.revenue_today_vnd).toBeGreaterThanOrEqual(198_000);
    expect(all.total_users).toBeGreaterThan(2);
  }, 60_000);

  it('lists members with results in percent only and Academy progress (§5.1.3, §7.6)', async () => {
    const page = (
      await as(lead, 'GET', `${TEAM}/users?sort_by=demo_pnl_pct&sort_order=desc`)
    ).json() as TeamPage;
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([active.id, idle.id]);
    const [first, second] = page.items;
    expect(first).toMatchObject({
      username: active.username,
      demo_trading: { activated: true, pnl_pct: 2 },
      bot: { activated: true, pnl_pct: -5 },
      academy: {
        started: true,
        completed: 1,
        all_done: false,
        current_lesson: { lesson_id: 'ch01-l03' },
      },
    });
    expect(first?.academy.current_lesson?.label).toMatch(/^Chương 1 · Bài 3: /);
    expect(first?.bot.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(second).toMatchObject({
      demo_trading: { activated: false, pnl_pct: null },
      bot: { activated: false, pnl_pct: null, as_of: null },
      academy: { started: false, completed: 0, current_lesson: null, all_done: false },
    });
    // §7.6: no money value anywhere in the list.
    expect(keysOf(page).filter((key) => key.endsWith('_vnd'))).toEqual([]);

    // Nulls stay last in both directions.
    const ascending = (
      await as(lead, 'GET', `${TEAM}/users?sort_by=bot_pnl_pct&sort_order=asc`)
    ).json() as TeamPage;
    expect(ascending.items.map((item) => item.id)).toEqual([active.id, idle.id]);
    const byAcademy = (
      await as(lead, 'GET', `${TEAM}/users?sort_by=academy_progress&sort_order=asc`)
    ).json() as TeamPage;
    expect(byAcademy.items.map((item) => item.id)).toEqual([idle.id, active.id]);
    const paged = (
      await as(
        lead,
        'GET',
        `${TEAM}/users?sort_by=academy_progress&sort_order=desc&page=2&page_size=1`,
      )
    ).json() as TeamPage;
    expect(paged).toMatchObject({ total: 2, page: 2, total_pages: 2 });
    expect(paged.items.map((item) => item.id)).toEqual([idle.id]);
    const byName = (
      await as(lead, 'GET', `${TEAM}/users?sort_by=username&sort_order=asc`)
    ).json() as TeamPage;
    expect(byName.items.map((item) => item.username)).toEqual(
      [active.username, idle.username].sort(),
    );

    const searched = (
      await as(lead, 'GET', `${TEAM}/users?search=${encodeURIComponent(idle.email)}`)
    ).json() as TeamPage;
    expect(searched.items.map((item) => item.id)).toEqual([idle.id]);
    const premium = (await as(lead, 'GET', `${TEAM}/users?role=premium`)).json() as TeamPage;
    expect(premium.items.every((item) => item.role === 'premium')).toBe(true);

    // The 4 dashboard shortcuts.
    await stack.query(
      `update users set is_email_verified = true, created_at = now() - interval '30 days',
              last_login_at = now() - interval '20 days'
        where id = $1`,
      [active.id],
    );
    const segment = async (name: string) =>
      ((await as(lead, 'GET', `${TEAM}/users?segment=${name}`)).json() as TeamPage).items.map(
        (item) => item.id,
      );
    expect(await segment('new_7d')).toEqual([idle.id]);
    expect(await segment('email_unverified')).toEqual([idle.id]);
    expect(await segment('trialing')).toEqual([idle.id]);
    expect(await segment('inactive_14d')).toEqual([active.id]);

    for (const query of ['page_size=101', 'sort_by=email', 'role=admin', 'segment=unknown']) {
      const response = await as(lead, 'GET', `${TEAM}/users?${query}`);
      expect(response.statusCode, query).toBe(422);
      expect((response.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    }
  }, 60_000);

  it('shows the member 360 without admin-only fields, and the published Academy (§5.1.3, §7.6)', async () => {
    const response = await as(lead, 'GET', `${TEAM}/users/${active.id}`);
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json() as User360;
    expect(view).not.toHaveProperty('vt_account');
    expect(view).not.toHaveProperty('vt_recent_orders');
    expect(keysOf(view.demo_trading).filter((key) => key.endsWith('_vnd'))).toEqual([]);
    expect(keysOf(view.bot).filter((key) => key.endsWith('_vnd'))).toEqual([]);
    expect(view.demo_trading).toMatchObject({ activated: true, pnl_pct: 2 });
    expect(view.bot).toMatchObject({ activated: true, pnl_pct: -5 });
    expect(view.group).toMatchObject({
      lead_user_id: lead.id,
      code: lead.username,
      join_via: 'code',
    });
    expect(view.payment_history).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount_vnd: 99_000, status: 'paid' })]),
    );

    const content = loadAcademyContent();
    const published = content.catalog.chapters.filter((chapter) => chapter.published);
    expect(view.academy.chapters.map((chapter) => chapter.no)).toEqual(
      published.map((chapter) => chapter.no),
    );
    expect(view.academy.total).toBe(content.requiredTotal);
    expect(view.academy.chapter_exams).toEqual({ total: 5, passed: 0 });
    expect(view.academy.current_lesson?.lesson_id).toBe('ch01-l03');
    const [l1, l2, l3, l4] = view.academy.chapters[0]?.lessons ?? [];
    expect(l1).toMatchObject({ status: 'completed', is_current: false });
    expect(l1?.completed_at).toBeTruthy();
    expect(l2).toMatchObject({ status: 'failed', attempts: 1, latest_score: 2, max_score: 3 });
    expect(l3).toMatchObject({ status: 'in_progress', attempts: 0, is_current: true });
    expect(l4).toMatchObject({ status: 'not_started', attempts: 0, latest_score: null });

    const idleView = (await as(lead, 'GET', `${TEAM}/users/${idle.id}`)).json() as User360;
    expect(idleView.demo_trading).toMatchObject({ activated: false, pnl_pct: null });
    expect(idleView.bot).toMatchObject({ activated: false, pnl_pct: null });
    expect(idleView.group).toMatchObject({ join_via: 'admin' });

    // The admin 360 keeps its money views and gains the same blocks.
    const adminView = (
      await adminCall('GET', `/api/v2/admin/users/${active.id}/360`)
    ).json() as User360;
    expect(adminView.vt_account).toMatchObject({ initial_cash_vnd: 100_000_000 });
    expect(adminView.demo_trading).toEqual(view.demo_trading);
    expect(adminView.academy).toEqual(view.academy);
    expect(adminView.group).toEqual(view.group);

    const history = await as(lead, 'GET', `${TEAM}/users/${active.id}/login-history?page_size=5`);
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({ page: 1, page_size: 5 });
    expect((history.json() as { total: number }).total).toBeGreaterThan(0);
  }, 60_000);

  it('removes a member from its own group with a reason and audits it as team_lead (§3.4)', async () => {
    const missing = await as(lead, 'POST', `${TEAM}/users/${idle.id}/remove`, {});
    expect(missing.statusCode).toBe(422);
    expect((missing.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR');

    const removed = await as(lead, 'POST', `${TEAM}/users/${idle.id}/remove`, {
      reason: 'Không còn theo nhóm',
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({ lead_user_id: lead.id, user_id: idle.id });

    const audit = await stack.query<{
      actor_role: string;
      admin_user_id: string;
      target_entity: string;
      target_id: string;
      note: string;
    }>(
      `select actor_role, admin_user_id, target_entity, target_id, note from admin_audit_log
        where action = 'group.member_remove' and payload_before->>'member_user_id' = $1`,
      [idle.id],
    );
    expect(audit).toEqual([
      {
        actor_role: 'team_lead',
        admin_user_id: lead.id,
        target_entity: 'team_lead',
        target_id: lead.id,
        note: 'Không còn theo nhóm',
      },
    ]);
    const history = await stack.query<{
      action: string;
      actor_role: string;
      actor_user_id: string;
    }>(
      `select action, actor_role, actor_user_id from group_membership_history
        where user_id = $1 and action = 'remove'`,
      [idle.id],
    );
    expect(history).toEqual([
      { action: 'remove', actor_role: 'team_lead', actor_user_id: lead.id },
    ]);

    expect((await as(lead, 'GET', `${TEAM}/users/${idle.id}`)).statusCode).toBe(404);
    const again = await as(lead, 'POST', `${TEAM}/users/${idle.id}/remove`, { reason: 'Lần hai' });
    expect(again.statusCode).toBe(404);
    expect((again.json() as ErrorBody).error.code).toBe('USER_NOT_FOUND');
    expect(
      ((await as(lead, 'GET', `${TEAM}/me`)).json() as { member_count: number }).member_count,
    ).toBe(1);
  }, 60_000);
});

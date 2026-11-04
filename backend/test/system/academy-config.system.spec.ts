import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadAcademyContent } from '../../src/modules/academy/academy.content.js';
import {
  ACADEMY_V4_CATALOG_VERSION,
  chapterIdOf,
} from '../../src/modules/academy/content/v4/schema.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  testIdentity,
  type SystemStack,
} from './system-stack.js';

// Học viện v4.1 (IQX-Hoc-Vien-SPEC-BoSung) against a real PostgreSQL with migration 0040: the per team lead
// Academy configs (§1), the renumbered chapters (§2), free and sequential modes (§3), the locked lesson (§4), the
// admin-only edit (§1.3), the config of a user resolved from his group on every call (§8.2), a config or group change
// while learning (§7: nothing deleted, no xu moved) and the staff view of a user (§8.4).
const MIGRATION = new URL('../../migrations/0040_academy_configs.sql', import.meta.url);
const PASSWORD = 'System!Passw0rd';
const ACADEMY = '/api/v2/academy';
const CONFIGS = '/api/v2/admin/academy-configs';
const TEAM = '/api/v2/team';
const ADMIN_TEAM_LEADS = '/api/v2/admin/team-leads';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Mode = 'free' | 'sequential';
type ErrorBody = { error: { code: string } };
type Progress = {
  course_done: number;
  course_total: number;
  access_mode: Mode;
  current_item_id: string | null;
  next_item_id: string | null;
  items: Array<{ id: string; state: string }>;
  chapters: Array<{ chapter_id: string; display_no: number; done: number; total: number }>;
};
type Catalog = {
  mode: Mode;
  required_total: number;
  chapters: Array<{
    chapter_id: string;
    display_no: number;
    title: string;
    items: Array<{ id: string; name: string; intro: string | null; chapter_display_no: number }>;
  }>;
};
type ConfigItem = {
  id: string | null;
  owner_type: 'default' | 'leader';
  leader: { user_id: string; status: string } | null;
  name: string;
  inherits_default: boolean;
  mode: Mode;
  chapter_ids: string[];
  chapter_count: number;
  chapter_total: number;
  required_total: number;
  user_count: number;
  updated_by: { id: string } | null;
};
type ConfigList = {
  catalog_chapters: Array<{ chapter_id: string; no: number; has_dashboard_metrics: boolean }>;
  items: ConfigItem[];
};
type User360 = {
  academy: {
    total: number;
    completed: number;
    learning_coins: number;
    config: { source: string; mode: Mode; chapter_count: number; chapter_total: number };
    chapters: Array<{
      chapter_id: string;
      display_no: number | null;
      in_program: boolean;
      total: number;
      completed: number;
      lessons: Array<{ lesson_id: string; status: string }>;
    }>;
  };
};

const content = loadAcademyContent();
const ALL = content.catalog.chapters.map((chapter) => chapterIdOf(chapter.no));
const without = (...removed: string[]) => ALL.filter((id) => !removed.includes(id));
/** Required lessons (N, practice and exams excluded) of the chapters. */
const requiredOf = (chapterIds: readonly string[]) =>
  content.catalog.chapters
    .filter((chapter) => chapterIds.includes(chapterIdOf(chapter.no)))
    .reduce((sum, chapter) => sum + chapter.lesson_count, 0);
/** Lesson keys of the learning chain (lessons and exams, never practice) of the chapters. */
const chainKeys = (chapterIds: readonly string[]) =>
  content.sequence
    .filter((entry) => !entry.optional && chapterIds.includes(chapterIdOf(entry.chapter)))
    .map((entry) => entry.lesson_key);
const correctAnswers = (itemId: string) =>
  content.items.get(itemId)!.bank.questions.map((question) => ({
    question_id: question.id,
    option_id: question.correct_option_id,
  }));

describe('system acceptance: Học viện v4.1 Academy configs', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let admin: Session;
  let leadA: Session; // gets an own config
  let leadB: Session; // keeps the default
  let memberA: Session; // group of leadA
  let memberB: Session; // group of leadB
  let loose: Session; // no group
  let defaultId: string;

  const as = (session: Session | null, method: Method, url: string, payload?: object) =>
    app.inject({
      method,
      url,
      ...(session ? { headers: authHeader(session.accessToken) } : {}),
      ...(payload ? { payload: payload as Record<string, unknown> } : {}),
    });
  const academy = (session: Session, method: Method, path: string, payload?: object) =>
    as(session, method, `${ACADEMY}/${path}`, payload);
  const json = <T>(response: { json(): unknown }) => response.json() as T;
  const progressOf = async (session: Session) =>
    json<Progress>(await academy(session, 'GET', 'progress'));
  const catalogOf = async (session: Session) =>
    json<Catalog>(await academy(session, 'GET', 'catalog'));
  const codeOf = (response: { json(): unknown }) => json<ErrorBody>(response).error.code;
  const list = async () => json<ConfigList>(await as(admin, 'GET', CONFIGS));

  async function leaderConfig(leader: Session): Promise<ConfigItem | undefined> {
    return (await list()).items.find((item) => item.leader?.user_id === leader.id);
  }

  /** Creates or saves the own config of a lead through the admin API. */
  async function setConfig(leader: Session, mode: Mode, chapterIds: readonly string[]) {
    const existing = (await leaderConfig(leader))?.id ?? null;
    const response = existing
      ? await as(admin, 'PUT', `${CONFIGS}/${existing}`, { mode, chapter_ids: chapterIds })
      : await as(admin, 'POST', CONFIGS, {
          leader_id: leader.id,
          mode,
          chapter_ids: chapterIds,
        });
    expect(response.statusCode, response.body).toBe(existing ? 200 : 201);
    return json<ConfigItem>(response);
  }

  /** "Về mặc định": deletes the own config of a lead, if he has one. */
  async function clearConfig(leader: Session) {
    const existing = (await leaderConfig(leader))?.id;
    if (!existing) return;
    const response = await as(admin, 'DELETE', `${CONFIGS}/${existing}`);
    expect(response.statusCode, response.body).toBe(200);
  }

  /** A fresh token: revoking a team lead ends his sessions. */
  async function login(session: Session): Promise<Session> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: session.email, password: PASSWORD },
    });
    expect(response.statusCode, response.body).toBe(200);
    const tokens = response.json() as { access_token: string; refresh_token: string };
    return { ...session, accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  }

  async function appoint(session: Session): Promise<void> {
    const response = await as(admin, 'POST', ADMIN_TEAM_LEADS, {
      user_id: session.id,
      commission_pct: 10,
      offer_type: 'none',
      reason: 'Bổ nhiệm thử',
    });
    expect(response.statusCode, response.body).toBe(201);
  }

  async function joinByCode(code: string, suffix: string): Promise<Session> {
    const identity = testIdentity(suffix);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      payload: { ...identity, password: PASSWORD, full_name: `Member ${suffix}`, referral_code: code },
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

  /** Seeds legacy completions (no xu): the learner has passed these keys. */
  async function pass(session: Session, keys: readonly string[]) {
    for (const key of keys)
      await stack.query(
        `insert into academy_completions
           (user_id, lesson_key, catalog_version, lesson_id, completion_method, source)
         values ($1, $2, $3, 'seed', 'legacy_migration', '{}'::jsonb)
         on conflict do nothing`,
        [session.id, key, ACADEMY_V4_CATALOG_VERSION],
      );
  }

  async function startAttempt(session: Session, itemId: string) {
    const response = await academy(session, 'POST', 'attempts', {
      lesson_id: itemId,
      catalog_version: ACADEMY_V4_CATALOG_VERSION,
      idempotency_key: randomUUID(),
    });
    expect(response.statusCode, response.body).toBe(201);
    return json<{ attempt_id: string }>(response).attempt_id;
  }

  const submit = (session: Session, attemptId: string, itemId: string) =>
    academy(session, 'POST', `attempts/${attemptId}/submit`, { answers: correctAnswers(itemId) });

  beforeAll(async () => {
    stack = await startSystemStack({ ACADEMY_ENABLED: 'true' });
    app = stack.app;
    admin = await registerAndLogin(app, 'cfg-admin');
    await stack.query("update users set role = 'admin' where id = $1", [admin.id]);
    leadA = await registerAndLogin(app, 'cfg-lead-a');
    leadB = await registerAndLogin(app, 'cfg-lead-b');
    await appoint(leadA);
    await appoint(leadB);
    memberA = await joinByCode(leadA.username, 'cfg-member-a');
    memberB = await joinByCode(leadB.username, 'cfg-member-b');
    loose = await registerAndLogin(app, 'cfg-loose');
    // The harness resets `users` with TRUNCATE ... CASCADE, which also empties every table that points at a user,
    // the seeded default config included. The migration is idempotent: applying it again puts back the state a
    // database has right after 0040 (one default config, Học tự do, 12 chapters).
    await stack.query(await readFile(MIGRATION, 'utf8'));
    const [row] = await stack.query<{ id: string }>(
      "select id from academy_configs where owner_type = 'default'",
    );
    defaultId = row?.id ?? '';
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  it('applies 0040 twice, seeds the default config and enforces its constraints (spec §8.1)', async () => {
    // The migration seeds exactly one row: Học tự do, all 12 chapters (owner decision, spec §11.1).
    expect(await stack.query('select owner_type, leader_id, mode, chapter_ids from academy_configs')).toEqual([
      { owner_type: 'default', leader_id: null, mode: 'free', chapter_ids: ALL },
    ]);
    expect(ALL).toHaveLength(12);

    // Re-running adds nothing and never resets a default the admin has already edited.
    const sql = await readFile(MIGRATION, 'utf8');
    await stack.query("update academy_configs set mode = 'sequential' where owner_type = 'default'");
    await stack.query(sql);
    await stack.query(sql);
    expect(await stack.query('select mode from academy_configs')).toEqual([{ mode: 'sequential' }]);
    await stack.query("update academy_configs set mode = 'free' where owner_type = 'default'");

    const insert = (owner: string, leader: string | null, mode: string, chapters: string) =>
      stack.query(
        `insert into academy_configs (owner_type, leader_id, mode, chapter_ids)
         values ($1, $2, $3, ${chapters})`,
        [owner, leader, mode],
      );
    const rejected = async (promise: Promise<unknown>, code: string) =>
      expect(promise).rejects.toMatchObject({ code });
    // One default config.
    await rejected(insert('default', null, 'free', "array['ch01']"), '23505');
    // The owner decides which side carries a lead.
    await rejected(insert('leader', null, 'free', "array['ch01']"), '23514');
    await rejected(insert('default', leadA.id, 'free', "array['ch01']"), '23514');
    // Mode and at least one chapter.
    await rejected(insert('leader', leadA.id, 'weird', "array['ch01']"), '23514');
    await rejected(insert('leader', leadA.id, 'free', "'{}'::text[]"), '23514');
    // Only a team lead can own a config.
    await rejected(insert('leader', memberA.id, 'free', "array['ch01']"), '23503');
    // One config per lead.
    await insert('leader', leadB.id, 'free', "array['ch01']");
    await rejected(insert('leader', leadB.id, 'sequential', "array['ch02']"), '23505');
    await stack.query("delete from academy_configs where owner_type = 'leader'");
    // The change log only knows the three actions and two owners.
    await rejected(
      stack.query(
        `insert into academy_config_logs (config_id, owner_type, action) values (gen_random_uuid(), 'default', 'rename')`,
      ),
      '23514',
    );
    await rejected(
      stack.query(
        `insert into academy_config_logs (config_id, owner_type, action) values (gen_random_uuid(), 'team', 'create')`,
      ),
      '23514',
    );
  });

  it('lets only an admin edit configs and a team lead read his own, read only (spec §1.3, §10)', async () => {
    const body = { mode: 'free', chapter_ids: ['ch01'] };
    const writes: Array<[Method, string, object | undefined]> = [
      ['GET', CONFIGS, undefined],
      ['POST', `${CONFIGS}/preview`, body],
      ['POST', CONFIGS, { leader_id: leadA.id, ...body }],
      ['PUT', `${CONFIGS}/${defaultId}`, body],
      ['DELETE', `${CONFIGS}/${defaultId}`, undefined],
      ['GET', `${CONFIGS}/${defaultId}/logs`, undefined],
    ];
    for (const session of [leadA, leadB, memberA, loose]) {
      for (const [method, url, payload] of writes) {
        const response = await as(session, method, url, payload);
        expect(response.statusCode, `${method} ${url}`).toBe(403);
        expect(codeOf(response)).toBe('INSUFFICIENT_ROLE');
      }
    }
    for (const [method, url, payload] of writes) {
      expect((await as(null, method, url, payload)).statusCode, `${method} ${url}`).toBe(401);
    }
    expect(await stack.query('select 1 from academy_configs')).toHaveLength(1);
    expect(await stack.query('select 1 from academy_config_logs')).toHaveLength(0);

    // The team lead sees his group's config (here the default one), never edits it.
    const mine = await as(leadA, 'GET', `${TEAM}/academy-config`);
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json()).toMatchObject({
      has_own_config: false,
      read_only: true,
      mode: 'free',
      chapter_count: 12,
      chapter_total: 12,
      required_total: 116,
    });
    expect(json<{ chapters: Array<{ display_no: number }> }>(mine).chapters.map((c) => c.display_no)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    for (const session of [admin, memberA, loose]) {
      const response = await as(session, 'GET', `${TEAM}/academy-config`);
      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('INSUFFICIENT_ROLE');
    }
    expect((await as(null, 'GET', `${TEAM}/academy-config`)).statusCode).toBe(401);
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      const response = await as(leadA, method, `${TEAM}/academy-config`, method === 'DELETE' ? undefined : body);
      expect([404, 405], `${method} team/academy-config`).toContain(response.statusCode);
    }
    expect(await stack.query('select 1 from academy_configs')).toHaveLength(1);
  });

  it('lists the default first and every team lead, and previews a config without saving it (spec §1.4)', async () => {
    const before = await list();
    expect(before.catalog_chapters.map((chapter) => chapter.no)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    // The chapters that teach Dashboard metrics carry the warning flag.
    const dashboard = new Set(
      content.catalog.chapters
        .filter((chapter) => chapter.items.some((item) => item.metric_key !== null))
        .map((chapter) => chapterIdOf(chapter.no)),
    );
    expect(dashboard.size).toBeGreaterThan(0);
    for (const chapter of before.catalog_chapters)
      expect(chapter.has_dashboard_metrics, chapter.chapter_id).toBe(dashboard.has(chapter.chapter_id));

    const [first, ...leads] = before.items;
    expect(first).toMatchObject({
      id: defaultId,
      owner_type: 'default',
      name: 'Mặc định',
      mode: 'free',
      chapter_ids: ALL,
      chapter_count: 12,
      chapter_total: 12,
      required_total: 116,
      inherits_default: false,
    });
    // Every lead without an own config reads "Theo mặc định" and counts himself plus his members.
    expect(leads.map((item) => item.leader?.user_id).sort()).toEqual([leadA.id, leadB.id].sort());
    for (const item of leads) {
      expect(item).toMatchObject({
        id: null,
        owner_type: 'leader',
        inherits_default: true,
        mode: 'free',
        chapter_ids: ALL,
        user_count: 2,
      });
    }
    // Default: the 5 learners (admins use the built-in view and are not counted).
    expect(first?.user_count).toBe(5);

    const preview = await as(admin, 'POST', `${CONFIGS}/preview`, {
      mode: 'sequential',
      chapter_ids: ['ch12', 'ch01', 'ch03', 'ch02', 'ch10'],
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const shown = json<{
      mode: Mode;
      chapter_count: number;
      required_total: number;
      chapters: Array<{ chapter_id: string; display_no: number }>;
      warnings: Array<{ code: string; chapter_id: string }>;
    }>(preview);
    expect(shown).toMatchObject({
      mode: 'sequential',
      chapter_count: 5,
      required_total: requiredOf(['ch01', 'ch02', 'ch03', 'ch10', 'ch12']),
    });
    // Catalog order, renumbered from 1.
    expect(shown.chapters.map((chapter) => [chapter.chapter_id, chapter.display_no])).toEqual([
      ['ch01', 1],
      ['ch02', 2],
      ['ch03', 3],
      ['ch10', 4],
      ['ch12', 5],
    ]);
    // Every dashboard chapter left out is a warning (spec §4: its "Học" button has no lesson).
    expect(shown.warnings.map((warning) => warning.chapter_id)).toEqual(
      [...dashboard].filter((id) => !['ch10', 'ch12'].includes(id)),
    );
    // Nothing was saved or logged by a preview.
    expect(await stack.query('select 1 from academy_configs')).toHaveLength(1);
    expect(await stack.query('select 1 from academy_config_logs')).toHaveLength(0);

    for (const payload of [
      { mode: 'free', chapter_ids: [] },
      { mode: 'strict', chapter_ids: ['ch01'] },
      { mode: 'free', chapter_ids: ['ch01'], extra: true },
    ]) {
      const response = await as(admin, 'POST', `${CONFIGS}/preview`, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(422);
    }
    const unknown = await as(admin, 'POST', `${CONFIGS}/preview`, { mode: 'free', chapter_ids: ['ch01', 'ch13'] });
    expect(unknown.statusCode).toBe(422);
    expect(codeOf(unknown)).toBe('ACADEMY_CONFIG_INVALID');
  });

  it('creates, saves and deletes a lead config with a change log and the audit trail (spec §1.3, §8.3)', async () => {
    const invalid = await as(admin, 'POST', CONFIGS, { leader_id: leadA.id, mode: 'free', chapter_ids: [] });
    expect(invalid.statusCode).toBe(422);
    const unknown = await as(admin, 'POST', CONFIGS, { leader_id: leadA.id, mode: 'free', chapter_ids: ['ch01', 'ch13'] });
    expect(unknown.statusCode).toBe(422);
    expect(codeOf(unknown)).toBe('ACADEMY_CONFIG_INVALID');
    const notLead = await as(admin, 'POST', CONFIGS, { leader_id: loose.id, mode: 'free', chapter_ids: ['ch01'] });
    expect(notLead.statusCode).toBe(404);
    expect(codeOf(notLead)).toBe('ACADEMY_LEADER_NOT_FOUND');
    expect(await stack.query('select 1 from academy_configs')).toHaveLength(1);

    // Created out of order: stored and answered in catalog order.
    const created = await as(admin, 'POST', CONFIGS, {
      leader_id: leadA.id,
      mode: 'sequential',
      chapter_ids: ['ch12', ...without('ch02', 'ch12').reverse()],
    });
    expect(created.statusCode, created.body).toBe(201);
    const item = json<ConfigItem>(created);
    expect(item).toMatchObject({
      owner_type: 'leader',
      inherits_default: false,
      mode: 'sequential',
      chapter_ids: without('ch02'),
      chapter_count: 11,
      chapter_total: 12,
      required_total: requiredOf(without('ch02')),
      user_count: 2,
      updated_by: { id: admin.id },
    });
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    const duplicate = await as(admin, 'POST', CONFIGS, { leader_id: leadA.id, mode: 'free', chapter_ids: ['ch01'] });
    expect(duplicate.statusCode).toBe(409);
    expect(codeOf(duplicate)).toBe('ACADEMY_CONFIG_EXISTS');

    // An unchanged save writes nothing; a change is logged once with before and after.
    const same = await as(admin, 'PUT', `${CONFIGS}/${item.id}`, { mode: 'sequential', chapter_ids: without('ch02') });
    expect(same.statusCode, same.body).toBe(200);
    const saved = await as(admin, 'PUT', `${CONFIGS}/${item.id}`, { mode: 'free', chapter_ids: without('ch02', 'ch05') });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      id: item.id,
      mode: 'free',
      chapter_count: 10,
      required_total: requiredOf(without('ch02', 'ch05')),
    });
    expect(
      (await as(admin, 'PUT', `${CONFIGS}/${item.id}`, { mode: 'free', chapter_ids: [] })).statusCode,
    ).toBe(422);
    const missing = await as(admin, 'PUT', `${CONFIGS}/${randomUUID()}`, { mode: 'free', chapter_ids: ['ch01'] });
    expect(missing.statusCode).toBe(404);
    expect(codeOf(missing)).toBe('ACADEMY_CONFIG_NOT_FOUND');

    const logs = await as(admin, 'GET', `${CONFIGS}/${item.id}/logs`);
    expect(logs.statusCode, logs.body).toBe(200);
    const entries = json<{
      items: Array<{
        action: string;
        changed_by: { id: string } | null;
        before: { mode: Mode; chapter_ids: string[] } | null;
        after: { mode: Mode; chapter_ids: string[] } | null;
      }>;
    }>(logs).items;
    // Newest first: the save, then the create (whose "before" is the default the group had learned with).
    expect(entries.map((entry) => entry.action)).toEqual(['update', 'create']);
    expect(entries[0]).toMatchObject({
      changed_by: { id: admin.id },
      before: { mode: 'sequential', chapter_ids: without('ch02') },
      after: { mode: 'free', chapter_ids: without('ch02', 'ch05') },
    });
    expect(entries[1]).toMatchObject({
      before: { mode: 'free', chapter_ids: ALL },
      after: { mode: 'sequential', chapter_ids: without('ch02') },
    });
    expect(
      (await as(admin, 'GET', `${CONFIGS}/${randomUUID()}/logs`)).statusCode,
    ).toBe(404);

    // The delete goes back to the default, keeps the log and refuses the default config itself.
    const protectedDefault = await as(admin, 'DELETE', `${CONFIGS}/${defaultId}`);
    expect(protectedDefault.statusCode).toBe(409);
    expect(codeOf(protectedDefault)).toBe('ACADEMY_CONFIG_DEFAULT_PROTECTED');
    const removed = await as(admin, 'DELETE', `${CONFIGS}/${item.id}`);
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({ id: null, inherits_default: true, mode: 'free', chapter_ids: ALL });
    expect((await as(admin, 'DELETE', `${CONFIGS}/${item.id}`)).statusCode).toBe(404);
    expect(await stack.query('select 1 from academy_configs')).toHaveLength(1);
    expect(
      await stack.query('select action from academy_config_logs where leader_id = $1 order by changed_at, id', [leadA.id]),
    ).toEqual([{ action: 'create' }, { action: 'update' }, { action: 'delete' }]);

    // The global audit trail has the three changes, by the admin.
    const audit = await stack.query<{ action: string; actor_role: string; admin_user_id: string; target_entity: string; target_id: string }>(
      `select action, actor_role, admin_user_id, target_entity, target_id from admin_audit_log
        where action like 'academy_config.%' order by created_at, id`,
    );
    expect(audit.map((row) => row.action)).toEqual([
      'academy_config.create',
      'academy_config.update',
      'academy_config.delete',
    ]);
    for (const row of audit)
      expect(row).toMatchObject({ actor_role: 'admin', admin_user_id: admin.id, target_entity: 'academy_config', target_id: item.id });

    // The default config is edited in place (and logged under "default"), then restored.
    const edited = await as(admin, 'PUT', `${CONFIGS}/${defaultId}`, { mode: 'sequential', chapter_ids: ALL });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json()).toMatchObject({ id: defaultId, owner_type: 'default', mode: 'sequential' });
    expect((await progressOf(loose)).access_mode).toBe('sequential');
    const restored = await as(admin, 'PUT', `${CONFIGS}/${defaultId}`, { mode: 'free', chapter_ids: ALL });
    expect(restored.statusCode, restored.body).toBe(200);
    expect((await progressOf(loose)).access_mode).toBe('free');
    const defaultLogs = json<{ items: Array<{ action: string }> }>(
      await as(admin, 'GET', `${CONFIGS}/${defaultId}/logs`),
    ).items;
    expect(defaultLogs.map((entry) => entry.action)).toEqual(['update', 'update']);
  }, 60_000);

  it('resolves every learner own config from his group, numbers his chapters from 1 and applies a change at once (spec §2, §3, §8.2)', async () => {
    await setConfig(leadA, 'sequential', without('ch02'));
    const n = requiredOf(without('ch02'));
    expect(n).toBe(116 - requiredOf(['ch02']));

    // Group A: the lead himself and his member learn the lead's config, in order, 11 chapters.
    for (const session of [leadA, memberA]) {
      const catalog = await catalogOf(session);
      expect(catalog).toMatchObject({ mode: 'sequential', required_total: n });
      expect(catalog.chapters.map((chapter) => chapter.chapter_id)).toEqual(without('ch02'));
      expect(catalog.chapters.map((chapter) => chapter.display_no)).toEqual(
        Array.from({ length: 11 }, (_, index) => index + 1),
      );
      // The exam of the second chapter of this group is "Bài thi Chương 2" (it is ch03 in the catalog).
      const exam = catalog.chapters[1]!.items.find((entry) => entry.id === 'ch03-exam')!;
      expect(exam.name).toBe('Bài thi Chương 2');
      expect(exam.intro).toContain('Chương 2');
      expect(exam.intro).not.toContain('{n}');
      expect(exam.chapter_display_no).toBe(2);
      const progress = await progressOf(session);
      expect(progress).toMatchObject({
        access_mode: 'sequential',
        course_total: n,
        course_done: 0,
        next_item_id: 'ch01-l01',
      });
      expect(progress.chapters.map((chapter) => [chapter.chapter_id, chapter.display_no])).toEqual(
        without('ch02').map((id, index) => [id, index + 1]),
      );
      expect(progress.items.some((entry) => entry.id.startsWith('ch02-'))).toBe(false);
    }

    // Everyone else learns the default: free, all 12 chapters, N = 116 (the admin view is the built-in one).
    for (const session of [memberB, leadB, loose, admin]) {
      const catalog = await catalogOf(session);
      expect(catalog).toMatchObject({ mode: 'free', required_total: 116 });
      expect(catalog.chapters).toHaveLength(12);
      expect(catalog.chapters.map((chapter) => chapter.display_no)).toEqual(
        Array.from({ length: 12 }, (_, index) => index + 1),
      );
    }

    // A chapter outside the config is not served (404); the content of an item that is not its turn yet is not either
    // (403, the lock frame of spec §4); an open item and the same chapter in the default group are.
    const outside = await academy(memberA, 'GET', 'lessons/ch02-l01');
    expect(outside.statusCode).toBe(404);
    expect(codeOf(outside)).toBe('ACADEMY_ITEM_NOT_IN_PROGRAM');
    expect((await academy(memberB, 'GET', 'lessons/ch02-l01')).statusCode).toBe(200);
    const locked = await academy(memberA, 'GET', 'lessons/ch01-l02');
    expect(locked.statusCode).toBe(403);
    expect(codeOf(locked)).toBe('ACADEMY_ITEM_LOCKED');
    expect(locked.json()).not.toHaveProperty('sections');
    const open = await academy(memberA, 'GET', 'lessons/ch01-l01');
    expect(open.statusCode, open.body).toBe(200);
    expect(open.json()).toMatchObject({ id: 'ch01-l01', chapter_id: 'ch01', chapter_display_no: 1, state: 'open' });
    expect(await academy(memberA, 'POST', 'attempts', {
      lesson_id: 'ch01-l02',
      catalog_version: ACADEMY_V4_CATALOG_VERSION,
      idempotency_key: randomUUID(),
    }).then((response) => response.statusCode)).toBe(403);
    expect(
      await academy(memberA, 'POST', 'attempts', {
        lesson_id: 'ch02-l01',
        catalog_version: ACADEMY_V4_CATALOG_VERSION,
        idempotency_key: randomUUID(),
      }).then((response) => response.statusCode),
    ).toBe(404);

    // A save applies at once to the lead and his member: free mode, all chapters.
    await setConfig(leadA, 'free', ALL);
    for (const session of [leadA, memberA]) {
      expect(await progressOf(session)).toMatchObject({ access_mode: 'free', course_total: 116 });
    }
    expect((await academy(memberA, 'GET', 'lessons/ch02-l01')).statusCode).toBe(200);
    expect((await academy(memberA, 'GET', 'lessons/ch01-l02')).statusCode).toBe(200);
    await clearConfig(leadA);
  }, 60_000);

  it('follows a learner who leaves a group, joins another one, or whose lead is revoked (spec §7, §8.2)', async () => {
    const small = ['ch01', 'ch03'];
    await setConfig(leadA, 'sequential', small);
    expect(await progressOf(memberA)).toMatchObject({ access_mode: 'sequential', course_total: requiredOf(small) });

    const reason = { reason: 'Chuyển nhóm thử' };
    const left = await as(admin, 'POST', `${ADMIN_TEAM_LEADS}/${leadA.id}/members/${memberA.id}/remove`, reason);
    expect([200, 201], left.body).toContain(left.statusCode);
    // Out of the group: the default config at once, nothing else to do.
    expect(await progressOf(memberA)).toMatchObject({ access_mode: 'free', course_total: 116 });

    const joined = await as(admin, 'POST', `${ADMIN_TEAM_LEADS}/${leadB.id}/members`, { user_id: memberA.id, ...reason });
    expect(joined.statusCode, joined.body).toBe(201);
    // leadB has no own config yet: still the default; with one: his.
    expect(await progressOf(memberA)).toMatchObject({ access_mode: 'free', course_total: 116 });
    await setConfig(leadB, 'free', ['ch01', 'ch05']);
    expect(await progressOf(memberA)).toMatchObject({ access_mode: 'free', course_total: requiredOf(['ch01', 'ch05']) });
    expect((await academy(memberB, 'GET', 'lessons/ch05-l01')).statusCode).toBe(200);
    expect((await academy(memberB, 'GET', 'lessons/ch03-l01')).statusCode).toBe(404);
    // "Về mặc định" for leadB sends both of his learners back to the default.
    await clearConfig(leadB);
    for (const session of [memberA, memberB, leadB])
      expect(await progressOf(session)).toMatchObject({ access_mode: 'free', course_total: 116 });

    // Back to the first group.
    const away = await as(admin, 'POST', `${ADMIN_TEAM_LEADS}/${leadB.id}/members/${memberA.id}/remove`, reason);
    expect([200, 201], away.body).toContain(away.statusCode);
    const back = await as(admin, 'POST', `${ADMIN_TEAM_LEADS}/${leadA.id}/members`, { user_id: memberA.id, ...reason });
    expect(back.statusCode, back.body).toBe(201);
    expect(await progressOf(memberA)).toMatchObject({ access_mode: 'sequential', course_total: requiredOf(small) });

    // A revoked lead keeps his members and their config; he himself learns the default (no group any more).
    const leadC = await registerAndLogin(app, 'cfg-lead-c');
    await appoint(leadC);
    const memberC = await joinByCode(leadC.username, 'cfg-member-c');
    await setConfig(leadC, 'sequential', ['ch01']);
    expect(await progressOf(leadC)).toMatchObject({ access_mode: 'sequential', course_total: requiredOf(['ch01']) });
    const revoked = await as(admin, 'POST', `${ADMIN_TEAM_LEADS}/${leadC.id}/revoke`, { reason: 'Thu hồi thử' });
    expect([200, 201], revoked.body).toContain(revoked.statusCode);
    expect(await progressOf(memberC)).toMatchObject({ access_mode: 'sequential', course_total: requiredOf(['ch01']) });
    expect(await progressOf(await login(leadC))).toMatchObject({ access_mode: 'free', course_total: 116 });
    const row = (await list()).items.find((entry) => entry.leader?.user_id === leadC.id);
    expect(row).toMatchObject({ leader: { status: 'revoked' }, mode: 'sequential', user_count: 1 });
    await clearConfig(leadC);
    expect(await progressOf(memberC)).toMatchObject({ access_mode: 'free', course_total: 116 });
    await clearConfig(leadA);
  }, 90_000);

  it('keeps every completion, attempt and xu when a config removes a chapter, and shows it to staff as outside the program (spec §7, §8.4)', async () => {
    const learner = await joinByCode(leadA.username, 'cfg-keep');
    await setConfig(leadA, 'free', ALL);

    // One real pass (+xu) in chapter 1, one carried completion and one attempt left open in chapter 5.
    const first = await submit(learner, await startAttempt(learner, 'ch01-l01'), 'ch01-l01');
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ passed: true, reward: { status: 'credited' } });
    await pass(learner, [content.items.get('ch05-l01')!.lesson_key]);
    const inFlight = await startAttempt(learner, 'ch05-l02');
    const rows = async () => ({
      completions: await stack.query('select lesson_key from academy_completions where user_id = $1 order by lesson_key', [learner.id]),
      rewards: await stack.query('select lesson_key, ledger_id from lesson_rewards where user_id = $1', [learner.id]),
      attempts: await stack.query('select id, status from academy_attempts where user_id = $1 order by id', [learner.id]),
    });
    const before = await rows();
    expect(before.completions).toHaveLength(2);
    expect(before.rewards).toHaveLength(1);
    const coinsBefore = json<User360>(await as(admin, 'GET', `/api/v2/admin/users/${learner.id}/360`)).academy.learning_coins;
    expect(coinsBefore).toBeGreaterThan(0);
    expect(await progressOf(learner)).toMatchObject({ course_done: 2, course_total: 116 });

    // The lead's config drops chapter 5: N and "x / N" count the chapters left, nothing is deleted, no xu moves.
    await setConfig(leadA, 'free', without('ch05'));
    expect(await progressOf(learner)).toMatchObject({ course_done: 1, course_total: requiredOf(without('ch05')) });
    expect(await rows()).toEqual(before);
    const hidden = await academy(learner, 'GET', 'lessons/ch05-l01');
    expect(hidden.statusCode).toBe(404);
    expect(codeOf(hidden)).toBe('ACADEMY_ITEM_NOT_IN_PROGRAM');

    // Staff keep seeing the removed chapter in the user's history, flagged out of the program (spec §8.4).
    for (const [session, url] of [
      [admin, `/api/v2/admin/users/${learner.id}/360`],
      [leadA, `${TEAM}/users/${learner.id}`],
    ] as const) {
      const response = await as(session, 'GET', url);
      expect(response.statusCode, response.body).toBe(200);
      const view = json<User360>(response).academy;
      expect(view.config).toEqual({ source: 'leader', mode: 'free', chapter_count: 11, chapter_total: 12 });
      expect(view).toMatchObject({ total: requiredOf(without('ch05')), completed: 1, learning_coins: coinsBefore });
      expect(view.chapters).toHaveLength(12);
      const kept = view.chapters.find((chapter) => chapter.chapter_id === 'ch05')!;
      expect(kept).toMatchObject({ display_no: null, in_program: false });
      expect(kept.lessons.find((lesson) => lesson.lesson_id === 'ch05-l01')?.status).toBe('completed');
      const numbers = view.chapters.filter((chapter) => chapter.in_program).map((chapter) => chapter.display_no);
      expect(numbers).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    }

    // The attempt that was open in the removed chapter is refused and records nothing...
    const refused = await submit(learner, inFlight, 'ch05-l02');
    expect(refused.statusCode, refused.body).toBe(404);
    expect(codeOf(refused)).toBe('ACADEMY_ITEM_NOT_IN_PROGRAM');
    expect(await rows()).toEqual(before);
    // ...and counts again once the chapter is back: the carried completion shows up in "x / N" without any copy.
    await setConfig(leadA, 'free', ALL);
    expect(await progressOf(learner)).toMatchObject({ course_done: 2, course_total: 116 });
    const passed = await submit(learner, inFlight, 'ch05-l02');
    expect(passed.statusCode, passed.body).toBe(200);
    expect(passed.json()).toMatchObject({ passed: true });
    expect(await progressOf(learner)).toMatchObject({ course_done: 3 });
    await clearConfig(leadA);
  }, 90_000);

  it('locks the chapters after a chapter added before the learner position until it is completed (spec §7, owner decision §11.2)', async () => {
    const learner = await joinByCode(leadA.username, 'cfg-seq');
    const group = without('ch02');
    await setConfig(leadA, 'sequential', group);
    // Chapter 1 passed (lessons and exam): the next item is ch03-l01, the first lesson of "Chương 2" of this group.
    await pass(learner, chainKeys(['ch01']));
    const lessonState = async (itemId: string) =>
      (await progressOf(learner)).items.find((entry) => entry.id === itemId)?.state;
    expect(await progressOf(learner)).toMatchObject({
      next_item_id: 'ch03-l01',
      course_done: requiredOf(['ch01']),
      course_total: requiredOf(group),
    });
    expect(await lessonState('ch03-l01')).toBe('open');
    expect(await lessonState('ch03-l02')).toBe('locked');

    // The admin adds the chapter before his position: it opens, everything after it locks until it is done.
    await setConfig(leadA, 'sequential', ALL);
    const progress = await progressOf(learner);
    expect(progress).toMatchObject({ next_item_id: 'ch02-l01', course_done: requiredOf(['ch01']), course_total: 116 });
    expect(await lessonState('ch02-l01')).toBe('open');
    expect(await lessonState('ch03-l01')).toBe('locked');
    const locked = await academy(learner, 'GET', 'lessons/ch03-l01');
    expect(locked.statusCode).toBe(403);
    expect(codeOf(locked)).toBe('ACADEMY_ITEM_LOCKED');
    expect((await academy(learner, 'GET', 'lessons/ch02-l01')).statusCode).toBe(200);
    // Nothing he passed is lost: chapter 1 is still done.
    expect(progress.chapters.find((chapter) => chapter.chapter_id === 'ch01')).toMatchObject({ done: requiredOf(['ch01']) });

    // Once the added chapter is passed his place is where he was.
    await pass(learner, chainKeys(['ch02']));
    expect(await progressOf(learner)).toMatchObject({ next_item_id: 'ch03-l01' });
    expect(await lessonState('ch03-l01')).toBe('open');
    expect((await academy(learner, 'GET', 'lessons/ch03-l01')).statusCode).toBe(200);

    // Free mode never locks: whatever the chain says, the same learner opens any item of his chapters.
    await setConfig(leadA, 'free', without('ch04'));
    expect((await academy(learner, 'GET', 'lessons/ch12-l08')).statusCode).toBe(200);
    expect(await lessonState('ch12-l08')).toBe('open');
    await clearConfig(leadA);
  }, 90_000);

  it('opens the lesson of a metric under the chapter number of the learner config (spec §4, §2)', async () => {
    const group = without('ch02');
    await setConfig(leadA, 'sequential', group);
    // "nim" is taught by ch10-l01: chapter 9 of group A (not its turn yet), chapter 10 of the default group.
    const mine = await academy(memberA, 'GET', 'link?metric=nim');
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json()).toMatchObject({
      found: true,
      lesson_id: 'ch10-l01',
      chapter_id: 'ch10',
      chapter_display_no: 9,
      locked: true,
      matched_by: 'metric_key',
    });
    const other = await academy(memberB, 'GET', 'link?metric=nim');
    expect(other.json()).toMatchObject({ found: true, lesson_id: 'ch10-l01', chapter_display_no: 10, locked: false });
    // The lock frame, not the lesson: the content call is refused for the learner who is not at this lesson yet.
    expect((await academy(memberA, 'GET', 'lessons/ch10-l01')).statusCode).toBe(403);

    // A config without the chapter: the metric resolves to nothing (never an error) and the learner's own lesson opens.
    await setConfig(leadA, 'free', without('ch10'));
    const gone = await academy(memberA, 'GET', 'link?metric=nim');
    expect(gone.statusCode, gone.body).toBe(200);
    expect(gone.json()).toMatchObject({ found: false, locked: false, chapter_id: null, chapter_display_no: null });
    const currentLesson = json<{ lesson_id: string | null; url: string }>(gone);
    expect(currentLesson.lesson_id).not.toBeNull();
    expect(currentLesson.lesson_id).not.toMatch(/^ch10-/);
    expect(currentLesson.url).toBe(`/hoc-vien/${currentLesson.lesson_id}`);
    await clearConfig(leadA);
  }, 60_000);

  it('reads the config of a team lead as his own group sees it (spec §1.3, §10)', async () => {
    await setConfig(leadA, 'sequential', without('ch02', 'ch11'));
    const own = await as(leadA, 'GET', `${TEAM}/academy-config`);
    expect(own.statusCode, own.body).toBe(200);
    const view = json<{
      has_own_config: boolean;
      read_only: boolean;
      mode: Mode;
      chapter_count: number;
      chapter_total: number;
      required_total: number;
      chapters: Array<{ chapter_id: string; display_no: number }>;
    }>(own);
    expect(view).toMatchObject({
      has_own_config: true,
      read_only: true,
      mode: 'sequential',
      chapter_count: 10,
      chapter_total: 12,
      required_total: requiredOf(without('ch02', 'ch11')),
    });
    expect(view.chapters.map((chapter) => [chapter.chapter_id, chapter.display_no])).toEqual(
      without('ch02', 'ch11').map((id, index) => [id, index + 1]),
    );
    // The other lead has none: he reads the default one, and cannot see leadA's.
    const other = await as(leadB, 'GET', `${TEAM}/academy-config`);
    expect(other.json()).toMatchObject({ has_own_config: false, mode: 'free', chapter_count: 12, required_total: 116 });
    // The user list a lead sees carries the progress of his members in their own program (x / N).
    const members = await as(leadA, 'GET', `${TEAM}/users?search=${encodeURIComponent(memberA.username)}`);
    expect(members.statusCode, members.body).toBe(200);
    const [row] = json<{ items: Array<{ id: string; academy: { total: number } }> }>(members).items;
    expect(row).toMatchObject({ id: memberA.id, academy: { total: requiredOf(without('ch02', 'ch11')) } });
    await clearConfig(leadA);
    const back = await as(leadA, 'GET', `${TEAM}/academy-config`);
    expect(back.json()).toMatchObject({ has_own_config: false, chapter_count: 12 });
  }, 60_000);
});

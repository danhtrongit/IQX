import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadAcademyContent } from '../../src/modules/academy/academy.content.js';
import { ACADEMY_V4_CATALOG_VERSION } from '../../src/modules/academy/content/v4/schema.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// Học viện v4 against a real PostgreSQL with migrations 0026 and 0037 (design §9 system cases):
// exam attempts without lesson content, insert-once scenario choices and notes under concurrency,
// one reward under concurrent passes, no reward for exams, 0026 re-run on legacy rows and the
// narrow rollback (old-code attempt writes still accepted by the new schema), plus the v4 rules:
// free learning (nothing locked), the deep link, the lesson opened last and the carry-over of
// v3.3 completions by key.
const MIGRATION = new URL('../../migrations/0026_academy_v32.sql', import.meta.url);
const MIGRATION_V4 = new URL('../../migrations/0037_academy_v4.sql', import.meta.url);
const BASE = '/api/v2/academy';

type Session = Awaited<ReturnType<typeof registerAndLogin>>;

const content = loadAcademyContent();

const keysBefore = (itemId: string) => {
  const at = content.sequence.findIndex((entry) => entry.id === itemId);
  return content.sequence
    .slice(0, at)
    .filter((entry) => !entry.optional)
    .map((entry) => entry.lesson_key);
};

const correctAnswers = (itemId: string) =>
  content.items.get(itemId)!.bank.questions.map((question) => ({
    question_id: question.id,
    option_id: question.correct_option_id,
  }));

describe('system acceptance: Học viện v4', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    stack = await startSystemStack({ ACADEMY_ENABLED: 'true' });
    app = stack.app;
  }, 120_000);

  afterAll(async () => {
    await stack?.close();
  });

  const call = (session: Session, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({
      method,
      url: `${BASE}/${url}`,
      headers: authHeader(session.accessToken),
      ...(payload ? { payload } : {}),
    });

  /** Seeds legacy completions so `itemId` is open for the user. */
  async function openFor(session: Session, itemId: string) {
    for (const key of keysBefore(itemId))
      await stack.query(
        `insert into academy_completions
           (user_id, lesson_key, catalog_version, lesson_id, completion_method, source)
         values ($1, $2, $3, 'seed', 'legacy_migration', '{}'::jsonb)
         on conflict do nothing`,
        [session.id, key, ACADEMY_V4_CATALOG_VERSION],
      );
  }

  async function startAttempt(session: Session, itemId: string, key = randomUUID()) {
    const response = await call(session, 'POST', 'attempts', {
      lesson_id: itemId,
      catalog_version: ACADEMY_V4_CATALOG_VERSION,
      idempotency_key: key,
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json() as { attempt_id: string; total: number; kind: string };
  }

  it('creates and passes a chapter exam with NULL content_version and no lesson reward', async () => {
    const user = await registerAndLogin(app, 'acad-exam');
    await openFor(user, 'ch01-exam');
    const attempt = await startAttempt(user, 'ch01-exam');
    expect(attempt).toMatchObject({ kind: 'chapter_exam', total: 20 });
    const [row] = await stack.query(
      'select kind, content_version, cardinality(question_ids) as n from academy_attempts where id = $1',
      [attempt.attempt_id],
    );
    expect(row).toMatchObject({ kind: 'chapter_exam', content_version: null, n: 20 });

    const submit = await call(user, 'POST', `attempts/${attempt.attempt_id}/submit`, {
      answers: correctAnswers('ch01-exam'),
    });
    expect(submit.statusCode, submit.body).toBe(200);
    expect(submit.json()).toMatchObject({
      passed: true,
      score: 20,
      reward: null,
      chapter_completed: 1,
      next_item_id: 'ch02-l01',
    });
    expect(
      await stack.query('select 1 from lesson_rewards where user_id = $1', [user.id]),
    ).toHaveLength(0);
    await expect(
      stack.query(
        `insert into lesson_rewards
           (user_id, lesson_key, lesson_id, catalog_version, completion_method, completed_at,
            ledger_id, policy_version)
         values ($1, 'exam:ch01', 'ch01-exam', $2, 'quiz', now(), $3, 'test')`,
        [user.id, ACADEMY_V4_CATALOG_VERSION, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('stores one scenario choice under concurrent POSTs with different choices', async () => {
    const user = await registerAndLogin(app, 'acad-scen');
    await openFor(user, 'ch02-l01');
    const responses = await Promise.all(
      [0, 2, 1].map((choice) => call(user, 'POST', 'lessons/ch02-l01/scenario', { choice })),
    );
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    const bodies = responses.map(
      (response) => response.json() as { choice: number; created: boolean; chosen_at: string },
    );
    expect(new Set(bodies.map((body) => `${body.choice}|${body.chosen_at}`)).size).toBe(1);
    expect(bodies.filter((body) => body.created)).toHaveLength(1);
    expect(
      await stack.query('select choice from academy_scenario_choices where user_id = $1', [
        user.id,
      ]),
    ).toHaveLength(1);
    // The quiz gate is now satisfied.
    expect((await startAttempt(user, 'ch02-l01')).total).toBe(3);
  });

  it('serializes concurrent first notes saves: one 200 and one 409, never 500', async () => {
    const user = await registerAndLogin(app, 'acad-notes');
    await openFor(user, 'ch02-l03');
    const responses = await Promise.all([
      call(user, 'PUT', 'lessons/ch02-l03/notes', { texts: { l3: 'a' }, expected_revision: 0 }),
      call(user, 'PUT', 'lessons/ch02-l03/notes', { texts: { l3: 'b' }, expected_revision: 0 }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const conflict = responses.find((response) => response.statusCode === 409)!;
    expect(conflict.json()).toMatchObject({
      error: { code: 'NOTES_REVISION_CONFLICT', details: [{ notes: { revision: 1 } }] },
    });
    // Unguarded concurrent saves both land, revisions grow, no PK violation.
    const unguarded = await Promise.all([
      call(user, 'PUT', 'lessons/ch02-l03/notes', { checks: { 'l3:0': true } }),
      call(user, 'PUT', 'lessons/ch02-l03/notes', { checks: { 'l3:1': true } }),
    ]);
    expect(unguarded.map((response) => response.statusCode)).toEqual([200, 200]);
    const notes = (await call(user, 'GET', 'lessons/ch02-l03/notes')).json() as {
      revision: number;
      checks: Record<string, boolean>;
    };
    expect(notes.revision).toBe(3);
    expect(notes.checks).toEqual({ 'l3:0': true, 'l3:1': true });
  });

  it('pays exactly one +100 for two concurrent passing submits of one lesson', async () => {
    const user = await registerAndLogin(app, 'acad-reward');
    const first = await startAttempt(user, 'ch01-l01');
    const second = await startAttempt(user, 'ch01-l01');
    const answers = correctAnswers('ch01-l01');
    const results = await Promise.all(
      [first, second].map((attempt) =>
        call(user, 'POST', `attempts/${attempt.attempt_id}/submit`, { answers }),
      ),
    );
    for (const response of results) expect(response.statusCode, response.body).toBe(200);
    const credited = results
      .map((response) => response.json() as { reward: { status: string } | null })
      .filter((body) => body.reward?.status === 'credited');
    expect(credited).toHaveLength(1);
    expect(
      await stack.query('select 1 from lesson_rewards where user_id = $1', [user.id]),
    ).toHaveLength(1);
    expect(
      await stack.query('select 1 from academy_completions where user_id = $1', [user.id]),
    ).toHaveLength(1);
  });

  it('re-runs 0026 on legacy rows and still accepts old-code attempt writes', async () => {
    const user = await registerAndLogin(app, 'acad-legacy');
    const legacyId = randomUUID();
    const questionIds = Array.from({ length: 8 }, (_, index) => `ch01-l01-q0${index + 1}`);
    // Old code: no kind column, content_version always supplied, 8 questions, score 8.
    await stack.query(
      `insert into academy_attempts
         (id, user_id, lesson_id, lesson_key, catalog_version, content_version, questions_version,
          question_ids, option_orders, idempotency_key)
       values ($1, $2, 'ch01-l01', 'technical:rsi', 'iqx-academy-outline-13ch-71lessons-v1',
               '2.0.0', repeat('a', 64), $3::text[], '{}'::jsonb, 'legacy-key-0001')`,
      [legacyId, user.id, questionIds],
    );
    await stack.query(
      `update academy_attempts set status = 'submitted', submitted_at = now(), score = 8, passed = true
       where id = $1`,
      [legacyId],
    );
    await stack.query(
      `insert into academy_completions
         (user_id, lesson_key, catalog_version, lesson_id, completion_method, attempt_id, source)
       values ($1, 'technical:rsi', 'iqx-academy-outline-13ch-71lessons-v1', 'ch01-l01',
               'legacy_migration', $2, '{"migration": "0014_academy_catalog_v1"}'::jsonb)`,
      [user.id, legacyId],
    );
    const sql = await readFile(MIGRATION, 'utf8');
    await stack.query(sql);
    await stack.query(sql);
    const [attempt] = await stack.query(
      'select kind, score, content_version from academy_attempts where id = $1',
      [legacyId],
    );
    expect(attempt).toMatchObject({ kind: 'lesson', score: 8, content_version: '2.0.0' });
    // The carried technical:rsi key reads as a passed ch04-l06 (and opens nothing: no tool is gated).
    const progress = (await call(user, 'GET', 'progress')).json() as {
      items: Array<{ id: string; state: string }>;
      course_done: number;
      course_total: number;
    };
    expect(progress.items.find((entry) => entry.id === 'ch04-l06')?.state).toBe('passed');
    expect(progress).toMatchObject({ course_done: 1, course_total: 116 });
    expect(progress).not.toHaveProperty('granted_capabilities');
    // A score above the attempt's own question count is refused by the new check.
    await expect(
      stack.query('update academy_attempts set score = 9 where id = $1', [legacyId]),
    ).rejects.toMatchObject({ code: '23514' });
    // The old submitted attempt replays score-only through the new API.
    const replay = await call(user, 'POST', `attempts/${legacyId}/submit`, { answers: [] });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toMatchObject({ score: 8, total: 8, passed: true, next_item_id: null });
  });

  it('applies 0037 twice and remembers the lesson opened last (one row per account)', async () => {
    const sql = await readFile(MIGRATION_V4, 'utf8');
    await stack.query(sql);
    await stack.query(sql);
    const user = await registerAndLogin(app, 'acad-opened');
    const first = await call(user, 'GET', 'progress');
    expect(first.json()).toMatchObject({ current_item_id: 'ch01-l01', access_mode: 'free' });

    expect((await call(user, 'GET', 'lessons/ch10-l01')).statusCode).toBe(200);
    expect(
      await stack.query(
        'select lesson_key, lesson_id from academy_last_opened where user_id = $1',
        [user.id],
      ),
    ).toEqual([{ lesson_key: 'fundamental:nim', lesson_id: 'ch10-l01' }]);
    expect((await call(user, 'GET', 'progress')).json()).toMatchObject({
      current_item_id: 'ch10-l01',
    });

    // Re-opening the same lesson within a minute writes nothing; another one replaces the row.
    const openedAt = async () =>
      (
        await stack.query<{ opened_at: Date }>(
          'select opened_at from academy_last_opened where user_id = $1',
          [user.id],
        )
      )[0]!.opened_at.getTime();
    const before = await openedAt();
    await call(user, 'GET', 'lessons/ch10-l01');
    expect(await openedAt()).toBe(before);
    await call(user, 'GET', 'lessons/ch12-exam');
    expect(
      await stack.query('select lesson_key from academy_last_opened where user_id = $1', [user.id]),
    ).toEqual([{ lesson_key: 'exam:ch12-v4' }]);
    // The optional practice never becomes the current lesson; a stale v3.3 key still resolves by key.
    await call(user, 'GET', 'lessons/ch03-practice');
    expect((await call(user, 'GET', 'progress')).json()).toMatchObject({
      current_item_id: 'ch12-exam',
    });
    await stack.query(
      `update academy_last_opened set lesson_key = 'fundamental:roe', lesson_id = 'ch10-l01',
              catalog_version = 'iqx-academy-v3.3-13ch-87lessons' where user_id = $1`,
      [user.id],
    );
    expect((await call(user, 'GET', 'progress')).json()).toMatchObject({
      current_item_id: 'ch08-l11',
    });
    // The key format check refuses anything that is not a lesson key.
    await expect(
      stack.query(`update academy_last_opened set lesson_key = 'Not A Key' where user_id = $1`, [
        user.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('opens everything for a new learner: any lesson, exam and the practice, no ACADEMY_ITEM_LOCKED', async () => {
    const user = await registerAndLogin(app, 'acad-free');
    for (const id of ['ch12-l08', 'ch12-exam', 'ch08-exam', 'ch03-practice', 'ch07-l07']) {
      const lesson = await call(user, 'GET', `lessons/${id}`);
      expect(lesson.statusCode, `${id}: ${lesson.body}`).toBe(200);
      expect(lesson.json()).toMatchObject({ id, state: 'open' });
    }
    // The last chapter's exam can be taken at once, and passing it needs nothing else.
    const attempt = await startAttempt(user, 'ch12-exam');
    expect(attempt).toMatchObject({ kind: 'chapter_exam', total: 30 });
    const submit = await call(user, 'POST', `attempts/${attempt.attempt_id}/submit`, {
      answers: correctAnswers('ch12-exam'),
    });
    expect(submit.statusCode, submit.body).toBe(200);
    expect(submit.json()).toMatchObject({ passed: true, reward: null, chapter_completed: 12 });
    expect(
      await stack.query('select lesson_key from academy_completions where user_id = $1', [user.id]),
    ).toEqual([{ lesson_key: 'exam:ch12-v4' }]);
    // The scenario gate of chapters 2-3 stays.
    const gated = await call(user, 'POST', 'attempts', {
      lesson_id: 'ch02-l05',
      catalog_version: ACADEMY_V4_CATALOG_VERSION,
      idempotency_key: randomUUID(),
    });
    expect(gated.statusCode).toBe(403);
    expect(gated.json()).toMatchObject({ error: { code: 'ACADEMY_SCENARIO_REQUIRED' } });
  });

  it('carries v3.3 completions over by key: no new reward, the old exam does not pass the new one', async () => {
    const user = await registerAndLogin(app, 'acad-carry');
    // v3.3 data: ROE was ch10-l01 and its exam exam:ch10; both were completed and ROE was paid.
    await stack.query(
      `insert into academy_completions
         (user_id, lesson_key, catalog_version, lesson_id, completion_method, source)
       values ($1, 'fundamental:roe', 'iqx-academy-v3.3-13ch-87lessons', 'ch10-l01', 'legacy_migration',
               '{"reward": {"status": "credited", "delta": 100, "balance_after": 100}}'::jsonb),
              ($1, 'exam:ch10', 'iqx-academy-v3.3-13ch-87lessons', 'ch10-exam', 'legacy_migration', '{}'::jsonb)`,
      [user.id],
    );
    const progress = (await call(user, 'GET', 'progress')).json() as {
      items: Array<{ id: string; state: string }>;
      course_done: number;
    };
    const state = (id: string) => progress.items.find((entry) => entry.id === id)?.state;
    expect(state('ch08-l11')).toBe('passed');
    expect(state('ch10-exam')).toBe('open');
    expect(progress.course_done).toBe(1);
    // Passing the carried lesson again records nothing new and pays nothing.
    const attempt = await startAttempt(user, 'ch08-l11');
    const submit = await call(user, 'POST', `attempts/${attempt.attempt_id}/submit`, {
      answers: correctAnswers('ch08-l11'),
    });
    expect(submit.json()).toMatchObject({
      passed: true,
      reward: null,
      completion: { newly_completed: false },
    });
    expect(
      await stack.query('select 1 from academy_completions where user_id = $1', [user.id]),
    ).toHaveLength(2);
    expect(
      await stack.query('select 1 from lesson_rewards where user_id = $1', [user.id]),
    ).toHaveLength(0);
  });

  it('serves the deep link: metric key, lesson name, and the lesson being learned when nothing matches', async () => {
    const user = await registerAndLogin(app, 'acad-link');
    const byKey = await call(user, 'GET', 'link?metric=nim');
    expect(byKey.statusCode, byKey.body).toBe(200);
    expect(byKey.json()).toMatchObject({
      found: true,
      lesson_id: 'ch10-l01',
      locked: false,
      chapter_id: 'ch10',
      chapter_display_no: 10,
      matched_by: 'metric_key',
      url: '/hoc-vien/ch10-l01',
    });
    const byName = await call(
      user,
      'GET',
      `link?metric=${encodeURIComponent('Tỷ lệ dự phòng / Dư nợ')}`,
    );
    expect(byName.json()).toMatchObject({
      found: true,
      lesson_id: 'ch10-l07',
      matched_by: 'title_prefix',
    });
    await call(user, 'GET', 'lessons/ch11-l04');
    const nothing = await call(user, 'GET', 'link?metric=khong-co-chi-tieu-nay');
    expect(nothing.statusCode, nothing.body).toBe(200);
    expect(nothing.json()).toMatchObject({
      found: false,
      lesson_id: 'ch11-l04',
      locked: false,
      url: '/hoc-vien/ch11-l04',
    });
    expect((await call(user, 'GET', 'link')).statusCode).toBe(422);
    expect((await call(user, 'GET', 'link?metric=')).statusCode).toBe(422);
    const anonymous = await app.inject({ method: 'GET', url: `${BASE}/link?metric=nim` });
    expect(anonymous.statusCode).toBe(401);
  });
});

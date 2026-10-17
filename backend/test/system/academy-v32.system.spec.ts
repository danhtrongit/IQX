import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadAcademyContent } from '../../src/modules/academy/academy.content.js';
import { ACADEMY_V3_CATALOG_VERSION } from '../../src/modules/academy/content/v3/schema.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// Học viện v3.2 against a real PostgreSQL with migration 0026 (design §9 system cases): exam
// attempts without lesson content, insert-once scenario choices and notes under concurrency,
// one reward under concurrent passes, no reward for exams, 0026 re-run on legacy rows and the
// narrow rollback (old-code attempt writes still accepted by the new schema).
const MIGRATION = new URL('../../migrations/0026_academy_v32.sql', import.meta.url);
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

describe('system acceptance: Học viện v3.2', () => {
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
        [session.id, key, ACADEMY_V3_CATALOG_VERSION],
      );
  }

  async function startAttempt(session: Session, itemId: string, key = randomUUID()) {
    const response = await call(session, 'POST', 'attempts', {
      lesson_id: itemId,
      catalog_version: ACADEMY_V3_CATALOG_VERSION,
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
        [user.id, ACADEMY_V3_CATALOG_VERSION, randomUUID()],
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
    // The carried technical:rsi key reads as a passed ch04-l06 and grants the indicator.
    const progress = (await call(user, 'GET', 'progress')).json() as {
      items: Array<{ id: string; state: string }>;
      granted_capabilities: string[];
    };
    expect(progress.items.find((entry) => entry.id === 'ch04-l06')?.state).toBe('passed');
    expect(progress.granted_capabilities).toEqual(['indicator:rsi']);
    // A score above the attempt's own question count is refused by the new check.
    await expect(
      stack.query('update academy_attempts set score = 9 where id = $1', [legacyId]),
    ).rejects.toMatchObject({ code: '23514' });
    // The old submitted attempt replays score-only through the new API.
    const replay = await call(user, 'POST', `attempts/${legacyId}/submit`, { answers: [] });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toMatchObject({ score: 8, total: 8, passed: true, next_item_id: null });
  });
});

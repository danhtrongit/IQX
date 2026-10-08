import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AcademyController } from '../../src/modules/academy/academy.controller.js';
import {
  ACADEMY_CATALOG_VERSION,
  ACADEMY_LEGACY_CATALOG_VERSION,
  loadAcademyContent,
} from '../../src/modules/academy/academy.content.js';
import { AcademySqlStore } from '../../src/modules/academy/academy.repository.js';
import {
  attemptResumeResponseSchema,
  draftSaveSchema,
  historyQuerySchema,
} from '../../src/modules/academy/academy.schemas.js';
import {
  OTHER_USER,
  USER,
  correctAnswers,
  deepKeys,
  setup,
  start,
  wrongAnswer,
} from './academy-test-kit.js';

const here = dirname(fileURLToPath(import.meta.url));

type Started = Awaited<ReturnType<typeof start>>;
type Harness = ReturnType<typeof setup>;

/** The first option of each question, in the attempt's own order. */
const firstOptions = (attempt: Started, count = attempt.questions.length) =>
  attempt.questions.slice(0, count).map((question) => ({
    question_id: question.id,
    option_id: question.options[0]!.id,
  }));

/** Submits the attempt with every answer right (`wrong` = how many to get wrong, from the front). */
async function submitScoring(
  { service, memory }: Harness,
  attempt: Started,
  wrong: number,
  at: number,
  lessonId = 'ch01-l01',
) {
  const answers = correctAnswers(lessonId).map((answer, index) =>
    index < wrong ? { ...answer, option_id: wrongAnswer(lessonId, index) } : answer,
  );
  const result = await service.submit(USER, attempt.attempt_id, { answers });
  // Deterministic order: the in-memory clock may repeat a millisecond.
  memory.attempts.find((row) => row.id === attempt.attempt_id)!.submitted_at = new Date(
    Date.UTC(2026, 0, 1, 0, 0, at),
  );
  return result;
}

describe('academy routes of the resumable attempt', () => {
  it('registers the draft, resume, history and review routes next to the existing ones', () => {
    const routes = Object.getOwnPropertyNames(AcademyController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const handler = (AcademyController.prototype as unknown as Record<string, object>)[name]!;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number;
        return `${['GET', 'POST', 'PUT'][method]} ${path}`;
      });
    expect(routes).toEqual(
      expect.arrayContaining([
        'PUT attempts/:attemptId/answers',
        'GET lessons/:lessonId/attempt',
        'GET lessons/:lessonId/attempts',
        'GET attempts/:attemptId',
        'POST attempts',
        'POST attempts/:attemptId/submit',
      ]),
    );
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('validates the draft body and the history query', () => {
    expect(draftSaveSchema.safeParse({ answers: [] }).success).toBe(true);
    expect(
      draftSaveSchema.safeParse({
        answers: [{ question_id: 'q', option_id: 'o' }],
        expected_revision: 0,
      }).success,
    ).toBe(true);
    expect(draftSaveSchema.safeParse({ answers: [{ question_id: 'q' }] }).success).toBe(false);
    expect(draftSaveSchema.safeParse({ answers: [], expected_revision: -1 }).success).toBe(false);
    expect(draftSaveSchema.safeParse({}).success).toBe(false);
    // Client score/pass fields are not part of the contract: they are dropped, never read.
    expect(draftSaveSchema.parse({ answers: [], score: 8, passed: true, correct: true })).toEqual({
      answers: [],
    });
    expect(historyQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(historyQuerySchema.parse({ limit: '5', offset: '10' })).toEqual({
      limit: 5,
      offset: 10,
    });
    expect(historyQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('migration 0018 and the draft SQL', () => {
  const sql = readFileSync(join(here, '../../migrations/0018_academy_attempt_drafts.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('adds a separate draft table keyed by the attempt, additive and cascading', () => {
    expect(statements).toMatch(/CREATE TABLE IF NOT EXISTS academy_attempt_drafts/);
    expect(statements).toMatch(
      /attempt_id uuid PRIMARY KEY REFERENCES academy_attempts\(id\) ON DELETE CASCADE/,
    );
    expect(statements).toMatch(/selections jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(statements).toMatch(/revision integer NOT NULL DEFAULT 1/);
    expect(statements).toMatch(/CHECK \(jsonb_typeof\(selections\) = 'object'\)/);
    expect(statements).toMatch(/CHECK \(revision >= 1\)/);
    // No correctness column and no touch of the graded or legacy tables.
    expect(statements).not.toMatch(/correct|score|passed/i);
    expect(statements).not.toMatch(
      /DROP |TRUNCATE|DELETE FROM|ALTER TABLE|academy_answers|academy_grants/i,
    );
  });

  it('upserts by attempt, merges selections and bumps the revision', async () => {
    const statementsRun: Array<{ text: string; values?: readonly unknown[] }> = [];
    const store = new AcademySqlStore({
      query: (text: string, values?: readonly unknown[]) => {
        statementsRun.push({ text, values });
        return Promise.resolve([
          { attempt_id: 'a', selections: { q1: 'o1' }, revision: 2, updated_at: new Date() },
        ]);
      },
    } as never);
    const attemptId = '00000000-0000-4000-8000-0000000000aa';
    const saved = await store.saveDraft(attemptId, { q1: 'o1' });
    expect(saved.revision).toBe(2);
    expect(statementsRun[0]!.text).toMatch(/insert into academy_attempt_drafts/);
    expect(statementsRun[0]!.text).toMatch(/on conflict \(attempt_id\) do update/);
    expect(statementsRun[0]!.text).toMatch(/selections \|\| excluded\.selections/);
    expect(statementsRun[0]!.text).toMatch(/revision = academy_attempt_drafts\.revision \+ 1/);
    expect(statementsRun[0]!.values).toEqual([attemptId, '{"q1":"o1"}']);
    await store.deleteDraft(attemptId);
    expect(statementsRun[1]!.text).toMatch(/delete from academy_attempt_drafts where attempt_id/);
  });

  it('reads the owner’s latest open attempt, submitted history and attempt without locking', async () => {
    const statementsRun: Array<{ text: string; values?: readonly unknown[] }> = [];
    const store = new AcademySqlStore({
      query: (text: string, values?: readonly unknown[]) => {
        statementsRun.push({ text, values });
        return Promise.resolve([]);
      },
    } as never);
    await store.latestOpenAttempt(USER, 'technical:rsi', ACADEMY_CATALOG_VERSION);
    await store.submittedAttempts(USER, 'technical:rsi', 20, 40);
    await store.attemptById(USER, '00000000-0000-4000-8000-0000000000aa');
    expect(statementsRun[0]!.text).toMatch(
      /user_id = \$1 and lesson_key = \$2 and catalog_version = \$3 and status = 'open'/,
    );
    expect(statementsRun[0]!.text).toMatch(/order by created_at desc, id desc\s+limit 1/);
    expect(statementsRun[0]!.values).toEqual([USER, 'technical:rsi', ACADEMY_CATALOG_VERSION]);
    expect(statementsRun[1]!.text).toMatch(
      /user_id = \$1 and lesson_key = \$2 and status = 'submitted'/,
    );
    expect(statementsRun[1]!.text).toMatch(
      /order by submitted_at desc, id desc\s+limit \$3 offset \$4/,
    );
    expect(statementsRun[1]!.values).toEqual([USER, 'technical:rsi', 20, 40]);
    expect(statementsRun[2]!.text).toMatch(/where id = \$1 and user_id = \$2/);
    expect(statementsRun[2]!.text).not.toMatch(/for update/);
  });
});

describe('AcademyService draft selections', () => {
  it('saves a partial draft in the attempt order and never grades or reveals correctness', async () => {
    const harness = setup();
    const { service, memory } = harness;
    const attempt = await start(service);
    const picks = firstOptions(attempt, 3);

    const saved = await service.saveDraft(USER, attempt.attempt_id, { answers: picks });
    expect(saved).toMatchObject({
      attempt_id: attempt.attempt_id,
      revision: 1,
      answered_count: 3,
      total: 8,
      answers: picks,
    });
    expect(saved.updated_at).toEqual(expect.any(String));
    expect(
      [...deepKeys(saved)].filter((key) => /correct|explanation|score|passed/i.test(key)),
    ).toEqual([]);
    // Nothing graded: the attempt is still open, no graded rows, no completion, no reward.
    expect(memory.attempts[0]).toMatchObject({ status: 'open', score: null, passed: null });
    expect(memory.answerRows).toHaveLength(0);
    expect(memory.completionRows).toHaveLength(0);
    expect(harness.rewards!.calls).toHaveLength(0);
    expect(memory.draftRows).toHaveLength(1);
  });

  it('merges later saves, replaces a changed choice, and orders answers like the attempt', async () => {
    const { service } = setup();
    const attempt = await start(service);
    const picks = firstOptions(attempt);
    await service.saveDraft(USER, attempt.attempt_id, { answers: [picks[5]!, picks[1]!] });
    const second = await service.saveDraft(USER, attempt.attempt_id, {
      answers: [picks[0]!, { ...picks[1]!, option_id: attempt.questions[1]!.options[2]!.id }],
    });
    expect(second.revision).toBe(2);
    expect(second.answered_count).toBe(3);
    // Attempt order, not request order: q0, q1 (changed), q5.
    expect(second.answers).toEqual([
      picks[0],
      { question_id: picks[1]!.question_id, option_id: attempt.questions[1]!.options[2]!.id },
      picks[5],
    ]);
  });

  it('does not bump the revision when nothing changes (idempotent retry, empty body)', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const picks = firstOptions(attempt, 2);
    expect((await service.saveDraft(USER, attempt.attempt_id, { answers: [] })).revision).toBe(0);
    expect(memory.draftRows).toHaveLength(0);
    const first = await service.saveDraft(USER, attempt.attempt_id, { answers: picks });
    const again = await service.saveDraft(USER, attempt.attempt_id, { answers: picks });
    expect(again).toEqual(first);
    expect(again.revision).toBe(1);
  });

  it('rejects ids that are not the attempt’s questions and options, and stores nothing', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const [q0, q1] = attempt.questions;
    const foreignOption = q1!.options[0]!.id;
    const bodies = [
      [{ question_id: 'ch01-l01-q99', option_id: q0!.options[0]!.id }],
      [{ question_id: 'ch01-l02-q01', option_id: 'a' }],
      [{ question_id: q0!.id, option_id: 'zzz' }],
      [
        { question_id: q0!.id, option_id: q0!.options[0]!.id },
        { question_id: q0!.id, option_id: q0!.options[1]!.id },
      ],
      // One bad item poisons the whole save: no partial write.
      [
        { question_id: q1!.id, option_id: foreignOption },
        { question_id: q0!.id, option_id: 'zzz' },
      ],
    ];
    for (const answers of bodies)
      await expect(service.saveDraft(USER, attempt.attempt_id, { answers })).rejects.toMatchObject({
        status: 422,
        response: { code: 'INVALID_ANSWERS' },
      });
    expect(memory.draftRows).toHaveLength(0);

    const reasons = await service
      .saveDraft(USER, attempt.attempt_id, {
        answers: [
          { question_id: 'ch01-l01-q99', option_id: 'a' },
          { question_id: q0!.id, option_id: 'zzz' },
        ],
      })
      .catch((error: { response: { details: unknown } }) => error.response.details);
    expect(reasons).toEqual([
      { question_id: 'ch01-l01-q99', reason: 'unknown_question' },
      { question_id: q0!.id, reason: 'unknown_option' },
    ]);
  });

  it('is owner-only: a foreign or unknown attempt answers 404 and nothing is stored', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const answers = firstOptions(attempt, 2);
    await expect(
      service.saveDraft(OTHER_USER, attempt.attempt_id, { answers }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
    await expect(
      service.saveDraft(USER, '00000000-0000-4000-8000-0000000000ff', { answers }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
    expect(memory.draftRows).toHaveLength(0);
  });

  it('refuses a submitted attempt (409 ATTEMPT_ALREADY_SUBMITTED) and keeps the result unchanged', async () => {
    const harness = setup();
    const { service, memory } = harness;
    const attempt = await start(service);
    await submitScoring(harness, attempt, 1, 1);
    const result = await service.submit(USER, attempt.attempt_id, { answers: [] });
    await expect(
      service.saveDraft(USER, attempt.attempt_id, { answers: firstOptions(attempt, 2) }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ATTEMPT_ALREADY_SUBMITTED' } });
    expect(memory.draftRows).toHaveLength(0);
    expect(await service.submit(USER, attempt.attempt_id, { answers: [] })).toEqual(result);
  });

  it('refuses an attempt of the legacy catalog or of an unknown bank version', async () => {
    const { service, memory } = setup();
    const legacy = await start(service);
    memory.attempts[0]!.catalog_version = ACADEMY_LEGACY_CATALOG_VERSION;
    memory.attempts[0]!.lesson_key = null;
    await expect(
      service.saveDraft(USER, legacy.attempt_id, { answers: firstOptions(legacy, 1) }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CATALOG_VERSION_MISMATCH' } });
    const stale = await start(service, 'ch01-l01', 'attempt-key-0009');
    memory.attempts.find((row) => row.id === stale.attempt_id)!.questions_version = 'a'.repeat(64);
    await expect(
      service.saveDraft(USER, stale.attempt_id, { answers: firstOptions(stale, 1) }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ASSESSMENT_VERSION_MISMATCH' } });
    expect(memory.draftRows).toHaveLength(0);
  });

  it('guards with expected_revision: 0 for the first save, 409 with the current draft when stale', async () => {
    const { service } = setup();
    const attempt = await start(service);
    const picks = firstOptions(attempt);
    const first = await service.saveDraft(USER, attempt.attempt_id, {
      answers: picks.slice(0, 2),
      expected_revision: 0,
    });
    expect(first.revision).toBe(1);
    const second = await service.saveDraft(USER, attempt.attempt_id, {
      answers: picks.slice(2, 4),
      expected_revision: 1,
    });
    expect(second).toMatchObject({ revision: 2, answered_count: 4 });
    // Another tab still believes in revision 1.
    const stale = await service
      .saveDraft(USER, attempt.attempt_id, { answers: picks.slice(4, 5), expected_revision: 1 })
      .catch((error: unknown) => error);
    expect(stale).toMatchObject({
      status: 409,
      response: {
        code: 'DRAFT_REVISION_CONFLICT',
        details: [{ draft: { revision: 2, answered_count: 4, answers: picks.slice(0, 4) } }],
      },
    });
    // First save with a wrong guess is refused too.
    const fresh = await start(service, 'ch01-l01', 'attempt-key-0002');
    await expect(
      service.saveDraft(USER, fresh.attempt_id, { answers: [], expected_revision: 3 }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'DRAFT_REVISION_CONFLICT' } });
  });

  it('keeps submit strict: the full list is required, a saved draft is neither used nor graded', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    await service.saveDraft(USER, attempt.attempt_id, { answers: firstOptions(attempt) });
    await expect(service.submit(USER, attempt.attempt_id, { answers: [] })).rejects.toMatchObject({
      status: 422,
      response: { code: 'INVALID_ANSWERS' },
    });
    expect(memory.attempts[0]!.status).toBe('open');
    expect(memory.draftRows).toHaveLength(1);
  });

  it('drops the draft when the attempt is submitted', async () => {
    const harness = setup();
    const { service, memory } = harness;
    const attempt = await start(service);
    await service.saveDraft(USER, attempt.attempt_id, { answers: firstOptions(attempt, 4) });
    expect(memory.draftRows).toHaveLength(1);
    const result = await submitScoring(harness, attempt, 0, 1);
    expect(result).toMatchObject({ score: 8, passed: true });
    expect(memory.draftRows).toHaveLength(0);
  });
});

describe('AcademyService resume of the open attempt', () => {
  it('answers attempt null (200) when there is nothing to resume, per owner and lesson', async () => {
    const { service } = setup();
    expect(await service.resumeAttempt(USER, 'ch01-l01')).toEqual({
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      attempt: null,
    });
    const attempt = await start(service);
    expect((await service.resumeAttempt(OTHER_USER, 'ch01-l01')).attempt).toBeNull();
    expect((await service.resumeAttempt(USER, 'ch01-l02')).attempt).toBeNull();
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt?.attempt_id).toBe(
      attempt.attempt_id,
    );
    await expect(service.resumeAttempt(USER, 'ch99-l01')).rejects.toMatchObject({
      status: 404,
      response: { code: 'LESSON_NOT_FOUND' },
    });
    // A guide lesson has no quiz: nothing to resume.
    expect((await service.resumeAttempt(USER, 'ch02-l01')).attempt).toBeNull();
  });

  it('returns the same questions and option order as the start, plus the saved selections', async () => {
    const { service, memory } = setup();
    const started = await start(service);
    const picks = firstOptions(started, 5);
    await service.saveDraft(USER, started.attempt_id, { answers: picks });

    const resumed = await service.resumeAttempt(USER, 'ch01-l01');
    const attempt = resumed.attempt!;
    expect(attemptResumeResponseSchema.parse(resumed)).toEqual(resumed);
    const { created_at: createdAt, draft, ...projection } = attempt;
    expect(projection).toEqual(started);
    expect(createdAt).toBe(memory.attempts[0]!.created_at.toISOString());
    expect(attempt.questions.map((question) => question.id)).toEqual(
      memory.attempts[0]!.question_ids,
    );
    for (const question of attempt.questions)
      expect(question.options.map((option) => option.id)).toEqual(
        memory.attempts[0]!.option_orders[question.id],
      );
    expect(draft).toMatchObject({ revision: 1, answered_count: 5, total: 8, answers: picks });
    // Still no answer key anywhere in the resume payload.
    expect(
      [...deepKeys(resumed)].filter((key) =>
        /correct|explanation|source_id|score|passed/i.test(key),
      ),
    ).toEqual([]);
  });

  it('serves an untouched attempt with revision 0 and no selections', async () => {
    const { service } = setup();
    await start(service);
    const { attempt } = await service.resumeAttempt(USER, 'ch01-l01');
    expect(attempt!.draft).toEqual({
      revision: 0,
      answers: [],
      answered_count: 0,
      total: 8,
      updated_at: null,
    });
  });

  it('resumes the newest open attempt, never a submitted one, and keeps picking after a reload', async () => {
    const harness = setup();
    const { service, memory } = harness;
    const older = await start(service, 'ch01-l01', 'attempt-key-0001');
    const newer = await start(service, 'ch01-l01', 'attempt-key-0002');
    memory.attempts[0]!.created_at = new Date(Date.UTC(2026, 0, 1, 0, 0, 1));
    memory.attempts[1]!.created_at = new Date(Date.UTC(2026, 0, 1, 0, 0, 2));
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt!.attempt_id).toBe(
      newer.attempt_id,
    );
    await submitScoring(harness, newer, 2, 3);
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt!.attempt_id).toBe(
      older.attempt_id,
    );
    await submitScoring(harness, older, 0, 4);
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt).toBeNull();
  });

  it('does not resume attempts of the legacy catalog or whose bank is gone', async () => {
    const { service, memory } = setup();
    await start(service, 'ch01-l01', 'attempt-key-0001');
    memory.attempts[0]!.catalog_version = ACADEMY_LEGACY_CATALOG_VERSION;
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt).toBeNull();
    await start(service, 'ch01-l01', 'attempt-key-0002');
    memory.attempts[1]!.questions_version = 'a'.repeat(64);
    expect((await service.resumeAttempt(USER, 'ch01-l01')).attempt).toBeNull();
  });

  it('drops stored choices that no longer fit the pinned bank instead of failing', async () => {
    const { service, memory } = setup();
    const started = await start(service);
    const picks = firstOptions(started, 2);
    await service.saveDraft(USER, started.attempt_id, { answers: picks });
    memory.draftRows[0]!.selections[picks[1]!.question_id] = 'gone';
    memory.draftRows[0]!.selections['ghost-question'] = 'a';
    const { attempt } = await service.resumeAttempt(USER, 'ch01-l01');
    expect(attempt!.draft.answers).toEqual([picks[0]]);
    expect(attempt!.draft.answered_count).toBe(1);
  });
});

describe('AcademyService attempt history and review', () => {
  async function history(harness: Harness) {
    const { service } = harness;
    const first = await start(service, 'ch01-l01', 'attempt-key-0001');
    const open = await start(service, 'ch01-l01', 'attempt-key-0002');
    const second = await start(service, 'ch01-l01', 'attempt-key-0003');
    const third = await start(service, 'ch01-l01', 'attempt-key-0004');
    await submitScoring(harness, first, 3, 10);
    await submitScoring(harness, second, 1, 20);
    await submitScoring(harness, third, 0, 30);
    return { first, open, second, third };
  }

  it('lists the owner’s submitted attempts newest first with score, pass flag and review flag', async () => {
    const harness = setup();
    const { first, second, third } = await history(harness);
    const page = await harness.service.attemptHistory(USER, 'ch01-l01', { limit: 20, offset: 0 });
    expect(page).toMatchObject({
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      total: 3,
      limit: 20,
      offset: 0,
      next_offset: null,
    });
    expect(page.items).toEqual([
      {
        attempt_id: third.attempt_id,
        submitted_at: '2026-01-01T00:00:30.000Z',
        score: 8,
        total: 8,
        passed: true,
        review_available: true,
      },
      {
        attempt_id: second.attempt_id,
        submitted_at: '2026-01-01T00:00:20.000Z',
        score: 7,
        total: 8,
        passed: false,
        review_available: true,
      },
      {
        attempt_id: first.attempt_id,
        submitted_at: '2026-01-01T00:00:10.000Z',
        score: 5,
        total: 8,
        passed: false,
        review_available: true,
      },
    ]);
    // The open attempt is not history, and the list carries no answers.
    expect(
      [...deepKeys(page)].filter((key) => /question|option|correct|results/i.test(key)),
    ).toEqual([]);
  });

  it('paginates with limit and offset and reports the next page', async () => {
    const harness = setup();
    const { first, second, third } = await history(harness);
    const page1 = await harness.service.attemptHistory(USER, 'ch01-l01', { limit: 2, offset: 0 });
    expect(page1.items.map((item) => item.attempt_id)).toEqual([
      third.attempt_id,
      second.attempt_id,
    ]);
    expect(page1).toMatchObject({ total: 3, next_offset: 2 });
    const page2 = await harness.service.attemptHistory(USER, 'ch01-l01', { limit: 2, offset: 2 });
    expect(page2.items.map((item) => item.attempt_id)).toEqual([first.attempt_id]);
    expect(page2.next_offset).toBeNull();
    const beyond = await harness.service.attemptHistory(USER, 'ch01-l01', { limit: 2, offset: 6 });
    expect(beyond).toMatchObject({ items: [], total: 3, next_offset: null });
    const exact = await harness.service.attemptHistory(USER, 'ch01-l01', { limit: 3, offset: 0 });
    expect(exact.next_offset).toBeNull();
  });

  it('isolates owners and lessons, and flags attempts whose bank is gone', async () => {
    const harness = setup();
    const { first } = await history(harness);
    const { service, memory } = harness;
    expect(
      await service.attemptHistory(OTHER_USER, 'ch01-l01', { limit: 20, offset: 0 }),
    ).toMatchObject({ items: [], total: 0 });
    expect(await service.attemptHistory(USER, 'ch01-l02', { limit: 20, offset: 0 })).toMatchObject({
      items: [],
      total: 0,
    });
    await expect(
      service.attemptHistory(USER, 'ch99-l01', { limit: 20, offset: 0 }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'LESSON_NOT_FOUND' } });
    memory.attempts.find((row) => row.id === first.attempt_id)!.questions_version = 'a'.repeat(64);
    const page = await service.attemptHistory(USER, 'ch01-l01', { limit: 20, offset: 0 });
    expect(page.items.map((item) => item.review_available)).toEqual([true, true, false]);
  });

  it('returns the committed review of a submitted attempt, identical to the submit replay', async () => {
    const harness = setup();
    const { first, third } = await history(harness);
    const { service } = harness;
    const failed = await service.attemptReview(USER, first.attempt_id);
    expect(failed).toEqual(await service.submit(USER, first.attempt_id, { answers: [] }));
    expect(failed).toMatchObject({ score: 5, passed: false, review_available: true });
    expect(failed.results).toHaveLength(8);
    expect(failed.results.map((item) => item.question_id)).toEqual(
      first.questions.map((question) => question.id),
    );
    // The passing attempt keeps what it created; a retake is not credited again.
    const passed = await service.attemptReview(USER, third.attempt_id);
    expect(passed).toMatchObject({
      score: 8,
      passed: true,
      completion: { completed: true, completion_method: 'quiz', newly_completed: true },
      newly_granted: ['indicator:rsi'],
    });
    expect(passed).toEqual(await service.submit(USER, third.attempt_id, { answers: [] }));
    // Reading never writes: replaying leaves the evidence untouched.
    expect(harness.memory.completionRows).toHaveLength(1);
    expect(harness.rewards!.calls).toHaveLength(1);
  });

  it('is owner-only: a foreign or unknown attempt is 404, an open attempt has no review', async () => {
    const harness = setup();
    const { first, open } = await history(harness);
    const { service } = harness;
    await expect(service.attemptReview(OTHER_USER, first.attempt_id)).rejects.toMatchObject({
      status: 404,
      response: { code: 'ATTEMPT_NOT_FOUND' },
    });
    await expect(
      service.attemptReview(USER, '00000000-0000-4000-8000-0000000000ff'),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
    // The answer key never leaves before submit, not even through the review route.
    const error = await service.attemptReview(USER, open.attempt_id).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, response: { code: 'ATTEMPT_NOT_SUBMITTED' } });
    expect(JSON.stringify((error as { response: unknown }).response)).not.toMatch(
      /correct|explanation/,
    );
  });

  it('reviews a submitted attempt of the legacy catalog without a key', async () => {
    const harness = setup();
    const { first } = await history(harness);
    const row = harness.memory.attempts.find((item) => item.id === first.attempt_id)!;
    row.catalog_version = ACADEMY_LEGACY_CATALOG_VERSION;
    row.lesson_key = null;
    const review = await harness.service.attemptReview(USER, first.attempt_id);
    expect(review).toMatchObject({ review_available: false, results: [], lesson_key: null });
  });
});

describe('lesson text escaping', () => {
  const htmlOf = (lessonId: string) =>
    loadAcademyContent()
      .lessons.get(lessonId)!
      .content!.sections.flatMap((section) => section.blocks)
      .flatMap((block) => (block.type === 'html' ? [block.html] : []));

  it('keeps the MFI zero-flow rule of ch07-l02 as text: the comparison is escaped, not a tag', () => {
    const html = htmlOf('ch07-l02').join('\n');
    expect(html).toContain(
      '<p>N cặp TP cùng khối lượng; Nsum=0&lt;Psum cho 100, Psum=0&lt;Nsum cho 0; cả hai 0 trả chưa xác định.</p>',
    );
    expect(html).not.toMatch(/<psum|<\/psum/i);
  });

  it('has no published lesson whose html carries empty-valued attributes from an unescaped `<`', () => {
    const content = loadAcademyContent();
    const broken = [...content.lessons.values()]
      .filter((lesson) => lesson.content_status === 'published')
      .filter((lesson) => htmlOf(lesson.id).some((html) => /<[a-z][^>]*=""/i.test(html)))
      .map((lesson) => lesson.id);
    expect(broken).toEqual([]);
  });
});

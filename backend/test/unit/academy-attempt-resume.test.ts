import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AcademyController } from '../../src/modules/academy/academy.controller.js';
import { ACADEMY_CATALOG_VERSION } from '../../src/modules/academy/academy.constants.js';
import { AcademySqlStore } from '../../src/modules/academy/academy.repository.js';
import {
  draftSaveRequestSchema,
  historyQuerySchema,
  resumeResponseSchema,
} from '../../src/modules/academy/academy.schemas.js';
import {
  OTHER_USER,
  USER,
  answersScoring,
  deepKeys,
  item,
  openItem,
  setup,
  start,
} from './academy-test-kit.js';

const here = dirname(fileURLToPath(import.meta.url));

type Started = Awaited<ReturnType<typeof start>>;
type Harness = ReturnType<typeof setup>;

/** A ch4 lesson: 5 questions, open once chapters 1-3 are passed. */
const LESSON = 'ch04-l01';

/** The first option of each question, in the attempt's own order. */
const firstOptions = (attempt: Started, count = attempt.questions.length) =>
  attempt.questions.slice(0, count).map((question) => ({
    question_id: question.id,
    option_id: question.options[0]!.id,
  }));

function opened(itemId = LESSON) {
  const harness = setup();
  openItem(harness.memory, itemId);
  return harness;
}

/** Submits the attempt with `wrong` answers wrong (bank order); fixes submitted_at for ordering. */
async function submitScoring(
  { service, memory }: Harness,
  attempt: Started,
  wrong: number,
  at: number,
  itemId = LESSON,
) {
  const result = await service.submit(USER, attempt.attempt_id, {
    answers: answersScoring(itemId, wrong),
  });
  // Deterministic order: the in-memory clock may repeat a millisecond.
  memory.attempts.find((row) => row.id === attempt.attempt_id)!.submitted_at = new Date(
    Date.UTC(2026, 0, 1, 0, 0, at),
  );
  return result;
}

describe('academy v3.2 routes', () => {
  it('registers exactly the 11 routes; review and guide completion are gone', () => {
    const routes = Object.getOwnPropertyNames(AcademyController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const handler = (AcademyController.prototype as unknown as Record<string, object>)[name]!;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number;
        return `${['GET', 'POST', 'PUT'][method]} ${path}`;
      });
    expect(routes.sort()).toEqual(
      [
        'GET catalog',
        'GET progress',
        'GET lessons/:lessonId',
        'POST lessons/:lessonId/scenario',
        'GET lessons/:lessonId/notes',
        'PUT lessons/:lessonId/notes',
        'GET lessons/:lessonId/attempt',
        'GET lessons/:lessonId/attempts',
        'POST attempts',
        'PUT attempts/:attemptId/answers',
        'POST attempts/:attemptId/submit',
      ].sort(),
    );
    expect(routes).not.toContain('GET attempts/:attemptId');
    expect(routes).not.toContain('POST lessons/:lessonId/complete');
  });

  it('validates the draft body and the history query', () => {
    expect(draftSaveRequestSchema.safeParse({ answers: [] }).success).toBe(true);
    expect(
      draftSaveRequestSchema.safeParse({
        answers: [{ question_id: 'q', option_id: 'o' }],
        expected_revision: 0,
      }).success,
    ).toBe(true);
    expect(draftSaveRequestSchema.safeParse({ answers: [{ question_id: 'q' }] }).success).toBe(
      false,
    );
    expect(draftSaveRequestSchema.safeParse({ answers: [], expected_revision: -1 }).success).toBe(
      false,
    );
    expect(draftSaveRequestSchema.safeParse({}).success).toBe(false);
    // Client score/pass fields are not part of the contract: they are dropped, never read.
    expect(
      draftSaveRequestSchema.parse({ answers: [], score: 5, passed: true, correct: true }),
    ).toEqual({ answers: [] });
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
    expect(statements).toMatch(/CHECK \(revision >= 1\)/);
    expect(statements).not.toMatch(/correct|score|passed/i);
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
    expect(statementsRun[0]!.text).toMatch(/on conflict \(attempt_id\) do update/);
    expect(statementsRun[0]!.text).toMatch(/selections \|\| excluded\.selections/);
    expect(statementsRun[0]!.values).toEqual([attemptId, '{"q1":"o1"}']);
    await store.deleteDraft(attemptId);
    expect(statementsRun[1]!.text).toMatch(/delete from academy_attempt_drafts where attempt_id/);
  });

  it('reads the latest open attempt and the submitted history of the current catalog', async () => {
    const statementsRun: Array<{ text: string; values?: readonly unknown[] }> = [];
    const store = new AcademySqlStore({
      query: (text: string, values?: readonly unknown[]) => {
        statementsRun.push({ text, values });
        return Promise.resolve([]);
      },
    } as never);
    await store.latestOpenAttempt(USER, 'concept:bieu_do_nen', ACADEMY_CATALOG_VERSION);
    await store.submittedAttempts(USER, 'concept:bieu_do_nen', ACADEMY_CATALOG_VERSION, 20, 40);
    await store.attemptById(USER, '00000000-0000-4000-8000-0000000000aa');
    expect(statementsRun[0]!.text).toMatch(
      /user_id = \$1 and lesson_key = \$2 and catalog_version = \$3 and status = 'open'/,
    );
    expect(statementsRun[0]!.text).toMatch(/order by created_at desc, id desc\s+limit 1/);
    expect(statementsRun[1]!.text).toMatch(
      /user_id = \$1 and lesson_key = \$2 and catalog_version = \$3 and status = 'submitted'/,
    );
    expect(statementsRun[1]!.text).toMatch(
      /order by submitted_at desc, id desc\s+limit \$4 offset \$5/,
    );
    expect(statementsRun[1]!.values).toEqual([
      USER,
      'concept:bieu_do_nen',
      ACADEMY_CATALOG_VERSION,
      20,
      40,
    ]);
    expect(statementsRun[2]!.text).not.toMatch(/for update/);
  });
});

describe('AcademyService drafts with every question count', () => {
  for (const itemId of ['ch01-l01', 'ch04-l01', 'ch01-exam', 'ch04-exam']) {
    const total = item(itemId).question_count;
    it(`${itemId}: N = ${total}, drafts in any order, resume at the stored order`, async () => {
      const { service } = opened(itemId);
      const attempt = await start(service, itemId);
      expect(attempt.total).toBe(total);
      const picks = firstOptions(attempt);
      // Out of order: the last question first, then the first one.
      await service.saveDraft(USER, attempt.attempt_id, { answers: [picks[total - 1]!] });
      const saved = await service.saveDraft(USER, attempt.attempt_id, { answers: [picks[0]!] });
      expect(saved).toMatchObject({ revision: 2, answered_count: 2, total });
      expect(saved.answers).toEqual([picks[0], picks[total - 1]]);
      const resumed = await service.resumeAttempt(USER, itemId);
      expect(resumed.attempt?.draft).toMatchObject({ answered_count: 2, total });
      expect(resumed.attempt?.total).toBe(total);
    });
  }
});

describe('AcademyService draft selections', () => {
  it('saves a partial draft and never grades or reveals correctness', async () => {
    const harness = opened();
    const { service, memory } = harness;
    const attempt = await start(service, LESSON);
    const picks = firstOptions(attempt, 3);
    const saved = await service.saveDraft(USER, attempt.attempt_id, { answers: picks });
    expect(saved).toMatchObject({
      attempt_id: attempt.attempt_id,
      revision: 1,
      answered_count: 3,
      total: 5,
      answers: picks,
    });
    expect(
      [...deepKeys(saved)].filter((key) => /correct|explanation|score|passed/i.test(key)),
    ).toEqual([]);
    expect(memory.attempts[0]).toMatchObject({ status: 'open', score: null, passed: null });
    expect(memory.answerRows).toHaveLength(0);
    expect(harness.rewards!.calls).toHaveLength(0);
  });

  it('merges later saves, replaces a changed choice, and orders answers like the attempt', async () => {
    const { service } = opened();
    const attempt = await start(service, LESSON);
    const picks = firstOptions(attempt);
    await service.saveDraft(USER, attempt.attempt_id, { answers: [picks[4]!, picks[1]!] });
    const changed = { ...picks[1]!, option_id: attempt.questions[1]!.options[2]!.id };
    const second = await service.saveDraft(USER, attempt.attempt_id, {
      answers: [picks[0]!, changed],
    });
    expect(second.revision).toBe(2);
    expect(second.answers).toEqual([picks[0], changed, picks[4]]);
  });

  it('does not bump the revision when nothing changes (idempotent retry, empty body)', async () => {
    const { service, memory } = opened();
    const attempt = await start(service, LESSON);
    const picks = firstOptions(attempt, 2);
    expect((await service.saveDraft(USER, attempt.attempt_id, { answers: [] })).revision).toBe(0);
    expect(memory.draftRows).toHaveLength(0);
    const first = await service.saveDraft(USER, attempt.attempt_id, { answers: picks });
    expect(await service.saveDraft(USER, attempt.attempt_id, { answers: picks })).toEqual(first);
  });

  it('rejects ids that are not the attempt’s questions and options, and stores nothing', async () => {
    const { service, memory } = opened();
    const attempt = await start(service, LESSON);
    const [q0, q1] = attempt.questions;
    const bodies = [
      [{ question_id: 'ch04-l01-q99', option_id: q0!.options[0]!.id }],
      [{ question_id: q0!.id, option_id: 'zzz' }],
      [
        { question_id: q0!.id, option_id: q0!.options[0]!.id },
        { question_id: q0!.id, option_id: q0!.options[1]!.id },
      ],
      [
        { question_id: q1!.id, option_id: q1!.options[0]!.id },
        { question_id: q0!.id, option_id: q1!.options[0]!.id },
      ],
    ];
    for (const answers of bodies)
      await expect(service.saveDraft(USER, attempt.attempt_id, { answers })).rejects.toMatchObject({
        status: 422,
        response: { code: 'INVALID_ANSWERS' },
      });
    expect(memory.draftRows).toHaveLength(0);
  });

  it('is owner-only and refuses a submitted attempt', async () => {
    const harness = opened();
    const { service, memory } = harness;
    const attempt = await start(service, LESSON);
    const answers = firstOptions(attempt, 2);
    await expect(
      service.saveDraft(OTHER_USER, attempt.attempt_id, { answers }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
    await submitScoring(harness, attempt, 1, 1);
    const result = await service.submit(USER, attempt.attempt_id, { answers: [] });
    await expect(service.saveDraft(USER, attempt.attempt_id, { answers })).rejects.toMatchObject({
      status: 409,
      response: { code: 'ATTEMPT_ALREADY_SUBMITTED' },
    });
    expect(memory.draftRows).toHaveLength(0);
    expect(await service.submit(USER, attempt.attempt_id, { answers: [] })).toEqual(result);
  });

  it('guards with expected_revision and answers 409 with the current draft when stale', async () => {
    const { service } = opened();
    const attempt = await start(service, LESSON);
    const picks = firstOptions(attempt);
    await service.saveDraft(USER, attempt.attempt_id, {
      answers: picks.slice(0, 2),
      expected_revision: 0,
    });
    await service.saveDraft(USER, attempt.attempt_id, {
      answers: picks.slice(2, 4),
      expected_revision: 1,
    });
    await expect(
      service.saveDraft(USER, attempt.attempt_id, {
        answers: picks.slice(4, 5),
        expected_revision: 1,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'DRAFT_REVISION_CONFLICT',
        details: [{ draft: { revision: 2, answered_count: 4, answers: picks.slice(0, 4) } }],
      },
    });
  });

  it('keeps submit strict and drops the draft once submitted', async () => {
    const harness = opened();
    const { service, memory } = harness;
    const attempt = await start(service, LESSON);
    await service.saveDraft(USER, attempt.attempt_id, { answers: firstOptions(attempt) });
    await expect(service.submit(USER, attempt.attempt_id, { answers: [] })).rejects.toMatchObject({
      status: 422,
      response: { code: 'INVALID_ANSWERS' },
    });
    expect(memory.draftRows).toHaveLength(1);
    expect(await submitScoring(harness, attempt, 0, 1)).toMatchObject({ score: 5, passed: true });
    expect(memory.draftRows).toHaveLength(0);
  });
});

describe('AcademyService resume of the open attempt', () => {
  it('answers attempt null when there is nothing to resume, per owner and item', async () => {
    const { service } = opened();
    expect(await service.resumeAttempt(USER, LESSON)).toEqual({
      lesson_id: LESSON,
      lesson_key: 'concept:bieu_do_nen',
      catalog_version: ACADEMY_CATALOG_VERSION,
      attempt: null,
    });
    const attempt = await start(service, LESSON);
    expect((await service.resumeAttempt(OTHER_USER, LESSON)).attempt).toBeNull();
    expect((await service.resumeAttempt(USER, 'ch04-l02')).attempt).toBeNull();
    expect((await service.resumeAttempt(USER, LESSON)).attempt?.attempt_id).toBe(
      attempt.attempt_id,
    );
    await expect(service.resumeAttempt(USER, 'ch09-l01')).rejects.toMatchObject({
      status: 404,
      response: { code: 'LESSON_NOT_FOUND' },
    });
  });

  it('returns the same questions and option order as the start, plus the saved selections', async () => {
    const { service, memory } = opened();
    const started = await start(service, LESSON);
    const picks = firstOptions(started, 3);
    await service.saveDraft(USER, started.attempt_id, { answers: picks });
    const resumed = await service.resumeAttempt(USER, LESSON);
    expect(resumeResponseSchema.parse(resumed)).toEqual(resumed);
    const { created_at: createdAt, draft, ...projection } = resumed.attempt!;
    expect(projection).toEqual(started);
    expect(createdAt).toBe(memory.attempts[0]!.created_at.toISOString());
    expect(draft).toMatchObject({ revision: 1, answered_count: 3, total: 5, answers: picks });
    expect(
      [...deepKeys(resumed)].filter((key) =>
        /correct|explanation|score|passed|assessment|salt/i.test(key),
      ),
    ).toEqual([]);
  });

  it('resumes the newest open attempt, never a submitted one', async () => {
    const harness = opened();
    const { service, memory } = harness;
    const older = await start(service, LESSON, 'attempt-key-0001');
    const newer = await start(service, LESSON, 'attempt-key-0002');
    memory.attempts[0]!.created_at = new Date(Date.UTC(2026, 0, 1, 0, 0, 1));
    memory.attempts[1]!.created_at = new Date(Date.UTC(2026, 0, 1, 0, 0, 2));
    expect((await service.resumeAttempt(USER, LESSON)).attempt!.attempt_id).toBe(newer.attempt_id);
    await submitScoring(harness, newer, 2, 3);
    expect((await service.resumeAttempt(USER, LESSON)).attempt!.attempt_id).toBe(older.attempt_id);
    await submitScoring(harness, older, 0, 4);
    expect((await service.resumeAttempt(USER, LESSON)).attempt).toBeNull();
  });

  it('drops stored choices that no longer fit the pinned bank instead of failing', async () => {
    const { service, memory } = opened();
    const started = await start(service, LESSON);
    const picks = firstOptions(started, 2);
    await service.saveDraft(USER, started.attempt_id, { answers: picks });
    memory.draftRows[0]!.selections[picks[1]!.question_id] = 'gone';
    memory.draftRows[0]!.selections['ghost-question'] = 'a';
    const { attempt } = await service.resumeAttempt(USER, LESSON);
    expect(attempt!.draft.answers).toEqual([picks[0]]);
  });
});

describe('AcademyService attempt history', () => {
  it('lists the owner’s submitted attempts newest first, score only, paginated', async () => {
    const harness = opened();
    const { service } = harness;
    const first = await start(service, LESSON, 'attempt-key-0001');
    await start(service, LESSON, 'attempt-key-0002'); // stays open: not listed
    const second = await start(service, LESSON, 'attempt-key-0003');
    const third = await start(service, LESSON, 'attempt-key-0004');
    await submitScoring(harness, first, 3, 10);
    await submitScoring(harness, second, 1, 20);
    await submitScoring(harness, third, 0, 30);
    const page = await service.attemptHistory(USER, LESSON, { limit: 20, offset: 0 });
    expect(page).toMatchObject({ lesson_id: LESSON, total: 3, next_offset: null });
    expect(
      page.items.map((entry) => [entry.attempt_id, entry.score, entry.total, entry.passed]),
    ).toEqual([
      [third.attempt_id, 5, 5, true],
      [second.attempt_id, 4, 5, false],
      [first.attempt_id, 2, 5, false],
    ]);
    const firstPage = await service.attemptHistory(USER, LESSON, { limit: 2, offset: 0 });
    expect(firstPage.next_offset).toBe(2);
    const secondPage = await service.attemptHistory(USER, LESSON, { limit: 2, offset: 2 });
    expect(secondPage.items.map((entry) => entry.attempt_id)).toEqual([first.attempt_id]);
    expect((await service.attemptHistory(OTHER_USER, LESSON, { limit: 20, offset: 0 })).total).toBe(
      0,
    );
  });
});

import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { AcademyEnabledGuard } from '../../src/modules/academy/academy-enabled.guard.js';
import { AcademyGrantsService } from '../../src/modules/academy/academy-grants.service.js';
import { capabilitiesForLesson } from '../../src/modules/academy/academy.capabilities.js';
import {
  ACADEMY_CONTENT_VERSION,
  buildAcademyContent,
  canonicalHash,
  canonicalJson,
  loadAcademyContent,
  readAcademyContentFiles,
} from '../../src/modules/academy/academy.content.js';
import {
  findInvalidAnswers,
  gradeAnswers,
  shuffle,
} from '../../src/modules/academy/academy.grading.js';
import {
  AcademySqlStore,
  type AcademyStore,
  type AcademyStoreProvider,
  type AnswerRow,
  type AttemptRow,
  type GrantRow,
} from '../../src/modules/academy/academy.repository.js';
import { AcademyService } from '../../src/modules/academy/academy.service.js';
import type { Environment } from '../../src/platform/config/environment.js';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';

/** In-memory store; transactions are serialized to model the `for update` row lock. */
class MemoryAcademy implements AcademyStoreProvider, AcademyStore {
  attempts: AttemptRow[] = [];
  answerRows: AnswerRow[] = [];
  grantRows: GrantRow[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  store(): AcademyStore {
    return this;
  }

  transaction<T>(operation: (store: AcademyStore) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({
        attempts: this.attempts,
        answerRows: this.answerRows,
        grantRows: this.grantRows,
      });
      try {
        return await operation(this);
      } catch (error) {
        Object.assign(this, snapshot);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async insertAttempt(attempt: Parameters<AcademyStore['insertAttempt']>[0]) {
    await Promise.resolve();
    if (
      this.attempts.some(
        (row) => row.user_id === attempt.user_id && row.idempotency_key === attempt.idempotency_key,
      )
    )
      return null;
    const row: AttemptRow = {
      ...structuredClone(attempt),
      status: 'open',
      created_at: new Date(),
      submitted_at: null,
      score: null,
      passed: null,
    };
    this.attempts.push(row);
    return structuredClone(row);
  }

  async attemptByIdempotencyKey(userId: string, key: string) {
    await Promise.resolve();
    const row = this.attempts.find(
      (item) => item.user_id === userId && item.idempotency_key === key,
    );
    return row ? structuredClone(row) : null;
  }

  async lockAttempt(userId: string, attemptId: string) {
    await Promise.resolve();
    const row = this.attempts.find((item) => item.id === attemptId && item.user_id === userId);
    return row ? structuredClone(row) : null;
  }

  async markSubmitted(attemptId: string, score: number, passed: boolean) {
    await Promise.resolve();
    const row = this.attempts.find((item) => item.id === attemptId && item.status === 'open');
    if (!row) return null;
    Object.assign(row, { status: 'submitted', submitted_at: new Date(), score, passed });
    return structuredClone(row);
  }

  async answers(attemptId: string) {
    await Promise.resolve();
    return this.answerRows.filter((row) => row.attempt_id === attemptId);
  }

  async insertAnswers(answers: readonly AnswerRow[]) {
    await Promise.resolve();
    for (const answer of answers) {
      if (
        this.answerRows.some(
          (row) => row.attempt_id === answer.attempt_id && row.question_id === answer.question_id,
        )
      )
        throw new Error('duplicate answer primary key');
      this.answerRows.push({ ...answer });
    }
  }

  async insertGrant(grant: Parameters<AcademyStore['insertGrant']>[0]) {
    await Promise.resolve();
    if (
      this.grantRows.some(
        (row) => row.user_id === grant.user_id && row.lesson_id === grant.lesson_id,
      )
    )
      return null;
    const row: GrantRow = { ...structuredClone(grant), granted_at: new Date() };
    this.grantRows.push(row);
    return structuredClone(row);
  }

  async grant(userId: string, lessonId: string) {
    await Promise.resolve();
    return (
      this.grantRows.find((row) => row.user_id === userId && row.lesson_id === lessonId) ?? null
    );
  }

  async grants(userId: string) {
    await Promise.resolve();
    return this.grantRows.filter((row) => row.user_id === userId);
  }

  async attemptStats(userId: string) {
    await Promise.resolve();
    const stats = new Map<
      string,
      { lesson_id: string; best_score: number | null; attempts: number }
    >();
    for (const row of this.attempts) {
      if (row.user_id !== userId || row.status !== 'submitted') continue;
      const current = stats.get(row.lesson_id) ?? {
        lesson_id: row.lesson_id,
        best_score: null,
        attempts: 0,
      };
      current.attempts += 1;
      current.best_score = Math.max(current.best_score ?? 0, row.score ?? 0);
      stats.set(row.lesson_id, current);
    }
    return [...stats.values()];
  }
}

function setup() {
  const memory = new MemoryAcademy();
  return { memory, service: new AcademyService(memory), grants: new AcademyGrantsService(memory) };
}

function answerKey(lessonId: string) {
  return loadAcademyContent().questionsByLesson.get(lessonId)!;
}

function correctAnswers(lessonId: string) {
  return answerKey(lessonId).map((question) => ({
    question_id: question.id,
    option_id: question.correct_option_id,
  }));
}

function wrongAnswer(lessonId: string, index: number) {
  const question = answerKey(lessonId)[index]!;
  return question.options.find((option) => option.id !== question.correct_option_id)!.id;
}

function deepKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      deepKeys(item, keys);
    }
  return keys;
}

async function start(service: AcademyService, lessonId = 'ch01-l01', key = 'attempt-key-0001') {
  return service.createAttempt(USER, {
    lesson_id: lessonId,
    content_version: ACADEMY_CONTENT_VERSION,
    idempotency_key: key,
  });
}

describe('academy content loader', () => {
  it('validates 18 chapters, 125 lessons and exactly 8 questions per lesson', () => {
    const content = loadAcademyContent();
    expect(content.chapters).toHaveLength(18);
    expect(content.lessons.size).toBe(125);
    expect(content.questionsByLesson.size).toBe(125);
    for (const questions of content.questionsByLesson.values()) expect(questions).toHaveLength(8);
    expect([...content.questionsByLesson.values()].flat()).toHaveLength(1000);
    expect(content.questions_version).toMatch(/^[a-f0-9]{64}$/);
    expect(loadAcademyContent()).toBe(content);
  });

  it('derives questions_version from the question banks only', () => {
    const files = readAcademyContentFiles();
    const banks = [...files.chapters.values()].map((chapter) => chapter.questions);
    expect(loadAcademyContent().questions_version).toBe(canonicalHash(banks));
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,1]},"b":1}',
    );
  });

  it('rejects a lesson without 8 questions or with an inconsistent answer key', () => {
    const files = readAcademyContentFiles();
    const first = files.chapters.get(1)!;
    const truncated = new Map(files.chapters);
    truncated.set(1, { ...first, questions: (first.questions as unknown[]).slice(1) });
    expect(() => buildAcademyContent({ ...files, chapters: truncated })).toThrow(/7 questions/);

    const broken = structuredClone(first.questions) as { correct_index: number }[];
    broken[0]!.correct_index = (broken[0]!.correct_index + 1) % 4;
    const inconsistent = new Map(files.chapters);
    inconsistent.set(1, { ...first, questions: broken });
    expect(() => buildAcademyContent({ ...files, chapters: inconsistent })).toThrow(/answer key/);
  });
});

describe('academy capability mapping', () => {
  const lessons = loadAcademyContent().lessons;

  it('maps technical, fundamental and tool lessons per CONTRACTS §2', () => {
    expect(lessons.get('ch01-l01')!.capabilities).toEqual(['indicator:rsi', 'lesson:ch01-l01']);
    expect(lessons.get('ch02-l14')!.capabilities).toEqual(['lesson:ch02-l14']);
    const fundamental = [...lessons.values()].find((lesson) => lesson.kind === 'fundamental')!;
    expect(fundamental.capabilities).toEqual([
      `metric:${fundamental.config_id}`,
      `lesson:${fundamental.id}`,
    ]);
    expect(capabilitiesForLesson({ id: 'ch01-l06', kind: 'technical', config_id: null })).toEqual([
      'lesson:ch01-l06',
    ]);
  });

  it('covers 35 indicators and 42 metrics', () => {
    const all = [...lessons.values()].flatMap((lesson) => lesson.capabilities);
    expect(all.filter((id) => id.startsWith('indicator:'))).toHaveLength(35);
    expect(all.filter((id) => id.startsWith('metric:'))).toHaveLength(42);
    expect(all.filter((id) => id.startsWith('lesson:'))).toHaveLength(125);
  });
});

describe('academy grading primitives', () => {
  it('shuffles with Fisher-Yates into a permutation', () => {
    const items = ['o1', 'o2', 'o3', 'o4'];
    const result = shuffle(items, () => 0);
    expect(result).toEqual(['o2', 'o3', 'o4', 'o1']);
    expect(items).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect([...shuffle(items)].sort()).toEqual(items);
  });

  it('passes only with 8/8', () => {
    const questions = answerKey('ch01-l01');
    const ids = questions.map((question) => question.id);
    expect(gradeAnswers(questions, ids, correctAnswers('ch01-l01'))).toMatchObject({
      score: 8,
      passed: true,
    });
    const seven = correctAnswers('ch01-l01');
    seven[3] = { ...seven[3]!, option_id: wrongAnswer('ch01-l01', 3) };
    expect(gradeAnswers(questions, ids, seven)).toMatchObject({ score: 7, passed: false });
  });

  it('reports unknown, duplicate, foreign-option and missing answers', () => {
    const questions = answerKey('ch01-l01');
    const ids = questions.map((question) => question.id);
    const answers = correctAnswers('ch01-l01');
    expect(findInvalidAnswers(questions, ids, answers)).toEqual([]);
    const issues = findInvalidAnswers(questions, ids, [
      ...answers.slice(0, 6),
      answers[0]!,
      { question_id: ids[6]!, option_id: 'o9' },
      { question_id: 'ch01-l02-q01', option_id: 'o1' },
    ]);
    expect(issues.map((issue) => issue.reason).sort()).toEqual([
      'duplicate_question',
      'missing_answer',
      'unknown_option',
      'unknown_question',
    ]);
  });
});

describe('AcademyService attempts', () => {
  it('never exposes answer keys or explanations in the attempt payload', async () => {
    const { service } = setup();
    const attempt = await start(service);
    expect(attempt.questions).toHaveLength(8);
    const keys = deepKeys(attempt);
    expect([...keys].filter((key) => /correct|explanation/i.test(key))).toEqual([]);
    const text = JSON.stringify(attempt);
    // Some explanations repeat the correct option text verbatim; only distinct ones can leak.
    for (const question of answerKey('ch01-l01'))
      if (!question.options.some((option) => option.text === question.explanation))
        expect(text).not.toContain(question.explanation);
    expect(attempt.questions_version).toBe(loadAcademyContent().questions_version);
  });

  it('stores the shuffled order and replays it for the same idempotency key', async () => {
    const { service, memory } = setup();
    const first = await start(service);
    const second = await start(service);
    expect(second).toEqual(first);
    expect(memory.attempts).toHaveLength(1);
    const stored = memory.attempts[0]!;
    for (const question of first.questions)
      expect(question.options.map((option) => option.id)).toEqual(
        stored.option_orders[question.id],
      );
    const other = await start(service, 'ch01-l01', 'attempt-key-0002');
    expect(other.attempt_id).not.toBe(first.attempt_id);
    expect(memory.attempts).toHaveLength(2);
  });

  it('rejects a mismatched content_version and a key reused for another lesson', async () => {
    const { service } = setup();
    await expect(
      service.createAttempt(USER, {
        lesson_id: 'ch01-l01',
        content_version: '1.0.0',
        idempotency_key: 'attempt-key-0001',
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CONTENT_VERSION_MISMATCH' } });
    await start(service);
    await expect(start(service, 'ch01-l02')).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    await expect(start(service, 'ch99-l01', 'attempt-key-0003')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('grants capabilities on 8/8 and keeps re-submits idempotent', async () => {
    const { service, grants, memory } = setup();
    const attempt = await start(service);
    const result = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01'),
    });
    expect(result).toMatchObject({ score: 8, total: 8, passed: true });
    expect(result.newly_granted).toEqual(['indicator:rsi', 'lesson:ch01-l01']);
    expect(result.granted_capabilities).toEqual(['indicator:rsi', 'lesson:ch01-l01']);
    expect(result.results.every((item) => item.correct && item.explanation)).toBe(true);

    const again = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01').map((answer, index) =>
        index === 0 ? { ...answer, option_id: wrongAnswer('ch01-l01', 0) } : answer,
      ),
    });
    expect(again).toEqual(result);
    expect(memory.grantRows).toHaveLength(1);
    expect(memory.answerRows).toHaveLength(8);
    expect([...(await grants.grantedCapabilities(USER))].sort()).toEqual([
      'indicator:rsi',
      'lesson:ch01-l01',
    ]);
    expect((await grants.grantedCapabilities(OTHER_USER)).size).toBe(0);
  });

  it('fails 7/8 without a grant and a later failed retake never removes a pass', async () => {
    const { service, memory } = setup();
    const seven = correctAnswers('ch01-l01');
    seven[5] = { ...seven[5]!, option_id: wrongAnswer('ch01-l01', 5) };
    const failed = await service.submit(USER, (await start(service)).attempt_id, {
      answers: seven,
    });
    expect(failed).toMatchObject({ score: 7, passed: false, newly_granted: [] });
    expect(failed.granted_capabilities).toEqual([]);
    expect(failed.results[5]).toMatchObject({ correct: false });
    expect(memory.grantRows).toHaveLength(0);

    const passed = await service.submit(
      USER,
      (await start(service, 'ch01-l01', 'attempt-key-0002')).attempt_id,
      { answers: correctAnswers('ch01-l01') },
    );
    expect(passed.newly_granted).toHaveLength(2);
    const retake = await service.submit(
      USER,
      (await start(service, 'ch01-l01', 'attempt-key-0003')).attempt_id,
      { answers: seven },
    );
    expect(retake.passed).toBe(false);
    expect(retake.granted_capabilities).toEqual(['indicator:rsi', 'lesson:ch01-l01']);

    const repass = await service.submit(
      USER,
      (await start(service, 'ch01-l01', 'attempt-key-0004')).attempt_id,
      { answers: correctAnswers('ch01-l01') },
    );
    expect(repass.passed).toBe(true);
    expect(repass.newly_granted).toEqual([]);
    expect(memory.grantRows).toHaveLength(1);

    const curriculum = await service.curriculum(USER, {});
    const rsi = curriculum.chapters[0]!.lessons[0]!;
    expect(rsi).toMatchObject({ id: 'ch01-l01', passed: true, best_score: 8, attempts: 4 });
    expect(curriculum.chapters[0]!.lessons[1]).toMatchObject({
      passed: false,
      best_score: null,
      attempts: 0,
    });
  });

  it('rejects invalid answers with 422 INVALID_ANSWERS and keeps the attempt open', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const answers = correctAnswers('ch01-l01');
    const invalid = [
      answers.slice(0, 7),
      [...answers.slice(0, 7), answers[0]!],
      [...answers.slice(0, 7), { question_id: answers[7]!.question_id, option_id: 'nope' }],
      [...answers.slice(0, 7), { question_id: 'ch01-l02-q08', option_id: 'o1' }],
      [...answers, { question_id: 'ch01-l02-q01', option_id: 'o1' }],
    ];
    for (const body of invalid)
      await expect(
        service.submit(USER, attempt.attempt_id, { answers: body }),
      ).rejects.toMatchObject({ status: 422, response: { code: 'INVALID_ANSWERS' } });
    expect(memory.attempts[0]!.status).toBe('open');
    expect(memory.answerRows).toHaveLength(0);
  });

  it('scopes attempts to the owner', async () => {
    const { service } = setup();
    const attempt = await start(service);
    await expect(
      service.submit(OTHER_USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
  });

  it('cannot double-grant under concurrent submits', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
      ),
    );
    expect(memory.grantRows).toHaveLength(1);
    expect(memory.answerRows).toHaveLength(8);
    for (const result of results) expect(result).toEqual(results[0]);
  });

  it('returns lesson content without questions and with pass state', async () => {
    const { service } = setup();
    const lesson = await service.lesson(USER, 'ch01-l01');
    expect(lesson).toMatchObject({ id: 'ch01-l01', config_id: 'rsi', passed: false });
    expect(lesson.sections.length).toBeGreaterThan(0);
    expect(deepKeys(lesson).has('questions')).toBe(false);
    expect(deepKeys(lesson).has('correct_option_id')).toBe(false);
    await expect(service.lesson(USER, 'ch99-l99')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.curriculum(USER, { content_version: '9.9.9' })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('academy SQL store', () => {
  it('locks the attempt row and never overwrites grants', async () => {
    const statements: string[] = [];
    const store = new AcademySqlStore({
      query: (text: string) => {
        statements.push(text);
        return Promise.resolve([]);
      },
    } as never);
    await store.lockAttempt(USER, '00000000-0000-4000-8000-0000000000aa');
    await store.markSubmitted('00000000-0000-4000-8000-0000000000aa', 8, true);
    await store.insertGrant({
      user_id: USER,
      lesson_id: 'ch01-l01',
      capability_ids: ['lesson:ch01-l01'],
      attempt_id: '00000000-0000-4000-8000-0000000000aa',
      content_version: '2.0.0',
    });
    expect(statements[0]).toMatch(/for update/);
    expect(statements[0]).toMatch(/user_id = \$2/);
    expect(statements[1]).toMatch(/status = 'open'/);
    expect(statements[2]).toMatch(/on conflict \(user_id, lesson_id\) do nothing/);
  });
});

describe('AcademyEnabledGuard', () => {
  const guard = (enabled: boolean) =>
    new AcademyEnabledGuard({ get: () => enabled } as unknown as ConfigService<Environment, true>);

  it('returns 404 FEATURE_DISABLED when ACADEMY_ENABLED=false', () => {
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
    try {
      guard(false).canActivate();
    } catch (error) {
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'FEATURE_DISABLED',
      });
    }
    expect(guard(true).canActivate()).toBe(true);
  });
});

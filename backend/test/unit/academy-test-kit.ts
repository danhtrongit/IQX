import { AcademyGrantsService } from '../../src/modules/academy/academy-grants.service.js';
import {
  ACADEMY_CATALOG_VERSION,
  loadAcademyContent,
  type AcademyContent,
} from '../../src/modules/academy/academy.content.js';
import type { RandomInt } from '../../src/modules/academy/academy.grading.js';
import type {
  AcademyStore,
  AcademyStoreProvider,
  AnswerRow,
  AttemptRow,
  CompletionRow,
} from '../../src/modules/academy/academy.repository.js';
import { AcademyService } from '../../src/modules/academy/academy.service.js';
import type { SqlClient } from '../../src/platform/database/index.js';
import type {
  LessonRewardInput,
  LessonRewardPort,
  LessonRewardResult,
} from '../../src/platform/ports/lesson-reward.port.js';

/** Shared doubles for the academy unit tests (service, content integrity, packages). */
export const USER = '00000000-0000-4000-8000-000000000001';
export const OTHER_USER = '00000000-0000-4000-8000-000000000002';

/** In-memory store; transactions are serialized and rolled back on error like the row lock + tx. */
export class MemoryAcademy implements AcademyStoreProvider, AcademyStore {
  attempts: AttemptRow[] = [];
  answerRows: AnswerRow[] = [];
  completionRows: CompletionRow[] = [];
  legacyCapabilities = new Map<string, string[]>();
  readonly tx = { query: () => Promise.resolve([]) } as unknown as SqlClient;
  private queue: Promise<unknown> = Promise.resolve();

  store(): AcademyStore {
    return this;
  }

  transaction<T>(operation: (store: AcademyStore, tx: SqlClient) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({
        attempts: this.attempts,
        answerRows: this.answerRows,
        completionRows: this.completionRows,
      });
      try {
        return await operation(this, this.tx);
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

  async attemptStats(userId: string, lessonKey: string) {
    await Promise.resolve();
    const scores = this.attempts
      .filter(
        (row) =>
          row.user_id === userId && row.lesson_key === lessonKey && row.status === 'submitted',
      )
      .map((row) => row.score ?? 0);
    return {
      best_score: scores.length ? Math.max(...scores) : null,
      attempts_submitted: scores.length,
    };
  }

  async lockUser() {
    await Promise.resolve();
  }

  async completion(userId: string, lessonKey: string) {
    await Promise.resolve();
    const row = this.completionRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    return row ? structuredClone(row) : null;
  }

  async completionByRequestId(userId: string, requestId: string) {
    await Promise.resolve();
    const row = this.completionRows.find(
      (item) => item.user_id === userId && item.request_id === requestId,
    );
    return row ? structuredClone(row) : null;
  }

  async insertCompletion(completion: Parameters<AcademyStore['insertCompletion']>[0]) {
    await Promise.resolve();
    if (
      this.completionRows.some(
        (row) => row.user_id === completion.user_id && row.lesson_key === completion.lesson_key,
      )
    )
      return null;
    if (
      completion.request_id !== null &&
      this.completionRows.some(
        (row) => row.user_id === completion.user_id && row.request_id === completion.request_id,
      )
    )
      throw new Error('unique (user_id, request_id) violated');
    const row: CompletionRow = { ...structuredClone(completion), completed_at: new Date() };
    this.completionRows.push(row);
    return structuredClone(row);
  }

  async attachReward(userId: string, lessonKey: string, reward: Record<string, unknown>) {
    await Promise.resolve();
    const row = this.completionRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    if (row) row.source = { ...row.source, reward };
  }

  async completions(userId: string) {
    await Promise.resolve();
    return this.completionRows
      .filter((row) => row.user_id === userId)
      .map((row) => structuredClone(row));
  }

  async legacyLessonCapabilities(userId: string) {
    await Promise.resolve();
    return this.legacyCapabilities.get(userId) ?? [];
  }
}

/** Reward hook double: credits 100 once per (user, lesson key) like the Shop ledger would. */
export class FakeRewards implements LessonRewardPort {
  readonly calls: Array<{ tx: SqlClient; input: LessonRewardInput }> = [];
  private readonly rewarded = new Set<string>();
  balance = 0;
  failWith: Error | null = null;

  creditFirstCompletion(tx: SqlClient, input: LessonRewardInput): Promise<LessonRewardResult> {
    this.calls.push({ tx, input });
    if (this.failWith) return Promise.reject(this.failWith);
    const key = `${input.userId}|${input.lessonKey}`;
    if (this.rewarded.has(key))
      return Promise.resolve({ status: 'already_rewarded', balanceAfter: this.balance });
    this.rewarded.add(key);
    this.balance += 100;
    return Promise.resolve({
      status: 'credited',
      delta: 100,
      balanceAfter: this.balance,
      ledgerEntryId: `ledger-${this.calls.length}`,
    });
  }
}

/** Deterministic PRNG (mulberry32) for the per-attempt shuffles. */
export function seededRandom(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

export class TestAcademyService extends AcademyService {
  constructor(
    repository: AcademyStoreProvider,
    rewards: LessonRewardPort | undefined,
    private readonly fixture?: AcademyContent,
    private readonly seeded?: RandomInt,
  ) {
    super(repository, rewards);
  }
  protected override readonly content = (): AcademyContent => this.fixture ?? loadAcademyContent();
  protected override readonly random: RandomInt = (maxExclusive) =>
    this.seeded ? this.seeded(maxExclusive) : Math.floor(Math.random() * maxExclusive);
}

export function setup(
  options: { rewards?: boolean; content?: AcademyContent; random?: RandomInt } = {},
) {
  const memory = new MemoryAcademy();
  const rewards = options.rewards === false ? undefined : new FakeRewards();
  return {
    memory,
    rewards,
    service: new TestAcademyService(memory, rewards, options.content, options.random),
    grants: new AcademyGrantsService(memory),
  };
}

export function answerKey(lessonId: string, content: AcademyContent = loadAcademyContent()) {
  return content.lessons.get(lessonId)!.assessment!.questions;
}

export function correctAnswers(lessonId: string, content?: AcademyContent) {
  return answerKey(lessonId, content).map((question) => ({
    question_id: question.id,
    option_id: question.correct_option_id,
  }));
}

export function wrongAnswer(lessonId: string, index: number) {
  const question = answerKey(lessonId)[index]!;
  return question.options.find((option) => option.id !== question.correct_option_id)!.id;
}

export function deepKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      deepKeys(item, keys);
    }
  return keys;
}

export async function start(
  service: AcademyService,
  lessonId = 'ch01-l01',
  key = 'attempt-key-0001',
) {
  return service.createAttempt(USER, {
    lesson_id: lessonId,
    catalog_version: ACADEMY_CATALOG_VERSION,
    idempotency_key: key,
  });
}

export async function pass(service: AcademyService, lessonId: string, key: string) {
  const attempt = await start(service, lessonId, key);
  return service.submit(USER, attempt.attempt_id, { answers: correctAnswers(lessonId) });
}

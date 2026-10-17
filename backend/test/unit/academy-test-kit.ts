import { AcademyGrantsService } from '../../src/modules/academy/academy-grants.service.js';
import { ACADEMY_CATALOG_VERSION } from '../../src/modules/academy/academy.constants.js';
import type {
  AcademyContent,
  AcademyItem,
} from '../../src/modules/academy/academy.content.types.js';
import type { RandomInt } from '../../src/modules/academy/academy.grading.js';
import {
  NOTES_SIZE_LIMIT,
  notesPatchIsNoop,
  type AcademyStore,
  type AcademyStoreProvider,
  type AnswerRow,
  type AttemptRow,
  type AttemptStats,
  type CompletionRow,
  type DraftRow,
  type NewScenarioChoice,
  type NotesPatch,
  type PracticeNotesRow,
  type SaveNotesResult,
  type ScenarioChoiceRow,
} from '../../src/modules/academy/academy.repository.js';
import { AcademyService } from '../../src/modules/academy/academy.service.js';
import type { SqlClient } from '../../src/platform/database/index.js';
import type {
  LessonRewardInput,
  LessonRewardPort,
  LessonRewardResult,
} from '../../src/platform/ports/lesson-reward.port.js';
import { academyV3Fixture } from './academy-v3-fixture.js';

/** Shared doubles for the academy unit tests (service, grants, attempts). */
export const USER = '00000000-0000-4000-8000-000000000001';
export const OTHER_USER = '00000000-0000-4000-8000-000000000002';

/**
 * Text of a jsonb value as Postgres prints it (`{"k": "v", "n": [1, 2]}`): the measure of
 * ck_academy_practice_notes_size, longer than compact JSON by the separator spaces.
 */
export function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}: ${jsonbText(item)}`)
      .join(', ')}}`;
  return JSON.stringify(value);
}

const notesBytes = (maps: Pick<PracticeNotesRow, 'texts' | 'checks' | 'scores'>) =>
  Buffer.byteLength(jsonbText(maps.texts)) +
  Buffer.byteLength(jsonbText(maps.checks)) +
  Buffer.byteLength(jsonbText(maps.scores));

/** In-memory store; transactions are serialized and rolled back on error like the row lock + tx. */
export class MemoryAcademy implements AcademyStoreProvider, AcademyStore {
  attempts: AttemptRow[] = [];
  answerRows: AnswerRow[] = [];
  draftRows: DraftRow[] = [];
  completionRows: CompletionRow[] = [];
  scenarioRows: ScenarioChoiceRow[] = [];
  notesRows: PracticeNotesRow[] = [];
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
        draftRows: this.draftRows,
        completionRows: this.completionRows,
        scenarioRows: this.scenarioRows,
        notesRows: this.notesRows,
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

  async attemptById(userId: string, attemptId: string) {
    await Promise.resolve();
    const row = this.attempts.find((item) => item.id === attemptId && item.user_id === userId);
    return row ? structuredClone(row) : null;
  }

  async latestOpenAttempt(userId: string, lessonKey: string, catalogVersion: string) {
    await Promise.resolve();
    const rows = this.attempts
      .filter(
        (item) =>
          item.user_id === userId &&
          item.lesson_key === lessonKey &&
          item.catalog_version === catalogVersion &&
          item.status === 'open',
      )
      // Insertion order is creation order; newest last.
      .reverse();
    return rows[0] ? structuredClone(rows[0]) : null;
  }

  private submitted(userId: string, lessonKey: string, catalogVersion: string) {
    return this.attempts.filter(
      (row) =>
        row.user_id === userId &&
        row.lesson_key === lessonKey &&
        row.catalog_version === catalogVersion &&
        row.status === 'submitted',
    );
  }

  async submittedAttempts(
    userId: string,
    lessonKey: string,
    catalogVersion: string,
    limit: number,
    offset: number,
  ) {
    await Promise.resolve();
    return this.submitted(userId, lessonKey, catalogVersion)
      .map((item, index) => ({ item, index }))
      .sort(
        (a, b) =>
          (b.item.submitted_at?.getTime() ?? 0) - (a.item.submitted_at?.getTime() ?? 0) ||
          b.index - a.index,
      )
      .slice(offset, offset + limit)
      .map(({ item }) => structuredClone(item));
  }

  async draft(attemptId: string) {
    await Promise.resolve();
    const row = this.draftRows.find((item) => item.attempt_id === attemptId);
    return row ? structuredClone(row) : null;
  }

  async saveDraft(attemptId: string, selections: Record<string, string>) {
    await Promise.resolve();
    const existing = this.draftRows.find((item) => item.attempt_id === attemptId);
    if (existing) {
      existing.selections = { ...existing.selections, ...selections };
      existing.revision += 1;
      existing.updated_at = new Date();
      return structuredClone(existing);
    }
    const row: DraftRow = {
      attempt_id: attemptId,
      selections: { ...selections },
      revision: 1,
      updated_at: new Date(),
    };
    this.draftRows.push(row);
    return structuredClone(row);
  }

  async deleteDraft(attemptId: string) {
    await Promise.resolve();
    this.draftRows = this.draftRows.filter((item) => item.attempt_id !== attemptId);
  }

  async markSubmitted(attemptId: string, score: number, passed: boolean) {
    await Promise.resolve();
    const row = this.attempts.find((item) => item.id === attemptId && item.status === 'open');
    if (!row) return null;
    // ck_academy_attempts_score after 0026.
    if (score < 0 || score > row.question_ids.length) throw new Error('ck_academy_attempts_score');
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

  async attemptStats(userId: string, lessonKey: string, catalogVersion: string) {
    await Promise.resolve();
    const scores = this.submitted(userId, lessonKey, catalogVersion).map((row) => row.score ?? 0);
    return {
      best_score: scores.length ? Math.max(...scores) : null,
      attempts_submitted: scores.length,
    };
  }

  async attemptStatsAll(userId: string, catalogVersion: string) {
    await Promise.resolve();
    const out = new Map<string, AttemptStats>();
    for (const row of this.attempts) {
      if (
        row.user_id !== userId ||
        row.catalog_version !== catalogVersion ||
        row.status !== 'submitted' ||
        row.lesson_key === null
      )
        continue;
      const stats = out.get(row.lesson_key) ?? { best_score: null, attempts_submitted: 0 };
      out.set(row.lesson_key, {
        best_score: Math.max(stats.best_score ?? 0, row.score ?? 0),
        attempts_submitted: stats.attempts_submitted + 1,
      });
    }
    return out;
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

  async insertCompletion(completion: Parameters<AcademyStore['insertCompletion']>[0]) {
    await Promise.resolve();
    if (
      this.completionRows.some(
        (row) => row.user_id === completion.user_id && row.lesson_key === completion.lesson_key,
      )
    )
      return null;
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

  async scenarioChoice(userId: string, lessonKey: string) {
    await Promise.resolve();
    const row = this.scenarioRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    return row ? structuredClone(row) : null;
  }

  async scenarioChoices(userId: string) {
    await Promise.resolve();
    return this.scenarioRows
      .filter((row) => row.user_id === userId)
      .map((row) => structuredClone(row));
  }

  async insertScenarioChoice(input: NewScenarioChoice) {
    await Promise.resolve();
    const index = this.scenarioRows.findIndex(
      (item) => item.user_id === input.user_id && item.lesson_key === input.lesson_key,
    );
    const stored = this.scenarioRows[index];
    if (stored && stored.scenario_hash === input.scenario_hash)
      return { row: structuredClone(stored), created: false };
    const row: ScenarioChoiceRow = { ...input, created_at: new Date() };
    if (stored) this.scenarioRows[index] = row;
    else this.scenarioRows.push(row);
    return { row: structuredClone(row), created: true };
  }

  async practiceNotes(userId: string, lessonKey: string) {
    await Promise.resolve();
    const row = this.notesRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    return row ? structuredClone(row) : null;
  }

  async savePracticeNotes(
    userId: string,
    lessonKey: string,
    lessonId: string,
    patch: NotesPatch,
    expectedRevision?: number,
  ): Promise<SaveNotesResult> {
    await Promise.resolve();
    let stored = this.notesRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    const inserted = !stored;
    if (!stored) {
      const now = new Date();
      stored = {
        user_id: userId,
        lesson_key: lessonKey,
        lesson_id: lessonId,
        texts: {},
        checks: {},
        scores: {},
        revision: 1,
        created_at: now,
        updated_at: now,
      };
      this.notesRows.push(stored);
    }
    if (expectedRevision !== undefined) {
      const conflict =
        expectedRevision === 0 ? !inserted : inserted || stored.revision !== expectedRevision;
      if (conflict)
        return { status: 'conflict', current: inserted ? null : structuredClone(stored) };
    }
    if (!inserted && notesPatchIsNoop(stored, patch))
      return { status: 'saved', row: structuredClone(stored) };
    const merged = {
      texts: { ...stored.texts, ...patch.texts },
      checks: { ...stored.checks, ...patch.checks },
      scores: { ...stored.scores, ...patch.scores },
    };
    if (notesBytes(merged) > NOTES_SIZE_LIMIT) return { status: 'too_large' };
    Object.assign(stored, merged, {
      revision: inserted ? 1 : stored.revision + 1,
      updated_at: new Date(),
    });
    return { status: 'saved', row: structuredClone(stored) };
  }

  /** Seeds passed completions (legacy_migration, no attempt) for the given lesson keys. */
  complete(userId: string, lessonKeys: readonly string[]): void {
    for (const lessonKey of lessonKeys)
      if (
        !this.completionRows.some((row) => row.user_id === userId && row.lesson_key === lessonKey)
      )
        this.completionRows.push({
          user_id: userId,
          lesson_key: lessonKey,
          catalog_version: ACADEMY_CATALOG_VERSION,
          lesson_id: 'seed',
          completion_method: 'legacy_migration',
          attempt_id: null,
          request_id: null,
          content_version: null,
          completed_at: new Date(Date.UTC(2026, 0, 1)),
          source: {},
        });
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
  protected override readonly content = (): AcademyContent => this.fixture ?? academyV3Fixture();
  protected override readonly random: RandomInt = (maxExclusive) =>
    this.seeded ? this.seeded(maxExclusive) : Math.floor(Math.random() * maxExclusive);
}

export function setup(
  options: { rewards?: boolean; content?: AcademyContent; random?: RandomInt } = {},
) {
  const memory = new MemoryAcademy();
  const rewards = options.rewards === false ? undefined : new FakeRewards();
  const content = options.content ?? academyV3Fixture();
  return {
    memory,
    rewards,
    content,
    service: new TestAcademyService(memory, rewards, content, options.random),
    grants: new AcademyGrantsService(memory, () => content),
  };
}

export function item(itemId: string, content: AcademyContent = academyV3Fixture()): AcademyItem {
  const found = content.items.get(itemId);
  if (!found) throw new Error(`unknown item ${itemId}`);
  return found;
}

export function answerKey(itemId: string, content: AcademyContent = academyV3Fixture()) {
  return item(itemId, content).bank.questions;
}

export function correctAnswers(itemId: string, content?: AcademyContent) {
  return answerKey(itemId, content).map((question) => ({
    question_id: question.id,
    option_id: question.correct_option_id,
  }));
}

export function wrongOption(itemId: string, index: number, content?: AcademyContent) {
  const question = answerKey(itemId, content)[index]!;
  return question.options.find((option) => option.id !== question.correct_option_id)!.id;
}

/** Every answer right except the first `wrong` (bank order). */
export function answersScoring(itemId: string, wrong: number, content?: AcademyContent) {
  return correctAnswers(itemId, content).map((answer, index) =>
    index < wrong ? { ...answer, option_id: wrongOption(itemId, index, content) } : answer,
  );
}

/** Lesson keys of every required item before `itemId` in the learning sequence. */
export function keysBefore(itemId: string, content: AcademyContent = academyV3Fixture()) {
  const at = content.sequence.findIndex((entry) => entry.id === itemId);
  if (at < 0) throw new Error(`unknown item ${itemId}`);
  return content.sequence
    .slice(0, at)
    .filter((entry) => !entry.optional)
    .map((entry) => entry.lesson_key);
}

/** Seeds the learner's chain so `itemId` is open (and stores its scenario choice when needed). */
export function openItem(
  memory: MemoryAcademy,
  itemId: string,
  userId = USER,
  content: AcademyContent = academyV3Fixture(),
): void {
  memory.complete(userId, keysBefore(itemId, content));
  const target = item(itemId, content);
  if (target.has_scenario)
    memory.scenarioRows.push({
      user_id: userId,
      lesson_key: target.lesson_key,
      lesson_id: target.id,
      choice: 0,
      scenario_hash: 'f'.repeat(64),
      catalog_version: ACADEMY_CATALOG_VERSION,
      created_at: new Date(),
    });
}

export function deepKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((entry) => deepKeys(entry, keys));
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key);
      deepKeys(entry, keys);
    }
  return keys;
}

export async function start(
  service: AcademyService,
  itemId = 'ch01-l01',
  key = 'attempt-key-0001',
  userId = USER,
) {
  return service.createAttempt(userId, {
    lesson_id: itemId,
    catalog_version: ACADEMY_CATALOG_VERSION,
    idempotency_key: key,
  });
}

export async function pass(service: AcademyService, itemId: string, key: string, userId = USER) {
  const attempt = await start(service, itemId, key, userId);
  return service.submit(userId, attempt.attempt_id, { answers: correctAnswers(itemId) });
}

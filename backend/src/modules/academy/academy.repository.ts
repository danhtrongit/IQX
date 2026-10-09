import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { OptionOrders } from './academy.grading.js';

export type AttemptRow = {
  id: string;
  user_id: string;
  lesson_id: string;
  /** NULL for attempts made before the 13ch/71 catalog (they stay in the legacy catalog). */
  lesson_key: string | null;
  catalog_version: string;
  content_version: string;
  /** Pinned per-lesson assessment hash (column kept as `questions_version`). */
  questions_version: string;
  question_ids: string[];
  option_orders: OptionOrders;
  status: 'open' | 'submitted';
  idempotency_key: string;
  created_at: Date;
  submitted_at: Date | null;
  score: number | null;
  passed: boolean | null;
};

export type NewAttempt = Pick<
  AttemptRow,
  | 'id'
  | 'user_id'
  | 'lesson_id'
  | 'lesson_key'
  | 'catalog_version'
  | 'content_version'
  | 'questions_version'
  | 'question_ids'
  | 'option_orders'
  | 'idempotency_key'
>;

export type AnswerRow = {
  attempt_id: string;
  question_id: string;
  option_id: string;
  correct: boolean;
};

/** Server-side draft selections of an open attempt: {question_id: option_id}, never graded. */
export type DraftRow = {
  attempt_id: string;
  selections: Record<string, string>;
  /** Number of saves; 1 for the first. An attempt without a draft row has revision 0. */
  revision: number;
  updated_at: Date;
};

/** Submitted attempts of one lesson key: the best score only ever grows, whatever a retake scores. */
export type AttemptStats = { best_score: number | null; attempts_submitted: number };

export type CompletionMethod = 'quiz' | 'guide' | 'legacy_migration';

export type CompletionRow = {
  user_id: string;
  lesson_key: string;
  catalog_version: string;
  lesson_id: string;
  completion_method: CompletionMethod;
  attempt_id: string | null;
  request_id: string | null;
  content_version: string | null;
  completed_at: Date;
  source: Record<string, unknown>;
};

export type NewCompletion = Pick<
  CompletionRow,
  | 'user_id'
  | 'lesson_key'
  | 'catalog_version'
  | 'lesson_id'
  | 'completion_method'
  | 'attempt_id'
  | 'request_id'
  | 'content_version'
  | 'source'
>;

/** Persistence operations used by the academy service; one instance per client/transaction. */
export interface AcademyStore {
  insertAttempt(attempt: NewAttempt): Promise<AttemptRow | null>;
  attemptByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AttemptRow | null>;
  /** Locks the owner's attempt row for the rest of the transaction (`for update`). */
  lockAttempt(userId: string, attemptId: string): Promise<AttemptRow | null>;
  /** The owner's attempt without taking the row lock (read paths). */
  attemptById(userId: string, attemptId: string): Promise<AttemptRow | null>;
  /** The owner's most recent OPEN attempt of the lesson key under the given catalog, if any. */
  latestOpenAttempt(
    userId: string,
    lessonKey: string,
    catalogVersion: string,
  ): Promise<AttemptRow | null>;
  /** The owner's submitted attempts of the lesson key, newest first. */
  submittedAttempts(
    userId: string,
    lessonKey: string,
    limit: number,
    offset: number,
  ): Promise<AttemptRow[]>;
  markSubmitted(attemptId: string, score: number, passed: boolean): Promise<AttemptRow | null>;
  draft(attemptId: string): Promise<DraftRow | null>;
  /**
   * Merges `selections` into the attempt's draft (creating it) and bumps the revision. Callers
   * hold the attempt lock and have validated the ids against the pinned bank.
   */
  saveDraft(attemptId: string, selections: Record<string, string>): Promise<DraftRow>;
  deleteDraft(attemptId: string): Promise<void>;
  answers(attemptId: string): Promise<AnswerRow[]>;
  insertAnswers(answers: readonly AnswerRow[]): Promise<void>;
  /** Best score and number of submitted attempts of the owner's lesson (current catalog only). */
  attemptStats(userId: string, lessonKey: string): Promise<AttemptStats>;
  /** Serializes the owner's completion writes for the rest of the transaction. */
  lockUser(userId: string): Promise<void>;
  completion(userId: string, lessonKey: string): Promise<CompletionRow | null>;
  completionByRequestId(userId: string, requestId: string): Promise<CompletionRow | null>;
  /** Inserts the completion unless one already exists for (user, lesson key); null if it existed. */
  insertCompletion(completion: NewCompletion): Promise<CompletionRow | null>;
  /** Records the reward outcome next to the evidence of the completion that created it. */
  attachReward(userId: string, lessonKey: string, reward: Record<string, unknown>): Promise<void>;
  completions(userId: string): Promise<CompletionRow[]>;
  /** `lesson:<legacy id>` capabilities of the user's legacy academy_grants (read only). */
  legacyLessonCapabilities(userId: string): Promise<string[]>;
}

export interface AcademyStoreProvider {
  store(): AcademyStore;
  /** `tx` is the transaction client, handed to cross-module hooks that must join the transaction. */
  transaction<T>(operation: (store: AcademyStore, tx: SqlClient) => Promise<T>): Promise<T>;
}

const ATTEMPT_COLUMNS = `id, user_id, lesson_id, lesson_key, catalog_version, content_version,
  questions_version, question_ids, option_orders, status, idempotency_key, created_at, submitted_at,
  score, passed`;
const DRAFT_COLUMNS = 'attempt_id, selections, revision, updated_at';
const COMPLETION_COLUMNS = `user_id, lesson_key, catalog_version, lesson_id, completion_method,
  attempt_id, request_id, content_version, completed_at, source`;

export class AcademySqlStore implements AcademyStore {
  constructor(private readonly client: SqlClient) {}

  async insertAttempt(attempt: NewAttempt): Promise<AttemptRow | null> {
    const rows = await this.client.query<AttemptRow>(
      `insert into academy_attempts
         (id, user_id, lesson_id, lesson_key, catalog_version, content_version, questions_version,
          question_ids, option_orders, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10)
       on conflict (user_id, idempotency_key) do nothing
       returning ${ATTEMPT_COLUMNS}`,
      [
        attempt.id,
        attempt.user_id,
        attempt.lesson_id,
        attempt.lesson_key,
        attempt.catalog_version,
        attempt.content_version,
        attempt.questions_version,
        attempt.question_ids,
        JSON.stringify(attempt.option_orders),
        attempt.idempotency_key,
      ],
    );
    return rows[0] ?? null;
  }

  async attemptByIdempotencyKey(userId: string, idempotencyKey: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async lockAttempt(userId: string, attemptId: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts where id = $1 and user_id = $2 for update`,
      [attemptId, userId],
    );
    return rows[0] ?? null;
  }

  async attemptById(userId: string, attemptId: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts where id = $1 and user_id = $2`,
      [attemptId, userId],
    );
    return rows[0] ?? null;
  }

  async latestOpenAttempt(userId: string, lessonKey: string, catalogVersion: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts
       where user_id = $1 and lesson_key = $2 and catalog_version = $3 and status = 'open'
       order by created_at desc, id desc
       limit 1`,
      [userId, lessonKey, catalogVersion],
    );
    return rows[0] ?? null;
  }

  submittedAttempts(userId: string, lessonKey: string, limit: number, offset: number) {
    return this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts
       where user_id = $1 and lesson_key = $2 and status = 'submitted'
       order by submitted_at desc, id desc
       limit $3 offset $4`,
      [userId, lessonKey, limit, offset],
    );
  }

  async markSubmitted(attemptId: string, score: number, passed: boolean) {
    const rows = await this.client.query<AttemptRow>(
      `update academy_attempts set status = 'submitted', submitted_at = now(), score = $2, passed = $3
       where id = $1 and status = 'open'
       returning ${ATTEMPT_COLUMNS}`,
      [attemptId, score, passed],
    );
    return rows[0] ?? null;
  }

  async draft(attemptId: string) {
    const rows = await this.client.query<DraftRow>(
      `select ${DRAFT_COLUMNS} from academy_attempt_drafts where attempt_id = $1`,
      [attemptId],
    );
    return rows[0] ?? null;
  }

  async saveDraft(attemptId: string, selections: Record<string, string>) {
    const rows = await this.client.query<DraftRow>(
      `insert into academy_attempt_drafts (attempt_id, selections)
       values ($1, $2::jsonb)
       on conflict (attempt_id) do update
         set selections = academy_attempt_drafts.selections || excluded.selections,
             revision = academy_attempt_drafts.revision + 1,
             updated_at = now()
       returning ${DRAFT_COLUMNS}`,
      [attemptId, JSON.stringify(selections)],
    );
    const row = rows[0];
    if (!row) throw new Error('Academy draft upsert returned no row');
    return row;
  }

  async deleteDraft(attemptId: string) {
    await this.client.query('delete from academy_attempt_drafts where attempt_id = $1', [
      attemptId,
    ]);
  }

  answers(attemptId: string) {
    return this.client.query<AnswerRow>(
      'select attempt_id, question_id, option_id, correct from academy_answers where attempt_id = $1',
      [attemptId],
    );
  }

  async insertAnswers(answers: readonly AnswerRow[]) {
    if (!answers.length) return;
    await this.client.query(
      `insert into academy_answers (attempt_id, question_id, option_id, correct)
       select $1::uuid, question_id, option_id, correct
       from unnest($2::text[], $3::text[], $4::boolean[]) as a(question_id, option_id, correct)`,
      [
        answers[0]!.attempt_id,
        answers.map((answer) => answer.question_id),
        answers.map((answer) => answer.option_id),
        answers.map((answer) => answer.correct),
      ],
    );
  }

  async attemptStats(userId: string, lessonKey: string): Promise<AttemptStats> {
    const rows = await this.client.query<{ best_score: number | null; attempts_submitted: number }>(
      `select max(score) as best_score, count(*)::int as attempts_submitted
       from academy_attempts
       where user_id = $1 and lesson_key = $2 and status = 'submitted'`,
      [userId, lessonKey],
    );
    return {
      best_score: rows[0]?.best_score ?? null,
      attempts_submitted: Number(rows[0]?.attempts_submitted ?? 0),
    };
  }

  async lockUser(userId: string) {
    await this.client.query(
      `select pg_advisory_xact_lock(hashtext('academy_completions:' || $1::text))`,
      [userId],
    );
  }

  async completion(userId: string, lessonKey: string) {
    const rows = await this.client.query<CompletionRow>(
      `select ${COMPLETION_COLUMNS} from academy_completions where user_id = $1 and lesson_key = $2`,
      [userId, lessonKey],
    );
    return rows[0] ?? null;
  }

  async completionByRequestId(userId: string, requestId: string) {
    const rows = await this.client.query<CompletionRow>(
      `select ${COMPLETION_COLUMNS} from academy_completions where user_id = $1 and request_id = $2`,
      [userId, requestId],
    );
    return rows[0] ?? null;
  }

  async insertCompletion(completion: NewCompletion) {
    const rows = await this.client.query<CompletionRow>(
      `insert into academy_completions
         (user_id, lesson_key, catalog_version, lesson_id, completion_method, attempt_id, request_id,
          content_version, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (user_id, lesson_key) do nothing
       returning ${COMPLETION_COLUMNS}`,
      [
        completion.user_id,
        completion.lesson_key,
        completion.catalog_version,
        completion.lesson_id,
        completion.completion_method,
        completion.attempt_id,
        completion.request_id,
        completion.content_version,
        JSON.stringify(completion.source),
      ],
    );
    return rows[0] ?? null;
  }

  async attachReward(userId: string, lessonKey: string, reward: Record<string, unknown>) {
    await this.client.query(
      `update academy_completions set source = source || jsonb_build_object('reward', $3::jsonb)
       where user_id = $1 and lesson_key = $2`,
      [userId, lessonKey, JSON.stringify(reward)],
    );
  }

  completions(userId: string) {
    return this.client.query<CompletionRow>(
      `select ${COMPLETION_COLUMNS} from academy_completions
       where user_id = $1 order by completed_at, lesson_key`,
      [userId],
    );
  }

  async legacyLessonCapabilities(userId: string) {
    const rows = await this.client.query<{ capability: string }>(
      `select distinct c.capability
       from academy_grants g cross join lateral unnest(g.capability_ids) as c(capability)
       where g.user_id = $1 and c.capability like 'lesson:%'
       order by c.capability`,
      [userId],
    );
    return rows.map((row) => row.capability);
  }
}

@Injectable()
export class AcademyRepository implements AcademyStoreProvider {
  constructor(private readonly database: DatabaseService) {}

  store(): AcademyStore {
    return new AcademySqlStore(this.database);
  }

  transaction<T>(operation: (store: AcademyStore, tx: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction((client) => operation(new AcademySqlStore(client), client));
  }
}

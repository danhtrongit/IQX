import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { OptionOrders } from './academy.grading.js';

export type AttemptRow = {
  id: string;
  user_id: string;
  lesson_id: string;
  content_version: string;
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

export type GrantRow = {
  user_id: string;
  lesson_id: string;
  capability_ids: string[];
  attempt_id: string;
  granted_at: Date;
  content_version: string;
};

export type NewGrant = Pick<
  GrantRow,
  'user_id' | 'lesson_id' | 'capability_ids' | 'attempt_id' | 'content_version'
>;

export type LessonAttemptStats = {
  lesson_id: string;
  best_score: number | null;
  attempts: number;
};

/** Persistence operations used by the academy service; one instance per client/transaction. */
export interface AcademyStore {
  insertAttempt(attempt: NewAttempt): Promise<AttemptRow | null>;
  attemptByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AttemptRow | null>;
  /** Locks the owner's attempt row for the rest of the transaction (`for update`). */
  lockAttempt(userId: string, attemptId: string): Promise<AttemptRow | null>;
  markSubmitted(attemptId: string, score: number, passed: boolean): Promise<AttemptRow | null>;
  answers(attemptId: string): Promise<AnswerRow[]>;
  insertAnswers(answers: readonly AnswerRow[]): Promise<void>;
  /** Inserts the grant unless one already exists; returns the inserted row or null. */
  insertGrant(grant: NewGrant): Promise<GrantRow | null>;
  grant(userId: string, lessonId: string): Promise<GrantRow | null>;
  grants(userId: string): Promise<GrantRow[]>;
  attemptStats(userId: string): Promise<LessonAttemptStats[]>;
}

export interface AcademyStoreProvider {
  store(): AcademyStore;
  transaction<T>(operation: (store: AcademyStore) => Promise<T>): Promise<T>;
}

const ATTEMPT_COLUMNS = `id, user_id, lesson_id, content_version, questions_version, question_ids,
  option_orders, status, idempotency_key, created_at, submitted_at, score, passed`;
const GRANT_COLUMNS = 'user_id, lesson_id, capability_ids, attempt_id, granted_at, content_version';

export class AcademySqlStore implements AcademyStore {
  constructor(private readonly client: SqlClient) {}

  async insertAttempt(attempt: NewAttempt): Promise<AttemptRow | null> {
    const rows = await this.client.query<AttemptRow>(
      `insert into academy_attempts
         (id, user_id, lesson_id, content_version, questions_version, question_ids, option_orders, idempotency_key)
       values ($1, $2, $3, $4, $5, $6::text[], $7::jsonb, $8)
       on conflict (user_id, idempotency_key) do nothing
       returning ${ATTEMPT_COLUMNS}`,
      [
        attempt.id,
        attempt.user_id,
        attempt.lesson_id,
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

  async markSubmitted(attemptId: string, score: number, passed: boolean) {
    const rows = await this.client.query<AttemptRow>(
      `update academy_attempts set status = 'submitted', submitted_at = now(), score = $2, passed = $3
       where id = $1 and status = 'open'
       returning ${ATTEMPT_COLUMNS}`,
      [attemptId, score, passed],
    );
    return rows[0] ?? null;
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

  async insertGrant(grant: NewGrant) {
    const rows = await this.client.query<GrantRow>(
      `insert into academy_grants (user_id, lesson_id, capability_ids, attempt_id, content_version)
       values ($1, $2, $3::text[], $4, $5)
       on conflict (user_id, lesson_id) do nothing
       returning ${GRANT_COLUMNS}`,
      [
        grant.user_id,
        grant.lesson_id,
        grant.capability_ids,
        grant.attempt_id,
        grant.content_version,
      ],
    );
    return rows[0] ?? null;
  }

  async grant(userId: string, lessonId: string) {
    const rows = await this.client.query<GrantRow>(
      `select ${GRANT_COLUMNS} from academy_grants where user_id = $1 and lesson_id = $2`,
      [userId, lessonId],
    );
    return rows[0] ?? null;
  }

  grants(userId: string) {
    return this.client.query<GrantRow>(
      `select ${GRANT_COLUMNS} from academy_grants where user_id = $1 order by granted_at, lesson_id`,
      [userId],
    );
  }

  async attemptStats(userId: string) {
    const rows = await this.client.query<{
      lesson_id: string;
      best_score: number | null;
      attempts: number;
    }>(
      `select lesson_id, max(score)::int as best_score, count(*)::int as attempts
       from academy_attempts where user_id = $1 and status = 'submitted'
       group by lesson_id`,
      [userId],
    );
    return rows.map((row) => ({
      lesson_id: row.lesson_id,
      best_score: row.best_score === null ? null : Number(row.best_score),
      attempts: Number(row.attempts),
    }));
  }
}

@Injectable()
export class AcademyRepository implements AcademyStoreProvider {
  constructor(private readonly database: DatabaseService) {}

  store(): AcademyStore {
    return new AcademySqlStore(this.database);
  }

  transaction<T>(operation: (store: AcademyStore) => Promise<T>): Promise<T> {
    return this.database.transaction((client) => operation(new AcademySqlStore(client)));
  }
}
